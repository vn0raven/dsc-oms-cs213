import { Hono } from "hono";

import { requireAuth } from "../middleware/authentication";
import {
	requirePermission,
} from "../middleware/authorization";

import {
	listDepartments,
} from "../repositories/departments.repository";
import {
	createDepartment,
	renameDepartment,
	setDepartmentStatus,
} from "../services/department.service";
import { ApiError } from "../utils/api-error";

import type { AppEnv } from "../types/app";

const departments =
	new Hono<AppEnv>({
		strict: false,
	});

const TEST_DEPARTMENT_ID =
	"DEPT-TEST-001";

async function parseJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new ApiError(400, "VALIDATION_ERROR", "A JSON request body is required.");
	}
}

departments.use(
	"*",
	requireAuth
);

departments.get(
	"/",
	requirePermission(
		"departments.view"
	),
	async (c) => {
		const actor =
			c.get("user");

		const result =
			await listDepartments(
				c.env
			);

		const canSeeTesting =
			actor.role === "Lead" ||
			actor.role === "Co-Lead";

		const visibleDepartments =
			canSeeTesting
				? result
				: result.filter(
						(department) =>
							department.id !==
							TEST_DEPARTMENT_ID
					);

		return c.json({
			departments:
				visibleDepartments,
		});
	}
);

departments.post(
	"/",
	requirePermission("departments.manage"),
	async (c) => {
		const body = await parseJsonBody(c.req.raw);
		const department = await createDepartment(c.env, c.get("user"), body);
		return c.json({ department }, 201);
	}
);

departments.patch(
	"/:id",
	requirePermission("departments.manage"),
	async (c) => {
		const body = await parseJsonBody(c.req.raw);
		const department = await renameDepartment(c.env, c.get("user"), c.req.param("id"), body);
		return c.json({ department });
	}
);

departments.patch(
	"/:id/status",
	requirePermission("departments.manage"),
	async (c) => {
		const body = await parseJsonBody(c.req.raw);
		const department = await setDepartmentStatus(c.env, c.get("user"), c.req.param("id"), body);
		return c.json({ department });
	}
);

export default departments;
