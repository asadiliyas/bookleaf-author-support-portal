import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];

export type TicketStatus = Enums["ticket_status"];
export type TicketCategory = Enums["ticket_category"];
export type TicketPriority = Enums["ticket_priority"];
export type ClassificationSource = Enums["classification_source"];
export type AiStatus = Enums["ai_status"];
export type ProductionStage = Enums["production_stage"];
export type MessageSender = Enums["message_sender"];
export type Role = "author" | "admin";

// ---------------------------------------------------------------------------
// Ticket status
// ---------------------------------------------------------------------------
export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const satisfies readonly TicketStatus[];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

/** Statuses that still need work from the ops team. */
export const UNRESOLVED_STATUSES: TicketStatus[] = ["open", "in_progress"];

/**
 * Allowed manual status changes. Closed is terminal for authors; admins may
 * reopen a closed ticket if it was closed by mistake.
 */
export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: ["in_progress"],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Categories (the six categories from the brief)
// ---------------------------------------------------------------------------
export const TICKET_CATEGORIES = [
  "royalty_payments",
  "isbn_metadata",
  "printing_quality",
  "distribution_availability",
  "book_status_production",
  "general_inquiry",
] as const satisfies readonly TicketCategory[];

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  royalty_payments: "Royalty & Payments",
  isbn_metadata: "ISBN & Metadata Issues",
  printing_quality: "Printing & Quality",
  distribution_availability: "Distribution & Availability",
  book_status_production: "Book Status & Production Updates",
  general_inquiry: "General Inquiry",
};

export const CATEGORY_SHORT_LABELS: Record<TicketCategory, string> = {
  royalty_payments: "Royalty",
  isbn_metadata: "ISBN",
  printing_quality: "Printing",
  distribution_availability: "Distribution",
  book_status_production: "Production",
  general_inquiry: "General",
};

// ---------------------------------------------------------------------------
// Priority + first-response SLA targets
// ---------------------------------------------------------------------------
export const TICKET_PRIORITIES = ["critical", "high", "medium", "low"] as const satisfies readonly TicketPriority[];

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Lower number = more urgent. Used for sorting the queue. */
export const PRIORITY_RANK: Record<TicketPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Target time to first response, in hours. */
export const FIRST_RESPONSE_SLA_HOURS: Record<TicketPriority, number> = {
  critical: 4,
  high: 24,
  medium: 48,
  low: 72,
};

// ---------------------------------------------------------------------------
// Production stages (from the knowledge base, in order)
// ---------------------------------------------------------------------------
export const PRODUCTION_STAGES = [
  "manuscript_received",
  "editing",
  "cover_design",
  "typesetting",
  "proofreading",
  "isbn_assignment",
  "printing",
  "distribution_setup",
  "published_live",
] as const satisfies readonly ProductionStage[];

export const STAGE_LABELS: Record<ProductionStage, string> = {
  manuscript_received: "Manuscript Received",
  editing: "Editing",
  cover_design: "Cover Design",
  typesetting: "Typesetting",
  proofreading: "Proofreading",
  isbn_assignment: "ISBN Assignment",
  printing: "Printing",
  distribution_setup: "Distribution Setup",
  published_live: "Published & Live",
};

export function stageIndex(stage: ProductionStage): number {
  return PRODUCTION_STAGES.indexOf(stage);
}

/** Matches the dataset's status strings, e.g. "In Production - Cover Design". */
export function bookStatusLabel(stage: ProductionStage): string {
  return stage === "published_live" ? STAGE_LABELS.published_live : `In Production - ${STAGE_LABELS[stage]}`;
}

/** Parses a dataset status string back into a stage. */
export function parseBookStatus(status: string): ProductionStage {
  const normalized = status.trim().toLowerCase();
  if (normalized === "published & live") return "published_live";
  const stageName = normalized.replace(/^in production\s*-\s*/, "");
  const match = PRODUCTION_STAGES.find((s) => STAGE_LABELS[s].toLowerCase() === stageName);
  if (!match) throw new Error(`Unknown book status: "${status}"`);
  return match;
}

// ---------------------------------------------------------------------------
// Policy constants from the knowledge base
// ---------------------------------------------------------------------------
export const ROYALTY_MIN_PAYOUT_INR = 1000;
export const ROYALTY_PAYOUT_WINDOW_DAYS = 45;
export const DISTRIBUTION_PLATFORMS = [
  "Amazon India",
  "Flipkart",
  "Amazon US",
  "Amazon UK",
  "BookLeaf Store",
] as const;

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------
export const ATTACHMENT_MAX_FILES = 3;
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
