export type RequestType =
| "Task Request"
| "Assistance Request"
| "Resource Request";

export type RequestStatus =
| "Pending"
| "Approved"
| "Converted"
| "Rejected";

export interface RequestPermissions {
canApprove: boolean;
canReject: boolean;
canConvert: boolean;
canWithdraw: boolean;
canArchive: boolean;
canRestore: boolean;
}

export interface RequestDto {
id: string;
title: string;
description: string | null;
type: RequestType;

requesterDepartmentId: string;
requesterDepartmentName: string;

receiverDepartmentId: string;
receiverDepartmentName: string;

requestedBy: string;
requestedByName: string;
requestedByEmail: string;

status: RequestStatus;
createdAt: string;

approvedBy: string | null;
approvedByName: string | null;
approvedAt: string | null;

rejectedBy: string | null;
rejectedByName: string | null;
rejectedAt: string | null;
rejectionRemarks: string | null;

isWithdrawn: boolean;
withdrawnAt: string | null;
withdrawnBy: string | null;

isArchived: boolean;
archivedAt: string | null;
archivedBy: string | null;
archivedByName: string | null;

convertedTaskId: string | null;

permissions: RequestPermissions;
}