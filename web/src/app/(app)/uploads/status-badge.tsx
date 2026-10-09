import { Badge, type BadgeTone } from "@/components/ui/badge";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PROCESSING: { label: "Extracting", tone: "info" },
  REVIEW: { label: "Needs review", tone: "warning" },
  PUBLISHED: { label: "Published", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
