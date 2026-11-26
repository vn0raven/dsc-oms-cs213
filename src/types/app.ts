import type { Env } from "./env";
import type { AuthenticatedUser } from "./user";

export type AppEnv = {
	Bindings: Env;

	Variables: {
		user: AuthenticatedUser;
	};
};