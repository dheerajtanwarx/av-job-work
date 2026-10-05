import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Smoke test: seeds the AV §67 scenario through the API, then opens every screen at desktop and phone
 * width and fails on any console error, failed API request or error boundary.
 * Needs `pnpm dev` running against a migrated, seeded database.
 */
const EMAIL = process.env.OWNER_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.OWNER_PASSWORD ?? "admin123";
const shots = process.env.E2E_SHOTS;

// A tiny valid JPEG (1×1) – the server makes the display/thumb copies.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

async function seed(api: APIRequestContext) {
  const tag = Date.now().toString().slice(-5);
  const ok = async (p: Promise<{ ok(): boolean; json(): Promise<any>; status(): number; text(): Promise<string> }>) => {
    const r = await p;
    if (!r.ok()) throw new Error(`${r.status()} ${await r.text()}`);
    return r.json();
  };
  const worker = await ok(api.post("/api/clients", { data: { name: `Ramesh ${tag}`, phone: "9812345678", paymentPolicy: "DAYS_AFTER_RETURN", paymentDays: 7 } }));
  const product = await ok(api.post("/api/products", { data: { name: `Saree ${tag}`, unit: "PCS" } }));
  const design = await ok(api.post("/api/designs", { data: { name: `Floral ${tag}`, defaultRatePaise: 8000 } }));
  const material = await ok(api.post("/api/materials", { data: { name: `Saree blanks ${tag}`, unit: "PCS", openingQty: 1000 } }));
  const job = await ok(
    api.post("/api/jobs", { data: { clientId: worker.id, productId: product.id, jobDate: "2026-10-01", expectedReturnDate: "2026-10-10", items: [{ designId: design.id, materialId: material.id, quantity: 190, ratePaise: 8000 }] } }),
  );
  const line = job.items[0].id;
  const returns = [];
  for (const [qty, rate, pay, date] of [[52, 8000, 200000, "2026-10-02"], [44, 8000, 0, "2026-10-03"], [91, 8500, 500000, "2026-10-04"], [3, 8500, 100000, "2026-10-04"]] as const) {
    const r = await ok(api.post(`/api/jobs/${job.id}/returns`, { data: { date, lines: [{ jobItemId: line, okQty: qty, ratePaise: rate }], payment: pay ? { amountPaise: pay, method: "CASH" } : null } }));
    await ok(api.post(`/api/returns/${r.id}/photos`, { multipart: { photos: { name: `return-${qty}.jpg`, mimeType: "image/jpeg", buffer: JPEG } } }));
    returns.push(r);
  }
  return { worker, job, material, returns };
}

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Download the React DevTools/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) problems.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return problems;
}

test("every screen renders without errors on desktop and phone", async ({ page, browser }) => {
  test.setTimeout(600_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  const data = await seed(page.request);
  const cookies = await page.context().cookies();

  const pages: [string, string][] = [
    ["dashboard", "/"],
    ["challans", "/jobs"],
    ["challan-new", "/jobs/new"],
    ["challan", `/jobs/${data.job.id}`],
    ["challan-print", `/jobs/${data.job.id}/print`],
    ["record-return", `/returns/new?job=${data.job.id}`],
    ["returns", "/returns"],
    ["return", `/returns/${data.returns[2].id}`],
    ["return-print", `/returns/${data.returns[2].id}/print`],
    ["gallery", `/gallery?jobId=${data.job.id}`],
    ["payments", "/bills"],
    ["payment-new", `/bills/new?jobId=${data.job.id}`],
    ["voucher", `/bills/sub/${data.returns[0].voucher.id}`],
    ["workers", "/clients"],
    ["worker", `/clients/${data.worker.id}`],
    ["materials", "/materials"],
    ["material", `/materials/${data.material.id}`],
    ["reports", "/reports"],
    ["products", "/products"],
    ["designs", "/designs"],
    ["job-work-types", "/job-work-types"],
    ["settings", "/settings"],
  ];

  const failures: string[] = [];
  for (const [device, viewport] of [["desktop", { width: 1360, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const ctx = await browser.newContext({ viewport, baseURL: test.info().project.use.baseURL, isMobile: device === "phone", hasTouch: device === "phone" });
    await ctx.addCookies(cookies);
    const p = await ctx.newPage();
    for (const [name, url] of pages) {
      const problems = watch(p);
      await p.goto(url);
      await p.waitForLoadState("networkidle");
      await p.waitForTimeout(300);
      const crashed = await p.getByText(/Something went wrong|Application error|Unhandled Runtime Error/).count();
      if (crashed) problems.push("error boundary shown");
      if (shots) await p.screenshot({ path: `${shots}/${device}-${name}.png`, fullPage: true });
      p.removeAllListeners("console");
      p.removeAllListeners("pageerror");
      p.removeAllListeners("response");
      if (problems.length) failures.push(`${device} ${name}: ${[...new Set(problems)].join(" | ")}`);
    }
    // Public QR page works without a session.
    const anon = await browser.newContext({ viewport, baseURL: test.info().project.use.baseURL });
    const a = await anon.newPage();
    const problems = watch(a);
    await a.goto(`/c/${data.job.publicToken}`);
    await a.waitForLoadState("networkidle");
    if (shots) await a.screenshot({ path: `${shots}/${device}-public-qr.png`, fullPage: true });
    if (!(await a.getByText(data.job.jobNumber).count())) problems.push("challan number missing");
    if (problems.length) failures.push(`${device} public-qr: ${problems.join(" | ")}`);
    await anon.close();
    await ctx.close();
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
