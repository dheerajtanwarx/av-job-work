import path from "node:path";
import { db, transaction, type Filter, type JobItem, type ReturnLine } from "@av/db";
import {
  formatDateNumeric,
  formatINR,
  formatQty,
  formatTime,
  PHOTO_LIMITS,
  sumQty,
  type PhotoFilter,
  type PhotoPage,
  type Client,
  type JobItemPhotoKind,
  type JobItemPhotoView,
  type PhotoView,
  type WorkerDocumentKind,
} from "@av/shared";
import type { Metadata, Sharp, SharpOptions } from "sharp";
import { env } from "../env.js";
import { audit } from "../lib/audit.js";
import { toDate } from "../lib/dates.js";
import { HttpError, notFound, unprocessable } from "../lib/http.js";
import { newPhotoFolder, storage } from "../lib/storage.js";
import { MANAGERS } from "../middleware/auth.js";
import type { Actor } from "./jobs.js";

type SharpFn = (input?: Buffer, options?: SharpOptions) => Sharp;
let sharpLoading: Promise<SharpFn> | undefined;
/**
 * sharp (native libvips) is loaded on the first photo operation rather than at server start, and runs one image at a
 * time: on shared hosting (Hostinger) its thread pool and memory at boot can get the whole process stopped.
 */
function loadSharp() {
  sharpLoading ??= import("sharp").then(({ default: sharp }) => {
    sharp.concurrency(1);
    return sharp;
  });
  return sharpLoading;
}
import { getSettings } from "./billing.js";
import { range } from "../lib/mongo.js";
import { itemIdsWhere, jobIdsWhere } from "./lookups.js";
import { findPhotos, toPhotoViews } from "./photo-views.js";
import { lineNumbers, withLineItems } from "./return-rows.js";

const isManager = (actor?: Actor) => !!actor && MANAGERS.includes(actor.role as never);

/** What multer hands us (memory storage). */
export interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ACCEPTED_MIME = new Set([...PHOTO_LIMITS.mimeTypes, "image/jpg", "image/pjpeg"]);
const FORMATS: Record<string, { ext: string; type: string }> = {
  jpeg: { ext: "jpg", type: "image/jpeg" },
  png: { ext: "png", type: "image/png" },
  webp: { ext: "webp", type: "image/webp" },
};

interface Prepared {
  name: string | null;
  original: Buffer;
  originalType: string;
  originalExt: string;
  display: Buffer;
  thumb: Buffer;
  width: number | null;
  height: number | null;
}

/** "IMG_2041.jpg" → kept for display only (trimmed, no paths, no control characters). */
function cleanName(name: string) {
  const base = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return base ? base.slice(0, 200) : null;
}

/**
 * Checks one file (declared type, extension, real content) and renders the display copy and thumbnail.
 * Returns an error message instead of throwing so every file's problem can be reported at once.
 */
export async function prepare(f: UploadFile): Promise<Prepared | string> {
  const name = cleanName(f.originalname);
  const label = name ?? "Photo";
  if (!ACCEPTED_MIME.has(f.mimetype.toLowerCase())) return `${label}: ${f.mimetype || "unknown"} files can't be uploaded. Use a JPEG, PNG, WebP or HEIC photo.`;
  const ext = name ? path.extname(name).toLowerCase() : "";
  if (ext && !PHOTO_LIMITS.extensions.includes(ext)) return `${label}: "${ext}" files can't be uploaded. Use a JPEG, PNG, WebP or HEIC photo.`;
  if (f.size > PHOTO_LIMITS.maxBytes || f.buffer.length > PHOTO_LIMITS.maxBytes) return `${label}: the photo is larger than 15 MB`;
  if (!f.buffer.length) return `${label}: the file is empty`;

  const sharp = await loadSharp();
  let meta: Metadata;
  try {
    meta = await sharp(f.buffer).metadata();
  } catch {
    return `${label}: this file isn't a readable image`;
  }
  let fmt = meta.format ? FORMATS[meta.format] : undefined;
  if (meta.format === "heif") fmt = meta.compression === "av1" ? { ext: "avif", type: "image/avif" } : { ext: "heic", type: "image/heic" };
  if (!fmt) return `${label}: ${meta.format ?? "this"} images can't be uploaded. Use a JPEG, PNG, WebP or HEIC photo.`;

  try {
    // Display copy and thumbnail are upright (EXIF orientation applied) and carry no metadata (GPS etc.).
    const display = await sharp(f.buffer).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    const thumb = await sharp(display).resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    const upright = (meta.orientation ?? 1) >= 5;
    return {
      name,
      original: f.buffer,
      originalType: fmt.type,
      originalExt: fmt.ext,
      display,
      thumb,
      width: (upright ? meta.height : meta.width) ?? null,
      height: (upright ? meta.width : meta.height) ?? null,
    };
  } catch {
    if (fmt.ext === "heic") return `${label}: HEIC photos can't be processed here. Please upload a JPEG (on iPhone: Settings → Camera → Formats → Most Compatible).`;
    return `${label}: this image couldn't be processed. It may be damaged.`;
  }
}

// ───────────────────────── Upload ─────────────────────────

export async function uploadPhotos(returnId: string, files: UploadFile[], returnLineId: string | undefined, actor?: Actor): Promise<PhotoView[]> {
  if (!files.length) throw unprocessable("Choose at least one photo");
  if (files.length > PHOTO_LIMITS.maxFiles) throw unprocessable(`Upload at most ${PHOTO_LIMITS.maxFiles} photos at a time`);
  type Loaded = { id: string; jobId: string; returnNumber: string; receivedAt: Date; voidedAt: Date | null; lines: ReturnLine[] };
  type JobPart = { id: string; clientId: string; jobNumber: string; items: Pick<JobItem, "id" | "designId" | "designName" | "unit" | "ratePaise">[] };
  const loaded = await db.return.findById<Loaded & { job: JobPart }>(returnId, {
    populate: { path: "job", select: "clientId jobNumber items._id items.designId items.designName items.unit items.ratePaise" },
  });
  if (!loaded) throw notFound("Return");
  const r = withLineItems(loaded);
  if (r.voidedAt) throw unprocessable("This return has been voided. Photos can't be added to it.");
  const line = returnLineId ? r.lines.find((l) => l.id === returnLineId) : undefined;
  if (returnLineId && !line) throw unprocessable("That design line doesn't belong to this return");

  const prepared = await Promise.all(files.map(prepare));
  const errors = prepared.flatMap((p, i) => (typeof p === "string" ? [{ index: i, name: cleanName(files[i].originalname), message: p }] : []));
  if (errors.length) throw new HttpError(422, errors.map((e) => e.message).join(" "), { files: errors });
  const ok = prepared as Prepared[];

  // Snapshot of what the photo shows, for the audit trail only (views read live values).
  const lines = line ? [line] : r.lines;
  const nums = lines.map(lineNumbers);
  const rates = [...new Set(nums.map((n) => n.ratePaise))];
  const designs = [...new Set(lines.map((l) => l.jobItem.designId))];
  const unit = lines[0]?.jobItem.unit ?? "PCS";
  const meta = {
    qty: sumQty(nums.map((n) => n.payableQty)),
    ratePaise: rates.length === 1 ? rates[0] : null,
    valuePaise: nums.reduce((s, n) => s + n.valuePaise, 0),
    unit,
    returnNumber: r.returnNumber,
    jobNumber: r.job.jobNumber,
    receivedAt: r.receivedAt.toISOString(),
  };

  // Files first (random keys), then rows; if the rows fail the files are removed again.
  const stored: { p: Prepared; folder: string; keys: { original: string; display: string; thumb: string } }[] = [];
  try {
    for (const p of ok) {
      const folder = newPhotoFolder();
      const keys = { original: `${folder}/original.${p.originalExt}`, display: `${folder}/display.jpg`, thumb: `${folder}/thumb.jpg` };
      stored.push({ p, folder, keys });
      await storage.put(keys.original, p.original, p.originalType);
      await storage.put(keys.display, p.display, "image/jpeg");
      await storage.put(keys.thumb, p.thumb, "image/jpeg");
    }
    const ids = await transaction(async (tx) => {
      const out: string[] = [];
      for (const { p, keys } of stored) {
        const photo = await tx.returnPhoto.create({
            returnId,
            returnLineId: line?.id ?? null,
            jobId: r.jobId,
            clientId: r.job.clientId,
            designId: designs.length === 1 ? designs[0] : null,
            storageKey: keys.original,
            displayKey: keys.display,
            thumbKey: keys.thumb,
            originalName: p.name,
            mimeType: p.originalType,
            sizeBytes: p.original.length,
            width: p.width,
            height: p.height,
            meta,
            uploadedById: actor?.id ?? null,
        });
        await audit(tx, {
          entity: "ReturnPhoto",
          entityId: photo.id,
          action: "create",
          summary: `${r.returnNumber}: photo ${p.name ?? ""} uploaded (${formatQty(meta.qty)} ${unit}${meta.ratePaise !== null ? ` @ ${formatINR(meta.ratePaise)}` : ""})`.replace("photo  ", "photo "),
          after: { returnId, returnLineId: line?.id ?? null, jobId: r.jobId, originalName: p.name, mimeType: p.originalType, sizeBytes: p.original.length, ...meta },
          userId: actor?.id,
        });
        out.push(photo.id);
      }
      return out;
    });
    const rows = await findPhotos(db, { _id: { $in: ids } }, { sort: { createdAt: 1, _id: 1 } });
    return toPhotoViews(db, rows);
  } catch (e) {
    await Promise.all(stored.flatMap((s) => Object.values(s.keys).map((k) => storage.delete(k).catch(() => undefined))));
    throw e;
  }
}

// ───────────────────────── Challan line reference photos ─────────────────────────

const PHOTO_KINDS: JobItemPhotoKind[] = ["ITEM", "DESIGN"];

/** Item / material and design / sample photos attached to one challan line. */
export async function uploadJobItemPhotos(jobItemId: string, kind: string | undefined, files: UploadFile[], actor?: Actor): Promise<JobItemPhotoView[]> {
  if (!PHOTO_KINDS.includes(kind as JobItemPhotoKind)) throw unprocessable('Photo kind must be "ITEM" or "DESIGN"');
  if (!files.length) throw unprocessable("Choose at least one photo");
  if (files.length > PHOTO_LIMITS.maxFiles) throw unprocessable(`Upload at most ${PHOTO_LIMITS.maxFiles} photos at a time`);
  const owner = await db.job.findOne<{ id: string; jobNumber: string; cancelledAt: Date | null; items: Pick<JobItem, "id" | "designName">[] }>(
    { "items._id": jobItemId },
    { select: "jobNumber cancelledAt items._id items.designName" },
  );
  const found = owner?.items.find((i) => i.id === jobItemId);
  if (!owner || !found) throw notFound("Challan line");
  const item = { ...found, jobId: owner.id, job: owner };
  if (item.job.cancelledAt) throw unprocessable("This challan is cancelled. Photos can't be added to it.");

  const prepared = await Promise.all(files.map(prepare));
  const errors = prepared.flatMap((p, i) => (typeof p === "string" ? [{ index: i, name: cleanName(files[i].originalname), message: p }] : []));
  if (errors.length) throw new HttpError(422, errors.map((e) => e.message).join(" "), { files: errors });

  const stored: { p: Prepared; keys: { original: string; display: string; thumb: string } }[] = [];
  try {
    for (const p of prepared as Prepared[]) {
      const folder = newPhotoFolder();
      const keys = { original: `${folder}/original.${p.originalExt}`, display: `${folder}/display.jpg`, thumb: `${folder}/thumb.jpg` };
      stored.push({ p, keys });
      await storage.put(keys.original, p.original, p.originalType);
      await storage.put(keys.display, p.display, "image/jpeg");
      await storage.put(keys.thumb, p.thumb, "image/jpeg");
    }
    return await transaction(async (tx) => {
      const out: JobItemPhotoView[] = [];
      for (const { p, keys } of stored) {
        const photo = await tx.jobItemPhoto.create({
            jobItemId,
            jobId: item.jobId,
            kind: kind as JobItemPhotoKind,
            storageKey: keys.original,
            displayKey: keys.display,
            thumbKey: keys.thumb,
            originalName: p.name,
            mimeType: p.originalType,
            sizeBytes: p.original.length,
            width: p.width,
            height: p.height,
            uploadedById: actor?.id ?? null,
        });
        await audit(tx, {
          entity: "Job",
          entityId: item.jobId,
          action: "photo",
          summary: `${item.job.jobNumber}: ${kind === "ITEM" ? "item" : "design"} photo ${p.name ?? ""} added to ${item.designName}`.replace("photo  ", "photo "),
          after: { jobItemId, kind, originalName: p.name, mimeType: p.originalType, sizeBytes: p.original.length },
          userId: actor?.id,
        });
        out.push({ id: photo.id, kind: photo.kind, name: photo.originalName });
      }
      return out;
    });
  } catch (e) {
    await Promise.all(stored.flatMap((s) => Object.values(s.keys).map((k) => storage.delete(k).catch(() => undefined))));
    throw e;
  }
}

export async function jobItemPhotoFile(id: string, variant: PhotoVariant) {
  const p = await db.jobItemPhoto.findById(id, { select: "storageKey displayKey thumbKey mimeType removedAt" });
  if (!p || p.removedAt) throw notFound("Photo");
  const key = variant === "original" ? p.storageKey : variant === "display" ? p.displayKey : p.thumbKey;
  let stream;
  try {
    stream = await storage.get(key);
  } catch {
    throw notFound("Photo file");
  }
  const ext = key.slice(key.lastIndexOf("."));
  return { stream, contentType: variant === "original" ? p.mimeType : "image/jpeg", filename: `${id}-${variant}${ext}` };
}

/** Hides a reference photo (the file is kept for the audit trail). */
export async function removeJobItemPhoto(id: string, actor?: Actor) {
  const photo = await db.jobItemPhoto.findById<import("@av/db").JobItemPhoto & { job: { jobNumber: string; items: Pick<JobItem, "id" | "designName">[] } }>(id, {
    populate: { path: "job", select: "jobNumber items._id items.designName" },
  });
  if (!photo || photo.removedAt) throw notFound("Photo");
  const p = { ...photo, jobItem: { designName: photo.job.items.find((i) => i.id === photo.jobItemId)?.designName ?? "", job: photo.job } };
  await transaction(async (tx) => {
    await tx.jobItemPhoto.update(id, { removedAt: new Date() });
    await audit(tx, {
      entity: "Job",
      entityId: p.jobId,
      action: "photo",
      summary: `${p.jobItem.job.jobNumber}: ${p.kind === "ITEM" ? "item" : "design"} photo ${p.originalName ?? ""} removed from ${p.jobItem.designName}`.replace("photo  ", "photo "),
      before: { jobItemId: p.jobItemId, kind: p.kind, originalName: p.originalName },
      userId: actor?.id,
    });
  });
  return { ok: true };
}

// ───────────────────────── Worker photo and Aadhaar ─────────────────────────

/** URL segment → document kind and the Client column that points at the current one. */
export const WORKER_DOCS = {
  photo: { kind: "PHOTO", field: "photoId", label: "photo" },
  "aadhaar-front": { kind: "AADHAAR_FRONT", field: "aadhaarFrontId", label: "Aadhaar front" },
  "aadhaar-back": { kind: "AADHAAR_BACK", field: "aadhaarBackId", label: "Aadhaar back" },
} as const satisfies Record<string, { kind: WorkerDocumentKind; field: keyof Client; label: string }>;
export type WorkerDocSlot = keyof typeof WORKER_DOCS;

function docSlot(slot: string) {
  const d = WORKER_DOCS[slot as WorkerDocSlot];
  if (!d) throw notFound("Document");
  return d;
}

/** Aadhaar images are identity documents: only the owner and managers may add, open or remove them. */
function assertMayHandle(kind: WorkerDocumentKind, actor?: Actor) {
  if (kind !== "PHOTO" && !isManager(actor)) throw new HttpError(403, "Only the owner or a manager can handle Aadhaar photos");
}

/** Stores a new worker photo / Aadhaar image and makes it the current one (the previous file is kept). */
export async function setWorkerDocument(clientId: string, slot: string, file: UploadFile | undefined, actor?: Actor) {
  const d = docSlot(slot);
  assertMayHandle(d.kind, actor);
  if (!file) throw unprocessable("Choose a photo");
  const client = await db.client.findById(clientId);
  if (!client) throw notFound("Job worker");
  const p = await prepare(file);
  if (typeof p === "string") throw unprocessable(p);
  const folder = newPhotoFolder();
  const keys = { original: `${folder}/original.${p.originalExt}`, display: `${folder}/display.jpg`, thumb: `${folder}/thumb.jpg` };
  try {
    await storage.put(keys.original, p.original, p.originalType);
    await storage.put(keys.display, p.display, "image/jpeg");
    await storage.put(keys.thumb, p.thumb, "image/jpeg");
    return await transaction(async (tx) => {
      const doc = await tx.workerDocument.create({ clientId, kind: d.kind, storageKey: keys.original, displayKey: keys.display, thumbKey: keys.thumb, originalName: p.name, mimeType: p.originalType, sizeBytes: p.original.length, uploadedById: actor?.id ?? null });
      const c = (await tx.client.update(clientId, { [d.field]: doc.id }))!;
      await audit(tx, { entity: "Client", entityId: clientId, action: "document", summary: `${client.name}: ${d.label} ${client[d.field] ? "replaced" : "added"}`, before: { [d.field]: client[d.field] }, after: { [d.field]: doc.id }, userId: actor?.id });
      return c;
    });
  } catch (e) {
    await Promise.all(Object.values(keys).map((k) => storage.delete(k).catch(() => undefined)));
    throw e;
  }
}

/** Unlinks the current photo / Aadhaar image from the worker (the file stays in history). */
export async function clearWorkerDocument(clientId: string, slot: string, actor?: Actor) {
  const d = docSlot(slot);
  assertMayHandle(d.kind, actor);
  const client = await db.client.findById(clientId);
  if (!client) throw notFound("Job worker");
  if (!client[d.field]) return client;
  return transaction(async (tx) => {
    const c = (await tx.client.update(clientId, { [d.field]: null }))!;
    await audit(tx, { entity: "Client", entityId: clientId, action: "document", summary: `${client.name}: ${d.label} removed`, before: { [d.field]: client[d.field] }, after: { [d.field]: null }, userId: actor?.id });
    return c;
  });
}

export async function workerDocumentFile(id: string, variant: PhotoVariant, actor?: Actor) {
  const p = await db.workerDocument.findById(id);
  if (!p) throw notFound("Photo");
  assertMayHandle(p.kind, actor);
  const key = variant === "original" ? p.storageKey : variant === "display" ? p.displayKey : p.thumbKey;
  let stream;
  try {
    stream = await storage.get(key);
  } catch {
    throw notFound("Photo file");
  }
  const ext = key.slice(key.lastIndexOf("."));
  return { stream, contentType: variant === "original" ? p.mimeType : "image/jpeg", filename: `${id}-${variant}${ext}` };
}

// ───────────────────────── Gallery ─────────────────────────

/** Ids of returns with at least one line matching (lines are embedded in the return). */
async function returnIdsWithLine(line: Filter): Promise<string[]> {
  return (await db.return.find<{ id: string }>({ lines: { $elemMatch: line } }, { select: "_id" })).map((r) => r.id);
}

export async function photoWhere(f: PhotoFilter, actor?: Actor): Promise<Filter> {
  const showVoided = !!f.includeVoided && isManager(actor);
  const and: Filter[] = [];
  if (f.designId) {
    const items = await itemIdsWhere(db, { designId: f.designId });
    and.push({ $or: [{ designId: f.designId }, { designId: null, returnId: { $in: await returnIdsWithLine({ jobItemId: { $in: items } }) } }] });
  }
  if (f.jobWorkTypeId) {
    const items = await itemIdsWhere(db, { jobWorkTypeId: f.jobWorkTypeId });
    and.push({ $or: [{ jobId: { $in: await jobIdsWhere(db, { jobWorkTypeId: f.jobWorkTypeId }) } }, { returnId: { $in: await returnIdsWithLine({ jobItemId: { $in: items } }) } }] });
  }
  if (f.minRate !== undefined || f.maxRate !== undefined) {
    const rate = range(f.minRate, f.maxRate);
    const lineIds = (
      await db.return.aggregate<{ id: string }>([
        { $match: { lines: { $elemMatch: { ratePaise: rate } } } },
        { $unwind: "$lines" },
        { $match: { "lines.ratePaise": rate } },
        { $project: { _id: "$lines._id" } },
      ])
    ).map((l) => l.id);
    and.push({ $or: [{ returnLineId: { $ne: null, $in: lineIds } }, { returnLineId: null, returnId: { $in: await returnIdsWithLine({ ratePaise: rate }) } }] });
  }
  // Photos of a voided return stay reachable from that return (and for managers), not in the general gallery.
  const returnCond: Filter = {};
  if (!showVoided && !f.returnId) returnCond.voidedAt = null;
  if (f.from || f.to) returnCond.date = range(f.from ? toDate(f.from) : null, f.to ? toDate(f.to) : null);
  if (returnCond.date) and.push({ returnId: { $in: await db.return.distinct("_id", returnCond) } });
  else if (returnCond.voidedAt === null) and.push({ returnId: { $nin: await db.return.distinct("_id", { voidedAt: { $ne: null } }) } });
  if (f.productId) and.push({ jobId: { $in: await jobIdsWhere(db, { productId: f.productId }) } });
  return {
    clientId: f.clientId,
    jobId: f.jobId,
    returnId: f.returnId,
    voidedAt: showVoided ? undefined : null,
    ...(and.length && { $and: and }),
  };
}

export async function listPhotos(f: PhotoFilter, actor?: Actor): Promise<PhotoPage> {
  const take = Math.min(100, Math.max(1, f.take ?? 40));
  const where = await photoWhere(f, actor);
  if (f.cursor) {
    // Keyset paging on (createdAt, id), newest first: everything after the cursor photo.
    const c = await db.returnPhoto.findById(f.cursor, { select: "createdAt" });
    if (c) where.$and = [...((where.$and as Filter[]) ?? []), { $or: [{ createdAt: { $lt: c.createdAt } }, { createdAt: c.createdAt, _id: { $lt: f.cursor } }] }];
  }
  const rows = await findPhotos(db, where, { sort: { createdAt: -1, _id: -1 }, limit: take + 1 });
  const page = rows.slice(0, take);
  return { rows: await toPhotoViews(db, page), nextCursor: rows.length > take ? page[page.length - 1].id : null };
}

/** A photo the actor may see: voided photos are only visible to the owner / managers. */
async function loadVisible(id: string, actor?: Actor) {
  const [p] = await findPhotos(db, { _id: id });
  if (!p || (p.voidedAt && !isManager(actor))) throw notFound("Photo");
  return p;
}

export async function getPhoto(id: string, actor?: Actor): Promise<PhotoView> {
  return (await toPhotoViews(db, [await loadVisible(id, actor)]))[0];
}

export type PhotoVariant = "thumb" | "display" | "original";

/** The stored file for one variant, as a stream plus its headers. */
export async function photoFile(id: string, variant: PhotoVariant, actor?: Actor) {
  const p = await db.returnPhoto.findById(id, { select: "storageKey displayKey thumbKey mimeType originalName voidedAt" });
  if (!p || (p.voidedAt && !isManager(actor))) throw notFound("Photo");
  const key = variant === "original" ? p.storageKey : variant === "display" ? p.displayKey : p.thumbKey;
  let stream;
  try {
    stream = await storage.get(key);
  } catch {
    throw notFound("Photo file");
  }
  const ext = key.slice(key.lastIndexOf("."));
  return { stream, contentType: variant === "original" ? p.mimeType : "image/jpeg", filename: `${id}-${variant}${ext}` };
}

// ───────────────────────── Watermarked share copy ─────────────────────────

const FONT = "DejaVu Sans, Noto Sans, Helvetica, Arial, sans-serif";
const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

async function renderGlyph(ch: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#fff"/><text x="6" y="38" font-size="36" font-family="${FONT}" fill="#000">${ch}</text></svg>`;
  const sharp = await loadSharp();
  return sharp(Buffer.from(svg)).raw().toBuffer();
}

let rupeeOk: Promise<boolean> | null = null;
/** Whether the server's fonts can draw "₹" (compared with a glyph no font has, and with nothing at all). */
function canDrawRupee() {
  rupeeOk ??= (async () => {
    try {
      const [rupee, missing, blank] = await Promise.all([renderGlyph("₹"), renderGlyph(""), renderGlyph(" ")]);
      return !rupee.equals(missing) && !rupee.equals(blank);
    } catch {
      return false;
    }
  })();
  return rupeeOk;
}

/** Lines printed on the share copy (exported for tests). */
export function watermarkLines(v: PhotoView, businessName: string, tz = env.businessTz) {
  const rate = v.ratePaise !== null ? `${formatINR(v.ratePaise)}/${v.unit}` : "see return";
  return {
    title: businessName,
    left: [`Challan: ${v.job.jobNumber}`, `Return: ${v.returnNumber}`, `Date: ${formatDateNumeric(v.receivedDate)}`],
    right: [`Qty: ${formatQty(v.qty)} ${v.unit}`, `Rate: ${rate}`, `Time: ${formatTime(v.receivedAt, tz)}`],
  };
}

/** A JPEG of the display copy with a small details band along the bottom. Generated per request, never stored. */
export async function sharePhoto(id: string, actor?: Actor) {
  const p = await loadVisible(id, actor);
  const [view] = await toPhotoViews(db, [p]);
  const [settings, display, rupee] = await Promise.all([getSettings(), storage.getBuffer(p.displayKey).catch(() => null), canDrawRupee()]);
  if (!display) throw notFound("Photo file");
  const sharp = await loadSharp();
  // Tiny photos are enlarged so the text stays readable.
  const meta0 = await sharp(display).metadata();
  const base = (meta0.width ?? 0) < 640 ? await sharp(display).resize({ width: 640 }).jpeg({ quality: 90 }).toBuffer() : display;
  const { width = 640, height = 480 } = await sharp(base).metadata();

  const text = watermarkLines(view, settings.businessName || "AV CREATION");
  const fix = (s: string) => escapeXml(rupee ? s : s.replace(/₹/g, "Rs."));
  const fs = Math.round(Math.min(30, Math.max(12, width * 0.018)));
  const lh = Math.round(fs * 1.35);
  const pad = Math.round(fs * 0.7);
  const bandH = pad * 2 + lh * 4;
  const colX = Math.round(width * 0.52);
  const row = (i: number) => pad + lh * (i + 1) - Math.round(lh * 0.28);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${bandH}">
<rect width="${width}" height="${bandH}" fill="#000" fill-opacity="0.55"/>
<g font-family="${FONT}" font-size="${fs}" fill="#fff">
<text x="${pad}" y="${row(0)}" font-weight="bold" letter-spacing="1">${fix(text.title.toUpperCase())}</text>
${text.left.map((s, i) => `<text x="${pad}" y="${row(i + 1)}">${fix(s)}</text>`).join("")}
${text.right.map((s, i) => `<text x="${colX}" y="${row(i + 1)}"${i === 1 ? ' font-weight="bold"' : ""}>${fix(s)}</text>`).join("")}
</g></svg>`;
  // Very wide, short photos get the band underneath instead of over most of the picture.
  const below = bandH > height * 0.45;
  const canvas = below ? sharp(base).extend({ bottom: bandH, background: "#000000" }) : sharp(base);
  const buffer = await sharp(await canvas.toBuffer())
    .composite([{ input: Buffer.from(svg), top: below ? height : height - bandH, left: 0 }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");
  return { buffer, filename: `${safe(view.job.jobNumber)}_${safe(view.returnNumber)}_${safe(id).slice(-8)}.jpg` };
}

// ───────────────────────── Void / restore ─────────────────────────

export async function voidPhoto(id: string, reason: string, actor?: Actor): Promise<PhotoView> {
  const p = await db.returnPhoto.findById<import("@av/db").ReturnPhoto & { return: { returnNumber: string } }>(id, { populate: { path: "return", select: "returnNumber" } });
  if (!p) throw notFound("Photo");
  if (p.voidedAt) throw unprocessable("This photo is already voided");
  await transaction(async (tx) => {
    await tx.returnPhoto.update(id, { voidedAt: new Date(), voidReason: reason, voidedById: actor?.id ?? null });
    await audit(tx, {
      entity: "ReturnPhoto",
      entityId: id,
      action: "void",
      summary: `${p.return.returnNumber}: photo ${p.originalName ?? ""} voided. Reason: ${reason}`.replace("photo  ", "photo "),
      reason,
      before: { returnId: p.returnId, voidedAt: null },
      after: { returnId: p.returnId, voided: true },
      userId: actor?.id,
    });
  });
  return getPhoto(id, actor);
}

export async function restorePhoto(id: string, reason: string, actor?: Actor): Promise<PhotoView> {
  const p = await db.returnPhoto.findById<import("@av/db").ReturnPhoto & { return: { returnNumber: string } }>(id, { populate: { path: "return", select: "returnNumber" } });
  if (!p) throw notFound("Photo");
  if (!p.voidedAt) throw unprocessable("This photo isn't voided");
  await transaction(async (tx) => {
    await tx.returnPhoto.update(id, { voidedAt: null, voidReason: null, voidedById: null });
    await audit(tx, {
      entity: "ReturnPhoto",
      entityId: id,
      action: "restore",
      summary: `${p.return.returnNumber}: photo ${p.originalName ?? ""} restored. Reason: ${reason}`.replace("photo  ", "photo "),
      reason,
      before: { returnId: p.returnId, voidedAt: p.voidedAt?.toISOString(), voidReason: p.voidReason },
      after: { returnId: p.returnId, voided: false },
      userId: actor?.id,
    });
  });
  return getPhoto(id, actor);
}
