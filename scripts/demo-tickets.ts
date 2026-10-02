/**
 * Demo tickets for the seeded environment. Each one exercises a scenario from
 * the brief against the real dataset (unpaid royalties, below-threshold
 * balance, books in production, ISBN mismatch, print defects, missing
 * listings) and they are spread across statuses so both portals have
 * something realistic to show on first login.
 *
 * `ageHours` backdates creation so queue ageing and SLA badges are meaningful.
 */
import type { TicketStatus } from "../src/lib/domain/constants";

export type DemoAdmin = "lead" | "agent";

export interface DemoTicket {
  authorId: string;
  bookId: string | null;
  subject: string;
  description: string;
  ageHours: number;
  status: TicketStatus;
  assignee?: DemoAdmin;
  thread?: { from: "author" | DemoAdmin; afterHours: number; body: string }[];
  notes?: { by: DemoAdmin; afterHours: number; body: string }[];
}

export const DEMO_ADMINS: Record<DemoAdmin, { name: string; email: string }> = {
  lead: { name: "Riya Mehta", email: "admin@bookleaf.demo" },
  agent: { name: "Karan Bhatia", email: "support@bookleaf.demo" },
};

export const DEMO_TICKETS: DemoTicket[] = [
  {
    authorId: "AUTH003",
    bookId: "BK005",
    subject: "Haven't received a single royalty payment since my book launched",
    description:
      "Hello, my book Between Two Temples was published in July 2024. My dashboard shows ₹2,546 as pending royalty but I have never received any payment at all, not even once. It has been over two years now. Is something wrong with my account? I really need clarity on when I will get paid.",
    ageHours: 5,
    status: "open",
  },
  {
    authorId: "AUTH008",
    bookId: "BK014",
    subject: "ISBN on Amazon listing doesn't match my printed copies",
    description:
      "The ISBN printed on the back cover of my author copies of Ghazal of the Forgotten is different from the ISBN shown on the Amazon India listing. A bookstore in Lucknow tried to order using the ISBN on my copy and couldn't find the book. Please fix this as soon as possible.",
    ageHours: 27,
    status: "open",
  },
  {
    authorId: "AUTH004",
    bookId: "BK006",
    subject: "Blurry images and misaligned pages in my author copies",
    description:
      "I received 20 author copies of Debugging Life last week. The diagrams in chapters 3 and 7 are blurry and in at least five copies the pages are misaligned so the text runs into the margin. I was planning to hand these out at a talk next month.",
    ageHours: 50,
    status: "in_progress",
    assignee: "lead",
    thread: [
      {
        from: "lead",
        afterHours: 3,
        body:
          "Dear Vikram,\n\nI'm really sorry: blurry diagrams and misaligned pages are not the standard we hold ourselves to, especially with a talk coming up.\n\nCould you share a few photos of the affected pages (the chapter 3 and 7 diagrams and one misaligned spread)? As soon as our print team verifies them, we'll arrange a free reprint of the defective copies, which takes 5–7 business days from confirmation.\n\nWarm regards,\nRiya Mehta\nBookLeaf Author Support",
      },
      {
        from: "author",
        afterHours: 20,
        body: "Thanks Riya. I've photographed the pages and will upload them here today. Can you make sure the reprint reaches me before the 25th?",
      },
    ],
    notes: [
      { by: "lead", afterHours: 4, body: "Printed in-house (Delhi). Checking with the print floor whether the same batch had other complaints." },
    ],
  },
  {
    authorId: "AUTH005",
    bookId: "BK009",
    subject: "Letters from Lakshadweep shows 'Currently Unavailable' on Amazon US",
    description:
      "A friend in Seattle tried to buy Letters from Lakshadweep on Amazon US yesterday and it says Currently Unavailable. It was available a few weeks ago. Could you check what happened?",
    ageHours: 9,
    status: "open",
  },
  {
    authorId: "AUTH009",
    bookId: "BK015",
    subject: "Raising Roots has been in typesetting for 3 weeks",
    description:
      "It's been three weeks and my book Raising Roots is still showing 'Typesetting' in the dashboard. I approved the cover a while ago. When can I expect proofs? I was hoping to launch before Diwali.",
    ageHours: 30,
    status: "open",
    assignee: "agent",
  },
  {
    authorId: "AUTH009",
    bookId: "BK016",
    subject: "No royalty payout yet for The Nagpur Notebooks",
    description:
      "My book The Nagpur Notebooks has been live since November 2024 and shows ₹850 earned but I haven't received any payment. Is there a problem with my bank details?",
    ageHours: 80,
    status: "resolved",
    assignee: "agent",
    thread: [
      {
        from: "agent",
        afterHours: 6,
        body:
          "Dear Kavita,\n\nThank you for checking in, and I completely understand wanting to see that first payout land.\n\nYour account is fine. The Nagpur Notebooks has earned ₹850 so far, and BookLeaf's minimum payout is ₹1,000. Balances under that amount roll over to the next quarter rather than being lost, so you're ₹150 away from your first transfer. Payouts go out within 45 days of each quarter ending.\n\nIt's still worth confirming that the bank account linked in your dashboard is correct, so the first payout goes through smoothly once you cross the threshold.\n\nWarm regards,\nKaran Bhatia\nBookLeaf Author Support",
      },
      { from: "author", afterHours: 9, body: "That makes sense, thank you for explaining so clearly!" },
    ],
  },
  {
    authorId: "AUTH002",
    bookId: "BK003",
    subject: "Royalty seems low for the number of copies sold",
    description:
      "Code & Karma has sold 876 copies according to the dashboard but my total royalty is only ₹26,280. The MRP is ₹350, so that's less than 10% of the cover price. Can you explain how this is calculated? I'd like a breakdown.",
    ageHours: 4,
    status: "open",
  },
  {
    authorId: "AUTH007",
    bookId: "BK013",
    subject: "Next steps after cover design for Midnight in Mysore?",
    description:
      "Hi team, Midnight in Mysore is still in cover design. I shared feedback on the second concept last week. What do you need from me to move forward, and roughly how long until the book is live?",
    ageHours: 1,
    status: "open",
  },
  {
    authorId: "AUTH006",
    bookId: null,
    subject: "How do I update my author bio?",
    description:
      "I'd like to update the author bio that appears on my book pages to mention my new column in the Tribune. Where can I do that, and will it update on Amazon too?",
    ageHours: 120,
    status: "closed",
    assignee: "lead",
    thread: [
      {
        from: "lead",
        afterHours: 20,
        body:
          "Dear Arjun,\n\nCongratulations on the Tribune column! That's a lovely addition to your bio.\n\nYou can submit the updated bio through your dashboard, or simply reply here with the new text and we'll submit it for you. Changes typically reflect on Amazon and our other platforms within 3–5 business days.\n\nWarm regards,\nRiya Mehta\nBookLeaf Author Support",
      },
      { from: "author", afterHours: 26, body: "Done through the dashboard, thanks Riya!" },
    ],
  },
  {
    authorId: "AUTH010",
    bookId: "BK018",
    subject: "Howrah Nights isn't on Flipkart",
    description:
      "My first book Durga's Daughters is on Flipkart, but Howrah Nights (published January 2025) isn't listed there at all. Several readers in Kolkata have asked me for a Flipkart link. Can you add it?",
    ageHours: 2,
    status: "open",
  },
];
