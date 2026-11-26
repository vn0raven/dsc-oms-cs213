# DSC OMS M1 — Unified Task Management: architecture and changes

**Baseline:** `DSC_OMS_UI_Header_Layout_Fixed.zip` (2026-10-23). **Scope:** no production access, no D1 schema changes, no Events/Announcements implementation, no change to task lifecycle or existing role permissions.

## Architecture

- `src/routes/tasks.routes.ts`, `src/services/task.service.ts`, `src/repositories/tasks.repository.ts` remain the authoritative task API, access-control and DB layers. Existing task DTOs include `projectId`, `projectName`, per-task `permissions`, and lifecycle status. Independent tasks use `projectId = null`.
- `public/js/task-workspace.mjs` (new) handles task context, stable client-side sorting, combined filtering, and safe width-preference parsing. Both Board and Sheet call the same function.
- `public/js/tasks.js` owns filters, selected task ID, current view, 100-row client-side paging, history detail loading, and delegated UI event handling. Mutations still invoke existing task-management or task-lifecycle actions. Rebuilds after mutation retain the selected task and page when possible.
- `public/js/task-sheet.js` owns only spreadsheet presentation (column metadata, accessible table markup, sort headings, column controls and conditional edit affordances). The table uses explicit colgroup widths; fixed row-number and sticky headers; horizontally scrolls inside its own region.
- `public/js/task-export.js` retains CSV formula neutralization and now exposes `buildCsv` for regression tests. Exports use the complete filtered set, not only a visible 100-row page.
- `public/styles/app.css` owns M1 Tasks presentation. Legacy sheet overrides and their broad first-cell sizing rules were removed from `header-runtime.css`. The original global `.task-row` flex declaration was explicitly excluded from `<tr>` task-sheet rows.

## Inline editing and security

Double-click on a Sheet **priority, progress, or deadline** cell to edit. The frontend first fetches the current task and checks its returned permissions. Priority/deadline require management capability; progress follows the existing Ongoing assignee rule, with server validation as final authority. Changes go to the existing `PATCH /api/tasks/:id`, which authorizes field-level mutation and records audit events. Status and assignee **do not** use direct PATCH; users must use existing Start/Submit/Review/Assign actions in the detail panel.

The UI refetches `updatedAt` before submitting, but this client-side comparison is **not an atomic If-Match operation**. Server-side database transition guards still protect against stale mutations. Conflicts show feedback and refresh the task. Full optimistic version preconditions are reserved for later backend design approval.

No additional event-specific permission is granted. HTML escapes record text and attributes; CSV export prefixes formula-like values. Task access remains server-scoped; frontend filtering never expands user visibility.

## Confirmed original problems / corrections

1. A fixed-height, narrow split Sheet displayed only part of a wide table. M1 uses a full-width Sheet with a scrollable grid; Board remains a split list/detail layout.
2. Global `.task-row { display:flex }` inadvertently applied to Sheet `<tr>` elements. Scoped Sheet rows use `display:table-row`.
3. CSS `table-layout:fixed` combined with `width:max-content` enlarged the first row-number column to 1,500px on mobile. Explicit table width now totals the declared colgroup widths.
4. Sheet headers were not sortable and widths were not adjustable. M1 adds header sorting, drag/keyboard resizing, persistence and visible-column preferences.
5. Search/filters/sort were duplicated in `tasks.js` and applied inconsistently. M1 centralizes them in a pure task-list helper and adds independent/project context filtering.
6. Mutation callbacks re-rendered Tasks and lost selection. The selected task ID and page are now carried into re-rendering.
7. Large lists rendered all rows; M1 pages client-side at 100 while retaining the same scoped API results, filtered export and selection semantics.
8. Task history was not shown in the detail view despite an existing authorized activity route. M1 loads up to 30 latest returned activity entries without adding API endpoints.

## Workflow policy preserved

Existing task status fields include Created, Assigned, Ongoing, For Review, Approved, Completed and Archived. The earlier implementation can transition from For Review directly to Completed on an approval path even though Approved is a named status. M1 does not change the behavior. Decision remains pending: whether Approved is a separate persisted step or only an approval action.

## Event integration boundary

The DSC Internal Event CBL permits event-specific appointments and reporting relationships separate from permanent roles. **M1 only defines a frontend context discriminator**: `independent` or `project`, derived from existing `projectId`. A later approved additive D1 migration can add `event_id`, event-team ownership, `reports_to` and event-scoped authorization. Event-specific tasks should reuse core tasks without duplicating assignments or weakening permanent D1 permissions. Event appointment consent, director/team authority, and event SOP approval are **not** implemented in M1.

## Running M1 tests

```powershell
npm ci
npx tsc --noEmit
npm run test:offline
npm run test:db
# Browser *component integration* only: requires Python Playwright + Chromium
python test/m1_browser.py
```

For full authenticated local E2E, run `npm run dev` with loopback-only development identity and synthetic local D1 data. Use Chrome or Edge at 100% zoom to manually test the header, new task, assign, review, refresh, and undo/reassign roles; the component harness is **not** a substitute for that acceptance pass.
