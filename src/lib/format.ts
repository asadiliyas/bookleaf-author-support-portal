import { formatDistanceToNowStrict } from "date-fns";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** ₹12,345 (Indian digit grouping). Null-safe for unpublished books. */
export function inr(value: number | string | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return inrFormatter.format(Number(value));
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

/** "2 Oct 2026" */
export function formatDate(value: string | Date | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(typeof value === "string" && value.length === 10 ? { timeZone: "UTC" } : {}),
  });
}

/** "2 Oct 2026, 14:05" in the viewer's timezone. */
export function formatDateTime(value: string | Date | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "3 hours ago" */
export function timeAgo(value: string | Date): string {
  return formatDistanceToNowStrict(typeof value === "string" ? new Date(value) : value, { addSuffix: true });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
