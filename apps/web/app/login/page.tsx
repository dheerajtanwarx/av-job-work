"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert } from "lucide-react";
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
      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-md border border-danger/25 bg-danger-subtle px-3 py-2 text-[13px] text-danger">
          <CircleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Log in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-[340px]">
        <div className="mb-8 flex items-center gap-2 text-[13px] font-semibold">
          <span className="grid size-6 place-items-center rounded bg-accent-solid text-xs leading-none font-semibold text-on-accent">J</span>
            AV JOB WORK
        </div>
        <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Log in</h1>
        <p className="mt-1 mb-6 text-[13px] text-fg-muted">Every piece sent, every piece back, every rupee owed.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
