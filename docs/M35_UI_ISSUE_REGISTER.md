# M3.5 UI Issue Register

| ID | Priority | Module | Evidence / reproducibility | Fix | Validation | Status |
|---|---|---|---|---|---|---|
| UI35-01 | P1 | Events | `events.js` previously autoselected first event and rendered the list and detail simultaneously | Full-page workspace with distinct browse state | Chromium Events browse/workspace at 10 theme-width configurations | Fixed, component-validated |
| UI35-02 | P1 | Announcements | `announcements.js` embedded draft form in list | Dedicated notice list, reading page, editor modal | Browser reading, editor, injection text checks | Fixed, component-validated |
| UI35-03 | P1 | Tasks | `tasks.js` inline inspector and Sheet click rebuilding rows | Shared task detail modal and non-destructive single-click Sheet selection | Browser Board inspector, Sheet select/double click/Enter | Fixed, component-validated |
| UI35-04 | P2 | Projects | Permanent detail panel/auto-selection in `projects.js` | Modal inspection, no forced first selection | Browser synthetic project dialog | Fixed, component-validated |
| UI35-05 | P2 | Departments | Permanent detail panel/auto-selection in `departments.js` | Modal inspection, no forced first selection | Browser synthetic department dialog | Fixed, component-validated |
| UI35-06 | P1 | Modal | `ui.js` and `events.js` competing overlay keyboard lifetimes | Shared modal manager, scroll, Escape and focus | Chromium modal interactive checks | Fixed for modern modals |
| UI35-07 | P2 | Modal legacy | Multiple task/project/user form modules still own old markup | Compatibility bridge for focus and scroll | Syntax/static code review; no full legacy form matrix | Partial; follow-up required |
| UI35-08 | P2 | Navigation | `app.js` had only flat `navigate(page)` | Hash routes for Events and Announcements plus popstate | Chromium Back/Forward checks | Fixed, component-validated |
| UI35-09 | P2 | Navigation | Events delegated click listener persisted across view changes | Module ownership guard on reused page node | Cross-module browser sweep, no exceptions | Fixed, component-validated |
| UI35-10 | P2 | Requests | `app.js`, Dashboard and Reports still exposed Requests as primary product navigation | Hide Request UI without deleting routes/data | Browser nav check; 73 Node regression tests | Fixed, data preservation unmodified |
| UI35-11 | P2 | Events | Verifying requirement/reviewing document happened without focused confirmation | Reused confirm modal for verification, record review and consent | Source check + existing backend permission regressions | Fixed; dedicated click test pending |
| UI35-12 | P1 | Deployment | Cloudflare-native and authenticated browser E2E require staging | No production deployment or migration | Not executable here | Open release blocker |
| UI35-13 | P2 | Accessibility | Old form wrappers not consistently accessible | Focus bridge and modal role/title fallback | Browser interaction checked, complete WCAG audit outstanding | Partial |
| UI35-14 | P2 | Performance | `events.js` fetched a workspace before event selected; `announcements.js` eagerly fetched linking lists | Lazy detail/editor API requests | Baseline/current synthetic request-count comparison | Fixed, measured |

*Severity measures impact of the change, not evidence of an exploited production vulnerability. Staging/live behavior remains unverified.*
