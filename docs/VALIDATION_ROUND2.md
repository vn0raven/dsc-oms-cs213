# DSC OMS — Final validation ledger, remediation round 2

**Date:** 2026-10-22; **runtime:** Linux, Node 22, local Chromium/Playwright component fixture, synthetic in-memory SQLite only. Original archive, private files, Cloudflare environments and real user data were never modified.

| Validation | Outcome | Evidence / qualification |
|---|---|---|
| TypeScript types | PASS | `tsc --noEmit` exits 0 |
| Node API/auth/invariant regressions | PASS | `npm run test:offline`: 41/41 passed (was 36) |
| SQLite schema/migration invariant tests | PASS | `npm run test:db`: 12/12 passed, fake data |
| Project bulk results | PASS | Full aggregate parity with legacy loader, 12-case route fixture |
| Task list permission parity | PASS | Lead, Executive and Member permission flags tested; previously reviewed Co-Lead check preserved |
| Browser component at 375/768/1440 | PASS within limited scope | Genuine OMS templates/CSS rendered into Chromium via `page.set_content`; synthetic malicious fields do not create executable markup; no horizontal document overflow; dialog focus/Escape works |
| Full authenticated browser E2E | BLOCKED | Browser navigation returns `ERR_BLOCKED_BY_ADMINISTRATOR`; no full SPA network journey exercised |
| Native Cloudflare Vitest/Workers | BLOCKED | Bundled Windows workerd optional dependency does not run on this Linux host; clean-platform install required |
| Named environment deployment gate | EXPECTED FAIL | Missing `env.staging` and `env.production`; `npm run check:deploy-config` and implicit `npm run deploy` exit nonzero; no deployment |
| Signed live Access/JWKS, origin/cookies | NOT RUN | Requires owner-provided staging Access application |
| Migration 0004 rehearsal on approved staging copy | NOT RUN | No approved D1 staging copy available |
| Live D1 latency/load and browser assistive-tech audit | NOT RUN | Real staging environment and accessibility tooling required |

## Measured local performance

40 synthetic projects: 162 → 5 SQL statements. 120 synthetic task DTOs: 242 → 3 SQL statements. Both route workloads returned identical ID/stat/permission signatures compared with the baseline. See `PERFORMANCE_ROUND2.md` for one-run latency and limitations.

## Production readiness / go-no-go

**NO-GO.** Remaining P1 operational blockers: independent staged/prod D1 binding IDs, Access policies and real JWT tests, staging backup/restore and migration `0004` rehearsal, product decision on cross-department task visibility where data may be sensitive. Critical browser E2E and accessible-dialog coverage remain incomplete. `Approved` vs `Completed` is unchanged pending a product decision. Re-run native Worker tests and full-browser journeys in a supported staging setup and attach proof before release approval.

No migration or deployment was executed against real services. The source ZIP is a remediation candidate, not proof of production readiness.
