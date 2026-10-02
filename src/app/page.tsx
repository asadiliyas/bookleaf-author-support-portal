import { redirect } from "next/navigation";

// The proxy sends signed-in users to their home; everyone else lands on sign-in.
export default function Home() {
  redirect("/login");
}
