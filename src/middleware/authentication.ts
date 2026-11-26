import { createMiddleware } from "hono/factory";

import { getAuthenticatedEmail } from "../auth";
import { findUserByEmail } from "../repositories/users.repository";
import { getEmailBySessionToken, parseSessionCookie } from "../services/auth.service";

import type { AppEnv } from "../types/app";

export const requireAuth = createMiddleware<AppEnv>(
	async (c, next) => {
		const sessionToken = parseSessionCookie(c.req.raw);
		let email: string | null = null;

		if (sessionToken) {
			email = await getEmailBySessionToken(c.env, sessionToken);
		} else {
			email = await getAuthenticatedEmail(
				c.req.raw,
				c.env
			);
		}

		if (!email) {
			return c.json(
				{
					error: "UNAUTHENTICATED",
					message:
						"Authentication is required.",
				},
				401
			);
		}

		const user = await findUserByEmail(
			c.env,
			email
		);

		if (!user) {
			return c.json(
				{
					error: "USER_NOT_REGISTERED",
					message:
						"Authenticated user is not registered in the OMS.",
				},
				403
			);
		}

		if (user.status !== "Active") {
			return c.json(
				{
					error: "USER_INACTIVE",
					message:
						"This OMS account is inactive.",
				},
				403
			);
		}

		c.set("user", user);

		await next();
	}
);
