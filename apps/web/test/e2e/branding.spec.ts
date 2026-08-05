import { expect, test } from "@playwright/test";

test("uses the Club Paradiso service name", async ({ page }) => {
  await page.goto("/kiosk");

  await expect(page).toHaveTitle("Print-cess by Club Paradiso");
  await expect(page.getByLabel("Print-cess by Club Paradiso")).toBeVisible();
});

test("shows three simple QR steps without network jargon", async ({ page }) => {
  await page.goto("/kiosk");

  await expect(page.getByRole("heading", { name: /휴대전화에서 카메라를 여세요/u })).toBeVisible();
  await expect(page.getByText("QR코드를 카메라로 비추세요")).toBeVisible();
  await expect(page.getByText("화면에 나타나는 링크를 누르세요")).toBeVisible();
  await expect(page.getByText("사진을 찍을 필요는 없습니다", { exact: false })).toBeVisible();
  await expect(page.getByText("Wi-Fi는 필요하지 않습니다.")).toHaveCount(0);
  await expect(page.getByText("휴대전화 모바일 데이터를 사용하세요")).toHaveCount(0);
});

test("repeats the scan instruction in the other visitor languages", async ({ page }) => {
  const rotating = ["ar", "fil", "id", "km", "mn", "ne", "ru", "th", "uk", "vi", "zh-CN"];
  await page.goto("/kiosk");
  // Chromium throttles timers in a background tab; a real kiosk is always the
  // foreground tab.
  await page.bringToFront();
  const spotlight = page.locator(".kiosk-spotlight");

  const first = await spotlight.getAttribute("lang");
  expect(rotating).toContain(first);
  expect((await spotlight.textContent())?.trim()).not.toBe("");

  // The line advances on a timer, so the next language must differ.
  await expect.poll(() => spotlight.getAttribute("lang"), { timeout: 30_000 }).not.toBe(first);
  expect(rotating).toContain(await spotlight.getAttribute("lang"));
});

test("keeps the primary camera instruction balanced and aligned", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/kiosk");

  const firstLine = page.getByText("휴대전화에서", { exact: true });
  const secondLine = page.getByText("카메라를 여세요", { exact: true });
  const englishLine = page.getByText("Open the camera on your phone", { exact: true });
  const stepNumber = page.locator(".kiosk-step-heading .kiosk-step-number");

  await expect(firstLine).toBeVisible();
  await expect(secondLine).toBeVisible();

  const [firstBox, secondBox, englishBox, numberBox] = await Promise.all([
    firstLine.boundingBox(),
    secondLine.boundingBox(),
    englishLine.boundingBox(),
    stepNumber.boundingBox(),
  ]);

  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(englishBox).not.toBeNull();
  expect(numberBox).not.toBeNull();
  expect(Math.abs(firstBox!.x - secondBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(firstBox!.x - englishBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(numberBox!.y - firstBox!.y)).toBeLessThanOrEqual(12);
  expect(secondBox!.width).toBeGreaterThan(200);
});

test("shows the two-minute QR renewal window", async ({ page }) => {
  await page.goto("/kiosk");

  await expect(page.locator(".kiosk-countdown")).toHaveText(/QR코드 변경까지 (?:02:00|01:5\d)/u);
});
