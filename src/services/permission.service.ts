import type {
AuthenticatedUser,
UserRole,
} from "../types/user";

export type Permission =
| "directory.view"
| "departments.view"
| "departments.manage"
| "users.view"
| "users.create"
| "users.update"
| "users.change_role"
| "users.deactivate"
| "projects.create.organization"
| "projects.create.department"
| "projects.delete"
| "reports.view";

const permissions: Record<
Permission,
UserRole[]
> = {
"directory.view": [
"Lead",
"Co-Lead",
"Executive",
"Member",
],

"departments.view": [
"Lead",
"Co-Lead",
"Executive",
"Member",
],

"departments.manage": [
"Lead",
],

"users.view": [
"Lead",
"Co-Lead",
"Executive",
"Member",
],

"users.create": [
"Lead",
"Co-Lead",
],

"users.update": [
"Lead",
"Co-Lead",
],

"users.change_role": [
"Lead",
],

"users.deactivate": [
"Lead",
],

"projects.create.organization": [
"Lead",
"Co-Lead",
],

"projects.create.department": [
"Lead",
"Co-Lead",
"Executive",
],

"projects.delete": [
"Lead",
"Co-Lead",
],

"reports.view": [
"Lead",
"Co-Lead",
],
};

export function hasPermission(
user: AuthenticatedUser,
permission: Permission
): boolean {
return permissions[permission].includes(
user.role
);
}
