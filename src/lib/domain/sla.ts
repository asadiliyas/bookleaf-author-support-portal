import { FIRST_RESPONSE_SLA_HOURS, PRIORITY_RANK, type TicketPriority, type TicketStatus } from "./constants";

const HOUR_MS = 60 * 60 * 1000;

export type SlaState = "responded" | "on_track" | "at_risk" | "breached" | "not_applicable";

export interface SlaInfo {
  state: SlaState;
  targetHours: number;
  dueAt: Date;
  /** Negative when overdue. */
  remainingMs: number;
}

/**
 * First-response SLA for a ticket. "At risk" once 75% of the window is used,
 * so the queue can surface tickets before they breach.
 */
export function firstResponseSla(input: {
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  firstResponseAt: string | null;
  now?: Date;
}): SlaInfo {
  const now = input.now ?? new Date();
  const targetHours = FIRST_RESPONSE_SLA_HOURS[input.priority];
  const created = new Date(input.createdAt);
  const dueAt = new Date(created.getTime() + targetHours * HOUR_MS);
  const remainingMs = dueAt.getTime() - now.getTime();

  if (input.firstResponseAt) return { state: "responded", targetHours, dueAt, remainingMs };
  if (input.status === "resolved" || input.status === "closed") {
    return { state: "not_applicable", targetHours, dueAt, remainingMs };
  }
  if (remainingMs < 0) return { state: "breached", targetHours, dueAt, remainingMs };
  if (remainingMs < targetHours * HOUR_MS * 0.25) return { state: "at_risk", targetHours, dueAt, remainingMs };
  return { state: "on_track", targetHours, dueAt, remainingMs };
}

/**
 * Default queue order: unresolved first, then most urgent, then oldest.
 * "The most urgent and oldest unresolved tickets should be easy to spot."
 */
export function compareQueueOrder(
  a: { status: TicketStatus; priority: TicketPriority; createdAt: string },
  b: { status: TicketStatus; priority: TicketPriority; createdAt: string },
): number {
  const openRank = (s: TicketStatus) => (s === "open" || s === "in_progress" ? 0 : 1);
  return (
    openRank(a.status) - openRank(b.status) ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
