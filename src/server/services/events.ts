import "server-only";
import type { Json } from "@/types/database";
import type { Actor } from "../auth/actor";
import { systemDb } from "../db/clients";

export type TicketEventType =
  | "created"
  | "status_changed"
  | "category_changed"
  | "priority_changed"
  | "assigned"
  | "unassigned"
  | "ai_classified"
  | "ai_classification_failed"
  | "admin_replied"
  | "author_replied"
  | "note_added"
  | "reopened";

/**
 * Appends to the ticket's audit trail (shown as the activity timeline).
 * `actor = null` means the system or the AI acted. Audit writes are best
 * effort: a failed log line must not fail the user's action.
 */
export async function recordEvent(
  ticketId: string,
  actor: Pick<Actor, "userId" | "name"> | null,
  type: TicketEventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await systemDb()
    .from("ticket_events")
    .insert({
      ticket_id: ticketId,
      actor_id: actor?.userId ?? null,
      actor_label: actor?.name ?? (type.startsWith("ai_") ? "BookLeaf AI" : "System"),
      type,
      payload: payload as Json,
    });
  if (error) console.error(`[events] failed to record ${type} for ${ticketId}`, error.message);
}
