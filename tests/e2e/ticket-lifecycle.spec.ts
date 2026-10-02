/**
 * The core loop, in two real browsers at once:
 * an author raises a ticket → it appears in the admin queue (AI-triaged) →
 * an admin replies → the reply shows up on the author's open page without
 * a reload (Supabase Realtime). The test ticket is deleted afterwards.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide the variables directly.
}

const PASSWORD = process.env.SEED_DEMO_PASSWORD || "BookLeaf@2026";
const subject = `E2E check ${Date.now()}: Letters from Lakshadweep missing on Amazon UK`;
let createdTicketId: string | null = null;

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

test.afterAll(async () => {
  if (!createdTicketId || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) return;
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tickets?id=eq.${createdTicketId}`, {
    method: "DELETE",
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` },
  });
});

test("author raises a ticket, admin replies, author sees it live", async ({ browser }) => {
  // Author raises a ticket about a specific book.
  const author = await signIn(browser, "meera.nair@email.com");
  await author.goto("/tickets/new?book=BK009");
  await author.fill("#subject", subject);
  await author.fill(
    "#description",
    "Readers in London tell me Letters from Lakshadweep isn't available on Amazon UK. Could you check whether it can be listed there?",
  );
  await author.getByRole("button", { name: "Send request" }).click();
  await author.waitForURL(/\/tickets\/[0-9a-f-]{36}$/);
  createdTicketId = author.url().split("/").pop()!;
  await expect(author.getByRole("heading", { name: subject })).toBeVisible();

  // Admin finds it in the queue and opens it.
  const admin = await signIn(browser, "admin@bookleaf.demo");
  await admin.goto(`/admin?q=${encodeURIComponent("E2E check")}`);
  await admin.getByText(subject).click();
  await expect(admin.getByText("AI-assisted reply")).toBeVisible();

  // Category comes from triage (rule-based instantly, AI shortly after).
  await expect(admin.locator("header").getByText("Distribution & Availability")).toBeVisible();

  // Reply (typed by hand so the test doesn't depend on AI latency).
  const reply = `Dear Meera, we're checking the Amazon UK listing now and will update you within 48 hours. (${Date.now()})`;
  await admin.getByPlaceholder(/Write your reply|AI draft will appear/).fill(reply);
  await admin.getByRole("button", { name: "Send reply" }).click();
  await expect(admin.getByText("Reply sent")).toBeVisible();

  // The author's page, untouched since submitting, receives the reply.
  await expect(author.getByText(reply)).toBeVisible({ timeout: 25_000 });
  await expect(author.getByText("In Progress").first()).toBeVisible();
});

test("authors cannot open another author's ticket or the admin portal", async ({ browser }) => {
  const author = await signIn(browser, "farhan.sheikh@email.com");
  const res = await author.request.get("/api/v1/tickets?pageSize=100");
  const body = await res.json();
  expect(body.items.every((t: { author: { id: string } }) => t.author.id === "AUTH008")).toBe(true);

  await author.goto("/admin");
  await expect(author).toHaveURL(/\/dashboard$/);
  expect((await author.request.get("/api/v1/admin/stats")).status()).toBe(403);
});
