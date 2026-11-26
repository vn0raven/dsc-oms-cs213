export type EventStatus = 'Draft'|'For Approval'|'Approved'|'Team Formation'|'Planning'|'Preparation'|'Ready for Event'|'Ongoing'|'Post-Event'|'For Closure'|'Completed'|'Rejected'|'Cancelled';
export type EventRole = 'Event Director'|'Event Co-Director'|'Team Head'|'Team Co-Head'|'Team Member';
export type AppointmentStatus = 'Proposed'|'Accepted'|'Declined'|'Ended';
export interface EventPermissions {canEdit:boolean;canSubmit:boolean;canApprove:boolean;canAdvance:boolean;canManageTeams:boolean;canProposeAppointment:boolean;canLinkTasks:boolean;canCreateEventTask:boolean;canCreateTeamTask:boolean;creatableTeamIds:string[];canClose:boolean}
export interface EventDto {
 id:string; name:string; description:string|null; objectives:string|null;eventType:string; venue:string|null;
 startsAt:string|null; endsAt:string|null; expectedAttendance:number|null; proposedBudget:number|null;
 projectId:string|null; projectName:string|null; proposedDirectorId:string|null;
 createdBy:string;status:EventStatus;createdAt:string;updatedAt:string;permissions:EventPermissions;
}
