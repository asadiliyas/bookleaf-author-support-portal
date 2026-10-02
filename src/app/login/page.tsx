import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandMark, Wordmark } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-bookleaf-wave lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Wordmark subtitle="Author Support" href="/login" />
        <div className="relative z-10 max-w-lg">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-coral-600">Publishing Made Easy</p>
          <h1 className="text-5xl leading-[1.05] font-black text-coral-500">
            Every question answered, by people who know your book.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-soft">
            Check royalties and production status, raise a ticket in seconds, and hear back from the BookLeaf team in
            real time.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-coral-200/70 pt-8">
            {[
              ["22,000+", "titles published"],
              ["1,200+", "books every month"],
              ["India · US · UK", "where your book sells"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="text-xl font-black text-ink">{value}</dt>
                <dd className="mt-1 text-sm text-ink-soft">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-xs text-ink-soft">© BookLeaf Publishing · Author Support & Communication Portal</p>
        <BrandMark className="pointer-events-none absolute -right-24 -bottom-24 size-96 opacity-[0.07]" />
      </section>

      <section className="flex items-center justify-center bg-white px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Wordmark subtitle="Author Support" href="/login" className="mb-10 lg:hidden" />
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
