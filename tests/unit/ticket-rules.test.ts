import { describe, expect, it } from "vitest";
import { bookStatusLabel, canTransition, parseBookStatus } from "@/lib/domain/constants";
import { compareQueueOrder, firstResponseSla } from "@/lib/domain/sla";
import { createTicketSchema, listTicketsQuerySchema, updateTicketSchema } from "@/lib/schemas";
import { draftSimilarity } from "@/lib/text-similarity";

describe("book status parsing", () => {
  it.each([
    ["Published & Live", "published_live"],
    ["In Production - Cover Design", "cover_design"],
    ["In Production - Typesetting", "typesetting"],
  ] as const)("parses %s", (label, stage) => {
    expect(parseBookStatus(label)).toBe(stage);
    expect(bookStatusLabel(stage)).toBe(label);
  });

  it("rejects unknown statuses instead of guessing", () => {
    expect(() => parseBookStatus("Shipped")).toThrow();
  });
});

describe("ticket lifecycle", () => {
  it("allows the normal flow and reopening", () => {
    expect(canTransition("open", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "resolved")).toBe(true);
    expect(canTransition("resolved", "in_progress")).toBe(true);
    expect(canTransition("resolved", "closed")).toBe(true);
  });

  it("does not jump from closed straight to resolved", () => {
    expect(canTransition("closed", "resolved")).toBe(false);
    expect(canTransition("closed", "open")).toBe(false);
  });
});

describe("first-response SLA", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  it("marks a critical ticket breached after 4 hours without a reply", () => {
    expect(firstResponseSla({ priority: "critical", status: "open", createdAt: hoursAgo(5), firstResponseAt: null, now }).state).toBe("breached");
  });

  it("warns when 75% of the window is used", () => {
    expect(firstResponseSla({ priority: "high", status: "open", createdAt: hoursAgo(20), firstResponseAt: null, now }).state).toBe("at_risk");
  });

  it("stops counting once BookLeaf has replied", () => {
    expect(firstResponseSla({ priority: "critical", status: "in_progress", createdAt: hoursAgo(9), firstResponseAt: hoursAgo(1), now }).state).toBe("responded");
  });

  it("sorts unresolved first, then by urgency, then oldest", () => {
    const tickets = [
      { id: "resolved-critical", status: "resolved" as const, priority: "critical" as const, createdAt: hoursAgo(50) },
      { id: "new-high", status: "open" as const, priority: "high" as const, createdAt: hoursAgo(1) },
      { id: "old-high", status: "in_progress" as const, priority: "high" as const, createdAt: hoursAgo(30) },
      { id: "critical", status: "open" as const, priority: "critical" as const, createdAt: hoursAgo(2) },
      { id: "low", status: "open" as const, priority: "low" as const, createdAt: hoursAgo(90) },
    ];
    expect([...tickets].sort(compareQueueOrder).map((t) => t.id)).toEqual(["critical", "old-high", "new-high", "low", "resolved-critical"]);
  });
});

describe("request validation", () => {
  it("accepts a general / account-level ticket", () => {
    const r = createTicketSchema.safeParse({ bookId: null, subject: "Bio update", description: "How do I update my author bio on Amazon?" });
    expect(r.success).toBe(true);
  });

  it("rejects too-short descriptions with a helpful message", () => {
    const r = createTicketSchema.safeParse({ bookId: "BK001", subject: "Help", description: "short" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).join(" ")).toMatch(/at least/);
  });

  it("parses comma-separated filters and rejects unknown values", () => {
    expect(listTicketsQuerySchema.parse({ status: "open,in_progress" }).status).toEqual(["open", "in_progress"]);
    expect(listTicketsQuerySchema.safeParse({ priority: "urgent" }).success).toBe(false);
  });

  it("requires at least one field when updating a ticket", () => {
    expect(updateTicketSchema.safeParse({}).success).toBe(false);
    expect(updateTicketSchema.safeParse({ assigneeId: null }).success).toBe(true);
  });
});

describe("draft similarity", () => {
  it("is 1 for an unedited draft and drops as the agent rewrites", () => {
    const draft = "Dear Ananya, thank you for reaching out about your royalty payment.";
    expect(draftSimilarity(draft, draft)).toBe(1);
    const edited = draftSimilarity(draft, "Dear Ananya, thanks for writing in about the royalty payment for your book.");
    expect(edited).toBeGreaterThan(0.4);
    expect(edited).toBeLessThan(1);
    expect(draftSimilarity(draft, "Completely different text here")).toBeLessThan(0.2);
  });
});
