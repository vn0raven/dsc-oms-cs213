import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthEnv {
	APP_ENV?: string;
	DEV_USER_EMAIL?: string;
	TEAM_DOMAIN?: string;
	POLICY_AUD?: string;
}

let cachedTeamDomain: string | undefined;
let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJWKS(teamDomain: string) {
	if (!cachedJWKS || cachedTeamDomain !== teamDomain) {
		cachedTeamDomain = teamDomain;

		cachedJWKS = createRemoteJWKSet(
			new URL(`${teamDomain}/cdn-cgi/access/certs`)
		);
	}

	return cachedJWKS;
}

/** Defense in depth: a deployed Worker must not honor the dev identity override. */
export function isLoopbackRequest(request: Request): boolean {
	try {
		return ["localhost", "127.0.0.1", "[::1]"].includes(
			new URL(request.url).hostname.toLowerCase()
		);
	} catch {
		return false;
	}
}

export async function getAuthenticatedEmail(
	request: Request,
	env: AuthEnv
): Promise<string | null> {
	// Local development only
	if (env.APP_ENV === "local" && env.DEV_USER_EMAIL && isLoopbackRequest(request)) {
		return env.DEV_USER_EMAIL.trim().toLowerCase();
	}

	const token = request.headers.get("cf-access-jwt-assertion");

	if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) {
		return null;
	}

	try {
		const teamDomain = env.TEAM_DOMAIN.replace(/\/$/, "");

		const { payload } = await jwtVerify(
			token,
			getJWKS(teamDomain),
			{
				issuer: teamDomain,
				audience: env.POLICY_AUD,
			}
		);

		if (typeof payload.email !== "string") {
			return null;
		}

		return payload.email.trim().toLowerCase();
	} catch (error) {
		console.error("Cloudflare Access JWT verification failed", error);
		return null;
	}
}