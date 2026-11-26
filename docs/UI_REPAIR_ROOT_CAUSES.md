# DSC OMS — UI Source Audit and Root Causes

## Evidence and scope

Inspected the actual frontend files `public/index.html`, all six loaded CSS files (`tokens.css`, `app.css`, `projects.css`, `dsc-brand.css`, `theme-fix.css`, `header-runtime.css`), the application shell (`app.js`), and the Dashboard, Projects, Tasks, Requests, Members and Departments render functions. The six uploaded screenshots were treated as observations rather than a source of CSS values.

The CSS cascade in `index.html` is **tokens → app → projects → DSC brand → theme-fix → header-runtime**. Earlier sheets often contain multiple generations of rules for the same components, and later overrides take precedence, including `!important` rules. Exact selector-specific conflicts should be refactored cautiously because many UI elements are generated dynamically.

## Confirmed causes and corrections

1. **Late-stage typography shrinkage.** `app.css` contains multiple `.page-heading` and `.nav-item` definitions, and the later ones reduced operational content to 7–11px. Fixed existing font-size declarations within their original stylesheets. The measured page title grew from **20px to 26px at 1440px**, and from **18px to 24px at 375px**. Supporting page text grew from **10px to 14px** (desktop) and **9px to 14px** (mobile). Screenshot zoom metadata is not available; browser comparisons were performed at a fixed 1× device scale and normal CSS pixel sizing.
2. **Hard-coded project colors.** `projects.css` assigned `background: #fff` to `.projects-toolbar` and related surfaces; the later generic `:has(#project-search)` rule in `header-runtime.css` did not target the toolbar itself. Replaced hard-coded surfaces with semantic tokens and the broad parent selector with a component-specific `.projects-toolbar` theme rule. Dark computed background changed from **rgb(255,255,255)** to **rgb(21,24,28)**; light remains white.
3. **Responsive project offset.** Later CSS defined `.project-detail { top:84px; position:sticky }`. Responsive styles changed `position` but retained `top`, shifting the detail panel approximately 84px below its natural mobile position. `top:auto` now restores the intended **12px** stacked gap.
4. **Mismatched sidebar selectors.** Branding targeted `[data-nav]` while JavaScript renders `.nav-item` with `data-page`. These styling rules never matched. Updated them to `.nav-item`, including active-state styling and corresponding theme selector. Navigation now maintains an `aria-current=page` marker, preserving the existing navigation event model.
5. **Inconsistent dark-mode status pills.** Assigned/Ongoing inherited a pale background with light blue foreground, a calculated example contrast of only ~2.07:1. Updated the dark-mode status foreground/background in its existing header stylesheet and used `var(--success)` for green states.
6. **Control density and accessibility.** Task advanced filters had 32px controls with very small text. Existing rules now use 40px minimum heights, tokenized spacing, and accessible filter names. Sidebar user text contrast was corrected for the light theme's permanently dark sidebar.
7. **Fixed department density.** Department cards used five fixed columns even for two departments; the source grid now uses a minimum card width with auto-fill and retains responsive media breakpoints.

## Preserved by design

The application keeps its current CSS/JS architecture, branded dark sidebar, red identity, native form controls, master/detail workflows, permissions, backend API shapes, and all task/request status logic. No new framework, live database changes, or unrelated feature additions were made.

## Deferred technical debt

The layered CSS still contains redundant selectors and historical important rules; removing them wholesale would risk dynamically generated components. A follow-on visual-regression-driven consolidation is preferable to another large override stylesheet. Full authenticated browser E2E, screen-reader usability and native browser zoom at 200% remain unverified. See `UI_REPAIR_VALIDATION.md`.
