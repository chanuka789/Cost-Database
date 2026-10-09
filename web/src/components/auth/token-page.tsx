import Link from "next/link";
import { findValidToken } from "@/lib/auth-tokens";
import { FormMessage } from "./form-message";
import { SetPasswordForm } from "./set-password-form";

const PROBLEM = {
  invalid: "This link isn't valid. Check you copied the whole link, or ask an admin for a new one.",
  used: "This link has already been used. If you've forgotten your password, ask for a new reset link.",
  expired: "This link has expired. Links work for 48 hours — ask an admin for a new one.",
};

/** Server part of the invite / reset pages: checks the link before showing the form. */
export async function TokenPage({ token, type }: { token: string | undefined; type: "INVITE" | "RESET" }) {
  const found = await findValidToken(token ?? "", type);
  if (found.state !== "valid" || found.user.status === "DISABLED") {
    const problem = found.state === "valid" ? "This account is disabled. Contact an admin." : PROBLEM[found.state];
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-center text-[22px] leading-tight font-[600]">Link can&apos;t be used</h1>
        <FormMessage>{problem}</FormMessage>
        <Link href="/login" className="text-center text-[13px] text-qs-brand-text hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }
  return <SetPasswordForm token={token!} type={type} email={found.user.email} />;
}
