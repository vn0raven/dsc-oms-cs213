import { Hono } from "hono";

import type { AppEnv } from "../types/app";

const health = new Hono<AppEnv>({
strict: false,
});

health.get(
"/",
async (c) => {
try {
const result =
await c.env.DB
.prepare(`
SELECT 1 AS ok
`)
.first<{
ok: number;
}>();

if (result?.ok !== 1) {
return c.json(
{
status: "degraded",
database: "error",
timestamp:
new Date().toISOString(),
},
503
);
}

return c.json({
status: "ok",
database: "ok",
timestamp:
new Date().toISOString(),
});
}
catch {
return c.json(
{
status: "down",
database: "error",
timestamp:
new Date().toISOString(),
},
503
);
}
}
);

export default health;
