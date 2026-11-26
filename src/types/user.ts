export type UserRole =
| "Lead"
| "Co-Lead"
| "Executive"
| "Member";

export type UserStatus =
| "Active"
| "Inactive";

export interface AuthenticatedUser {
id: string;
name: string;
email: string;
position: string | null;
role: UserRole;
status: UserStatus;

messengerUrl: string | null;
facebookUrl: string | null;
contactNumber: string | null;

department: {
id: string;
name: string;
};
}
