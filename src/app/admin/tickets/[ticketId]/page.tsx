import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TicketWorkspace } from "@/components/admin/ticket-workspace";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Ticket" };

export default async function AdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const [{ ticketId }, me] = await Promise.all([params, getCurrentUser()]);
  if (!me) redirect("/login");
  return <TicketWorkspace ticketId={ticketId} me={me} />;
}
