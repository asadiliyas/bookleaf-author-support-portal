import type { Metadata } from "next";
import { Suspense } from "react";
import { TicketQueue } from "@/components/admin/ticket-queue";

export const metadata: Metadata = { title: "Ticket queue" };

export default function AdminQueuePage() {
  return (
    <Suspense>
      <TicketQueue />
    </Suspense>
  );
}
