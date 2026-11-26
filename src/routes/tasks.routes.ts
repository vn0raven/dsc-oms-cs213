import { Hono } from "hono";

import {
requireAuth,
} from "../middleware/authentication";

import {
approveTask,
archiveTask,
assignTask,
completeTask,
createTask,
getTask,
getTaskActivity,
listTasks,
rejectTask,
restoreTask,
startTask,
submitTask,
unassignTask,
updateTask,
} from "../services/task.service";

import { ApiError } from "../utils/api-error";

import type { AppEnv } from "../types/app";

const tasks = new Hono<AppEnv>({
strict: false,
});

tasks.use("*", requireAuth);

import { importTasks } from '../services/task-import.service';
tasks.post('/import/preview',async c=>c.json(await importTasks(c.env,c.get('user'),await readJson(c.req.raw))));
tasks.post('/import/apply',async c=>c.json(await importTasks(c.env,c.get('user'),await readJson(c.req.raw),true)));

async function readJson(
request: Request
): Promise<unknown> {
try {
return await request.json();
} catch {
throw new ApiError(
400,
"INVALID_JSON",
"Request body must contain valid JSON."
);
}
}

tasks.get(
"/",
async (c) => {
const result =
await listTasks(
c.env,
c.get("user"),
c.req.query("scope")
);

return c.json({
tasks: result,
});
}
);

tasks.get(
"/:id/activity",
async (c) => {
const activity =
await getTaskActivity(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
activity,
});
}
);

tasks.get(
"/:id",
async (c) => {
const task =
await getTask(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
task,
});
}
);

tasks.post(
"/",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const task =
await createTask(
c.env,
c.get("user"),
payload
);

return c.json(
{ task },
201
);
}
);

tasks.patch(
"/:id",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const task =
await updateTask(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
task,
});
}
);

tasks.post(
"/:id/assign",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const task =
await assignTask(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
task,
});
}
);

tasks.post(
"/:id/unassign",
async (c) => {
const task =
await unassignTask(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
task,
});
}
);

tasks.post(
"/:id/start",
async (c) => {
const task =
await startTask(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
task,
});
}
);

tasks.post(
"/:id/submit",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const task =
await submitTask(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
task,
});
}
);

tasks.post(
"/:id/approve",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const task =
await approveTask(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
task,
});
}
);

tasks.post(
"/:id/reject",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const task =
await rejectTask(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
task,
});
}
);

tasks.post(
"/:id/complete",
async (c) => {
const task =
await completeTask(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
task,
});
}
);

tasks.post(
"/:id/archive",
async (c) => {
const task =
await archiveTask(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
task,
});
}
);

tasks.post(
"/:id/restore",
async (c) => {
const task =
await restoreTask(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
task,
});
}
);

export default tasks;
