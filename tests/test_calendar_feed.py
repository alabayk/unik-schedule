import io
import json
import os
import sqlite3
import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import application
from calendar_feed import calendar_response, reconcile, render_feed


def lesson(**changes):
    return dict(id="fa-1", source="fa", date="2026-10-20", start="10:10", end="11:40",
                title="Иностранный язык", teacher="Фирсова И.В.", room="308", building="Москва", type="Семинар", **changes)


class CalendarTests(unittest.TestCase):
    def test_military_preference_filters_feed_without_changing_stored_ids(self):
        military = {**lesson(), "id": "fa-military", "title": "Военная подготовка"}
        state = reconcile({}, [lesson(), military], set(), "20261019T120000Z", "2026-10-12", "2026-11-08")
        self.assertEqual(render_feed(state, 30).count(b"BEGIN:VEVENT"), 2)
        self.assertEqual(render_feed(state, 30, False).count(b"BEGIN:VEVENT"), 1)
        self.assertEqual(len(state), 2)

    def test_move_retains_uid_and_increases_revision(self):
        initial = lesson()
        state = reconcile({}, [initial], set(), "20261019T120000Z", "2026-10-12", "2026-11-08")
        uid = next(iter(state))
        moved = {**initial, "date": "2026-10-21", "start": "11:50", "room": "402"}
        state = reconcile(state, [moved], set(), "20261020T120000Z", "2026-10-12", "2026-11-08")
        self.assertEqual(list(state), [uid])
        self.assertEqual(state[uid]["sequence"], 1)
        same = reconcile(state, [moved], set(), "20261021T120000Z", "2026-10-12", "2026-11-08")
        self.assertEqual(same, state)

    def test_failed_source_is_not_cancelled(self):
        state = reconcile({}, [lesson()], set(), "20261019T120000Z", "2026-10-12", "2026-11-08")
        unchanged = reconcile(state, [], {"fa"}, "20261020T120000Z", "2026-10-12", "2026-11-08")
        self.assertEqual(state, unchanged)
        cancelled = reconcile(state, [], set(), "20261020T120000Z", "2026-10-12", "2026-11-08")
        self.assertTrue(next(iter(cancelled.values()))["cancelled"])
        self.assertIn(b"STATUS:CANCELLED", render_feed(cancelled, 30))

    def test_feed_utf8_time_and_reminders(self):
        state = reconcile({}, [{**lesson(), "title": "Длинное название; " * 30}], set(), "20261019T120000Z", "2026-10-12", "2026-11-08")
        body = render_feed(state, 15)
        self.assertIn(b"DTSTART:20261020T071000Z", body)
        self.assertIn(b"TRIGGER:-PT15M", body)
        self.assertNotIn(b"BEGIN:VALARM", render_feed(state, 0))
        self.assertTrue(all(len(line) <= 75 for line in body.split(b"\r\n")))
        body.decode("utf-8")

    def test_teacher_default_choices_and_html_order(self):
        rows = [lesson(), {**lesson(), "id": "fa-2", "teacher": "Иванова А.А."},
                {**lesson(), "id": "fa-3", "title": "Экономическая теория"}]
        with patch.object(application, "_raw_schedule", side_effect=lambda query: {"lessons": list(rows), "errors": []}):
            default = application.schedule({})
            self.assertEqual(len(default["lessons"]), 2)
            self.assertIn("Иванова А.А.", default["englishTeachers"])
            selected = application.schedule({"teacher": ["Иванова А.А."]})
            self.assertEqual(selected["lessons"][0]["id"], "fa-2")
        response = []
        html = b"".join(application.application({"PATH_INFO": "/"}, lambda status, headers: response.append(status))).decode()
        self.assertLess(html.index('/preferences.js'), html.index('/app.js'))
        self.assertEqual(response, ["200 OK"])

    def test_database_conditional_request_and_failed_initial_fetch(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"UNIK_FEED_DB": str(Path(folder) / 'feed.sqlite3')}):
            received = []
            def headers(status, values):
                received.append((status, dict(values)))
            def failed(query):
                return {"lessons": [], "errors": [{"source": "fa"}]}
            calendar_response({}, headers, failed)
            self.assertEqual(received[-1][0], "503 Service Unavailable")
            def healthy(query):
                x = {**lesson(), "date": query["start"][0]}
                return {"lessons": [x], "errors": []}
            body = b"".join(calendar_response({}, headers, healthy))
            self.assertEqual(received[-1][0], "200 OK")
            self.assertIn(b"BEGIN:VEVENT", body)
            etag = received[-1][1]["ETag"]
            self.assertEqual(calendar_response({"HTTP_IF_NONE_MATCH": etag}, headers, healthy), [])
            self.assertEqual(received[-1][0], "304 Not Modified")


if __name__ == '__main__':
    unittest.main()
