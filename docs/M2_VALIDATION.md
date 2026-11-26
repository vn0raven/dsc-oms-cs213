# M2 Validation & Release Status

**Executed result (2026-10-23):** 64/64 Node tests (including 14 new M2 integration tests), 12/12 legacy SQLite-invariant tests, TypeScript and JS syntax checks passed. 10/10 Chromium **source-component** scenarios (5 viewports × 2 themes) passed; no document overflow/page exceptions in that harness. Full authenticated browser navigation was blocked by administrator policy.

**Validation scope:** Synthetic in-memory SQLite, real compiled Hono services/routes, Node and Chromium source-component tests. No production database or deployment access.

Run: `node test/offline-build.mjs && node --test test/node/*.test.mjs`, `python test/db_invariants.py`, `tsc --noEmit`, `node --check public/js/events.js`, and `python test/m2_component_browser.py` while the preview fixture server is active. The preview server only serves synthetic records.

| Check | Status | Evidence |
| --- | --- | --- |
| Additive 0005 migration | Passed | All migrations replayed from empty SQLite; existing M1 tables preserved |
| M2 API integration | Passed | `test/node/m2.events-integration.test.mjs`: lifecycle, Lead/Co-Lead approval, stale decisions, rejection/revision, appointment consent, role scoping, cross-event teams, cancel/closure, task linking, project redaction |
| Existing Node M1+older suite | Passed | No original tests modified |
| Existing database-invariant suite | Passed | `test/db_invariants.py` |
| TypeScript | Passed | `tsc --noEmit` with ZIP's compatible dependency copies |
| JavaScript syntax | Passed | `node --check` |
| Chromium source-component theme/viewport | Passed | `test/m2_component_browser.py`: 375/768/1024/1440/1920px, dark/light, tabs, no exceptions or document overflow |
| Full authenticated Cloudflare Worker browser E2E | Blocked | Browser navigation in this environment reports `ERR_BLOCKED_BY_ADMINISTRATOR` |
| Native Cloudflare Vitest / workerd runner | Not executed | No verified compatible Worker-native environment |
| Staging D1 migration-copy rehearsal and rollback | Not executed | No approved staging database copy supplied |
| Real Cloudflare Access JWT + staging roles | Not executed | Local identity override only; actual Access issuer/audience untested here |
| Event finance SOP / formal university approvals | Pending organizational adoption | External governance, not implemented by M2 |

**NO-GO for production:** above remaining environment/policy gates must be completed. No production deployment, remote migration, role changes or data deletion were performed.
