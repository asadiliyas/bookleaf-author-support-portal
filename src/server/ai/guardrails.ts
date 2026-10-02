/**
 * Business rules that must hold regardless of what the model says.
 * The LLM proposes, policy disposes: these floors come straight from the
 * knowledge base and are enforced in code, where they are testable.
 */
import { PRIORITY_RANK, TICKET_PRIORITIES, type TicketCategory, type TicketPriority } from "@/lib/domain/constants";
import type { RoyaltyState } from "@/lib/domain/royalty";

const ISBN_ERROR = /(wrong|different|duplicate|mismatch|incorrect|error|two isbns?|another book)/i;

export interface PolicyResult {
  priority: TicketPriority;
  /** Human-readable rule that raised the priority, if any. */
  appliedRule: string | null;
}

function atLeast(current: TicketPriority, floor: TicketPriority): TicketPriority {
  return PRIORITY_RANK[current] <= PRIORITY_RANK[floor] ? current : floor;
}

export function applyPriorityPolicy(input: {
  category: TicketCategory;
  priority: TicketPriority;
  text: string;
  royaltyState: RoyaltyState | null;
}): PolicyResult {
  const { category, priority, text, royaltyState } = input;

  if (category === "isbn_metadata" && /isbn/i.test(text) && ISBN_ERROR.test(text)) {
    const raised = atLeast(priority, "high");
    if (raised !== priority) return { priority: raised, appliedRule: "ISBN errors are always at least High (ISBN policy)" };
  }

  if (category === "royalty_payments" && royaltyState === "likely_overdue") {
    const raised = atLeast(priority, "high");
    if (raised !== priority) {
      return { priority: raised, appliedRule: "Royalty payout appears overdue on this account (royalty calendar check)" };
    }
  }

  return { priority, appliedRule: null };
}

export function isPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value);
}
