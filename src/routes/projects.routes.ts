import { Hono } from "hono";

import {
requireAuth,
} from "../middleware/authentication";

import {
archiveProject,
createProject,
deleteProject,
getProject,
getProjectActivity,
listProjects,
restoreProject,
updateProject,
} from "../services/project.service";

import { ApiError } from "../utils/api-error";

import type { AppEnv } from "../types/app";

const projects = new Hono<AppEnv>({
strict: false,
});

projects.use("*", requireAuth);

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

projects.get(
"/",
async (c) => {
const result =
await listProjects(
c.env,
c.get("user")
);

return c.json({
projects: result,
});
}
);

projects.get(
"/:id/activity",
async (c) => {
const activity =
await getProjectActivity(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
activity,
});
}
);

projects.get(
"/:id",
async (c) => {
const project =
await getProject(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
project,
});
}
);

projects.post(
"/",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const project =
await createProject(
c.env,
c.get("user"),
payload
);

return c.json(
{ project },
201
);
}
);

projects.patch(
"/:id",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const project =
await updateProject(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
project,
});
}
);

projects.post(
"/:id/archive",
async (c) => {
const project =
await archiveProject(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
project,
});
}
);

projects.post(
"/:id/restore",
async (c) => {
const project =
await restoreProject(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
project,
});
}
);

projects.delete(
"/:id",
async (c) => {
const result =
await deleteProject(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json(result);
}
);

export default projects;
