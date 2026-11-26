# DSC OMS — UI Validation Ledger, Round 3

**Candidate:** revised hardened source, 2026-10-22. **Scope:** source-level fixes, synthetic UI fixtures, offline Worker-independent tests. **Production:** untouched.

| Check | Result | Evidence / limits |
|---|---|---|
| TypeScript compile | PASS | `tsc --noEmit`, exit 0 |
| Existing Node API regressions | PASS | `npm run test:offline`: **41/41** |
| SQLite migration/invariant checks | PASS | `python test/db_invariants.py`: **12/12** |
| JavaScript syntax | PASS | `node --check` on all JS and MJS files |
| CSS parsing | PASS | `tinycss2` six stylesheets, **zero parse errors** |
| Chromium UI component matrix | PASS | **96** combinations, 0 runtime exceptions, 0 document overflow, no missing headings |
| Roles in UI fixture | PARTIAL | Lead, Co-Lead, Executive and Member injected as synthetic `GET /api/auth/me` responses; not actual Access JWT authentication |
| Mobile/tablet/desktop | PASS within harness | 375, 768, 1024, 1440, 1920 widths (Lead across both themes), with screenshot evidence |
| Theme switching | PASS within harness | Actual `theme.js` changed Projects background to white/dark tokens with transition settle |
| Search/status filters | PASS within harness | Project, Task, Request, Member no-match and match scenarios; real event handlers on synthetic data |
| Keyboard focus | PASS within harness | Visible focus ring and accessible name for task search |
| Modal + injected text smoke | PASS within harness | Existing component test: 375/768/1440, focus/Escape, no markup injection |
| Full Cloudflare Worker-native Vitest | BLOCKED at startup | `node node_modules/vitest/vitest.mjs run` exits 1 with missing native `rolldown` binding from the bundled Windows `node_modules`. No tests were executed in that runner. |
| Full authenticated browser E2E | BLOCKED | Chromium rejects loopback navigation: `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Source functions instead evaluated via `page.set_content` |
| axe-core/Lighthouse + manual screen reader | NOT RUN | Requires accessible app runtime and a human verification pass |
| Native browser zoom 200% | NOT RUN | Tested different CSS viewport widths, which is NOT equivalent to browser zoom |
| Production Access/D1 deployment | NOT RUN | No production or staging network access; no migration or deploy |

## Exact before / after measurements

- **Projects toolbar at dark 1440px:** `rgb(255,255,255)` → `rgb(21,24,28)`. Actual theme-controller test also verifies the light toolbar remains white.
- **Page heading desktop:** **20px → 26px**. **Mobile:** **18px → 24px**.
- **Page subtitle desktop:** **10px → 14px**. **Mobile:** **9px → 14px**.
- **Mobile project list/detail gap:** approximately **96px → 12px** by removing the stale `top` offset.
- **Visual source-component checks:** **96**; no document scroll overflow, code exceptions, or headings smaller than 24px.

## Evidence files

`dist/ui-validation/after_metrics.json` records all computed geometry, fonts and interaction observations. Paired before/after PNGs are in the comparison screenshots archive. Screenshot fixtures are clearly labeled as source-component browser captures, not live Cloudflare screen sessions. The Node tests and database tests remain unchanged and passing.

## Release disposition

**UI remediation candidate: suitable for local user acceptance testing. Production readiness: NO-GO** until authenticated role journeys, actual local/Cloudflare Worker rendering, 200% zoom, real browser accessibility scans, browser console/network behavior and staging policy checks are completed. Do not deploy or run remote migrations as part of this review.
