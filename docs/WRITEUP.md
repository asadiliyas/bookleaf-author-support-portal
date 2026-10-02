# Write-up: approach, trade-offs and the road to production

**What I optimised for.** The brief describes slow, inconsistent replies and a growing backlog. I treated the AI as a way to make the ops team faster and more consistent, not as a replacement for them. Three things therefore had to be true:
1. A ticket is never lost or delayed because of the AI.
2. Every AI draft is grounded in BookLeaf policy and in the author's real numbers.
3. A human always decides what gets sent.

Everything else (the queue ordering, the first-response countdowns, the authors' royalty explanations) serves those goals.

**Priorities, in order:**
1. **Core ticket loop with real-time updates.** Raise → triage → reply → see it live, with correct permissions. The permission rules are enforced twice: in the service layer, and in Postgres row-level security. Signed-in users have no write access to the database at all.
2. **The AI layer.**
   - Classification runs after the ticket is saved, with a rule-based fallback and policy guardrails in code (ISBN errors and overdue payouts are at least High).
   - Drafting uses only the knowledge-base section for the ticket's category, plus a facts block the server computes.
   - The royalty calendar, the ₹1,000 threshold and overdue detection are deterministic code. Date arithmetic is exactly where language models invent things, so the model only turns the facts into prose.
3. **Measuring instead of assuming.**
   - I benchmarked three classification models on 24 labelled tickets and chose gemini-3.5-flash-lite (100% category accuracy, $0.32 per 1,000 tickets).
   - I timed the draft models and chose 2.5 Flash at about 6 s over 3.5 Flash at 11–40 s.
   - Every AI call is logged, so the AI Insights page shows cost, latency, how often agents override the AI, and how much of each draft they keep.
   - Testing caught a draft that promised an unrelated fix; the result was the `draft-v2` prompt.
4. **Product details for both audiences.** Authors see plain-English royalty status ("₹150 to go before your first payout") and a production tracker, which answers many questions before a ticket is raised. Agents get the most urgent and oldest tickets first, an escalation hint and a checklist with every draft, and internal notes that can't leak.

**Trade-offs I made deliberately:**
- **No vector database.** The knowledge base is about 1,300 tokens. Choosing sections by category is cheaper, predictable and easy to test. It stays behind a single function (`sectionsFor`), so swapping in pgvector later is local.
- **`after()` instead of a job queue.** It's simpler and fine at this scale, and a failure leaves a usable fallback classification plus a re-run button. A real queue is the first production change I'd make.
- **Best-effort audit trail.** Supabase's JS client has no transactions, so the message, ticket update and event writes are separate statements. Postgres functions would make them atomic.
- **Drafts generated on open, only when the author is waiting on BookLeaf,** and cached by a fingerprint of the context. This costs a ~6 s wait on first open in exchange for never paying for drafts nobody reads.
- **Free-tier Gemini.** Rate limits are low, so the app uses one call per ticket, caching, and fallback models that each have their own quota. Personal data sent to the model is minimised, since free-tier prompts may be used by Google.

**Evolving this into a production system:**
1. **Reliability.** A durable queue (pgmq/Inngest) for classification and notifications. Transactional Postgres functions for writes. Tracing and alerts on AI failure rate and time to first response.
2. **Knowledge and quality.**
   - Move the knowledge base and prompts into the database, with versioning and an editor for the ops team.
   - Grow the labelled eval set from real tickets, using the admin overrides the system already records, and run it in CI on every prompt change.
   - Use the "draft kept" metric as the main quality signal.
3. **Deeper automation, gated by confidence.** Auto-send only for high-confidence, low-risk replies (e.g. "when is my next payout?"), with a review sample. Multimodal pre-checks of print-defect photos. Proactive outreach when the royalty calendar spots a missed payout, before the author has to ask.
4. **Scale and operations.** Business-hours SLAs, routing by skill, email/WhatsApp notifications, a weekly backlog report for leads, a paid-tier or Vertex AI contract, and SSO/MFA for staff.
