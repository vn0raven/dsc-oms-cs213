# DSC OMS — Stylesheet Responsibilities

CSS load order is specified in `public/index.html`, and remains:

1. `tokens.css`: semantic tokens, global box model, default font stack, spacing tokens, reduced-motion preference.
2. `app.css`: application shell, modules other than Projects, shared controls and responsive layout; existing multi-generation rules still require gradual cleanup.
3. `projects.css`: project list/detail, create/edit forms, their responsive rules and semantic surfaces. Removed project list forced height and a stale sticky offset.
4. `dsc-brand.css`: brand identity and sidebar/navigation appearance; corrected selectors to match `.nav-item`.
5. `theme-fix.css`: legacy explicit light/dark bridging styles; updated invalid navigation selector targeting, no new classes introduced.
6. `header-runtime.css`: header/notifications and the existing task filters; replaced broad project-search parent `:has` selector with a concrete toolbar rule; corrected dark status colors.

**No new `fix.css` sheet** was added. No module was rewritten. Historical `!important` and duplicate selectors remain as a documented source-debt item. Removing them safely requires page-by-page visual regressions under real browser execution (including report, audit and notification screens not included in the six-screen matrix).
