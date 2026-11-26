import type { UserRole } from "./user";

export type ProjectType =
| "Organization"
| "Department";

export type ProjectStatus =
| "Draft"
| "Active"
| "Completed"
| "Archived";

export type ProjectRole =
| "Manager"
| "Member";

export interface ProjectTeamMember {
id: string;
userId: string;
name: string;
email: string;
departmentId: string;
departmentName: string;
position: string | null;
organizationRole: UserRole;
projectRole: ProjectRole;
status: "Active" | "Removed";
assignedBy: string;
assignedAt: string;
}

export interface ProjectPermissions {
canEdit: boolean;
canManageTeam: boolean;
canAddTask: boolean;
canArchive: boolean;
canRestore: boolean;
canDelete: boolean;
canChangeType: boolean;
}

export interface ProjectDto {
id: string;
name: string;
type: ProjectType;
description: string | null;
status: ProjectStatus;
startDate: string | null;
endDate: string | null;
createdBy: string;
createdAt: string;
updatedAt: string;

departmentIds: string[];
departmentNames: string[];

manager: ProjectTeamMember | null;
team: ProjectTeamMember[];
teamCount: number;

taskCount: number;
completedTaskCount: number;
ongoingTaskCount: number;
forReviewTaskCount: number;
archivedTaskCount: number;
progress: number;

permissions: ProjectPermissions;
}
