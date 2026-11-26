# DSC OMS — Measured performance remediation (2026-10-22)

## Method and limitations

An exact same Node 22, `node:sqlite` in-memory fixture ran once against (a) the previously reviewed source and (b) the updated implementation. The fixture created 40 projects, each with one manager, one department, and three tasks (120 tasks total). Each run called the real Hono routes using synthetic identities. Query counts include auth and task/project list queries. The old/new scripts used the same SQL migrations and fixture generator; permission signature parity was compared across all returned DTOs.

| API workload | Baseline SQL statements | Updated SQL statements | Reduction | Baseline local latency (ms) | Updated local latency (ms) | Record parity |
|---|---:|---:|---:|---:|---:|---|
| Projects (40 records) | 162 | 5 | 96.9% | 32.213 | 23.203 | Identical |
| Tasks (120 records) | 242 | 3 | 98.8% | 5.896 | 3.493 | Identical |

These timings are **one-run local measurements**, not p50/p95 distributions, D1 network timings, or production SLO validation. SQL statement counts and exact DTO signature parity are deterministic in this fixture, making them the stronger comparison. No pagination or task visibility policy was changed. Larger organization datasets and Cloudflare D1 remote latency require staging load testing.

### Code and reproduce

- `src/repositories/projects.repository.ts`: bulk department/team/task-stat queries in chunks of 100; preserves output order and permission calculations.
- `src/services/project.service.ts`: project list uses the bulk loader, while individual project lookups remain unchanged.
- `src/repositories/tasks.repository.ts`, `src/services/task.service.ts`: one indexed project-manager membership fetch for list DTO permissions; individual mutation authorization still uses original queries.
- `test/node/oms.db-integration.test.mjs`: verifies aggregate parity, 12 synthetic projects, SQL statement bounds, and permissions for Lead/Executive/Member.
- `test/performance_benchmark.mjs`: run after `node test/offline-build.mjs` in both archived and updated source roots using `node test/performance_benchmark.mjs`.
