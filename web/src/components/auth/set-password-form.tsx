"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/auth/form-message";
import { PasswordInput } from "@/components/auth/password-input";
import { setPasswordWithToken, syncThemeCookie } from "@/app/actions/account";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";

/** Used by both the invite link (set your first password) and the reset link. */
export function SetPasswordForm({ token, type, email }: { token: string; type: "INVITE" | "RESET"; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    setPending(true);
    setError(null);
    const res = await setPasswordWithToken({ token, type, password, confirm: String(form.get("confirm") ?? "") });
    if (!res.ok) {
      setError(res.error);
      setPending(false);
      return;
    }
    // Sign straight in with the new password.
    const login = await signIn("credentials", { email: res.data.email, password, redirect: false });
    // Full page loads (not router.push) so the root layout re-reads the theme cookie.
    if (login?.ok && !login.error) {
      await syncThemeCookie();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } else {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?notice=password-set");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="text-center">
        <h1 className="text-[22px] leading-tight font-[600]">{type === "INVITE" ? "Set your password" : "Choose a new password"}</h1>
        <p className="mt-1.5 text-[13px] text-qs-text-muted">{email}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" required autoFocus />
        <p className="text-[12px] text-qs-text-muted">At least {PASSWORD_MIN_LENGTH} characters, with letters and numbers.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
      <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
        {pending ? "Saving…" : type === "INVITE" ? "Set password and sign in" : "Save password and sign in"}
      </Button>
    </form>
  );
}
