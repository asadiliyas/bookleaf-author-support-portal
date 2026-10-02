import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthorDashboard } from "@/components/author/author-dashboard";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "My Books" };

export default async function DashboardPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  return <AuthorDashboard me={me} />;
}
