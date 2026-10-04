import { describe, expect, it } from "vitest";
import {
  addDays,
  agingBucket,
  allocatePayments,
  buildLedger,
  businessToday,
  diffDays,
  effectiveTerms,
  isSettled,
  lineAmount,
  moneyPosition,
  overdueDays,
  payableQty,
  paymentDueDate,
  qtyFitsUnit,
  returnLineValue,
  returnPayment,
  roundQty,
  stockPosition,
  summarizeItem,
  sumTotals,
  workerMetrics,
} from "./calc";

describe("decimal quantities", () => {
  it("never drifts when summing decimals", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(125.5 + 74.25)).toBe(199.75);
  });

  it("the unit controls precision", () => {
    expect(qtyFitsUnit(125.5, "MTR")).toBe(true);
    expect(qtyFitsUnit(125.55, "MTR")).toBe(true);
    expect(qtyFitsUnit(125.555, "MTR")).toBe(false);
    expect(qtyFitsUnit(1.234, "KG")).toBe(true);
    expect(qtyFitsUnit(125, "PCS")).toBe(true);
    expect(qtyFitsUnit(12.5, "PCS")).toBe(false);
  });

  it("values decimal quantities to the paisa, matching SQL ROUND", () => {
    expect(lineAmount(125.5, 8000)).toBe(1004000); // 125.5 MTR @ ₹80
    expect(lineAmount(1.005, 100)).toBe(101); // float noise would give 100
    expect(lineAmount(0.333, 100)).toBe(33);
  });

  it("partial challan in MTR keeps decimal pending", () => {
    const it = summarizeItem({ quantity: 1000, ratePaise: 1000, initialSent: 1000, reworkSent: 0, ok: 550.5, damaged: 0, rejected: 0, lost: 0, billedQty: 0 });
    expect(it.pending).toBe(449.5);
    expect(it.isDone).toBe(false);
  });
});

describe("payable quantity (configurable damage / rejection / lost policy)", () => {
  const line = { okQty: 90, damagedQty: 5, rejectedQty: 3, lostQty: 2 };
  it("defaults to good only", () => {
    expect(payableQty(line)).toBe(90);
    expect(returnLineValue({ ...line, ratePaise: 8000 })).toBe(720000);
  });
  it("can pay damaged / rejected / lost when overridden", () => {
    expect(payableQty(line, { payDamaged: true })).toBe(95);
    expect(payableQty(line, { payDamaged: true, payRejected: true, payLost: true })).toBe(100);
  });
});

describe("return-level rates (acceptance §67)", () => {
  // Floral: issued 190 @ challan ₹80; returns 52@80, 44@80, 91@85, 3@85.
  const returns = [
    { okQty: 52, ratePaise: 8000 },
    { okQty: 44, ratePaise: 8000 },
    { okQty: 91, ratePaise: 8500 },
    { okQty: 3, ratePaise: 8500 },
  ].map((r) => ({ ...r, damagedQty: 0, rejectedQty: 0, lostQty: 0 }));
  const value = returns.reduce((s, r) => s + returnLineValue(r), 0);

  it("totals the work at each return's own rate", () => {
    expect(value).toBe(52 * 8000 + 44 * 8000 + 91 * 8500 + 3 * 8500);
    expect(value).toBe(1567000);
    const item = summarizeItem({ quantity: 190, ratePaise: 8000, initialSent: 190, reworkSent: 0, ok: 190, damaged: 0, rejected: 0, lost: 0, valuePaise: value, billedQty: 0 });
    expect(item.pending).toBe(0);
    expect(item.completedValuePaise).toBe(1567000);
    expect(item.expectedValuePaise).toBe(1520000); // 190 × ₹80 at the challan rate
  });

  it("outstanding = value − paid, settled only once paid in full", () => {
    expect(moneyPosition(value, 800000)).toEqual({ valuePaise: 1567000, paidPaise: 800000, outstandingPaise: 767000, advancePaise: 0 });
    expect(isSettled("COMPLETED", value, 800000)).toBe(false);
    expect(isSettled("COMPLETED", value, value)).toBe(true);
    expect(isSettled("PARTIALLY_RECEIVED", value, value)).toBe(false);
    expect(moneyPosition(1000, 1500)).toMatchObject({ outstandingPaise: 0, advancePaise: 500 });
  });

  it("allocates payments: linked return first, then oldest; zero payment leaves a return unpaid", () => {
    const rs = [
      { id: "r1", valuePaise: 416000 },
      { id: "r2", valuePaise: 352000 },
      { id: "r3", valuePaise: 773500 },
      { id: "r4", valuePaise: 25500 },
    ];
    const { paid, advancePaise } = allocatePayments(rs, [
      { amountPaise: 200000, returnId: "r1" },
      { amountPaise: 500000, returnId: "r3" },
      { amountPaise: 100000, returnId: "r4" }, // r4 is only ₹255 → ₹745 surplus goes to the oldest unpaid (r1)
    ]);
    expect(paid.get("r3")).toBe(500000);
    expect(paid.get("r4")).toBe(25500);
    expect(paid.get("r1")).toBe(200000 + 74500);
    expect(paid.get("r2")).toBe(0);
    expect(advancePaise).toBe(0);
    expect(returnPayment(352000, 0, null).status).toBe("NOT_PAID");
    expect(returnPayment(416000, 274500, null).status).toBe("PARTIAL");
    expect(returnPayment(25500, 25500, null).status).toBe("PAID");
  });

  it("surplus beyond all work is an advance", () => {
    expect(allocatePayments([{ id: "a", valuePaise: 100 }], [{ amountPaise: 250 }]).advancePaise).toBe(150);
  });
});

describe("payment terms and due dates", () => {
  const defaults = { policy: "MANUAL" as const, days: 0 };
  it("challan override → worker → default", () => {
    expect(effectiveTerms({}, {}, defaults)).toEqual(defaults);
    expect(effectiveTerms({}, { paymentPolicy: "DAYS_AFTER_RETURN", paymentDays: 7 }, defaults)).toEqual({ policy: "DAYS_AFTER_RETURN", days: 7 });
    expect(effectiveTerms({ paymentPolicy: "IMMEDIATE" }, { paymentPolicy: "DAYS_AFTER_RETURN", paymentDays: 7 }, defaults)).toEqual({ policy: "IMMEDIATE", days: 0 });
  });

  it("7 days after a return on 04 Oct is due 11 Oct", () => {
    expect(paymentDueDate({ policy: "DAYS_AFTER_RETURN", days: 7 }, "2026-10-04")).toBe("2026-10-11");
  });

  it("acceptance §69: returned 01 Oct, 7-day terms, unpaid → 1 day overdue on 09 Oct", () => {
    const due = paymentDueDate({ policy: "DAYS_AFTER_RETURN", days: 7 }, "2026-10-01");
    expect(due).toBe("2026-10-08");
    expect(overdueDays(due, "2026-10-08")).toBe(0);
    expect(overdueDays(due, "2026-10-09")).toBe(1);
    expect(overdueDays(due, "2026-10-11")).toBe(3);
    const p = returnPayment(1000000, 0, due, "2026-10-09");
    expect(p).toMatchObject({ outstandingPaise: 1000000, status: "NOT_PAID", overdueDays: 1 });
    expect(returnPayment(1000000, 1000000, due, "2026-10-09").overdueDays).toBe(0);
  });

  it("immediate, after completion and manual", () => {
    expect(paymentDueDate({ policy: "IMMEDIATE", days: 0 }, "2026-10-04")).toBe("2026-10-04");
    expect(paymentDueDate({ policy: "AFTER_COMPLETION", days: 0 }, "2026-10-04", null)).toBeNull();
    expect(paymentDueDate({ policy: "AFTER_COMPLETION", days: 15 }, "2026-10-04", "2026-10-10")).toBe("2026-10-25");
    expect(paymentDueDate({ policy: "MANUAL", days: 0 }, "2026-10-04")).toBeNull();
  });

  it("dates cross months and years", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(diffDays("2026-10-09", "2026-10-01")).toBe(8);
    expect(businessToday("Asia/Kolkata", new Date("2026-10-04T20:00:00Z"))).toBe("2026-10-05"); // 01:30 IST next day
  });
});

describe("aging", () => {
  it("buckets", () => {
    expect([0, 3, 4, 7, 8, 15, 16, 30, 31, 90].map(agingBucket)).toEqual(["0-3", "0-3", "4-7", "4-7", "8-15", "8-15", "16-30", "16-30", "30+", "30+"]);
  });
});

describe("ledger", () => {
  it("running balance in date then time order", () => {
    const rows = buildLedger([
      { date: "2026-10-05", at: "2026-10-05T10:00:00Z", debitPaise: 0, creditPaise: 200000 },
      { date: "2026-10-05", at: "2026-10-05T09:00:00Z", debitPaise: 416000, creditPaise: 0 },
      { date: "2026-10-06", at: "2026-10-06T09:00:00Z", debitPaise: 352000, creditPaise: 0 },
    ]);
    expect(rows.map((r) => r.balancePaise)).toEqual([416000, 216000, 568000]);
  });
});

describe("material stock", () => {
  it("warehouse 5000 → issue 500 to Ramesh → 300 back", () => {
    const s = stockPosition({ received: 5000, adjustIn: 0, adjustOut: 0, issued: 500, rework: 0, ok: 300, damaged: 0, rejected: 0, lost: 0 });
    expect(s.available).toBe(4800);
    expect(s.withWorkers).toBe(200);
  });
  it("damaged/rejected come back to a separate pile; rework takes from it; lost is written off", () => {
    const s = stockPosition({ received: 100, adjustIn: 0, adjustOut: 0, issued: 100, rework: 3, ok: 80, damaged: 5, rejected: 5, lost: 2 });
    expect(s).toEqual({ available: 80, damagedHeld: 7, withWorkers: 11, lost: 2 });
  });
});

describe("worker performance", () => {
  it("averages and percentages", () => {
    const m = workerMetrics([
      { jobDate: "2026-10-01", status: "COMPLETED", overdue: false, firstReturnDate: "2026-10-03", lastReturnDate: "2026-10-11", initialSent: 100, reworkSent: 5, ok: 90, damaged: 5, rejected: 3, lost: 2, pending: 0 },
      { jobDate: "2026-10-01", status: "PARTIALLY_RECEIVED", overdue: true, firstReturnDate: "2026-10-05", lastReturnDate: "2026-10-05", initialSent: 100, reworkSent: 0, ok: 50, damaged: 0, rejected: 0, lost: 0, pending: 50 },
      { jobDate: "2026-10-01", status: "CANCELLED", overdue: false, firstReturnDate: null, lastReturnDate: null, initialSent: 10, reworkSent: 0, ok: 0, damaged: 0, rejected: 0, lost: 0, pending: 10 },
    ]);
    expect(m).toMatchObject({ challans: 2, avgCompletionDays: 10, avgFirstReturnDays: 3, avgFinalReturnDays: 7, pending: 50, overdueChallans: 1, rejectionPct: 2, defectPct: 4.7, reworkPct: 2.5, reworkChallans: 1 });
  });
});

describe("sumTotals with decimals", () => {
  it("adds without drift", () => {
    const a = summarizeItem({ quantity: 10.1, ratePaise: 100, initialSent: 10.1, reworkSent: 0, ok: 0.1, damaged: 0, rejected: 0, lost: 0, billedQty: 0 });
    const b = summarizeItem({ quantity: 20.2, ratePaise: 100, initialSent: 20.2, reworkSent: 0, ok: 0.2, damaged: 0, rejected: 0, lost: 0, billedQty: 0 });
    const t = sumTotals([a, b]);
    expect(t.quantity).toBe(30.3);
    expect(t.ok).toBe(0.3);
    expect(t.pending).toBe(30);
  });
});
