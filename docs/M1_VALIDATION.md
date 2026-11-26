# M1 final validation and performance report

**Date:** 2026-10-23. **Environment:** Linux offline container, Node 22, Python, installed Chromium, test-only mocked API for browser components, D1 in-memory harness for backend tests. No production or live Cloudflare staging access.

## Passed

- TypeScript `tsc --noEmit`.
- Node offline regression suite: **50 / 50** pass (41 existing + 9 M1-specific tests). Includes route-level permission and lifecycle tests, cross-department restrictions and stale workflow protection.
- SQLite D1 schema/migration invariant tests: **12 / 12** pass on synthetic in-memory data. No new migration introduced.
- JavaScript syntax for public modules and CSS parsed with `tinycss2`: pass.
- Chromium source-component integration: **43 / 43** scenarios pass: 4 roles × 5 widths (375, 768, 1024, 1440, 1920) × 2 themes = 40, plus 3 interaction scenarios (sorting/filtering/keyboard/inline edit, Member refusal, 220-task paging). Uses actual frontend JavaScript and CSS with synthetic mock API, **not a live authenticated Worker**.
- Before/after Board and Sheet screenshots in dark and light at 1440px. After screenshots also cover all required widths and themes.
- No document-level horizontal overflow detected in the 40 component scenarios; Sheet scroll is intentionally horizontal within its own container.

## Native/production blocked or untested

- `vitest run` **could not initialize** due unavailable compatible `@rolldown` native/WASI bindings; no Worker-native tests were executed.
- No Cloudflare Access policy validation, staging D1 migration rehearsal, deployed performance metrics or authenticated end-to-end tests.
- Modal focus-trap testing, keyboard/200% zoom, screen-reader walkthrough and full WCAG 2.2 AA audit are not complete.
- Real dragged-column-resize and actual users' mobile browser interactions require Windows acceptance testing.

## Controlled performance comparison

The fixture contains **1,000 synthetic task records**, Node 22, 15 timed iterations after 3 warmups. Representative median HTML string-generation timings (not browser render or API latency):

| Operation | Measured median |
|---|---:|
| Baseline Sheet (all 1,000 rows) | 139.88 ms |
| M1 Sheet (all 1,000 rows, direct isolated call) | 145.77 ms |
| M1 Sheet (first displayed page of 100 rows) | 10.89 ms |
| M1 shared filter/sort 1,000 records | 5.17 ms |

The full M1 row renderer is **not inherently faster** than baseline (and generates more HTML). The improvement comes from rendering at most 100 rows per page, reducing initial generated markup from approximately 853 KB (baseline 1,000) to approximately 124 KB (M1 first 100). This is a benchmark of HTML creation only and does not establish deployed latency improvement. Both task lists issue **one `/api/tasks` list request** in this scenario; no database query reduction is claimed. Browser script fixture of 220 items confirmed page counts 100/100/20.

## Security assessment

No new backend routes, role permissions or D1 migrations. Existing Cloudflare Access and API authorization remain unchanged. Cell edits are checked against per-task privileges and sent only to existing PATCH field validation. Frontend checks are supplementary, not authoritative. HTML escaping, status validation, and CSV formula neutralization remain in place. Event roles and Announcements not included.

## Release disposition

**LOCAL-ACCEPTANCE CANDIDATE ONLY.** M1 frontend implementation completed and validated within offline scope, but not production-ready until full app tests on Windows (synthetic D1), native Worker tests, staging and Access checks, accessibility review, and the outstanding Approved-versus-Completed policy decision are addressed.
