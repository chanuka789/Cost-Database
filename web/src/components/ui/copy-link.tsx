"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./button";

/** Read-only link with a copy button, for invite and reset links. */
export function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Link"
        className="h-[38px] min-w-0 flex-1 rounded-md border border-qs-border-strong bg-qs-raised px-3 font-mono text-[12px] text-qs-text-secondary outline-none focus-visible:border-qs-brand focus-visible:shadow-[var(--qs-focus-ring)]"
      />
      <Button type="button" variant="outline" onClick={copy} aria-live="polite">
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
