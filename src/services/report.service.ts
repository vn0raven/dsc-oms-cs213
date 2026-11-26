import {
	getDepartmentWorkloadReport,
	getDetailedTasksReport,
	getExceptionReport,
	getOverviewReport,
	getProjectProgressReport,
	getRecentActivityReport,
	getRequestOutcomeReport,
	getSummaryReport,
	getTaskStatusReport,
} from "../repositories/reports.repository";

import { ApiError } from "../utils/api-error";

import type { Env } from "../types/env";

function optionalIsoDate(raw: string | undefined | null, label: string): string | null {
	if (!raw || !raw.trim()) return null;
	const value = raw.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
		throw new ApiError(400, "INVALID_DATE", `${label} must be a valid YYYY-MM-DD date.`);
	}
	return value;
}

export async function getReportsOverview(env: Env) {
	return await getOverviewReport(env);
}

export async function getTaskStatus(env: Env) {
	return await getTaskStatusReport(env);
}

export async function getProjectProgress(env: Env) {
	return await getProjectProgressReport(env);
}

export async function getDepartmentWorkload(env: Env) {
	return await getDepartmentWorkloadReport(env);
}

export async function getRequestOutcomes(env: Env) {
	return await getRequestOutcomeReport(env);
}

export async function getDetailedReport(
	env: Env,
	query: { startDate?: string; endDate?: string; departmentId?: string; status?: string }
) {
	const startDate = optionalIsoDate(query.startDate, "Start date");
	const endDate = optionalIsoDate(query.endDate, "End date");
	if (startDate && endDate && endDate < startDate) {
		throw new ApiError(400, "INVALID_DATE_RANGE", "End date cannot precede start date.");
	}
	return await getDetailedTasksReport(env, {
		startDate,
		endDate,
		departmentId: query.departmentId?.trim() || null,
		status: query.status?.trim() || null,
	});
}

export async function getSummaryTasksReport(
	env: Env,
	query: { startDate?: string; endDate?: string }
) {
	const startDate = optionalIsoDate(query.startDate, "Start date");
	const endDate = optionalIsoDate(query.endDate, "End date");
	if (startDate && endDate && endDate < startDate) {
		throw new ApiError(400, "INVALID_DATE_RANGE", "End date cannot precede start date.");
	}
	return await getSummaryReport(env, { startDate, endDate });
}

export async function getExceptionsReport(env: Env, rawAsOfDate?: string | null) {
	const asOfDate = optionalIsoDate(rawAsOfDate, "As-of date") ?? new Date().toISOString().slice(0, 10);
	return await getExceptionReport(env, asOfDate);
}

export async function getActivityReport(
	env: Env,
	rawLimit?: string | null
) {
	let limit = 50;

	if (rawLimit) {
		const parsed = Number(rawLimit);

		if (
			!Number.isInteger(parsed) ||
			parsed < 1 ||
			parsed > 200
		) {
			throw new ApiError(
				400,
				"INVALID_LIMIT",
				"Activity limit must be an integer from 1 to 200."
			);
		}

		limit = parsed;
	}

	return await getRecentActivityReport(
		env,
		limit
	);
}
