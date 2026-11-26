# DSC OMS — Source changes implemented, 2026-10-22

This is the second, incremental remediation pass on top of `DSC_OMS_Reviewed_Source.zip`. It does **not** replace the prior audit; refer to `ISSUE_REGISTER.md` for 26 tracked findings. Operations on production data and Cloudflare were out of scope.

| File | Change | Why | Verification |
|---|---|---|---|
| `src/repositories/projects.repository.ts` | Batched project department/team/stat loading in max-100 project groups | Removes sequential N+1 queries | Aggregate equality and 162→5 query benchmark |
| `src/services/project.service.ts` | List endpoint calls bulk loader | Preserve original DTO shape and permissions | 40-project baseline parity |
| `src/repositories/tasks.repository.ts` | Add active manager project ID bulk read | Reduce repeated authorization lookup | 242→3 task list query benchmark |
| `src/services/task.service.ts` | Memoize manager status for response DTOs only; mutation checks untouched | Preserve server permission enforcement | Task DTO permission parity and role tests |
| `public/js/project-create.js` | Escape department/user text and attribute values | Fix confirmed unsafe HTML sink | Node regression and browser synthetic payload |
| `public/js/modal-focus.js`, `public/js/project-create.js` | ARIA dialog, initial focus, Tab trap, Escape and focus return | Keyboard and accessibility support | Browser component 375/768/1440 |
| `public/index.html`, `public/js/app.js` | Stop duplicate runtime theme/notification controls | One accessible source of truth for header | Browser component controls counts |
| `scripts/check_deployment_environments.mjs` and npm script | Explicit fail-closed named-environment check | Prevent mistaking one staging binding for isolated production | Expected nonzero exit until real IDs supplied |
| `test/node/*.test.mjs`, `test/performance_benchmark.mjs`, `test/browser_component_smoke.py` | New regressions and reproducible measurement fixtures | Tests real route/SQL/DOM and shows limits | 41 Node +12 SQLite, Chromium components |

## Data and compatibility

No schema or migration changed in this round, and no existing user records were edited. The previously added `0004_state_invariants.sql` is preserved exactly. `GET /api/projects` and `GET /api/tasks` retain existing JSON shapes and organization/department scopes. Workflow state transitions, role matrix, and archive/restore semantics were not modified. The browser styling remains DSC black/red/white. More aggressive CSS cleanup, task policy, and list pagination were deferred.

## Run

```bash
npm run test:offline
npm run test:db
tsc --noEmit
python test/browser_component_smoke.py
npm run check:deploy-config  # expected FAIL until staging/prod named envs are approved
npm run package:safe
```

The Chromium DOM test does not exercise Cloudflare or app fetches, and needs local Playwright + Chromium installed. A full E2E runner is still needed once navigation is permitted. Execute native Cloudflare tests in a clean compatible CI/staging environment. See deployment playbook and updated validation ledger before release.

**Deployment fail-closed guard:** `scripts/deploy_checked.mjs` replaces ambiguous `npm run deploy` with a two-step named-environment and explicit operator approval gate. Existing `wrangler.jsonc` remains unchanged and currently fails separation checks until real bindings are approved.
