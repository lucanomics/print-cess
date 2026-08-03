import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  createBoundaryBytes,
  createSyntheticPdf,
  createSyntheticPng,
} from "@print-cess/test-fixtures";

async function openSession(page: Page): Promise<string> {
  await page.goto("/kiosk");
  await expect(page.getByRole("heading", { name: /QR코드를 스캔하세요/u })).toBeVisible();
  const qr = page.locator(".kiosk-qr");
  // A cold Next.js development server can compile this API route while all
  // three browser projects arrive together. Wait for the actual session
  // receipt instead of coupling the flow to development compilation speed.
  await expect(qr).toHaveAttribute("data-session-url", /#t=/u, { timeout: 60_000 });
  return (await qr.getAttribute("data-session-url"))!;
}

async function openMobileAtLanguage(
  kiosk: Page,
  context: BrowserContext,
): Promise<{ mobile: Page; sessionUrl: string }> {
  const sessionUrl = await openSession(kiosk);
  const mobile = await context.newPage();
  await mobile.goto(sessionUrl);
  await expect(mobile.getByRole("heading", { name: "Choose your language" })).toBeVisible({
    timeout: 20_000,
  });
  return { mobile, sessionUrl };
}

async function reachFilePicker(mobile: Page, location = "Files / Downloads"): Promise<void> {
  await mobile.getByRole("button", { name: "Continue" }).click();
  await mobile.getByLabel(location).check();
  await mobile.getByRole("button", { name: "Continue" }).click();
  await expect(mobile.getByRole("heading", { name: "Choose one document" })).toBeVisible();
}

test("mobile PNG flow encrypts, uploads, consumes once, and completes", async ({
  page,
  context,
}) => {
  const { mobile } = await openMobileAtLanguage(page, context);
  await reachFilePicker(mobile);
  await mobile.locator('input[type="file"]').setInputFiles({
    name: "synthetic-ticket.png",
    mimeType: "image/png",
    buffer: Buffer.from(await createSyntheticPng(800, 1100)),
  });
  await expect(mobile.getByRole("heading", { name: "Check your document" })).toBeVisible();
  await expect(mobile.getByRole("img", { name: "Selected document preview" })).toBeVisible();
  await mobile.getByRole("button", { name: "Print one A4 copy" }).click();
  await expect(page.getByRole("heading", { name: "출력물을 가져가세요" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(mobile.getByRole("heading", { name: "Printing is complete" })).toBeVisible({
    timeout: 60_000,
  });
});

test("a captured QR cannot be claimed by a second phone", async ({ page, context }) => {
  const { sessionUrl } = await openMobileAtLanguage(page, context);
  const second = await context.newPage();
  await second.goto(sessionUrl);
  await expect(
    second.getByText("This QR code is already in use. Scan a new QR code."),
  ).toBeVisible();
});

test("missing or refreshed fragment fails closed", async ({ page, context }) => {
  await page.goto(`/s/${"A".repeat(22)}`);
  await expect(
    page.getByText("This QR code is incomplete. Scan the QR code on the kiosk again."),
  ).toBeVisible();

  const kiosk = await context.newPage();
  const { mobile } = await openMobileAtLanguage(kiosk, context);
  await mobile.reload();
  await expect(
    mobile.getByText("This QR code is incomplete. Scan the QR code on the kiosk again."),
  ).toBeVisible();
});

test("an expired QR receipt is reported explicitly", async ({ page, context, request }) => {
  const sessionUrl = await openSession(page);
  const sessionId = new URL(sessionUrl).pathname.split("/").at(-1)!;
  const cleanup = await request.post("/api/cleanup", {
    data: { sessionId, force: true },
    headers: { "x-admin-secret": "print-cess-e2e-admin-only" },
  });
  expect(cleanup.ok()).toBe(true);

  const mobile = await context.newPage();
  await mobile.goto(sessionUrl);
  await expect(
    mobile.getByText("This QR code has expired. Scan the new QR code on the kiosk."),
  ).toBeVisible();
});

test("a claim network interruption produces a recovery instruction", async ({ page, context }) => {
  const sessionUrl = await openSession(page);
  const mobile = await context.newPage();
  await mobile.route("**/api/sessions/*/claim", (route) => route.abort("internetdisconnected"));
  await mobile.goto(sessionUrl);
  await expect(
    mobile.getByText(
      "The connection was interrupted. Check mobile data and scan the current QR code again.",
    ),
  ).toBeVisible();
});

test("large files are rejected before encryption", async ({ page, context }) => {
  const { mobile } = await openMobileAtLanguage(page, context);
  await reachFilePicker(mobile);
  await mobile.locator('input[type="file"]').setInputFiles({
    name: "too-large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(createBoundaryBytes(1)),
  });
  await expect(mobile.getByText(/larger than 10 MB/u)).toBeVisible();
});

test("cancelling file selection releases the claimed session", async ({ page, context }) => {
  const { mobile, sessionUrl } = await openMobileAtLanguage(page, context);
  await reachFilePicker(mobile);
  await mobile.locator('input[type="file"]').dispatchEvent("cancel");
  await expect(mobile.getByText("No file was selected.")).toBeVisible();

  const replacement = await context.newPage();
  await replacement.goto(sessionUrl);
  await expect(
    replacement.getByText("This QR code has expired. Scan the new QR code on the kiosk."),
  ).toBeVisible();
});

test("a locked PDF is rejected with a safe alternative", async ({ page, context }) => {
  const { mobile } = await openMobileAtLanguage(page, context);
  await reachFilePicker(mobile);
  await mobile.locator('input[type="file"]').setInputFiles({
    name: "synthetic-locked.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await createSyntheticPdf(1, "fixture-only-password")),
  });
  await expect(mobile.getByText(/PDF is locked/u)).toBeVisible();
});

test("a synthetic PDF is validated and previewed", async ({ page, context }) => {
  const { mobile } = await openMobileAtLanguage(page, context);
  await reachFilePicker(mobile);
  await mobile.locator('input[type="file"]').setInputFiles({
    name: "synthetic-confirmation.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await createSyntheticPdf(2)),
  });
  await expect(mobile.getByRole("heading", { name: "Check your document" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(mobile.locator("canvas")).toBeVisible({ timeout: 30_000 });
});

test("language selection and KakaoTalk guidance are self-service", async ({ page, context }) => {
  const { mobile } = await openMobileAtLanguage(page, context);
  await mobile.getByLabel("한국어").check();
  await mobile.getByRole("button", { name: "계속" }).click();
  await mobile.getByLabel("카카오톡").check();
  await mobile.getByRole("button", { name: "계속" }).click();
  await expect(mobile.getByRole("heading", { name: "카카오톡" })).toBeVisible();
  await expect(mobile.getByText(/공유를 누른 뒤 파일 또는 다운로드에 저장/u)).toBeVisible();
});

test("browser Back leaves the claimed document flow without exposing data", async ({
  page,
  context,
}) => {
  const { mobile } = await openMobileAtLanguage(page, context);
  await mobile.goBack();
  expect(mobile.url()).toBe("about:blank");
});

test("@viewport primary controls fit and pass basic accessibility checks", async ({
  page,
  context,
}, testInfo) => {
  const { mobile } = await openMobileAtLanguage(page, context);
  if (testInfo.project.name !== "iphone") {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await mobile.keyboard.press("Tab");
      if ((await mobile.locator(".pc-screen-shell button:focus").count()) === 1) break;
    }
    await expect(mobile.locator(".pc-screen-shell button:focus")).toBeVisible();
  }
  await expect(mobile.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  const accessibility = await new AxeBuilder({ page: mobile }).analyze();
  expect(accessibility.violations).toEqual([]);
});
