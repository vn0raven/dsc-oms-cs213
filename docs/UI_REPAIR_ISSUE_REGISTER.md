# DSC OMS UI — Evidence-Backed Issue Register

Scope: revised candidate compared with `DSC_OMS_Hardened_Candidate.zip`. Only synthetic fixtures used; no real user information.

| ID | Priority | Finding | Disposition |
|---|---|---|---|
| UI-001 | P1 | Tiny operational typography across pages | Fixed |
| UI-002 | P1 | Projects search toolbar white in dark mode | Fixed |
| UI-003 | P2 | Project detail panel offset on mobile | Fixed |
| UI-004 | P2 | Sidebar brand selector does not match rendered navigation | Fixed |
| UI-005 | P2 | Sidebar user name invisible in light theme | Fixed |
| UI-006 | P2 | Task advanced filters too compressed | Fixed |
| UI-007 | P1 | Dark status badge foreground/background contrast | Fixed |
| UI-008 | P2 | Search and filter controls lack accessible names | Fixed |
| UI-009 | P2 | Sparse department card grid | Fixed |
| UI-010 | P2 | Missing reduced-motion preference support | Fixed |
| UI-011 | P1 | Full authenticated role-driven E2E validation | Blocked |
| UI-012 | P2 | 200% browser zoom and screen-reader audit | Open |
| UI-013 | P2 | CSS duplicate rule and !important accumulation | Partial |
| UI-014 | P2 | UI interaction and responsive regressions | Validated in component harness |

## Detailed evidence

### UI-001 — Tiny operational typography across pages
- **File(s):** app.css; projects.css; header-runtime.css
- **Disposition:** Fixed
- **Technical evidence:** Before: 18/20px headings, 9/10px page subtitles. After: 24/26px headings, 14px subtitle at 375/1440.
- **Validation:** Chromium viewport metrics; screenshots
- **Remaining risk:** Residual 12px micro-labels remain in noncritical metadata.

### UI-002 — Projects search toolbar white in dark mode
- **File(s):** projects.css:24; header-runtime.css:1315
- **Disposition:** Fixed
- **Technical evidence:** Dark computed background white (255,255,255) -> dark (21,24,28), light background remains white.
- **Validation:** Chromium computed styles; theme toggle
- **Remaining risk:** No live D1 session verification.

### UI-003 — Project detail panel offset on mobile
- **File(s):** projects.css:757-766
- **Disposition:** Fixed
- **Technical evidence:** Sticky top offset survived position reset; mobile list/detail gap fell from about 96px to 12px.
- **Validation:** 375px Chromium bounding rectangles
- **Remaining risk:** Responsive component, not full authenticated E2E.

### UI-004 — Sidebar brand selector does not match rendered navigation
- **File(s):** dsc-brand.css:122; theme-fix.css
- **Disposition:** Fixed
- **Technical evidence:** CSS used [data-nav], while app.js renders data-page and nav-item; selectors now target .nav-item.
- **Validation:** Chromium screenshot and source match
- **Remaining risk:** Remaining CSS duplicate nav styles.

### UI-005 — Sidebar user name invisible in light theme
- **File(s):** dsc-brand.css:111
- **Disposition:** Fixed
- **Technical evidence:** Explicit white name text on branded black sidebar.
- **Validation:** Light-mode screenshot
- **Remaining risk:** Full contrast audit pending.

### UI-006 — Task advanced filters too compressed
- **File(s):** app.css:5091-5240
- **Disposition:** Fixed
- **Technical evidence:** Original 32px controls increased to 40px and spacing improved within existing component rules.
- **Validation:** Chromium screenshot; search/filter interaction
- **Remaining risk:** Horizontal task sheet still scrolls intentionally.

### UI-007 — Dark status badge foreground/background contrast
- **File(s):** header-runtime.css:802-843
- **Disposition:** Fixed
- **Technical evidence:** Dark Assigned and Active pills now use appropriate semantic foreground/background rather than pale-on-pale or dark-on-dark.
- **Validation:** CSS rule inspection; Chromium screenshot
- **Remaining risk:** Automated full-page contrast scan pending.

### UI-008 — Search and filter controls lack accessible names
- **File(s):** projects.js; tasks.js; requests.js; users.js
- **Disposition:** Fixed
- **Technical evidence:** Accessible names added to 4 primary searches, status filters, and task advanced filters.
- **Validation:** DOM audit in 1440px Chromium fixture
- **Remaining risk:** Third-party screen-reader manual testing pending.

### UI-009 — Sparse department card grid
- **File(s):** app.css:1668
- **Disposition:** Fixed
- **Technical evidence:** Replaced fixed five columns with width-aware auto-fill minimum card width.
- **Validation:** 375/768/1440px Chromium screenshot
- **Remaining risk:** Large synthetic roster performance not checked.

### UI-010 — Missing reduced-motion preference support
- **File(s):** tokens.css
- **Disposition:** Fixed
- **Technical evidence:** Added reduce-motion support for animations and transitions.
- **Validation:** CSS parsing; Chromium prefers-reduced-motion fixture
- **Remaining risk:** User testing with assistive settings pending.

### UI-011 — Full authenticated role-driven E2E validation
- **File(s):** Browser/Cloudflare Access staging
- **Disposition:** Blocked
- **Technical evidence:** Navigation requests blocked in this container; source-components with synthetic API fixtures only.
- **Validation:** Chromium returned ERR_BLOCKED_BY_ADMINISTRATOR for loopback navigation
- **Remaining risk:** Release blocker: staging browser tests required.

### UI-012 — 200% browser zoom and screen-reader audit
- **File(s):** Cross-screen accessibility
- **Disposition:** Open
- **Technical evidence:** Standard viewport component checks completed; 200% native browser zoom and screen readers not verified.
- **Validation:** Scope of test harness
- **Remaining risk:** Stage with Playwright/axe and manual NVDA/VoiceOver.

### UI-013 — CSS duplicate rule and !important accumulation
- **File(s):** app.css; theme-fix.css; header-runtime.css
- **Disposition:** Partial
- **Technical evidence:** Removed incorrect broad project :has styling; normalized existing rules without new fix stylesheet.
- **Validation:** Source diff and tinycss2 parse
- **Remaining risk:** More obsolete overrides need careful screen-specific removal.

### UI-014 — UI interaction and responsive regressions
- **File(s):** Dashboard, Projects, Tasks, Requests, Members, Departments
- **Disposition:** Validated in component harness
- **Technical evidence:** 96 source-component combinations; searches/status filtering/visual focus/theme switch passed on synthetic data.
- **Validation:** dist/ui-validation/after_metrics.json; browser_component_smoke.py
- **Remaining risk:** Still needs actual Worker app E2E.
