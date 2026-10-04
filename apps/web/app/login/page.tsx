"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/login", { email, password });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <Input type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="rounded-lg bg-madder-50 px-3 py-2 text-sm text-madder">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Log in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-indigo p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 14px), repeating-linear-gradient(-45deg, #fff 0 1px, transparent 1px 14px)",
          }}
        />
        <div className="relative font-display text-xl font-semibold">Job Work Ledger</div>
        <div className="relative max-w-md">
          <p className="font-display text-4xl leading-tight font-medium">
            Every piece sent.
            <br />
            Every piece back.
            <br />
            <span className="text-marigold">Every rupee owed.</span>
          </p>
          <div className="mt-8 flex items-center gap-3 text-sm text-white/75">
            <span className="rounded-full bg-white/10 px-3 py-1">Sent</span>→<span className="rounded-full bg-white/10 px-3 py-1">Received</span>→
            <span className="rounded-full bg-marigold px-3 py-1 font-semibold text-ink">Pending</span>
          </div>
        </div>
        <div className="relative text-sm text-white/60">Embroidery · Printing · Stitching · Finishing</div>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise">
          <h1 className="font-display text-3xl font-semibold text-ink">Welcome back</h1>
          <p className="mt-1 mb-8 text-muted">Log in to see where all your material is.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
