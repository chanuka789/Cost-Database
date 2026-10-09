"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/auth/form-message";
import { PasswordInput } from "@/components/auth/password-input";
import { changeMyPassword, updateMyName, updateMyTheme } from "@/app/actions/account";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { applyThemeToDocument } from "@/lib/apply-theme";

export function SettingsForms({ name, email, theme }: { name: string; email: string; theme: "light" | "dark" }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <ProfileCard name={name} email={email} />
      <ThemeCard theme={theme} />
      <PasswordCard />
    </div>
  );
}

function ProfileCard({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const res = await updateMyName({ name: String(new FormData(e.currentTarget).get("name") ?? "") });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    toast.success("Name saved");
    router.refresh();
  }
  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="contents">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your email is your sign-in. Ask an admin to change it.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-name">Full name</Label>
            <Input id="settings-name" name="name" defaultValue={name} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-email">Email</Label>
            <Input id="settings-email" value={email} disabled readOnly />
          </div>
          {error ? <FormMessage>{error}</FormMessage> : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save name"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function ThemeCard({ theme: initial }: { theme: "light" | "dark" }) {
  const [theme, setTheme] = useState(initial);
  async function choose(next: "light" | "dark") {
    if (next === theme) return;
    setTheme(next);
    applyThemeToDocument(next);
    const res = await updateMyTheme(next);
    if (!res.ok) toast.error(res.error);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Saved to your account, so it&apos;s the same on every device.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="qs-segmented" role="radiogroup" aria-label="Theme">
          {(
            [
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
            ] as const
          ).map(([key, label, Icon]) => (
            <button key={key} type="button" role="radio" aria-checked={theme === key} className="qs-segmented-item" onClick={() => choose(key)}>
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const res = await changeMyPassword({
      current: String(form.get("current") ?? ""),
      password: String(form.get("password") ?? ""),
      confirm: String(form.get("confirm") ?? ""),
    });
    if (!res.ok) {
      setPending(false);
      return setError(res.error);
    }
    // Every session, including this one, is now signed out.
    await signOut({ callbackUrl: "/login?notice=password-changed" });
  }
  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="contents">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing it signs you out everywhere. You&apos;ll sign in again with the new one.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-current">Current password</Label>
            <PasswordInput id="pw-current" name="current" autoComplete="current-password" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pw-new">New password</Label>
              <PasswordInput id="pw-new" name="password" autoComplete="new-password" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <PasswordInput id="pw-confirm" name="confirm" autoComplete="new-password" required />
            </div>
          </div>
          <p className="text-[12px] text-qs-text-muted">At least {PASSWORD_MIN_LENGTH} characters, with letters and numbers.</p>
          {error ? <FormMessage>{error}</FormMessage> : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Changing…" : "Change password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
