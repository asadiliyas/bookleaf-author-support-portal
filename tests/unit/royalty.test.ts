import { describe, expect, it } from "vitest";
import { assessRoyalty, isoDate, quarterOf, royaltyCalendar } from "@/lib/domain/royalty";

const AS_OF = new Date("2026-10-02T10:00:00Z");

describe("royalty calendar", () => {
  it("early in a quarter, the previous quarter's payout is still upcoming", () => {
    const cal = royaltyCalendar(AS_OF);
    expect(cal.currentQuarter.quarter).toBe(4);
    expect(cal.upcoming.label).toBe("Q3 2026");
    expect(isoDate(cal.upcoming.deadline)).toBe("2026-11-14"); // 30 Sep + 45 days
    expect(cal.lastPassed.label).toBe("Q2 2026");
    expect(isoDate(cal.lastPassed.deadline)).toBe("2026-08-14"); // 30 Jun + 45 days
  });

  it("once the payout window closes, the current quarter becomes upcoming", () => {
    const cal = royaltyCalendar(new Date("2026-12-01T00:00:00Z"));
    expect(cal.upcoming.label).toBe("Q4 2026");
    expect(isoDate(cal.upcoming.deadline)).toBe("2027-02-14");
    expect(cal.lastPassed.label).toBe("Q3 2026");
  });

  it("handles quarter boundaries and leap years", () => {
    expect(isoDate(quarterOf(new Date("2028-02-29T00:00:00Z")).end)).toBe("2028-03-31");
    expect(isoDate(royaltyCalendar(new Date("2028-01-10T00:00:00Z")).upcoming.deadline)).toBe("2028-02-14");
  });
});

describe("royalty assessment against the sample dataset", () => {
  const base = { isPublished: true, publicationDate: "2024-07-05", totalRoyaltyEarned: 2546, royaltyPaid: 0, royaltyPending: 2546, lastRoyaltyPayoutDate: null };

  it("flags a never-paid balance above the threshold as likely overdue (BK005)", () => {
    const r = assessRoyalty(base, AS_OF);
    expect(r.state).toBe("likely_overdue");
    expect(r.summary).toContain("Q2 2026");
    expect(r.authorMessage).toContain("₹2,546");
  });

  it("keeps balances under ₹1,000 rolling over (BK016: ₹850)", () => {
    const r = assessRoyalty({ ...base, publicationDate: "2024-11-05", totalRoyaltyEarned: 850, royaltyPending: 850 }, AS_OF);
    expect(r.state).toBe("below_threshold");
    expect(r.shortfallToThreshold).toBe(150);
  });

  it("recognises fully paid books (BK002)", () => {
    const r = assessRoyalty({ ...base, totalRoyaltyEarned: 7938, royaltyPaid: 7938, royaltyPending: 0, lastRoyaltyPayoutDate: "2025-12-01" }, AS_OF);
    expect(r.state).toBe("paid_up");
  });

  it("treats books in production as not published (BK013, BK015)", () => {
    const r = assessRoyalty({ ...base, isPublished: false, publicationDate: null, totalRoyaltyEarned: 0, royaltyPending: 0 }, AS_OF);
    expect(r.state).toBe("not_published");
  });

  it("does not call a payout overdue if the book went live after the missed cycle", () => {
    const r = assessRoyalty({ ...base, publicationDate: "2026-08-01", totalRoyaltyEarned: 1200, royaltyPending: 1200 }, AS_OF);
    expect(r.state).toBe("scheduled");
  });

  it("does not call a payout overdue if one was recorded in the last window", () => {
    const r = assessRoyalty({ ...base, royaltyPaid: 1000, royaltyPending: 1546, lastRoyaltyPayoutDate: "2026-08-10" }, AS_OF);
    expect(r.state).toBe("scheduled");
  });
});
