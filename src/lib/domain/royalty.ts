/**
 * Royalty calendar + payout assessment, implemented from the knowledge base:
 *
 *  - Royalties are calculated quarterly and paid within 45 days of quarter end.
 *  - Minimum payout is ₹1,000; smaller balances roll over to the next quarter.
 *
 * This runs in code, not in the LLM. The model receives the computed facts
 * ("payout due by 14 Nov 2026", "likely overdue"), so it never has to do date
 * arithmetic, which is where LLMs hallucinate most.
 *
 * All dates are calendar dates handled in UTC to avoid timezone drift.
 */
import { ROYALTY_MIN_PAYOUT_INR, ROYALTY_PAYOUT_WINDOW_DAYS } from "./constants";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Quarter {
  year: number;
  /** 1-4 */
  quarter: number;
  start: Date;
  end: Date;
}

export function toUtcDate(value: string | Date): Date {
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / DAY_MS);
}

export function quarterOf(date: Date): Quarter {
  const d = toUtcDate(date);
  const year = d.getUTCFullYear();
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const end = new Date(Date.UTC(year, quarter * 3, 0)); // day 0 of next quarter = last day of this one
  return { year, quarter, start, end };
}

export function previousQuarter(q: Quarter): Quarter {
  return quarterOf(addDays(q.start, -1));
}

export function quarterLabel(q: Quarter): string {
  return `Q${q.quarter} ${q.year}`;
}

export function payoutDeadline(q: Quarter): Date {
  return addDays(q.end, ROYALTY_PAYOUT_WINDOW_DAYS);
}

export interface PayoutCycle {
  quarter: Quarter;
  label: string;
  /** Last day the payout for this quarter is due. */
  deadline: Date;
}

export interface RoyaltyCalendar {
  asOf: Date;
  currentQuarter: Quarter;
  /** The nearest payout that has not happened yet. */
  upcoming: PayoutCycle;
  /** The most recent payout deadline that has already passed. */
  lastPassed: PayoutCycle;
}

export function royaltyCalendar(asOf: Date = new Date()): RoyaltyCalendar {
  const today = toUtcDate(asOf);
  const current = quarterOf(today);
  const lastClosed = previousQuarter(current);
  const lastClosedDeadline = payoutDeadline(lastClosed);

  const cycle = (q: Quarter): PayoutCycle => ({ quarter: q, label: quarterLabel(q), deadline: payoutDeadline(q) });

  // Early in a quarter, the previous quarter's payout window is still open.
  const upcoming = today <= lastClosedDeadline ? cycle(lastClosed) : cycle(current);
  const lastPassed = today <= lastClosedDeadline ? cycle(previousQuarter(lastClosed)) : cycle(lastClosed);

  return { asOf: today, currentQuarter: current, upcoming, lastPassed };
}

export type RoyaltyState =
  | "not_published" // no sales possible yet
  | "no_earnings" // published, nothing earned yet
  | "paid_up" // earned > 0 and nothing pending
  | "below_threshold" // pending < ₹1,000, rolls over
  | "scheduled" // pending ≥ ₹1,000, payout due in the upcoming cycle
  | "likely_overdue"; // pending ≥ ₹1,000 and a payout cycle passed without a payout

export interface RoyaltyBookInput {
  isPublished: boolean;
  publicationDate: string | null;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: string | null;
}

export interface RoyaltyAssessment {
  state: RoyaltyState;
  pending: number;
  meetsThreshold: boolean;
  shortfallToThreshold: number;
  daysSinceLastPayout: number | null;
  calendar: RoyaltyCalendar;
  /** Plain-English explanation used in the UI and in the AI facts block. */
  summary: string;
}

/**
 * The dataset only has aggregate royalty figures (no per-quarter history), so
 * "overdue" is a conservative inference: the balance is above the threshold,
 * the book was live before the last completed payout cycle, and no payout was
 * recorded inside or after that cycle's payout window.
 */
export function assessRoyalty(book: RoyaltyBookInput, asOf: Date = new Date()): RoyaltyAssessment {
  const calendar = royaltyCalendar(asOf);
  const pending = book.royaltyPending;
  const meetsThreshold = pending >= ROYALTY_MIN_PAYOUT_INR;
  const lastPayout = book.lastRoyaltyPayoutDate ? toUtcDate(book.lastRoyaltyPayoutDate) : null;
  const daysSinceLastPayout = lastPayout ? daysBetween(lastPayout, calendar.asOf) : null;
  const base = {
    pending,
    meetsThreshold,
    shortfallToThreshold: Math.max(0, ROYALTY_MIN_PAYOUT_INR - pending),
    daysSinceLastPayout,
    calendar,
  };

  const upcomingText = `${calendar.upcoming.label} royalties are due by ${formatLongDate(calendar.upcoming.deadline)}`;

  if (!book.isPublished) {
    return { ...base, state: "not_published", summary: "Book is not published yet, so no royalties have accrued." };
  }
  if (book.totalRoyaltyEarned <= 0) {
    return { ...base, state: "no_earnings", summary: `No royalties earned yet. ${upcomingText}.` };
  }
  if (pending <= 0) {
    return {
      ...base,
      state: "paid_up",
      summary: lastPayout
        ? `All earned royalties are paid (last payout ${formatLongDate(lastPayout)}).`
        : "All earned royalties are paid.",
    };
  }
  if (!meetsThreshold) {
    return {
      ...base,
      state: "below_threshold",
      summary: `Pending balance is below the ₹${ROYALTY_MIN_PAYOUT_INR.toLocaleString("en-IN")} minimum payout, so it rolls over to the next quarter (₹${base.shortfallToThreshold.toLocaleString("en-IN")} to go).`,
    };
  }

  const missedCycle = calendar.lastPassed;
  const missedWindowStart = addDays(missedCycle.quarter.end, 1);
  const publishedBeforeCycleEnded =
    !!book.publicationDate && toUtcDate(book.publicationDate) <= missedCycle.quarter.end;
  const noPayoutSinceWindowOpened = !lastPayout || lastPayout < missedWindowStart;

  if (publishedBeforeCycleEnded && noPayoutSinceWindowOpened) {
    return {
      ...base,
      state: "likely_overdue",
      summary: `Pending balance is above the payout threshold, but no payout was recorded for the ${missedCycle.label} cycle (due by ${formatLongDate(missedCycle.deadline)}). This looks overdue and should be verified with finance.`,
    };
  }

  return { ...base, state: "scheduled", summary: `${upcomingText}; this balance should be included.` };
}

export function formatLongDate(d: Date | string): string {
  const date = typeof d === "string" ? toUtcDate(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
