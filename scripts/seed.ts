/**
 * Seeds Supabase from data/bookleaf_sample_data.json plus demo admins and
 * demo tickets. Idempotent: re-running updates users/authors/books in place.
 *
 *   npm run seed               # users, authors, books (+ demo tickets if none exist)
 *   npm run seed -- --reset    # also wipes tickets and AI data, then re-creates demo tickets
 *   npm run seed -- --no-ai    # classify demo tickets with the rule-based fallback only
 *
 * Runs with `--conditions=react-server` so app modules marked `server-only`
 * (DB client, AI classifier) can be reused instead of duplicated here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBookStatus } from "../src/lib/domain/constants";
import { assessRoyalty } from "../src/lib/domain/royalty";
import { runClassification } from "../src/server/ai/classifier";
import { renderClassificationFacts, type TicketAiContext } from "../src/server/ai/context";
import { classifyByRules } from "../src/server/ai/fallback-classifier";
import { geminiProvider } from "../src/server/ai/gemini";
import { systemDb } from "../src/server/db/clients";
import type { Json } from "../src/types/database";
import { DEMO_ADMINS, DEMO_TICKETS, type DemoAdmin } from "./demo-tickets";

interface DatasetBook {
  book_id: string;
  title: string;
  isbn: string;
  genre: string;
  publication_date: string | null;
  status: string;
  mrp: number | null;
  author_royalty_per_copy: number | null;
  total_copies_sold: number;
  total_royalty_earned: number;
  royalty_paid: number;
  royalty_pending: number;
  last_royalty_payout_date: string | null;
  print_partner: string | null;
  available_on: string[];
}

interface DatasetAuthor {
  author_id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  joined_date: string;
  books: DatasetBook[];
}

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const USE_AI = !args.has("--no-ai");
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "BookLeaf@2026";
const HOUR = 60 * 60 * 1000;

const db = systemDb();

function fail(step: string, error: { message: string } | null): never | void {
  if (error) {
    console.error(`✗ ${step}: ${error.message}`);
    process.exit(1);
  }
}

async function existingUsersByEmail(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    fail("list users", error);
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 200) break;
  }
  return map;
}

/** Creates or updates a confirmed user with the role encoded in app_metadata. */
async function upsertUser(
  users: Map<string, string>,
  email: string,
  appMetadata: { role: "author" | "admin"; name: string; author_id?: string },
): Promise<string> {
  const existing = users.get(email.toLowerCase());
  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { name: appMetadata.name },
    });
    fail(`update user ${email}`, error);
    return existing;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: { name: appMetadata.name },
  });
  fail(`create user ${email}`, error);
  return data.user!.id;
}

async function seedAccountsAndBooks(dataset: DatasetAuthor[], users: Map<string, string>) {
  for (const a of dataset) {
    const userId = await upsertUser(users, a.email, { role: "author", name: a.name, author_id: a.author_id });
    const { error } = await db.from("authors").upsert({
      id: a.author_id,
      user_id: userId,
      name: a.name,
      email: a.email.toLowerCase(),
      phone: a.phone,
      city: a.city,
      joined_date: a.joined_date,
    });
    fail(`upsert author ${a.author_id}`, error);

    const books = a.books.map((b) => ({
      id: b.book_id,
      author_id: a.author_id,
      title: b.title,
      isbn: b.isbn,
      genre: b.genre,
      stage: parseBookStatus(b.status),
      publication_date: b.publication_date,
      mrp: b.mrp,
      author_royalty_per_copy: b.author_royalty_per_copy,
      total_copies_sold: b.total_copies_sold,
      total_royalty_earned: b.total_royalty_earned,
      royalty_paid: b.royalty_paid,
      royalty_pending: b.royalty_pending,
      last_royalty_payout_date: b.last_royalty_payout_date,
      print_partner: b.print_partner,
      available_on: b.available_on,
    }));
    const { error: bookError } = await db.from("books").upsert(books);
    fail(`upsert books for ${a.author_id}`, bookError);
    console.log(`✓ ${a.author_id} ${a.name} (${books.length} book${books.length === 1 ? "" : "s"})`);
  }
}

async function seedAdmins(users: Map<string, string>): Promise<Record<DemoAdmin, { id: string; name: string }>> {
  const result = {} as Record<DemoAdmin, { id: string; name: string }>;
  for (const [key, admin] of Object.entries(DEMO_ADMINS) as [DemoAdmin, (typeof DEMO_ADMINS)[DemoAdmin]][]) {
    const id = await upsertUser(users, admin.email, { role: "admin", name: admin.name });
    const { error } = await db.from("admins").upsert({ user_id: id, name: admin.name, email: admin.email });
    fail(`upsert admin ${admin.email}`, error);
    result[key] = { id, name: admin.name };
    console.log(`✓ admin ${admin.name} <${admin.email}>`);
  }
  return result;
}

async function resetTickets() {
  const { data: files } = await db.from("ticket_attachments").select("storage_path");
  if (files?.length) await db.storage.from("ticket-attachments").remove(files.map((f) => f.storage_path));
  fail("clear ai requests", (await db.from("ai_requests").delete().not("id", "is", null)).error);
  fail("clear tickets", (await db.from("tickets").delete().not("id", "is", null)).error);
  console.log("✓ cleared tickets, messages, notes, events, drafts and AI logs");
}

async function seedDemoTickets(admins: Record<DemoAdmin, { id: string; name: string }>, dataset: DatasetAuthor[]) {
  const ai = geminiProvider();
  const aiEnabled = USE_AI && ai.isConfigured();
  if (!aiEnabled) console.log("… AI classification disabled, using rule-based fallback");

  // Oldest first so ticket numbers increase with age, like a real queue.
  const ordered = [...DEMO_TICKETS].sort((a, b) => b.ageHours - a.ageHours);
  for (const t of ordered) {
    const created = new Date(Date.now() - t.ageHours * HOUR);
    const at = (h: number) => new Date(created.getTime() + h * HOUR).toISOString();
    const initial = classifyByRules(t.subject, t.description);
    const adminMessages = (t.thread ?? []).filter((m) => m.from !== "author");
    const lastMessage = t.thread?.at(-1);

    const { data: ticket, error } = await db
      .from("tickets")
      .insert({
        author_id: t.authorId,
        book_id: t.bookId,
        subject: t.subject,
        description: t.description,
        status: t.status,
        category: initial.category,
        priority: initial.priority,
        category_source: "fallback",
        priority_source: "fallback",
        ai_status: "pending",
        assigned_admin_id: t.assignee ? admins[t.assignee].id : null,
        first_response_at: adminMessages[0] ? at(adminMessages[0].afterHours) : null,
        resolved_at: t.status === "resolved" || t.status === "closed" ? at((lastMessage?.afterHours ?? 1) + 0.5) : null,
        closed_at: t.status === "closed" ? at((lastMessage?.afterHours ?? 1) + 1) : null,
        last_activity_at: at(lastMessage?.afterHours ?? 0),
        created_at: created.toISOString(),
      })
      .select("*")
      .single();
    fail(`create ticket "${t.subject}"`, error);

    const events: { type: string; actor_id: string | null; actor_label: string; payload: Json; created_at: string }[] = [
      { type: "created", actor_id: null, actor_label: authorName(dataset, t.authorId), payload: { bookId: t.bookId }, created_at: at(0) },
    ];
    if (t.assignee) {
      events.push({ type: "assigned", actor_id: admins[t.assignee].id, actor_label: admins[t.assignee].name, payload: { to: admins[t.assignee].name }, created_at: at(0.5) });
    }

    for (const m of t.thread ?? []) {
      const isAuthor = m.from === "author";
      const sender = m.from === "author" ? null : admins[m.from];
      fail(
        "create message",
        (
          await db.from("ticket_messages").insert({
            ticket_id: ticket!.id,
            author_id: t.authorId,
            sender_role: isAuthor ? "author" : "admin",
            sender_user_id: sender?.id ?? null,
            sender_name: isAuthor ? authorName(dataset, t.authorId) : sender!.name,
            body: m.body,
            created_at: at(m.afterHours),
          })
        ).error,
      );
      events.push({
        type: isAuthor ? "author_replied" : "admin_replied",
        actor_id: sender?.id ?? null,
        actor_label: isAuthor ? authorName(dataset, t.authorId) : sender!.name,
        payload: {},
        created_at: at(m.afterHours),
      });
    }
    for (const n of t.notes ?? []) {
      const by = admins[n.by];
      fail(
        "create note",
        (await db.from("ticket_internal_notes").insert({ ticket_id: ticket!.id, admin_id: by.id, admin_name: by.name, body: n.body, created_at: at(n.afterHours) })).error,
      );
      events.push({ type: "note_added", actor_id: by.id, actor_label: by.name, payload: {}, created_at: at(n.afterHours) });
    }
    if (t.status !== "open") {
      const statusAt = t.status === "in_progress" ? (adminMessages[0]?.afterHours ?? 1) : (lastMessage?.afterHours ?? 1) + 0.5;
      events.push({ type: "status_changed", actor_id: null, actor_label: t.assignee ? admins[t.assignee].name : "System", payload: { from: "open", to: t.status }, created_at: at(statusAt) });
    }

    // Classification: same code path the app uses, persisted with seed timestamps.
    if (aiEnabled) {
      try {
        const ctx = await loadContextForSeed(ticket!.id);
        const result = await runClassification(
          { subject: t.subject, description: t.description, facts: renderClassificationFacts(ctx), royaltyState: royaltyStateFor(ctx) },
          ai,
          { ticketId: ticket!.id },
        );
        await db
          .from("tickets")
          .update({
            category: result.category,
            priority: result.priority,
            category_source: "ai",
            priority_source: "ai",
            ai_status: "completed",
            ai_category: result.category,
            ai_priority: result.priority,
            ai_confidence: result.confidence,
            ai_rationale: result.appliedRule ? `${result.rationale} (Raised: ${result.appliedRule}.)` : result.rationale,
            ai_classified_at: at(0.01),
          })
          .eq("id", ticket!.id);
        events.push({
          type: "ai_classified",
          actor_id: null,
          actor_label: "BookLeaf AI",
          payload: { category: result.category, priority: result.priority, confidence: result.confidence, model: result.model, policyRule: result.appliedRule },
          created_at: at(0.01),
        });
        console.log(`✓ #${ticket!.number} ${result.category}/${result.priority} (${result.model}) ${t.subject}`);
      } catch (err) {
        await db.from("tickets").update({ ai_status: "failed", ai_error: (err as { code?: string }).code ?? "unknown" }).eq("id", ticket!.id);
        events.push({ type: "ai_classification_failed", actor_id: null, actor_label: "BookLeaf AI", payload: { reason: (err as { code?: string }).code ?? "unknown" }, created_at: at(0.01) });
        console.log(`! #${ticket!.number} AI failed (${(err as Error).message}); kept fallback ${initial.category}/${initial.priority}`);
      }
    } else {
      await db.from("tickets").update({ ai_status: "failed", ai_error: "not_configured" }).eq("id", ticket!.id);
      console.log(`✓ #${ticket!.number} ${initial.category}/${initial.priority} (fallback) ${t.subject}`);
    }

    fail("create events", (await db.from("ticket_events").insert(events.map((e) => ({ ...e, ticket_id: ticket!.id })))).error);
  }
}

function authorName(dataset: DatasetAuthor[], id: string): string {
  return dataset.find((a) => a.author_id === id)?.name ?? id;
}

async function loadContextForSeed(ticketId: string): Promise<TicketAiContext> {
  const { data: ticket } = await db.from("tickets").select("*").eq("id", ticketId).single();
  const { data: author } = await db.from("authors").select("*").eq("id", ticket!.author_id).single();
  const { data: books } = await db.from("books").select("*").eq("author_id", ticket!.author_id);
  return { ticket: ticket!, author: author!, books: books ?? [], book: books?.find((b) => b.id === ticket!.book_id) ?? null, messages: [] };
}

function royaltyStateFor(ctx: TicketAiContext) {
  const b = ctx.book;
  if (!b) return null;
  return assessRoyalty({
    isPublished: b.stage === "published_live",
    publicationDate: b.publication_date,
    totalRoyaltyEarned: Number(b.total_royalty_earned),
    royaltyPaid: Number(b.royalty_paid),
    royaltyPending: Number(b.royalty_pending),
    lastRoyaltyPayoutDate: b.last_royalty_payout_date,
  }).state;
}

async function main() {
  const dataset = (
    JSON.parse(readFileSync(join(process.cwd(), "data", "bookleaf_sample_data.json"), "utf8")) as { authors: DatasetAuthor[] }
  ).authors;

  const users = await existingUsersByEmail();
  await seedAccountsAndBooks(dataset, users);
  const admins = await seedAdmins(users);

  if (RESET) await resetTickets();
  const { count } = await db.from("tickets").select("id", { count: "exact", head: true });
  if ((count ?? 0) === 0) {
    await seedDemoTickets(admins, dataset);
  } else {
    console.log(`… ${count} tickets already exist; skipping demo tickets (use --reset to recreate)`);
  }

  console.log(`\nDone. Demo password for every account: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
