import { expect, test, type Page } from "@playwright/test";

/**
 * Brief §25 – critical acceptance scenario through the UI.
 * Needs: `pnpm db:setup` (seeded owner + Plain Blouse + Floral/Royal/Simple designs) and `pnpm dev` running.
 */
const EMAIL = process.env.OWNER_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.OWNER_PASSWORD ?? "admin123";
const shots = process.env.E2E_SHOTS; // set to a folder to save screenshots

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

async function pick(page: Page, trigger: string | RegExp, search: string) {
  await page.getByRole("button", { name: trigger }).first().click();
  await page.getByPlaceholder("Type to search…").fill(search);
  await page.getByRole("option").first().click();
}

async function recordReturn(page: Page, qty: Record<string, number>) {
  await page.getByRole("main").getByRole("link", { name: "Record return", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Record a return" })).toBeVisible();
  for (const [design, n] of Object.entries(qty)) await page.getByLabel(`${design} received now`).fill(String(n));
  await page.getByRole("button", { name: "Save return" }).click();
  await expect(page.getByText(/pieces received on JOB-/)).toBeVisible();
  await page.getByRole("link", { name: "Open job" }).click();
}

const row = (page: Page, design: string) => page.locator("tbody tr", { hasText: design }).first();

/** From the job page: pay for everything that came back, then return to the job. */
async function payAll(page: Page, amount: string) {
  await page.getByRole("link", { name: `Pay ${amount}` }).first().click();
  await expect(page.getByRole("heading", { name: "New sub bill" })).toBeVisible();
  await expect(page.getByText(amount).last()).toBeVisible();
  await page.getByRole("radio", { name: "UPI" }).click();
  await page.getByRole("button", { name: "Save sub bill" }).click();
  await expect(page.getByText("Payment voucher")).toBeVisible();
  await expect(page.getByText("Amount paid").last().locator("..")).toContainText(amount);
}

const backToJob = (page: Page) => page.getByRole("main").getByRole("link", { name: /^JOB-/ }).first().click();

test("acceptance: 100 plain blouses, 3 designs, 3 partial returns, a sub bill after each, main bill", async ({ page }) => {
  const client = `Sharma Embroidery ${Date.now().toString().slice(-5)}`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible();
  await page.request.post("/api/clients", { data: { name: client, phone: "9800000000" } });
  await shot(page, "01-dashboard");

  // ── Create job ──
  await page.goto("/jobs/new");
  await pick(page, /^Client/, client);
  await pick(page, /^Product/, "Plain Blouse");
  const lines: [string, number][] = [["Floral Design", 20], ["Royal Design", 50], ["Simple Design", 30]];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) await page.getByRole("button", { name: "Add another design" }).click();
    await pick(page, "Choose design", lines[i][0]);
    await page.getByLabel("Pieces").nth(i).fill(String(lines[i][1]));
  }
  await expect(page.getByText("₹2,100").first()).toBeVisible();
  await shot(page, "02-new-job");
  await page.getByRole("button", { name: "Create job & send" }).click();
  await expect(page).toHaveURL(/\/jobs\/[a-z0-9]+$/);
  await expect(page.getByText("In Progress").first()).toBeVisible();
  await expect(row(page, "Floral Design")).toContainText("₹20");
  await expect(page.locator("tfoot")).toContainText("100");
  await expect(page.locator("tfoot")).toContainText("₹2,100");

  // ── First return ──
  await recordReturn(page, { "Floral Design": 15, "Royal Design": 30, "Simple Design": 20 });
  await expect(page.getByText("Partially Received").first()).toBeVisible();
  await expect(row(page, "Floral Design")).toContainText("5");
  await expect(row(page, "Royal Design")).toContainText("20");
  await expect(row(page, "Simple Design")).toContainText("10");
  await expect(page.locator("tfoot")).toContainText("65");
  await expect(page.locator("tfoot")).toContainText("35");
  await expect(page.locator("tfoot")).toContainText("₹1,350"); // 15×20 + 30×25 + 20×15
  await shot(page, "03-after-first-return");

  // ── Sub bill 1: pay for the 65 pieces ──
  await payAll(page, "₹1,350");
  await expect(row(page, "Floral Design")).toContainText("₹300");
  await expect(row(page, "Royal Design")).toContainText("₹750");
  await expect(page.getByText("Rupees One Thousand Three Hundred Fifty Only")).toBeVisible();
  await shot(page, "04-sub-bill");
  await backToJob(page);

  // ── Second return ──
  await recordReturn(page, { "Floral Design": 5, "Royal Design": 15, "Simple Design": 10 });
  await expect(page.locator("tfoot")).toContainText("95");
  await expect(row(page, "Royal Design")).toContainText("5");
  await expect(row(page, "Floral Design")).toContainText("0 ✓");
  await payAll(page, "₹625");
  await backToJob(page);

  // ── Final return ──
  await recordReturn(page, { "Royal Design": 5 });
  await expect(page.getByText("Completed").first()).toBeVisible();
  await expect(page.locator("tfoot")).toContainText("100");
  await expect(page.locator("tfoot")).toContainText("₹2,100");
  await shot(page, "05-completed");

  // ── Last sub bill settles the job → main bill ──
  await payAll(page, "₹125");
  await page.getByRole("link", { name: /^Main bill MB-/ }).click();
  await expect(page.getByText("Job settlement")).toBeVisible();
  await expect(page.getByText("Fully settled").first()).toBeVisible();
  await expect(page.getByText("Plain Blouse").first()).toBeVisible();
  await expect(row(page, "Floral Design")).toContainText("₹400");
  await expect(row(page, "Royal Design")).toContainText("₹1,250");
  await expect(row(page, "Simple Design")).toContainText("₹450");
  await expect(page.locator("tbody tr", { hasText: /SB-\d{3}/ })).toHaveCount(3);
  await expect(page.getByText("Rupees Two Thousand One Hundred Only")).toBeVisible();
  await shot(page, "06-main-bill");
  await backToJob(page);

  // ── History ──
  await page.getByRole("link", { name: /^JOB-/ }).first().click();
  await expect(page.getByText("100 pieces sent")).toBeVisible();
  await expect(page.getByText(/65 returned/)).toBeVisible();
  await expect(page.getByText(/30 returned/)).toBeVisible();
  await expect(page.getByText(/^5 returned/)).toBeVisible();
  await expect(page.getByText("Job completed – all pieces accounted for")).toBeVisible();
  await expect(page.getByText(/₹1,350 paid for 65 pcs/)).toBeVisible();
  await expect(page.getByText(/Fully paid – main bill MB-/)).toBeVisible();
  await shot(page, "07-job-history");

  // ── Reports ──
  await page.goto("/reports?tab=clients");
  const clientRow = page.locator("tbody tr", { hasText: client });
  await expect(clientRow).toContainText("₹2,100");
  await page.goto("/reports?tab=payments");
  await expect(page.locator("tbody tr", { hasText: client })).toHaveCount(3);
  await page.goto("/reports?tab=to-pay");
  await expect(page.locator("tbody tr", { hasText: client })).toHaveCount(0);
  await shot(page, "08-to-pay");
  await page.goto("/reports?tab=pending");
  await expect(page.locator("tbody tr", { hasText: client })).toHaveCount(0);
});
