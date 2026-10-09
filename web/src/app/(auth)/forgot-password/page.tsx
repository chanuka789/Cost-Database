"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/auth/form-message";
import { requestPasswordReset } from "@/app/actions/account";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await requestPasswordReset({ email: String(new FormData(e.currentTarget).get("email") ?? "") });
    setPending(false);
    if (res.ok) setSent(true);
    else setError(res.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-[22px] leading-tight font-[600]">Forgot password</h1>
        <p className="mt-1.5 text-[13px] text-qs-text-muted">We&apos;ll send a link to set a new one.</p>
      </div>
      {sent ? (
        <FormMessage tone="success">
          If an account exists for that email, a reset link is on its way. Didn&apos;t get it? Ask an admin for a reset link.
        </FormMessage>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="name@qsgs.com" required autoFocus />
          </div>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <Link href="/login" className="text-center text-[13px] text-qs-brand-text hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
