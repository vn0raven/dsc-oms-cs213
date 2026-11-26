import {
	countOtherActiveDepartments,
	createDepartmentRecord,
	findDepartmentById,
	findDepartmentByName,
	updateDepartmentNameRecord,
	updateDepartmentStatusRecord,
	type Department,
} from "../repositories/departments.repository";
import { ApiError } from "../utils/api-error";
import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";

const TEST_DEPARTMENT_ID = "DEPT-TEST-001";

function bodyObject(payload: unknown): Record<string, unknown> {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new ApiError(400, "VALIDATION_ERROR", "A JSON object is required.");
	}
	return payload as Record<string, unknown>;
}

function validateDepartmentName(raw: unknown): string {
	if (typeof raw !== "string") {
		throw new ApiError(400, "VALIDATION_ERROR", "Department name must be between 2 and 120 characters.");
	}
	const trimmed = raw.trim();
	if (trimmed.length < 2 || trimmed.length > 120) {
		throw new ApiError(400, "VALIDATION_ERROR", "Department name must be between 2 and 120 characters.");
	}
	return trimmed;
}

export async function createDepartment(
	env: Env,
	actor: AuthenticatedUser,
	payload: unknown
): Promise<Department> {
	const body = bodyObject(payload);
	const name = validateDepartmentName(body.name);

	const existing = await findDepartmentByName(env, name);
	if (existing) {
		throw new ApiError(409, "DEPARTMENT_CONFLICT", "A department with this name already exists.");
	}

	const record: Department = {
		id: `dept_${crypto.randomUUID()}`,
		name,
		status: "Active",
	};

	try {
		await createDepartmentRecord(env, record, actor);
	} catch (error) {
		if (String(error).includes("UNIQUE constraint failed: departments.name")) {
			throw new ApiError(409, "DEPARTMENT_CONFLICT", "A department with this name already exists.");
		}
		throw error;
	}

	return record;
}

export async function renameDepartment(
	env: Env,
	actor: AuthenticatedUser,
	departmentId: string,
	payload: unknown
): Promise<Department> {
	const existing = await findDepartmentById(env, departmentId);
	if (!existing) {
		throw new ApiError(404, "DEPARTMENT_NOT_FOUND", "Department not found.");
	}

	const body = bodyObject(payload);
	const name = validateDepartmentName(body.name);

	if (existing.name === name) {
		return existing;
	}

	const conflict = await findDepartmentByName(env, name);
	if (conflict && conflict.id !== existing.id) {
		throw new ApiError(409, "DEPARTMENT_CONFLICT", "A department with this name already exists.");
	}

	const updated: Department = { ...existing, name };
	try {
		await updateDepartmentNameRecord(env, existing.id, name, actor, existing, updated);
	} catch (error) {
		if (String(error).includes("UNIQUE constraint failed: departments.name")) {
			throw new ApiError(409, "DEPARTMENT_CONFLICT", "A department with this name already exists.");
		}
		throw error;
	}

	return updated;
}

export async function setDepartmentStatus(
	env: Env,
	actor: AuthenticatedUser,
	departmentId: string,
	payload: unknown
): Promise<Department> {
	const existing = await findDepartmentById(env, departmentId);
	if (!existing) {
		throw new ApiError(404, "DEPARTMENT_NOT_FOUND", "Department not found.");
	}

	const body = bodyObject(payload);
	const status = body.status;
	if (status !== "Active" && status !== "Inactive") {
		throw new ApiError(400, "VALIDATION_ERROR", "Status must be 'Active' or 'Inactive'.");
	}

	if (status === "Inactive") {
		if (existing.id === TEST_DEPARTMENT_ID) {
			throw new ApiError(400, "DEPARTMENT_PROTECTED", "The system testing department cannot be deactivated.");
		}
		if (existing.id === actor.department.id) {
			throw new ApiError(409, "DEPARTMENT_CONFLICT", "You cannot deactivate your own permanent department.");
		}
		const remaining = await countOtherActiveDepartments(env, existing.id);
		if (remaining < 1) {
			throw new ApiError(409, "DEPARTMENT_CONFLICT", "At least one active department must remain.");
		}
	}

	if (existing.status === status) {
		return existing;
	}

	const updated: Department = { ...existing, status };
	await updateDepartmentStatusRecord(env, existing.id, status, actor, existing, updated);
	return updated;
}
