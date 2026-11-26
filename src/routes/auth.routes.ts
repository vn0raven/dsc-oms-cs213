import { Hono } from "hono";

import { requireAuth } from "../middleware/authentication";
import { findUserByEmail } from "../repositories/users.repository";
import {
	getEmailBySessionToken,
	loginWithPassword,
	logoutSession,
	parseSessionCookie,
	SESSION_COOKIE_NAME,
} from "../services/auth.service";
import { ApiError } from "../utils/api-error";

import type { AppEnv } from "../types/app";

const auth = new Hono<AppEnv>();

auth.get(
	"/me",
	requireAuth,
	(c) => {
		return c.json({
			user: c.get("user"),
		});
	}
);

auth.post("/login", async (c) => {
	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		throw new ApiError(400, "VALIDATION_ERROR", "A JSON body with email and password is required.");
	}
	const { token, user } = await loginWithPassword(c.env, body?.email, body?.password);
	c.header(
		"Set-Cookie",
		`${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`
	);
	return c.json({ user });
});

auth.post("/logout", async (c) => {
	const token = parseSessionCookie(c.req.raw);
	let user = null;
	if (token) {
		const email = await getEmailBySessionToken(c.env, token);
		if (email) {
			user = await findUserByEmail(c.env, email);
		}
	}
	await logoutSession(c.env, token, user);
	c.header(
		"Set-Cookie",
		`${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
	);
	return c.json({ ok: true });
});

export default auth;
