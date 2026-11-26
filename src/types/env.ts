export interface Env {
	DB: D1Database;

	APP_ENV?: string;
	DEV_USER_EMAIL?: string;

	TEAM_DOMAIN?: string;
	POLICY_AUD?: string;
}