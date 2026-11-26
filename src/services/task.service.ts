import {
createTaskTransaction,
findTaskById,
getTaskReviewerUserIds,
isActiveProjectManager,
isActiveProjectMember,
listActiveManagedProjectIds,
listAllTasks,
listAssignedTasks,
listDepartmentReviewTasks,
listDepartmentTasks,
listOrganizationReviewTasks,
listReviewTasksForManager,
listTaskActivity,
writeTaskTransition,
assignTaskRecord,
unassignTaskRecord,
updateTaskRecord,
} from "../repositories/tasks.repository";

import {
findDepartmentById,
} from "../repositories/departments.repository";

import {
findUserById,
} from "../repositories/users.repository";

import {
getProjectAggregate,
} from "../repositories/projects.repository";

import { ApiError } from "../utils/api-error";

import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";

import type {
TaskDto,
TaskPriority,
TaskStatus,
} from "../types/task";

import type {
TaskRecord,
} from "../repositories/tasks.repository";

const priorities: TaskPriority[] = [
"Critical",
"High",
"Medium",
"Low",
];

function isLeader(
user: AuthenticatedUser
) {
return (
user.role === "Lead" ||
user.role === "Co-Lead"
);
}

function assertRecord(
value: unknown
): asserts value is Record<string, unknown> {
if (
typeof value !== "object" ||
value === null ||
Array.isArray(value)
) {
throw new ApiError(
400,
"INVALID_BODY",
"Request body must be a JSON object."
);
}
}

function requiredText(
body: Record<string, unknown>,
key: string,
max: number
) {
const value = body[key];

if (typeof value !== "string") {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} is required.`
);
}

const result = value.trim();

if (!result) {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} cannot be empty.`
);
}

if (result.length > max) {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} is too long.`
);
}

return result;
}

function nullableText(
value: unknown,
key: string,
max: number
): string | null {
if (
value === undefined ||
value === null ||
value === ""
) {
return null;
}

if (typeof value !== "string") {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} must be text or null.`
);
}

const result =
value.trim();

if (result.length > max) {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} is too long.`
);
}

return result || null;
}

function normalizeDate(
value: unknown,
key: string
): string | null {
if (
value === undefined ||
value === null ||
value === ""
) {
return null;
}

if (
typeof value !== "string" ||
Number.isNaN(
Date.parse(value)
)
) {
throw new ApiError(
400,
"INVALID_DATE",
`${key} is invalid.`
);
}

const trimmed=value.trim();
const datePart=trimmed.slice(0,10);
if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(trimmed) || new Date(`${datePart}T00:00:00Z`).toISOString().slice(0,10)!==datePart)
 throw new ApiError(400,"INVALID_DATE",`${key} must be a valid ISO date or datetime.`);
return trimmed;
}

function validateDateRange(
startDate: string | null,
deadline: string | null
) {
if (
startDate &&
deadline &&
new Date(deadline) <
new Date(startDate)
) {
throw new ApiError(
400,
"INVALID_DATE_RANGE",
"Task deadline cannot be before the start date."
);
}
}

function validatePriority(
value: unknown
): TaskPriority {
if (
typeof value !== "string" ||
!priorities.includes(
value as TaskPriority
)
) {
throw new ApiError(
400,
"INVALID_PRIORITY",
"Invalid task priority."
);
}

return value as TaskPriority;
}

async function requireTask(
env: Env,
id: string
): Promise<TaskRecord> {
const task =
await findTaskById(
env,
id
);

if (!task) {
throw new ApiError(
404,
"TASK_NOT_FOUND",
"Task not found."
);
}

return task;
}

async function canViewTask(
env: Env,
user: AuthenticatedUser,
task: TaskRecord
) {

/* OMS_ORGANIZATION_TASK_VISIBILITY */
if (task.status !== "Archived") {
return true;
}

if (isLeader(user)) {
return true;
}

if (
user.role === "Executive" &&
user.department.id ===
task.departmentId
) {
return true;
}

if (
task.assigneeUserId ===
user.id
) {
return true;
}

if (task.projectId) {
return await isActiveProjectMember(
env,
task.projectId,
user.id
);
}

return false;
}

async function canManageDefinition(
env: Env,
user: AuthenticatedUser,
task: TaskRecord,
managedProjectIds?: ReadonlySet<string>
) {
if (isLeader(user)) {
return true;
}

if (task.projectId) {
if (
managedProjectIds
? managedProjectIds.has(task.projectId)
: await isActiveProjectManager(env, task.projectId, user.id)
) {
return true;
}
}

return (
user.role === "Executive" &&
user.department.id ===
task.departmentId
);
}

async function canReviewTask(
env: Env,
user: AuthenticatedUser,
task: TaskRecord,
managedProjectIds?: ReadonlySet<string>
) {

/* OMS_LEAD_REVIEW_OVERRIDE */
if (
user.role === "Lead" ||
user.role === "Co-Lead"
) {
return true;
}

if (
task.status !== "For Review" &&
task.status !== "Approved"
) {
return false;
}

if (
task.assigneeUserId ===
user.id
) {
return false;
}

if (isLeader(user)) {
return true;
}

if (
task.projectId &&
(managedProjectIds
? managedProjectIds.has(task.projectId)
: await isActiveProjectManager(env, task.projectId, user.id))
) {
return true;
}

return (
user.role === "Executive" &&
user.department.id ===
task.departmentId
);
}

function canArchiveTask(
user: AuthenticatedUser,
task: TaskRecord
) {
if (isLeader(user)) {
return true;
}

return (
user.role === "Executive" &&
user.department.id ===
task.departmentId
);
}

async function taskDto(
env: Env,
user: AuthenticatedUser,
task: TaskRecord,
managedProjectIds?: ReadonlySet<string>
): Promise<TaskDto> {
const review =
await canReviewTask(
env,
user,
task,
managedProjectIds
);

const assignee =
task.assigneeUserId
? {
userId:
task.assigneeUserId,
name:
task.assigneeName ??
"Member",
position:
task.assigneePosition,
role:
task.assigneeRole ??
"Member",
departmentId:
task.assigneeDepartmentId ??
"",
departmentName:
task.assigneeDepartmentName ??
"",
}
: null;

const memberSanitized =
user.role === "Member";

return {
eventId:task.eventId??null,eventName:task.eventName??null,eventTeamId:task.eventTeamId??null,eventTeamName:task.eventTeamName??null,
id: task.id,
title: task.title,
description:
task.description,

departmentId:
task.departmentId,
departmentName:
task.departmentName,

projectId:
task.projectId,
projectName:
task.projectName,

createdBy:
task.createdBy,

priority:
task.priority,

startDate:
task.startDate,
deadline:
task.deadline,

status:
task.status,
progress:
task.progress,

instructions:
task.instructions,
notes:
task.notes,
evidence:
task.evidence,

submittedAt:
task.submittedAt,

reviewedBy:
memberSanitized
? null
: task.reviewedBy,

reviewNotes:
memberSanitized
? null
: task.reviewNotes,

completedAt:
task.completedAt,

createdAt:
task.createdAt,
updatedAt:
task.updatedAt,
archivedAt:
task.archivedAt,

sourceRequestId:
task.sourceRequestId,

assigneeUserId:
task.assigneeUserId,

assignee,

permissions: {
canStart:
task.status ===
"Assigned" &&
task.assigneeUserId ===
user.id,

canSubmit:
task.status ===
"Ongoing" &&
task.assigneeUserId ===
user.id,

canReview:
review,

canEdit:
(
task.status === "Created" ||
task.status === "Assigned" ||
task.status === "Ongoing"
) &&
(
await canManageDefinition(
env,
user,
task,
managedProjectIds
) ||
task.assigneeUserId ===
user.id
),

canAssign:
(
task.status === "Created" ||
task.status === "Assigned" ||
task.status === "Ongoing"
) &&
await canManageDefinition(
env,
user,
task,
managedProjectIds
),

canUnassign:
(
task.status === "Assigned"
) &&
!!task.assigneeUserId &&
await canManageDefinition(
env,
user,
task,
managedProjectIds
),

canArchive:
task.status ===
"Completed" &&
canArchiveTask(
user,
task
),

canRestore:
task.status ===
"Archived" &&
canArchiveTask(
user,
task
),
},
};
}

async function validateAssignee(
env: Env,
assigneeUserId: string | null,
departmentId: string,
projectId: string | null
) {
if (!assigneeUserId) {
return;
}

const user =
await findUserById(
env,
assigneeUserId
);

if (
!user ||
user.status !== "Active"
) {
throw new ApiError(
400,
"TASK_ASSIGNEE_INVALID",
"Assigned user is not an active organization member."
);
}

if (
user.department.id !==
departmentId
) {
throw new ApiError(
400,
"TASK_ASSIGNEE_DEPARTMENT_MISMATCH",
"Assigned user must belong to the task department."
);
}

if (
projectId &&
!await isActiveProjectMember(
env,
projectId,
assigneeUserId
)
) {
throw new ApiError(
400,
"PROJECT_TASK_ASSIGNEE_NOT_TEAM_MEMBER",
"Project tasks can be assigned only to active members of the Project Team."
);
}
}

async function validateCreateScope(
env: Env,
user: AuthenticatedUser,
departmentId: string,
projectId: string | null
) {
if (!projectId) {
if (
isLeader(user) ||
(
user.role ===
"Executive" &&
user.department.id ===
departmentId
)
) {
return;
}

throw new ApiError(
403,
"FORBIDDEN",
"No permission to create this task."
);
}

const project =
await getProjectAggregate(
env,
projectId
);

if (!project) {
throw new ApiError(
400,
"PROJECT_NOT_FOUND",
"Project does not exist."
);
}

if (
project.project.status ===
"Archived"
) {
throw new ApiError(
409,
"PROJECT_ARCHIVED",
"Tasks cannot be added to an archived project."
);
}

const departmentAllowed =
project.departments.some(
(item) =>
item.department_id ===
departmentId
);

if (!departmentAllowed) {
throw new ApiError(
400,
"PROJECT_DEPARTMENT_INVALID",
"Department is not assigned to this project."
);
}

if (isLeader(user)) {
return;
}

if (
await isActiveProjectManager(
env,
projectId,
user.id
)
) {
return;
}

if (
user.role === "Executive" &&
user.department.id ===
departmentId
) {
return;
}

throw new ApiError(
403,
"FORBIDDEN",
"No permission to create this task."
);
}

/** Shared M1 field validation; callers must separately enforce their creation scope. */
export function validateTaskCreationFields(payload: unknown) {
 assertRecord(payload);
 const startDate=normalizeDate(payload.startDate, "startDate");
 const deadline=normalizeDate(payload.deadline, "deadline");
 validateDateRange(startDate,deadline);
 return {title:requiredText(payload,"title",200),
  description:nullableText(payload.description,"description",5000),
  instructions:nullableText(payload.instructions,"instructions",5000),
  priority:payload.priority===undefined?"Medium" as TaskPriority:validatePriority(payload.priority),
  startDate,deadline};
}

export async function createTask(env: Env, actor: AuthenticatedUser, payload: unknown) {
 assertRecord(payload);
 const values=validateTaskCreationFields(payload);
 const departmentId=requiredText(payload,"departmentId",100);
 const department=await findDepartmentById(env,departmentId);
 if(!department || department.status!=="Active")
  throw new ApiError(400,"DEPARTMENT_INVALID","Department does not exist or is inactive.");
 const projectId=nullableText(payload.projectId,"projectId",100);
 await validateCreateScope(env,actor,departmentId,projectId);
 const assigneeUserId=nullableText(payload.assigneeUserId,"assigneeUserId",100);
 await validateAssignee(env,assigneeUserId,departmentId,projectId);
 const id=`task_${crypto.randomUUID()}`;
 await createTaskTransaction(env,{id,...values,departmentId,projectId,assigneeUserId},actor);
 return getTask(env,actor,id);
}

export async function listTasks(
env: Env,
user: AuthenticatedUser,
scope?: string | null
) {
let rows: TaskRecord[];

const requested =
String(scope || "").trim();

if (!requested) {
/* OMS_DEFAULT_ORGANIZATION_SCOPE */
rows =
await listAllTasks(env);
} else if (requested === "my") {
rows =
await listAssignedTasks(
env,
user.id
);
} else if (
requested ===
"organization"
) {
/* OMS_PUBLIC_ORGANIZATION_SCOPE */
rows =
await listAllTasks(env);
} else if (
requested ===
"department"
) {
if (
user.role !==
"Executive"
) {
throw new ApiError(
403,
"FORBIDDEN",
"Department task scope is available only to Executives."
);
}

rows =
await listDepartmentTasks(
env,
user.department.id
);
} else if (
requested === "review"
) {
if (isLeader(user)) {
rows =
await listOrganizationReviewTasks(
env,
user.id
);
} else if (
user.role ===
"Executive"
) {
rows =
await listDepartmentReviewTasks(
env,
user.department.id,
user.id
);
} else {
rows =
await listReviewTasksForManager(
env,
user.id
);
}
} else {
throw new ApiError(
400,
"INVALID_TASK_SCOPE",
"Unknown task scope."
);
}


/* OMS_HIDE_ARCHIVED_FROM_NORMAL_TASKS */
rows = rows.filter(
(task) =>
task.status !== "Archived"
);

// Preload managed projects once for non-leads. Individual task reads still
// use the original check, so mutation permissions remain independently guarded.
const managedProjectIds = !isLeader(user) && rows.some((row) => row.projectId)
? await listActiveManagedProjectIds(env, user.id)
: new Set<string>();
return await Promise.all(
rows.map((row) => taskDto(env, user, row, managedProjectIds))
);
}

export async function getTask(
env: Env,
user: AuthenticatedUser,
id: string
) {
const task =
await requireTask(
env,
id
);

if (
!await canViewTask(
env,
user,
task
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"Access denied."
);
}

return await taskDto(
env,
user,
task
);
}

export async function getTaskActivity(
env: Env,
user: AuthenticatedUser,
id: string
) {
const task =
await requireTask(
env,
id
);

if (
!await canViewTask(
env,
user,
task
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"Access denied."
);
}

return await listTaskActivity(
env,
id
);
}

export async function startTask(
env: Env,
user: AuthenticatedUser,
id: string
) {
const task =
await requireTask(
env,
id
);

if (
task.status !==
"Assigned"
) {
throw new ApiError(
409,
"INVALID_TASK_STATE",
"Only an assigned task can be started."
);
}

if (
task.assigneeUserId !==
user.id
) {
throw new ApiError(
403,
"FORBIDDEN",
"Only the assigned user can start this task."
);
}

await writeTaskTransition(
env,
task,
user,
{
status: "Ongoing",
progress:
task.progress,
evidence:
task.evidence,
notes:
task.notes,
submittedAt:
task.submittedAt,
reviewedBy:
task.reviewedBy,
reviewNotes:
task.reviewNotes,
completedAt:
task.completedAt,
archivedAt:
task.archivedAt,
assignmentStatus:
"Active",
action:
"TASK_STARTED",
}
);

return await getTask(
env,
user,
id
);
}

export async function submitTask(
env: Env,
user: AuthenticatedUser,
id: string,
payload: unknown
) {
assertRecord(payload);

const task =
await requireTask(
env,
id
);

if (
task.status !==
"Ongoing"
) {
throw new ApiError(
409,
"INVALID_TASK_STATE",
"Only an ongoing task can be submitted for review."
);
}

if (
task.assigneeUserId !==
user.id
) {
throw new ApiError(
403,
"FORBIDDEN",
"Only the assigned user can submit this task."
);
}

const evidence =
requiredText(
payload,
"evidence",
1000
);

try {
const url =
new URL(evidence);

if (
url.protocol !==
"http:" &&
url.protocol !==
"https:"
) {
throw new Error();
}
} catch {
throw new ApiError(
400,
"VALIDATION_ERROR",
"Please provide a valid evidence link."
);
}

const notes =
nullableText(
payload.notes,
"notes",
5000
);

const reviewers =
await getTaskReviewerUserIds(
env,
task.departmentId
);

await writeTaskTransition(
env,
task,
user,
{
status:
"For Review",
progress: 100,
evidence,
notes,
submittedAt:
new Date()
.toISOString(),
reviewedBy: null,
reviewNotes: null,
completedAt: null,
archivedAt: null,
assignmentStatus:
"Active",
action:
"TASK_SUBMITTED",

notification: {
userIds:
reviewers,
type:
"Task For Review",
title:
"Task Ready for Review",
message:
`${task.title} has been submitted for review.`,
},
}
);

return await getTask(
env,
user,
id
);
}

function requiredRemarks(
payload: unknown
) {
assertRecord(payload);

return requiredText(
payload,
"remarks",
5000
);
}

export async function approveTask(
env: Env,
user: AuthenticatedUser,
id: string,
payload: unknown
) {
const task =
await requireTask(
env,
id
);

if (
task.status !==
"For Review"
) {
throw new ApiError(
409,
"INVALID_TASK_STATE",
"Only a task For Review can be approved."
);
}

if (
!await canReviewTask(
env,
user,
task
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot review this task."
);
}

const remarks =
requiredRemarks(payload);

await writeTaskTransition(
env,
task,
user,
{
// Legacy behavior:
// approval completes the task directly.
status:
"Completed",

progress: 100,

evidence:
task.evidence,
notes:
task.notes,

submittedAt:
task.submittedAt,

reviewedBy:
user.id,

reviewNotes:
remarks,

completedAt:
new Date()
.toISOString(),

archivedAt: null,

assignmentStatus:
"Completed",

action:
"TASK_APPROVED",

notification:
task.assigneeUserId
? {
userIds: [
task.assigneeUserId,
],
type:
"Task Approved",
title:
"Task Approved",
message:
`${task.title} was approved.`,
}
: undefined,
}
);

return await getTask(
env,
user,
id
);
}

export async function rejectTask(
env: Env,
user: AuthenticatedUser,
id: string,
payload: unknown
) {
const task =
await requireTask(
env,
id
);

if (
task.status !==
"For Review"
) {
throw new ApiError(
409,
"INVALID_TASK_STATE",
"Only a task For Review can be returned for revision."
);
}

if (
!await canReviewTask(
env,
user,
task
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot review this task."
);
}

const remarks =
requiredRemarks(payload);

await writeTaskTransition(
env,
task,
user,
{
status:
"Ongoing",

// Preserved from legacy:
// submission may remain at 100
// until assignee updates it again.
progress:
task.progress,

evidence:
task.evidence,
notes:
task.notes,

submittedAt:
task.submittedAt,

reviewedBy:
user.id,

reviewNotes:
remarks,

completedAt: null,
archivedAt: null,

assignmentStatus:
"Active",

action:
"TASK_REJECTED",

notification:
task.assigneeUserId
? {
userIds: [
task.assigneeUserId,
],
type:
"Task Updated",
title:
"Task Returned for Revision",
message:
`${task.title} was returned for revision.`,
}
: undefined,
}
);

return await getTask(
env,
user,
id
);
}

export async function completeTask(
env: Env,
user: AuthenticatedUser,
id: string
) {
const task =
await requireTask(
env,
id
);

if (
task.status !==
"For Review" &&
task.status !==
"Approved"
) {
throw new ApiError(
409,
"INVALID_TASK_STATE",
"Task cannot be completed from its current state."
);
}

if (
!await canReviewTask(
env,
user,
task
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot complete this task."
);
}

await writeTaskTransition(
env,
task,
user,
{
status:
"Completed",
progress: 100,
evidence:
task.evidence,
notes:
task.notes,
submittedAt:
task.submittedAt,
reviewedBy:
user.id,
reviewNotes:
task.reviewNotes,
completedAt:
new Date()
.toISOString(),
archivedAt: null,
assignmentStatus:
"Completed",
action:
"TASK_COMPLETED",

notification:
task.assigneeUserId
? {
userIds: [
task.assigneeUserId,
],
type:
"Task Completed",
title:
"Task Completed",
message:
`${task.title} was marked completed.`,
}
: undefined,
}
);

return await getTask(
env,
user,
id
);
}

export async function archiveTask(
env: Env,
user: AuthenticatedUser,
id: string
) {
const task =
await requireTask(
env,
id
);

if (
task.status !==
"Completed"
) {
throw new ApiError(
409,
"INVALID_TASK_STATE",
"Only completed tasks can be archived."
);
}

if (
!canArchiveTask(
user,
task
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot archive this task."
);
}

await writeTaskTransition(
env,
task,
user,
{
status:
"Archived",
progress:
task.progress,
evidence:
task.evidence,
notes:
task.notes,
submittedAt:
task.submittedAt,
reviewedBy:
task.reviewedBy,
reviewNotes:
task.reviewNotes,
completedAt:
task.completedAt,
archivedAt:
new Date()
.toISOString(),
assignmentStatus:
task.assignmentStatus ===
"Completed"
? "Completed"
: null,
action:
"TASK_ARCHIVED",
}
);

return await getTask(
env,
user,
id
);
}

export async function restoreTask(
env: Env,
user: AuthenticatedUser,
id: string
) {
const task =
await requireTask(
env,
id
);

if (
task.status !==
"Archived"
) {
throw new ApiError(
409,
"TASK_NOT_ARCHIVED",
"Only archived tasks can be restored."
);
}

if (
!canArchiveTask(
user,
task
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot restore this task."
);
}

await writeTaskTransition(
env,
task,
user,
{
status:
"Completed",
progress:
task.progress,
evidence:
task.evidence,
notes:
task.notes,
submittedAt:
task.submittedAt,
reviewedBy:
task.reviewedBy,
reviewNotes:
task.reviewNotes,
completedAt:
task.completedAt,
archivedAt: null,
assignmentStatus:
task.assignmentStatus ===
"Completed"
? "Completed"
: null,
action:
"TASK_RESTORED",
}
);

return await getTask(
env,
user,
id
);
}




function validateProgress(
value: unknown
): number {
if (
typeof value !== "number" ||
!Number.isFinite(value) ||
value < 0 ||
value > 100
) {
throw new ApiError(
400,
"INVALID_PROGRESS",
"Progress must be a number from 0 to 100."
);
}

return Math.round(value);
}

function validateEvidence(
value: unknown
): string | null {
const result =
nullableText(
value,
"evidence",
1000
);

if (!result) {
return null;
}

try {
const url = new URL(result);

if (
url.protocol !== "http:" &&
url.protocol !== "https:"
) {
throw new Error();
}
} catch {
throw new ApiError(
400,
"INVALID_EVIDENCE_URL",
"Evidence must be a valid http or https URL."
);
}

return result;
}

export async function updateTask(
env: Env,
actor: AuthenticatedUser,
id: string,
payload: unknown
) {
assertRecord(payload);

const allowedFields = [
"title",
"description",
"departmentId",
"projectId",
"priority",
"startDate",
"deadline",
"instructions",
"progress",
"notes",
"evidence",
];

const invalidField =
Object.keys(payload).find(
(key) =>
!allowedFields.includes(key)
);

if (invalidField) {
throw new ApiError(
400,
"INVALID_FIELD",
`Unsupported field: ${invalidField}.`
);
}

if (Object.keys(payload).length === 0) {
throw new ApiError(
400,
"EMPTY_UPDATE",
"Provide at least one field to update."
);
}

const task =
await requireTask(
env,
id
);

if (
task.status === "For Review" ||
task.status === "Completed" ||
task.status === "Archived"
) {
throw new ApiError(
409,
"TASK_LOCKED",
"This task cannot be edited in its current state."
);
}

const manager =
await canManageDefinition(
env,
actor,
task
);

const assignee =
task.assigneeUserId ===
actor.id;

if (!manager && !assignee) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot edit this task."
);
}

const governanceFields = [
"title",
"description",
"departmentId",
"projectId",
"priority",
"startDate",
"deadline",
"instructions",
];

if (!manager) {
for (const field of governanceFields) {
if (payload[field] !== undefined) {
throw new ApiError(
403,
"FORBIDDEN",
"Assignees may only update progress, notes, and evidence."
);
}
}
}

if (
assignee &&
!manager &&
task.status !== "Ongoing"
) {
throw new ApiError(
409,
"TASK_NOT_ONGOING",
"Assignee progress updates are allowed only while the task is Ongoing."
);
}

const title =
payload.title === undefined
? task.title
: requiredText(
payload,
"title",
200
);

const description =
payload.description === undefined
? task.description
: nullableText(
payload.description,
"description",
5000
);

let departmentId =
task.departmentId;

let projectId =
task.projectId;

const scopeChanging =
payload.departmentId !== undefined ||
payload.projectId !== undefined;

if (scopeChanging) {
if (!isLeader(actor)) {
throw new ApiError(
403,
"FORBIDDEN",
"Only Lead/Co-Lead may move a task between project or department scopes."
);
}

departmentId =
payload.departmentId === undefined
? task.departmentId
: requiredText(
payload,
"departmentId",
100
);

projectId =
payload.projectId === undefined
? task.projectId
: nullableText(
payload.projectId,
"projectId",
100
);

const department =
await findDepartmentById(
env,
departmentId
);

if (
!department ||
department.status !== "Active"
) {
throw new ApiError(
400,
"DEPARTMENT_INVALID",
"Department does not exist or is inactive."
);
}

await validateCreateScope(
env,
actor,
departmentId,
projectId
);

if (task.assigneeUserId) {
await validateAssignee(
env,
task.assigneeUserId,
departmentId,
projectId
);
}
}

const priority =
payload.priority === undefined
? task.priority
: validatePriority(
payload.priority
);

const startDate =
payload.startDate === undefined
? task.startDate
: normalizeDate(
payload.startDate,
"startDate"
);

const deadline =
payload.deadline === undefined
? task.deadline
: normalizeDate(
payload.deadline,
"deadline"
);

validateDateRange(
startDate,
deadline
);

const instructions =
payload.instructions === undefined
? task.instructions
: nullableText(
payload.instructions,
"instructions",
5000
);

const progress =
payload.progress === undefined
? task.progress
: validateProgress(
payload.progress
);

const notes =
payload.notes === undefined
? task.notes
: nullableText(
payload.notes,
"notes",
5000
);

const evidence =
payload.evidence === undefined
? task.evidence
: validateEvidence(
payload.evidence
);

await updateTaskRecord(
env,
task,
{
title,
description,
departmentId,
projectId,
priority,
startDate,
deadline,
instructions,
progress,
notes,
evidence,
},
actor
);

return await getTask(
env,
actor,
id
);
}

export async function assignTask(
env: Env,
actor: AuthenticatedUser,
id: string,
payload: unknown
) {
assertRecord(payload);

const userId =
requiredText(
payload,
"userId",
100
);

const task =
await requireTask(
env,
id
);

if (
task.status !== "Created" &&
task.status !== "Assigned" &&
task.status !== "Ongoing"
) {
throw new ApiError(
409,
"TASK_ASSIGNMENT_LOCKED",
"This task cannot be assigned in its current state."
);
}

if (
!await canManageDefinition(
env,
actor,
task
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot assign this task."
);
}

if (
task.assigneeUserId === userId
) {
return await getTask(
env,
actor,
id
);
}

await validateAssignee(
env,
userId,
task.departmentId,
task.projectId
);

await assignTaskRecord(
env,
task,
userId,
actor
);

return await getTask(
env,
actor,
id
);
}

export async function unassignTask(
env: Env,
actor: AuthenticatedUser,
id: string
) {
const task =
await requireTask(
env,
id
);

if (task.status !== "Assigned") {
throw new ApiError(
409,
"TASK_UNASSIGN_LOCKED",
"Only an Assigned task can be unassigned."
);
}

if (!task.assigneeUserId) {
throw new ApiError(
409,
"TASK_NOT_ASSIGNED",
"Task does not currently have an assignee."
);
}

if (
!await canManageDefinition(
env,
actor,
task
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot unassign this task."
);
}

await unassignTaskRecord(
env,
task,
actor
);

return await getTask(
env,
actor,
id
);
}
