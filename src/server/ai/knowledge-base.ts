/**
 * BookLeaf knowledge base, split into sections so prompts only carry what a
 * ticket needs. The full KB is ~1.4k tokens; a typical draft prompt includes
 * the company overview, a compact digest, one full policy section and that
 * category's playbook (~600 tokens of KB instead of all of it).
 *
 * At this size, deterministic category -> section routing is cheaper and more
 * predictable than embeddings. A much larger KB would move to pgvector
 * retrieval in Supabase; the `sectionsFor` seam is where that would plug in.
 */
import type { TicketCategory } from "@/lib/domain/constants";
import { CATEGORY_LABELS } from "@/lib/domain/constants";

export type KbSectionId = "company" | "royalty" | "isbn" | "printing" | "distribution" | "production";

interface KbSection {
  title: string;
  points: string[];
}

export const KNOWLEDGE_BASE: Record<KbSectionId, KbSection> = {
  company: {
    title: "Company overview",
    points: [
      "BookLeaf Publishing is a self-publishing company operating in India and the US.",
      "Publishing packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid package with marketing and distribution add-ons).",
      "BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution, and royalty management for authors.",
      "In-house printing facility and warehouse are in Delhi. Print partners include Repro India and Epitome Books.",
    ],
  },
  royalty: {
    title: "Royalty policy",
    points: [
      "80/20 royalty split: 80% of the net profit per book goes to the author, 20% to BookLeaf.",
      "Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart), and shipping charges.",
      "Royalties are calculated quarterly and paid within 45 days of the quarter ending.",
      "Minimum payout threshold: ₹1,000. If accumulated royalties are below this, they roll over to the next quarter.",
      "Payouts are made via bank transfer to the account linked in the author's dashboard.",
      "Authors can view a detailed royalty breakdown in their dashboard, showing sales figures per platform.",
    ],
  },
  isbn: {
    title: "ISBN policy",
    points: [
      "Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf.",
      "ISBNs are registered under BookLeaf's publisher imprint. Authors who want an ISBN under their own imprint must obtain it independently.",
      "An ISBN error (duplicate, wrong book linked) is treated as a high-priority issue and escalated to the production team.",
    ],
  },
  printing: {
    title: "Printing & quality",
    points: [
      "In-house printing handles most orders. Overflow or specific format requirements go to Repro India or Epitome Books.",
      "Standard print turnaround: 5–7 business days from order confirmation.",
      "For quality issues (misprints, binding defects, colour inconsistency), BookLeaf arranges a free reprint after verification. The author may need to share photos of the defective copy.",
    ],
  },
  distribution: {
    title: "Distribution & availability",
    points: [
      "Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK, and the BookLeaf Store.",
      "New listings typically go live within 7–10 business days after publication is complete.",
      "A book showing as unavailable on a platform usually indicates a stock sync issue; BookLeaf's team can trigger a re-sync within 24–48 hours.",
      "Metadata updates (e.g. book description) can be submitted through the dashboard or by emailing the BookLeaf team; changes typically reflect on platforms within 3–5 business days.",
    ],
  },
  production: {
    title: "Production stages",
    points: [
      "Stages: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.",
      "Authors are updated at each stage via email.",
      "Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).",
    ],
  },
};

/**
 * One line per policy area. Always included so a reply can still answer a
 * secondary question that falls outside the ticket's main category.
 */
export const POLICY_DIGEST = [
  "Royalties: 80% of net profit to the author; calculated quarterly, paid within 45 days of quarter end; ₹1,000 minimum payout (smaller balances roll over).",
  "ISBN: assigned by BookLeaf under its imprint; ISBN errors are high priority and go to the production team (48-hour resolution timeline).",
  "Printing: 5–7 business day turnaround; free reprint for verified defects (photos may be needed).",
  "Distribution: Amazon India, Flipkart, Amazon US, Amazon UK, BookLeaf Store; new listings live in 7–10 business days; unavailable listings fixed by a re-sync in 24–48 hours; metadata changes reflect in 3–5 business days.",
  "Production: Manuscript Received → Editing → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.",
];

/**
 * "Sample Query → Response" guidance from the brief, attached per category so
 * the model is calibrated on how BookLeaf handles that exact kind of ticket.
 */
export const RESPONSE_PLAYBOOK: Record<TicketCategory, { query: string; approach: string }[]> = {
  royalty_payments: [
    {
      query: "I published my book 4 months ago and still haven't received any royalty. What's going on?",
      approach:
        "Acknowledge the frustration. Explain the quarterly royalty cycle and 45-day payout window. Check if their bank details are linked. Provide the specific next payout date. If the payment is genuinely overdue, escalate with a 48-hour resolution timeline.",
    },
    {
      query: "My royalty amount seems too low. I sold 200 copies but only received ₹3,000.",
      approach:
        "Explain the net profit calculation: MRP minus printing, platform commission, and shipping. Offer to share a detailed line-by-line royalty breakdown. Don't be defensive; offer transparency.",
    },
  ],
  isbn_metadata: [
    {
      query: "My book is showing a different ISBN on Amazon than what's on the physical copy.",
      approach:
        "Treat as high priority. Acknowledge this is a serious data issue. Confirm you are escalating to the production team immediately. Provide a 48-hour resolution timeline.",
    },
  ],
  printing_quality: [
    {
      query: "I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.",
      approach:
        "Apologise sincerely. Ask the author to share photos of the defective copies. Confirm that BookLeaf will arrange a free reprint once verified. Provide a timeline of 5–7 business days for the reprint.",
    },
  ],
  distribution_availability: [
    {
      query: "My book is published but it's showing as \"Currently Unavailable\" on Amazon.",
      approach:
        "Explain that this is typically a stock sync issue. Confirm you're triggering a re-sync with the distribution team. Set expectation: 24–48 hours for it to go live again.",
    },
  ],
  book_status_production: [
    {
      query: "It's been 3 weeks and my book is still in typesetting. When will it be done?",
      approach:
        "Check the actual production status. If it's delayed, be honest about why (e.g., waiting on author approval for proofs). Provide a specific updated timeline. Don't blame the author even if the delay is on their side; frame it collaboratively.",
    },
  ],
  general_inquiry: [
    {
      query: "Can I update the description of my book on Amazon after it's already live?",
      approach:
        "Yes, metadata updates can be submitted through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3–5 business days.",
    },
  ],
};

const CATEGORY_SECTIONS: Record<TicketCategory, KbSectionId[]> = {
  royalty_payments: ["royalty"],
  isbn_metadata: ["isbn"],
  printing_quality: ["printing"],
  distribution_availability: ["distribution"],
  book_status_production: ["production"],
  general_inquiry: ["distribution"],
};

export function sectionsFor(category: TicketCategory): KbSectionId[] {
  return ["company", ...CATEGORY_SECTIONS[category]];
}

/** Renders the policy context for one category as compact markdown. */
export function renderPolicyContext(category: TicketCategory): string {
  const sections = sectionsFor(category)
    .map((id) => `### ${KNOWLEDGE_BASE[id].title}\n${KNOWLEDGE_BASE[id].points.map((p) => `- ${p}`).join("\n")}`)
    .join("\n\n");
  const digest = `### Quick reference (other policies)\n${POLICY_DIGEST.map((p) => `- ${p}`).join("\n")}`;
  const playbook = RESPONSE_PLAYBOOK[category]
    .map((p) => `- Author asks: "${p.query}"\n  BookLeaf approach: ${p.approach}`)
    .join("\n");
  return `${sections}\n\n${digest}\n\n### Response playbook for ${CATEGORY_LABELS[category]}\n${playbook}`;
}
