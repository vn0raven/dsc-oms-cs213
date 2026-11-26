import { Hono } from "hono";

import {
requireAuth,
} from "../middleware/authentication";

import {
requirePermission,
} from "../middleware/authorization";

import {
getActivityReport,
getDepartmentWorkload,
getDetailedReport,
getExceptionsReport,
getProjectProgress,
getReportsOverview,
getRequestOutcomes,
getSummaryTasksReport,
getTaskStatus,
} from "../services/report.service";

import {
getOperationsDataMart,
loadOperationsDataMart,
} from "../services/datamart.service";

import type { AppEnv } from "../types/app";

const reports =
new Hono<AppEnv>({
strict: false,
});

reports.use(
"*",
requireAuth
);

reports.use(
"*",
requirePermission(
"reports.view"
)
);

reports.get(
"/overview",
async (c) => {
return c.json({
report:
await getReportsOverview(
c.env
),
});
}
);

reports.get(
"/task-status",
async (c) => {
return c.json({
report:
await getTaskStatus(
c.env
),
});
}
);

reports.get(
"/project-progress",
async (c) => {
return c.json({
report:
await getProjectProgress(
c.env
),
});
}
);

reports.get(
"/department-workload",
async (c) => {
return c.json({
report:
await getDepartmentWorkload(
c.env
),
});
}
);

reports.get(
"/request-outcomes",
async (c) => {
return c.json({
report:
await getRequestOutcomes(
c.env
),
});
}
);

reports.get("/detailed", async (c) => {
return c.json({
report: await getDetailedReport(c.env, {
startDate: c.req.query("startDate"),
endDate: c.req.query("endDate"),
departmentId: c.req.query("departmentId"),
status: c.req.query("status"),
}),
});
});

reports.get("/summary", async (c) => {
return c.json({
report: await getSummaryTasksReport(c.env, {
startDate: c.req.query("startDate"),
endDate: c.req.query("endDate"),
}),
});
});

reports.get("/exceptions", async (c) => {
return c.json({
report: await getExceptionsReport(c.env, c.req.query("asOfDate")),
});
});

reports.get("/datamart", async (c) => {
return c.json({
report: await getOperationsDataMart(c.env),
});
});

reports.post("/datamart/load", async (c) => {
let asOfDate: string | undefined;
try {
const body = (await c.req.json()) as { asOfDate?: string };
asOfDate = body?.asOfDate;
} catch {
asOfDate = undefined;
}
return c.json({
report: await loadOperationsDataMart(c.env, c.get("user"), asOfDate),
});
});

reports.get(
"/activity",
async (c) => {
return c.json({
report:
await getActivityReport(
c.env,
c.req.query(
"limit"
)
),
});
}
);

export default reports;
