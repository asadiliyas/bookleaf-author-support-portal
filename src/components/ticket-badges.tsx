import {
  AlertTriangle,
  BookOpenCheck,
  Bot,
  CircleDot,
  Clock,
  Factory,
  Hash,
  HelpCircle,
  IndianRupee,
  Printer,
  Ruler,
  Store,
  UserRound,
} from "lucide-react";
import type { ClassificationSource, TicketCategory, TicketPriority, TicketStatus } from "@/lib/domain/constants";
import { CATEGORY_LABELS, CATEGORY_SHORT_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/domain/constants";
import { formatDuration, type SlaInfo } from "@/lib/domain/sla";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap";

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: "bg-navy-50 text-navy-700 ring-1 ring-navy-100",
  in_progress: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/70",
  resolved: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70",
  closed: "bg-stone-100 text-stone-600 ring-1 ring-stone-200",
};

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span className={cn(pill, STATUS_STYLES[status], className)}>
      <CircleDot className="size-3" />
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  medium: "bg-sky-50 text-sky-800 ring-1 ring-sky-200/70",
  low: "bg-stone-100 text-stone-600 ring-1 ring-stone-200",
};

export const PRIORITY_STRIPE: Record<TicketPriority, string> = {
  critical: "bg-red-600",
  high: "bg-orange-400",
  medium: "bg-sky-300",
  low: "bg-stone-200",
};

export function PriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  return (
    <span className={cn(pill, PRIORITY_STYLES[priority], className)}>
      {priority === "critical" && <AlertTriangle className="size-3" />}
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export const CATEGORY_ICONS: Record<TicketCategory, React.ComponentType<{ className?: string }>> = {
  royalty_payments: IndianRupee,
  isbn_metadata: Hash,
  printing_quality: Printer,
  distribution_availability: Store,
  book_status_production: Factory,
  general_inquiry: HelpCircle,
};

export function CategoryBadge({
  category,
  short,
  className,
}: {
  category: TicketCategory;
  short?: boolean;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span className={cn(pill, "bg-white font-normal text-ink-soft ring-1 ring-line", className)}>
      <Icon className="size-3 text-coral-600" />
      {short ? CATEGORY_SHORT_LABELS[category] : CATEGORY_LABELS[category]}
    </span>
  );
}

const SOURCE_META: Record<ClassificationSource, { icon: React.ComponentType<{ className?: string }>; label: string; className: string }> = {
  ai: { icon: Bot, label: "Classified by AI", className: "text-navy-600" },
  fallback: { icon: Ruler, label: "Rule-based fallback (AI unavailable or pending): worth a quick check", className: "text-amber-700" },
  admin: { icon: UserRound, label: "Set manually by the ops team", className: "text-emerald-700" },
};

export function SourceIcon({ source, className }: { source: ClassificationSource; className?: string }) {
  const meta = SOURCE_META[source];
  const Icon = meta.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", meta.className, className)} aria-label={meta.label}>
          <Icon className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{meta.label}</TooltipContent>
    </Tooltip>
  );
}

export function SlaBadge({ sla }: { sla: SlaInfo }) {
  if (sla.state === "responded" || sla.state === "not_applicable") return null;
  const styles = {
    breached: "bg-red-50 text-red-700 ring-1 ring-red-200",
    at_risk: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    on_track: "bg-stone-50 text-stone-600 ring-1 ring-stone-200",
  }[sla.state];
  const text =
    sla.state === "breached" ? `Overdue ${formatDuration(sla.remainingMs)}` : `${formatDuration(sla.remainingMs)} left`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(pill, "font-bold", styles)}>
          <Clock className="size-3" />
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent>First-response target: {sla.targetHours}h for this priority</TooltipContent>
    </Tooltip>
  );
}

export function BookStatusPill({ published, label }: { published: boolean; label: string }) {
  return (
    <span
      className={cn(
        pill,
        published ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200/70",
      )}
    >
      <BookOpenCheck className="size-3" />
      {label}
    </span>
  );
}
