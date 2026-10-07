import { expect, test } from "@playwright/test";

/**
 * The most-used operation on a phone (spec §54): pick challan → good qty → rate → photo → payment → save.
 * Then edit the rate with a reason, and void the return. Needs `pnpm dev` running.
 */
const EMAIL = process.env.OWNER_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.OWNER_PASSWORD ?? "admin123";
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("record a return on a phone with photo and partial payment, then edit and void it", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  const tag = Date.now().toString().slice(-5);
  const post = async (url: string, data: unknown) => {
    const r = await page.request.post(url, { data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const worker = await post("/api/clients", { name: `Suresh ${tag}` });
  const product = await post("/api/products", { name: `Blouse ${tag}`, unit: "PCS" });
  const design = await post("/api/designs", { name: `Paisley ${tag}`, defaultRatePaise: 8000 });
  const material = await post("/api/materials", { name: `Blouse lot ${tag}`, unit: "PCS", openingQty: 500 });
  const job = await post("/api/jobs", { clientId: worker.id, productId: product.id, jobDate: "2026-10-01", items: [{ designId: design.id, materialId: material.id, quantity: 100, ratePaise: 8000 }] });
  const itemId = job.items[0].id;

  // ── Record return ──
  await page.goto(`/returns/new?job=${job.id}`);
  await page.locator(`#ok-${itemId}`).fill("40");
  await page.locator(`#rate-${itemId}`).fill("85");
  await expect(page.getByText("₹3,400").first()).toBeVisible(); // 40 × ₹85
  await page.locator('input[type=file][multiple]').setInputFiles({ name: "design.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await page.getByRole("radio", { name: /Partial/ }).click();
  await page.getByLabel(/Amount paid now/).fill("2000");
  await page.getByRole("button", { name: "Save return" }).last().click();

  await expect(page.getByText(/RET-\d+/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Photos uploaded")).toBeVisible({ timeout: 30_000 });
  const saved = await (await page.request.get(`/api/jobs/${job.id}`)).json();
  expect(saved.totals.ok).toBe(40);
  expect(saved.returns[0]).toMatchObject({ ratePaise: 8500, valuePaise: 340000, photoCount: 1 });
  expect(saved.money).toMatchObject({ valuePaise: 340000, paidPaise: 200000, outstandingPaise: 140000 });
  expect(saved.returns[0].payment.status).toBe("PARTIAL");
  const returnId = saved.returns[0].id;

  // ── Edit the rate (reason required) ──
  await page.goto(`/returns/${returnId}`);
  await page.getByRole("button", { name: /Edit/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Rate/).first().fill("90");
  await dialog.getByPlaceholder(/Recount at the shop/).fill("Agreed ₹90 for this lot");
  await dialog.getByRole("button", { name: /Save/ }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const edited = await (await page.request.get(`/api/returns/${returnId}`)).json();
  expect(edited).toMatchObject({ ratePaise: 9000, valuePaise: 360000 });
  expect(edited.history.some((h: { reason: string | null }) => h.reason === "Agreed ₹90 for this lot")).toBe(true);

  // ── Void ──
  await page.getByRole("button", { name: /more actions/i }).first().click();
  await page.getByRole("menuitem", { name: /Void return/ }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Recorded on the wrong challan");
  const voided = page.waitForResponse((r) => r.url().endsWith(`/api/returns/${returnId}/void`) && r.request().method() === "POST");
  await page.getByRole("dialog").getByRole("button", { name: "Void return" }).click();
  expect((await voided).status()).toBe(200);
  await expect(page.getByText(/Reason: Recorded on the wrong challan/).first()).toBeVisible({ timeout: 15_000 });
  const after = await (await page.request.get(`/api/jobs/${job.id}`)).json();
  expect(after.totals).toMatchObject({ ok: 0, pending: 100 });
  expect(after.money).toMatchObject({ valuePaise: 0, paidPaise: 200000, advancePaise: 200000 });
});
