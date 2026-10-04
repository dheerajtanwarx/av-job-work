import type { DB, Prisma } from "@av/db";
import { sumQty, type PhotoView, type Unit } from "@av/shared";
import { userNames } from "../lib/audit.js";
import { lineNumbers } from "./return-rows.js";

export const photoInclude = {
  return: {
    select: {
      id: true,
      returnNumber: true,
      date: true,
      receivedAt: true,
      enteredById: true,
      voidedAt: true,
      lines: { include: { jobItem: { select: { designId: true, designName: true, unit: true, ratePaise: true } } } },
    },
  },
  job: { select: { id: true, jobNumber: true, product: { select: { name: true, unit: true } }, jobWorkType: { select: { name: true } } } },
  client: { select: { id: true, name: true } },
  design: { select: { id: true, name: true } },
} satisfies Prisma.ReturnPhotoInclude;

export type PhotoWithReturn = Prisma.ReturnPhotoGetPayload<{ include: typeof photoInclude }>;

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
      client: p.client,
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
