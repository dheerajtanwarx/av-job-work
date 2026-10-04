import { describe, expect, it } from "vitest";
import { deriveJobStatus, exceedsPending, isFullyPaid, summarizeItem, sumTotals, type ItemTotalsInput } from "./calc";
import { amountInWords, formatINR } from "./format";

const base = (o: Partial<ItemTotalsInput>): ItemTotalsInput => ({
  quantity: 0, ratePaise: 0, initialSent: 0, reworkSent: 0, ok: 0, damaged: 0, rejected: 0, lost: 0, billedQty: 0, ...o,
});

/** Brief §25 – applies cumulative returns to the three design lines. */
function scenario(returned: [number, number, number]) {
  const lines = [
    { quantity: 20, ratePaise: 2000 },
    { quantity: 50, ratePaise: 2500 },
    { quantity: 30, ratePaise: 1500 },
  ];
  const items = lines.map((l, i) => summarizeItem(base({ ...l, initialSent: l.quantity, ok: returned[i] })));
  return { items, totals: sumTotals(items) };
}

describe("acceptance scenario", () => {
  it("job created and sent", () => {
    const { totals, items } = scenario([0, 0, 0]);
    expect(totals.quantity).toBe(100);
    expect(totals.sent).toBe(100);
    expect(totals.pending).toBe(100);
    expect(totals.expectedValuePaise).toBe(210000);
    expect(deriveJobStatus({ cancelled: false, items, hasReturns: false })).toBe("IN_PROGRESS");
  });

  it("first return 15/30/20", () => {
    const { totals, items } = scenario([15, 30, 20]);
    expect(totals.ok).toBe(65);
    expect(items.map((i) => i.pending)).toEqual([5, 20, 10]);
    expect(totals.pending).toBe(35);
    // 15×20 + 30×25 + 20×15 = 300 + 750 + 300
    expect(totals.completedValuePaise).toBe(135000);
    expect(totals.pendingValuePaise).toBe(75000);
    expect(deriveJobStatus({ cancelled: false, items, hasReturns: true })).toBe("PARTIALLY_RECEIVED");
  });

  it("second return brings totals to 20/45/30", () => {
    const { totals, items } = scenario([20, 45, 30]);
    expect(totals.ok).toBe(95);
    expect(items.map((i) => i.pending)).toEqual([0, 5, 0]);
    expect(totals.pending).toBe(5);
  });

  it("final return completes the job", () => {
    const { totals, items } = scenario([20, 50, 30]);
    expect(totals.ok).toBe(100);
    expect(totals.pending).toBe(0);
    expect(totals.completedValuePaise).toBe(210000);
    expect(deriveJobStatus({ cancelled: false, items, hasReturns: true })).toBe("COMPLETED");
  });
});

describe("summarizeItem", () => {
  it("keeps damaged/rejected/lost separate from received and out of payment", () => {
    const s = summarizeItem(base({ quantity: 50, ratePaise: 2500, initialSent: 50, ok: 40, damaged: 3, rejected: 2, lost: 1 }));
    expect(s.exceptions).toBe(6);
    expect(s.pending).toBe(4);
    expect(s.completedValuePaise).toBe(40 * 2500);
    expect(s.unbilledQty).toBe(40);
  });

  it("rework re-sends rejected pieces without changing the ordered qty", () => {
    const afterReject = summarizeItem(base({ quantity: 20, initialSent: 20, ok: 15, rejected: 5 }));
    expect(afterReject.pending).toBe(0);
    expect(afterReject.isDone).toBe(true);
    const reworkSent = summarizeItem(base({ quantity: 20, initialSent: 20, reworkSent: 5, ok: 15, rejected: 5 }));
    expect(reworkSent.sent).toBe(25);
    expect(reworkSent.pending).toBe(5);
    expect(reworkSent.isDone).toBe(false);
    const reworkBack = summarizeItem(base({ quantity: 20, ratePaise: 2000, initialSent: 20, reworkSent: 5, ok: 20, rejected: 5 }));
    expect(reworkBack.pending).toBe(0);
    expect(reworkBack.unbilledQty).toBe(20);
  });

  it("partially dispatched job is not complete", () => {
    const s = summarizeItem(base({ quantity: 30, initialSent: 20, ok: 20 }));
    expect(s.notYetSent).toBe(10);
    expect(s.pending).toBe(0);
    expect(s.isDone).toBe(false);
  });

  it("excess received only shows up as excess, never negative pending", () => {
    const s = summarizeItem(base({ quantity: 10, initialSent: 10, ok: 12 }));
    expect(s.pending).toBe(0);
    expect(s.excess).toBe(2);
  });

  it("paid qty reduces what is left to pay", () => {
    const s = summarizeItem(base({ quantity: 50, ratePaise: 2500, initialSent: 50, ok: 30, billedQty: 20 }));
    expect(s.unbilledQty).toBe(10);
    expect(s.unbilledValuePaise).toBe(25000);
    expect(s.billedValuePaise).toBe(50000);
  });
});

describe("status", () => {
  it("draft when nothing sent, cancelled overrides", () => {
    const items = [summarizeItem(base({ quantity: 10 }))];
    expect(deriveJobStatus({ cancelled: false, items, hasReturns: false })).toBe("DRAFT");
    expect(deriveJobStatus({ cancelled: true, items, hasReturns: false })).toBe("CANCELLED");
  });
});

describe("exceedsPending", () => {
  it("flags over-returns", () => {
    expect(exceedsPending(5, { okQty: 5, damagedQty: 0, rejectedQty: 0, lostQty: 0 })).toBe(false);
    expect(exceedsPending(5, { okQty: 5, damagedQty: 1, rejectedQty: 0, lostQty: 0 })).toBe(true);
  });
});

describe("sub bills + main bill", () => {
  it("a job is fully paid only when complete and every OK piece is paid", () => {
    const paidAll = sumTotals(scenario([20, 50, 30]).items.map((i) => summarizeItem(base({ ...i, billedQty: i.ok }))));
    expect(isFullyPaid("COMPLETED", paidAll)).toBe(true);
    expect(isFullyPaid("PARTIALLY_RECEIVED", paidAll)).toBe(false);
    expect(isFullyPaid("COMPLETED", { billedQty: 95, unbilledQty: 5 })).toBe(false);
    // Nothing returned OK means nothing to settle.
    expect(isFullyPaid("COMPLETED", { billedQty: 0, unbilledQty: 0 })).toBe(false);
  });

  it("formats rupees", () => {
    expect(formatINR(210000)).toBe("₹2,100");
    expect(formatINR(12345600)).toBe("₹1,23,456");
    expect(formatINR(1250)).toBe("₹12.50");
  });

  it("writes amounts in Indian words", () => {
    expect(amountInWords(210000)).toBe("Rupees Two Thousand One Hundred Only");
    expect(amountInWords(12345600)).toBe("Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only");
    expect(amountInWords(1250)).toBe("Rupees Twelve and Fifty Paise Only");
    expect(amountInWords(25_00_00_000_00)).toBe("Rupees Twenty Five Crore Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });
});
