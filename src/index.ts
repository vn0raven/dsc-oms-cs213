import { Hono } from "hono";

import authRoutes from "./routes/auth.routes";
import departmentRoutes from "./routes/departments.routes";
import projectRoutes from "./routes/projects.routes";
import requestRoutes from "./routes/requests.routes";
import notificationRoutes from "./routes/notifications.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import reportRoutes from "./routes/reports.routes";
import taskRoutes from "./routes/tasks.routes";
import eventRoutes from "./routes/events.routes";
import m3Routes from "./routes/m3.routes";
import userRoutes from "./routes/users.routes";

import { ApiError } from "./utils/api-error";

import type { AppEnv } from "./types/app";

const app = new Hono<AppEnv>({
strict: false,
});

// All API data is private. Block explicit cross-origin mutations and
// prevent browsers or intermediary caches from retaining API responses.
app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    const site = c.req.header("sec-fetch-site");
    if ((origin && origin !== new URL(c.req.url).origin) ||
        (site && !["same-origin", "none"].includes(site))) {
      return c.json({ error: "CROSS_ORIGIN_FORBIDDEN", message: "Cross-origin API modifications are not allowed." }, 403);
    }
  }
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
});

app.onError((error, c) => {
// SQLite/D1 trigger aborts are expected optimistic-concurrency conflicts.
if (error instanceof Error && error.message.includes("OMS_STATE_CONFLICT")) {
  return c.json({ error: "STATE_CONFLICT", message: "This record changed. Refresh and retry." }, 409);
}
// Event uniqueness races are normal 409 conflicts, never internal server failures.
if (error instanceof Error && (
  error.message.includes("UNIQUE constraint failed: event_appointments.") ||
  error.message.includes("UNIQUE constraint failed: event_task_links.") ||
  error.message.includes("UNIQUE constraint failed: event_teams.") ||
  error.message.includes("UNIQUE constraint failed: event_debriefs.")
)) {
  return c.json({error:"EVENT_CONFLICT",message:"This event operation conflicts with an existing record. Refresh and retry."},409);
}
if (error instanceof Error && error.message.includes("UNIQUE constraint failed: tasks.source_request_id")) {
  return c.json({ error: "REQUEST_ALREADY_CONVERTED", message: "This request was already converted to a task." }, 409);
}
if (error instanceof ApiError) {
return c.json(
{
error: error.code,
message: error.message,
},
error.status
);
}

console.error(
"Unhandled API error",
error
);

return c.json(
{
error: "INTERNAL_ERROR",
message:
"An unexpected server error occurred.",
},
500
);
});

app.get("/api/health", async (c) => {
  try {
    const result = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    if (result?.ok !== 1) throw new Error("DB check failed");
    return c.json({ ok: true, service: "dsc-oms-cloudflare", database: "connected" });
  } catch {
    return c.json({ ok: false, service: "dsc-oms-cloudflare", database: "unavailable" }, 503);
  }
});

app.route(
"/api/auth",
authRoutes
);

app.route(
"/api/departments",
departmentRoutes
);

app.route(
"/api/users",
userRoutes
);

app.route(
"/api/projects",
projectRoutes
);

app.route(
"/api/requests",
requestRoutes
);

app.route(
"/api/notifications",
notificationRoutes
);

app.route(
"/api/dashboard",
dashboardRoutes
);

app.route(
"/api/reports",
reportRoutes
);

app.route(
"/api/tasks",
taskRoutes
);

app.route("/api/events", eventRoutes);
app.route("/api/m3",m3Routes);

app.all(
"/api/*",
(c) => {
return c.json(
{
error: "NOT_FOUND",
message:
"API endpoint not found.",
},
404
);
}
);

export default app;
