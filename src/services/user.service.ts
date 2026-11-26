import {
countOtherActiveLeads,
createUserRecord,
findUserByEmail,
findUserById,
updateUserProfileRecord,
updateUserRoleRecord,
updateUserStatusRecord,
} from "../repositories/users.repository";

import {
findDepartmentById,
} from "../repositories/departments.repository";

import { hashPassword } from "./auth.service";

import { ApiError } from "../utils/api-error";

import type { Env } from "../types/env";

import type {
AuthenticatedUser,
UserRole,
UserStatus,
} from "../types/user";

const roles: UserRole[] = [
"Lead",
"Co-Lead",
"Executive",
"Member",
];

const statuses: UserStatus[] = [
"Active",
"Inactive",
];

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
.filter((key) => !allowed.includes(key));

if (invalid.length > 0) {
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

const trimmed = value.trim();

if (!trimmed) {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} cannot be empty.`
);
}

if (trimmed.length > maxLength) {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} is too long.`
);
}

return trimmed;
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

const trimmed = value.trim();

if (trimmed.length > maxLength) {
throw new ApiError(
400,
"VALIDATION_ERROR",
`${key} is too long.`
);
}

return trimmed || null;
}

function validateEmail(email: string): string {
const normalized = email
.trim()
.toLowerCase();

const valid =
/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
normalized
);

if (!valid || normalized.length > 254) {
throw new ApiError(
400,
"INVALID_EMAIL",
"Enter a valid email address."
);
}

return normalized;
}

function validateUrl(
value: string | null,
field: string
): string | null {
if (!value) {
return null;
}

try {
const parsed = new URL(value);

if (
parsed.protocol !== "http:" &&
parsed.protocol !== "https:"
) {
throw new Error();
}

return value;
} catch {
throw new ApiError(
400,
"INVALID_URL",
`${field} must be a valid http or https URL.`
);
}
}

function validateRole(
value: unknown
): UserRole {
if (
typeof value !== "string" ||
!roles.includes(value as UserRole)
) {
throw new ApiError(
400,
"INVALID_ROLE",
"Invalid user role."
);
}

return value as UserRole;
}

function validateStatus(
value: unknown
): UserStatus {
if (
typeof value !== "string" ||
!statuses.includes(value as UserStatus)
) {
throw new ApiError(
400,
"INVALID_STATUS",
"Status must be Active or Inactive."
);
}

return value as UserStatus;
}

async function requireActiveDepartment(
env: Env,
id: string
) {
const department =
await findDepartmentById(env, id);

if (!department) {
throw new ApiError(
400,
"DEPARTMENT_NOT_FOUND",
"Department does not exist."
);
}

if (department.status !== "Active") {
throw new ApiError(
409,
"DEPARTMENT_INACTIVE",
"Users cannot be assigned to an inactive department."
);
}

return department;
}

function mapDatabaseConflict(error: unknown): never {
const message = String(error);

if (
message.includes(
"UNIQUE constraint failed: users.email"
)
) {
throw new ApiError(
409,
"EMAIL_ALREADY_EXISTS",
"A user with this email already exists."
);
}

throw error;
}

export async function createUser(
env: Env,
actor: AuthenticatedUser,
payload: unknown
): Promise<AuthenticatedUser> {
assertRecord(payload);

assertAllowedKeys(payload, [
"name",
"email",
"departmentId",
"position",
"role",
"password",
"messengerUrl",
"facebookUrl",
"contactNumber",
]);

const name =
requiredText(payload, "name", 120);

const email = validateEmail(
requiredText(payload, "email", 254)
);

const departmentId =
requiredText(
payload,
"departmentId",
100
);

const department =
await requireActiveDepartment(
env,
departmentId
);

const role = validateRole(payload.role);

// Co-Lead can add regular organization users,
// but cannot create another privileged Lead/Co-Lead.
if (
actor.role === "Co-Lead" &&
(role === "Lead" || role === "Co-Lead")
) {
throw new ApiError(
403,
"ROLE_ASSIGNMENT_FORBIDDEN",
"Only a Lead can create Lead or Co-Lead accounts."
);
}

const existing =
await findUserByEmail(env, email);

if (existing) {
throw new ApiError(
409,
"EMAIL_ALREADY_EXISTS",
"A user with this email already exists."
);
}

const position = nullableText(
payload.position,
"position",
120
);

const messengerUrl = validateUrl(
nullableText(
payload.messengerUrl,
"messengerUrl",
500
),
"messengerUrl"
);

const facebookUrl = validateUrl(
nullableText(
payload.facebookUrl,
"facebookUrl",
500
),
"facebookUrl"
);

const contactNumber = nullableText(
payload.contactNumber,
"contactNumber",
40
);

let credential: { passwordHash: string; passwordSalt: string; iterations: number } | undefined;
if (payload.password !== undefined && payload.password !== null && payload.password !== "") {
if (typeof payload.password !== "string" || payload.password.length < 8 || payload.password.length > 128) {
throw new ApiError(400, "VALIDATION_ERROR", "Password must be between 8 and 128 characters.");
}
const hashed = await hashPassword(payload.password);
credential = {
passwordHash: hashed.hashHex,
passwordSalt: hashed.saltHex,
iterations: hashed.iterations,
};
}

const id = `usr_${crypto.randomUUID()}`;

const user: AuthenticatedUser = {
id,
name,
email,
position,
role,
status: "Active",
messengerUrl,
facebookUrl,
contactNumber,

department: {
id: department.id,
name: department.name,
},
};

try {
await createUserRecord(
env,
{
id,
name,
email,
departmentId,
position,
role,
status: "Active",
messengerUrl,
facebookUrl,
contactNumber,
},
actor,
user,
credential
);
} catch (error) {
mapDatabaseConflict(error);
}

return user;
}

export async function updateUserProfile(
env: Env,
actor: AuthenticatedUser,
id: string,
payload: unknown
): Promise<AuthenticatedUser> {
assertRecord(payload);

assertAllowedKeys(payload, [
"name",
"email",
"departmentId",
"position",
"messengerUrl",
"facebookUrl",
"contactNumber",
]);

if (Object.keys(payload).length === 0) {
throw new ApiError(
400,
"EMPTY_UPDATE",
"Provide at least one field to update."
);
}

const current =
await findUserById(env, id);

if (!current) {
throw new ApiError(
404,
"USER_NOT_FOUND",
"User not found."
);
}

const name =
payload.name === undefined
? current.name
: requiredText(
payload,
"name",
120
);

const email =
payload.email === undefined
? current.email
: validateEmail(
requiredText(
payload,
"email",
254
)
);

let department = current.department;

if (payload.departmentId !== undefined) {
const departmentId =
requiredText(
payload,
"departmentId",
100
);

const found =
await requireActiveDepartment(
env,
departmentId
);

department = {
id: found.id,
name: found.name,
};
}

if (
email.toLowerCase() !==
current.email.toLowerCase()
) {
const duplicate =
await findUserByEmail(
env,
email
);

if (
duplicate &&
duplicate.id !== current.id
) {
throw new ApiError(
409,
"EMAIL_ALREADY_EXISTS",
"A user with this email already exists."
);
}
}

const position =
payload.position === undefined
? current.position
: nullableText(
payload.position,
"position",
120
);

const messengerUrl =
payload.messengerUrl === undefined
? current.messengerUrl
: validateUrl(
nullableText(
payload.messengerUrl,
"messengerUrl",
500
),
"messengerUrl"
);

const facebookUrl =
payload.facebookUrl === undefined
? current.facebookUrl
: validateUrl(
nullableText(
payload.facebookUrl,
"facebookUrl",
500
),
"facebookUrl"
);

const contactNumber =
payload.contactNumber === undefined
? current.contactNumber
: nullableText(
payload.contactNumber,
"contactNumber",
40
);

const updated: AuthenticatedUser = {
...current,
name,
email,
position,
messengerUrl,
facebookUrl,
contactNumber,
department,
};

try {
await updateUserProfileRecord(
env,
{
id: current.id,
name,
email,
departmentId:
department.id,
position,
role: current.role,
status: current.status,
messengerUrl,
facebookUrl,
contactNumber,
},
actor,
current,
updated
);
} catch (error) {
mapDatabaseConflict(error);
}

return updated;
}

export async function changeUserRole(
env: Env,
actor: AuthenticatedUser,
id: string,
payload: unknown
): Promise<AuthenticatedUser> {
assertRecord(payload);

assertAllowedKeys(
payload,
["role"]
);

const newRole =
validateRole(payload.role);

const current =
await findUserById(env, id);

if (!current) {
throw new ApiError(
404,
"USER_NOT_FOUND",
"User not found."
);
}

if (current.role === newRole) {
return current;
}

if (
current.role === "Lead" &&
current.status === "Active" &&
newRole !== "Lead"
) {
const remaining =
await countOtherActiveLeads(
env,
current.id
);

if (remaining === 0) {
throw new ApiError(
409,
"LAST_ACTIVE_LEAD",
"The last active Lead cannot be demoted."
);
}
}

const updated: AuthenticatedUser = {
...current,
role: newRole,
};

await updateUserRoleRecord(
env,
id,
newRole,
actor,
current,
updated
);

return updated;
}

export async function changeUserStatus(
env: Env,
actor: AuthenticatedUser,
id: string,
payload: unknown
): Promise<AuthenticatedUser> {
assertRecord(payload);

assertAllowedKeys(
payload,
["status"]
);

const newStatus =
validateStatus(payload.status);

const current =
await findUserById(env, id);

if (!current) {
throw new ApiError(
404,
"USER_NOT_FOUND",
"User not found."
);
}

if (current.status === newStatus) {
return current;
}

if (
actor.id === current.id &&
newStatus === "Inactive"
) {
throw new ApiError(
409,
"SELF_DEACTIVATION_NOT_ALLOWED",
"You cannot deactivate your own account."
);
}

if (
current.role === "Lead" &&
current.status === "Active" &&
newStatus === "Inactive"
) {
const remaining =
await countOtherActiveLeads(
env,
current.id
);

if (remaining === 0) {
throw new ApiError(
409,
"LAST_ACTIVE_LEAD",
"The last active Lead cannot be deactivated."
);
}
}

const updated: AuthenticatedUser = {
...current,
status: newStatus,
};

await updateUserStatusRecord(
env,
id,
newStatus,
actor,
current,
updated
);

return updated;
}
