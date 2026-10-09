"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Check, ChevronLeft, ChevronRight, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/ui/select-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ReviewData, ReviewItem } from "@/lib/review-data";
import {
  flagKey,
  unresolved,
  type ReviewAction,
} from "@/lib/review-validation";
import type { Flag } from "@/lib/extraction-schema";
const PdfPreview = dynamic(
  () => import("@/components/review/pdf-preview").then((m) => m.PdfPreview),
  {
    ssr: false,
    loading: () => <p className="p-4 text-[13px]">Loading PDF viewer…</p>,
  },
);
type Mutate = (operation: ReviewAction) => Promise<boolean>;

function Checks({
  flags,
  accepted,
  itemId,
  mutate,
  disabled,
}: {
  flags: Flag[];
  accepted: { key: string; reason: string }[];
  itemId?: string;
  mutate: Mutate;
  disabled: boolean;
}) {
  const [accepting, setAccepting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      {flags.map((flag, index) => {
        const key = flagKey(flag);
        const acceptance = accepted.find((a) => a.key === key);
        return (
          <div key={`${key}-${index}`} className="text-[12px]">
            <div className="flex items-start gap-2">
              <Badge
                tone={
                  acceptance
                    ? "success"
                    : flag.severity === "error"
                      ? "danger"
                      : "warning"
                }
              >
                {acceptance ? "Accepted" : flag.severity}
              </Badge>
              <span className="flex-1">{flag.message}</span>
              {!acceptance ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => setAccepting(key)}
                >
                  Accept
                </Button>
              ) : null}
            </div>
            {acceptance ? (
              <p className="mt-1 text-qs-text-muted">
                Reason: {acceptance.reason}
              </p>
            ) : null}
            {accepting === key ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  aria-label="Reason for accepting this check"
                  placeholder="Explain why the source value is correct"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-w-40 flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || reason.trim().length < 5}
                  onClick={async () => {
                    if (await mutate({ action: "accept", itemId, key, reason }))
                      setAccepting(null);
                  }}
                >
                  Save acceptance
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAccepting(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
function TextEditor({
  label,
  initial,
  save,
  disabled,
}: {
  label: string;
  initial: string;
  save: (value: string) => Promise<boolean>;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initial);
  return editing ? (
    <div className="space-y-2">
      <Textarea
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={async () => {
            if (await save(text)) setEditing(false);
          }}
        >
          Save {label.toLowerCase()}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex items-start gap-2">
      <p className="flex-1 whitespace-pre-line text-[13px]">
        {initial || `No ${label.toLowerCase()}`}
      </p>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Edit ${label.toLowerCase()}`}
        disabled={disabled}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
    </div>
  );
}
function ItemEditor({
  item,
  mutate,
  close,
  disabled,
}: {
  item: ReviewItem;
  mutate: Mutate;
  close: () => void;
  disabled: boolean;
}) {
  const [fields, setFields] = useState({
    itemRef: item.itemRef,
    description: item.description,
    unit: item.unit ?? "",
    qty: item.qty ?? "",
    rate: item.rate ?? "",
    amount: item.amount ?? "",
    rateNote: item.rateNote ?? "",
  });
  return (
    <form
      className="space-y-3 border-t border-qs-border bg-qs-raised p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const nullable = (v: string) => v.trim() || null;
        if (
          await mutate({
            action: "item",
            itemId: item.id,
            fields: {
              ...fields,
              unit: nullable(fields.unit),
              qty: nullable(fields.qty),
              rate: nullable(fields.rate),
              amount: nullable(fields.amount),
              rateNote: nullable(fields.rateNote),
            },
          })
        )
          close();
      }}
    >
      <label className="block text-[12px]">
        Item description
        <Textarea
          value={fields.description}
          onChange={(e) =>
            setFields({ ...fields, description: e.target.value })
          }
        />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(
          [
            ["itemRef", "Reference"],
            ["qty", "Quantity"],
            ["unit", "Unit"],
            ["rate", "Rate"],
            ["amount", "Amount"],
            ["rateNote", "Rate note"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-[12px]">
            {label}
            <Input
              value={fields[key]}
              inputMode={
                ["qty", "rate", "amount"].includes(key) ? "decimal" : undefined
              }
              onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p className="text-[12px] text-qs-text-muted">
        Numbers stay as entered. Saving rechecks quantity × rate and clears this
        item’s review.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={disabled} type="submit">
          Save item
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
export function ReviewWorkspace({ doc }: { doc: ReviewData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const aiRunning = doc.aiStatus === "RUNNING" || doc.aiStatus === "QUEUED";
  const busy = saving || pending || aiRunning;
  useEffect(() => {
    if (!aiRunning) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [aiRunning, router]);
  const [page, setPage] = useState(
    () =>
      doc.bills.flatMap((b) =>
        b.sections.flatMap((s) => s.groups.flatMap((g) => g.items)),
      )[0]?.page ?? 1,
  );
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<ReviewItem | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [bulk, setBulk] = useState("check");
  const [bulkText, setBulkText] = useState("");
  const [target, setTarget] = useState("");
  const [publish, setPublish] = useState(false);
  const groups = doc.bills.flatMap((b) => b.sections.flatMap((s) => s.groups));
  const items = groups.flatMap((g) => g.items);
  const itemIds = new Set(items.map(i => i.id));
  const archivedAi = doc.aiSuggestions.filter(s => !itemIds.has(s.itemId));
  const checked = items.filter((i) => i.checked).length;
  const errors = [
    ...unresolved(doc.issues, doc.acceptedIssues),
    ...items.flatMap((i) => unresolved(i.flags, i.acceptedFlags)),
  ].filter((f) => f.severity === "error").length;
  const maxPage = Math.max(doc.pageCount ?? 1, ...items.map((i) => i.page));
  const visible = (item: ReviewItem) =>
    item.page === page &&
    (filter === "all" ||
      (filter === "unchecked" && !item.checked) ||
      (filter === "ai" && (item.aiTouched || doc.aiSuggestions.some(s => s.itemId === item.id))) ||
      unresolved(item.flags, item.acceptedFlags).some(
        (f) => f.severity === filter,
      ));
  const onPage = items.filter(visible);
  async function mutate(operation: ReviewAction) {
    setSaving(true);
    try {
      const res = await fetch(`/api/uploads/${doc.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: doc.version, operation }),
      });
      if (!res.ok) {
        toast.error((await res.json()).error ?? "Couldn't save the review.");
        if (res.status === 409) startTransition(() => router.refresh());
        return false;
      }
      toast.success(
        operation.action === "publish" ? "BOQ published" : "Review saved",
      );
      if (operation.action === "publish")
        router.push(`/projects/${doc.projectId}`);
      startTransition(() => router.refresh());
      return true;
    } catch {
      toast.error(
        "Couldn't reach the server. Your changes haven't been saved.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function applyBulk() {
    if (!selected.length) return;
    if (bulk === "check")
      await mutate({ action: "check", itemIds: selected, checked: true });
    if (bulk === "unit")
      await mutate({ action: "unit", itemIds: selected, unit: bulkText });
    if (bulk === "move")
      await mutate({ action: "move", itemIds: selected, groupId: target });
    if (bulk === "split")
      await mutate({ action: "split", itemIds: selected, text: bulkText });
    if (bulk === "merge")
      await mutate({
        action: "merge",
        groupIds: groups
          .filter((g) => g.items.some((i) => selected.includes(i.id)))
          .map((g) => g.id),
        text: bulkText,
      });
  }
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-[600]">Review {doc.title}</h1>
          <p className="mt-1 text-[13px] text-qs-text-muted">
            <Link
              href={`/projects/${doc.projectId}`}
              className="text-qs-brand-text"
            >
              {doc.projectName}
            </Link>{" "}
            · {doc.stage} · {doc.boqDate} · {doc.currency}
          </p>
        </div>
        <Button
          disabled={
            busy || checked !== items.length || !items.length || errors > 0 || doc.aiSuggestions.some(s => s.status === "PENDING")
          }
          onClick={() => setPublish(true)}
        >
          <Upload />
          Publish BOQ
        </Button>
      </header>
      {archivedAi.length ? <details className="qs-card p-4 text-[12px]"><summary className="cursor-pointer font-semibold">AI history from earlier extractions ({archivedAi.length})</summary><div className="mt-3 space-y-3">{archivedAi.map(s => <div key={s.id} className="rounded-md border border-qs-border p-3"><p className="font-semibold">{s.kind} · {s.status} · {s.provider}</p><p className="mt-1 whitespace-pre-wrap break-words">Original: {s.original || "Unclassified"}</p><p className="mt-1 whitespace-pre-wrap break-words">Proposed: {s.proposed}</p><p className="mt-1 text-qs-text-muted">{s.reason}</p></div>)}</div></details> : null}
      {doc.aiStatus !== "OFF" ? <div className="qs-card space-y-2 p-4 text-[13px]" role="status"><p className="font-semibold">AI helper · {doc.aiStatus}</p><p>{doc.aiMessage ?? "Preparing suggestions. Extraction is saved; review becomes available when AI finishes."}</p><p className="text-qs-text-muted">Accept or reject each suggestion, then check the item against the source. Original text stays in the suggestion history.</p></div> : null}
      <div className="qs-card flex flex-wrap items-center gap-4 px-4 py-3">
        <Check className="size-5 text-qs-brand-text" />
        <div className="flex-1">
          <p className="text-[13px] font-semibold">
            {checked} of {items.length} items checked
          </p>
          <progress
            className="mt-1 h-1.5 w-full accent-qs-brand"
            max={items.length || 1}
            value={checked}
            aria-label="Items checked"
          />
        </div>
        <Badge tone={errors ? "danger" : "success"}>
          {errors} unresolved errors
        </Badge>
      </div>
      {doc.issues.length ? (
        <div className="qs-card space-y-3 p-4">
          <h2 className="text-[14px] font-semibold">Document checks</h2>
          <Checks
            flags={doc.issues}
            accepted={doc.acceptedIssues}
            mutate={mutate}
            disabled={busy}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          aria-label="Previous source page"
          disabled={page <= 1}
          onClick={() => {
            setPage(page - 1);
            setActive(null);
          }}
        >
          <ChevronLeft />
        </Button>
        <label className="flex items-center gap-2 text-[13px]">
          {doc.fileType === "pdf" ? "Page" : "Sheet"}
          <Input
            aria-label="Source page"
            type="number"
            min={1}
            max={maxPage}
            value={page}
            className="w-20"
            onChange={(e) => {
              setPage(Math.min(maxPage, Math.max(1, Number(e.target.value))));
              setActive(null);
            }}
          />
          of {maxPage}
        </label>
        <Button
          size="icon"
          variant="outline"
          aria-label="Next source page"
          disabled={page >= maxPage}
          onClick={() => {
            setPage(page + 1);
            setActive(null);
          }}
        >
          <ChevronRight />
        </Button>
        <div className="ml-auto w-44">
          <SelectField
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All items" },
              { value: "error", label: "Errors only" },
              { value: "warning", label: "Warnings only" },
              { value: "unchecked", label: "Unchecked only" },
              { value: "ai", label: "AI-changed only" },
            ]}
          />
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <aside className="qs-card overflow-hidden xl:sticky xl:top-20">
          <div className="flex justify-between border-b border-qs-border px-4 py-3">
            <h2 className="text-[13px] font-semibold">Original source</h2>
            <a
              href={`/api/uploads/${doc.id}/file`}
              target="_blank"
              rel="noopener"
              className="text-[12px] text-qs-brand-text"
            >
              Open original ↗
            </a>
          </div>
          {doc.fileType === "pdf" ? (
            <div className="max-h-[75vh] overflow-auto">
              <PdfPreview id={doc.id} page={page} selected={active} />
            </div>
          ) : (
            <p className="p-5 text-[13px] text-qs-text-muted">
              Download the original Excel file to compare sheet {page} alongside
              these items.
            </p>
          )}
          {doc.fileType === "pdf" && (
            <p className="p-3 text-[11.5px] text-qs-text-muted">
              Select an item to highlight matching text on its source page.
            </p>
          )}
        </aside>
        <section className="min-w-0 space-y-3" aria-label="Extracted items">
          <div className="qs-card space-y-3 p-3">
            <div className="flex items-center gap-3">
              <Checkbox
                aria-label="Select all visible items"
                checked={
                  !!onPage.length &&
                  onPage.every((i) => selected.includes(i.id))
                }
                disabled={busy}
                onCheckedChange={(value) =>
                  setSelected(
                    value
                      ? [...new Set([...selected, ...onPage.map((i) => i.id)])]
                      : selected.filter(
                          (id) => !onPage.some((i) => i.id === id),
                        ),
                  )
                }
              />
              <span className="text-[12px]">
                {selected.length} selected · {onPage.length} shown
              </span>
              {selected.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected([])}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            {selected.length ? (
              <div className="space-y-2">
                <SelectField
                  value={bulk}
                  onChange={setBulk}
                  options={[
                    { value: "check", label: "Mark selected checked" },
                    { value: "unit", label: "Set unit" },
                    { value: "move", label: "Move to main description" },
                    { value: "split", label: "Split into a new group" },
                    {
                      value: "merge",
                      label: "Merge selected groups (same section)",
                    },
                  ]}
                />
                {bulk === "move" ? (
                  <SelectField
                    value={target}
                    onChange={setTarget}
                    options={groups.map((g) => ({
                      value: g.id,
                      label:
                        g.text.slice(0, 100) ||
                        `Standalone items · page ${g.pageFrom}`,
                    }))}
                  />
                ) : bulk !== "check" ? (
                  <Textarea
                    aria-label={
                      bulk === "unit" ? "Bulk unit" : "New main description"
                    }
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={
                      bulk === "unit"
                        ? "Unit, e.g. m²"
                        : "Main description for the resulting group"
                    }
                  />
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    busy ||
                    (bulk === "move" && !target) ||
                    (bulk === "unit" && !bulkText.trim())
                  }
                  onClick={applyBulk}
                >
                  Apply to selected
                </Button>
                <p className="text-[11.5px] text-qs-text-muted">
                  Moving and editing clears affected review checks. Split
                  requires a subset of one group; merge requires items from two
                  groups in the same section.
                </p>
              </div>
            ) : null}
          </div>
          {!onPage.length ? (
            <div className="qs-card p-6 text-[13px] text-qs-text-muted">
              No items match this page and filter.
            </div>
          ) : null}
          {doc.bills.map((bill) => (
            <div key={bill.id}>
              {bill.sections.some((s) =>
                s.groups.some((g) => g.items.some(visible)),
              ) ? (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-[14px] font-semibold">
                    Bill {bill.billNo} · {bill.title}
                  </h2>
                  <details className="text-[12px]">
                    <summary className="cursor-pointer text-qs-brand-text">
                      Edit bill
                    </summary>
                    <form
                      className="flex flex-wrap gap-2 p-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void mutate({
                          action: "bill",
                          billId: bill.id,
                          billNo: String(f.get("billNo")),
                          title: String(f.get("title")),
                        });
                      }}
                    >
                      <Input
                        name="billNo"
                        aria-label="Bill number"
                        defaultValue={bill.billNo}
                      />
                      <Input
                        name="title"
                        aria-label="Bill title"
                        defaultValue={bill.title}
                      />
                      <Button size="sm" variant="outline" disabled={busy}>
                        Save bill
                      </Button>
                    </form>
                  </details>
                </div>
              ) : null}
              {bill.sections.map((section) => (
                <div key={section.id} className="space-y-3">
                  {section.groups.some((g) => g.items.some(visible)) ? (
                    <div className="qs-card p-3">
                      <TextEditor
                        label="Heading"
                        initial={section.heading ?? ""}
                        disabled={busy}
                        save={(heading) =>
                          mutate({
                            action: "section",
                            sectionId: section.id,
                            heading: heading || null,
                            parentHeading: section.parentHeading,
                          })
                        }
                      />
                      <TextEditor
                        label="Parent heading"
                        initial={section.parentHeading ?? ""}
                        disabled={busy}
                        save={(parentHeading) =>
                          mutate({
                            action: "section",
                            sectionId: section.id,
                            heading: section.heading,
                            parentHeading: parentHeading || null,
                          })
                        }
                      />
                    </div>
                  ) : null}
                  {section.groups
                    .filter((g) => g.items.some(visible))
                    .map((group) => (
                      <div key={group.id} className="qs-card overflow-hidden">
                        <div className="border-b border-qs-border bg-qs-raised p-3">
                          <p className="mb-1 text-[10px] font-semibold tracking-wider text-qs-text-muted uppercase">
                            Shared main description · {group.items.length} items
                          </p>
                          <TextEditor
                            label="Main description"
                            initial={group.text}
                            disabled={busy}
                            save={(text) =>
                              mutate({
                                action: "group",
                                groupId: group.id,
                                text,
                              })
                            }
                          />
                        </div>
                        {group.items.filter(visible).map((item) => (
                          <article
                            key={item.id}
                            className={`border-b border-qs-border last:border-b-0 ${active?.id === item.id ? "bg-qs-brand-tint" : ""}`}
                          >
                            <div className="flex items-start gap-3 p-3">
                              <Checkbox
                                aria-label={`Select item ${item.itemRef}`}
                                checked={selected.includes(item.id)}
                                disabled={busy}
                                onCheckedChange={(v) =>
                                  setSelected(
                                    v
                                      ? [...selected, item.id]
                                      : selected.filter((id) => id !== item.id),
                                  )
                                }
                              />
                              <button
                                className="flex-1 text-left focus-visible:outline-2 focus-visible:outline-qs-brand"
                                onClick={() => setActive(item)}
                              >
                                <span className="text-[13px] font-semibold">
                                  {item.itemRef} ·{" "}
                                  {item.description || "No description"}
                                </span>
                                <span className="mt-1 block text-[12px] text-qs-text-muted tabular-nums">
                                  {item.qty ?? "—"} {item.unit ?? "—"} · Rate{" "}
                                  {item.rateNote ?? item.rate ?? "—"} · Amount{" "}
                                  {item.amount ?? "—"} {doc.currency} · p
                                  {item.page}
                                </span>
                              </button>
                              {item.checked ? (
                                <Badge tone="success">Checked</Badge>
                              ) : (
                                <Badge>Unchecked</Badge>
                              )}
                            </div>
                            <div className="px-3 pb-3">
                              {item.aiTouched ? <Badge tone="warning">AI suggestion accepted — review against source</Badge> : null}
                              {item.trade ? <p className="mt-2 text-[12px]">Trade: {item.trade}</p> : null}
                              {doc.aiSuggestions.filter(s => s.itemId === item.id).map(s => <div key={s.id} className="my-3 space-y-2 rounded-md border border-qs-brand bg-qs-brand-tint p-3 text-[12px]">
                                <p className="font-semibold">AI {s.kind.toLowerCase()} suggestion · {s.status.toLowerCase()}</p>
                                <p className="text-qs-text-muted">{s.provider} · {s.model} · {s.reason}</p>
                                <div className="grid gap-3 sm:grid-cols-2"><div><strong>Original</strong><p className="mt-1 whitespace-pre-wrap break-words">{s.kind === "LINK" ? groups.find(g => g.id === s.original)?.text || "No main description" : s.original || "Unclassified"}</p></div><div><strong>Suggested</strong><p className="mt-1 whitespace-pre-wrap break-words">{s.kind === "LINK" ? groups.find(g => g.id === s.proposed)?.text || "Group unavailable" : s.proposed}</p></div></div>
                                {s.status === "PENDING" ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => mutate({ action: "aiSuggestion", suggestionId: s.id, accept: true })}>Accept suggestion</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => mutate({ action: "aiSuggestion", suggestionId: s.id, accept: false })}>Reject</Button></div> : null}
                              </div>)}
                              <Checks
                                flags={item.flags}
                                accepted={item.acceptedFlags}
                                itemId={item.id}
                                mutate={mutate}
                                disabled={busy}
                              />
                              <div className="mt-2 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    setEditing(
                                      editing === item.id ? null : item.id,
                                    )
                                  }
                                >
                                  <Pencil />
                                  Edit item
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={
                                    busy ||
                                    (!item.checked && doc.aiSuggestions.some(s => s.itemId === item.id && s.status === "PENDING")) ||
                                    (!item.checked &&
                                      unresolved(
                                        item.flags,
                                        item.acceptedFlags,
                                      ).some((f) => f.severity === "error"))
                                  }
                                  onClick={() =>
                                    mutate({
                                      action: "check",
                                      itemIds: [item.id],
                                      checked: !item.checked,
                                    })
                                  }
                                >
                                  <Check />
                                  {item.checked ? "Undo check" : "Mark checked"}
                                </Button>
                              </div>
                            </div>
                            {editing === item.id ? (
                              <ItemEditor
                                item={item}
                                mutate={mutate}
                                close={() => setEditing(null)}
                                disabled={busy}
                              />
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          ))}
        </section>
      </div>
      <ConfirmDialog
        open={publish}
        onOpenChange={setPublish}
        title="Publish this BOQ?"
        description={`All ${items.length} items have been checked. The BOQ will be visible to users on the project page. Accepted checks and review changes remain in the activity log.`}
        confirmLabel="Publish BOQ"
        onConfirm={async () =>
          (await mutate({ action: "publish" }))
            ? null
            : "Couldn't publish. Check the review messages and try again."
        }
      />
    </div>
  );
}
