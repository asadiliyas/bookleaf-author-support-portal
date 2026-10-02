import Link from "next/link";
import { cn } from "@/lib/utils";

/** BookLeaf's coral square with the white slash. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-9 shrink-0", className)}>
      <rect width="40" height="40" rx="4" fill="#E9566A" />
      <path d="M23.5 9.5 15.5 30.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ subtitle, href = "/", className }: { subtitle?: string; href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-normal tracking-tight text-ink">
          BookLeaf <span className="font-light">Publishing</span>
        </span>
        {subtitle && (
          <span className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-coral-600">{subtitle}</span>
        )}
      </span>
    </Link>
  );
}
