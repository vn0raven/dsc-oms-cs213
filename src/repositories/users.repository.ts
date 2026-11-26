import type { Env } from "../types/env";

import type {
AuthenticatedUser,
UserRole,
UserStatus,
} from "../types/user";

interface UserRow {
id: string;
name: string;
email: string;
position: string | null;
role: UserRole;
status: UserStatus;
messenger_url: string | null;
facebook_url: string | null;
contact_number: string | null;
department_id: string;
department_name: string;
}

export interface UserWriteRecord {
id: string;
name: string;
email: string;
departmentId: string;
position: string | null;
role: UserRole;
status: UserStatus;
messengerUrl: string | null;
facebookUrl: string | null;
contactNumber: string | null;
}

function mapUserRow(
row: UserRow
): AuthenticatedUser {
return {
id: row.id,
name: row.name,
email: row.email,
position: row.position,
role: row.role,
status: row.status,
messengerUrl: row.messenger_url,
facebookUrl: row.facebook_url,
contactNumber: row.contact_number,

department: {
id: row.department_id,
name: row.department_name,
},
};
}

function activityStatement(
env: Env,
actor: AuthenticatedUser,
action: string,
referenceId: string,
oldValue: unknown,
newValue: unknown
) {
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
VALUES (?, ?, ?, ?, ?, ?, 'USER', ?, ?, ?)
`)
.bind(
`act_${crypto.randomUUID()}`,
new Date().toISOString(),
actor.id,
actor.name,
actor.role,
action,
referenceId,
oldValue === null
? null
: JSON.stringify(oldValue),
newValue === null
? null
: JSON.stringify(newValue)
);
}

const userSelect = `
SELECT
u.id,
u.name,
u.email,
u.position,
u.role,
u.status,
u.messenger_url,
u.facebook_url,
u.contact_number,
d.id AS department_id,
d.name AS department_name
FROM users u
INNER JOIN departments d
ON d.id = u.department_id
`;

export async function findUserByEmail(
env: Env,
email: string
): Promise<AuthenticatedUser | null> {
const row = await env.DB
.prepare(`
${userSelect}
WHERE LOWER(u.email) = LOWER(?)
LIMIT 1
`)
.bind(email)
.first<UserRow>();

return row ? mapUserRow(row) : null;
}

export async function findUserById(
env: Env,
id: string
): Promise<AuthenticatedUser | null> {
const row = await env.DB
.prepare(`
${userSelect}
WHERE u.id = ?
LIMIT 1
`)
.bind(id)
.first<UserRow>();

return row ? mapUserRow(row) : null;
}

export async function listUsers(
env: Env
): Promise<AuthenticatedUser[]> {
const result = await env.DB
.prepare(`
${userSelect}
ORDER BY u.name ASC
`)
.all<UserRow>();

return result.results.map(mapUserRow);
}

export async function countOtherActiveLeads(
env: Env,
excludedUserId: string
): Promise<number> {
const result = await env.DB
.prepare(`
SELECT COUNT(*) AS count
FROM users
WHERE role = 'Lead'
AND status = 'Active'
AND id <> ?
`)
.bind(excludedUserId)
.first<{ count: number }>();

return result?.count ?? 0;
}

export interface UserCredentialInput {
passwordHash: string;
passwordSalt: string;
iterations: number;
}

export async function createUserRecord(
env: Env,
record: UserWriteRecord,
actor: AuthenticatedUser,
newValue: AuthenticatedUser,
credential?: UserCredentialInput
): Promise<void> {
const at = new Date().toISOString();
const statements = [
env.DB
.prepare(`
INSERT INTO users (
id,
name,
email,
department_id,
position,
role,
status,
messenger_url,
facebook_url,
contact_number
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
.bind(
record.id,
record.name,
record.email,
record.departmentId,
record.position,
record.role,
record.status,
record.messengerUrl,
record.facebookUrl,
record.contactNumber
),

activityStatement(
env,
actor,
"USER_CREATED",
record.id,
null,
newValue
),
];

if (credential) {
statements.push(
env.DB
.prepare(`
INSERT INTO user_credentials (
user_id,
password_hash,
password_salt,
iterations,
updated_at
)
VALUES (?, ?, ?, ?, ?)
`)
.bind(
record.id,
credential.passwordHash,
credential.passwordSalt,
credential.iterations,
at
)
);
}

await env.DB.batch(statements);
}

export async function updateUserProfileRecord(
env: Env,
record: UserWriteRecord,
actor: AuthenticatedUser,
oldValue: AuthenticatedUser,
newValue: AuthenticatedUser
): Promise<void> {
await env.DB.batch([
env.DB
.prepare(`
UPDATE users
SET
name = ?,
email = ?,
department_id = ?,
position = ?,
messenger_url = ?,
facebook_url = ?,
contact_number = ?,
updated_at = ?
WHERE id = ?
`)
.bind(
record.name,
record.email,
record.departmentId,
record.position,
record.messengerUrl,
record.facebookUrl,
record.contactNumber,
new Date().toISOString(),
record.id
),

activityStatement(
env,
actor,
"USER_UPDATED",
record.id,
oldValue,
newValue
),
]);
}

export async function updateUserRoleRecord(
env: Env,
id: string,
role: UserRole,
actor: AuthenticatedUser,
oldValue: AuthenticatedUser,
newValue: AuthenticatedUser
): Promise<void> {
await env.DB.batch([
env.DB
.prepare(`
UPDATE users
SET
role = ?,
updated_at = ?
WHERE id = ?
`)
.bind(
role,
new Date().toISOString(),
id
),

activityStatement(
env,
actor,
"USER_ROLE_CHANGED",
id,
oldValue,
newValue
),
]);
}

export async function updateUserStatusRecord(
env: Env,
id: string,
status: UserStatus,
actor: AuthenticatedUser,
oldValue: AuthenticatedUser,
newValue: AuthenticatedUser
): Promise<void> {
const at = new Date().toISOString();
const statements = [
env.DB
.prepare(`
UPDATE users
SET
status = ?,
updated_at = ?
WHERE id = ?
`)
.bind(
status,
at,
id
),

activityStatement(
env,
actor,
"USER_STATUS_CHANGED",
id,
oldValue,
newValue
),
];

if (status === "Inactive") {
statements.push(
env.DB
.prepare(`
UPDATE auth_sessions
SET revoked_at = ?
WHERE user_id = ?
AND revoked_at IS NULL
`)
.bind(at, id)
);
}

await env.DB.batch(statements);
}
