"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  ShoppingBasket,
  Download,
  Plus,
  Check,
  Loader2,
  X,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import {
  currencies,
  parseSearch,
  searchParams,
  searchSchema,
  type DisplayCurrency,
  type RateRow,
  type SearchFilters,
  type SearchOptions,
  type SearchResult,
} from "@/lib/rate-search";
import { RateDetailSheet, money } from "./rate-detail";

const subscribe = (callback: () => void) => {
  window.addEventListener("qsgs-basket", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("qsgs-basket", callback);
    window.removeEventListener("storage", callback);
  };
};
function useBasket(userId: string) {
  const key = `qsgs-rate-basket-v1:${userId}`;
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(key) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  const ids = useMemo(() => {
    try {
      const data = JSON.parse(snapshot);
      return Array.isArray(data)
        ? ([
            ...new Set(
              data.filter(
                (v: unknown) => typeof v === "string" && v.length < 101,
              ),
            ),
          ].slice(0, 500) as string[])
        : [];
    } catch {
      return [];
    }
  }, [snapshot]);
  const save = (values: string[]) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(values));
      window.dispatchEvent(new Event("qsgs-basket"));
    } catch {
      throw new Error("Your browser is blocking basket storage.");
    }
  };
  return { ids, save };
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = `filter-${label.toLowerCase().replace(/\s/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <SelectField
        id={id}
        value={value}
        onChange={onChange}
        placeholder="All"
        options={[{ value: "", label: "All" }, ...options]}
      />
    </div>
  );
}
function MultiFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = options.filter((o) =>
    o.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-[12px] font-semibold">
        {label}
        {selected.length ? ` (${selected.length})` : ""}
      </legend>
      <Input
        aria-label={`Find ${label.toLowerCase()}`}
        placeholder={`Find ${label.toLowerCase()}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border border-qs-border bg-qs-raised p-3">
        {shown.length ? (
          shown.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 text-[12px]"
            >
              <Checkbox
                aria-label={`${label}: ${o.name}`}
                checked={selected.includes(o.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...selected, o.id]
                      : selected.filter((id) => id !== o.id),
                  )
                }
              />
              <span>{o.name}</span>
            </label>
          ))
        ) : (
          <p className="text-[12px] text-qs-text-muted">No matches</p>
        )}
      </div>
    </fieldset>
  );
}
function BasketContent({
  ids,
  currency,
  save,
}: {
  ids: string[];
  currency: DisplayCurrency;
  save: (ids: string[]) => void;
}) {
  const [rows, setRows] = useState<RateRow[] | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/rates/basket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rateIds: ids, currency }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load basket.");
        return data.rows as RateRow[];
      })
      .then(setRows)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [ids, currency]);
  async function exportBasket() {
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/rates/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateIds: ids, currency }),
      });
      if (!response.ok)
        throw new Error((await response.json()).error ?? "Export failed.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `QSGS-rates-${currency}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="space-y-3 px-5 pb-5">
      {error && (
        <p role="alert" className="text-[13px] text-qs-danger">
          {error}
        </p>
      )}
      {!rows && !error && (
        <p className="flex gap-2">
          <Loader2 className="size-4 animate-spin" />
          Loading basket…
        </p>
      )}
      {rows && rows.length < ids.length && (
        <div className="rounded-lg bg-qs-warning-bg p-3 text-[13px] text-qs-warning">
          <p>Some saved rates are no longer published.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => save(rows.map((r) => r.rateId))}
          >
            Remove unavailable rates
          </Button>
        </div>
      )}
      {rows?.map((row) => (
        <div
          key={row.rateId}
          className="rounded-lg border border-qs-border p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-semibold">{row.description}</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${row.itemRef} from basket`}
              onClick={() => save(ids.filter((id) => id !== row.rateId))}
            >
              <X />
            </Button>
          </div>
          <p className="text-[12px] text-qs-text-muted">
            {row.projectName} · {row.projectNo} · {row.stage} · {row.boqDate}
          </p>
          <p className="mt-2 text-[14px] font-semibold tabular-nums">
            {row.rate === null
              ? (row.rateNote ?? "No numeric rate")
              : money(row.rate)}{" "}
            {currency} / {row.unit ?? "unit unknown"}
          </p>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 border-t border-qs-border pt-4">
        <Button
          variant="outline"
          disabled={
            !rows || !rows.length || rows.length !== ids.length || exporting
          }
          onClick={exportBasket}
        >
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          Export Excel
        </Button>
        <Button variant="ghost" onClick={() => save([])}>
          Clear basket
        </Button>
      </div>
      <p className="text-[11.5px] text-qs-text-muted">
        Includes project, dates, location, stage, bill, full description, source
        values and converted prices. Basket is saved in this browser tab.
      </p>
    </div>
  );
}
export function RateSearchWorkspace({
  userId,
  admin,
  initialFilters,
  initialResult,
  options,
  initialError,
}: {
  userId: string;
  admin: boolean;
  initialFilters: SearchFilters;
  initialResult: SearchResult;
  options: SearchOptions;
  initialError?: string;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [result, setResult] = useState(initialResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [showBasket, setShowBasket] = useState(false);
  const { ids, save } = useBasket(userId);
  const searchInput = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const runSearch = useCallback(
    async (next: SearchFilters, changeUrl = true) => {
      const parsed = searchSchema.safeParse(next);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check your filters.");
        return;
      }
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setFilters(parsed.data);
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/rates?${searchParams(parsed.data)}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Search failed.");
        if (controller.signal.aborted) return;
        const actual = { ...parsed.data, page: data.page };
        setResult(data);
        setApplied(actual);
        setFilters((previous) =>
          searchParams(previous).toString() ===
          searchParams(parsed.data).toString()
            ? actual
            : previous,
        );
        if (changeUrl)
          window.history.pushState(null, "", `/?${searchParams(actual)}`);
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") setError(e.message);
      } finally {
        if (pending.current === controller) setLoading(false);
      }
    },
    [],
  );
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    const back = () => {
      try {
        void runSearch(
          parseSearch(new URLSearchParams(window.location.search)),
          false,
        );
      } catch {
        setError("Invalid search URL.");
      }
    };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("popstate", back);
      pending.current?.abort();
    };
  }, [runSearch]);
  const patch = (
    key: keyof SearchFilters,
    value: SearchFilters[keyof SearchFilters],
  ) => setFilters((previous) => ({ ...previous, [key]: value, page: 1 }));
  const add = (row: RateRow) => {
    if (ids.includes(row.rateId)) return;
    if (ids.length >= 500) {
      setError(
        "The basket holds up to 500 rates. Export or remove some first.",
      );
      return;
    }
    try {
      save([...ids, row.rateId]);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const activeFilters = Object.entries(applied).filter(
    ([key, value]) =>
      !["q", "currency", "page"].includes(key) &&
      (Array.isArray(value) ? value.length : value),
  ).length;
  const simple = (data: { id: string; name: string }[]) =>
    data.map((o) => ({ value: o.id, label: o.name }));
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <>
      <PageHeader
        eyebrow="Cost intelligence"
        title="Rate search"
        description="Find and compare rates from published BOQs, with every price linked to its project."
        actions={
          <Button variant="outline" onClick={() => setShowBasket(true)}>
            <ShoppingBasket />
            Basket{" "}
            <span className="rounded bg-qs-hover px-1.5 text-[12px] tabular-nums">
              {ids.length}
            </span>
          </Button>
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const dates = showFilters
            ? Object.fromEntries(
                ["boqFrom", "boqTo", "projectFrom", "projectTo"].map((key) => [
                  key,
                  String(data.get(key) ?? "") || undefined,
                ]),
              )
            : {};
          void runSearch({
            ...filters,
            ...dates,
            q: String(data.get("q") ?? filters.q),
            page: 1,
          });
        }}
        className="qs-card mb-4 p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="rate-query">Item description or project</Label>
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-3 size-4 text-qs-text-muted" />
              <Input
                id="rate-query"
                name="q"
                ref={searchInput}
                className="pl-9"
                placeholder="Try 60mm concrete paver, Q-Walk or 26-1120…"
                value={filters.q}
                onChange={(e) => patch("q", e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Search />}Search
          </Button>
          <Button
            variant="outline"
            type="button"
            aria-expanded={showFilters}
            aria-controls="rate-filters"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal />
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </Button>
          <div className="w-28">
            <Label htmlFor="rate-currency">Currency</Label>
            <div className="mt-1.5">
              <SelectField
                id="rate-currency"
                value={filters.currency}
                options={currencies.map((c) => ({ value: c, label: c }))}
                onChange={(value) => {
                  const currency = value as DisplayCurrency;
                  patch("currency", currency);
                  void runSearch({ ...applied, currency });
                }}
              />
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] text-qs-text-muted">
          Ctrl+K to focus search · Fixed USD pegs; source rates stay unchanged.
        </p>
        {showFilters && (
          <div
            id="rate-filters"
            className="mt-4 space-y-4 border-t border-qs-border pt-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <MultiFilter
                label="Projects"
                options={options.projects.map((p) => ({
                  id: p.id,
                  name: `${p.name}${p.projectNo ? ` · ${p.projectNo}` : ""}`,
                }))}
                selected={filters.projects}
                onChange={(values) => patch("projects", values)}
              />
              <MultiFilter
                label="Stages"
                options={options.stages}
                selected={filters.stages}
                onChange={(values) => patch("stages", values)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FilterSelect
                label="Country"
                value={filters.country ?? ""}
                options={simple(options.countries)}
                onChange={(value) =>
                  setFilters((previous) => ({
                    ...previous,
                    country: value || undefined,
                    city: undefined,
                    page: 1,
                  }))
                }
              />
              <FilterSelect
                label="City"
                value={filters.city ?? ""}
                options={simple(
                  options.cities.filter(
                    (c) => !filters.country || c.countryId === filters.country,
                  ),
                )}
                onChange={(value) => patch("city", value || undefined)}
              />
              <FilterSelect
                label="Building type"
                value={filters.buildingType ?? ""}
                options={simple(options.buildingTypes)}
                onChange={(value) => patch("buildingType", value || undefined)}
              />
              <FilterSelect
                label="Rate type"
                value={filters.rateType ?? ""}
                options={[
                  { value: "PTE", label: "PTE" },
                  { value: "TENDER", label: "Tender" },
                ]}
                onChange={(value) => patch("rateType", value || undefined)}
              />
              <FilterSelect
                label="Unit"
                value={filters.unit ?? ""}
                options={options.units.map((u) => ({ value: u, label: u }))}
                onChange={(value) => patch("unit", value || undefined)}
              />
              <FilterSelect
                label="Trade / heading"
                value={filters.trade ?? ""}
                options={options.trades.map((u) => ({ value: u, label: u }))}
                onChange={(value) => patch("trade", value || undefined)}
              />
              {options.bidders.length > 0 && (
                <FilterSelect
                  label="Bidder"
                  value={filters.bidder ?? ""}
                  options={options.bidders.map((u) => ({ value: u, label: u }))}
                  onChange={(value) => patch("bidder", value || undefined)}
                />
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["boqFrom", "BOQ date from"],
                  ["boqTo", "BOQ date to"],
                  ["projectFrom", "Project date from"],
                  ["projectTo", "Project date to"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    name={key}
                    className="mt-1.5"
                    type="date"
                    value={filters[key] ?? ""}
                    onInput={(e) =>
                      patch(key, e.currentTarget.value || undefined)
                    }
                    onChange={(e) => patch(key, e.target.value || undefined)}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11.5px] text-qs-text-muted">
                Trade filters follow the headings in the BOQ.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const next = parseSearch(
                      new URLSearchParams(`currency=${applied.currency}`),
                    );
                    setFilters(next);
                    void runSearch(next);
                  }}
                >
                  Reset search and filters
                </Button>
                <Button type="submit" variant="outline" disabled={loading}>
                  Apply filters
                </Button>
              </div>
            </div>
          </div>
        )}
      </form>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-qs-danger-bg p-3 text-[13px] text-qs-danger"
        >
          {error}
        </p>
      )}
      <div aria-busy={loading} className={loading ? "opacity-60" : ""}>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              label: `Median rate (${applied.currency})`,
              value: result.stats ? money(result.stats.median) : "—",
              note: result.stats
                ? `per ${result.stats.unit}`
                : result.numericRates
                  ? "Choose one unit to compare"
                  : "No numeric rates",
              brand: true,
            },
            {
              label: `Min–max (${applied.currency})`,
              value: result.stats
                ? `${money(result.stats.min)} – ${money(result.stats.max)}`
                : "—",
              note: result.stats
                ? `per ${result.stats.unit}`
                : "Statistics stay within one unit",
            },
            {
              label: "Rates",
              value: result.total.toLocaleString(),
              note: `${result.numericRates.toLocaleString()} numeric rates`,
            },
            {
              label: "Projects",
              value: result.projects.toLocaleString(),
              note: "Across matching published BOQs",
            },
          ].map((card) => (
            <div key={card.label} className="qs-card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-qs-text-muted">
                {card.label}
              </p>
              <p
                className={`mt-2 break-words text-[20px] font-semibold tabular-nums ${card.brand ? "text-qs-brand-text" : ""}`}
              >
                {card.value}
              </p>
              <p className="mt-1 text-[11.5px] text-qs-text-muted">
                {card.note}
              </p>
            </div>
          ))}
        </div>
        {result.numericRates > 0 && !result.stats && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-qs-border bg-qs-raised p-3">
            <p className="mr-1 text-[13px] text-qs-text-muted">
              Choose a unit for comparable statistics:
            </p>
            {result.units.map((unit) => (
              <Button
                key={unit}
                variant="outline"
                size="sm"
                onClick={() => void runSearch({ ...applied, unit, page: 1 })}
              >
                {unit}
              </Button>
            ))}
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-qs-text-muted">
          <p>
            {result.total
              ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total} rates`
              : "0 matching rates"}
            {applied.q ? ` for “${applied.q}”` : ""}
          </p>
          <p role="status" aria-live="polite">
            {loading
              ? "Searching…"
              : `${result.elapsedMs} ms · Relevance, then newest BOQ`}
          </p>
        </div>
        {result.rows.length ? (
          <div className="qs-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="qs-table min-w-[900px]">
                <thead>
                  <tr>
                    <th className="w-10">
                      <span className="sr-only">Basket</span>
                    </th>
                    <th>Item / description chain</th>
                    <th>Project / location</th>
                    <th>Stage / BOQ date</th>
                    <th>Source</th>
                    <th>Unit</th>
                    <th className="text-right">Rate ({applied.currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr key={row.rateId} className="hover:bg-qs-hover">
                      <td>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={ids.includes(row.rateId)}
                          aria-label={`Add ${row.itemRef} ${row.description} to basket`}
                          onClick={() => add(row)}
                        >
                          {ids.includes(row.rateId) ? (
                            <Check className="text-qs-success" />
                          ) : (
                            <Plus />
                          )}
                        </Button>
                      </td>
                      <td className="max-w-[400px]">
                        <button
                          type="button"
                          className="block w-full text-left text-[13px] font-semibold text-qs-brand-text hover:underline focus-visible:outline-qs-brand"
                          onClick={() => setItemId(row.itemId)}
                          onKeyDown={(event) => {
                            if (
                              event.key === "ArrowDown" ||
                              event.key === "ArrowUp"
                            ) {
                              event.preventDefault();
                              const target = event.currentTarget
                                .closest("tbody")
                                ?.querySelectorAll<HTMLButtonElement>(
                                  "button[data-rate-detail]",
                                )[index + (event.key === "ArrowDown" ? 1 : -1)];
                              target?.focus();
                            }
                          }}
                          data-rate-detail
                        >
                          {row.itemRef} · {row.description}
                        </button>
                        <p
                          className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-qs-text-muted"
                          title={row.fullDescription}
                        >
                          {row.fullDescription}
                        </p>
                      </td>
                      <td className="max-w-[220px]">
                        <Link
                          className="text-[13px] text-qs-brand-text"
                          href={`/projects/${row.projectId}`}
                        >
                          {row.projectName}
                        </Link>
                        <p className="mt-1 text-[11.5px] text-qs-text-muted">
                          {row.projectNo ?? "—"} · {row.city}
                        </p>
                      </td>
                      <td>
                        <p>{row.stage}</p>
                        <p className="mt-1 text-[11.5px] text-qs-text-muted">
                          {row.boqDate}
                        </p>
                      </td>
                      <td>
                        <p>{row.rateType}</p>
                        {row.rateType === "TENDER" && (
                          <p className="text-[11px] text-qs-text-muted">
                            {row.bidderCount} bidders
                          </p>
                        )}
                        {row.bidderId && (
                          <p className="text-[11px] text-qs-text-muted">
                            Bidder {row.bidderId}
                          </p>
                        )}
                      </td>
                      <td>{row.unit ?? "—"}</td>
                      <td className="text-right tabular-nums">
                        <p className="text-[14px] font-semibold">
                          {row.rate === null
                            ? (row.rateNote ?? "—")
                            : money(row.rate)}
                        </p>
                        {row.originalCurrency !== applied.currency && (
                          <p className="mt-1 text-[10px] text-qs-text-muted">
                            Converted from {row.originalCurrency}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-qs-border bg-qs-raised p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || result.page <= 1}
                onClick={() =>
                  void runSearch({ ...applied, page: result.page - 1 })
                }
              >
                <ArrowLeft />
                Previous
              </Button>
              <span className="text-[12px] text-qs-text-muted">
                Page {result.page} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || result.page >= pages}
                onClick={() =>
                  void runSearch({ ...applied, page: result.page + 1 })
                }
              >
                Next
                <ArrowRight />
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title={
              options.projects.length
                ? "No matching rates"
                : "No published rates yet"
            }
            description={
              options.projects.length
                ? "Try a broader description or reset the filters."
                : admin
                  ? "Review and publish a BOQ to make its rates searchable."
                  : "Rates will appear when an admin publishes a BOQ."
            }
            action={
              admin && !options.projects.length ? (
                <Button variant="outline" asChild>
                  <Link href="/uploads">Review uploads</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
      <RateDetailSheet
        itemId={itemId}
        currency={applied.currency}
        basket={ids}
        add={add}
        close={() => setItemId(null)}
      />
      <Sheet open={showBasket} onOpenChange={setShowBasket}>
        <SheetContent className="w-[calc(100%-24px)] overflow-y-auto sm:max-w-[540px]">
          <SheetHeader>
            <SheetTitle>Rate basket · {ids.length}</SheetTitle>
            <SheetDescription>
              Rates collected across searches, displayed in {applied.currency}.
            </SheetDescription>
          </SheetHeader>
          {ids.length ? (
            <BasketContent
              key={`${ids.join(",")}-${applied.currency}`}
              ids={ids}
              currency={applied.currency}
              save={save}
            />
          ) : (
            <p className="px-5 text-[13px] text-qs-text-muted">
              Use the + button beside a result to collect rates here.
            </p>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
