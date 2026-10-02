"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CalendarClock, IndianRupee, LifeBuoy, ShoppingBag, Wallet } from "lucide-react";
import Link from "next/link";
import { ErrorState, ListSkeleton } from "@/components/states";
import { StatusBadge } from "@/components/ticket-badges";
import { Button } from "@/components/ui/button";
import type { BookPortfolio, Me, Paginated, TicketSummary } from "@/lib/api-types";
import { api, errorMessage } from "@/lib/client/api";
import { formatDate, formatNumber, inr, timeAgo } from "@/lib/format";
import { BookCard } from "./book-card";

export function AuthorDashboard({ me }: { me: Me }) {
  const books = useQuery({ queryKey: ["me", "books"], queryFn: () => api<BookPortfolio>("/me/books") });
  const tickets = useQuery({
    queryKey: ["tickets", "recent"],
    queryFn: () => api<Paginated<TicketSummary>>("/tickets?sort=updated&pageSize=3"),
  });
  const firstName = me.name.split(" ")[0];

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-coral-600">Your BookLeaf account</p>
          <h1 className="mt-1 text-3xl font-black sm:text-4xl">Welcome back, {firstName}</h1>
          <p className="mt-2 text-ink-soft">Sales, royalties and production status for every book you publish with us.</p>
        </div>
        <Button asChild variant="outline" className="h-10 rounded-full bg-white px-5 font-bold">
          <Link href="/tickets/new">
            <LifeBuoy /> Ask the BookLeaf team
          </Link>
        </Button>
      </section>

      {books.isPending && <ListSkeleton rows={3} />}
      {books.isError && <ErrorState message={errorMessage(books.error)} onRetry={() => books.refetch()} />}
      {books.data && (
        <>
          <Summary portfolio={books.data} />
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-xl font-black">My books</h2>
              <p className="text-sm text-muted-foreground">
                {books.data.totals.published} published · {books.data.totals.inProduction} in production
              </p>
            </div>
            <div className="grid items-start gap-5 lg:grid-cols-2">
              {books.data.books.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          </section>
        </>
      )}

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-black">Recent support requests</h2>
          <Link href="/tickets" className="text-sm font-bold text-navy-600 hover:underline">
            View all
          </Link>
        </div>
        {tickets.isPending && <ListSkeleton rows={2} />}
        {tickets.data && tickets.data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-8 text-center text-sm text-ink-soft">
            No support requests yet. If anything about your book isn&apos;t right,{" "}
            <Link href="/tickets/new" className="font-bold text-coral-700 underline-offset-2 hover:underline">
              let us know
            </Link>
            .
          </div>
        )}
        {tickets.data && tickets.data.items.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {tickets.data.items.map((t) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-paper">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink">{t.subject}</p>
                    <p className="text-sm text-muted-foreground">
                      #{t.number} · {t.book?.title ?? "General / Account"} · updated {timeAgo(t.lastActivityAt)}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Summary({ portfolio }: { portfolio: BookPortfolio }) {
  const t = portfolio.totals;
  const cards = [
    { icon: BookOpen, label: "Books", value: formatNumber(t.books), sub: `${t.published} live · ${t.inProduction} in production` },
    { icon: ShoppingBag, label: "Copies sold", value: formatNumber(t.copiesSold), sub: "across all platforms" },
    { icon: IndianRupee, label: "Royalty earned", value: inr(t.royaltyEarned), sub: `${inr(t.royaltyPaid)} paid to you` },
    { icon: Wallet, label: "Pending royalty", value: inr(t.royaltyPending), sub: "awaiting the next payout", accent: true },
    {
      icon: CalendarClock,
      label: "Next payout",
      value: formatDate(portfolio.nextPayout.deadline),
      sub: `${portfolio.nextPayout.cycle} royalties, by bank transfer`,
    },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-2xl border p-4 ${c.accent ? "border-coral-200 bg-blush" : "border-line bg-white"}`}>
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <c.icon className="size-4 text-coral-600" />
            {c.label}
          </div>
          <p className="tabular mt-2 text-2xl font-black text-ink">{c.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
        </div>
      ))}
    </section>
  );
}
