import {
approveRequestTransaction,
archiveRequestTransaction,
convertRequestTransaction,
createRequestTransaction,
findRequestById,
getRequestReviewerIds,
listAllRequests,
listExecutiveRequests,
listOwnRequests,
listRequestActivity,
rejectRequestTransaction,
restoreRequestTransaction,
withdrawRequestTransaction,
} from "../repositories/requests.repository";

import {
findDepartmentById,
} from "../repositories/departments.repository";

import {
findUserById,
} from "../repositories/users.repository";

import {
getProjectAggregate,
} from "../repositories/projects.repository";

import {
isActiveProjectMember,
} from "../repositories/tasks.repository";

import { ApiError } from "../utils/api-error";

import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";

import type {
RequestDto,
RequestType,
} from "../types/request";

import type {
RequestRecord,
} from "../repositories/requests.repository";

import type {
TaskPriority,
} from "../types/task";

const requestTypes:
RequestType[] = [
"Task Request",
"Assistance Request",
"Resource Request",
];

const priorities:
TaskPriority[] = [
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
): string {
const value = body[key];

if (typeof value !== "string") {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} is required.`
);
}

const result =
value.trim();

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

function validateRequestType(
value: unknown
): RequestType {
if (
typeof value !== "string" ||
!requestTypes.includes(
value as RequestType
)
) {
throw new ApiError(
400,
"INVALID_REQUEST_TYPE",
"Invalid request type."
);
}

return value as RequestType;
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

return value.trim();
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

async function requireRequest(
env: Env,
id: string
): Promise<RequestRecord> {
const request =
await findRequestById(
env,
id
);

if (!request) {
throw new ApiError(
404,
"REQUEST_NOT_FOUND",
"Request not found."
);
}

return request;
}

function canViewRequest(
user: AuthenticatedUser,
request: RequestRecord
) {
if (isLeader(user)) {
return true;
}

if (
request.requestedBy ===
user.id
) {
return true;
}

if (
user.role === "Executive" &&
(
request.requesterDepartmentId ===
user.department.id ||
request.receiverDepartmentId ===
user.department.id
)
) {
return true;
}

return false;
}

function canReviewRequest(
user: AuthenticatedUser,
request: RequestRecord
) {
/* OMS_WITHDRAWN_REVIEW_GUARD */
if (
request.isWithdrawn === 1
) {
return false;
}

if (
request.requestedBy ===
user.id
) {
return false;
}

if (isLeader(user)) {
return true;
}

return (
user.role === "Executive" &&
request.receiverDepartmentId ===
user.department.id
);
}

function toDto(
request: RequestRecord,
user: AuthenticatedUser
): RequestDto {
const reviewer =
canReviewRequest(
user,
request
);

const archived =
request.isArchived === 1;

const withdrawn =
request.isWithdrawn === 1;

return {
id: request.id,
title: request.title,
description:
request.description,
type: request.type,

requesterDepartmentId:
request.requesterDepartmentId,
requesterDepartmentName:
request.requesterDepartmentName,

receiverDepartmentId:
request.receiverDepartmentId,
receiverDepartmentName:
request.receiverDepartmentName,

requestedBy:
request.requestedBy,
requestedByName:
request.requestedByName,
requestedByEmail:
request.requestedByEmail,

status:
request.status,
createdAt:
request.createdAt,

approvedBy:
request.approvedBy,
approvedByName:
request.approvedByName,
approvedAt:
request.approvedAt,

rejectedBy:
request.rejectedBy,
rejectedByName:
request.rejectedByName,
rejectedAt:
request.rejectedAt,
rejectionRemarks:
request.rejectionRemarks,

isWithdrawn:
withdrawn,
withdrawnAt:
request.withdrawnAt,
withdrawnBy:
request.withdrawnBy,

isArchived:
archived,
archivedAt:
request.archivedAt,
archivedBy:
request.archivedBy,
archivedByName:
request.archivedByName,

convertedTaskId:
request.convertedTaskId,

permissions: {
canApprove:
!archived &&
!withdrawn &&
request.status ===
"Pending" &&
reviewer,

canReject:
!archived &&
!withdrawn &&
request.status ===
"Pending" &&
reviewer,

canConvert:
!archived &&
!withdrawn &&
request.status ===
"Approved" &&
reviewer,

canWithdraw:
!archived &&
!withdrawn &&
request.status ===
"Pending" &&
request.requestedBy ===
user.id,

canArchive:
!archived &&
(
request.status ===
"Converted" ||
request.status ===
"Rejected"
) &&
isLeader(user),

canRestore:
archived &&
isLeader(user),
},
};
}

export async function listRequests(
env: Env,
user: AuthenticatedUser
): Promise<RequestDto[]> {
let rows: RequestRecord[];

if (isLeader(user)) {
rows =
await listAllRequests(
env
);
} else if (
user.role ===
"Executive"
) {
rows =
await listExecutiveRequests(
env,
user.department.id
);
} else {
rows =
await listOwnRequests(
env,
user.id
);
}

return rows.map(
(row) =>
toDto(
row,
user
)
);
}

export async function getRequest(
env: Env,
user: AuthenticatedUser,
id: string
) {
const request =
await requireRequest(
env,
id
);

if (
!canViewRequest(
user,
request
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot view this request."
);
}

return toDto(
request,
user
);
}

export async function getRequestActivity(
env: Env,
user: AuthenticatedUser,
id: string
) {
const request =
await requireRequest(
env,
id
);

if (
!canViewRequest(
user,
request
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot view this request."
);
}

return await listRequestActivity(
env,
id
);
}

export async function createRequest(
env: Env,
actor: AuthenticatedUser,
payload: unknown
) {
assertRecord(payload);

const allowed = [
"title",
"description",
"type",
"receiverDepartmentId",
];

const invalid =
Object.keys(payload)
.find(
(key) =>
!allowed.includes(key)
);

if (invalid) {
throw new ApiError(
400,
"INVALID_FIELD",
`Unsupported field: ${invalid}.`
);
}

const title =
requiredText(
payload,
"title",
200
);

const type =
validateRequestType(
payload.type
);

const receiverDepartmentId =
requiredText(
payload,
"receiverDepartmentId",
100
);

const receiver =
await findDepartmentById(
env,
receiverDepartmentId
);

if (
!receiver ||
receiver.status !== "Active"
) {
throw new ApiError(
400,
"RECEIVER_DEPARTMENT_INVALID",
"Receiving department does not exist or is inactive."
);
}

if (
receiverDepartmentId ===
actor.department.id
) {
throw new ApiError(
400,
"SAME_DEPARTMENT_REQUEST",
"Requester and receiving departments must be different."
);
}

const id =
`req_${crypto.randomUUID()}`;

const reviewers =
await getRequestReviewerIds(
env,
receiverDepartmentId
);

await createRequestTransaction(
env,
{
id,
title,
description:
nullableText(
payload.description,
"description",
5000
),
type,
requesterDepartmentId:
actor.department.id,
receiverDepartmentId,
},
actor,
reviewers
);

return await getRequest(
env,
actor,
id
);
}

export async function withdrawRequest(
env: Env,
actor: AuthenticatedUser,
id: string
) {
const request =
await requireRequest(
env,
id
);

if (request.isArchived) {
throw new ApiError(
409,
"REQUEST_ARCHIVED",
"Archived requests cannot be withdrawn."
);
}

if (request.isWithdrawn === 1) {
throw new ApiError(
409,
"REQUEST_ALREADY_WITHDRAWN",
"Request has already been withdrawn."
);
}

if (
request.status !==
"Pending"
) {
throw new ApiError(
409,
"REQUEST_WITHDRAW_NOT_ALLOWED",
"Only Pending requests can be withdrawn."
);
}

if (
request.requestedBy !==
actor.id
) {
throw new ApiError(
403,
"FORBIDDEN",
"Only the original requester can withdraw this request."
);
}

await withdrawRequestTransaction(
env,
request,
actor
);

return await getRequest(
env,
actor,
id
);
}

export async function approveRequest(
env: Env,
actor: AuthenticatedUser,
id: string
) {
const request =
await requireRequest(
env,
id
);

if (request.isArchived) {
throw new ApiError(
409,
"REQUEST_ARCHIVED",
"Archived requests cannot be reviewed."
);
}

if (
request.status !==
"Pending"
) {
throw new ApiError(
409,
"INVALID_REQUEST_STATE",
"Only Pending requests can be approved."
);
}

if (
!canReviewRequest(
actor,
request
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot approve this request."
);
}

await approveRequestTransaction(
env,
request,
actor
);

return await getRequest(
env,
actor,
id
);
}

export async function rejectRequest(
env: Env,
actor: AuthenticatedUser,
id: string,
payload: unknown
) {
assertRecord(payload);

const request =
await requireRequest(
env,
id
);

if (request.isArchived) {
throw new ApiError(
409,
"REQUEST_ARCHIVED",
"Archived requests cannot be reviewed."
);
}

if (
request.status !==
"Pending"
) {
throw new ApiError(
409,
"INVALID_REQUEST_STATE",
"Only Pending requests can be rejected."
);
}

if (
!canReviewRequest(
actor,
request
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot reject this request."
);
}

const remarks =
requiredText(
payload,
"remarks",
5000
);

await rejectRequestTransaction(
env,
request,
actor,
remarks
);

return await getRequest(
env,
actor,
id
);
}

export async function convertRequest(
env: Env,
actor: AuthenticatedUser,
id: string,
payload: unknown
) {
assertRecord(payload);

const request =
await requireRequest(
env,
id
);

if (request.isArchived) {
throw new ApiError(
409,
"REQUEST_ARCHIVED",
"Archived requests cannot be converted."
);
}

if (
request.status !==
"Approved"
) {
throw new ApiError(
409,
"INVALID_REQUEST_STATE",
"Only Approved requests can be converted into tasks."
);
}

if (
!canReviewRequest(
actor,
request
)
) {
throw new ApiError(
403,
"FORBIDDEN",
"You cannot convert this request."
);
}

if (request.convertedTaskId) {
throw new ApiError(
409,
"REQUEST_ALREADY_CONVERTED",
"Request already has a converted task."
);
}

const title =
payload.title === undefined
? request.title
: requiredText(
payload,
"title",
200
);

const description =
payload.description === undefined
? request.description
: nullableText(
payload.description,
"description",
5000
);

const projectId =
nullableText(
payload.projectId,
"projectId",
100
);

if (projectId) {
const project =
await getProjectAggregate(
env,
projectId
);

if (!project) {
throw new ApiError(
400,
"PROJECT_NOT_FOUND",
"Selected project does not exist."
);
}

if (
project.project.status ===
"Archived"
) {
throw new ApiError(
409,
"PROJECT_ARCHIVED",
"Cannot convert a request into an archived project."
);
}

const participates =
project.departments.some(
(department) =>
department.department_id ===
request.receiverDepartmentId
);

if (!participates) {
throw new ApiError(
400,
"PROJECT_DEPARTMENT_INVALID",
"The receiving department is not part of the selected project."
);
}
}

const assigneeUserId =
nullableText(
payload.assigneeUserId,
"assigneeUserId",
100
);

if (assigneeUserId) {
const assignee =
await findUserById(
env,
assigneeUserId
);

if (
!assignee ||
assignee.status !==
"Active"
) {
throw new ApiError(
400,
"TASK_ASSIGNEE_INVALID",
"Selected assignee is not active."
);
}

if (
assignee.department.id !==
request.receiverDepartmentId
) {
throw new ApiError(
400,
"TASK_ASSIGNEE_DEPARTMENT_MISMATCH",
"Converted task assignee must belong to the receiving department."
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
"Assignee must be an active member of the selected project."
);
}
}

const priority =
payload.priority === undefined
? "Medium"
: validatePriority(
payload.priority
);

const startDate =
normalizeDate(
payload.startDate,
"startDate"
);

const deadline =
normalizeDate(
payload.deadline,
"deadline"
);

validateDateRange(
startDate,
deadline
);

const taskId =
`task_${crypto.randomUUID()}`;

await convertRequestTransaction(
env,
request,
{
taskId,
title,
description,
departmentId:
request.receiverDepartmentId,
projectId,
priority,
startDate,
deadline,
instructions:
nullableText(
payload.instructions,
"instructions",
5000
),
assigneeUserId,
},
actor
);

return {
request:
await getRequest(
env,
actor,
id
),
taskId,
};
}

export async function archiveRequest(
env: Env,
actor: AuthenticatedUser,
id: string
) {
if (!isLeader(actor)) {
throw new ApiError(
403,
"FORBIDDEN",
"Only Lead/Co-Lead may archive requests."
);
}

const request =
await requireRequest(
env,
id
);

if (request.isArchived) {
throw new ApiError(
409,
"REQUEST_ALREADY_ARCHIVED",
"Request is already archived."
);
}

if (
request.status !==
"Converted" &&
request.status !==
"Rejected"
) {
throw new ApiError(
409,
"REQUEST_ARCHIVE_NOT_ALLOWED",
"Only Converted or Rejected requests can be archived."
);
}

await archiveRequestTransaction(
env,
request,
actor
);

return await getRequest(
env,
actor,
id
);
}

export async function restoreRequest(
env: Env,
actor: AuthenticatedUser,
id: string
) {
if (!isLeader(actor)) {
throw new ApiError(
403,
"FORBIDDEN",
"Only Lead/Co-Lead may restore requests."
);
}

const request =
await requireRequest(
env,
id
);

if (!request.isArchived) {
throw new ApiError(
409,
"REQUEST_NOT_ARCHIVED",
"Request is not archived."
);
}

await restoreRequestTransaction(
env,
request,
actor
);

return await getRequest(
env,
actor,
id
);
}
