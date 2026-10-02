"use client";

import { BookText, Inbox, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";
import type { Me } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Ticket queue", icon: Inbox, match: (p: string) => p === "/admin" || p.startsWith("/admin/tickets") },
  { href: "/admin/insights", label: "AI insights", icon: Sparkles, match: (p: string) => p.startsWith("/admin/insights") },
];

export function AdminShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white px-4 py-5 lg:flex">
        <Wordmark subtitle="Support Desk" href="/admin" className="px-2" />
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition",
                  active ? "bg-blush font-bold text-coral-800" : "text-ink-soft hover:bg-paper hover:text-ink",
                )}
              >
                <item.icon className={cn("size-4", active && "text-coral-600")} />
                {item.label}
              </Link>
            );
          })}
          <a href="/api-docs" target="_blank" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-ink-soft transition hover:bg-paper hover:text-ink">
            <BookText className="size-4" />
            API docs
          </a>
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <UserMenu me={me} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <Wordmark subtitle="Support Desk" href="/admin" />
          <nav className="ml-auto flex gap-1">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-label={item.label} className={cn("rounded-lg p-2", item.match(pathname) ? "bg-blush text-coral-700" : "text-ink-soft")}>
                <item.icon className="size-5" />
              </Link>
            ))}
          </nav>
          <UserMenu me={me} compact />
        </header>
        <main className="w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
