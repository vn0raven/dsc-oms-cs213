import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";
import type {
TaskDto,
TaskPriority,
TaskStatus,
} from "../types/task";

export interface TaskRecord {
eventId: string | null;
eventName: string | null;
eventTeamId: string | null;
eventTeamName: string | null;
id: string;
title: string;
description: string | null;

departmentId: string;
departmentName: string;

projectId: string | null;
projectName: string | null;

createdBy: string;

priority: TaskPriority;

startDate: string | null;
deadline: string | null;

status: TaskStatus;
progress: number;

instructions: string | null;
notes: string | null;
evidence: string | null;

submittedAt: string | null;

reviewedBy: string | null;
reviewNotes: string | null;

completedAt: string | null;

createdAt: string;
updatedAt: string;
archivedAt: string | null;

sourceRequestId: string | null;

assignmentId: string | null;
assigneeUserId: string | null;
assigneeName: string | null;
assigneePosition: string | null;
assigneeRole:
| "Lead"
| "Co-Lead"
| "Executive"
| "Member"
| null;
assigneeDepartmentId: string | null;
assigneeDepartmentName: string | null;
assignmentStatus:
| "Active"
| "Completed"
| "Removed"
| null;
}

export interface CreateTaskInput {
id: string;
title: string;
description: string | null;
departmentId: string;
projectId: string | null;
priority: TaskPriority;
startDate: string | null;
deadline: string | null;
instructions: string | null;
assigneeUserId: string | null;
}

const taskSelect = `
SELECT
etl.event_id AS eventId, ev.name AS eventName, etl.team_id AS eventTeamId, et.name AS eventTeamName,
t.id,
t.title,
t.description,

t.department_id AS departmentId,
d.name AS departmentName,

t.project_id AS projectId,
p.name AS projectName,

t.created_by AS createdBy,

t.priority,
t.start_date AS startDate,
t.deadline,

t.status,
t.progress,

t.instructions,
t.notes,
t.evidence_url AS evidence,

t.submitted_at AS submittedAt,

t.reviewed_by AS reviewedBy,
t.review_notes AS reviewNotes,

t.completed_at AS completedAt,

t.created_at AS createdAt,
t.updated_at AS updatedAt,
t.archived_at AS archivedAt,

t.source_request_id AS sourceRequestId,

a.id AS assignmentId,
a.user_id AS assigneeUserId,
au.name AS assigneeName,
au.position AS assigneePosition,
au.role AS assigneeRole,
au.department_id AS assigneeDepartmentId,
ad.name AS assigneeDepartmentName,
a.status AS assignmentStatus

FROM tasks t
LEFT JOIN event_task_links etl ON etl.task_id=t.id
LEFT JOIN events ev ON ev.id=etl.event_id
LEFT JOIN event_teams et ON et.id=etl.team_id

INNER JOIN departments d
ON d.id = t.department_id

LEFT JOIN projects p
ON p.id = t.project_id

LEFT JOIN task_assignments a
ON a.id = (
SELECT a2.id
FROM task_assignments a2
WHERE a2.task_id = t.id
AND a2.status IN (
'Active',
'Completed'
)
ORDER BY
CASE
WHEN a2.status = 'Active'
THEN 0
ELSE 1
END,
a2.assigned_at DESC
LIMIT 1
)

LEFT JOIN users au
ON au.id = a.user_id

LEFT JOIN departments ad
ON ad.id = au.department_id
`;

function activityStatement(
env: Env,
actor: AuthenticatedUser,
action: string,
taskId: string,
oldValue: unknown,
newValue: unknown
): D1PreparedStatement {
return env.DB
.prepare(`
INSERT INTO activity_log (
id,
occurred_at,
actor_user_id,
actor_name,
actor_role,
action,
reference_type,
reference_id,
old_value,
new_value
)
VALUES (?, ?, ?, ?, ?, ?, 'TASK', ?, ?, ?)
`)
.bind(
`act_${crypto.randomUUID()}`,
new Date().toISOString(),
actor.id,
actor.name,
actor.role,
action,
taskId,
oldValue === null
? null
: JSON.stringify(oldValue),
newValue === null
? null
: JSON.stringify(newValue)
);
}

function notificationStatement(
env: Env,
userId: string,
type:
| "Task Assigned"
| "Task Updated"
| "Task For Review"
| "Task Approved"
| "Task Completed",
title: string,
message: string,
taskId: string
): D1PreparedStatement {
return env.DB
.prepare(`
INSERT INTO notifications (
id,
user_id,
type,
title,
message,
reference_type,
reference_id,
status,
created_at
)
VALUES (?, ?, ?, ?, ?, 'TASK', ?, 'Unread', ?)
`)
.bind(
`notif_${crypto.randomUUID()}`,
userId,
type,
title,
message,
taskId,
new Date().toISOString()
);
}

export async function findTaskById(
env: Env,
id: string
): Promise<TaskRecord | null> {
return await env.DB
.prepare(`
${taskSelect}
WHERE t.id = ?
LIMIT 1
`)
.bind(id)
.first<TaskRecord>();
}

export async function listAllTasks(
env: Env
): Promise<TaskRecord[]> {
const result = await env.DB
.prepare(`
${taskSelect}
ORDER BY t.created_at DESC
`)
.all<TaskRecord>();

return result.results;
}

export async function listDepartmentTasks(
env: Env,
departmentId: string
): Promise<TaskRecord[]> {
const result = await env.DB
.prepare(`
${taskSelect}
WHERE t.department_id = ?
ORDER BY t.created_at DESC
`)
.bind(departmentId)
.all<TaskRecord>();

return result.results;
}

export async function listAssignedTasks(
env: Env,
userId: string
): Promise<TaskRecord[]> {
const result = await env.DB
.prepare(`
${taskSelect}
WHERE a.user_id = ?
ORDER BY t.created_at DESC
`)
.bind(userId)
.all<TaskRecord>();

return result.results;
}

export async function listReviewTasksForManager(
env: Env,
userId: string
): Promise<TaskRecord[]> {
const result = await env.DB
.prepare(`
${taskSelect}
WHERE t.status = 'For Review'

AND COALESCE(
a.user_id,
''
) <> ?

AND EXISTS (
SELECT 1
FROM project_members pm
WHERE pm.project_id =
t.project_id
AND pm.user_id = ?
AND pm.project_role =
'Manager'
AND pm.status =
'Active'
)

ORDER BY t.updated_at DESC
`)
.bind(
userId,
userId
)
.all<TaskRecord>();

return result.results;
}

export async function listDepartmentReviewTasks(
env: Env,
departmentId: string,
userId: string
): Promise<TaskRecord[]> {
const result = await env.DB
.prepare(`
${taskSelect}
WHERE t.status = 'For Review'
AND t.department_id = ?
AND COALESCE(
a.user_id,
''
) <> ?
ORDER BY t.updated_at DESC
`)
.bind(
departmentId,
userId
)
.all<TaskRecord>();

return result.results;
}

export async function listOrganizationReviewTasks(
env: Env,
userId: string
): Promise<TaskRecord[]> {
const result = await env.DB
.prepare(`
${taskSelect}
WHERE t.status = 'For Review'
AND COALESCE(
a.user_id,
''
) <> ?
ORDER BY t.updated_at DESC
`)
.bind(userId)
.all<TaskRecord>();

return result.results;
}

export async function isActiveProjectMember(
env: Env,
projectId: string,
userId: string
): Promise<boolean> {
const row = await env.DB
.prepare(`
SELECT 1 AS found
FROM project_members
WHERE project_id = ?
AND user_id = ?
AND status = 'Active'
LIMIT 1
`)
.bind(
projectId,
userId
)
.first<{ found: number }>();

return !!row;
}

/** One indexed lookup for manager permissions used by list DTOs. */
export async function listActiveManagedProjectIds(
env: Env,
userId: string
): Promise<Set<string>> {
const rows = await env.DB.prepare(`
SELECT project_id FROM project_members
WHERE user_id = ? AND project_role = 'Manager' AND status = 'Active'
`).bind(userId).all<{project_id: string}>();
return new Set(rows.results.map((row) => row.project_id));
}

export async function isActiveProjectManager(
env: Env,
projectId: string,
userId: string
): Promise<boolean> {
const row = await env.DB
.prepare(`
SELECT 1 AS found
FROM project_members
WHERE project_id = ?
AND user_id = ?
AND project_role = 'Manager'
AND status = 'Active'
LIMIT 1
`)
.bind(
projectId,
userId
)
.first<{ found: number }>();

return !!row;
}

export async function getTaskReviewerUserIds(
env: Env,
departmentId: string
): Promise<string[]> {
const result = await env.DB
.prepare(`
SELECT id
FROM users
WHERE status = 'Active'
AND (
role IN (
'Lead',
'Co-Lead'
)
OR (
role = 'Executive'
AND department_id = ?
)
)
`)
.bind(departmentId)
.all<{ id: string }>();

return result.results.map(
(row) => row.id
);
}

export async function createTaskTransaction(
env: Env,
input: CreateTaskInput,
actor: AuthenticatedUser,
dependentStatements: D1PreparedStatement[] = []
): Promise<void> {
const now =
new Date().toISOString();

const status: TaskStatus =
input.assigneeUserId
? "Assigned"
: "Created";

const statements:
D1PreparedStatement[] = [
env.DB
.prepare(`
INSERT INTO tasks (
id,
title,
description,
department_id,
project_id,
created_by,
priority,
start_date,
deadline,
status,
progress,
instructions,
created_at,
updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
`)
.bind(
input.id,
input.title,
input.description,
input.departmentId,
input.projectId,
actor.id,
input.priority,
input.startDate,
input.deadline,
status,
input.instructions,
now,
now
),

activityStatement(
env,
actor,
"TASK_CREATED",
input.id,
null,
input.title
),
];

if (input.assigneeUserId) {
statements.push(
env.DB
.prepare(`
INSERT INTO task_assignments (
id,
task_id,
user_id,
assigned_by,
assignment_role,
status,
assigned_at
)
VALUES (?, ?, ?, ?, 'Assignee', 'Active', ?)
`)
.bind(
`assign_${crypto.randomUUID()}`,
input.id,
input.assigneeUserId,
actor.id,
now
)
);

statements.push(
activityStatement(
env,
actor,
"TASK_ASSIGNED",
input.id,
"Created",
"Assigned"
)
);

statements.push(
notificationStatement(
env,
input.assigneeUserId,
"Task Assigned",
"New Task Assigned",
`You have been assigned a new task: ${input.title}`,
input.id
)
);
}

await env.DB.batch([...statements, ...dependentStatements]);
}

export interface TransitionWrite {
status: TaskStatus;
progress: number;

evidence: string | null;
notes: string | null;

submittedAt: string | null;

reviewedBy: string | null;
reviewNotes: string | null;

completedAt: string | null;
archivedAt: string | null;

assignmentStatus:
| "Active"
| "Completed"
| null;

action: string;

notification?: {
userIds: string[];
type:
| "Task Updated"
| "Task For Review"
| "Task Approved"
| "Task Completed";
title: string;
message: string;
};
}

export async function writeTaskTransition(
env: Env,
task: TaskRecord,
actor: AuthenticatedUser,
write: TransitionWrite
): Promise<void> {
const now =
new Date().toISOString();

const statements:
D1PreparedStatement[] = [
env.DB
.prepare(`
UPDATE tasks
SET
-- Force the transaction to abort rather than writing stale audit events.
status = CASE
  WHEN status = ? AND updated_at = ? THEN ?
  ELSE '__STALE_TRANSITION__'
END,
progress = ?,
evidence_url = ?,
notes = ?,
submitted_at = ?,
reviewed_by = ?,
review_notes = ?,
completed_at = ?,
archived_at = ?,
updated_at = ?
WHERE id = ?
`)
.bind(
task.status,
task.updatedAt,
write.status,
write.progress,
write.evidence,
write.notes,
write.submittedAt,
write.reviewedBy,
write.reviewNotes,
write.completedAt,
write.archivedAt,
now,
task.id
),

activityStatement(
env,
actor,
write.action,
task.id,
task.status,
write.status
),
];

if (
write.assignmentStatus &&
task.assignmentId
) {
statements.push(
env.DB
.prepare(`
UPDATE task_assignments
SET
status = ?,
completed_at = ?
WHERE id = ?
`)
.bind(
write.assignmentStatus,
write.assignmentStatus ===
"Completed"
? now
: null,
task.assignmentId
)
);
}

if (write.notification) {
const unique = [
...new Set(
write.notification.userIds
),
];

for (const userId of unique) {
if (
!userId ||
userId === actor.id
) {
continue;
}

statements.push(
notificationStatement(
env,
userId,
write.notification.type,
write.notification.title,
write.notification.message,
task.id
)
);
}
}

await env.DB.batch(statements);
}

export async function listTaskActivity(
env: Env,
taskId: string
) {
const result = await env.DB
.prepare(`
SELECT
id,
occurred_at AS occurredAt,
actor_user_id AS actorUserId,
actor_name AS actorName,
actor_role AS actorRole,
action,
old_value AS oldValue,
new_value AS newValue
FROM activity_log
WHERE reference_type = 'TASK'
AND reference_id = ?
ORDER BY occurred_at DESC
LIMIT 100
`)
.bind(taskId)
.all();

return result.results;
}

/** Atomic optimistic guard: a stale task snapshot aborts the D1 batch.
 * This must be the first statement in a multi-write assignment batch.
 */
function taskStateGuardStatement(env: Env, task: TaskRecord): D1PreparedStatement {
  return env.DB.prepare(`
    UPDATE tasks
    SET status = CASE
      WHEN status = ? AND updated_at = ? THEN status
      ELSE '__STALE_TRANSITION__'
    END
    WHERE id = ?
  `).bind(task.status, task.updatedAt, task.id);
}

export interface UpdateTaskWrite {
title: string;
description: string | null;
departmentId: string;
projectId: string | null;
priority: TaskPriority;
startDate: string | null;
deadline: string | null;
instructions: string | null;
progress: number;
notes: string | null;
evidence: string | null;
}

export async function updateTaskRecord(
env: Env,
task: TaskRecord,
write: UpdateTaskWrite,
actor: AuthenticatedUser
): Promise<void> {
const now = new Date().toISOString();

await env.DB.batch([
env.DB
.prepare(`
UPDATE tasks
SET
status = CASE
  WHEN status = ? AND updated_at = ? THEN status
  ELSE '__STALE_TRANSITION__'
END,
title = ?,
description = ?,
department_id = ?,
project_id = ?,
priority = ?,
start_date = ?,
deadline = ?,
instructions = ?,
progress = ?,
notes = ?,
evidence_url = ?,
updated_at = ?
WHERE id = ?
`)
.bind(
task.status,
task.updatedAt,
write.title,
write.description,
write.departmentId,
write.projectId,
write.priority,
write.startDate,
write.deadline,
write.instructions,
write.progress,
write.notes,
write.evidence,
now,
task.id
),

activityStatement(
env,
actor,
"TASK_UPDATED",
task.id,
{
title: task.title,
departmentId: task.departmentId,
projectId: task.projectId,
priority: task.priority,
progress: task.progress,
},
{
title: write.title,
departmentId: write.departmentId,
projectId: write.projectId,
priority: write.priority,
progress: write.progress,
}
),
]);
}

export async function assignTaskRecord(
env: Env,
task: TaskRecord,
userId: string,
actor: AuthenticatedUser
): Promise<void> {
const now = new Date().toISOString();

const statements: D1PreparedStatement[] = [
  taskStateGuardStatement(env, task),
];

// Remove the current active assignee if this is a reassignment.
if (
task.assignmentId &&
task.assigneeUserId !== userId
) {
statements.push(
env.DB
.prepare(`
UPDATE task_assignments
SET
status = 'Removed',
completed_at = ?
WHERE id = ?
`)
.bind(
now,
task.assignmentId
)
);
}

// A user may have been assigned to this same task previously.
// Reactivate that assignment instead of inserting a duplicate.
statements.push(
env.DB
.prepare(`
INSERT INTO task_assignments (
id,
task_id,
user_id,
assigned_by,
assignment_role,
status,
assigned_at,
completed_at
)
VALUES (
?,
?,
?,
?,
'Assignee',
'Active',
?,
NULL
)

ON CONFLICT (
task_id,
user_id
)
DO UPDATE SET
assigned_by =
excluded.assigned_by,
assignment_role =
'Assignee',
status =
'Active',
assigned_at =
excluded.assigned_at,
completed_at =
NULL
`)
.bind(
`assign_${crypto.randomUUID()}`,
task.id,
userId,
actor.id,
now
)
);

statements.push(
env.DB
.prepare(`
UPDATE tasks
SET
status = CASE
WHEN status = 'Created'
THEN 'Assigned'
ELSE status
END,
updated_at = ?
WHERE id = ?
`)
.bind(
now,
task.id
)
);

statements.push(
activityStatement(
env,
actor,
task.assigneeUserId
? "TASK_REASSIGNED"
: "TASK_ASSIGNED",
task.id,
task.assigneeUserId,
userId
)
);

statements.push(
notificationStatement(
env,
userId,
"Task Assigned",
"Task Assigned",
`You have been assigned the task: ${task.title}`,
task.id
)
);

if (
task.assigneeUserId &&
task.assigneeUserId !== userId &&
task.assigneeUserId !== actor.id
) {
statements.push(
notificationStatement(
env,
task.assigneeUserId,
"Task Updated",
"Task Reassigned",
`${task.title} has been reassigned.`,
task.id
)
);
}

await env.DB.batch(statements);
}

export async function unassignTaskRecord(
env: Env,
task: TaskRecord,
actor: AuthenticatedUser
): Promise<void> {
const now = new Date().toISOString();

const statements: D1PreparedStatement[] = [
  taskStateGuardStatement(env, task),
];

if (task.assignmentId) {
statements.push(
env.DB
.prepare(`
UPDATE task_assignments
SET
status = 'Removed',
completed_at = ?
WHERE id = ?
`)
.bind(
now,
task.assignmentId
)
);
}

statements.push(
env.DB
.prepare(`
UPDATE tasks
SET
status = 'Created',
progress = 0,
updated_at = ?
WHERE id = ?
`)
.bind(
now,
task.id
)
);

statements.push(
activityStatement(
env,
actor,
"TASK_UNASSIGNED",
task.id,
task.assigneeUserId,
null
)
);

if (
task.assigneeUserId &&
task.assigneeUserId !== actor.id
) {
statements.push(
notificationStatement(
env,
task.assigneeUserId,
"Task Updated",
"Task Unassigned",
`You are no longer assigned to ${task.title}.`,
task.id
)
);
}

await env.DB.batch(statements);
}

