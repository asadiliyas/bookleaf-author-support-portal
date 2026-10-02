import type { Metadata } from "next";
import { Suspense } from "react";
import { NewTicketForm } from "@/components/author/new-ticket-form";

export const metadata: Metadata = { title: "New support request" };

export default function NewTicketPage() {
  return (
    <Suspense>
      <NewTicketForm />
    </Suspense>
  );
}
