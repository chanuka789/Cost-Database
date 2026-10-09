"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/auth/form-message";
import { inviteUser } from "@/app/actions/users";
import { LinkResult } from "./link-result";

export function InviteUserButton({ emailEnabled }: { emailEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ link: string; emailed: boolean; email: string } | null>(null);

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTimeout(() => {
        setRole("USER");
        setError(null);
        setResult(null);
      }, 200);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    setPending(true);
    setError(null);
    const res = await inviteUser({ name: String(form.get("name") ?? ""), email, role });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setResult({ ...res.data, email: email.trim().toLowerCase() });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus aria-hidden />
        Invite user
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{result ? "Invitation created" : "Invite user"}</DialogTitle>
            {!result ? (
              <DialogDescription>
                {emailEnabled
                  ? "They'll get an email with a link to set their password."
                  : "You'll get a link to send them. They use it to set their password."}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {result ? (
            <>
              <LinkResult {...result} kind="invite" />
              <DialogFooter>
                <Button onClick={() => reset(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-name">Full name</Label>
                <Input id="invite-name" name="name" required autoFocus placeholder="Ahmed Al Mansoori" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" name="email" type="email" required placeholder="name@qsgs.com" />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[12.5px] font-semibold text-qs-text-secondary" id="invite-role-label">
                  Role
                </span>
                <div className="qs-segmented w-fit" role="radiogroup" aria-labelledby="invite-role-label">
                  {(["USER", "ADMIN"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={role === r}
                      className="qs-segmented-item"
                      onClick={() => setRole(r)}
                    >
                      {r === "USER" ? "User" : "Admin"}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-qs-text-muted">
                  {role === "USER" ? "Can search rates and view projects." : "Can also upload BOQs, manage users and change lists."}
                </p>
              </div>
              {error ? <FormMessage>{error}</FormMessage> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => reset(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Inviting…" : "Send invite"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
