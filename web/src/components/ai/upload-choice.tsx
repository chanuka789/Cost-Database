"use client";
import { SelectField } from "@/components/ui/select-field";
import { Checkbox } from "@/components/ui/checkbox";
export type AiUploadOptions = { enabled: boolean; defaultChoice: string; providers: { id: string; name: string; baseUrl: string; dataPolicy: string }[] };
export function AiUploadChoice({ options, choice, allowFallback, onChange }: { options: AiUploadOptions; choice: string; allowFallback: boolean; onChange: (choice: string, allowFallback: boolean) => void }) {
  const primary = choice === "DEFAULT" ? options.defaultChoice : choice;
  const p = options.providers.find(p => p.id === primary);
  return <div className="space-y-3 text-[13px]">
    <label className="block space-y-1">AI assistance<SelectField id="upload-ai-choice" value={choice} onChange={v => onChange(v, false)} options={[{ value: "OFF", label: "AI off — rule-based extraction" }, { value: "DEFAULT", label: `Use default — ${options.providers.find(p => p.id === options.defaultChoice)?.name ?? "AI off"}` }, ...options.providers.map(p => ({ value: p.id, label: p.name }))]} /></label>
    {!options.enabled ? <p className="text-qs-text-muted">The AI helper is currently disabled by the admin. Extraction will use rules.</p> : null}
    {p && choice !== "OFF" ? <>
      <p className="break-words">BOQ descriptions and headings will be sent to <strong>{p.name}</strong> ({new URL(p.baseUrl).hostname}). Quantities, rates and amounts are excluded. Suggestions stay separate until an admin accepts them.</p>
      <p className="text-qs-text-muted">{p.dataPolicy}</p>
      <label className="flex gap-2"><Checkbox aria-label="Allow fallback providers" checked={allowFallback} onCheckedChange={v => onChange(choice, !!v)} /><span>Allow fallback to other enabled providers if this provider fails or reaches its budget.</span></label>
      {allowFallback ? <div className="rounded-md border border-qs-border p-3"><p className="font-semibold">Fallback recipients in order</p>{options.providers.filter(q => q.id !== p.id).slice(0, 2).map(q => <p className="mt-2 break-words" key={q.id}>{q.name} ({new URL(q.baseUrl).hostname}) — {q.dataPolicy}</p>)}{options.providers.length === 1 ? <p>No other enabled providers.</p> : null}</div> : null}
    </> : null}
  </div>;
}

