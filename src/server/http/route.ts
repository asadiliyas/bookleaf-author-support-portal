import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { ApiErrorBody } from "@/lib/api-types";
import type { Role } from "@/lib/domain/constants";
import { requireAuth, type Actor } from "../auth/actor";
import type { Db } from "../db/clients";
import { AppError, DatabaseError, badRequest, validationError } from "./errors";

export interface RouteContext<P> {
  req: NextRequest;
  params: P;
  actor: Actor;
  /** Request-scoped, RLS-enforced client. */
  db: Db;
  requestId: string;
}

interface RouteOptions {
  /** Roles allowed to call this endpoint. Every route is authenticated. */
  roles: readonly Role[];
}

type NextRouteContext = { params: Promise<Record<string, string | string[]>> };

/**
 * Wraps a Route Handler with authentication, role checks and uniform error
 * handling. Handlers stay thin: parse input, call a service, return JSON.
 */
export function route<P extends Record<string, string> = Record<string, never>>(
  options: RouteOptions,
  handler: (ctx: RouteContext<P>) => Promise<Response>,
) {
  return async (req: NextRequest, context: NextRouteContext): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      const { actor, db } = await requireAuth(req, options.roles);
      const params = ((await context?.params) ?? {}) as P;
      const response = await handler({ req, params, actor, db, requestId });
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

/** Same error handling for the few unauthenticated endpoints (login, docs). */
export function publicRoute(handler: (req: NextRequest, requestId: string) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      return await handler(req, requestId);
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

export function json<T>(data: T, init?: { status?: number; headers?: Record<string, string> }): Response {
  return Response.json(data, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "private, no-store", ...init?.headers },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}

export function errorResponse(err: unknown, requestId: string): Response {
  const body = (status: number, error: Omit<ApiErrorBody["error"], "requestId">) =>
    json<ApiErrorBody>({ error: { ...error, requestId } }, { status, headers: { "x-request-id": requestId } });

  if (err instanceof AppError) {
    return body(err.status, { code: err.code, message: err.message, details: err.details });
  }
  if (err instanceof z.ZodError) {
    const e = zodToAppError(err);
    return body(e.status, { code: e.code, message: e.message, details: e.details });
  }
  if (err instanceof DatabaseError) {
    const mapped = mapDatabaseError(err);
    if (mapped) return body(mapped.status, { code: mapped.code, message: mapped.message });
    console.error(`[${requestId}] database error`, err.operation, err.cause);
  } else {
    console.error(`[${requestId}] unhandled error`, err);
  }
  return body(500, {
    code: "INTERNAL_ERROR",
    message: "Something went wrong on our side. Please try again; if it keeps happening, quote the request id.",
  });
}

function mapDatabaseError(err: DatabaseError): AppError | null {
  switch (err.cause.code) {
    case "23505":
      return new AppError(409, "CONFLICT", "This record already exists.");
    case "23503":
      return new AppError(422, "INVALID_REFERENCE", "A referenced record does not exist.");
    case "23514":
      return new AppError(422, "CONSTRAINT_VIOLATION", "The data does not satisfy a validation rule.");
    case "22P02":
      return new AppError(400, "BAD_REQUEST", "Malformed identifier.");
    default:
      return null;
  }
}

export function zodToAppError(err: z.ZodError): AppError {
  const details = err.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message }));
  return validationError(details[0]?.message ?? "Invalid request.", details);
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw zodToAppError(result.error);
  return result.data;
}

export function parseQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.output<S> {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) throw zodToAppError(result.error);
  return result.data;
}

const uuidSchema = z.uuid();

/** Validates a UUID path parameter; malformed ids are a 404, not a 500. */
export function parseId(value: string | undefined, resource: string): string {
  if (!value || !uuidSchema.safeParse(value).success) {
    throw new AppError(404, "NOT_FOUND", `${resource} not found.`);
  }
  return value;
}
