import type { Env } from "../types/env";
import type {
NotificationDto,
} from "../types/notification";

interface NotificationRow {
id: string;
type: string;
title: string;
message: string;

referenceType: string | null;
referenceId: string | null;

status: "Unread" | "Read";

createdAt: string;
readAt: string | null;
}

export async function listNotificationsForUser(
env: Env,
userId: string,
status?: "Unread" | "Read" | null
): Promise<NotificationDto[]> {
let result;

if (status) {
result = await env.DB
.prepare(`
SELECT
id,
type,
title,
message,
reference_type
AS referenceType,
reference_id
AS referenceId,
status,
created_at
AS createdAt,
read_at
AS readAt
FROM notifications
WHERE
user_id = ?
AND status = ?
ORDER BY created_at DESC
LIMIT 100
`)
.bind(
userId,
status
)
.all<NotificationRow>();
} else {
result = await env.DB
.prepare(`
SELECT
id,
type,
title,
message,
reference_type
AS referenceType,
reference_id
AS referenceId,
status,
created_at
AS createdAt,
read_at
AS readAt
FROM notifications
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 100
`)
.bind(userId)
.all<NotificationRow>();
}

return result.results;
}

export async function countUnreadNotifications(
env: Env,
userId: string
): Promise<number> {
const row =
await env.DB
.prepare(`
SELECT COUNT(*) AS count
FROM notifications
WHERE
user_id = ?
AND status = 'Unread'
`)
.bind(userId)
.first<{
count: number;
}>();

return Number(
row?.count ?? 0
);
}

export async function findNotificationForUser(
env: Env,
id: string,
userId: string
): Promise<NotificationRow | null> {
return await env.DB
.prepare(`
SELECT
id,
type,
title,
message,
reference_type
AS referenceType,
reference_id
AS referenceId,
status,
created_at
AS createdAt,
read_at
AS readAt
FROM notifications
WHERE
id = ?
AND user_id = ?
LIMIT 1
`)
.bind(
id,
userId
)
.first<NotificationRow>();
}

export async function markNotificationRead(
env: Env,
id: string,
userId: string
): Promise<void> {
const now =
new Date().toISOString();

await env.DB
.prepare(`
UPDATE notifications
SET
status = 'Read',
read_at = COALESCE(
read_at,
?
)
WHERE
id = ?
AND user_id = ?
`)
.bind(
now,
id,
userId
)
.run();
}

export async function markAllNotificationsRead(
env: Env,
userId: string
): Promise<void> {
const now =
new Date().toISOString();

await env.DB
.prepare(`
UPDATE notifications
SET
status = 'Read',
read_at = COALESCE(
read_at,
?
)
WHERE
user_id = ?
AND status = 'Unread'
`)
.bind(
now,
userId
)
.run();
}
