"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import type { Me } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "My Books" },
  { href: "/tickets", label: "My Tickets" },
];

export function AuthorNav({ me }: { me: Me }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Wordmark subtitle="Author Support" href="/dashboard" />
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href || (l.href === "/tickets" && pathname.startsWith("/tickets") && pathname !== "/tickets/new");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-full px-4 py-2 text-[15px] transition",
                  active ? "font-bold text-navy-600" : "text-ink-soft hover:text-navy-600",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Button asChild className="hidden h-9 rounded-full px-4 font-bold sm:inline-flex">
            <Link href="/tickets/new">
              <Plus /> New support request
            </Link>
          </Button>
          <UserMenu me={me} />
        </div>
      </div>
      <nav className="flex gap-1 border-t border-line px-4 py-1.5 md:hidden">
        {[...LINKS, { href: "/tickets/new", label: "New request" }].map((l) => (
          <Link key={l.href} href={l.href} className={cn("rounded-full px-3 py-1.5 text-sm", pathname === l.href ? "bg-blush font-bold text-coral-700" : "text-ink-soft")}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
