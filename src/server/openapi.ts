import "server-only";
import { z } from "zod";
import { PRODUCTION_STAGES, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/domain/constants";
import {
  createMessageSchema,
  createNoteSchema,
  createTicketSchema,
  generateDraftSchema,
  loginSchema,
  updateTicketSchema,
} from "@/lib/schemas";

/**
 * OpenAPI 3.1 document. Request bodies are generated from the same Zod schemas
 * the API validates with, so the docs cannot drift from the implementation.
 * Served at /api/v1/openapi.json and rendered at /api-docs.
 */
const body = (schema: z.ZodType) => ({
  required: true,
  content: { "application/json": { schema: z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) } },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (description: string, schema: object, status = "200") => ({
  [status]: { description, content: { "application/json": { schema } } },
});
const errors = (...codes: number[]) =>
  Object.fromEntries(
    codes.map((c) => [
      String(c),
      { $ref: `#/components/responses/${{ 400: "BadRequest", 401: "Unauthorized", 403: "Forbidden", 404: "NotFound", 409: "Conflict", 422: "ValidationError", 429: "RateLimited" }[c]}` },
    ]),
  );
const ticketIdParam = { name: "ticketId", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const paginated = (item: string) => ({
  type: "object",
  properties: { items: { type: "array", items: ref(item) }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" } },
});
const list = (item: string) => ({ type: "object", properties: { items: { type: "array", items: ref(item) } } });

export function buildOpenApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "BookLeaf Author Support API",
      version: "1.0.0",
      description:
        "REST API behind the BookLeaf Author Support & Communication Portal.\n\n" +
        "**Auth:** call `POST /auth/login`. Browsers get a session cookie; API clients use the returned `accessToken` as `Authorization: Bearer <token>` (click *Authorize*).\n\n" +
        "**Roles:** authors only ever see their own books and tickets (enforced in the service layer *and* by Postgres row-level security); admins see everything.\n\n" +
        "**Errors:** every error is `{ error: { code, message, details?, requestId } }` with a meaningful status code.",
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    tags: [
      { name: "Auth" },
      { name: "Books", description: "Author catalogue and royalty status" },
      { name: "Tickets", description: "Ticket lifecycle shared by authors and admins" },
      { name: "AI", description: "Classification and response drafting (admin)" },
      { name: "Admin", description: "Queue metrics and team" },
    ],
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    paths: {
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Sign in with email and password",
          security: [],
          requestBody: body(loginSchema),
          responses: { ...ok("Signed in", ref("Session")), ...errors(400, 401, 422, 429) },
        },
      },
      "/auth/logout": {
        post: { tags: ["Auth"], summary: "Sign out", responses: { "204": { description: "Signed out" }, ...errors(401) } },
      },
      "/auth/me": {
        get: { tags: ["Auth"], summary: "Current user", responses: { ...ok("Current user", ref("Me")), ...errors(401) } },
      },
      "/me/books": {
        get: {
          tags: ["Books"],
          summary: "My books with totals and royalty status (author)",
          responses: { ...ok("Portfolio", ref("BookPortfolio")), ...errors(401, 403) },
        },
      },
      "/books/{bookId}": {
        get: {
          tags: ["Books"],
          summary: "Get a book (authors: own books only)",
          parameters: [{ name: "bookId", in: "path", required: true, schema: { type: "string", example: "BK005" } }],
          responses: { ...ok("Book", ref("Book")), ...errors(401, 404) },
        },
      },
      "/tickets": {
        get: {
          tags: ["Tickets"],
          summary: "List tickets (authors: own; admins: queue with filters)",
          description: "Default `sort=queue`: unresolved first, then Critical → Low, then oldest first.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" }, description: `Comma-separated: ${TICKET_STATUSES.join(", ")}` },
            { name: "category", in: "query", schema: { type: "string" }, description: `Comma-separated: ${TICKET_CATEGORIES.join(", ")}` },
            { name: "priority", in: "query", schema: { type: "string" }, description: `Comma-separated: ${TICKET_PRIORITIES.join(", ")}` },
            { name: "assignee", in: "query", schema: { type: "string" }, description: "Admin only: `me`, `unassigned` or an admin id" },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
            { name: "q", in: "query", schema: { type: "string" }, description: "Search subject or ticket number" },
            { name: "sort", in: "query", schema: { type: "string", enum: ["queue", "newest", "oldest", "updated"], default: "queue" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", default: 25, maximum: 100 } },
          ],
          responses: { ...ok("Tickets", paginated("TicketSummary")), ...errors(401, 422) },
        },
        post: {
          tags: ["Tickets"],
          summary: "Raise a ticket (author)",
          description:
            "Created instantly with a rule-based category/priority; Gemini re-classifies in the background and the change is pushed over realtime. `bookId: null` means General / Account Level. Limited to 10 tickets per author per hour.",
          requestBody: body(createTicketSchema),
          responses: { ...ok("Created", ref("TicketDetail"), "201"), ...errors(400, 401, 403, 422, 429) },
        },
      },
      "/tickets/{ticketId}": {
        get: {
          tags: ["Tickets"],
          summary: "Get a ticket with its conversation",
          description: "Admins additionally receive `ai` (raw AI classification) and `notes` (internal). Other authors' tickets return 404.",
          parameters: [ticketIdParam],
          responses: { ...ok("Ticket", ref("TicketDetail")), ...errors(401, 404) },
        },
        patch: {
          tags: ["Tickets"],
          summary: "Update status / override category or priority / assign (admin)",
          description: "Overrides are recorded with source `admin` and never overwritten by the AI. Invalid status transitions return 409.",
          parameters: [ticketIdParam],
          requestBody: body(updateTicketSchema),
          responses: { ...ok("Updated ticket", ref("TicketDetail")), ...errors(401, 403, 404, 409, 422) },
        },
      },
      "/tickets/{ticketId}/messages": {
        get: {
          tags: ["Tickets"],
          summary: "List messages",
          parameters: [ticketIdParam],
          responses: { ...ok("Messages", list("TicketMessage")), ...errors(401, 404) },
        },
        post: {
          tags: ["Tickets"],
          summary: "Reply (author follow-up or admin response)",
          description:
            "Author replies reopen Resolved tickets. The first admin reply sets the first-response time and moves Open → In Progress unless `statusAfter` says otherwise. `aiDraftId` and `statusAfter` are admin-only. Closed tickets return 409.",
          parameters: [ticketIdParam],
          requestBody: body(createMessageSchema),
          responses: { ...ok("Created", ref("TicketMessage"), "201"), ...errors(401, 403, 404, 409, 422) },
        },
      },
      "/tickets/{ticketId}/notes": {
        get: { tags: ["Tickets"], summary: "Internal notes (admin)", parameters: [ticketIdParam], responses: { ...ok("Notes", list("InternalNote")), ...errors(401, 403, 404) } },
        post: {
          tags: ["Tickets"],
          summary: "Add an internal note (admin)",
          parameters: [ticketIdParam],
          requestBody: body(createNoteSchema),
          responses: { ...ok("Created", ref("InternalNote"), "201"), ...errors(401, 403, 404, 422) },
        },
      },
      "/tickets/{ticketId}/events": {
        get: { tags: ["Tickets"], summary: "Activity timeline (admin)", parameters: [ticketIdParam], responses: { ...ok("Events", list("TicketEvent")), ...errors(401, 403, 404) } },
      },
      "/tickets/{ticketId}/attachments": {
        get: { tags: ["Tickets"], summary: "List attachments (signed URLs, 10 min)", parameters: [ticketIdParam], responses: { ...ok("Attachments", list("TicketAttachment")), ...errors(401, 404) } },
        post: {
          tags: ["Tickets"],
          summary: "Upload attachments (author; PNG/JPEG/WebP/PDF, ≤ 5 MB, ≤ 3 per ticket)",
          parameters: [ticketIdParam],
          requestBody: {
            required: true,
            content: { "multipart/form-data": { schema: { type: "object", properties: { files: { type: "array", items: { type: "string", format: "binary" } } } } } },
          },
          responses: { ...ok("Uploaded", list("TicketAttachment"), "201"), ...errors(400, 401, 403, 404, 409, 422) },
        },
      },
      "/tickets/{ticketId}/context": {
        get: { tags: ["AI"], summary: "Author & book facts shown beside the draft (admin)", parameters: [ticketIdParam], responses: { ...ok("Context", { type: "object" }), ...errors(401, 403, 404) } },
      },
      "/tickets/{ticketId}/classification": {
        post: { tags: ["AI"], summary: "Re-run AI classification (admin)", parameters: [ticketIdParam], responses: { ...ok("Ticket after classification", ref("TicketDetail")), ...errors(401, 403, 404) } },
      },
      "/tickets/{ticketId}/draft": {
        get: { tags: ["AI"], summary: "Cached AI draft for the current context (no AI call)", parameters: [ticketIdParam], responses: { ...ok("Draft or null", ref("DraftResponse")), ...errors(401, 403, 404) } },
        post: {
          tags: ["AI"],
          summary: "Get or generate an AI-drafted reply (admin)",
          description:
            "Returns the cached draft if the ticket context is unchanged (no token spend) unless `regenerate: true`. When the AI is down or rate-limited this still returns 200 with `draft: null` and a `degraded` reason; the admin writes the reply manually.",
          parameters: [ticketIdParam],
          requestBody: body(generateDraftSchema),
          responses: { ...ok("Draft", ref("DraftResponse")), ...errors(401, 403, 404, 409) },
        },
      },
      "/admin/stats": {
        get: { tags: ["Admin"], summary: "Queue counters", responses: { ...ok("Stats", { type: "object" }), ...errors(401, 403) } },
      },
      "/admin/ai-usage": {
        get: {
          tags: ["Admin"],
          summary: "AI usage: calls, tokens, estimated cost, override rate, draft acceptance",
          parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 30 } }],
          responses: { ...ok("Usage", { type: "object" }), ...errors(401, 403) },
        },
      },
      "/admins": {
        get: { tags: ["Admin"], summary: "Ops team members", responses: { ...ok("Admins", { type: "object" }), ...errors(401, 403) } },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        cookieAuth: { type: "apiKey", in: "cookie", name: "sb-<project>-auth-token" },
      },
      responses: {
        BadRequest: errorResponse("Malformed request (e.g. invalid JSON)"),
        Unauthorized: errorResponse("Missing or expired session"),
        Forbidden: errorResponse("Authenticated but not allowed (wrong role)"),
        NotFound: errorResponse("Resource does not exist or is not yours"),
        Conflict: errorResponse("Not allowed in the current state (e.g. replying to a closed ticket)"),
        ValidationError: errorResponse("Input failed validation; see `details`"),
        RateLimited: errorResponse("Too many requests"),
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "VALIDATION_ERROR" },
                message: { type: "string" },
                details: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } },
                requestId: { type: "string" },
              },
              required: ["code", "message"],
            },
          },
        },
        Me: {
          type: "object",
          properties: {
            userId: { type: "string" },
            role: { enum: ["author", "admin"] },
            name: { type: "string" },
            email: { type: "string" },
            authorId: { type: ["string", "null"] },
          },
        },
        Session: { type: "object", properties: { user: ref("Me"), accessToken: { type: "string" }, expiresAt: { type: ["integer", "null"] } } },
        Book: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            isbn: { type: "string" },
            genre: { type: "string" },
            stage: { enum: [...PRODUCTION_STAGES] },
            statusLabel: { type: "string", example: "Published & Live" },
            isPublished: { type: "boolean" },
            publicationDate: { type: ["string", "null"], format: "date" },
            mrp: { type: ["number", "null"] },
            royaltyPerCopy: { type: ["number", "null"] },
            copiesSold: { type: "integer" },
            royaltyEarned: { type: "number" },
            royaltyPaid: { type: "number" },
            royaltyPending: { type: "number" },
            lastPayoutDate: { type: ["string", "null"], format: "date" },
            printPartner: { type: ["string", "null"] },
            availableOn: { type: "array", items: { type: "string" } },
            royalty: {
              type: "object",
              properties: {
                state: { enum: ["not_published", "no_earnings", "paid_up", "below_threshold", "scheduled", "likely_overdue"] },
                summary: { type: "string" },
                meetsThreshold: { type: "boolean" },
                upcomingCycle: { type: "string", example: "Q3 2026" },
                upcomingDeadline: { type: "string", format: "date" },
              },
            },
          },
        },
        BookPortfolio: {
          type: "object",
          properties: {
            books: { type: "array", items: ref("Book") },
            totals: { type: "object" },
            nextPayout: { type: "object", properties: { cycle: { type: "string" }, deadline: { type: "string", format: "date" } } },
          },
        },
        TicketSummary: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            number: { type: "integer", example: 1004 },
            subject: { type: "string" },
            status: { enum: [...TICKET_STATUSES] },
            category: { enum: [...TICKET_CATEGORIES] },
            priority: { enum: [...TICKET_PRIORITIES] },
            categorySource: { enum: ["ai", "fallback", "admin"] },
            prioritySource: { enum: ["ai", "fallback", "admin"] },
            aiStatus: { enum: ["pending", "completed", "failed"] },
            book: { type: ["object", "null"], properties: { id: { type: "string" }, title: { type: "string" } } },
            author: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
            assignee: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" } } },
            firstResponseAt: { type: ["string", "null"], format: "date-time" },
            lastActivityAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        TicketDetail: {
          allOf: [
            ref("TicketSummary"),
            {
              type: "object",
              properties: {
                description: { type: "string" },
                resolvedAt: { type: ["string", "null"] },
                closedAt: { type: ["string", "null"] },
                messages: { type: "array", items: ref("TicketMessage") },
                attachments: { type: "array", items: ref("TicketAttachment") },
                ai: { type: "object", description: "Admin only", properties: { status: { type: "string" }, category: { type: ["string", "null"] }, priority: { type: ["string", "null"] }, confidence: { type: ["number", "null"] }, rationale: { type: ["string", "null"] } } },
                notes: { type: "array", description: "Admin only", items: ref("InternalNote") },
              },
            },
          ],
        },
        TicketMessage: {
          type: "object",
          properties: { id: { type: "string" }, senderRole: { enum: ["author", "admin"] }, senderName: { type: "string" }, body: { type: "string" }, createdAt: { type: "string", format: "date-time" } },
        },
        TicketAttachment: {
          type: "object",
          properties: { id: { type: "string" }, fileName: { type: "string" }, mimeType: { type: "string" }, sizeBytes: { type: "integer" }, url: { type: ["string", "null"] }, createdAt: { type: "string" } },
        },
        InternalNote: { type: "object", properties: { id: { type: "string" }, adminName: { type: "string" }, body: { type: "string" }, createdAt: { type: "string" } } },
        TicketEvent: { type: "object", properties: { id: { type: "string" }, type: { type: "string" }, actorLabel: { type: "string" }, payload: { type: "object" }, createdAt: { type: "string" } } },
        DraftResponse: {
          type: "object",
          properties: {
            draft: {
              type: ["object", "null"],
              properties: {
                id: { type: "string" },
                reply: { type: "string" },
                suggestedStatus: { type: ["string", "null"] },
                escalation: { type: ["object", "null"], properties: { required: { type: "boolean" }, team: { type: ["string", "null"] }, reason: { type: ["string", "null"] } } },
                adminChecklist: { type: "array", items: { type: "string" } },
                model: { type: "string" },
                promptVersion: { type: "string" },
                cached: { type: "boolean" },
                createdAt: { type: "string" },
              },
            },
            degraded: { type: ["object", "null"], properties: { reason: { type: "string" }, message: { type: "string" } } },
          },
        },
      },
    },
  };
}

function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ref("Error") } } };
}
