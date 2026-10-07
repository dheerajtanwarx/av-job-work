import { Types } from "@av/db";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive "contains" on a string field (the term is matched literally). */
export const ci = (q: string) => ({ $regex: escape(q), $options: "i" });

/** Exact decimal constant for pipelines (keeps Decimal128 arithmetic exact). */
export const dec = (n: number | string) => Types.Decimal128.fromString(String(n));

/** Rounds half away from zero (values here are never negative). MongoDB's $round rounds half to even, which would shift paise totals. */
export const roundHalfUp = (x: unknown) => ({ $floor: { $add: [x, dec("0.5")] } });

/** Drops keys whose value is undefined (filters built from optional query parameters). */
export function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** { $gte, $lte } with only the bounds that are set. */
export function range<T>(gte: T | undefined | null, lte: T | undefined | null) {
  const r: { $gte?: T; $lte?: T } = {};
  if (gte != null) r.$gte = gte;
  if (lte != null) r.$lte = lte;
  return r;
}
