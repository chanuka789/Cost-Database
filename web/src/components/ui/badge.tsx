import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

/** 20px, 11px/600, tinted by tone. Always carries a word — status never relies on colour alone. */
function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      data-slot="badge"
      data-tone={tone === "neutral" ? undefined : tone}
      className={cn("qs-badge", className)}
      {...props}
    />
  );
}

export { Badge };
