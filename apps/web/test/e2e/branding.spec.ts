import { expect, test } from "@playwright/test";

test("uses the Club Paradiso service name", async ({ page }) => {
  await page.goto("/kiosk");

  await expect(page).toHaveTitle("Print-cess by Club Paradiso");
  await expect(page.getByLabel("Print-cess by Club Paradiso")).toBeVisible();
});

test("shows three simple QR steps without network jargon", async ({ page }) => {
  await page.goto("/kiosk");

  await expect(page.getByRole("heading", { name: /휴대전화 카메라를 여세요/u })).toBeVisible();
  await expect(page.getByText("QR코드를 카메라로 비추세요")).toBeVisible();
  await expect(page.getByText("화면에 나타나는 링크를 누르세요")).toBeVisible();
  await expect(page.getByText("사진을 찍을 필요는 없습니다", { exact: false })).toBeVisible();
  await expect(page.getByText("Wi-Fi는 필요하지 않습니다.")).toHaveCount(0);
  await expect(page.getByText("휴대전화 모바일 데이터를 사용하세요")).toHaveCount(0);
});

test("shows the two-minute QR renewal window", async ({ page }) => {
  await page.goto("/kiosk");

  await expect(page.locator(".kiosk-countdown")).toHaveText(
    /QR코드 변경까지 (?:02:00|01:5\d)/u,
  );
});
