import { AlertTriangle, CheckCircle2, Clock3, Info, MessageSquarePlus, PiggyBank } from "lucide-react";
import Link from "next/link";
import { BookStatusPill } from "@/components/ticket-badges";
import type { Book } from "@/lib/api-types";
import { DISTRIBUTION_PLATFORMS, PRODUCTION_STAGES, STAGE_LABELS, stageIndex } from "@/lib/domain/constants";
import type { RoyaltyState } from "@/lib/domain/royalty";
import { formatDate, formatNumber, inr } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROYALTY_TONE: Record<RoyaltyState, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
  not_published: { className: "bg-stone-50 text-stone-700 ring-stone-200", icon: Info },
  no_earnings: { className: "bg-stone-50 text-stone-700 ring-stone-200", icon: Info },
  paid_up: { className: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: CheckCircle2 },
  below_threshold: { className: "bg-navy-50 text-navy-700 ring-navy-100", icon: PiggyBank },
  scheduled: { className: "bg-navy-50 text-navy-700 ring-navy-100", icon: Clock3 },
  likely_overdue: { className: "bg-amber-50 text-amber-900 ring-amber-200", icon: AlertTriangle },
};

export function BookCard({ book }: { book: Book }) {
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-white p-5 shadow-[0_1px_0_rgba(43,38,39,0.03)]">
      <header className="flex items-start gap-4">
        <BookSpine title={book.title} />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug font-black">{book.title}</h3>
          <p className="text-sm text-muted-foreground">{book.genre}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <BookStatusPill published={book.isPublished} label={book.statusLabel} />
            <span className="font-mono text-xs text-muted-foreground">ISBN {book.isbn}</span>
          </div>
        </div>
      </header>

      {book.isPublished ? <PublishedDetails book={book} /> : <ProductionDetails book={book} />}

      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-xs text-muted-foreground">
          {book.printPartner ? `Printed by ${book.printPartner}` : "Print partner assigned at printing stage"}
        </span>
        <Link
          href={`/tickets/new?book=${book.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-coral-700 hover:underline"
        >
          <MessageSquarePlus className="size-4" /> Get help with this book
        </Link>
      </footer>
    </article>
  );
}

function PublishedDetails({ book }: { book: Book }) {
  const tone = ROYALTY_TONE[book.royalty.state];
  const paidShare = book.royaltyEarned > 0 ? (book.royaltyPaid / book.royaltyEarned) * 100 : 0;
  return (
    <div className="my-5 space-y-4">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Published" value={formatDate(book.publicationDate)} />
        <Stat label="MRP" value={inr(book.mrp)} />
        <Stat label="Royalty / copy" value={inr(book.royaltyPerCopy)} />
        <Stat label="Copies sold" value={formatNumber(book.copiesSold)} />
        <Stat label="Last payout" value={formatDate(book.lastPayoutDate, "Not yet")} />
        <Stat label="Earned" value={inr(book.royaltyEarned)} />
      </dl>

      <div>
        <div className="mb-1.5 flex justify-between text-sm">
          <span>
            <span className="font-bold text-ink">{inr(book.royaltyPaid)}</span> <span className="text-muted-foreground">paid</span>
          </span>
          <span>
            <span className="font-bold text-coral-700">{inr(book.royaltyPending)}</span>{" "}
            <span className="text-muted-foreground">pending</span>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-coral-100" role="img" aria-label={`${Math.round(paidShare)}% of earned royalty paid`}>
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidShare}%` }} />
        </div>
      </div>

      <p className={cn("flex gap-2 rounded-xl px-3 py-2.5 text-sm ring-1", tone.className)}>
        <tone.icon className="mt-0.5 size-4 shrink-0" />
        <span>{book.royalty.summary}</span>
      </p>

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Available on</p>
        <div className="flex flex-wrap gap-1.5">
          {DISTRIBUTION_PLATFORMS.map((p) => {
            const listed = book.availableOn.includes(p);
            return (
              <span
                key={p}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs",
                  listed ? "bg-paper font-bold text-ink ring-1 ring-line" : "text-muted-foreground/70 line-through decoration-stone-300",
                )}
                title={listed ? `Listed on ${p}` : `Not listed on ${p}`}
              >
                {p}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProductionDetails({ book }: { book: Book }) {
  const current = stageIndex(book.stage);
  return (
    <div className="my-5 space-y-4">
      <div>
        <p className="mb-3 text-sm">
          <span className="font-bold text-ink">Stage {current + 1} of {PRODUCTION_STAGES.length}:</span>{" "}
          <span className="text-ink-soft">{STAGE_LABELS[book.stage]}</span>
        </p>
        <ol className="grid grid-cols-9 gap-1" aria-label="Production progress">
          {PRODUCTION_STAGES.map((s, i) => (
            <li key={s} title={STAGE_LABELS[s]} className="space-y-1">
              <div className={cn("h-2 rounded-full", i < current ? "bg-emerald-500" : i === current ? "animate-pulse bg-coral-500" : "bg-stone-200")} />
            </li>
          ))}
        </ol>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span>Manuscript</span>
          <span>Published & Live</span>
        </div>
      </div>
      <p className="flex gap-2 rounded-xl bg-stone-50 px-3 py-2.5 text-sm text-stone-700 ring-1 ring-stone-200">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          MRP, sales and royalties will appear here once your book is published. You&apos;ll get an email at every stage.
          {(book.stage === "cover_design" || book.stage === "proofreading") &&
            " This stage usually waits on your approval: if we're waiting on you, a quick reply keeps things moving."}
        </span>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 font-bold text-ink">{value}</dd>
    </div>
  );
}

/** A small generated "cover" so cards feel like books without needing artwork. */
function BookSpine({ title }: { title: string }) {
  const hues = ["from-coral-400 to-coral-600", "from-navy-500 to-navy-700", "from-amber-400 to-orange-500", "from-emerald-400 to-teal-600", "from-rose-300 to-coral-500"];
  const hue = hues[[...title].reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
  return (
    <div className={cn("relative grid h-20 w-14 shrink-0 place-items-center rounded-md bg-gradient-to-br text-center shadow-md", hue)} aria-hidden>
      <span className="absolute inset-y-0 left-1 w-px bg-white/30" />
      <span className="px-1 text-[9px] leading-tight font-bold text-white/95">{title.split(" ").slice(0, 3).join(" ")}</span>
    </div>
  );
}
