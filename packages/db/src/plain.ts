/**
 * Turns what MongoDB returns into the plain rows the app works with: `_id` → `id` (recursively, so embedded lines
 * and populated documents get it too) and Decimal128 → number. Dates, Buffers and primitives pass through.
 */
export function plain<T = unknown>(value: unknown): T {
  return convert(value) as T;
}

function convert(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date || Buffer.isBuffer(v)) return v;
  const bsonType = (v as { _bsontype?: string })._bsontype;
  if (bsonType === "Decimal128") return Number(String(v));
  if (bsonType === "ObjectId") return String(v);
  if (bsonType) return v;
  if (Array.isArray(v)) return v.map(convert);
  const out: Record<string, unknown> = {};
  const src = v as Record<string, unknown>;
  if ("_id" in src) out.id = convert(src._id);
  for (const k of Object.keys(src)) if (k !== "_id" && k !== "__v") out[k] = convert(src[k]);
  return out;
}
