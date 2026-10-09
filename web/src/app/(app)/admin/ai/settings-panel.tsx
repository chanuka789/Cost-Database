"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/ui/select-field";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PROVIDER_PRESETS, type ProviderInput } from "@/lib/ai-validation";
import type { AiAdminData } from "@/lib/ai-service";

const initial: ProviderInput = { name: "", type: "DEEPSEEK", baseUrl: PROVIDER_PRESETS.DEEPSEEK.url, model: PROVIDER_PRESETS.DEEPSEEK.model, key: "", enabled: true, priority: 0, inputPrice: 0, outputPrice: 0, monthlyBudget: null, dataPolicy: PROVIDER_PRESETS.DEEPSEEK.policy, taskModels: {} };
const usd = (n: number) => `$${n.toFixed(6)}`;
export function AiSettingsPanel({ data }: { data: AiAdminData }) {
  const router = useRouter();
  const [form, setForm] = useState<ProviderInput | null>(null);
  const [settings, setSettings] = useState(data.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remove, setRemove] = useState<string | null>(null);
  const [pricingConfirmed, setPricingConfirmed] = useState(false);
  async function send(body: unknown) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await res.json();
      router.refresh();
      if (!res.ok || result.ok === false) { if (result.id) setForm(current => current ? { ...current, id: result.id, key: "" } : null); setError(result.error ?? `Connection failed (${result.code}).`); return false; }
      toast.success("AI settings saved"); return true;
    } catch { setError("Could not reach the server. Try again."); return false; }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    {!data.ready ? <div className="qs-card p-4 text-[13px]" role="status">AI key encryption is not configured. Set <code>AI_KEYS_ENCRYPTION_KEY</code> to the same base64-encoded 32-byte secret in the web and extractor services. Then enter provider keys here.</div> : null}
    <section className="qs-card space-y-4 p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold">Upload defaults</h2>
      <label className="flex items-start gap-2 text-[13px]"><Checkbox aria-label="Enable AI helper" checked={settings.enabled} onCheckedChange={v => setSettings({ ...settings, enabled: !!v })} disabled={busy} /><span>Enable AI helper. Turning this off stops new requests; extraction continues with rules.</span></label>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
        <label className="space-y-1 text-[13px]">Default provider<SelectField id="ai-default" value={settings.defaultChoice} onChange={v => setSettings({ ...settings, defaultChoice: v })} options={[{ value: "OFF", label: "AI off" }, ...data.providers.filter(p => p.enabled).map(p => ({ value: p.id, label: p.name }))]} /></label>
        <Button disabled={busy} onClick={() => send({ action: "SETTINGS", settings })}>Save defaults</Button>
      </div>
      <p className="text-[12px] text-qs-text-muted">Admins choose AI off, this default, or a specific provider for each upload. Fallback requires a separate opt-in on that upload.</p>
    </section>
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">Providers</h2><Button variant="outline" disabled={busy || !data.ready} onClick={() => { setForm({ ...initial }); setPricingConfirmed(false); setError(""); }}>Add provider</Button></div>
      {!data.providers.length ? <div className="qs-card p-5 text-[13px] text-qs-text-muted">No providers configured. Extraction works with AI off.</div> : null}
      {data.providers.map(p => {
        const total = data.totals.find(t => t.providerId === p.id);
        const committed = (total?.cost ?? 0) + (total?.reserved ?? 0);
        const warning = p.monthlyBudget !== null && committed >= p.monthlyBudget * .8;
        return <article key={p.id} className="qs-card space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold">{p.name} <Badge tone={p.enabled ? "success" : "neutral"}>{p.enabled ? "Enabled" : "Disabled"}</Badge></h3><p className="mt-1 break-all text-[12px] text-qs-text-muted">{p.model} · {p.baseUrl}</p></div><span className="text-[12px] text-qs-text-muted">Fallback order {p.priority} · Key {p.keyLast4 ? `••••${p.keyLast4}` : "removed"}</span></div>
          <p className="text-[13px]">{p.dataPolicy}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px]"><span>Test: {p.testStatus ?? "Not tested"}{p.testLatencyMs !== null ? ` · ${p.testLatencyMs}ms` : ""}</span><span>{total?.requests ?? 0} attempts · {(total?.input ?? 0) + (total?.output ?? 0)} tokens</span><span>Estimated cost {usd(total?.cost ?? 0)} · held {usd(total?.reserved ?? 0)}{p.monthlyBudget !== null ? ` / ${usd(p.monthlyBudget)} budget` : " · no budget"}</span></div>
          {warning ? <p className="text-[13px] text-qs-danger" role="status">80% budget warning: charged estimates and held reservations have reached at least 80% of this month’s limit. New requests stop before exceeding the limit.</p> : null}
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => { setForm({ id: p.id, name: p.name, type: p.type as ProviderInput["type"], baseUrl: p.baseUrl, model: p.model, taskModels: p.taskModels as ProviderInput["taskModels"], key: "", enabled: p.enabled, priority: p.priority, inputPrice: p.inputPrice, outputPrice: p.outputPrice, monthlyBudget: p.monthlyBudget, dataPolicy: p.dataPolicy }); setPricingConfirmed(true); setError(""); }}>Edit</Button><Button size="sm" variant="outline" disabled={busy || !p.keyLast4} onClick={() => send({ action: "TEST", id: p.id })}>Test connection</Button><Button size="sm" variant="ghost" disabled={busy || !p.keyLast4} onClick={() => setRemove(p.id)}>Remove key</Button></div>
        </article>;
      })}
    </section>
    {form ? <form className="qs-card space-y-4 p-4 sm:p-5" onSubmit={async e => { e.preventDefault(); if (await send({ action: "SAVE", provider: form })) setForm(null); }}>
      <h2 className="text-[15px] font-semibold">{form.id ? "Edit provider" : "Add provider"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-[13px]">Provider type<SelectField id="provider-type" value={form.type} onChange={v => { const type = v as ProviderInput["type"]; const preset = PROVIDER_PRESETS[type]; setForm({ ...form, type, baseUrl: preset.url, model: preset.model, dataPolicy: preset.policy }); }} options={Object.keys(PROVIDER_PRESETS).map(value => ({ value, label: value === "CUSTOM" ? "Custom OpenAI-compatible" : value === "META" ? "Meta" : value === "OPENROUTER" ? "OpenRouter" : "DeepSeek" }))} /></label>
        <label className="space-y-1 text-[13px]">Display name<Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className="space-y-1 text-[13px]">HTTPS base URL<Input required type="url" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} /></label>
        <label className="space-y-1 text-[13px]">Default model<Input required value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></label>
        <label className="space-y-1 text-[13px]">API key {form.id ? "(leave blank to keep saved key)" : ""}<Input type="password" autoComplete="new-password" required={!form.id} value={form.key ?? ""} onChange={e => setForm({ ...form, key: e.target.value })} /></label>
        <label className="space-y-1 text-[13px]">Fallback order (lower first)<Input required type="number" min="0" max="1000" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} /></label>
        <label className="space-y-1 text-[13px]">Input USD per million tokens<Input required type="number" min="0" max="10000" step="any" value={form.inputPrice} onChange={e => { setPricingConfirmed(false); setForm({ ...form, inputPrice: Number(e.target.value) }); }} /></label>
        <label className="space-y-1 text-[13px]">Output USD per million tokens<Input required type="number" min="0" max="10000" step="any" value={form.outputPrice} onChange={e => { setPricingConfirmed(false); setForm({ ...form, outputPrice: Number(e.target.value) }); }} /></label>
        <label className="space-y-1 text-[13px]">Monthly USD budget (blank = no limit)<Input type="number" min="0.000001" step="any" value={form.monthlyBudget ?? ""} onChange={e => setForm({ ...form, monthlyBudget: e.target.value ? Number(e.target.value) : null })} /></label>
      </div>
      <details><summary className="cursor-pointer text-[13px]">Per-task models (optional)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["TEXT", "TRADE", "LINK", "MAPPING"] as const).map(task => <label key={task} className="space-y-1 text-[13px]">{task}<Input value={form.taskModels[task] ?? ""} placeholder="Use default model" onChange={e => setForm({ ...form, taskModels: { ...form.taskModels, [task]: e.target.value } })} /></label>)}</div></details>
      <label className="block space-y-1 text-[13px]">Client-data policy note<Textarea required minLength={10} value={form.dataPolicy} onChange={e => setForm({ ...form, dataPolicy: e.target.value })} /></label>
      {PROVIDER_PRESETS[form.type].link ? <a className="text-[12px] text-qs-brand-text underline" href={PROVIDER_PRESETS[form.type].link} target="_blank" rel="noreferrer">Provider documentation and policy</a> : null}
      <label className="flex gap-2 text-[13px]"><Checkbox aria-label="Confirm model prices" checked={pricingConfirmed} onCheckedChange={v => setPricingConfirmed(!!v)} /><span>I checked the prices for all selected models. These rates cover the most expensive task model; zero means a verified free model. Costs are estimates, excluding taxes.</span></label>
      <label className="flex gap-2 text-[13px]"><Checkbox aria-label="Enable provider after testing" checked={form.enabled} onCheckedChange={v => setForm({ ...form, enabled: !!v })} /><span>Enable after a successful connection test</span></label>
      <p className="text-[12px] text-qs-text-muted">Changed credentials or models are tested with a tiny synthetic JSON request before enabling. If the test fails, the provider is retained disabled for correction. Tests consume provider tokens.</p>
      <div className="flex gap-2"><Button disabled={busy || !pricingConfirmed || !data.ready}>{busy ? "Testing connection…" : "Test and save"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setForm(null)}>Cancel</Button></div>
    </form> : null}
    {error ? <p role="alert" className="rounded-md bg-qs-danger-tint p-3 text-[13px] text-qs-danger">{error}</p> : null}
    <section className="qs-card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">Usage by upload · UTC month</h2><Input aria-label="Usage month" type="month" className="w-40" value={data.month} onChange={e => router.push(`/admin/ai?month=${e.target.value}`)} /></div>
      {data.uploadTotals.length ? <div className="grid gap-3 sm:grid-cols-2">{data.uploadTotals.map(u => <div key={u.id} className="rounded-md border border-qs-border p-3 text-[12px]"><Link className="font-semibold text-qs-brand-text" href={`/uploads/${u.id}`}>{u.title}</Link><p className="mt-1">{u.requests} attempts · {u.input} input / {u.output} output tokens</p><p>Estimated cost {usd(u.cost)} · held {usd(u.reserved)}</p></div>)}</div> : null}
      <p className="text-[12px] text-qs-text-muted">Monthly provider totals include all attempts. Showing the latest 200 here. Failed or unmetered requests retain a conservative reservation because they may still have incurred a charge. Provider invoices remain authoritative.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-[12px]"><thead><tr className="border-b border-qs-border">{["Upload / request", "Provider / model", "Status", "Tokens", "Estimated USD"].map(t => <th className="p-2 font-semibold" key={t}>{t}</th>)}</tr></thead><tbody>{data.usage.map(u => <tr key={u.id} className="border-b border-qs-border"><td className="p-2">{u.documentId ? <Link className="text-qs-brand-text" href={`/uploads/${u.documentId}`}>{u.upload}</Link> : u.upload}<span className="block text-qs-text-muted">{u.task} · {u.at.slice(0, 16).replace("T", " ")}</span></td><td className="p-2">{u.provider}<span className="block break-all text-qs-text-muted">{u.model}</span></td><td className="p-2">{u.status}<span className="block text-qs-text-muted">{u.code}</span></td><td className="p-2 tabular-nums">{u.input} in / {u.output} out</td><td className="p-2 tabular-nums">{usd(u.cost)}{u.reserved ? <span className="block">Held {usd(u.reserved)}</span> : null}</td></tr>)}</tbody></table>{!data.usage.length ? <p className="py-4 text-[13px] text-qs-text-muted">No AI requests this month.</p> : null}</div>
    </section>
    <ConfirmDialog open={!!remove} onOpenChange={v => !v && setRemove(null)} title="Remove this provider key?" description="The provider is disabled and its encrypted key is deleted. Historical usage remains. Enter and test a new key to enable it again." confirmLabel="Remove key" tone="danger" onConfirm={async () => await send({ action: "REMOVE_KEY", id: remove }) ? (setRemove(null), null) : "Key could not be removed."} />
  </div>;
}

