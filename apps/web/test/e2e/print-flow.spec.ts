import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  createBoundaryBytes,
  createSidewaysSyntheticJpeg,
  createSyntheticPdf,
  createSyntheticPng,
} from "@print-cess/test-fixtures";

async function openSession(page: Page, kioskPath = "/kiosk"): Promise<string> {
  await page.goto(kioskPath);
  await expect(page.getByText("QR코드를 카메라로 비추세요", { exact: true })).toBeVisible();
  const qr = page.locator(".kiosk-qr");
  // A cold Next.js development server can compile this API route while all
  // three browser projects arrive together. Wait for the actual session
  // receipt instead of coupling the flow to development compilation speed.
  //
  // `data-session-url` carries a live upload token, so the kiosk only exposes
  // it outside a Production build. These tests therefore require the
  // development server configured in `playwright.config.ts`.
  await expect(qr).toHaveAttribute("data-session-url", /#t=/u, { timeout: 60_000 });
  return (await qr.getAttribute("data-session-url"))!;
}

/**
 * Scanning lands on the multi-file chooser. There is no language screen and no
 * guide screen in front of it: the browser already carries the visitor's
 * language, and the guide is in Help for whoever wants it.
 */
async function openMobile(
  kiosk: Page,
  context: BrowserContext,
  kioskPath = "/kiosk",
): Promise<{ mobile: Page; sessionUrl: string }> {
  const sessionUrl = await openSession(kiosk, kioskPath);
  const mobile = await context.newPage();
  await mobile.goto(sessionUrl);
  await expect(mobile.getByRole("heading", { name: "Pick files to print" })).toBeVisible({
    timeout: 20_000,
  });
  return { mobile, sessionUrl };
}

test("mobile PNG flow encrypts, uploads, consumes once, and completes", async ({
  page,
  context,
}) => {
  const { mobile } = await openMobile(page, context, "/kiosk?printing=auto");
  await mobile.getByTestId("file-input").setInputFiles({
    name: "synthetic-ticket.png",
    mimeType: "image/png",
    buffer: Buffer.from(await createSyntheticPng(800, 1100)),
  });
  await expect(mobile.getByRole("heading", { name: "Is this the right page?" })).toBeVisible();
  await expect(mobile.getByRole("img", { name: "Preview of the file you picked" })).toBeVisible();
  await mobile.getByRole("button", { name: "Print 1 copy" }).click();
  await expect(page.getByRole("heading", { name: "인쇄가 시작됐어요" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("선택한 파일 1개를 처리했습니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "인쇄 창 다시 열기" })).toHaveCount(0);
  const download = page.getByRole("link", { name: "파일 1 다운로드 (직원용)" });
  await expect(download).toHaveAttribute("download", "print-cess-1-print-cess-document.png");
  await expect(download).toHaveAttribute("href", /^blob:/u);
  await expect(mobile.getByRole("heading", { name: "All done" })).toBeVisible({
    timeout: 60_000,
  });

  // Shutting the page down closes the tab where the browser allows it. A tab
  // opened by scanning a QR was not opened by script, so most browsers refuse;
  // the visitor then gets a screen that carries nothing from the visit.
  // Chromium's network service consumes `Clear-Site-Data` before Playwright can
  // read it back, which is the point of sending it. Assert the phone asks here,
  // and assert what the answer contains in the request-level test below.
  const clearSiteData = mobile.waitForRequest(
    (request) => request.url().endsWith("/api/session-end"),
    { timeout: 15_000 },
  );
  await mobile.getByRole("button", { name: "Close this page" }).click();
  await clearSiteData;

  if (!mobile.isClosed()) {
    await expect(mobile.getByRole("heading", { name: "Printing is finished" })).toBeVisible();
    await expect(mobile.getByRole("button", { name: "Need help?" })).toHaveCount(0);
    expect(mobile.url()).not.toMatch(/#/u);
  }
});

test("one kiosk scan prints multiple selected photo and document files in order", async ({
  page,
  context,
}) => {
  const { mobile } = await openMobile(page, context, "/kiosk?printing=auto");
  await mobile.getByTestId("file-input").setInputFiles([
    {
      name: "01-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(await createSyntheticPng(800, 1100)),
    },
    {
      name: "02-document.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await createSyntheticPdf(2)),
    },
  ]);

  await expect(mobile.getByRole("heading", { name: "Check these files" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(mobile.getByText("1. 01-photo.png", { exact: true })).toBeVisible();
  await expect(mobile.getByText("2. 02-document.pdf", { exact: true })).toBeVisible();
  await expect(mobile.getByText("2 files selected", { exact: true })).toBeVisible();
  await mobile.getByRole("button", { name: "Print 2 files" }).click();

  await expect(page.getByRole("heading", { name: "인쇄가 시작됐어요" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("선택한 파일 2개를 처리했습니다")).toBeVisible();
  await expect(page.getByRole("link", { name: "파일 1 다운로드 (직원용)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "파일 2 다운로드 (직원용)" })).toBeVisible();
  await expect(mobile.getByRole("heading", { name: "All done" })).toBeVisible({ timeout: 60_000 });
});

test("ending a visit tells the browser to drop this origin's data", async ({ request }) => {
  // Uses the request fixture rather than a page: a browser applies the header
  // and removes it, so only an HTTP-level check can see what was sent. This
  // covers the Next.js header merge that the route unit test cannot.
  const response = await request.post("/api/session-end");

  expect(response.status()).toBe(204);
  expect(response.headers()["clear-site-data"]).toBe('"cache", "cookies", "storage"');
  // Reloading a spent session would replace the visitor's confirmation with an error.
  expect(response.headers()["clear-site-data"]).not.toContain("executionContexts");
});

test("a captured QR cannot be claimed by a second phone", async ({ page, context }) => {
  const { sessionUrl } = await openMobile(page, context);
  const second = await context.newPage();
  await second.goto(sessionUrl);
  await expect(second.getByText(/already using this QR code/u)).toBeVisible();
});

test("missing or refreshed fragment fails closed", async ({ page, context }) => {
  await page.goto(`/s/${"A".repeat(22)}`);
  await expect(page.getByText(/This link is not complete/u)).toBeVisible();

  const kiosk = await context.newPage();
  const { mobile } = await openMobile(kiosk, context);
  await mobile.reload();
  await expect(mobile.getByText(/This link is not complete/u)).toBeVisible();
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
  await expect(mobile.getByText(/This QR code is too old/u)).toBeVisible();
});

test("a claim network interruption produces a recovery instruction", async ({ page, context }) => {
  const sessionUrl = await openSession(page);
  const mobile = await context.newPage();
  await mobile.route("**/api/sessions/*/claim", (route) => route.abort("internetdisconnected"));
  await mobile.goto(sessionUrl);
  await expect(mobile.getByText(/The connection stopped/u)).toBeVisible();
});

test("large files are rejected before encryption", async ({ page, context }) => {
  const { mobile } = await openMobile(page, context);
  await mobile.getByTestId("file-input").setInputFiles({
    name: "too-large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(createBoundaryBytes(1)),
  });
  await expect(mobile.getByText(/PDFs under 10 MB/u)).toBeVisible();
});

test("cancelling a file picker keeps the claimed session ready", async ({ page, context }) => {
  const { mobile } = await openMobile(page, context);
  await mobile.getByTestId("file-input").dispatchEvent("cancel");
  await expect(mobile.getByRole("heading", { name: "Pick files to print" })).toBeVisible();
  await expect(mobile.getByRole("button", { name: "Open my photos" })).toBeVisible();
  await expect(mobile.getByRole("button", { name: "Open my files" })).toBeVisible();
});

test("a gallery photo taken sideways reaches the preview", async ({ page, context }) => {
  const { mobile } = await openMobile(page, context);
  await mobile.getByTestId("photo-input").setInputFiles({
    name: "synthetic-sideways.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(await createSidewaysSyntheticJpeg()),
  });

  // The EXIF orientation tag makes the browser decode this photo with its axes
  // swapped relative to the dimensions stored in the file. It is a valid,
  // printable photograph and must not be reported as damaged.
  await expect(mobile.getByRole("heading", { name: "Is this the right page?" })).toBeVisible();
  await expect(mobile.getByRole("img", { name: "Preview of the file you picked" })).toBeVisible();
  await expect(mobile.getByText(/will not open/u)).toHaveCount(0);
});

test("a locked PDF is rejected with a safe alternative", async ({ page, context }) => {
  const { mobile } = await openMobile(page, context);
  await mobile.getByTestId("file-input").setInputFiles({
    name: "synthetic-locked.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await createSyntheticPdf(1, "fixture-only-password")),
  });
  await expect(mobile.getByText(/This PDF has a password/u)).toBeVisible();
});

test("a synthetic PDF is validated and previewed", async ({ page, context }) => {
  const { mobile } = await openMobile(page, context);
  await mobile.getByTestId("file-input").setInputFiles({
    name: "synthetic-confirmation.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await createSyntheticPdf(2)),
  });
  await expect(mobile.getByRole("heading", { name: "Is this the right page?" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(mobile.locator("canvas")).toBeVisible({ timeout: 30_000 });
});

test("the language picker and the guide are available without blocking anything", async ({
  page,
  context,
}) => {
  const { mobile } = await openMobile(page, context);

  // The picker is in the header, so changing language costs nothing and
  // interrupts nothing.
  await mobile.getByLabel("Choose your language").selectOption("ko");
  await expect(mobile.getByRole("heading", { name: "출력할 파일을 선택하세요" })).toBeVisible();
  await expect(mobile.locator("html")).toHaveAttribute("lang", "ko");

  // The guide that used to be a screen of its own is one tap away from the
  // screen that needs it.
  const sheet = mobile.getByRole("dialog");
  await mobile.getByRole("button", { name: "어떻게 쓰나요?" }).click();
  await expect(sheet.getByRole("heading", { name: "지금 무엇을 하면 되나요?" })).toBeVisible();
  await expect(sheet.getByText("1. QR코드 스캔하기")).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "인쇄할 문서가 어디에 있나요?" })).toBeVisible();
  await expect(sheet.getByText("카카오톡에 있어요", { exact: true })).toBeVisible();
  await expect(sheet.getByText(/직원에게 도움을 요청하세요/u)).toBeVisible();
  await sheet.getByRole("button", { name: "알겠어요" }).click();
  await expect(sheet).toBeHidden();

  // The picker screen itself stays down to two actions plus the quiet link.
  await expect(mobile.getByRole("button", { name: "사진에서 고르기" })).toBeVisible();
  await expect(mobile.getByRole("button", { name: "파일에서 고르기" })).toBeVisible();
  await expect(mobile.getByText("카카오톡")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page: mobile }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the kiosk stops asking for a scan once a phone has connected", async ({ page, context }) => {
  const { mobile } = await openMobile(page, context);

  // The QR is no longer valid and the work is on the visitor's phone, so the
  // shared screen says where to look instead of repeating an instruction the
  // visitor has already carried out.
  await expect(page.locator("[data-kiosk-state='connected']")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".kiosk-connected__badge")).toContainText("휴대전화가 연결됐어요");
  await expect(page.locator(".kiosk-connected__headline")).toContainText("휴대전화에서 계속하세요");
  await expect(page.locator(".kiosk-qr")).toHaveCount(0);
  // The public screen never names the document, only its stage.
  await expect(page.getByTestId("kiosk-document-token")).toBeVisible();
  expect(await mobile.title()).toBeTruthy();
});

test("browser Back never restores QR credentials after claim", async ({ page, context }) => {
  const { mobile } = await openMobile(page, context);
  await mobile.goBack();
  expect(mobile.url()).not.toMatch(/[#&](?:t|fp)=/u);
});

test("@viewport primary controls fit and pass basic accessibility checks", async ({
  page,
  context,
}, testInfo) => {
  const { mobile } = await openMobile(page, context);
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

test("@viewport Arabic reads right-to-left and fits the screen", async ({ page, context }) => {
  const { mobile } = await openMobile(page, context);
  await mobile.getByLabel("Choose your language").selectOption("ar");

  await expect(mobile.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(mobile.locator("html")).toHaveAttribute("lang", "ar");
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  const accessibility = await new AxeBuilder({ page: mobile }).analyze();
  expect(accessibility.violations).toEqual([]);
});
