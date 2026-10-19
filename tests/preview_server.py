"""Local UI fixture server; never writes to a real calendar."""
import sys
from datetime import datetime, timedelta
from pathlib import Path
from wsgiref.simple_server import make_server

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import application


def fixture(query):
    today = datetime.now(application.MOSCOW).date()
    day = (today + timedelta(days=1)).isoformat()
    common = dict(date=day, start="10:10", end="11:40", title="Иностранный язык", type="Семинар",
                  room="308", building="Малый Златоустинский переулок, 7", source="fa")
    return {"lessons": [{**common, "id": "fa-demo-1", "teacher": "Фирсова И.В."},
                        {**common, "id": "fa-demo-2", "teacher": "Иванова А.А."}],
            "errors": [], "updatedAt": datetime.now(application.MOSCOW).isoformat()}


if __name__ == '__main__':
    application._raw_schedule = fixture
    with make_server('127.0.0.1', 8766, application.application) as server:
        server.serve_forever()
