import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";

export interface Department {
	id: string;
	name: string;
	status: "Active" | "Inactive";
}

function departmentActivityStatement(
	env: Env,
	actor: AuthenticatedUser,
	action: "DEPARTMENT_CREATED" | "DEPARTMENT_UPDATED" | "DEPARTMENT_STATUS_CHANGED",
	departmentId: string,
	oldValue: Department | null,
	newValue: Department
) {
	return env.DB.prepare(`
		INSERT INTO activity_log (
			id,
			occurred_at,
			actor_user_id,
			actor_name,
			actor_role,
			action,
			reference_type,
			reference_id,
			old_value,
			new_value
		)
		VALUES (?, ?, ?, ?, ?, ?, 'DEPARTMENT', ?, ?, ?)
	`).bind(
		`act_${crypto.randomUUID()}`,
		new Date().toISOString(),
		actor.id,
		actor.name,
		actor.role,
		action,
		departmentId,
		oldValue === null ? null : JSON.stringify(oldValue),
		JSON.stringify(newValue)
	);
}

export async function listDepartments(
	env: Env
): Promise<Department[]> {
	const result = await env.DB
		.prepare(`
			SELECT
				id,
				name,
				status
			FROM departments
			ORDER BY name ASC
		`)
		.all<Department>();

	return result.results;
}

export async function findDepartmentById(
	env: Env,
	id: string
): Promise<Department | null> {
	return await env.DB
		.prepare(`
			SELECT
				id,
				name,
				status
			FROM departments
			WHERE id = ?
			LIMIT 1
		`)
		.bind(id)
		.first<Department>();
}

export async function findDepartmentByName(
	env: Env,
	name: string
): Promise<Department | null> {
	return await env.DB
		.prepare(`
			SELECT
				id,
				name,
				status
			FROM departments
			WHERE LOWER(name) = LOWER(?)
			LIMIT 1
		`)
		.bind(name)
		.first<Department>();
}

export async function countOtherActiveDepartments(
	env: Env,
	excludedId: string
): Promise<number> {
	const row = await env.DB
		.prepare(`
			SELECT COUNT(*) AS count
			FROM departments
			WHERE status = 'Active'
			  AND id <> ?
		`)
		.bind(excludedId)
		.first<{ count: number }>();

	return Number(row?.count ?? 0);
}

export async function createDepartmentRecord(
	env: Env,
	record: Department,
	actor: AuthenticatedUser
): Promise<void> {
	await env.DB.batch([
		env.DB
			.prepare(`
				INSERT INTO departments (id, name, status)
				VALUES (?, ?, ?)
			`)
			.bind(record.id, record.name, record.status),
		departmentActivityStatement(env, actor, "DEPARTMENT_CREATED", record.id, null, record),
	]);
}

export async function updateDepartmentNameRecord(
	env: Env,
	id: string,
	name: string,
	actor: AuthenticatedUser,
	oldValue: Department,
	newValue: Department
): Promise<void> {
	await env.DB.batch([
		env.DB
			.prepare(`
				UPDATE departments
				SET name = ?
				WHERE id = ?
			`)
			.bind(name, id),
		departmentActivityStatement(env, actor, "DEPARTMENT_UPDATED", id, oldValue, newValue),
	]);
}

export async function updateDepartmentStatusRecord(
	env: Env,
	id: string,
	status: "Active" | "Inactive",
	actor: AuthenticatedUser,
	oldValue: Department,
	newValue: Department
): Promise<void> {
	await env.DB.batch([
		env.DB
			.prepare(`
				UPDATE departments
				SET status = ?
				WHERE id = ?
			`)
			.bind(status, id),
		departmentActivityStatement(env, actor, "DEPARTMENT_STATUS_CHANGED", id, oldValue, newValue),
	]);
}
