"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** Polls the extraction and refreshes the page when it finishes. */
export function ExtractionProgress({ id, initialStep }: { id: string; initialStep: string }) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    async function poll() {
      while (!stopped) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const res = await fetch(`/api/uploads/${id}`, { cache: "no-store" });
          if (!res.ok) continue;
          const json = await res.json();
          if (json.job?.step) setStep(json.job.step);
          if (json.status !== "PROCESSING") {
            router.refresh();
            return;
          }
        } catch {
          // Network blip: keep polling.
        }
      }
    }
    poll();
    return () => {
      stopped = true;
      clearInterval(tick);
    };
  }, [id, router]);

  return (
    <div className="qs-card flex items-center gap-4 px-5 py-5" role="status" aria-live="polite">
      <Loader2 className="size-6 shrink-0 animate-spin text-qs-brand-text" aria-hidden />
      <div className="flex-1">
        <p className="text-[15px] font-[600]">Extracting items…</p>
        <p className="mt-0.5 text-[13px] text-qs-text-muted">
          {step} · {seconds}s. A 40-page BOQ usually takes under a minute. You can leave this page — it keeps going.
        </p>
      </div>
    </div>
  );
}

export function UploadActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    const res = await fetch(`/api/uploads/${id}/retry`, { method: "POST" });
    setRetrying(false);
    if (!res.ok) return toast.error((await res.json().catch(() => null))?.error ?? "Couldn't start the extraction.");
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button variant="outline" asChild>
        <a href={`/api/uploads/${id}/file`} target="_blank" rel="noopener">
          <ExternalLink aria-hidden />
          Original file
        </a>
      </Button>
      {status === "FAILED" || status === "REVIEW" ? (
        <Button variant={status === "FAILED" ? "default" : "outline"} onClick={retry} disabled={retrying}>
          <RotateCw aria-hidden className={retrying ? "animate-spin" : undefined} />
          Extract again
        </Button>
      ) : null}
      {status === "FAILED" || status === "REVIEW" ? (
        <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 aria-hidden />
          Delete
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this upload?"
        description="The file and everything extracted from it are removed. The project stays. This can't be undone."
        confirmLabel="Delete upload"
        tone="danger"
        onConfirm={async () => {
          const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
          if (!res.ok) return (await res.json().catch(() => null))?.error ?? "Couldn't delete the upload.";
          toast.success("Upload deleted");
          router.push("/uploads");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
