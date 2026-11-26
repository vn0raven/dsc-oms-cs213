# DSC OMS M3.5 — UI architecture and implementation

**Source baseline:** `DSC_OMS_M3_UI_And_Local_Demo_Fixed.zip`. This milestone is a frontend refactor. No D1 migration, backend contract, permanent role, Event CBL lifecycle, or production state was modified.

## Verified root causes and changes

| Issue | Baseline evidence | Correction |
|---|---|---|
| Modals owned by independent modules | `public/js/ui.js` previously built its own confirmation overlay; `events.js` created custom event dialogs and key handlers. | New `modal-manager.js` owns modern modal lifecycle, focus, scroll locking, confirmation, and form rendering. `ui.js` delegates confirmation. Existing form modules are bridged incrementally by `legacy-modal-bridge.js`. |
| Events were list and details in one layout | `public/js/events.js:refresh` auto-selected the first event, requested `/workspace`, and built `event-workspace` with two columns. | Default browse view lists events only. Clicking one opens a dedicated full-page workspace with eight tabs, governed by the existing permission/transition DTO. Back-to-list preserves search. |
| Announcements displayed the draft form by default | `public/js/announcements.js` embedded `#announcement-create` ahead of the notice list and fetched project/event selection data for every publisher page load. | Searchable notice board; full reading view; create/edit in a centered modal. Project/event options load only when opening the editor. |
| Tasks, Projects, Departments expanded inline details | `tasks.js`, `projects.js`, and `departments.js` appended panels after/beside lists and auto-selected records. | Selected records are inspected in dialogs. M1 task Sheet single click selects; double click a non-edit cell or Enter opens details. Existing task inline edit permissions and review actions remain unchanged. |
| Requests was still primary UI | `app.js` nav, `dashboard.js` cards and onboarding, `reports.js` request statistics. | Removes main UI entry points and request-specific display panels. **Data and backend routes remain intact.** Old notification references display a legacy-message fallback. |
| Browser history unsupported for event reading routes | `app.js` simply rerendered a page, with no nested route model. | Same vanilla JS SPA now supports `#/events/:id/:tab`, `#/announcements/:id`, browser Back/Forward, and deep links for event/announcement notifications. |
| Feature event listeners could outlive their module view | The same `#page-content` node was reused for all pages. | Module switching clears DOM-owned `onclick` and sets `data-oms-active-module`; delegated Events handlers explicitly ignore non-Events pages. |
| M1 Sheet click rerender interfered with double click | Row selection rebuilt the table on single click; double click could miss the old row. | Highlight only updates the existing row; double-click inspection remains available. |

## One page, three interaction levels

1. **Browse:** dashboard, lists, searches, filters, Sheet/Board.
2. **Read:** full Events workspace or Announcement reading page, compact Task/Project/Department inspector dialog.
3. **Act:** focused create/edit/approval/evidence/verification dialog, with backend still authoritative.

## Modal contract

`public/js/modal-manager.js` exports `openModal`, `presentDetail`, `formModal`, `decisionModal`, `closeActiveModal`, and `hasActiveModal`.

- One active modern modal; contents can be moved from an existing detail host and restored on close.
- Focus moves inside, Tab cycles within, Escape closes when allowed, focus returns to prior trigger, and page scroll position is preserved.
- The background is scroll-locked; modal body scrolls independently; sizes are confirm/form/large/detail and adapt to mobile.
- Dirty forms request confirmation before dismissal; submit is disabled synchronously to prevent duplicate front-end submissions.
- `decisionModal` is used for event appointment consent, evidence verification/review, and publishing/archiving decisions.
- Legacy project/task/user create/edit overlays retain their existing feature-specific handlers. `legacy-modal-bridge.js` improves focus/semantics for previously unlabelled old forms. They have not all been rewritten to use `formModal`; unification of markup is remaining technical debt.

## Events

- Events list: summary, search, Refresh Events and New Event.
- Events workspace: back control and Overview, Organization, Tasks, Readiness, Operations, Records, Approvals, Activity. The tab change updates the hash route.
- Stage transitions and Lead/Co-Lead approvals still call the existing M2 endpoints; M3 readiness/closure guards remain server and database checks.
- Temporary appointment acceptance continues through M2 consent endpoints. No event role becomes a permanent system role.
- Browsing calls fewer APIs by no longer fetching the first `/workspace` record automatically.

## Announcements

- Browse only recipient-authorized records returned by `/api/m3/announcements`.
- Clicking a notice reads the complete body in a separate view, with optional read receipt for eligible Published notices.
- Publisher-only new and edit draft controls; the editor loads linked Event/Project options on demand.
- Existing Hono audience/author checks remain unchanged. Frontend role hints do not replace server access control.
- User data is HTML-escaped in text content, attributes and options. No HTML is interpreted in notice body.

## Tasks, Projects and Departments

- Existing API detail requests, permission DTOs, management buttons and activity display remain owned by their feature modules.
- Detail nodes are moved to the common accessible overlay. Closing returns them to their original hidden host, preserving listener identity and avoiding duplicates.
- Tasks Sheet remembers user settings via existing storage; single click only updates selection, double click/Enter opens details, double click on an authorized editable cell retains M1 inline editing.

## Request retirement policy

This is a **user-facing navigation retirement only**. Request tables, history, Hono routes, request permission logic and legacy notifications are not removed. Request-focused Report panels are hidden, not deleted from the backend. An attempt to navigate to the legacy Requests page redirects to Notifications with an explanatory toast.

## Files changed

- Added `public/js/modal-manager.js`, `public/js/legacy-modal-bridge.js`.
- Updated `public/js/ui.js`, `app.js`, `events.js`, `announcements.js`, `tasks.js`, `projects.js`, `departments.js`, `dashboard.js`, `reports.js`, `public/styles/m3.css`, `public/index.html` (asset versions).
- Added `test/m35_browser.py`, `test/m35_special_cases.py` and M3.5 reports.
- Updated README and CHANGELOG.

## Remaining technical debt

- Some older feature-specific Create/Edit/Lifecycle modal DOM trees still use legacy markup, although they gain scroll locking and focus compatibility. Replacing those wrappers individually needs separate functional regression tests.
- On narrow screens the Events tabstrip scrolls horizontally; keyboard and screen-reader testing still needs on-device confirmation.
- Large task tables are client-side paginated; M3.5 did not implement server pagination.
- The Approved-vs-Completed task-state policy is intentionally unchanged.
- A comprehensive WCAG 2.2 AA assessment and real-Worker E2E are still pending.
