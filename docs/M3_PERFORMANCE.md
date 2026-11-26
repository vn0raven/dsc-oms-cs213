# M3 Performance — Reproducible Local Measurements

Synthetic fixture: 80 approved/active events, 160 published organization announcements, 20 iterations per route. `test/m3_performance.mjs` uses the real Hono app and SQLite in memory, with explicit request-level database preparation counts.

| Route | Prepared SQL statements/request | Local median response time | Baseline |
|---|---:|---:|---|
| `GET /api/m3/summary` | 8 | 0.604 ms | New in M3; no identical pre-M3 route exists |
| `GET /api/m3/announcements` | 2 | 1.414 ms | New in M3; no identical pre-M3 route exists |

Measurements are environment-specific and are **not Cloudflare D1/Worker latency predictions**. The M3 summary performs bounded aggregates plus a five-event preview; its `upcomingEventCount` is a distinct full count, not the number of preview rows. The announcements API has a hard cap of 200 rows (server pagination remains future work).

An additional optimization replaced one notification INSERT per eligible announcement recipient with a single `INSERT INTO ... SELECT` prepared D1 statement executed in the same batch as announcement publication and the audit event. This reduces DB statement preparations from O(number of recipients) to O(1). No reliable before/after latency benchmark for this change was run, so no latency improvement is claimed.

Scale checks still needed: 1,000+ users / announcements, D1 real network latency, batch-limits, large operational datasets, and query-plan inspection on staging.
