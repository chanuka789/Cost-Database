import { cn } from "@/lib/utils";

/** Page title block: optional eyebrow, 20/22px title, description, and actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-semibold tracking-[0.16em] text-qs-text-muted uppercase">{eyebrow}</p> : null}
        <h1 className={cn("text-[20px] leading-tight font-[600] sm:text-[22px]", eyebrow && "mt-1.5")}>{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[13.5px] leading-6 text-qs-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Empty state: icon, short title, one line of help, optional action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="qs-card flex flex-col items-center px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center rounded-lg bg-qs-hover text-qs-text-muted">
        <Icon className="size-5" aria-hidden />
      </div>
      <h2 className="mt-4 text-[15px] font-[600]">{title}</h2>
      <p className="mt-1.5 max-w-md text-[13px] leading-6 text-qs-text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
