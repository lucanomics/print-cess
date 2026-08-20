import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { createSyntheticPdf, createSyntheticPng } from "@print-cess/test-fixtures";

async function openMobile(page: Page, context: BrowserContext): Promise<Page> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        const target = window as typeof window & { __printCessPrintCount?: number };
        target.__printCessPrintCount = (target.__printCessPrintCount ?? 0) + 1;
      },
    });
  });
  await page.goto("/kiosk?printing=auto&sound=off");
  await expect(page.getByRole("heading", { name: /QR코드를 스캔하세요/u })).toBeVisible();
  const qr = page.locator(".kiosk-qr");
  await expect(qr).toHaveAttribute("data-session-url", /[&#]bundle=1(?:&|$)/u, { timeout: 60_000 });
  const sessionUrl = (await qr.getAttribute("data-session-url"))!;
  const mobile = await context.newPage();
  await mobile.goto(sessionUrl);
  await expect(mobile.getByTestId("photo-input")).toHaveAttribute("multiple", "");
  await expect(mobile.getByTestId("file-input")).toHaveAttribute("multiple", "");
  return mobile;
}

async function finishPrint(kiosk: Page, mobile: Page, expectedPrints: number): Promise<void> {
  await mobile.getByRole("button", { name: /Print 1 copy|인쇄/u }).click();
  await expect(kiosk.getByRole("heading", { name: "인쇄가 시작됐어요" })).toBeVisible({
    timeout: 90_000,
  });
  await expect(mobile.getByRole("heading", { name: /All done|완료/u })).toBeVisible({
    timeout: 90_000,
  });
  await expect
    .poll(() =>
      kiosk.evaluate(
        () =>
          (window as typeof window & { __printCessPrintCount?: number }).__printCessPrintCount ?? 0,
      ),
    )
    .toBe(expectedPrints);
}

test("prints several selected photos from one QR session", async ({ page, context }) => {
  const mobile = await openMobile(page, context);

  await mobile.getByTestId("photo-input").setInputFiles([
    {
      name: "front.jpg.png",
      mimeType: "image/png",
      buffer: Buffer.from(await createSyntheticPng(900, 1200)),
    },
    {
      name: "back.jpg.png",
      mimeType: "image/png",
      buffer: Buffer.from(await createSyntheticPng(1000, 1400)),
    },
  ]);

  const selected = mobile.getByTestId("selected-print-files");
  await expect(selected.getByText("front.jpg.png")).toBeVisible();
  await expect(selected.getByText("back.jpg.png")).toBeVisible();
  await expect(selected.locator(".mobile-preview-item")).toHaveCount(2);

  await finishPrint(page, mobile, 2);
});

test("prints a mixed PDF and photo selection in its chosen order", async ({ page, context }) => {
  const mobile = await openMobile(page, context);

  await mobile.getByTestId("file-input").setInputFiles([
    {
      name: "application.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await createSyntheticPdf(2)),
    },
    {
      name: "evidence.png",
      mimeType: "image/png",
      buffer: Buffer.from(await createSyntheticPng(800, 1100)),
    },
  ]);

  const selected = mobile.getByTestId("selected-print-files");
  await expect(selected.getByText("application.pdf")).toBeVisible();
  await expect(selected.getByText("evidence.png")).toBeVisible();
  const labels = selected.locator(".mobile-preview-item__label");
  await expect(labels.nth(0)).toContainText("1 / 2");
  await expect(labels.nth(1)).toContainText("2 / 2");

  await finishPrint(page, mobile, 2);
});
