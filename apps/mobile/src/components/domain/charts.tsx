import * as Haptics from "expo-haptics";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, Text } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";

/**
 * Small chart kit for the Analytics screen, built from plain Views (bars are all these charts need).
 * Marks follow the dataviz rules: thin bars with rounded data-ends on a recessive track, 2px gaps between
 * adjacent bars, values in text ink (never the series colour), one colour per series in a fixed order
 * (theme `chart` palette, validated for CVD in light and dark), and a table view on every card.
 */

export interface TableSpec {
  columns: { label: string; right?: boolean }[];
  rows: (string | number)[][];
}

/** Title, subtitle, optional legend, the chart, and a Chart/Table toggle so every number is readable as text. */
export function ChartCard({ title, subtitle, legend, empty, table, children }: { title: string; subtitle?: string; legend?: ReactNode; empty?: boolean; table: TableSpec; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card contentStyle={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline">{title}</Text>
          {subtitle ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {!empty ? (
          <Pressable onPress={() => setAsTable(!asTable)} hitSlop={10} accessibilityRole="button" style={{ paddingVertical: 2 }}>
            <Text variant="label" tone="accent">
              {asTable ? "Chart" : "Table"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {empty ? (
        <Text tone="muted" align="center" style={{ paddingVertical: space.xl }}>
          No data in this period
        </Text>
      ) : asTable ? (
        <DataTable spec={table} />
      ) : (
        <>
          {legend ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.lg }}>{legend}</View> : null}
          {children}
        </>
      )}
    </Card>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

function DataTable({ spec }: { spec: TableSpec }) {
  const { c } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", gap: space.sm, paddingBottom: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong }}>
        {spec.columns.map((col, i) => (
          <Text key={i} variant="caption" tone="muted" align={col.right ? "right" : "left"} style={{ flex: i === 0 ? 1.6 : 1 }} numberOfLines={2}>
            {col.label}
          </Text>
        ))}
      </View>
      {spec.rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.xs + 2, borderBottomWidth: r === spec.rows.length - 1 ? 0 : StyleSheet.hairlineWidth, borderColor: c.border }}>
          {row.map((cell, i) => (
            <Text key={i} variant="caption" num={i > 0} align={spec.columns[i]?.right ? "right" : "left"} style={{ flex: i === 0 ? 1.6 : 1 }} numberOfLines={2}>
              {String(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export interface BarSeries {
  key: string;
  label: string;
  color?: string;
}

/**
 * Horizontal bars: a label above each bar and the value at its end (direct labels, ≤ 10 rows).
 * With two series the bars of one category sit together with a 2px gap.
 */
export function HBars<T extends Record<string, unknown>>({ data, category, series, format }: { data: T[]; category: keyof T; series: BarSeries[]; format: (n: number) => string }) {
  const { c } = useTheme();
  const max = Math.max(1e-9, ...data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0))));
  return (
    <View style={{ gap: space.md }}>
      {data.map((d, i) => (
        <View key={i} style={{ gap: 4 }} accessible accessibilityLabel={`${String(d[category])}: ${series.map((s) => `${s.label} ${format(Number(d[s.key] ?? 0))}`).join(", ")}`}>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {String(d[category])}
          </Text>
          <View style={{ gap: 2 }}>
            {series.map((s, si) => {
              const v = Number(d[s.key] ?? 0);
              return (
                <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ flex: 1, height: 10, borderRadius: 4, backgroundColor: c.surface2, overflow: "hidden" }}>
                    <View style={{ width: `${(Math.max(0, v) / max) * 100}%`, minWidth: v > 0 ? 3 : 0, height: "100%", borderRadius: 4, backgroundColor: s.color ?? c.chart[si % c.chart.length] }} />
                  </View>
                  <Text variant="caption" num style={{ minWidth: 64, textAlign: "right" }}>
                    {format(v)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Vertical columns (months, aging buckets). Tap a column to read its exact value in the line above the chart;
 * the largest value is labelled by default so the scale is never a guess.
 */
export function Columns<T extends Record<string, unknown>>({ data, category, value, format, tickLabel, color }: { data: T[]; category: keyof T; value: keyof T; format: (n: number) => string; tickLabel: (v: string) => string; color?: string }) {
  const { c } = useTheme();
  const values = data.map((d) => Number(d[value] ?? 0));
  const max = Math.max(1e-9, ...values);
  const peak = values.indexOf(Math.max(...values));
  const [sel, setSel] = useState<number | null>(null);
  const shown = sel ?? peak;
  const fill = color ?? c.chart[0];
  const thin = data.length > 8; // 12 months: label every other tick so they don't collide
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label" num>
        {tickLabel(String(data[shown]?.[category] ?? ""))}:{" "}
        <Text variant="label" num style={{ fontWeight: "600" }}>
          {format(values[shown] ?? 0)}
        </Text>
        {sel === null ? (
          <Text variant="caption" tone="muted">
            {"  "}highest · tap a bar
          </Text>
        ) : null}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 140, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong }}>
        {data.map((d, i) => {
          const v = values[i];
          const on = i === shown;
          return (
            <Pressable
              key={i}
              onPress={() => {
                Haptics.selectionAsync();
                setSel(i);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${tickLabel(String(d[category]))}: ${format(v)}`}
              style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" }}
            >
              <View style={{ width: "72%", maxWidth: 28, height: `${(Math.max(0, v) / max) * 100}%`, minHeight: v > 0 ? 3 : 0, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: fill, opacity: on || sel === null ? 1 : 0.45 }} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 2 }}>
        {data.map((d, i) => (
          <Text key={i} variant="caption" tone={i === shown ? "default" : "muted"} align="center" numberOfLines={1} style={{ flex: 1, fontSize: 10 }}>
            {thin && i % 2 && i !== shown ? "" : tickLabel(String(d[category]))}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Short ₹ for chart ends: ₹1.2L, ₹45k. */
export const rupeesShort = (paise: number) => {
  const r = paise / 100;
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (Math.abs(r) >= 1e3) return `₹${(r / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${Math.round(r)}`;
};

/** Top n by value; the tail folds into one "Other (k)" row instead of growing the chart. */
export function topN<T extends Record<string, unknown>>(rows: T[], n: number, key: keyof T, label: keyof T): T[] {
  if (rows.length <= n) return rows;
  const rest = rows.slice(n - 1);
  const other = { ...rest[0], [label]: `Other (${rest.length})`, [key]: rest.reduce((s, r) => s + Number(r[key] ?? 0), 0) } as T;
  return [...rows.slice(0, n - 1), other];
}
