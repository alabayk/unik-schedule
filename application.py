from __future__ import annotations
import json, mimetypes, re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo
RUZ_GROUP_ID="164695"
RUZ_URL="https://ruz.fa.ru/api/schedule/group/{group}?start={start}&finish={finish}&lng=1"
BMSTU_URL="https://lks.bmstu.ru/lks-back/api/v1/schedules/groups/bad48fd5-ed29-11ef-becd-8753117d52b2/public"
MOSCOW=ZoneInfo("Europe/Moscow")
def fetch_text(url):
 req=Request(url,headers={"User-Agent":"UnikSchedule/1.0"})
 with urlopen(req,timeout=12) as response:return response.read().decode("utf-8-sig")
def parse_day(value,fallback):
 try:return date.fromisoformat(value or "")
 except ValueError:return fallback
def ruz_lessons(start,finish):
 rows=json.loads(fetch_text(RUZ_URL.format(group=RUZ_GROUP_ID,start=start.strftime("%Y.%m.%d"),finish=finish.strftime("%Y.%m.%d"))))
 lessons=[]
 for row in rows:
  if row.get("discipline")=="Иностранный язык" and "Фирсова" not in row.get("lecturer",""):continue
  lessons.append({"id":f"fa-{row.get('lessonOid')}","date":row["date"],"start":row["beginLesson"],"end":row["endLesson"],"title":row["discipline"],"type":row.get("kindOfWork",""),"room":row.get("auditorium",""),"building":row.get("building",""),"teacher":row.get("lecturer",""),"teacherEmail":row.get("lecturerEmail") or row.get("email") or row.get("lecturer_email") or "","source":"fa"})
 return lessons
def unfold_ics(text):return re.sub(r"\r?\n[ \t]","",text).replace("\r\n","\n").split("\n")
def parse_ics_datetime(value):
 utc=value.endswith("Z");raw=value[:-1] if utc else value;dt=datetime.strptime(raw,"%Y%m%dT%H%M%S")
 return dt.replace(tzinfo=timezone.utc if utc else MOSCOW).astimezone(MOSCOW)
def bmstu_lessons(start,finish):
 rows=json.loads(fetch_text(BMSTU_URL)).get("data",{}).get("schedule",[])
 if not rows:raise ValueError("empty BMSTU schedule")
 kinds={"lab":"Лабораторная","lecture":"Лекция","seminar":"Семинар"};output=[];day=start
 while day<=finish:
  year=day.year if day.month>=9 else day.year-1;sep1=date(year,9,1);week=(day-(sep1-timedelta(days=sep1.weekday()))).days//7+1
  for row in rows:
   if row.get("day")!=day.weekday()+1:continue
   parity=row.get("week","all")
   if parity=="ch" and week%2==0 or parity=="zn" and week%2==1:continue
   discipline=row.get("discipline") or {};title=(discipline.get("fullName") or discipline.get("shortName") or discipline.get("abbr") or "").strip()
   if title.upper()=="ФИН УНИВЕРСИТЕТ" or title.lower()=="самостоятельная работа":continue
   teachers=[" ".join(filter(None,(x.get("lastName"),x.get("firstName"),x.get("middleName")))) for x in row.get("teachers",[])]
   audiences=row.get("audiences",[]);rooms=", ".join(x.get("name","") for x in audiences if x.get("name"));buildings=", ".join(dict.fromkeys(x.get("building","") for x in audiences if x.get("building")))
   output.append({"id":f"bmstu-{day}-{row.get('day')}-{row.get('time')}-{parity}","date":day.isoformat(),"start":row.get("startTime",""),"end":row.get("endTime",""),"title":title,"type":kinds.get(discipline.get("actType"),discipline.get("actType","").title()),"room":rooms,"building":buildings,"teacher":", ".join(teachers),"teacherEmail":"","source":"bmstu"})
  day+=timedelta(days=1)
 return output
def schedule(query):
 today=datetime.now(MOSCOW).date();start=parse_day(query.get("start",[None])[0],today-timedelta(days=today.weekday()));finish=parse_day(query.get("finish",[None])[0],start+timedelta(days=13));finish=min(finish,start+timedelta(days=31));errors=[];lessons=[]
 for name,loader in (("fa",ruz_lessons),("bmstu",bmstu_lessons)):
  try:lessons.extend(loader(start,finish))
  except Exception as exc:errors.append({"source":name,"message":type(exc).__name__})
 lessons.sort(key=lambda x:(x["date"],x["start"],x["source"]));return {"lessons":lessons,"errors":errors,"updatedAt":datetime.now(MOSCOW).isoformat()}
STATIC=Path(__file__).with_name("static")
def application(environ,start_response):
 path=environ.get("PATH_INFO","/")
 if path=="/api/calendar" and environ.get("REQUEST_METHOD")=="POST":
  length=min(int(environ.get("CONTENT_LENGTH") or 0),250000);params=parse_qs(environ["wsgi.input"].read(length).decode("utf-8"));body=params.get("ics",[""])[0].encode("utf-8");start_response("200 OK",[("Content-Type","text/calendar; charset=utf-8"),("Content-Disposition","inline; filename=vanchunik.ics"),("Cache-Control","no-store"),("X-Content-Type-Options","nosniff")]);return [body]
 if path=="/api/schedule":
  body=json.dumps(schedule(parse_qs(environ.get("QUERY_STRING",""))),ensure_ascii=False).encode();start_response("200 OK",[("Content-Type","application/json; charset=utf-8"),("Cache-Control","no-store")]);return [body]
 relative="index.html" if path=="/" else path.lstrip("/");target=(STATIC/relative).resolve()
 if STATIC.resolve() not in target.parents or not target.is_file():start_response("404 Not Found",[("Content-Type","text/plain; charset=utf-8")]);return ["Не найдено".encode("utf-8")]
 mime=mimetypes.guess_type(target.name)[0] or "application/octet-stream";start_response("200 OK",[("Content-Type",mime),("Cache-Control","public, max-age=300")]);return [target.read_bytes()]
