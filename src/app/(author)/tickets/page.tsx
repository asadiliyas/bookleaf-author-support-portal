import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthorTicketList } from "@/components/author/author-ticket-list";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "My Tickets" };

export default async function TicketsPage() {
  const me = await getCurrentUser();
  if (!me?.authorId) redirect("/login");
  return <AuthorTicketList authorId={me.authorId} />;
}
