import { test } from "@playwright/test";
test("print preview", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/");
  const bills = await (await page.request.get("/api/main-bills")).json();
  await page.goto(`/bills/main/${bills[0].id}`);
  await page.getByText("Job settlement").waitFor();
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: process.env.OUT + "/main-bill.pdf", format: "A4" });
  await page.screenshot({ path: process.env.OUT + "/main-bill-print.png", fullPage: true });
});
