import {
countUnreadNotifications,
findNotificationForUser,
listNotificationsForUser,
markAllNotificationsRead,
markNotificationRead,
} from "../repositories/notifications.repository";

import { ApiError } from "../utils/api-error";

import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";

export async function listNotifications(
env: Env,
user: AuthenticatedUser,
status?: string | null
) {
let normalized:
| "Unread"
| "Read"
| null = null;

if (status) {
if (
status !== "Unread" &&
status !== "Read"
) {
throw new ApiError(
400,
"INVALID_NOTIFICATION_STATUS",
"Notification status must be Unread or Read."
);
}

normalized = status;
}

return await listNotificationsForUser(
env,
user.id,
normalized
);
}

export async function getUnreadCount(
env: Env,
user: AuthenticatedUser
) {
return await countUnreadNotifications(
env,
user.id
);
}

export async function readNotification(
env: Env,
user: AuthenticatedUser,
id: string
) {
const existing =
await findNotificationForUser(
env,
id,
user.id
);

if (!existing) {
throw new ApiError(
404,
"NOTIFICATION_NOT_FOUND",
"Notification not found."
);
}

await markNotificationRead(
env,
id,
user.id
);

return await findNotificationForUser(
env,
id,
user.id
);
}

export async function readAllNotifications(
env: Env,
user: AuthenticatedUser
) {
await markAllNotificationsRead(
env,
user.id
);

return {
ok: true,
unreadCount: 0,
};
}
