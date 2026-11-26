import {
api,
} from "./api.js";

let currentUser = null;

export async function loadCurrentUser() {
const response =
await api.get(
"/api/auth/me"
);

currentUser =
response.user ||
response;

return currentUser;
}

export function getCurrentUser() {
return currentUser;
}

export function isLeadership() {
return (
currentUser?.role === "Lead" ||
currentUser?.role === "Co-Lead"
);
}

export function canViewReports() {
return isLeadership();
}
