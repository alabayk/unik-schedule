from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder="static", static_url_path="")

RUZ_GROUP_ID = "164695"
RUZ_URL = "https://ruz.fa.ru/api/schedule/group/{group}?start={start}&finish={finish}&lng=1"
BMSTU_ICS = "https://lks.bmstu.ru/lks-back/srv/v2/ics/bad48fd5-ed29-11ef-becd-8753117d52b2"
MOSCOW = ZoneInfo("Europe/Moscow")


def fetch_text(url: str) -> str:
    req = Request(url, headers={"User-Agent": "UnikSchedule/1.0"})
    with urlopen(req, timeout=12) as response:
        return response.read().decode("utf-8-sig")


def parse_day(value: str | None, fallback: date) -> date:
    try:
        return date.fromisoformat(value or "")
    except ValueError:
        return fallback


def ruz_lessons(start: date, finish: date) -> list[dict]:
    url = RUZ_URL.format(
        group=RUZ_GROUP_ID,
        start=start.strftime("%Y.%m.%d"),
        finish=finish.strftime("%Y.%m.%d"),
    )
    rows = json.loads(fetch_text(url))
    lessons = []
    for row in rows:
        # RUZ returns all five parallel language subgroups. This student's
        # English subgroup is taught by I. V. Firsova.
        if row.get("discipline") == "Иностранный язык" and "Фирсова" not in row.get("lecturer", ""):
            continue
        lessons.append({
            "id": f"fa-{row.get('lessonOid')}",
            "date": row["date"],
            "start": row["beginLesson"],
            "end": row["endLesson"],
            "title": row["discipline"],
            "type": row.get("kindOfWork", ""),
            "room": row.get("auditorium", ""),
            "building": row.get("building", ""),
            "teacher": row.get("lecturer", ""),
            "source": "fa",
        })
    return lessons


def unfold_ics(text: str) -> list[str]:
    return re.sub(r"\r?\n[ \t]", "", text).replace("\r\n", "\n").split("\n")


def parse_ics_datetime(value: str) -> datetime:
    utc = value.endswith("Z")
    raw = value[:-1] if utc else value
    dt = datetime.strptime(raw, "%Y%m%dT%H%M%S")
    return dt.replace(tzinfo=timezone.utc if utc else MOSCOW).astimezone(MOSCOW)


def bmstu_lessons(start: date, finish: date) -> list[dict]:
    lines = unfold_ics(fetch_text(BMSTU_ICS))
    events, current = [], None
    for line in lines:
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT" and current is not None:
            events.append(current)
            current = None
        elif current is not None and line.startswith("ATTENDEE;CN="):
            current.setdefault("ATTENDEE", []).append(line.partition('CN="')[2].partition('"')[0])
        elif current is not None and ":" in line:
            key, value = line.split(":", 1)
            key = key.split(";", 1)[0]
            current[key] = value.replace("\\,", ",").replace("\\n", " ")

    output = []
    for event in events:
        title = event.get("SUMMARY", "").strip()
        if title in {"ФИН УНИВЕРСИТЕТ", "Самостоятельная работа"}:
            continue
        first = parse_ics_datetime(event["DTSTART"])
        last = parse_ics_datetime(event["DTEND"])
        rule = event.get("RRULE", "")
        interval_match = re.search(r"INTERVAL=(\d+)", rule)
        interval = int(interval_match.group(1)) if interval_match else 1
        cursor_start, cursor_end = first, last
        while cursor_start.date() < start:
            cursor_start += timedelta(weeks=interval)
            cursor_end += timedelta(weeks=interval)
        while cursor_start.date() <= finish:
            if cursor_start.date() >= start:
                output.append({
                    "id": f"bmstu-{event.get('UID', '')}-{cursor_start.date()}",
                    "date": cursor_start.date().isoformat(),
                    "start": cursor_start.strftime("%H:%M"),
                    "end": cursor_end.strftime("%H:%M"),
                    "title": title,
                    "type": event.get("DESCRIPTION", ""),
                    "room": event.get("LOCATION", "").split(",")[-1].strip(),
                    "building": event.get("LOCATION", ""),
                    "teacher": ", ".join(event.get("ATTENDEE", [])),
                    "source": "bmstu",
                })
            if not rule:
                break
            cursor_start += timedelta(weeks=interval)
            cursor_end += timedelta(weeks=interval)
    return output


@app.get("/api/schedule")
def schedule():
    today = datetime.now(MOSCOW).date()
    start = parse_day(request.args.get("start"), today - timedelta(days=today.weekday()))
    finish = parse_day(request.args.get("finish"), start + timedelta(days=13))
    finish = min(finish, start + timedelta(days=31))
    errors = []
    lessons = []
    for name, loader in (("fa", ruz_lessons), ("bmstu", bmstu_lessons)):
        try:
            lessons.extend(loader(start, finish))
        except Exception as exc:
            errors.append({"source": name, "message": type(exc).__name__})
    lessons.sort(key=lambda item: (item["date"], item["start"], item["source"]))
    return jsonify({"lessons": lessons, "errors": errors, "updatedAt": datetime.now(MOSCOW).isoformat()})


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/<path:path>")
def assets(path: str):
    return send_from_directory(app.static_folder, path)


if __name__ == "__main__":
    app.run(debug=True)
