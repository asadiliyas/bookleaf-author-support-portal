import type { PostgrestSingleResponse } from "@supabase/supabase-js";

/**
 * Typed application errors. Services throw these; the route wrapper turns them
 * into consistent JSON (`{ error: { code, message, details } }`) with the right
 * HTTP status, so clients never see a generic 500 for an expected failure.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: AppError["details"]) =>
  new AppError(400, "BAD_REQUEST", message, details);

export const validationError = (message: string, details?: AppError["details"]) =>
  new AppError(422, "VALIDATION_ERROR", message, details);

export const unauthorized = (message = "Sign in to continue.") => new AppError(401, "UNAUTHENTICATED", message);

export const forbidden = (message = "You don't have access to this resource.") =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (resource: string) => new AppError(404, "NOT_FOUND", `${resource} not found.`);

export const conflict = (message: string) => new AppError(409, "CONFLICT", message);

export const tooManyRequests = (message: string) => new AppError(429, "RATE_LIMITED", message);

export const serviceUnavailable = (message: string) => new AppError(503, "SERVICE_UNAVAILABLE", message);

/** Wraps an unexpected database error so it is logged and reported uniformly. */
export class DatabaseError extends Error {
  constructor(
    public readonly operation: string,
    public readonly cause: { code?: string; message: string; details?: string | null; hint?: string | null },
  ) {
    super(`${operation}: ${cause.message}`);
    this.name = "DatabaseError";
  }
}

/** Throws a DatabaseError when a Supabase call returned an error, otherwise returns its data. */
export function check<T>(result: PostgrestSingleResponse<T>, operation: string): T {
  if (result.error) throw new DatabaseError(operation, result.error);
  return result.data;
}
