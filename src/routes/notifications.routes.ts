import { Hono } from "hono";

import {
requireAuth,
} from "../middleware/authentication";

import {
getUnreadCount,
listNotifications,
readAllNotifications,
readNotification,
} from "../services/notification.service";

import type { AppEnv } from "../types/app";

const notifications =
new Hono<AppEnv>({
strict: false,
});

notifications.use(
"*",
requireAuth
);

notifications.get(
"/",
async (c) => {
const items =
await listNotifications(
c.env,
c.get("user"),
c.req.query("status")
);

return c.json({
notifications: items,
});
}
);

notifications.get(
"/unread-count",
async (c) => {
const count =
await getUnreadCount(
c.env,
c.get("user")
);

return c.json({
unreadCount: count,
});
}
);

notifications.post(
"/read-all",
async (c) => {
const result =
await readAllNotifications(
c.env,
c.get("user")
);

return c.json(result);
}
);

notifications.post(
"/:id/read",
async (c) => {
const notification =
await readNotification(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
notification,
});
}
);

export default notifications;
