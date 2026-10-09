"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { columnMappingSchema, type ColumnMapping } from "@/lib/ai-validation";
const blank = { reference: null, description: "", unit: "", quantity: "", rate: null, amount: null };
export function ColumnMappingEditor({ choice, allowFallback, onApply, disabled }: { choice: string; allowFallback: boolean; onApply: (columns: ColumnMapping | null) => Promise<void>; disabled: boolean }) {
  const [text, setText] = useState("");
  const [columns, setColumns] = useState<Record<keyof ColumnMapping, string | null>>(blank);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const headers = [...new Set(text.split(/[\n,]/).map(h => h.trim()).filter(Boolean))];
  async function suggest() {
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/admin/ai/mapping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choice, allowFallback, headers }) });
      const result = await res.json();
      if (!res.ok) { setMessage(result.error ?? "Mapping unavailable. Choose columns manually."); return; }
      setColumns(result.columns); setMessage(`AI proposal from ${result.provider}: ${result.reason}. Check every column against the source before applying.`);
    } catch { setMessage("AI unavailable. Choose columns manually."); }
    finally { setBusy(false); }
  }
  const parsed = columnMappingSchema.safeParse(columns);
  return <details className="mt-4 border-t border-qs-border pt-4"><summary className="cursor-pointer text-[13px] font-semibold">Unfamiliar Excel layout — review column mapping</summary><div className="mt-3 space-y-3 text-[13px]">
    <p>Paste the exact header labels from one BOQ header row, one per line. AI can propose a mapping; you can also map manually with AI off. Applying a reviewed mapping re-reads the file using the normal numeric parser. Tender bidder mapping comes in Phase 6.</p>
    <label className="block space-y-1">Source column headers<Textarea value={text} onChange={e => { setText(e.target.value); setColumns(blank); setMessage(""); }} placeholder={"Code\nWork specification\nMeasure\nCount\nUnit cost\nExtended cost"} /></label>
    <Button type="button" size="sm" variant="outline" disabled={disabled || busy || choice === "OFF" || headers.length < 2} onClick={suggest}>{busy ? "Suggesting…" : "Suggest column mapping"}</Button>
    {message ? <p role="status" className="text-qs-text-muted">{message}</p> : null}
    <div className="grid gap-3 sm:grid-cols-2">{(Object.keys(blank) as (keyof ColumnMapping)[]).map(field => <label key={field} className="space-y-1">{field.charAt(0).toUpperCase() + field.slice(1)}<SelectField id={`mapping-${field}`} value={columns[field] ?? "NONE"} onChange={v => setColumns({ ...columns, [field]: v === "NONE" ? null : v })} options={[{ value: "NONE", label: "Not present" }, ...headers.map(h => ({ value: h, label: h }))]} /></label>)}</div>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={disabled || busy || !parsed.success || Object.values(columns).some(v => v !== null && !headers.includes(v))} onClick={() => parsed.success && onApply(parsed.data)}>Apply reviewed mapping and re-read</Button><Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => onApply(null)}>Use automatic mapping</Button></div>
  </div></details>;
}
