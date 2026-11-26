export type NotificationStatus =
| "Unread"
| "Read";

export interface NotificationDto {
id: string;
type: string;
title: string;
message: string;

referenceType: string | null;
referenceId: string | null;

status: NotificationStatus;

createdAt: string;
readAt: string | null;
}
