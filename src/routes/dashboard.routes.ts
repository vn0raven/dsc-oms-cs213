import { Hono } from "hono";

import {
requireAuth,
} from "../middleware/authentication";

import {
getDashboard,
} from "../services/dashboard.service";

import type { AppEnv } from "../types/app";

const dashboard =
new Hono<AppEnv>({
strict: false,
});

dashboard.use(
"*",
requireAuth
);

dashboard.get(
"/",
async (c) => {
const result =
await getDashboard(
c.env,
c.get("user")
);

return c.json({
dashboard: result,
});
}
);

export default dashboard;
