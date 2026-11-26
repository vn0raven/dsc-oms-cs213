import type { UserRole } from "./user";

export type TaskPriority =
| "Critical"
| "High"
| "Medium"
| "Low";

export type TaskStatus =
| "Created"
| "Assigned"
| "Ongoing"
| "For Review"
| "Approved"
| "Completed"
| "Archived";

export interface TaskAssignee {
userId: string;
name: string;
position: string | null;
role: UserRole;
departmentId: string;
departmentName: string;
}

export interface TaskPermissions {
canStart: boolean;
canSubmit: boolean;
canReview: boolean;
canEdit: boolean;
canAssign: boolean;
canUnassign: boolean;
canArchive: boolean;
canRestore: boolean;
}

export interface TaskDto {
eventId: string | null;
eventName: string | null;
eventTeamId: string | null;
eventTeamName: string | null;
id: string;
title: string;
description: string | null;

departmentId: string;
departmentName: string;

projectId: string | null;
projectName: string | null;

createdBy: string;

priority: TaskPriority;

startDate: string | null;
deadline: string | null;

status: TaskStatus;
progress: number;

instructions: string | null;
notes: string | null;
evidence: string | null;

submittedAt: string | null;

reviewedBy: string | null;
reviewNotes: string | null;

completedAt: string | null;

createdAt: string;
updatedAt: string;
archivedAt: string | null;

sourceRequestId: string | null;

assigneeUserId: string | null;
assignee: TaskAssignee | null;

permissions: TaskPermissions;
}

