# M2 — Event Governance and Management (2026-10-23)

**Baseline:** `DSC_OMS_M1_Unified_Tasks_Candidate.zip`. **Governance reference:** `DSC_CBL_EVENTS.docx` (nine pages). The supplied copy ends with blank signature lines: the official effective/adopted status has **not** been independently verified. The Standard Event SOP does not yet exist. M2 is a synthetic-data-tested candidate, not a production-authorized policy engine.

## Architecture and source ownership

- `migrations/0005_event_governance.sql`: additive event lifecycle, teams, consent-based appointments, approval history, stage history, task links, closure records, and database triggers. Existing M1 tables and rows remain unchanged.
- `src/types/event.ts`: M2 event DTO/status and limited event action permissions.
- `src/services/event.service.ts`: server-side event visibility, role/appointment checks, invariant validation, atomic D1 batches, audit writes, M1 task/project permission calls, and sensitive linked-project redaction.
- `src/routes/events.routes.ts`: authenticated REST interface. `src/index.ts` mounts at `/api/events`.
- `public/js/events.js`: Events list, local approval actions, team/appointment/linked-task workspace; uses existing API, dialogs and DSC design language.
- `public/styles/events.css`: only Event-specific layout and components. CSS loaded after existing styles. No new frontend framework.
- `public/js/app.js`: new Events sidebar route, preserving the earlier header-control ownership fix.
- `public/js/api.js`: adds `del()` helper for unlinking associations.

## Governance mappings from CBL

- Chapter III, Section 10: the **11 canonical major-event statuses** are represented, plus `Rejected` and `Cancelled` as explicit exceptional states. A rejected brief may be returned to Draft for revision; approval or return decisions are recorded. Neither Draft nor For Approval is organization-visible unless the actor is the creator or Lead/Co-Lead.
- Chapters II and IV, Sections 6–8 and 14–15: appointments are **temporary event-scoped roles** and do not change permanent user roles. Accepted Event Director and Co-Director may manage an event; Directors do not automatically gain organization-wide task, membership, finance, or project powers.
- Chapter V, Sections 16–19: Team Head may propose members/Co-Heads for **their own team** only. Significant OMS tasks retain existing M1 owners and approval logic.
- Chapter VI, Sections 20–28: only required teams are instantiated. Team names are not forced to a fixed set; use CBL team names or properly justified custom names. `UNIQUE(event_id,name)` prevents repeats.
- Chapter VIII, Section 38-A: appointment does not become active without the nominated member's affirmative `accept` API call. Proposed/Declined/Ended grant **zero** event-scoped powers. A declined appointment remains historically traceable.
- Chapter VIII, Sections 39–42: cross-department appointments are allowed, permanent department/role untouched, and appointment status ends on closure/cancellation. Reports-to optional until an SOP defines its mandatory rules.
- Chapters XI–XII, Sections 50–56: moving `Preparation -> Ready for Event` requires a human readiness attestation, remarks and evidence reference. Moving `For Closure -> Completed` requires Lead/Co-Lead attestation, records/financial validation flags, a closure evidence reference, remarks, final attendance and final expense. These are **recorded attestations, not independently verified checklist completion**; SOP details and official financial validation remain pending.
- Chapter X, Sections 47–49: permanent Treasurer/Auditor authority and separation of duties **not delegated** to temporary Event Finance roles. A full finance ledger is deferred.

**User-provided M2 policy:** Lead or Co-Lead can approve, return, reject and officially close an Event within delegated authority. This is a confirmed requested rule, not an inference from the CBL. No further delegation outside these roles is automatically assumed.

## Data and task compatibility

`event_task_links` maps an existing `tasks.id` to `events.id` without adding non-null columns to or duplicating tasks. An existing task remains independent or project-linked as before. Every link operation requires BOTH accepted scoped event management rights (or Lead/Co-Lead) AND the task's existing `permissions.canEdit` from the actual M1 API service. Read access does not imply edit rights. One task may be linked to only one event during M2. Unlinking does not delete the original task. Future M3 may introduce richer event-task reporting via additive migrations.

Events have an **optional project**. Creation verifies that the creator can access the project using the existing `getProject` service; an event's DTO redacts project name/ID when a recipient cannot view that project. Existing project ownership remains unchanged.

## API outline

| Method | Route | Operation |
| --- | --- | --- |
| GET / POST | `/api/events` | List visible events / create a draft proposal |
| GET / PATCH | `/api/events/:id` | Read / edit a draft |
| GET | `/api/events/:id/workspace` | Teams, appointments, approval history, stage history, visible linked tasks and closure |
| GET | `/api/events/my-appointments` | Current user's pending appointment inbox |
| POST | `/:id/submit`, `/:id/approve`, `/:id/return`, `/:id/reject`, `/:id/revise` | Proposal decisions |
| POST | `/:id/advance`, `/:id/close`, `/:id/cancel` | Lifecycle actions |
| POST | `/:id/teams`, `/:id/appointments` | Add functional team / nominate member |
| POST | `/appointments/:appointmentId/accept` or `/decline` | Affirms/declines own nomination |
| POST | `/:id/appointments/:appointmentId/end` | End temporary appointment with remarks |
| POST / DELETE | `/:id/tasks`, `/:id/tasks/:taskId` | Link / unlink an existing M1 task |

All paths above are relative to `/api/events` except the absolute paths already shown. Mutations require active Cloudflare Access identity, server-side checks and origin protections from the preexisting middleware.

## Important M2 limitations and product decisions

1. **Standard Event SOP absent.** Approval routing beyond Lead/Co-Lead, readiness templates, final finance validation, handover requirements and financial conflict screens are not complete. The current attestation fields do not replace official review.
2. **External approvals remain authoritative.** University policies, higher CBL and Executive Board directives override software stage assumptions. The UI does not authorize contracts, public promotion, purchases or spending.
3. **Event appointment alerts** appear in Events → Appointment requests. Full integration into the preexisting general Notification bell/type CHECK schema is **not done** to avoid rewriting existing production notification tables.
4. **Task creation** remains via existing Tasks module; then link it from Events. Event-scoped task creation/assignment, event-stage-driven project changes, and budget/registration belong to later work.
5. **Date-time handling** currently stores entered ISO-local timestamps without a canonical event timezone. For a deployment outside Asia/Manila or multi-timezone attendance, approve and implement an explicit IANA-zone field before relying on the calendar.
6. **Audit:** events and stage history are durable; the `activity_log` stores Event changes. No destructive deletes are offered. All closure records remain attached to their event.
7. **Visibility policy pending:** post-approval events are visible to all active OMS accounts, while proposals are scoped to creator and leadership. Confirm this with DSC before production. This intentionally matches the organization-wide task visibility baseline for active tasks, but does not alter it.
8. Full native Cloudflare Worker/Access browser end-to-end validation and staging-copy migration rehearsal are outstanding release blockers.

## Local Windows validation

In the already-working M1 local project, **back up its code and local D1 state first**. Copy the M2 `src`, `public`, `migrations`, and `test` changes without replacing `.dev.vars` or `.wrangler`. Then run:

```powershell
npm ci
npx tsc --noEmit
npm run test:offline
npm run test:db
npx wrangler d1 migrations apply DB --local
npm run dev
```

Open `http://localhost:8787`, click Events, create a draft brief, submit, switch to Lead/Co-Lead and approve, propose a director appointment, switch to the nominated user's synthetic local identity and accept, then progress through Team Formation. Verify no existing Projects/Tasks data changed. These are **local** migrations only. Never use `--remote` or deploy this candidate without staged review.
