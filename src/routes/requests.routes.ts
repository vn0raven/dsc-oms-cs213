import { Hono } from "hono";

import {
requireAuth,
} from "../middleware/authentication";

import {
approveRequest,
archiveRequest,
convertRequest,
createRequest,
getRequest,
getRequestActivity,
listRequests,
rejectRequest,
restoreRequest,
withdrawRequest,
} from "../services/request.service";

import { ApiError } from "../utils/api-error";

import type { AppEnv } from "../types/app";

const requests =
new Hono<AppEnv>({
strict: false,
});

requests.use(
"*",
requireAuth
);

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

requests.get(
"/",
async (c) => {
const result =
await listRequests(
c.env,
c.get("user")
);

return c.json({
requests: result,
});
}
);

requests.get(
"/:id/activity",
async (c) => {
const activity =
await getRequestActivity(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
activity,
});
}
);

requests.get(
"/:id",
async (c) => {
const request =
await getRequest(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
request,
});
}
);

requests.post(
"/",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const request =
await createRequest(
c.env,
c.get("user"),
payload
);

return c.json(
{ request },
201
);
}
);

requests.post(
"/:id/withdraw",
async (c) => {
const request =
await withdrawRequest(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
request,
});
}
);

requests.post(
"/:id/approve",
async (c) => {
const request =
await approveRequest(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
request,
});
}
);

requests.post(
"/:id/reject",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const request =
await rejectRequest(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json({
request,
});
}
);

requests.post(
"/:id/convert",
async (c) => {
const payload =
await readJson(
c.req.raw
);

const result =
await convertRequest(
c.env,
c.get("user"),
c.req.param("id"),
payload
);

return c.json(result);
}
);

requests.post(
"/:id/archive",
async (c) => {
const request =
await archiveRequest(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
request,
});
}
);

requests.post(
"/:id/restore",
async (c) => {
const request =
await restoreRequest(
c.env,
c.get("user"),
c.req.param("id")
);

return c.json({
request,
});
}
);

export default requests;
