"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SessionResponse } from "@/lib/api-types";
import { api, errorMessage } from "@/lib/client/api";
import { loginSchema, type LoginInput } from "@/lib/schemas";

/** Seeded demo accounts (see scripts/seed.ts), shown so reviewers can sign in with one click. */
const DEMO_PASSWORD = "BookLeaf@2026";
const DEMO_AUTHORS = [
  { name: "Ananya Reddy", email: "ananya.reddy@email.com", hint: "Never been paid: ₹2,546 pending" },
  { name: "Kavita Deshmukh", email: "kavita.deshmukh@email.com", hint: "Book in typesetting · ₹850 below threshold" },
  { name: "Sneha Kulkarni", email: "sneha.kulkarni@email.com", hint: "3 books, one in cover design" },
  { name: "Farhan Sheikh", email: "farhan.sheikh@email.com", hint: "ISBN mismatch ticket" },
  { name: "Vikram Joshi", email: "vikram.joshi@email.com", hint: "Print-quality ticket in progress" },
  { name: "Rohit Kapoor", email: "rohit.kapoor@email.com", hint: "Best-seller, royalty question" },
];
const DEMO_ADMINS = [
  { name: "Riya Mehta", email: "admin@bookleaf.demo", hint: "Support lead" },
  { name: "Karan Bhatia", email: "support@bookleaf.demo", hint: "Support agent" },
];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    try {
      const session = await api<SessionResponse>("/auth/login", { method: "POST", json: values });
      const next = params.get("next");
      const home = session.user.role === "admin" ? "/admin" : "/dashboard";
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      const allowed = safeNext && (session.user.role === "admin") === safeNext.startsWith("/admin");
      router.replace(allowed ? safeNext : home);
      router.refresh();
    } catch (err) {
      setServerError(errorMessage(err));
    }
  }

  function fill(email: string) {
    form.setValue("email", email, { shouldValidate: true });
    form.setValue("password", DEMO_PASSWORD, { shouldValidate: true });
    setServerError(null);
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <div>
      <h2 className="text-3xl font-black text-ink">Welcome back</h2>
      <p className="mt-2 text-ink-soft">Sign in to your BookLeaf account.</p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" className="h-11 bg-white" placeholder="you@example.com" aria-invalid={!!errors.email} {...form.register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" className="h-11 bg-white" aria-invalid={!!errors.password} {...form.register("password")} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        {serverError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {serverError}
          </p>
        )}
        <Button type="submit" disabled={isSubmitting} className="h-11 w-full rounded-full text-base font-bold">
          {isSubmitting ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          Sign in
        </Button>
      </form>

      <div className="mt-10 rounded-2xl border border-line bg-paper p-4">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <KeyRound className="size-4 text-coral-600" />
          <span className="font-bold text-ink">Demo accounts</span>
          <span className="text-muted-foreground">
            · password <code className="rounded bg-white px-1.5 py-0.5 text-xs text-ink ring-1 ring-line">{DEMO_PASSWORD}</code>
          </span>
        </div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Authors</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {DEMO_AUTHORS.map((a) => (
            <button key={a.email} type="button" onClick={() => fill(a.email)} className="rounded-lg bg-white px-3 py-2 text-left ring-1 ring-line transition hover:ring-coral-300">
              <span className="block text-sm font-bold text-ink">{a.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="size-3.5" /> BookLeaf team
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {DEMO_ADMINS.map((a) => (
            <button key={a.email} type="button" onClick={() => fill(a.email)} className="rounded-lg bg-white px-3 py-2 text-left ring-1 ring-line transition hover:ring-navy-500/40">
              <span className="block text-sm font-bold text-ink">{a.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.hint} · {a.email}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
