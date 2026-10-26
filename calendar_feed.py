"""Read-only calendar subscription with durable event identities and source fallback."""
import hashlib
import json
import os
import re
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo

MOSCOW = ZoneInfo("Europe/Moscow")
FIELDS = ("date", "start", "end", "title", "teacher", "room", "building", "type")


def reconcile(previous, lessons, failed, now, start, finish):
    remaining = dict(previous)
    result = {}
    for lesson in lessons:
        if not start <= lesson["date"] <= finish:
            continue
        candidates = [(key, item) for key, item in remaining.items()
                      if item["lesson"]["source"] == lesson["source"]]
        exact = next(((key, item) for key, item in candidates
                      if item["lesson"].get("id") == lesson.get("id")), None)
        if exact is None:
            matches = [(key, item) for key, item in candidates
                       if item["lesson"]["title"] == lesson["title"]
                       and item["lesson"].get("type") == lesson.get("type")
                       and abs((datetime.fromisoformat(item["lesson"]["date"]) -
                                datetime.fromisoformat(lesson["date"])).days) <= 6]
            matches.sort(key=lambda pair: (
                pair[1]["lesson"]["date"] != lesson["date"],
                pair[1]["lesson"].get("teacher") != lesson.get("teacher"),
                pair[1]["lesson"]["start"] != lesson["start"]))
            exact = matches[0] if matches else None
        if exact:
            key, old = exact
            remaining.pop(key)
            changed = old.get("cancelled") or any(old["lesson"].get(f) != lesson.get(f) for f in FIELDS)
            result[key] = {"lesson": lesson, "sequence": old["sequence"] + int(bool(changed)),
                           "modified": now if changed else old["modified"], "cancelled": False}
        else:
            result[uuid.uuid4().hex] = {"lesson": lesson, "sequence": 0, "modified": now, "cancelled": False}
    for key, old in remaining.items():
        lesson = old["lesson"]
        if not start <= lesson["date"] <= finish:
            continue
        if lesson["source"] in failed:
            result[key] = old
        else:
            result[key] = {**old, "cancelled": True,
                           "modified": old["modified"] if old.get("cancelled") else now,
                           "sequence": old["sequence"] + int(not old.get("cancelled"))}
    return result


def escape(value):
    return str(value or "").replace("\\", "\\\\").replace("\r", "").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def utc_time(lesson, field):
    return datetime.fromisoformat(lesson["date"] + "T" + lesson[field]).replace(tzinfo=MOSCOW).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def render_feed(events, alarm, show_military=True):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vanchunik//Schedule//RU",
             "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Финунивер им. Н.Э. Баумана",
             "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    for key, item in sorted(events.items(), key=lambda pair: (pair[1]["lesson"]["date"], pair[1]["lesson"]["start"])):
        x = item["lesson"]
        if not show_military and re.search(r"военн.*(?:подготов|кафедр|учебн)|(?:^|\s)вуц(?:\s|$)", x.get("title", "") + " " + x.get("type", ""), re.I):
            continue
        lines += ["BEGIN:VEVENT", "UID:" + key + "@vanchunik.alwaysdata.net",
                  "DTSTAMP:" + item["modified"], "LAST-MODIFIED:" + item["modified"],
                  "SEQUENCE:" + str(item["sequence"]), "DTSTART:" + utc_time(x, "start"),
                  "DTEND:" + utc_time(x, "end"), "SUMMARY:" + escape(x["title"]),
                  "LOCATION:" + escape(" · ".join(filter(None, [x.get("room"), x.get("building")]))),
                  "DESCRIPTION:" + escape("\n".join(filter(None, [x.get("teacher"), x.get("teacherEmail"), x.get("type")]))),
                  "STATUS:" + ("CANCELLED" if item.get("cancelled") else "CONFIRMED")]
        if alarm and not item.get("cancelled"):
            lines += ["BEGIN:VALARM", "TRIGGER:-PT" + str(alarm) + "M", "ACTION:DISPLAY",
                      "DESCRIPTION:" + escape(x["title"]), "END:VALARM"]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    # RFC 5545: fold at 75 UTF-8 octets, without splitting a character.
    folded = []
    for line in lines:
        part = ""
        for char in line:
            if len((part + char).encode("utf-8")) > 75:
                folded.append(part)
                part = " "
            part += char
        folded.append(part)
    return ("\r\n".join(folded) + "\r\n").encode("utf-8")


def calendar_response(environ, start_response, schedule):
    query = parse_qs(environ.get("QUERY_STRING", ""))
    teacher = (query.get("teacher", ["Фирсова"])[0].strip() or "Фирсова")[:160]
    alarm = query.get("alarm", ["30"])[0]
    alarm = int(alarm) if alarm in ("0", "10", "15", "30", "60") else 30
    now = datetime.now(MOSCOW)
    start = now.date() - timedelta(days=now.weekday() + 7)
    finish = start + timedelta(days=27)
    db_path = Path(os.environ.get("UNIK_FEED_DB", str(Path(__file__).with_name(".calendar-feed.sqlite3"))))
    try:
        with closing(sqlite3.connect(db_path, timeout=45)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS feeds (teacher TEXT PRIMARY KEY, updated REAL, state TEXT)")
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT updated,state FROM feeds WHERE teacher=?", (teacher,)).fetchone()
            events = json.loads(row[1]) if row else {}
            if not row or now.timestamp() - row[0] >= 900:
                data = schedule({"start": [start.isoformat()], "finish": [finish.isoformat()], "teacher": [teacher]})
                failed = {x["source"] for x in data["errors"]}
                if failed and not events:
                    raise RuntimeError("initial calendar sources unavailable")
                events = reconcile(events, data["lessons"], failed, now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ"), start.isoformat(), finish.isoformat())
                db.execute("INSERT OR REPLACE INTO feeds VALUES (?,?,?)", (teacher, now.timestamp(), json.dumps(events, ensure_ascii=False)))
        body = render_feed(events, alarm, query.get("military", ["1"])[0] != "0")
    except Exception:
        start_response("503 Service Unavailable", [("Content-Type", "text/plain; charset=utf-8"), ("Retry-After", "300")])
        return ["Расписание временно недоступно. Сохраните текущую подписку и повторите позже.".encode("utf-8")]
    etag = '"' + hashlib.sha256(body).hexdigest() + '"'
    headers = [("Content-Type", "text/calendar; charset=utf-8"), ("Content-Disposition", "inline; filename=schedule.ics"),
               ("Cache-Control", "public, max-age=300"), ("ETag", etag)]
    if environ.get("HTTP_IF_NONE_MATCH") == etag:
        start_response("304 Not Modified", headers)
        return []
    start_response("200 OK", headers)
    return [] if environ.get("REQUEST_METHOD") == "HEAD" else [body]
