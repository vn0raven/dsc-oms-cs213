# M1 issues and dispositions

| ID | Severity | Evidence / location | Resolution | Evidence / limitation |
|---|---|---|---|---|
| M1-01 | P1 | Sheet `<tr class="task-row">` inherited `display:flex` from `app.css`; cells collapsed | FIXED: scoped `tr.task-row` display in `app.css` | Computed Chromium table-row + screenshot |
| M1-02 | P1 | Sheet `width:max-content` allocated ~1514px to first column at 375px | FIXED: explicit width sum in `task-sheet.js` | 52px index measured and header click passes |
| M1-03 | P2 | Sheet occupied left half of master/detail layout, wide columns clipped | FIXED: `.sheet-mode` full-width, scrollable bounded grid | Browser images 375–1920 |
| M1-04 | P2 | Header not sortable/resizable; column width uncontrollable | FIXED: header sort and persisted drag/keyboard resizing | Browser + Node tests; drag specifically visual/manual acceptance pending |
| M1-05 | P2 | Scattered filter logic in tasks.js, no independent/project context filter | FIXED: pure filtering/sorting helper, context filter | 9 Node regression tests plus browser interactions |
| M1-06 | P2 | Task selection lost following action callbacks | FIXED: carry selected ID/page into renderTasks and minimize list rebuild on detail selection | Browser selections and patch callback; full authenticated action pending |
| M1-07 | P2 | Long lists render all row elements | FIXED: local 100-row paging; count and export include all filtered records | Browser 220 synthetic records = 100/100/20 |
| M1-08 | P2 | Task details omitted accessible activity history | FIXED: use existing `/api/tasks/:id/activity` route | Browser synthetic route; authenticated Worker untested |
| M1-09 | P1 | Assignee/status inline mutations could bypass dedicated lifecycle authorization | PREVENTED: only priority/progress/deadline inline PATCH with permission checks, existing status/assign actions unchanged | Member edit rejects in component; server coverage via existing suite |
| M1-10 | P1 | Concurrent inline update has no client-supplied atomic version token | PARTIAL: read-before-write, stale transition server guards, 409 UI feedback | No new API precondition; backend enhancement remains open |
| M1-11 | P1 | For Review -> Completed despite Approved named status | POLICY BLOCKED: preserve current behavior | Existing backend task lifecycle tests; requires product authority |
| M1-12 | P1 | No native Cloudflare test execution in this runtime | BLOCKED: Linux binary dependencies missing | Vitest startup fails on `@rolldown/binding-wasm32-wasi` |
| M1-13 | P1 | No approved staging deployment / Access / D1 rehearsal | BLOCKED: no live environment access, no production changes | Must be performed and approved outside this package |
| M1-14 | P2 | No authenticated browser E2E / WCAG scan | PARTIAL: Chromium components, keyboard and viewport tests pass; actual worker auth not covered | Requires local Windows or staging full E2E |
| M1-15 | P2 | Existing CSV export could contain user-supplied formulas | VERIFIED EXISTING FIX: `safeSpreadsheetValue` maintained | Formula injection Node regression; no change to permission gate |
