export type ApiErrorStatus =
| 400
| 401
| 403
| 404
| 409;

export class ApiError extends Error {
constructor(
public readonly status: ApiErrorStatus,
public readonly code: string,
message: string
) {
super(message);
this.name = "ApiError";
}
}
