import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";
import type {
RequestStatus,
RequestType,
} from "../types/request";
import type { TaskPriority } from "../types/task";

export interface RequestRecord {
id: string;
title: string;
description: string | null;
type: RequestType;

requesterDepartmentId: string;
requesterDepartmentName: string;

receiverDepartmentId: string;
receiverDepartmentName: string;

requestedBy: string;
requestedByName: string;
requestedByEmail: string;

status: RequestStatus;
createdAt: string;

approvedBy: string | null;
approvedByName: string | null;
approvedAt: string | null;

rejectedBy: string | null;
rejectedByName: string | null;
rejectedAt: string | null;
rejectionRemarks: string | null;
isWithdrawn: number;
withdrawnAt: string | null;
withdrawnBy: string | null;

isArchived: number;
archivedAt: string | null;
archivedBy: string | null;
archivedByName: string | null;

convertedTaskId: string | null;
}

export interface CreateRequestWrite {
id: string;
title: string;
description: string | null;
type: RequestType;
requesterDepartmentId: string;
receiverDepartmentId: string;
}

export interface ConvertRequestWrite {
taskId: string;
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

const requestSelect = `
SELECT
r.id,
r.title,
r.description,
r.type,

r.requester_department_id
AS requesterDepartmentId,
rd.name
AS requesterDepartmentName,

r.receiver_department_id
AS receiverDepartmentId,
rcd.name
AS receiverDepartmentName,

r.requested_by
AS requestedBy,
requester.name
AS requestedByName,
requester.email
AS requestedByEmail,

r.status,
r.created_at
AS createdAt,

r.approved_by
AS approvedBy,
approver.name
AS approvedByName,
r.approved_at
AS approvedAt,

r.rejected_by
AS rejectedBy,
rejecter.name
AS rejectedByName,
r.rejected_at
AS rejectedAt,
r.rejection_remarks
AS rejectionRemarks,

r.is_archived
AS isArchived,
r.is_withdrawn
AS isWithdrawn,
r.withdrawn_at
AS withdrawnAt,
r.withdrawn_by
AS withdrawnBy,
r.archived_at
AS archivedAt,
r.archived_by
AS archivedBy,
archiver.name
AS archivedByName,

t.id
AS convertedTaskId

FROM requests r

INNER JOIN departments rd
ON rd.id =
r.requester_department_id

INNER JOIN departments rcd
ON rcd.id =
r.receiver_department_id

INNER JOIN users requester
ON requester.id =
r.requested_by

LEFT JOIN users approver
ON approver.id =
r.approved_by

LEFT JOIN users rejecter
ON rejecter.id =
r.rejected_by

LEFT JOIN users archiver
ON archiver.id =
r.archived_by

LEFT JOIN tasks t
ON t.source_request_id =
r.id
`;

function jsonValue(
value: unknown
): string | null {
return value === null
? null
: JSON.stringify(value);
}

function activityStatement(
env: Env,
actor: AuthenticatedUser,
action: string,
requestId: string,
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
VALUES (
?,
?,
?,
?,
?,
?,
'REQUEST',
?,
?,
?
)
`)
.bind(
`act_${crypto.randomUUID()}`,
new Date().toISOString(),
actor.id,
actor.name,
actor.role,
action,
requestId,
jsonValue(oldValue),
jsonValue(newValue)
);
}

function taskActivityStatement(
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
VALUES (
?,
?,
?,
?,
?,
?,
'TASK',
?,
?,
?
)
`)
.bind(
`act_${crypto.randomUUID()}`,
new Date().toISOString(),
actor.id,
actor.name,
actor.role,
action,
taskId,
jsonValue(oldValue),
jsonValue(newValue)
);
}

function notificationStatement(
env: Env,
userId: string,
type: string,
title: string,
message: string,
requestId: string
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
VALUES (
?,
?,
?,
?,
?,
'REQUEST',
?,
'Unread',
?
)
`)
.bind(
`notif_${crypto.randomUUID()}`,
userId,
type,
title,
message,
requestId,
new Date().toISOString()
);
}

function taskNotificationStatement(
env: Env,
userId: string,
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
VALUES (
?,
?,
'Task Assigned',
?,
?,
'TASK',
?,
'Unread',
?
)
`)
.bind(
`notif_${crypto.randomUUID()}`,
userId,
title,
message,
taskId,
new Date().toISOString()
);
}

export async function findRequestById(
env: Env,
id: string
): Promise<RequestRecord | null> {
return await env.DB
.prepare(`
${requestSelect}
WHERE r.id = ?
LIMIT 1
`)
.bind(id)
.first<RequestRecord>();
}

export async function listAllRequests(
env: Env
): Promise<RequestRecord[]> {
const result = await env.DB
.prepare(`
${requestSelect}
ORDER BY r.created_at DESC
`)
.all<RequestRecord>();

return result.results;
}

export async function listExecutiveRequests(
env: Env,
departmentId: string
): Promise<RequestRecord[]> {
const result = await env.DB
.prepare(`
${requestSelect}
WHERE
r.requester_department_id = ?
OR r.receiver_department_id = ?
ORDER BY r.created_at DESC
`)
.bind(
departmentId,
departmentId
)
.all<RequestRecord>();

return result.results;
}

export async function listOwnRequests(
env: Env,
userId: string
): Promise<RequestRecord[]> {
const result = await env.DB
.prepare(`
${requestSelect}
WHERE r.requested_by = ?
ORDER BY r.created_at DESC
`)
.bind(userId)
.all<RequestRecord>();

return result.results;
}

export async function getRequestReviewerIds(
env: Env,
receiverDepartmentId: string
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
.bind(receiverDepartmentId)
.all<{ id: string }>();

return result.results.map(
(row) => row.id
);
}

export async function createRequestTransaction(
env: Env,
input: CreateRequestWrite,
actor: AuthenticatedUser,
reviewerIds: string[]
): Promise<void> {
const now =
new Date().toISOString();

const statements:
D1PreparedStatement[] = [
env.DB
.prepare(`
INSERT INTO requests (
id,
title,
description,
type,
requester_department_id,
receiver_department_id,
requested_by,
status,
created_at,
is_archived
)
VALUES (
?,
?,
?,
?,
?,
?,
?,
'Pending',
?,
0
)
`)
.bind(
input.id,
input.title,
input.description,
input.type,
input.requesterDepartmentId,
input.receiverDepartmentId,
actor.id,
now
),

activityStatement(
env,
actor,
"REQUEST_CREATED",
input.id,
null,
{
title: input.title,
type: input.type,
receiverDepartmentId:
input.receiverDepartmentId,
}
),
];

for (
const reviewerId
of [...new Set(reviewerIds)]
) {
if (reviewerId === actor.id) {
continue;
}

statements.push(
notificationStatement(
env,
reviewerId,
"Request Received",
"New Request",
`${actor.name} submitted: ${input.title}`,
input.id
)
);
}

await env.DB.batch(statements);
}

export async function withdrawRequestTransaction(
env: Env,
request: RequestRecord,
actor: AuthenticatedUser
): Promise<void> {
const now =
new Date().toISOString();

const reviewers =
await getRequestReviewerIds(
env,
request.receiverDepartmentId
);

const statements:
D1PreparedStatement[] = [
env.DB
.prepare(`
UPDATE requests
SET
is_withdrawn = 1,
withdrawn_at = ?,
withdrawn_by = ?
WHERE
id = ?
AND status = 'Pending'
AND is_archived = 0
AND is_withdrawn = 0
`)
.bind(
now,
actor.id,
request.id
),

activityStatement(
env,
actor,
"REQUEST_WITHDRAWN",
request.id,
{
status: request.status,
isWithdrawn: 0,
},
{
status: request.status,
isWithdrawn: 1,
withdrawnAt: now,
}
),
];

for (const reviewerId of reviewers) {
if (reviewerId === actor.id) {
continue;
}

statements.push(
notificationStatement(
env,
reviewerId,
"Request Withdrawn",
"Request Withdrawn",
`${actor.name} withdrew: ${request.title}`,
request.id
)
);
}

await env.DB.batch(
statements
);
}

export async function approveRequestTransaction(
env: Env,
request: RequestRecord,
actor: AuthenticatedUser
): Promise<void> {
const now =
new Date().toISOString();

await env.DB.batch([
env.DB
.prepare(`
UPDATE requests
SET
status = 'Approved',
approved_by = ?,
approved_at = ?,
rejected_by = NULL,
rejected_at = NULL,
rejection_remarks = NULL
WHERE id = ?
`)
.bind(
actor.id,
now,
request.id
),

activityStatement(
env,
actor,
"REQUEST_APPROVED",
request.id,
request.status,
"Approved"
),

notificationStatement(
env,
request.requestedBy,
"Request Approved",
"Request Approved",
`${request.title} has been approved.`,
request.id
),
]);
}

export async function rejectRequestTransaction(
env: Env,
request: RequestRecord,
actor: AuthenticatedUser,
remarks: string
): Promise<void> {
const now =
new Date().toISOString();

await env.DB.batch([
env.DB
.prepare(`
UPDATE requests
SET
status = 'Rejected',
rejected_by = ?,
rejected_at = ?,
rejection_remarks = ?
WHERE id = ?
`)
.bind(
actor.id,
now,
remarks,
request.id
),

activityStatement(
env,
actor,
"REQUEST_REJECTED",
request.id,
request.status,
{
status: "Rejected",
remarks,
}
),

notificationStatement(
env,
request.requestedBy,
"Request Rejected",
"Request Rejected",
`${request.title} was rejected. ${remarks}`,
request.id
),
]);
}

export async function archiveRequestTransaction(
env: Env,
request: RequestRecord,
actor: AuthenticatedUser
): Promise<void> {
const now =
new Date().toISOString();

await env.DB.batch([
env.DB
.prepare(`
UPDATE requests
SET
is_archived = 1,
archived_at = ?,
archived_by = ?
WHERE id = ?
`)
.bind(
now,
actor.id,
request.id
),

activityStatement(
env,
actor,
"REQUEST_ARCHIVED",
request.id,
0,
1
),
]);
}

export async function restoreRequestTransaction(
env: Env,
request: RequestRecord,
actor: AuthenticatedUser
): Promise<void> {
await env.DB.batch([
env.DB
.prepare(`
UPDATE requests
SET
is_archived = 0,
archived_at = NULL,
archived_by = NULL
WHERE id = ?
`)
.bind(request.id),

activityStatement(
env,
actor,
"REQUEST_RESTORED",
request.id,
1,
0
),
]);
}

export async function convertRequestTransaction(
env: Env,
request: RequestRecord,
write: ConvertRequestWrite,
actor: AuthenticatedUser
): Promise<void> {
const now =
new Date().toISOString();

const taskStatus =
write.assigneeUserId
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
updated_at,
source_request_id
)
VALUES (
?,
?,
?,
?,
?,
?,
?,
?,
?,
?,
0,
?,
?,
?,
?
)
`)
.bind(
write.taskId,
write.title,
write.description,
write.departmentId,
write.projectId,
actor.id,
write.priority,
write.startDate,
write.deadline,
taskStatus,
write.instructions,
now,
now,
request.id
),

env.DB
.prepare(`
UPDATE requests
SET status = 'Converted'
WHERE id = ?
`)
.bind(request.id),

activityStatement(
env,
actor,
"REQUEST_CONVERTED",
request.id,
"Approved",
{
status: "Converted",
taskId: write.taskId,
}
),

taskActivityStatement(
env,
actor,
"TASK_CREATED",
write.taskId,
null,
write.title
),

notificationStatement(
env,
request.requestedBy,
"Request Converted",
"Request Converted to Task",
`${request.title} has been converted into a task.`,
request.id
),
];

if (write.assigneeUserId) {
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
VALUES (
?,
?,
?,
?,
'Assignee',
'Active',
?
)
`)
.bind(
`assign_${crypto.randomUUID()}`,
write.taskId,
write.assigneeUserId,
actor.id,
now
)
);

statements.push(
taskActivityStatement(
env,
actor,
"TASK_ASSIGNED",
write.taskId,
"Created",
"Assigned"
)
);

statements.push(
taskNotificationStatement(
env,
write.assigneeUserId,
"Task Assigned",
`You have been assigned: ${write.title}`,
write.taskId
)
);
}

await env.DB.batch(statements);
}

export async function listRequestActivity(
env: Env,
requestId: string
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
WHERE
reference_type = 'REQUEST'
AND reference_id = ?
ORDER BY occurred_at DESC
LIMIT 100
`)
.bind(requestId)
.all();

return result.results;
}

