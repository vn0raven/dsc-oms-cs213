import {
countMeaningfulProjectActivity,
createProjectTransaction,
deleteProjectTransaction,
getProjectAggregate,
getProjectAggregatesForRows,
hasActiveProjectTasksAssignedToUser,
hasProjectTasksInDepartment,
listProjectActivity,
listVisibleProjectRows,
restoreProjectTransaction,
updateProjectTransaction,
archiveProjectTransaction,
} from "../repositories/projects.repository";

import {
listDepartments,
} from "../repositories/departments.repository";

import {
findUserById,
} from "../repositories/users.repository";

import {
hasPermission,
} from "./permission.service";

import { ApiError } from "../utils/api-error";

import type { Env } from "../types/env";

import type {
AuthenticatedUser,
} from "../types/user";

import type {
ProjectDto,
ProjectStatus,
ProjectType,
} from "../types/project";

import type {
ProjectAggregate,
} from "../repositories/projects.repository";

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

function assertAllowedKeys(
body: Record<string, unknown>,
allowed: string[]
) {
const invalid = Object.keys(body)
.filter(
(key) => !allowed.includes(key)
);

if (invalid.length) {
throw new ApiError(
400,
"INVALID_FIELD",
`Unsupported field: ${invalid[0]}.`
);
}
}

function requiredText(
body: Record<string, unknown>,
key: string,
maxLength: number
): string {
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

if (result.length > maxLength) {
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
maxLength: number
): string | null {
if (
value === null ||
value === undefined ||
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

const result = value.trim();

if (result.length > maxLength) {
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
value === null ||
value === undefined ||
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
`${key} is not a valid date.`
);
}

return value.trim();
}

function validateDateRange(
startDate: string | null,
endDate: string | null
) {
if (
startDate &&
endDate &&
new Date(endDate) <
new Date(startDate)
) {
throw new ApiError(
400,
"INVALID_DATE_RANGE",
"Project end date cannot be before the start date."
);
}
}

function validateType(
value: unknown
): ProjectType {
if (
value !== "Organization" &&
value !== "Department"
) {
throw new ApiError(
400,
"INVALID_PROJECT_TYPE",
"Project type must be Organization or Department."
);
}

return value;
}

function validateCreateStatus(
value: unknown
): ProjectStatus {
if (
value !== "Draft" &&
value !== "Active"
) {
throw new ApiError(
400,
"INVALID_PROJECT_STATUS",
"New projects must start as Draft or Active."
);
}

return value;
}

function validateUpdateStatus(
value: unknown
): ProjectStatus {
if (
value !== "Draft" &&
value !== "Active" &&
value !== "Completed"
) {
throw new ApiError(
400,
"INVALID_PROJECT_STATUS",
"Use the dedicated archive action to archive projects."
);
}

return value;
}

function normalizeIdArray(
value: unknown,
key: string
): string[] {
if (value === undefined) {
return [];
}

if (!Array.isArray(value)) {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} must be an array.`
);
}

const result: string[] = [];

for (const item of value) {
if (typeof item !== "string") {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} must contain only IDs.`
);
}

const id = item.trim();

if (
id &&
!result.includes(id)
) {
result.push(id);
}
}

return result;
}

function isLeader(
user: AuthenticatedUser
): boolean {
return (
user.role === "Lead" ||
user.role === "Co-Lead"
);
}

function isManager(
aggregate: ProjectAggregate,
user: AuthenticatedUser
): boolean {
return aggregate.team.some(
(member) =>
member.userId === user.id &&
member.projectRole === "Manager" &&
member.status === "Active"
);
}

function executiveScoped(
aggregate: ProjectAggregate,
user: AuthenticatedUser
): boolean {
return (
user.role === "Executive" &&
aggregate.project.type ===
"Department" &&
aggregate.departments.some(
(department) =>
department.department_id ===
user.department.id
)
);
}

function canView(
aggregate: ProjectAggregate,
user: AuthenticatedUser
): boolean {
if (isLeader(user)) {
return true;
}

if (
aggregate.team.some(
(member) =>
member.userId === user.id
)
) {
return true;
}

return aggregate.departments.some(
(department) =>
department.department_id ===
user.department.id
);
}

function toDto(
aggregate: ProjectAggregate,
user: AuthenticatedUser
): ProjectDto {
const leader =
isLeader(user);

const manager =
isManager(
aggregate,
user
);

const executive =
executiveScoped(
aggregate,
user
);

const departmentParticipates =
aggregate.departments.some(
(department) =>
department.department_id ===
user.department.id
);

const managerMember =
aggregate.team.find(
(member) =>
member.projectRole ===
"Manager"
) ?? null;

return {
id: aggregate.project.id,
name: aggregate.project.name,
type: aggregate.project.type,
description:
aggregate.project.description,
status:
aggregate.project.status,
startDate:
aggregate.project.start_date,
endDate:
aggregate.project.end_date,
createdBy:
aggregate.project.created_by,
createdAt:
aggregate.project.created_at,
updatedAt:
aggregate.project.updated_at,

departmentIds:
aggregate.departments.map(
(item) =>
item.department_id
),

departmentNames:
aggregate.departments.map(
(item) =>
item.department_name
),

manager:
managerMember,

team:
aggregate.team,

teamCount:
aggregate.team.length,

taskCount:
aggregate.stats.taskCount,

completedTaskCount:
aggregate.stats
.completedTaskCount,

ongoingTaskCount:
aggregate.stats
.ongoingTaskCount,

forReviewTaskCount:
aggregate.stats
.forReviewTaskCount,

archivedTaskCount:
aggregate.stats
.archivedTaskCount,

progress:
aggregate.stats.progress,

permissions: {
canEdit:
aggregate.project.status !==
"Archived" &&
(
leader ||
manager ||
executive
),

canManageTeam:
aggregate.project.status !==
"Archived" &&
(
leader ||
executive
),

canAddTask:
aggregate.project.status !==
"Archived" &&
(
leader ||
manager ||
(
user.role ===
"Executive" &&
departmentParticipates
)
),

canArchive:
aggregate.project.status !==
"Archived" &&
(
leader ||
executive
),

canRestore:
aggregate.project.status ===
"Archived" &&
(
leader ||
executive
),

canDelete:
leader &&
aggregate.project.status ===
"Draft" &&
aggregate.stats
.totalTaskCount === 0,

canChangeType:
aggregate.project.status !==
"Archived" &&
leader &&
aggregate.stats
.totalTaskCount === 0,
},
};
}

async function requireAggregate(
env: Env,
projectId: string
): Promise<ProjectAggregate> {
const aggregate =
await getProjectAggregate(
env,
projectId
);

if (!aggregate) {
throw new ApiError(
404,
"PROJECT_NOT_FOUND",
"Project not found."
);
}

return aggregate;
}

async function validateDepartments(
env: Env,
ids: string[]
) {
const departments =
await listDepartments(env);

const byId = new Map(
departments.map(
(item) => [
item.id,
item,
]
)
);

for (const id of ids) {
const department =
byId.get(id);

if (!department) {
throw new ApiError(
400,
"DEPARTMENT_NOT_FOUND",
`Department ${id} does not exist.`
);
}

if (
department.status !==
"Active"
) {
throw new ApiError(
409,
"DEPARTMENT_INACTIVE",
`Department ${department.name} is inactive.`
);
}
}

return departments;
}

async function validateTeam(
env: Env,
managerUserId: string,
memberUserIds: string[],
departmentIds: string[]
) {
if (!managerUserId) {
throw new ApiError(
400,
"PROJECT_MANAGER_REQUIRED",
"Select a Project Manager."
);
}

const allowedDepartments =
new Set(departmentIds);

const users = [
managerUserId,
...memberUserIds,
].filter(
(value, index, array) =>
array.indexOf(value) === index
);

for (const id of users) {
const member =
await findUserById(
env,
id
);

if (!member) {
throw new ApiError(
400,
"PROJECT_MEMBER_INVALID",
"A selected project team member does not exist."
);
}

if (
member.status !== "Active"
) {
throw new ApiError(
409,
"PROJECT_MEMBER_INACTIVE",
`${member.name} is inactive.`
);
}

if (
!allowedDepartments.has(
member.department.id
)
) {
throw new ApiError(
400,
"PROJECT_MEMBER_OUT_OF_SCOPE",
"Project team members must belong to a participating department."
);
}
}
}

export async function listProjects(
env: Env,
user: AuthenticatedUser
): Promise<ProjectDto[]> {
const rows =
await listVisibleProjectRows(
env,
user
);

const aggregates = await getProjectAggregatesForRows(env, rows);
return aggregates.map((aggregate) => toDto(aggregate, user));
}

export async function getProject(
env: Env,
user: AuthenticatedUser,
id: string
): Promise<ProjectDto> {
const aggregate =
await requireAggregate(
env,
id
);

if (!canView(aggregate, user)) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot view this project."
);
}

return toDto(
aggregate,
user
);
}

export async function getProjectActivity(
env: Env,
user: AuthenticatedUser,
id: string
) {
const aggregate =
await requireAggregate(
env,
id
);

if (!canView(aggregate, user)) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot view this project."
);
}

return await listProjectActivity(
env,
id,
100
);
}

export async function createProject(
env: Env,
actor: AuthenticatedUser,
payload: unknown
): Promise<ProjectDto> {
assertRecord(payload);

assertAllowedKeys(payload, [
"name",
"type",
"status",
"startDate",
"endDate",
"description",
"departmentIds",
"managerUserId",
"memberUserIds",
"initialTasks",
]);

if (
Array.isArray(
payload.initialTasks
) &&
payload.initialTasks.length
) {
throw new ApiError(
409,
"INITIAL_TASKS_NOT_MIGRATED",
"Initial project tasks will be enabled after the Tasks module is migrated."
);
}

const name =
requiredText(
payload,
"name",
180
);

let type =
validateType(
payload.type
);

if (actor.role === "Executive") {
type = "Department";
}

const permission =
type === "Organization"
? "projects.create.organization"
: "projects.create.department";

if (
!hasPermission(
actor,
permission
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot create this project type."
);
}

const status =
payload.status === undefined
? "Active"
: validateCreateStatus(
payload.status
);

const startDate =
normalizeDate(
payload.startDate,
"startDate"
);

const endDate =
normalizeDate(
payload.endDate,
"endDate"
);

validateDateRange(
startDate,
endDate
);

const description =
nullableText(
payload.description,
"description",
5000
);

let departmentIds =
normalizeIdArray(
payload.departmentIds,
"departmentIds"
);

const allDepartments =
await validateDepartments(
env,
departmentIds
);

if (
type === "Organization" &&
departmentIds.length === 0
) {
departmentIds =
allDepartments
.filter(
(item) =>
item.status ===
"Active"
)
.map(
(item) => item.id
);
}

if (
type === "Department" &&
departmentIds.length === 0
) {
throw new ApiError(
400,
"PROJECT_DEPARTMENT_REQUIRED",
"Select at least one participating department."
);
}

await validateDepartments(
env,
departmentIds
);

if (
actor.role === "Executive" &&
!departmentIds.includes(
actor.department.id
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"Your own department must participate in projects you create."
);
}

const managerUserId =
requiredText(
payload,
"managerUserId",
100
);

const memberUserIds =
normalizeIdArray(
payload.memberUserIds,
"memberUserIds"
).filter(
(id) =>
id !== managerUserId
);

await validateTeam(
env,
managerUserId,
memberUserIds,
departmentIds
);

const id =
`proj_${crypto.randomUUID()}`;

await createProjectTransaction(
env,
{
id,
name,
type,
status,
startDate,
endDate,
description,
departmentIds,
managerUserId,
memberUserIds,
},
actor
);

return await getProject(
env,
actor,
id
);
}

export async function updateProject(
env: Env,
actor: AuthenticatedUser,
id: string,
payload: unknown
): Promise<ProjectDto> {
assertRecord(payload);

assertAllowedKeys(payload, [
"name",
"type",
"status",
"startDate",
"endDate",
"description",
"departmentIds",
"managerUserId",
"memberUserIds",
]);

if (
Object.keys(payload).length === 0
) {
throw new ApiError(
400,
"EMPTY_UPDATE",
"Provide at least one field to update."
);
}

const aggregate =
await requireAggregate(
env,
id
);


/* OMS_PROJECT_COMPLETION_GUARD */
if (
payload.status === "Completed" &&
aggregate.project.status !== "Completed"
) {
const allowed =
isLeader(actor) ||
isManager(
aggregate,
actor
) ||
executiveScoped(
aggregate,
actor
);

if (!allowed) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot complete this project."
);
}

if (
aggregate.project.status !== "Active"
) {
throw new ApiError(
409,
"PROJECT_NOT_ACTIVE",
"Only an active project can be completed."
);
}

const nonArchivedTaskCount =
aggregate.stats.totalTaskCount -
aggregate.stats.archivedTaskCount;

if (
nonArchivedTaskCount < 1
) {
throw new ApiError(
409,
"PROJECT_HAS_NO_COMPLETED_WORK",
"A project must have at least one non-archived task before it can be completed."
);
}

const incompleteTaskCount =
nonArchivedTaskCount -
aggregate.stats.completedTaskCount;

if (
incompleteTaskCount > 0
) {
throw new ApiError(
409,
"PROJECT_TASKS_INCOMPLETE",
`${incompleteTaskCount} project task${
incompleteTaskCount === 1
? " is"
: "s are"
} still incomplete or awaiting review. Complete all active tasks before completing the project.`
);
}

/*
 * Completion date is controlled by the server,
 * not the browser.
 */
payload.endDate =
new Date()
.toISOString()
.slice(0, 10);
}
const leader =
isLeader(actor);

const manager =
isManager(
aggregate,
actor
);

const executive =
executiveScoped(
aggregate,
actor
);

if (
!leader &&
!manager &&
!executive
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot update this project."
);
}

if (
aggregate.project.status ===
"Archived"
) {
throw new ApiError(
409,
"PROJECT_ARCHIVED",
"Archived projects are read-only. Restore the project before editing."
);
}

if (
manager &&
!leader &&
!executive
) {
for (
const field of [
"type",
"departmentIds",
"managerUserId",
"memberUserIds",
"status",
]
) {
if (
payload[field] !==
undefined
) {
throw new ApiError(
403,
"FORBIDDEN",
"Project Managers cannot change project scope, team governance, or lifecycle status."
);
}
}
}

const name =
payload.name === undefined
? aggregate.project.name
: requiredText(
payload,
"name",
180
);

let type =
aggregate.project.type;

if (payload.type !== undefined) {
const requestedType =
validateType(payload.type);

if (
requestedType !==
aggregate.project.type
) {
if (
!leader ||
aggregate.stats
.totalTaskCount > 0
) {
throw new ApiError(
409,
"PROJECT_TYPE_LOCKED",
"Project type can only be changed by Lead/Co-Lead before any tasks exist."
);
}

type = requestedType;
}
}

const status =
payload.status === undefined
? aggregate.project.status
: validateUpdateStatus(
payload.status
);

if (
status === "Completed" &&
aggregate.stats
.incompleteTaskCount > 0
) {
throw new ApiError(
409,
"PROJECT_HAS_INCOMPLETE_TASKS",
"Complete or archive all project tasks before marking this project Completed."
);
}

const startDate =
payload.startDate === undefined
? aggregate.project.start_date
: normalizeDate(
payload.startDate,
"startDate"
);

const endDate =
payload.endDate === undefined
? aggregate.project.end_date
: normalizeDate(
payload.endDate,
"endDate"
);

validateDateRange(
startDate,
endDate
);

const description =
payload.description === undefined
? aggregate.project.description
: nullableText(
payload.description,
"description",
5000
);

const currentDepartmentIds =
aggregate.departments.map(
(item) =>
item.department_id
);

const scopeChanging =
payload.departmentIds !== undefined ||
type !== aggregate.project.type;

let departmentIds =
currentDepartmentIds;

if (scopeChanging) {
if (!leader && !executive) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot change this project's department scope."
);
}

if (
type === "Organization" &&
!leader
) {
throw new ApiError(
403,
"FORBIDDEN",
"Only Lead/Co-Lead may manage organization project departments."
);
}

if (
payload.departmentIds !==
undefined
) {
departmentIds =
normalizeIdArray(
payload.departmentIds,
"departmentIds"
);
} else if (
type === "Organization"
) {
const departments =
await listDepartments(
env
);

departmentIds =
departments
.filter(
(item) =>
item.status ===
"Active"
)
.map(
(item) =>
item.id
);
} else {
throw new ApiError(
400,
"PROJECT_DEPARTMENT_REQUIRED",
"Select participating departments when changing to Department project type."
);
}

if (
type === "Department" &&
departmentIds.length === 0
) {
throw new ApiError(
400,
"PROJECT_DEPARTMENT_REQUIRED",
"Select at least one participating department."
);
}

await validateDepartments(
env,
departmentIds
);

if (
actor.role === "Executive" &&
!departmentIds.includes(
actor.department.id
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"Your department must remain part of this project."
);
}

for (
const oldDepartmentId
of currentDepartmentIds
) {
if (
departmentIds.includes(
oldDepartmentId
)
) {
continue;
}

if (
await hasProjectTasksInDepartment(
env,
id,
oldDepartmentId
)
) {
throw new ApiError(
409,
"PROJECT_DEPARTMENT_IN_USE",
"A department cannot be removed while project tasks still belong to it."
);
}
}
}

const currentManager =
aggregate.team.find(
(member) =>
member.projectRole ===
"Manager"
);

if (!currentManager) {
throw new ApiError(
409,
"PROJECT_MANAGER_REQUIRED",
"Project does not have an active Project Manager."
);
}

const currentMembers =
aggregate.team
.filter(
(member) =>
member.projectRole !==
"Manager"
)
.map(
(member) =>
member.userId
);

const syncTeam =
payload.managerUserId !==
undefined ||
payload.memberUserIds !==
undefined;

if (
syncTeam &&
!leader &&
!executive
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot manage this project team."
);
}

const managerUserId =
payload.managerUserId ===
undefined
? currentManager.userId
: requiredText(
payload,
"managerUserId",
100
);

const memberUserIds =
payload.memberUserIds ===
undefined
? currentMembers
: normalizeIdArray(
payload.memberUserIds,
"memberUserIds"
).filter(
(userId) =>
userId !==
managerUserId
);

await validateTeam(
env,
managerUserId,
memberUserIds,
departmentIds
);

if (syncTeam) {
const targetTeam = [
managerUserId,
...memberUserIds,
];

for (
const member
of aggregate.team
) {
if (
targetTeam.includes(
member.userId
)
) {
continue;
}

if (
await hasActiveProjectTasksAssignedToUser(
env,
id,
member.userId
)
) {
throw new ApiError(
409,
"PROJECT_MEMBER_HAS_ACTIVE_TASKS",
"Reassign or complete active tasks before removing this person from the Project Team."
);
}
}
}

const notificationUserIds = [
managerUserId,
...memberUserIds,
];

await updateProjectTransaction(
env,
{
id,
name,
type,
status,
startDate,
endDate,
description,
departmentIds,
managerUserId,
memberUserIds,
syncDepartments:
scopeChanging,
syncTeam,
oldManagerUserId:
currentManager.userId,
oldMemberUserIds:
currentMembers,
notificationUserIds,
},
actor
);

return await getProject(
env,
actor,
id
);
}

export async function archiveProject(
env: Env,
actor: AuthenticatedUser,
id: string
): Promise<ProjectDto> {
const aggregate =
await requireAggregate(
env,
id
);

const allowed =
isLeader(actor) ||
executiveScoped(
aggregate,
actor
);

if (
!allowed ||
aggregate.project.status ===
"Archived"
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot archive this project."
);
}

if (
aggregate.stats.activeTaskCount > 0
) {
throw new ApiError(
409,
"PROJECT_HAS_ACTIVE_TASKS",
"Complete or archive active project tasks before archiving the project."
);
}

await archiveProjectTransaction(
env,
aggregate.project,
actor,
aggregate.team.map(
(member) =>
member.userId
)
);

return await getProject(
env,
actor,
id
);
}

export async function restoreProject(
env: Env,
actor: AuthenticatedUser,
id: string
): Promise<ProjectDto> {
const aggregate =
await requireAggregate(
env,
id
);

if (
aggregate.project.status !==
"Archived"
) {
throw new ApiError(
409,
"PROJECT_NOT_ARCHIVED",
"Only archived projects can be restored."
);
}

const allowed =
isLeader(actor) ||
executiveScoped(
aggregate,
actor
);

if (!allowed) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot restore this project."
);
}

await restoreProjectTransaction(
env,
aggregate.project,
actor,
aggregate.team.map(
(member) =>
member.userId
)
);

return await getProject(
env,
actor,
id
);
}

export async function deleteProject(
env: Env,
actor: AuthenticatedUser,
id: string
) {
if (
!hasPermission(
actor,
"projects.delete"
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"Only Lead/Co-Lead may permanently delete projects."
);
}

const aggregate =
await requireAggregate(
env,
id
);

if (
aggregate.project.status !==
"Draft" ||
aggregate.stats
.totalTaskCount > 0
) {
throw new ApiError(
409,
"PROJECT_DELETE_NOT_SAFE",
"Only an unused Draft project with no tasks/history dependencies can be permanently deleted."
);
}

const [meaningful, linkedEventsRow, linkedAnnouncementsRow] = await Promise.all([
countMeaningfulProjectActivity(
env,
id
),
env.DB.prepare("SELECT COUNT(*) AS cnt FROM events WHERE project_id = ?").bind(id).first<{ cnt: number }>(),
env.DB.prepare("SELECT COUNT(*) AS cnt FROM announcements WHERE project_id = ?").bind(id).first<{ cnt: number }>(),
]);

if (
meaningful > 0 ||
Number(linkedEventsRow?.cnt ?? 0) > 0 ||
Number(linkedAnnouncementsRow?.cnt ?? 0) > 0
) {
throw new ApiError(
409,
"PROJECT_DELETE_NOT_SAFE",
"Only an unused Draft project with no tasks, events, announcements, or history dependencies can be permanently deleted."
);
}

try {
await deleteProjectTransaction(
env,
aggregate.project,
actor
);
} catch (error) {
if (String(error).includes("FOREIGN KEY constraint failed")) {
throw new ApiError(
409,
"PROJECT_DELETE_NOT_SAFE",
"Only an unused Draft project with no tasks, events, announcements, or history dependencies can be permanently deleted."
);
}
throw error;
}

return {
id,
deleted: true,
};
}
