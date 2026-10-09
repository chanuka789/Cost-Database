"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileSpreadsheet, FileText, Loader2, Search, Sparkles, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { FormMessage } from "@/components/auth/form-message";
import { MAX_UPLOAD_BYTES, uploadSchema } from "@/lib/upload-validation";
import { formatDate } from "@/lib/format";
import { findSimilarProject } from "@/lib/project-match";
import { cn } from "@/lib/utils";

type Currency = "SAR" | "AED" | "QAR";
export type UploadFormData = {
  projects: { id: string; name: string; projectNo: string | null; city: string; buildingType: string; currency: Currency }[];
  countries: { id: string; name: string; currency: Currency; cities: { id: string; name: string }[] }[];
  buildingTypes: { id: string; name: string }[];
  stages: { id: string; name: string }[];
};

type Inspect = {
  fileType: "pdf" | "xlsx";
  pages: number;
  cover: { project_name: string | null; boq_date: string | null; stage_text: string | null; stage_guess: string | null };
  suggestions: { projectId: string | null; stageId: string | null };
  duplicate: { id: string; title: string; project: string; stage: string; uploadedAt: string } | null;
};

const CURRENCIES: Currency[] = ["AED", "SAR", "QAR"];

/** "Q WALK" -> "Q Walk": cover text is often all capitals. */
function tidyName(text: string) {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

function sizeText(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function FromCover() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-qs-brand-text">
      <Sparkles className="size-3" aria-hidden />
      From the BOQ cover
    </span>
  );
}

function Step({ n, title, description, children }: { n: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="qs-card" aria-labelledby={`step-${n}`}>
      <header className="flex items-start gap-3 border-b border-qs-border px-5 py-4">
        <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-qs-hover text-[12px] font-[600] text-qs-text-secondary">{n}</span>
        <div>
          <h2 id={`step-${n}`} className="text-[15px] font-[600]">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-[12.5px] text-qs-text-muted">{description}</p> : null}
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, hint, error, children, className }: { label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-[12px] text-qs-danger">{error}</p> : hint ? <p className="text-[12px] text-qs-text-muted">{hint}</p> : null}
    </div>
  );
}

export function UploadForm({ data, initialProjectId }: { data: UploadFormData; initialProjectId?: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fromCover, setFromCover] = useState<Set<string>>(new Set());

  const [projectMode, setProjectMode] = useState<"existing" | "new">(data.projects.length ? "existing" : "new");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState({
    name: "",
    projectNo: "",
    projectDatePrecision: "DAY" as "DAY" | "MONTH",
    projectDate: "",
    countryId: "",
    cityId: "",
    buildingTypeId: "",
    client: "",
    consultant: "",
  });
  const [doc, setDoc] = useState({ title: "", rateType: "PTE" as const, stageId: "", boqDate: "", currency: "" as Currency | "" });
  const [currencyTouched, setCurrencyTouched] = useState(false);

  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitError, setSubmitError] = useState<{ message: string; documentId?: string } | null>(null);

  const country = data.countries.find((c) => c.id === project.countryId);
  const selectedProject = data.projects.find((p) => p.id === projectId);
  const similar = projectMode === "new" ? findSimilarProject(project.name, data.projects) : undefined;

  function touched(key: string) {
    setFromCover((s) => {
      if (!s.has(key)) return s;
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  }

  async function chooseFile(f: File | null) {
    setFileError(null);
    setInspect(null);
    setSubmitError(null);
    if (!f) return setFile(null);
    if (f.size > MAX_UPLOAD_BYTES) return setFileError("The file is larger than 50 MB.");
    if (!/\.(pdf|xlsx)$/i.test(f.name)) {
      return setFileError(/\.xls$/i.test(f.name) ? "Old .xls files aren't supported. Save it as .xlsx in Excel, then upload." : "Upload a PDF or an Excel (.xlsx) BOQ.");
    }
    setFile(f);
    setInspecting(true);
    const body = new FormData();
    body.append("file", f);
    try {
      const res = await fetch("/api/uploads/inspect", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setFileError(json.error ?? "This file couldn't be read.");
        return;
      }
      const info = json as Inspect;
      setInspect(info);
      applyCover(info, f);
    } catch {
      setFileError("Couldn't read the file. Check your connection and try again.");
    } finally {
      setInspecting(false);
    }
  }

  function applyCover(info: Inspect, f: File) {
    const filled = new Set<string>();
    setDoc((d) => {
      const next = { ...d };
      if (!next.title) next.title = f.name.replace(/\.(pdf|xlsx)$/i, "");
      if (!next.stageId && info.suggestions.stageId) {
        next.stageId = info.suggestions.stageId;
        filled.add("stageId");
      }
      if (!next.boqDate && info.cover.boq_date) {
        next.boqDate = info.cover.boq_date;
        filled.add("boqDate");
      }
      return next;
    });
    if (info.suggestions.projectId) {
      setProjectMode("existing");
      setProjectId(info.suggestions.projectId);
      filled.add("projectId");
      const p = data.projects.find((x) => x.id === info.suggestions.projectId);
      if (p && !currencyTouched) setDoc((d) => ({ ...d, currency: p.currency }));
    } else if (info.cover.project_name && !projectId) {
      setProjectMode("new");
      setProject((p) => (p.name ? p : { ...p, name: tidyName(info.cover.project_name!) }));
      filled.add("name");
    }
    setFromCover(filled);
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? data.projects.filter((p) => p.name.toLowerCase().includes(q) || (p.projectNo ?? "").toLowerCase().includes(q))
      : data.projects;
    return list.slice(0, 8);
  }, [query, data.projects]);

  const payload =
    projectMode === "existing" ? { projectMode, projectId, document: doc } : { projectMode, project, document: doc };
  const check = uploadSchema.safeParse(payload);
  const errors: Record<string, string> = {};
  if (!check.success) {
    for (const issue of check.error.issues) {
      const key = String(issue.path[issue.path.length - 1]);
      errors[key] ??= issue.message;
    }
  }
  const err = (key: string) => (attempted ? errors[key] : undefined);
  const canSubmit = Boolean(file && inspect && !inspect.duplicate && !inspecting && !submitting && !similar);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setSubmitError(null);
    if (!file || !inspect) return setFileError("Choose the BOQ file first.");
    if (!check.success) return;
    const body = new FormData();
    body.append("file", file);
    body.append("data", JSON.stringify(payload));

    // XHR, not fetch, so the upload can show its progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      let json: { id?: string; error?: string; documentId?: string } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 201 && json.id) {
        router.push(`/uploads/${json.id}`);
        return;
      }
      setSubmitting(false);
      setSubmitError({ message: json.error ?? "The upload failed. Try again.", documentId: json.documentId });
    };
    xhr.onerror = () => {
      setSubmitting(false);
      setSubmitError({ message: "The upload was interrupted. Check your connection and try again." });
    };
    setSubmitting(true);
    setProgress(0);
    xhr.send(body);
  }

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-4" noValidate>
      <Step n={1} title="BOQ file" description="PDF or Excel (.xlsx), up to 50 MB. Text-based PDFs only — scanned BOQs aren't supported yet.">
        {!file ? (
          <label
            htmlFor="boq-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              chooseFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-qs-brand bg-qs-brand-tint" : "border-qs-border-strong bg-qs-raised hover:bg-qs-hover",
            )}
          >
            <UploadCloud className={cn("size-7", dragging ? "text-qs-brand-text" : "text-qs-text-muted")} aria-hidden />
            <span className="mt-3 text-[13.5px] font-[550]">Drop the BOQ here, or click to choose</span>
            <span className="mt-1 text-[12.5px] text-qs-text-muted">PDF or .xlsx</span>
          </label>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-qs-border bg-qs-raised px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-qs-panel text-qs-text-muted">
              {/\.xlsx$/i.test(file.name) ? <FileSpreadsheet className="size-5" aria-hidden /> : <FileText className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-[550]">{file.name}</p>
              <p className="text-[12px] text-qs-text-muted">
                {sizeText(file.size)}
                {inspect ? ` · ${inspect.pages} ${inspect.fileType === "pdf" ? "pages" : "sheets"}` : ""}
              </p>
            </div>
            {inspecting ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-qs-text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Reading the cover…
              </span>
            ) : null}
            <Button type="button" variant="ghost" size="icon" aria-label="Remove file" onClick={() => chooseFile(null)} disabled={submitting}>
              <X aria-hidden />
            </Button>
          </div>
        )}
        <input
          ref={fileInput}
          id="boq-file"
          type="file"
          accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            chooseFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        {fileError ? <FormMessage className="mt-3">{fileError}</FormMessage> : null}
        {inspect?.duplicate ? (
          <FormMessage className="mt-3">
            This exact file was already uploaded as <strong className="font-[600]">{inspect.duplicate.title}</strong> ({inspect.duplicate.project},{" "}
            {inspect.duplicate.stage}) on {formatDate(inspect.duplicate.uploadedAt)}.{" "}
            <Link href={`/uploads/${inspect.duplicate.id}`} className="underline">
              Open it
            </Link>
          </FormMessage>
        ) : inspect && (inspect.cover.project_name || inspect.cover.boq_date || inspect.cover.stage_text) ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-qs-brand-tint px-3 py-2.5 text-[12.5px] text-qs-brand-text">
            <span className="inline-flex items-center gap-1.5 font-[600]">
              <Sparkles className="size-3.5" aria-hidden /> Read from the cover
            </span>
            {inspect.cover.project_name ? <span>Project: {inspect.cover.project_name}</span> : null}
            {inspect.cover.boq_date ? <span>Date: {formatDate(inspect.cover.boq_date)}</span> : null}
            {inspect.cover.stage_text ? <span>Stage: {inspect.cover.stage_text}</span> : null}
          </div>
        ) : null}
      </Step>

      <Step n={2} title="Project" description="Every BOQ belongs to a project. All its BOQs (stages, tender returns) stay together.">
        <div className="qs-segmented mb-4 w-fit" role="radiogroup" aria-label="Project">
          {(
            [
              ["existing", "Existing project"],
              ["new", "New project"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={projectMode === key}
              className="qs-segmented-item"
              onClick={() => setProjectMode(key)}
              disabled={key === "existing" && data.projects.length === 0}
            >
              {label}
            </button>
          ))}
        </div>

        {projectMode === "existing" ? (
          data.projects.length === 0 ? (
            <p className="text-[13px] text-qs-text-muted">No projects yet — create one with “New project”.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-qs-text-faint" aria-hidden />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or project number" className="pl-9" aria-label="Search projects" />
              </div>
              <div role="radiogroup" aria-label="Projects" className="flex flex-col overflow-hidden rounded-lg border border-qs-border">
                {matches.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-qs-text-muted">No project matches. Try another search, or create a new project.</p>
                ) : (
                  matches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={projectId === p.id}
                      onClick={() => {
                        setProjectId(p.id);
                        touched("projectId");
                        if (!currencyTouched) setDoc((d) => ({ ...d, currency: p.currency }));
                      }}
                      className={cn(
                        "flex items-center gap-3 border-b border-qs-border px-4 py-2.5 text-left transition-colors last:border-b-0",
                        projectId === p.id ? "bg-qs-brand-tint" : "hover:bg-qs-hover",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-[18px] shrink-0 items-center justify-center rounded-full border",
                          projectId === p.id ? "border-qs-brand bg-qs-brand text-white" : "border-qs-border-strong",
                        )}
                      >
                        {projectId === p.id ? <Check className="size-3" aria-hidden /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-[550]">
                          {p.name}
                          {p.projectNo ? <span className="ml-2 font-normal text-qs-text-faint">{p.projectNo}</span> : null}
                        </span>
                        <span className="block text-[12px] text-qs-text-muted">
                          {p.city} · {p.buildingType}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
              {selectedProject && fromCover.has("projectId") ? (
                <p className="text-[12px] text-qs-brand-text">
                  <Sparkles className="mr-1 inline size-3" aria-hidden />
                  Matched to “{selectedProject.name}” from the BOQ cover — change it if that&apos;s wrong.
                </p>
              ) : null}
              {err("projectId") ? <p className="text-[12px] text-qs-danger">{err("projectId")}</p> : null}
            </div>
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={<>Project name{fromCover.has("name") ? <FromCover /> : null}</>} htmlFor="p-name" error={err("name")} className="sm:col-span-2">
              <Input
                id="p-name"
                value={project.name}
                aria-invalid={Boolean(err("name"))}
                onChange={(e) => {
                  touched("name");
                  setProject({ ...project, name: e.target.value });
                }}
                placeholder="Q-Walk"
              />
              {similar ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-qs-warning-bg px-3 py-2 text-[12.5px] text-qs-warning">
                  <span>
                    “{similar.name}” already exists{similar.projectNo ? ` (${similar.projectNo})` : ""}. Add this BOQ to it instead of creating a duplicate.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setProjectMode("existing");
                      setProjectId(similar.id);
                      setQuery("");
                      if (!currencyTouched) setDoc((d) => ({ ...d, currency: similar.currency }));
                    }}
                  >
                    Use existing project
                  </Button>
                </div>
              ) : null}
            </Field>
            <Field label="Project number" htmlFor="p-no" hint="Optional, e.g. 26-1120" error={err("projectNo")}>
              <Input id="p-no" value={project.projectNo} onChange={(e) => setProject({ ...project, projectNo: e.target.value })} placeholder="26-1120" />
            </Field>
            <Field label="Project date" htmlFor="p-date" error={err("projectDate")} hint="When the project started or was received.">
              <div className="flex gap-2">
                <Input
                  id="p-date"
                  type={project.projectDatePrecision === "MONTH" ? "month" : "date"}
                  value={project.projectDate}
                  aria-invalid={Boolean(err("projectDate"))}
                  onChange={(e) => setProject({ ...project, projectDate: e.target.value })}
                  className="min-w-0"
                />
                <div className="qs-segmented shrink-0" role="radiogroup" aria-label="Date precision">
                  {(
                    [
                      ["DAY", "Day"],
                      ["MONTH", "Month"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={project.projectDatePrecision === key}
                      className="qs-segmented-item"
                      onClick={() =>
                        setProject({
                          ...project,
                          projectDatePrecision: key,
                          projectDate: key === "MONTH" ? project.projectDate.slice(0, 7) : project.projectDate.length === 7 ? `${project.projectDate}-01` : project.projectDate,
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
            <Field label="Country" htmlFor="p-country" error={err("countryId")}>
              <SelectField
                id="p-country"
                value={project.countryId}
                aria-invalid={Boolean(err("countryId"))}
                onChange={(v) => {
                  const c = data.countries.find((x) => x.id === v);
                  setProject({ ...project, countryId: v, cityId: "" });
                  if (c && !currencyTouched) setDoc((d) => ({ ...d, currency: c.currency }));
                }}
                options={data.countries.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Choose country"
              />
            </Field>
            <Field label="City" htmlFor="p-city" error={err("cityId")}>
              <SelectField
                id="p-city"
                value={project.cityId}
                aria-invalid={Boolean(err("cityId"))}
                onChange={(v) => setProject({ ...project, cityId: v })}
                options={(country?.cities ?? []).map((c) => ({ value: c.id, label: c.name }))}
                placeholder={country ? "Choose city" : "Choose a country first"}
                disabled={!country}
              />
            </Field>
            <Field label="Building type" htmlFor="p-type" error={err("buildingTypeId")} className="sm:col-span-2">
              <SelectField
                id="p-type"
                value={project.buildingTypeId}
                aria-invalid={Boolean(err("buildingTypeId"))}
                onChange={(v) => setProject({ ...project, buildingTypeId: v })}
                options={data.buildingTypes.map((b) => ({ value: b.id, label: b.name }))}
                placeholder="Choose building type"
              />
            </Field>
            <Field label="Client" htmlFor="p-client" hint="Optional">
              <Input id="p-client" value={project.client} onChange={(e) => setProject({ ...project, client: e.target.value })} />
            </Field>
            <Field label="Consultant" htmlFor="p-consultant" hint="Optional">
              <Input id="p-consultant" value={project.consultant} onChange={(e) => setProject({ ...project, consultant: e.target.value })} />
            </Field>
          </div>
        )}
      </Step>

      <Step n={3} title="BOQ details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="d-title" error={err("title")} hint="How this BOQ is listed, e.g. “Q-Walk SD 50% BOQ”." className="sm:col-span-2">
            <Input id="d-title" value={doc.title} aria-invalid={Boolean(err("title"))} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
          </Field>
          <Field label="Rate type" hint="Tender returns, with each contractor's rates, come in a later phase.">
            <div className="qs-segmented w-fit" role="radiogroup" aria-label="Rate type">
              <button type="button" role="radio" aria-checked className="qs-segmented-item">
                PTE
              </button>
              <button type="button" role="radio" aria-checked={false} className="qs-segmented-item" disabled title="Coming in a later phase">
                Tender return
              </button>
            </div>
          </Field>
          <Field label={<>Project stage{fromCover.has("stageId") ? <FromCover /> : null}</>} htmlFor="d-stage" error={err("stageId")}>
            <SelectField
              id="d-stage"
              value={doc.stageId}
              aria-invalid={Boolean(err("stageId"))}
              onChange={(v) => {
                touched("stageId");
                setDoc({ ...doc, stageId: v });
              }}
              options={data.stages.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Choose stage"
            />
          </Field>
          <Field label={<>BOQ date{fromCover.has("boqDate") ? <FromCover /> : null}</>} htmlFor="d-date" error={err("boqDate")} hint="The date the rates were priced.">
            <Input
              id="d-date"
              type="date"
              value={doc.boqDate}
              aria-invalid={Boolean(err("boqDate"))}
              onChange={(e) => {
                touched("boqDate");
                setDoc({ ...doc, boqDate: e.target.value });
              }}
            />
          </Field>
          <Field label="Currency" error={err("currency")} hint="Rates are stored in this currency.">
            <div className="qs-segmented w-fit" role="radiogroup" aria-label="Currency">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={doc.currency === c}
                  className="qs-segmented-item"
                  onClick={() => {
                    setCurrencyTouched(true);
                    setDoc({ ...doc, currency: c });
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Step>

      <div className="flex flex-col gap-3">
        {submitError ? (
          <FormMessage>
            {submitError.message}{" "}
            {submitError.documentId ? (
              <Link href={`/uploads/${submitError.documentId}`} className="underline">
                Open it
              </Link>
            ) : null}
          </FormMessage>
        ) : null}
        {attempted && !check.success ? <FormMessage>Some details are missing — check the fields marked in red.</FormMessage> : null}
        {submitting ? (
          <div className="flex items-center gap-3" role="status">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-qs-hover">
              <div className="h-full rounded-full bg-qs-brand transition-[width] duration-150" style={{ width: `${progress}%` }} />
            </div>
            <span className="w-28 text-right text-[12.5px] text-qs-text-muted tabular-nums">{progress < 100 ? `Uploading ${progress}%` : "Starting extraction…"}</span>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/uploads")} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <UploadCloud aria-hidden />}
            Upload and extract
          </Button>
        </div>
      </div>
    </form>
  );
}
