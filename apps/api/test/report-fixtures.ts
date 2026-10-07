import type TestAgent from "supertest/lib/agent.js";
import { stockedMaterial } from "./helpers.js";

/** Business "now" for the dashboard/report tests: 09 Oct 2026, 11:30 IST. */
export const NOW = new Date("2026-10-09T06:00:00Z");

/**
 * A small book of work, built with the clock at NOW:
 *  J1 Asha (7-day terms): 100 PCS Floral @₹80 issued 01 Sep, expected 20 Sep (overdue).
 *     25 Sep: 60 good + 5 damaged @₹80 = ₹4,800 (due 02 Oct → 7 days overdue)
 *     02 Oct:  5 good @₹90 = ₹450 (due 09 Oct → due today). Voucher ₹1,000 on 03 Oct. 30 PCS still out (38 days).
 *  J2 Bharat (default terms): 500 MTR Block @₹10 issued 05 Oct, expected 09 Oct (today).
 *     09 Oct: 200.5 MTR @₹12 = ₹2,406, paid ₹3,000 with it (₹594 advance). 299.5 MTR out.
 *  J3 Asha: 10 PCS Floral @₹80 on 08 Oct; 12 came back the same day (over-return) = ₹960. Completed.
 */
export async function buildBook(api: TestAgent) {
  const saree = (await api.post("/products").send({ name: "Saree", unit: "PCS" }).expect(201)).body.id as string;
  const fabric = (await api.post("/products").send({ name: "Fabric", unit: "MTR" }).expect(201)).body.id as string;
  const jwt = (await api.post("/job-work-types").send({ name: "Embroidery" }).expect(201)).body.id as string;
  const asha = (await api.post("/clients").send({ name: "Asha Embroidery", phone: "9876500001", paymentPolicy: "DAYS_AFTER_RETURN", paymentDays: 7 }).expect(201)).body;
  const bharat = (await api.post("/clients").send({ name: "Bharat Prints", phone: "9876500002" }).expect(201)).body;
  const floral = (await api.post("/designs").send({ name: "Floral", defaultRatePaise: 8000, jobWorkTypeId: jwt }).expect(201)).body.id as string;
  const block = (await api.post("/designs").send({ name: "Block", defaultRatePaise: 1000 }).expect(201)).body.id as string;
  const blanks = (await api.post("/materials").send({ name: "Saree blanks", unit: "PCS", lotNumber: "LOT-77", openingQty: 1000 }).expect(201)).body.id as string;
  const cotton = await stockedMaterial(api, "Cotton roll", "MTR", 5000);

  const challan = async (clientId: string, productId: string, jobDate: string, expectedReturnDate: string | null, designId: string, materialId: string, quantity: number, ratePaise: number) =>
    (await api.post("/jobs").send({ clientId, productId, jobDate, expectedReturnDate, dispatchNow: true, items: [{ designId, materialId, quantity, ratePaise }] }).expect(201)).body;

  const j1 = await challan(asha.id, saree, "2026-09-01", "2026-09-20", floral, blanks, 100, 8000);
  const j2 = await challan(bharat.id, fabric, "2026-10-05", "2026-10-09", block, cotton, 500, 1000);
  const j3 = await challan(asha.id, saree, "2026-10-08", null, floral, blanks, 10, 8000);

  const r1 = (await api.post(`/jobs/${j1.id}/returns`).send({ date: "2026-09-25", lines: [{ jobItemId: j1.items[0].id, okQty: 60, damagedQty: 5 }] }).expect(201)).body;
  const r2 = (await api.post(`/jobs/${j1.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: j1.items[0].id, okQty: 5, ratePaise: 9000 }] }).expect(201)).body;
  const v1 = (await api.post("/sub-bills").send({ jobId: j1.id, date: "2026-10-03", amountPaise: 100000, reference: "UPI-REF-555" }).expect(201)).body;
  const r3 = (
    await api
      .post(`/jobs/${j2.id}/returns`)
      .send({ date: "2026-10-09", lines: [{ jobItemId: j2.items[0].id, okQty: 200.5, ratePaise: 1200 }], payment: { amountPaise: 300000, advanceReason: "Festival advance" } })
      .expect(201)
  ).body;
  const r4 = (await api.post(`/jobs/${j3.id}/returns`).send({ date: "2026-10-08", lines: [{ jobItemId: j3.items[0].id, okQty: 12, exceptionReason: "Two extra pieces from an old lot" }] }).expect(201)).body;

  return { saree, fabric, jwt, asha: asha.id as string, bharat: bharat.id as string, floral, block, blanks, cotton, j1, j2, j3, r1, r2, r3, r4, v1 };
}
