import type { RequestDto } from "./request";
import type { TaskDto } from "./task";

export interface DashboardSummary {
projects: {
total: number;
active: number;
archived: number;
};

tasks: {
total: number;
created: number;
assigned: number;
ongoing: number;
forReview: number;
completed: number;
archived: number;
};

requests: {
total: number;
pending: number;
approved: number;
converted: number;
rejected: number;
archived: number;
};

unreadNotifications: number;
}

export interface DashboardProject {
id: string;
name: string;
type: string;
status: string;
progress: number;
taskCount: number;
completedTaskCount: number;
ongoingTaskCount: number;
forReviewTaskCount: number;
}

export interface DashboardDto {
scope: {
role: string;
departmentId: string;
departmentName: string;
};

summary: DashboardSummary;

projects: DashboardProject[];

recentTasks: TaskDto[];

recentRequests: RequestDto[];
}
