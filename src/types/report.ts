export interface TaskStatusReport {
	total: number;
	created: number;
	assigned: number;
	ongoing: number;
	forReview: number;
	approved: number;
	completed: number;
	archived: number;
}

export interface RequestOutcomeReport {
	total: number;
	pending: number;
	approved: number;
	converted: number;
	rejected: number;
	archived: number;
}

export interface ProjectProgressReport {
	id: string;
	name: string;
	type: string;
	status: string;

	taskCount: number;
	completedTaskCount: number;
	ongoingTaskCount: number;
	forReviewTaskCount: number;

	progress: number;
}

export interface DepartmentWorkloadReport {
	id: string;
	name: string;

	activeUsers: number;
	activeProjects: number;

	taskCount: number;
	createdTasks: number;
	assignedTasks: number;
	ongoingTasks: number;
	forReviewTasks: number;
	completedTasks: number;

	pendingRequestsReceived: number;
}

export interface ActivityReportItem {
	id: string;
	occurredAt: string;

	actorUserId: string | null;
	actorName: string;
	actorRole: string;

	action: string;

	referenceType: string;
	referenceId: string;

	oldValue: string | null;
	newValue: string | null;
}

export interface OverviewReport {
	users: {
		total: number;
		active: number;
		inactive: number;
	};

	departments: {
		total: number;
		active: number;
		inactive: number;
	};

	projects: {
		total: number;
		draft: number;
		active: number;
		completed: number;
		archived: number;
	};

	tasks: TaskStatusReport;

	requests: RequestOutcomeReport;
}

export interface DetailedReportFilters {
	startDate: string | null;
	endDate: string | null;
	departmentId: string | null;
	status: string | null;
}

export interface DetailedTaskReportRow {
	id: string;
	title: string;
	departmentId: string;
	departmentName: string;
	projectId: string | null;
	projectName: string | null;
	eventId: string | null;
	eventName: string | null;
	priority: string;
	status: string;
	progress: number;
	startDate: string | null;
	deadline: string | null;
	createdAt: string;
	assigneeName: string | null;
}

export interface DetailedTasksReport {
	filters: DetailedReportFilters;
	totalCount: number;
	rows: DetailedTaskReportRow[];
}

export interface SummaryDepartmentRow {
	departmentId: string;
	departmentName: string;
	departmentStatus: string;
	totalTasks: number;
	createdTasks: number;
	activeTasks: number;
	completedTasks: number;
	avgProgress: number;
}

export interface SummaryReport {
	filters: {
		startDate: string | null;
		endDate: string | null;
	};
	departments: SummaryDepartmentRow[];
	totals: {
		totalTasks: number;
		createdTasks: number;
		activeTasks: number;
		completedTasks: number;
	};
	exclusions: {
		excludedArchivedTasks: number;
		excludedDraftProjects: number;
		excludedDraftEvents: number;
	};
}

export interface ExceptionOverdueTask {
	id: string;
	title: string;
	departmentId: string;
	departmentName: string;
	priority: string;
	status: string;
	deadline: string;
	assigneeName: string | null;
}

export interface ExceptionUnassignedTask {
	id: string;
	title: string;
	departmentId: string;
	departmentName: string;
	priority: string;
	deadline: string | null;
	createdAt: string;
}

export interface ExceptionEventIssue {
	id: string;
	eventId: string;
	eventName: string;
	title: string;
	severity: string;
	status: string;
	dueAt: string | null;
}

export interface ExceptionReport {
	asOfDate: string;
	rules: {
		overdue: string;
		unassignedPriority: string;
		unresolvedHighEventIssues: string;
	};
	overdueTasks: ExceptionOverdueTask[];
	unassignedPriorityTasks: ExceptionUnassignedTask[];
	unresolvedHighEventIssues: ExceptionEventIssue[];
}

export interface DataMartMonthlyRow {
	monthKey: string;
	monthLabel: string;
	year: number;
	month: number;
	quarter: number;
	departmentKey: string;
	departmentName: string;
	activeTaskCount: number;
	completedTaskCount: number;
	overdueTaskCount: number;
	avgProgress: number;
	loadedAt: string;
}

export interface DataMartEtlRun {
	id: string;
	startedAt: string;
	completedAt: string;
	triggeredBy: string;
	triggeredByName: string | null;
	sourceTaskCount: number;
	martTaskCount: number;
	reconciled: boolean;
}

export interface DataMartReconciliationMonth {
	monthKey: string;
	oltpCount: number;
	martCount: number;
	matches: boolean;
}

export interface DataMartReport {
	latestRun: DataMartEtlRun | null;
	monthlyRows: DataMartMonthlyRow[];
	reconciliation: {
		oltpNonArchivedTaskCount: number;
		martTotalTaskCount: number;
		excludedArchivedTaskCount: number;
		dimensionsSynced: boolean;
		reconciled: boolean;
		byMonth: DataMartReconciliationMonth[];
	};
}
