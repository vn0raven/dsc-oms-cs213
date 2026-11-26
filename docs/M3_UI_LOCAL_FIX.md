# DSC OMS — M3 Local UI + Demo Fixture Fix

**Scope:** Local M3 follow-up. No live deployment, production migrations, or permanent role changes.

## Confirmed root causes

1. **Dark dashboard onboarding:** `public/styles/app.css`, `/* Dashboard Onboarding */` block, hard-coded light `#fafbfc` button backgrounds, light-mode hover/labels and heading text; theme tokens were ignored in dark mode. Replaced those declarations with semantic surface/text/border tokens.
2. **Event brief modal:** `public/styles/app.css` global modal rules forced every `.project-form-modal` to `width/max-width:100% !important` and bottom alignment irrespective of viewport. That defeated `public/styles/events.css` desktop width. The responsive bottom-sheet rules are now scoped to <=700px; the actual Events modal is independently bounded with scrollable fields and a fixed header/actions footer. A nested `.event-fields-grid` wrapper required its own grid declaration to make the two-column layout work.
3. **Event refresh scope:** `public/js/events.js` previously rebuilt the Events subtree and discarded its search value. `Refresh Events` now invokes only Events data requests, maintains selection/tab and search text, and leaves the application shell/other modules alone. No global reload is performed.
4. **Sidebar sequence:** `public/js/app.js` now places Announcements and Events before Projects/Tasks to group official updates, organized activities and work before Requests/administration.
5. **Empty local database:** the release ZIP intentionally excludes user data. `scripts/m3_local_demo_seed.sql` adds synthetic local-only fixtures for UI testing; it contains no private member data and does not run automatically.

## Local usage (Windows PowerShell)

After copying the updated code into the same local DSC OMS directory, **stop Wrangler** (`Ctrl+C`). Keep `.dev.vars` and `.wrangler` in place. Run:

```powershell
# From the project root containing package.json
npx wrangler d1 migrations apply DB --local
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Seed-DSCOMS-M3-Local.ps1 -SkipMigrations
npm run dev
```

The PowerShell seed refuses to run unless `.dev.vars` has `APP_ENV=local` and always uses `--local`. It inserts (without updating or deleting existing records) six synthetic users, three projects, four events, five tasks and two announcements using known IDs. A second run does not duplicate records. If previous demo records exist, their contents are preserved even if they differ from these fixtures.

For test identity in `.dev.vars`, use `DEV_USER_EMAIL=demo.lead@example.test` (or another registered synthetic demo role). Restart Wrangler after editing `.dev.vars`.

**Do not use `--remote`, `wrangler deploy`, or production secrets for demo seeding.** Run against local or disposable staging data only; the setup script is intentionally local-only.

## Checks completed here

- 73/73 Node offline tests; 12/12 SQLite invariants; 5/5 M3 SQLite checks; 1/1 migration upgrade; 1/1 idempotent fixture-seed test.
- TypeScript compilation clean; JS syntax clean; CSS parsed successfully.
- 20/20 existing M3 source-rendered component scenarios (light/dark, viewport matrix).
- 10/10 new Chromium component scenarios at 375/768/1024/1440/1920 pixels in light/dark checking the Events-only refresh, modal two-column desktop + one-column mobile, footer visibility, horizontal overflow, and dark onboarding surfaces.
- **Not executed:** fully authenticated Wrangler/browser E2E on Windows, native Cloudflare Worker Vitest, 200% browser zoom and comprehensive accessibility audit, real D1 staging migration, and production deployment.

The source-rendered browser tests use synthetic API results; they are not a substitute for local application acceptance testing.
