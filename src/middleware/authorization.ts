import { createMiddleware } from "hono/factory";

import {
	hasPermission,
	type Permission,
} from "../services/permission.service";

import type { AppEnv } from "../types/app";

export function requirePermission(
	permission: Permission
) {
	return createMiddleware<AppEnv>(
		async (c, next) => {
			const user = c.get("user");

			if (!user) {
				return c.json(
					{
						error: "UNAUTHENTICATED",
						message:
							"Authentication is required.",
					},
					401
				);
			}

			if (!hasPermission(user, permission)) {
				return c.json(
					{
						error: "FORBIDDEN",
						message:
							"You do not have permission to perform this action.",
					},
					403
				);
			}

			await next();
		}
	);
}