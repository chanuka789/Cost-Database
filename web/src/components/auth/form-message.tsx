import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Inline message under a form: error (danger tint) or success (success tint). */
export function FormMessage({ tone = "error", children, className }: { tone?: "error" | "success"; children: React.ReactNode; className?: string }) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2.5 text-[13px] leading-snug",
        tone === "error" ? "bg-qs-danger-bg text-qs-danger" : "bg-qs-success-bg text-qs-success",
        className,
      )}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
