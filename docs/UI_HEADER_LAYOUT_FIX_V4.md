# DSC OMS UI header/layout hotfix (Round 4)

## Root causes proven by reading the actual implementation

1. `public/js/ux.js`: `initializeUX` called `setupAccountMenu`, which assigned `container.innerHTML` to `.topbar-right`. This destroyed the already initialized theme selector, notification popover and profile menu created by `app.js`, `header-controls.js` and `notification-popover.js`. **Correction:** remove only that obsolete overwrite path; retain the original header and handlers.
2. `public/styles/header-runtime.css`: both theme blocks applied card background styles to every `#page-content section`, including `section.projects-layout`. This made large layout regions look like solid, empty cards. **Correction:** scope existing background styling to cards/panels, not layout sections.
3. `app.css` and other ownership stylesheets: 9–12px typography was repeatedly reinstated by later declarations. **Correction:** increase the undersized declarations in their owning stylesheets to readable 12–14px; enlarge KPI values and quick-action text, plus project list spacing.
4. Mobile application header: one narrow row caused the title and appearance buttons to collide. **Correction:** two-row header below 600px while retaining all controls.

The `header-runtime.js` source remains present but is not loaded by `index.html`. Do not enable it alongside `header-controls.js` without removing the duplicate controls first. The remaining historical CSS override layering is technical debt; this patch avoids an unrelated wholesale rewrite.

## Files changed
- `public/js/ux.js`: remove destructive secondary account-menu renderer; preserve app-shell controls.
- `public/styles/app.css`: typography/spacing improvements and compact mobile header layout.
- `public/styles/projects.css`: project list row size and list/detail sizing.
- `public/styles/dsc-brand.css`, `public/styles/theme-fix.css`, `public/styles/header-runtime.css`: readable text and removal of generic section background rule.
- `public/index.html`: CSS/JS cache-busting query updated to `ui4`.
- `test/ui_browser_regression.py`: checks initialization of actual `header-controls` and `initializeUX` together.

## Validation (in isolated container, synthetic fixtures)
- TypeScript `tsc --noEmit`: passed.
- `npm run test:offline`: 41/41 passed.
- `npm run test:db`: 12/12 passed.
- `python test/ui_browser_regression.py`: 96 screen/role/theme/viewport cases, 0 reported failures, 0 document width overflows.
- Chromium interactive header check: 3 theme buttons + notification bell + profile toggle retained after UX initialization, switching to Light updated `data-theme`, profile menu opened.
- All JavaScript syntax checks and CSS PostCSS parsing: passed.

**Not run:** full authenticated Worker/browser E2E, native Worker tests and Windows local-browser zoom testing. The test harness uses source renderers + synthetic API responses; check the updated ZIP with the local Wrangler server prior to any deployment. Production database or environment was not contacted or modified.
