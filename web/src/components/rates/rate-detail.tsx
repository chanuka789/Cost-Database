"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { DisplayCurrency, ItemDetail, RateRow } from "@/lib/rate-search";
export function money(value: string | number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(Number(value));
}
export function sourceLink(row: RateRow) {
  return `/api/uploads/${row.documentId}/file${row.fileType === "pdf" ? `#page=${row.page}` : ""}`;
}
function Timeline({
  detail,
  currency,
}: {
  detail: ItemDetail;
  currency: DisplayCurrency;
}) {
  const points = detail.history;
  if (!points.length)
    return (
      <p className="text-[13px] text-qs-text-muted">
        No numeric rates to chart.
      </p>
    );
  const dates = points.map((p) => Date.parse(p.boqDate));
  const values = points.map((p) => Number(p.rate));
  const first = Math.min(...dates),
    last = Math.max(...dates);
  const min = Math.min(...values),
    max = Math.max(...values);
  const pad = Math.max((max - min) * 0.1, Math.abs(max) * 0.05, 1);
  const bottom = min >= 0 ? Math.max(0, min - pad) : min - pad,
    top = max + pad;
  const x = (date: number) =>
    first === last ? 250 : 60 + ((date - first) / (last - first)) * 400;
  const y = (value: number) => 160 - ((value - bottom) / (top - bottom)) * 130;
  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 500 200"
        role="img"
        aria-label={`Rate over time in ${currency} per ${detail.item.unit ?? "unknown unit"}`}
        className="w-full text-qs-text-muted"
      >
        {[bottom, (bottom + top) / 2, top].map((v) => (
          <g key={v}>
            <line
              x1="60"
              x2="470"
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              opacity="0.15"
            />
            <text
              x="52"
              y={y(v) + 4}
              textAnchor="end"
              fontSize="10"
              fill="currentColor"
            >
              {money(v)}
            </text>
          </g>
        ))}
        {points.map((p, index) => (
          <circle
            key={index}
            cx={x(dates[index])}
            cy={y(values[index])}
            r="4"
            fill="var(--qs-brand)"
            opacity="0.75"
          >
            <title>{`${p.boqDate} · ${p.projectName} · ${p.stage} · ${money(p.rate)} ${currency}`}</title>
          </circle>
        ))}
        <text x="60" y="184" fontSize="10" fill="currentColor">
          {new Date(first).toISOString().slice(0, 10)}
        </text>
        {last !== first && (
          <text
            x="470"
            y="184"
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
          >
            {new Date(last).toISOString().slice(0, 10)}
          </text>
        )}
      </svg>
      <p className="text-[11.5px] text-qs-text-muted">
        Exact full description and unit matches across published BOQs.{" "}
        {detail.historyCount > points.length
          ? `Showing earliest ${points.length} of ${detail.historyCount} rates.`
          : `${points.length} rate${points.length === 1 ? "" : "s"}.`}
      </p>
      <details>
        <summary className="cursor-pointer text-[12px] text-qs-brand-text">
          View chart data
        </summary>
        <div className="max-h-48 overflow-auto">
          <table className="qs-table">
            <thead>
              <tr>
                <th>BOQ date</th>
                <th>Project / stage</th>
                <th>Rate ({currency})</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, index) => (
                <tr key={index}>
                  <td>{p.boqDate}</td>
                  <td>
                    {p.projectName} · {p.stage}
                  </td>
                  <td>{money(p.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
export function DetailContent({
  itemId,
  currency,
  basket,
  add,
}: {
  itemId: string;
  currency: DisplayCurrency;
  basket: string[];
  add: (row: RateRow) => void;
}) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/rates/items/${itemId}?currency=${currency}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load item.");
        return data as ItemDetail;
      })
      .then(setDetail)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [itemId, currency]);
  if (error)
    return (
      <p role="alert" className="p-5 text-qs-danger">
        {error}
      </p>
    );
  if (!detail)
    return (
      <p className="flex items-center gap-2 p-5">
        <Loader2 className="size-4 animate-spin" />
        Loading item…
      </p>
    );
  const item = detail.item;
  return (
    <div className="space-y-6 px-5 pb-6">
      <section className="space-y-2">
        <Link
          className="text-[15px] font-semibold text-qs-brand-text"
          href={`/projects/${item.projectId}`}
        >
          {item.projectName}
        </Link>
        <p className="text-[12px] text-qs-text-muted">
          {item.projectNo ?? "No project number"} · Project date{" "}
          {item.projectDatePrecision === "MONTH"
            ? item.projectDate.slice(0, 7)
            : item.projectDate}{" "}
          · {item.city}, {item.country}
        </p>
        <p className="text-[12px] text-qs-text-muted">
          {item.buildingType} · {item.stage} · BOQ {item.boqDate} ·{" "}
          {item.rateType}
        </p>
        <h3 className="text-[14px] font-semibold">
          {item.itemRef} · {item.description}
        </h3>
        <p className="whitespace-pre-wrap text-[13px] leading-6 text-qs-text-secondary">
          {item.fullDescription}
        </p>
        <p className="text-[12px] text-qs-text-muted">
          Bill {item.billNo} · {item.billTitle} · Unit {item.unit ?? "Unknown"}{" "}
          · Quantity {item.qty ?? "—"}
        </p>
        <a
          href={sourceLink(item)}
          target="_blank"
          rel="noopener"
          className="inline-block text-[13px] text-qs-brand-text"
        >
          Open original BOQ · {item.fileType === "pdf" ? "page" : "sheet"}{" "}
          {item.page} ↗
        </a>
      </section>
      <section>
        <h3 className="mb-3 text-[14px] font-semibold">
          Item rates · {currency}/{item.unit ?? "unit unknown"}
        </h3>
        {detail.stats && (
          <p className="mb-3 text-[12px] text-qs-text-muted">
            Lowest {money(detail.stats.min)} · Median{" "}
            {money(detail.stats.median)} · Highest {money(detail.stats.max)}
          </p>
        )}
        <div className="space-y-2">
          {detail.rates.map((row) => (
            <div
              key={row.rateId}
              className="flex items-center justify-between gap-3 rounded-lg border border-qs-border p-3"
            >
              <div>
                <p className="text-[12px] text-qs-text-muted">
                  {row.rateType}
                  {row.bidderId ? ` · Bidder ${row.bidderId}` : ""}
                </p>
                <p className="text-[18px] font-semibold tabular-nums">
                  {row.rate === null
                    ? (row.rateNote ?? "No numeric rate")
                    : money(row.rate)}
                </p>
                <p className="text-[11px] text-qs-text-muted">
                  Source: {money(row.originalRate)} {row.originalCurrency} ·
                  Amount {money(row.amount)} {currency}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={basket.includes(row.rateId)}
                onClick={() => add(row)}
              >
                {basket.includes(row.rateId) ? <Check /> : <Plus />}
                {basket.includes(row.rateId) ? "Added" : "Add to basket"}
              </Button>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-[14px] font-semibold">Rate over time</h3>
        <Timeline detail={detail} currency={currency} />
      </section>
      <section>
        <h3 className="mb-2 text-[14px] font-semibold">
          Other items in this group
        </h3>
        {item.mainDescription && (
          <p className="mb-3 text-[12px] leading-5 text-qs-text-muted">
            {item.mainDescription}
          </p>
        )}
        {detail.siblings.length ? (
          <div className="space-y-2">
            {detail.siblings.map((row) => (
              <div
                key={row.rateId}
                className="rounded-lg border border-qs-border p-3"
              >
                <p className="text-[13px]">
                  {row.itemRef} · {row.description}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[12px] text-qs-text-muted">
                    {row.unit ?? "Unknown unit"} ·{" "}
                    {row.rate === null
                      ? (row.rateNote ?? "—")
                      : money(row.rate)}{" "}
                    {currency}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={basket.includes(row.rateId)}
                    onClick={() => add(row)}
                  >
                    {basket.includes(row.rateId) ? "Added" : "Add to basket"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-qs-text-muted">
            No other items in this group.
          </p>
        )}
      </section>
    </div>
  );
}
export function RateDetailSheet({
  itemId,
  currency,
  basket,
  add,
  close,
}: {
  itemId: string | null;
  currency: DisplayCurrency;
  basket: string[];
  add: (row: RateRow) => void;
  close: () => void;
}) {
  return (
    <Sheet
      open={Boolean(itemId)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent className="w-[calc(100%-24px)] overflow-y-auto sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle>Item detail</SheetTitle>
          <SheetDescription>
            Source, related rates and historical prices.
          </SheetDescription>
        </SheetHeader>
        {itemId && (
          <DetailContent
            key={`${itemId}-${currency}`}
            itemId={itemId}
            currency={currency}
            basket={basket}
            add={add}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
