/**
 * Deterministic keyword classifier.
 *
 * Two jobs:
 *  1. Give every ticket a sensible category/priority the instant it is created,
 *     before the asynchronous AI classification lands (so the queue is never
 *     "uncategorised").
 *  2. Be the permanent answer when the AI is down or rate-limited. Such tickets
 *     are marked source = "fallback" so the ops team knows to double-check.
 *
 * It is intentionally simple and transparent; accuracy is measured against the
 * AI on the same labelled set in scripts/eval-classify.ts.
 */
import type { TicketCategory, TicketPriority } from "@/lib/domain/constants";

type Rule = { pattern: RegExp; weight: number };

const CATEGORY_RULES: Record<Exclude<TicketCategory, "general_inquiry">, Rule[]> = {
  royalty_payments: [
    { pattern: /royalt/i, weight: 3 },
    { pattern: /payout|paid|payment|pay me|not received.*(money|amount)|bank (details|account)|transfer/i, weight: 2 },
    { pattern: /₹|\brs\.?\s?\d|\binr\b|earning|statement|breakdown|net profit|commission/i, weight: 1 },
  ],
  isbn_metadata: [
    { pattern: /\bisbn\b/i, weight: 4 },
    { pattern: /metadata|imprint|barcode/i, weight: 2 },
    { pattern: /wrong (author|title|name|price|book)|(title|author name|price) (is )?(wrong|incorrect|misspelt|misspelled)/i, weight: 2 },
  ],
  printing_quality: [
    { pattern: /misprint|print quality|blurry|binding|misaligned|smudge|faded|torn|defect|reprint/i, weight: 3 },
    { pattern: /author copies|printed cop(y|ies)|colou?r (inconsisten|is off|wrong)|pages? (missing|out of order|upside)/i, weight: 2 },
    { pattern: /\bprint(ing|ed)?\b/i, weight: 1 },
  ],
  distribution_availability: [
    { pattern: /unavailable|not available|out of stock|currently unavailable|can'?t (find|buy)|not (listed|showing|live) on/i, weight: 3 },
    { pattern: /amazon|flipkart|bookleaf store|listing|buy link|kindle/i, weight: 2 },
    { pattern: /distribut|re-?sync|stock/i, weight: 1 },
  ],
  book_status_production: [
    { pattern: /typesetting|cover design|proofread|editing|manuscript|production/i, weight: 3 },
    { pattern: /status of my book|when will (my book|it) be (published|ready|done|live)|still (in|at|stuck)|how long|timeline|delay/i, weight: 2 },
    { pattern: /proofs?|stage|launch date|publication date/i, weight: 1 },
  ],
};

const CRITICAL_PATTERNS = [
  /legal|lawyer|lawsuit|court|copyright (infringement|violation)|plagiari[sz]/i,
  /fraud|scam|stolen/i,
  /(no|not|never|haven'?t|have not) (received|got|been paid).{0,40}(6|six|seven|eight|nine|ten|\d{2}) months/i,
  /(6|six|seven|eight|nine|ten|\d{2}) months.{0,40}(no|not|never|without) (royalt|payment|payout)/i,
  /(selling|sold|listed) under (the )?wrong (author|name|isbn)/i,
];

const HIGH_PATTERNS = [
  /urgent|asap|immediately|escalat/i,
  /not (yet )?(received|been paid)|haven'?t (received|been paid|got)|never (received|paid)|overdue|missing payment/i,
  /\bisbn\b.{0,60}(wrong|different|duplicate|mismatch|incorrect|error)|(wrong|different|duplicate|mismatch|incorrect).{0,60}\bisbn\b/i,
  /misprint|defect|blurry|misaligned|binding/i,
  /unavailable|out of stock|not available/i,
];

const LOW_PATTERNS = [
  /\bbio\b|biography|author photo|profile (picture|photo)/i,
  /update (the |my )?(description|blurb|bio)|can i (update|change|add)|how (do|can) i|is it possible|curious|just wondering|feature request|suggestion/i,
];

export interface FallbackClassification {
  category: TicketCategory;
  priority: TicketPriority;
  matched: string[];
}

export function classifyByRules(subject: string, description: string): FallbackClassification {
  const text = `${subject}\n${description}`;
  const scores = Object.entries(CATEGORY_RULES).map(([category, rules]) => {
    const hits = rules.filter((r) => r.pattern.test(text));
    // Subject matches count double: authors usually name the topic there.
    const subjectBonus = rules.filter((r) => r.pattern.test(subject)).reduce((s, r) => s + r.weight, 0);
    return {
      category: category as TicketCategory,
      score: hits.reduce((s, r) => s + r.weight, 0) + subjectBonus,
    };
  });
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const category: TicketCategory = best && best.score >= 2 ? best.category : "general_inquiry";

  const matched: string[] = [];
  let priority: TicketPriority = "medium";
  if (CRITICAL_PATTERNS.some((p) => p.test(text))) {
    priority = "critical";
    matched.push("critical-signal");
  } else if (HIGH_PATTERNS.some((p) => p.test(text))) {
    priority = "high";
    matched.push("high-signal");
  } else if (LOW_PATTERNS.some((p) => p.test(text)) || category === "general_inquiry") {
    priority = "low";
    matched.push("low-signal");
  }

  return { category, priority, matched };
}
