import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthorTicketView } from "@/components/author/author-ticket-view";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const [{ ticketId }, me] = await Promise.all([params, getCurrentUser()]);
  if (!me) redirect("/login");
  return <AuthorTicketView ticketId={ticketId} me={me} />;
}
