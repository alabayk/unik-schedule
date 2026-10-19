# Calendar subscriptions and local export history

- `GET /calendar.ics?teacher=<lecturer>&alarm=30` serves a rolling four-week feed (previous, current, next, following week). Alarm values: 0, 10, 15, 30, 60.
- The subscription is read-only and does not require an account. It contains public group timetable data. Source refresh is cached for 15 minutes; calendar clients choose their own refresh schedule.
- Event identity, revisions, cancellations and the last good source data live in `.calendar-feed.sqlite3`, outside the static directory. Preserve this file across deploys and backups. `UNIK_FEED_DB` may specify another persistent path.
- The client stores confirmed exports and their snapshots only on the current device. Dismissal acknowledges the current change; a later change shows a new warning. Source failures never count as cancellations.
- An import handoff is not proof of saving: users explicitly confirm whether they added the events. Earlier exports made before this release cannot be reconstructed reliably and are not marked as confirmed automatically.
- A static import cannot be edited or inspected by this website. Users remove stale imported events before reimporting, or migrate once to the subscription.
- The English lecturer defaults to Firsova. Choices come from actual FA data; subscriptions include the selected lecturer in their URL. After changing lecturer, replace the old subscription with the new URL.
- Run `python tests/test_calendar_feed.py`, `node tests/preferences.test.cjs`, and `node tests/preferences-ui.test.cjs`.
