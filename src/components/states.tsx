import { AlertCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./ui/skeleton";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-14 text-center", className)}>
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-blush">
        <Icon className="size-5 text-coral-600" />
      </div>
      <p className="font-bold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p className="font-bold">We couldn&apos;t load this.</p>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="font-bold underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl bg-coral-100/40" />
      ))}
    </div>
  );
}
