# Event creation API and authorization

Approved in this chat on November 19, 2026: creation begins at Team Formation and ends after Post-Event; new tasks are owned by the creator's permanent department. Creation is unassigned. Assignment, editing, formal review, Project management, announcements and financial authority remain governed by existing M1–M3 rules.

## Capabilities

Event DTO permissions now include `canCreateEventTask`, `canCreateTeamTask`, and `creatableTeamIds`.

| Actor | Event-level creation | Team creation |
| --- | --- | --- |
| Active Lead / Co-Lead | Eligible Event, existing organizational authority | Any activated team in that Event |
| Accepted Event Director | Exact appointed Event | Activated teams in that Event |
| Accepted Team Head | No | Exact accepted team(s) in that Event |
| Event Co-Director / Team Co-Head / Team Member | No new grant | No new grant |
| Executive / Member | No appointment-independent grant in this endpoint | Accepted Director/Head grant only |
| Proposed / Declined / Ended / inactive appointment or account | None | None |

Existing general task creation stays available under its permanent-role/Project-manager rules. All creation requires an active permanent department. Rows in `event_teams` represent activated teams; no invented team status field is used.

## Routes

- `POST /api/events/:id/tasks` continues to **link an existing task**, with its original M1 edit plus Event linking checks.
- `DELETE /api/events/:id/tasks/:taskId` continues to unlink without deleting the underlying task.
- **New:** `POST /api/events/:id/tasks/create` accepts `{requestId, teamId?, title, description?, instructions?, priority?, startDate?, deadline?}`.

`requestId` is a stable random 16–100 character alphanumeric/underscore/hyphen key; UUIDs are supported. A Team Head must supply an accepted team ID. A Director/Lead/Co-Lead may omit it. Never send assigneeUserId, projectId, departmentId, status, progress or other privilege-bearing fields: unsupported fields are rejected.

Response: `{task, replayed}`. The task is the normal M1 DTO plus nullable eventId/eventName/eventTeamId/eventTeamName. First creation returns 201; identical authorized replay returns 200; changed fields under the same key return 409. Reuse the key after an ambiguous network failure. A new key means a new requested task.

Stage allowlist: Team Formation, Planning, Preparation, Ready for Event, Ongoing, Post-Event. Approved, For Closure, terminal and preapproval stages are denied. Team scope, account status, current permanent department, stage and accepted appointment are rechecked by migration 0008's transaction-time trigger.

The shared M1 field validator and existing repository write create the task and TASK_CREATED audit. The same D1 batch writes the guarded retry receipt, Event link, and EVENT_TASK_CREATED audit. Any failed dependency rolls everything back. No assignment notification is appropriate for an unassigned task; no additional notification type was invented.

Receipts are retained with history and prevent task deletion through their foreign keys. After unlinking, a replay still refers to the originally created task; replay does not silently relink it. Assignment/definition changes after creation use existing M1 permissions, even when the appointment later ends. Temporary creators do not gain edit rights merely from `created_by`.

## CSV import API

`POST /api/tasks/import/preview` and `/api/tasks/import/apply` accept `{requestId, rows:[{rowId, task:{title,departmentId,description?,instructions?,priority?,startDate?,deadline?}}]}`. Maximum 100 rows. Lead/Co-Lead/Executive only; Executive scope is own department. Each row is an unassigned independent task. Preview validates all rows without writes; apply repeats validation, skips duplicates and commits each row atomically with a receipt and existing task audit.

Responses include `mode`, `complete`, and per-row `results` (`ready`, `created`, `duplicate`, `failed`). A runtime row failure stops the batch; earlier successes remain. Retry the exact batch/row keys. A changed payload for an existing receipt is 409. This is not an all-or-nothing file transaction.

## Policy intentionally unchanged

Active M1 task visibility remains organization-wide. This is not Event confidentiality. No cross-department assignment exception, temporary edit/review grant, SOP approval threshold, or financial authority is introduced.
