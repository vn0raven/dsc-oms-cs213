import { findUserByEmail } from "../repositories/users.repository";
import { ApiError } from "../utils/api-error";
import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";

export const PBKDF2_ITERATIONS = 100000;
export const SESSION_COOKIE_NAME = "dsc_oms_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hex encoding.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

export async function hashPassword(
  password: string,
  saltHex?: string,
  iterations = PBKDF2_ITERATIONS
): Promise<{ hashHex: string; saltHex: string; iterations: number }> {
  const saltBytes = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const resolvedSaltHex = saltHex ?? toHex(saltBytes);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return {
    hashHex: toHex(new Uint8Array(bits)),
    saltHex: resolvedSaltHex,
    iterations,
  };
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  expectedHashHex: string,
  iterations: number
): Promise<boolean> {
  try {
    const derived = await hashPassword(password, saltHex, iterations);
    return constantTimeEqualHex(derived.hashHex.toLowerCase(), expectedHashHex.toLowerCase());
  } catch {
    return false;
  }
}

export function parseSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

function authAuditStatement(
  env: Env,
  user: AuthenticatedUser,
  action: string,
  details: Record<string, unknown>,
  at: string
) {
  return env.DB.prepare(`
    INSERT INTO activity_log (
      id, occurred_at, actor_user_id, actor_name, actor_role,
      action, reference_type, reference_id, old_value, new_value
    )
    VALUES (?, ?, ?, ?, ?, ?, 'USER', ?, NULL, ?)
  `).bind(
    `act_${crypto.randomUUID()}`,
    at,
    user.id,
    user.name,
    user.role,
    action,
    user.id,
    JSON.stringify(details)
  );
}

export async function getEmailBySessionToken(
  env: Env,
  rawToken: string
): Promise<string | null> {
  if (!rawToken) return null;
  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT u.email
    FROM auth_sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND u.status = 'Active'
    LIMIT 1
  `)
    .bind(tokenHash, nowIso)
    .first<{ email: string }>();
  return row?.email ? row.email.trim().toLowerCase() : null;
}

export async function loginWithPassword(
  env: Env,
  rawEmail: unknown,
  rawPassword: unknown
): Promise<{ token: string; user: AuthenticatedUser }> {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!email || !password) {
    throw new ApiError(400, "VALIDATION_ERROR", "Email and password are required.");
  }

  const user = await findUserByEmail(env, email);
  if (!user) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const at = new Date().toISOString();
  if (user.status !== "Active") {
    await authAuditStatement(env, user, "AUTH_LOGIN_FAILED", { reason: "USER_INACTIVE" }, at).run();
    throw new ApiError(403, "USER_INACTIVE", "This OMS account is inactive.");
  }

  const cred = await env.DB.prepare(`
    SELECT password_hash AS passwordHash, password_salt AS passwordSalt, iterations
    FROM user_credentials
    WHERE user_id = ?
    LIMIT 1
  `)
    .bind(user.id)
    .first<{ passwordHash: string; passwordSalt: string; iterations: number }>();

  const valid = cred
    ? await verifyPassword(password, cred.passwordSalt, cred.passwordHash, Number(cred.iterations || PBKDF2_ITERATIONS))
    : false;

  if (!valid) {
    await authAuditStatement(env, user, "AUTH_LOGIN_FAILED", { reason: "INVALID_PASSWORD" }, at).run();
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, NULL)
    `).bind(tokenHash, user.id, at, expiresAt),
    authAuditStatement(env, user, "AUTH_LOGIN_SUCCESS", { method: "password" }, at),
  ]);

  return { token, user };
}

export async function logoutSession(
  env: Env,
  rawToken: string | null,
  user: AuthenticatedUser | null = null
): Promise<void> {
  if (!rawToken) return;
  const tokenHash = await sha256Hex(rawToken);
  const at = new Date().toISOString();
  const statements = [
    env.DB.prepare(`
      UPDATE auth_sessions
      SET revoked_at = ?
      WHERE token_hash = ? AND revoked_at IS NULL
    `).bind(at, tokenHash),
  ];
  if (user) {
    statements.push(authAuditStatement(env, user, "AUTH_LOGOUT", { method: "session" }, at));
  }
  await env.DB.batch(statements);
}
