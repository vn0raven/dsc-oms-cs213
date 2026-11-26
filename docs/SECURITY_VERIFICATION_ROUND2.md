# DSC OMS — Security verification, Round 2

**Source:** reviewed ZIP and 2026-10-22 changes. No external production Access, JWKS, or D1 was contacted. No real member data/credentials included.

## Pass, offline evidence

- Previous P0/P1 controls retained: JWT `jose.jwtVerify` with issuer/audience, active registered user check, loopback-only development override, last-Lead guard, atomic task/request D1 triggers, CSV formula escaping, URL protocol filtering, no-store and origin rejection. Regressions continue passing in offline route tests.
- New P1 unsafe HTML sink fixed: `project-create.js` previously inserted raw department/user names and IDs into `innerHTML`. Now all API-derived fields in the form are escaped in the correct text or quoted-attribute context. Node regression and real Chromium DOM synthetic payload tests pass on three viewports.
- An explicit deployment guard prevents bare `npm run deploy` and rejects staging until both named bindings are configured; this was tested without invoking Wrangler.
- The redundant runtime theme/notification control injector is no longer loaded. Browser component smoke finds one notification menu and three static theme controls.
- `check:deploy-config` correctly fails until distinct named staging/production binding declarations are approved. This is an **unresolved release condition**, not an attestation of Cloudflare configuration.

## Not verified — do not infer security from silence

- No externally signed/expired/wrong-audience token or remote JWKS rotation exercised against actual deployed Access.
- No complete frontend taint-to-DOM security proof. Many modules still render HTML templates; every user-derived interpolation needs a controlled browser attack test. Other modals not all covered by the new focus helper.
- No systematic live direct-object authorization probe; offline cross-department and role tests exist.
- No operational CSRF assessment under actual Access cookie settings, although explicit cross-origin mutation requests fail offline.
- Staging/prod D1 separation, secret scope, backups, restoration, 0004 migration compatibility and rollback remain unverified.

**Disposition:** No known unmitigated P0 introduced by this round; cannot certify all security controls from offline validation. Do not authorize production deployment.
