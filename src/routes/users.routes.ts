import { Hono } from "hono";

import { requireAuth } from "../middleware/authentication";
import { requirePermission } from "../middleware/authorization";

import {
findUserById,
listUsers,
} from "../repositories/users.repository";

import {
changeUserRole,
changeUserStatus,
createUser,
updateUserProfile,
} from "../services/user.service";

import { ApiError } from "../utils/api-error";

import type { AppEnv } from "../types/app";

const users = new Hono<AppEnv>({
strict: false,
});

const TEST_DEPARTMENT_ID =
"DEPT-TEST-001";

users.use("*", requireAuth);

function canSeeTesting(
user: {
role?: string;
}
) {
return (
user.role === "Lead" ||
user.role === "Co-Lead"
);
}

async function readJson(
request: Request
): Promise<unknown> {
try {
return await request.json();
}
catch {
throw new ApiError(
400,
"INVALID_JSON",
"Request body must contain valid JSON."
);
}
}


/*
 * Directory
 *
 * System Testing accounts are deliberately
 * hidden from non-Lead users at API level.
 */
users.get(
"/",
requirePermission("users.view"),
async (c) => {
const actor =
c.get("user");

const result =
await listUsers(c.env);

const visibleUsers =
canSeeTesting(actor)
? result
: result.filter(
(user) =>
user.department?.id !==
TEST_DEPARTMENT_ID
);

return c.json({
users: visibleUsers,
});
}
);


/*
 * Bulk tester activation/deactivation.
 *
 * Body:
 * {
 *   "status": "Active"
 * }
 *
 * or:
 *
 * {
 *   "status": "Inactive"
 * }
 */
users.patch(
"/testing/status",
requirePermission(
"users.deactivate"
),
async (c) => {
const actor =
c.get("user");

if (
actor.department?.id ===
TEST_DEPARTMENT_ID
) {
throw new ApiError(
403,
"TEST_ENVIRONMENT_CONTROL_FORBIDDEN",
"Testing accounts cannot enable or disable the testing environment."
);
}

const payload =
await readJson(
c.req.raw
) as {
status?: unknown;
};

if (
payload.status !== "Active" &&
payload.status !== "Inactive"
) {
throw new ApiError(
400,
"INVALID_STATUS",
'Testing status must be "Active" or "Inactive".'
);
}

const at = new Date().toISOString();
const statements = [
c.env.DB
.prepare(`
UPDATE users
SET status = ?, updated_at = ?
WHERE department_id = ?
`)
.bind(
payload.status,
at,
TEST_DEPARTMENT_ID
),
];

if (payload.status === "Inactive") {
statements.push(
c.env.DB
.prepare(`
UPDATE auth_sessions
SET revoked_at = ?
WHERE user_id IN (SELECT id FROM users WHERE department_id = ?)
AND revoked_at IS NULL
`)
.bind(at, TEST_DEPARTMENT_ID)
);
}

statements.push(
c.env.DB
.prepare(`
INSERT INTO activity_log (
id, occurred_at, actor_user_id, actor_name, actor_role,
action, reference_type, reference_id, old_value, new_value
)
VALUES (?, ?, ?, ?, ?, 'TESTING_STATUS_CHANGED', 'DEPARTMENT', ?, NULL, ?)
`)
.bind(
`act_${crypto.randomUUID()}`,
at,
actor.id,
actor.name,
actor.role,
TEST_DEPARTMENT_ID,
JSON.stringify({ status: payload.status })
)
);

const results = await c.env.DB.batch(statements);

return c.json({
testing: {
departmentId:
TEST_DEPARTMENT_ID,

status:
payload.status,

affectedUsers:
Number(
results[0].meta.changes || 0
),
},
});
}
);


users.get(
"/:id",
requirePermission("users.view"),
async (c) => {
const actor =
c.get("user");

const user =
await findUserById(
c.env,
c.req.param("id")
);

if (!user) {
throw new ApiError(
404,
"USER_NOT_FOUND",
"User not found."
);
}

/*
 * Do not allow a non-Lead to bypass
 * directory filtering by requesting the
 * tester ID directly.
 */
if (
user.department?.id ===
TEST_DEPARTMENT_ID &&
!canSeeTesting(actor)
) {
throw new ApiError(
404,
"USER_NOT_FOUND",
"User not found."
);
}

return c.json({
user,
});
}
);


users.post(
"/",
requirePermission(
"users.create"
),
async (c) => {
const payload =
await readJson(
c.req.raw
);

const user =
await createUser(
c.env,
c.get("user"),
payload
);

return c.json(
{ user },
201
);
}
);


users.patch(
"/:id",
requirePermission(
"users.update"
),
async (c) => {
const payload =
await readJson(
c.req.raw
);

const user =
await updateUserProfile(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
user,
});
}
);


users.patch(
"/:id/role",
requirePermission(
"users.change_role"
),
async (c) => {
const payload =
await readJson(
c.req.raw
);

const user =
await changeUserRole(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
user,
});
}
);


users.patch(
"/:id/status",
requirePermission(
"users.deactivate"
),
async (c) => {
const payload =
await readJson(
c.req.raw
);

const user =
await changeUserStatus(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
user,
});
}
);

export default users;
