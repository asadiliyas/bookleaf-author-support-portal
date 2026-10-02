/**
 * Request schemas shared by the browser (form validation) and the API
 * (request validation + OpenAPI generation). One definition, three uses.
 */
import { z } from "zod";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "./domain/constants";

export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketCategorySchema = z.enum(TICKET_CATEGORIES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

export const loginSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(1, "Password is required").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createTicketSchema = z.object({
  /** null = "General / Account Level" */
  bookId: z
    .string()
    .regex(/^BK\d{3,}$/, "Unknown book")
    .nullable(),
  subject: z
    .string()
    .trim()
    .min(5, "Subject should be at least 5 characters")
    .max(150, "Subject should be at most 150 characters"),
  description: z
    .string()
    .trim()
    .min(20, "Please describe the issue in at least 20 characters")
    .max(5000, "Description should be at most 5,000 characters"),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/** Accepts "a,b,c" in a query string and validates each value against an enum. */
const csvOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

export const listTicketsQuerySchema = z.object({
  status: csvOf(TICKET_STATUSES).optional(),
  category: csvOf(TICKET_CATEGORIES).optional(),
  priority: csvOf(TICKET_PRIORITIES).optional(),
  /** "me", "unassigned" or an admin user id (admin only) */
  assignee: z.union([z.literal("me"), z.literal("unassigned"), z.uuid()]).optional(),
  /** Created on/after this date (YYYY-MM-DD) */
  from: z.iso.date().optional(),
  /** Created on/before this date (YYYY-MM-DD) */
  to: z.iso.date().optional(),
  /** Free-text search on subject (and ticket number, e.g. "1042") */
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["queue", "newest", "oldest", "updated"]).default("queue"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const updateTicketSchema = z
  .object({
    status: ticketStatusSchema.optional(),
    category: ticketCategorySchema.optional(),
    priority: ticketPrioritySchema.optional(),
    /** Admin user id, or null to unassign */
    assigneeId: z.uuid().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one of: status, category, priority, assigneeId",
  });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const createMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(10000),
  /** Admin only: the AI draft this reply started from (for draft-acceptance metrics). */
  aiDraftId: z.uuid().optional(),
  /** Admin only: status to set together with the reply, e.g. "resolved". */
  statusAfter: ticketStatusSchema.optional(),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty").max(5000),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const generateDraftSchema = z.object({
  /** Ignore the cached draft and generate a new one. */
  regenerate: z.boolean().default(false),
});
export type GenerateDraftInput = z.infer<typeof generateDraftSchema>;
