"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Me } from "@/lib/api-types";
import { api } from "@/lib/client/api";
import { browserSupabase } from "@/lib/client/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-full bg-coral-100 text-xs font-bold text-coral-700 ${className}`}>
      {initials(name)}
    </span>
  );
}

export function UserMenu({ me, compact }: { me: Me; compact?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    await browserSupabase().auth.signOut().catch(() => undefined);
    queryClient.clear();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-left outline-none hover:bg-blush focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar name={me.name} />
        {!compact && (
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-bold text-ink">{me.name}</span>
            <span className="text-xs text-muted-foreground">{me.role === "admin" ? "BookLeaf Ops" : me.authorId}</span>
          </span>
        )}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="font-bold text-ink">{me.name}</p>
          <p className="truncate text-xs text-muted-foreground">{me.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
