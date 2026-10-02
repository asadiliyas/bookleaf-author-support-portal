import { redirect } from "next/navigation";
import { AuthorNav } from "@/components/author/author-nav";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function AuthorLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "author") redirect("/admin");

  return (
    <div className="min-h-screen">
      <AuthorNav me={me} />
      <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-20 sm:px-6">{children}</main>
    </div>
  );
}
