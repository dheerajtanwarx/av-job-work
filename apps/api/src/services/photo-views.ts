import type { DB, Filter, FindOpts, JobItem, Populate, Return, ReturnLine, ReturnPhoto } from "@av/db";
import { sumQty, type PhotoView, type Unit } from "@av/shared";
import { userNames } from "../lib/audit.js";
import { lineNumbers, type ReturnLineWithItem } from "./return-rows.js";

export const photoPopulate: Populate = [
  { path: "return", select: "returnNumber date receivedAt enteredById voidedAt lines" },
  {
    path: "job",
    select: "jobNumber productId jobWorkTypeId items._id items.designId items.designName items.unit items.ratePaise",
    populate: [
      { path: "product", select: "name unit" },
      { path: "jobWorkType", select: "name" },
    ],
  },
  { path: "client", select: "name" },
  { path: "design", select: "name" },
];

type LineItem = Pick<JobItem, "id" | "designId" | "designName" | "unit" | "ratePaise">;
type Loaded = ReturnPhoto & {
  return: Pick<Return, "id" | "returnNumber" | "date" | "receivedAt" | "enteredById" | "voidedAt"> & { lines: ReturnLine[] };
  job: { id: string; jobNumber: string; items: LineItem[]; product: { name: string; unit: string }; jobWorkType?: { name: string } | null };
  client: { id: string; name: string };
  design?: { id: string; name: string } | null;
};
export type PhotoWithReturn = Omit<Loaded, "return" | "design"> & {
  return: Omit<Loaded["return"], "lines"> & { lines: ReturnLineWithItem[] };
  design: { id: string; name: string } | null;
};

/** Return photos with the return (lines resolved to their challan design line), challan, worker and design. */
export async function findPhotos(db: DB, where: Filter, opts: Omit<FindOpts, "populate"> = {}): Promise<PhotoWithReturn[]> {
  const rows = await db.returnPhoto.find<Loaded>(where, { ...opts, populate: photoPopulate });
  return rows.map((p) => {
    const items = new Map(p.job.items.map((i) => [i.id, i]));
    return {
      ...p,
      return: { ...p.return, lines: p.return.lines.map((l) => ({ ...l, jobItem: items.get(l.jobItemId)! })) },
      design: p.design ? { id: p.design.id, name: p.design.name } : null,
    };
  });
}

/**
 * Photo + the return it belongs to. Quantity, rate and amount are read live from the return line
 * (or the whole return when the photo isn't tied to one line), so an audited edit is reflected here.
 */
export async function toPhotoViews(db: DB, photos: PhotoWithReturn[]): Promise<PhotoView[]> {
  const names = await userNames(db, photos.flatMap((p) => [p.uploadedById, p.return.enteredById]));
  return photos.map((p) => {
    const lines = p.returnLineId ? p.return.lines.filter((l) => l.id === p.returnLineId) : p.return.lines;
    const nums = lines.map(lineNumbers);
    const rates = [...new Set(nums.map((n) => n.ratePaise))];
    const line = p.returnLineId ? lines[0] : lines.length === 1 ? lines[0] : null;
    return {
      id: p.id,
      returnId: p.return.id,
      returnNumber: p.return.returnNumber,
      returnLineId: p.returnLineId,
      job: { id: p.job.id, jobNumber: p.job.jobNumber },
      client: { id: p.client.id, name: p.client.name },
      design: p.design ?? (line ? { id: line.jobItem.designId, name: line.jobItem.designName } : null),
      productName: p.job.product.name,
      jobWorkType: p.job.jobWorkType?.name ?? null,
      unit: (lines[0]?.jobItem.unit ?? p.job.product.unit) as Unit,
      qty: sumQty(nums.map((n) => n.payableQty)),
      ratePaise: rates.length === 1 ? rates[0] : null,
      valuePaise: nums.reduce((s, n) => s + n.valuePaise, 0),
      receivedDate: p.return.date.toISOString(),
      receivedAt: p.return.receivedAt.toISOString(),
      uploadedAt: p.createdAt.toISOString(),
      uploadedBy: p.uploadedById ? (names.get(p.uploadedById) ?? null) : null,
      enteredBy: p.return.enteredById ? (names.get(p.return.enteredById) ?? null) : null,
      originalName: p.originalName,
      width: p.width,
      height: p.height,
      sizeBytes: p.sizeBytes,
      returnVoided: !!p.return.voidedAt,
      voidedAt: p.voidedAt?.toISOString() ?? null,
      voidReason: p.voidReason,
    };
  });
}
