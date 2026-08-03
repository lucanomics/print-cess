import { expect, test } from "@playwright/test";

test("uses the Club Paradiso service name", async ({ page }) => {
  await page.goto("/kiosk");

  await expect(page).toHaveTitle("Print-cess by Club Paradiso");
  await expect(page.getByLabel("Print-cess by Club Paradiso")).toBeVisible();
});
