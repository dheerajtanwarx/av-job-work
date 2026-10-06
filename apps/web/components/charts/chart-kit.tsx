"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TableWrap } from "@/components/ui/card";
import { CountUp, useReducedMotion } from "@/components/ui/count-up";
import { cn } from "@/lib/utils";

/**
 * Chart primitives (dataviz method): one y-axis, thin bars (≤24px, 4px rounded data end, square at the
 * baseline), hairline grid, recessive axes, text in text tokens, per-mark hover tooltip, a legend for ≥2 series
 * and a table view for every chart. Palette: validated categorical slots 1–3 and a one-hue blue ordinal ramp,
 * each with its own dark-mode steps.
 */
export const VIZ_CSS = `
.viz { --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a;
  --seq-1:#86b6ef; --seq-2:#5598e7; --seq-3:#2a78d6; --seq-4:#1c5cab; --seq-5:#104281; }
@media (prefers-color-scheme: dark) {
  .viz { --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70;
    --seq-1:#9ec5f4; --seq-2:#6da7ec; --seq-3:#3987e5; --seq-4:#256abf; --seq-5:#184f95; }
}
@media print { .viz { --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a; } }
.viz .recharts-cartesian-axis-tick-value { fill: var(--fg-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.viz .recharts-surface:focus, .viz .recharts-wrapper:focus { outline: none; }
.viz-ring { transition: stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1); }
@media (prefers-reduced-motion: reduce) { .viz-ring { transition: none; } }
`;

/** Bars grow from the baseline on first paint and glide to new values when the period changes. */
function useBarMotion() {
  const reduced = useReducedMotion();
  return { isAnimationActive: !reduced, animationDuration: 700, animationEasing: "ease-out" as const };
}

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)"] as const;
export const SEQ = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)"] as const;

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const fmt = {
  rupees: (paise: number) => `₹${plain.format(Math.round(paise / 100))}`,
  rupeesShort: (paise: number) => `₹${compact.format(paise / 100)}`,
  qty: (n: number) => plain.format(n),
  qtyShort: (n: number) => compact.format(n),
  pct: (n: number) => `${plain.format(n)}%`,
  days: (n: number) => `${plain.format(n)} d`,
};

export function VizStyle() {
  return <style>{VIZ_CSS}</style>;
}

export interface TableSpec {
  columns: { label: string; align?: "right" }[];
  rows: ReactNode[][];
}

/** A titled chart with a Chart / Table switch (the table is the accessible and exact view of the same data). */
export function ChartCard({ title, subtitle, table, empty, legend, children, className }: { title: string; subtitle?: ReactNode; table: TableSpec; empty?: boolean; legend?: ReactNode; children: ReactNode; className?: string }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("viz min-w-0 rounded-lg border border-border bg-surface", className)} aria-label={title}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
        </div>
        {!empty && (
          <button
            type="button"
            onClick={() => setView(view === "chart" ? "table" : "chart")}
            className="no-print -mr-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            aria-pressed={view === "table"}
          >
            {view === "chart" ? <Table2 className="size-3.5" /> : <BarChart3 className="size-3.5" />}
            {view === "chart" ? "Table" : "Chart"}
          </button>
        )}
      </div>
      {legend && !empty && view === "chart" && <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-xs text-fg-2">{legend}</div>}
      <div className="px-2 pt-2 pb-3">
        {empty ? (
          <p className="px-2 py-10 text-center text-[13px] text-fg-muted">No data in this period.</p>
        ) : view === "chart" ? (
          children
        ) : (
          <TableWrap className="px-2">
            <table className="ledger">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c.label} className={c.align === "right" ? "r" : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className={table.columns[j]?.align === "right" ? "r" : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
    </section>
  );
}

export function LegendItem({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

/** Tooltip body: a title and label/value rows, in text tokens with a colour key beside each value. */
export function TipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-xs shadow-overlay">
      <div className="mb-1 font-medium text-fg">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-fg-2">
          <span className="inline-flex items-center gap-1.5">
            {r.color && <span className="size-2 rounded-[2px]" style={{ background: r.color }} aria-hidden />}
            {r.label}
          </span>
          <span className="num font-medium text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type Datum = Record<string, string | number | null>;

/**
 * Horizontal bars for ranked categories (workers, designs). One axis; the value sits at the bar tip.
 * `series` > 1 draws grouped bars and the caller shows a legend.
 */
export function HBars<T extends Datum>({
  data,
  category,
  series,
  format,
  tip,
  colors,
}: {
  data: T[];
  category: keyof T & string;
  series: { key: keyof T & string; label: string; color?: string }[];
  format: (n: number) => string;
  tip?: (d: T) => { title: ReactNode; rows: { label: string; value: string; color?: string }[] };
  /** Per-bar colours (single series only), e.g. an ordinal ramp. */
  colors?: string[];
}) {
  const motion = useBarMotion();
  const band = series.length > 1 ? 44 : 30;
  const height = Math.max(120, data.length * band + 28);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data as Record<string, unknown>[]} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barGap={2} barCategoryGap={series.length > 1 ? "18%" : "28%"}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tickFormatter={(v: number) => format(v)} axisLine={false} tickLine={false} tickCount={4} />
          <YAxis type="category" dataKey={category as string} width={112} axisLine={{ stroke: "var(--border-strong)" }} tickLine={false} interval={0} tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as T;
              const t = tip?.(d) ?? { title: String(d[category]), rows: series.map((s, i) => ({ label: s.label, value: format(Number(d[s.key] ?? 0)), color: s.color ?? SERIES[i] })) };
              return <TipBox {...t} />;
            }}
          />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key as string} name={s.label} fill={s.color ?? SERIES[i]} radius={[0, 4, 4, 0]} maxBarSize={series.length > 1 ? 14 : 20} {...motion} animationBegin={i * 120}>
              {colors && series.length === 1 && data.map((_, j) => <Cell key={j} fill={colors[j % colors.length]} />)}
              <LabelList dataKey={s.key} position="right" formatter={(v: unknown) => (typeof v === "number" ? format(v) : "")} style={{ fill: "var(--fg-2)", fontSize: 11 }} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical columns over an ordered axis (months, aging buckets). One series; optional per-column colours. */
export function Columns<T extends Datum>({
  data,
  category,
  value,
  format,
  formatAxis,
  tickLabel,
  tip,
  colors,
  label,
  height = 220,
}: {
  data: T[];
  category: keyof T & string;
  value: keyof T & string;
  format: (n: number) => string;
  formatAxis?: (n: number) => string;
  tickLabel?: (v: string) => string;
  tip?: (d: T) => { title: ReactNode; rows: { label: string; value: string; color?: string }[] };
  colors?: string[];
  label: string;
  height?: number;
}) {
  const motion = useBarMotion();
  const max = Math.max(0, ...data.map((d) => Number(d[value] ?? 0)));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data as Record<string, unknown>[]} margin={{ top: 18, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={category as string} tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tickFormatter={tickLabel} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tickFormatter={(v: number) => (formatAxis ?? format)(v)} axisLine={false} tickLine={false} width={56} tickCount={4} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as T;
              const t = tip?.(d) ?? { title: tickLabel ? tickLabel(String(d[category])) : String(d[category]), rows: [{ label, value: format(Number(d[value] ?? 0)) }] };
              return <TipBox {...t} />;
            }}
          />
          <Bar dataKey={value as string} name={label} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={24} {...motion}>
            {colors && data.map((_, j) => <Cell key={j} fill={colors[j % colors.length]} />)}
            {/* Label only the peak, so the chart never carries a number on every column. */}
            <LabelList dataKey={value} position="top" formatter={(v: unknown) => (typeof v === "number" && v === max && v > 0 ? (formatAxis ?? format)(v) : "")} style={{ fill: "var(--fg-2)", fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Two or three series over an ordered axis (months), sharing one y-scale: 2px lines over a faint one-hue wash,
 * a crosshair and one tooltip listing every series at the hovered point. The caller shows a legend.
 */
export function AreaTrend<T extends Datum>({
  data,
  category,
  series,
  format,
  formatAxis,
  tickLabel,
  height = 240,
}: {
  data: T[];
  category: keyof T & string;
  series: { key: keyof T & string; label: string; color?: string }[];
  format: (n: number) => string;
  formatAxis?: (n: number) => string;
  tickLabel?: (v: string) => string;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, "");
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: s.color ?? SERIES[i], stopOpacity: 0.22 }} />
                <stop offset="100%" style={{ stopColor: s.color ?? SERIES[i], stopOpacity: 0 }} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={category as string} tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tickFormatter={tickLabel} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tickFormatter={(v: number) => (formatAxis ?? format)(v)} axisLine={false} tickLine={false} width={56} tickCount={4} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as T;
              return <TipBox title={tickLabel ? tickLabel(String(d[category])) : String(d[category])} rows={series.map((s, i) => ({ label: s.label, value: format(Number(d[s.key] ?? 0)), color: s.color ?? SERIES[i] }))} />;
            }}
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key as string}
              name={s.label}
              stroke={s.color ?? SERIES[i]}
              strokeWidth={2}
              fill={`url(#${id}-${i})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)", fill: s.color ?? SERIES[i] }}
              isAnimationActive={!reduced}
              animationDuration={1100}
              animationBegin={i * 150}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A single share as a ring that sweeps to its value, with the figure counting up in the middle. */
export function RingMeter({ pct, label, size = 132 }: { pct: number; label: ReactNode; size?: number }) {
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(Math.max(0, Math.min(100, pct))));
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct)}%`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle className="viz-ring" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={SERIES[2]} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - drawn / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center" aria-hidden>
        <div className="num text-2xl leading-7 font-semibold tracking-[-0.02em] text-fg">
          <CountUp value={Math.round(pct)} format={(n) => `${n}%`} />
        </div>
        <div className="text-[11px] text-fg-muted">{label}</div>
      </div>
    </div>
  );
}
