import { CopyLink } from "@/components/ui/copy-link";
import { FormMessage } from "@/components/auth/form-message";

/** Shown after an invite or reset link is created: the link, plus whether it was emailed. */
export function LinkResult({ link, emailed, email, kind }: { link: string; emailed: boolean; email: string; kind: "invite" | "reset" }) {
  return (
    <div className="flex flex-col gap-3">
      <FormMessage tone="success">
        {emailed ? (
          <>
            We emailed the {kind} link to <strong className="font-[600]">{email}</strong>. You can also copy it below.
          </>
        ) : (
          <>
            Copy this link and send it to <strong className="font-[600]">{email}</strong>. Email sending isn&apos;t set up yet.
          </>
        )}
      </FormMessage>
      <CopyLink value={link} />
      <p className="text-[12px] text-qs-text-muted">The link works once and expires in 48 hours. Creating a new link cancels this one.</p>
    </div>
  );
}
