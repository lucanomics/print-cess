import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function openMobileAtFilePicker(
  kiosk: Page,
  context: BrowserContext,
  kioskPath = "/kiosk",
): Promise<Page> {
  await kiosk.goto(kioskPath);
  const qr = kiosk.locator(".kiosk-qr");
  await expect(qr).toHaveAttribute("data-session-url", /#t=/u, { timeout: 60_000 });
  const sessionUrl = (await qr.getAttribute("data-session-url"))!;

  const mobile = await context.newPage();
  await mobile.goto(sessionUrl);
  await expect(mobile.getByRole("heading", { name: "Choose your language" })).toBeVisible({
    timeout: 20_000,
  });
  await mobile.getByRole("button", { name: "Continue" }).click();
  await mobile.getByRole("button", { name: "Choose my document" }).click();
  await expect(mobile.getByRole("heading", { name: "Choose one document" })).toBeVisible();
  return mobile;
}

async function createWebpBytes(page: Page): Promise<Buffer | undefined> {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 120;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#008a8a";
    context.fillRect(12, 16, 56, 88);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.9),
    );
    if (!blob || blob.type !== "image/webp") return undefined;
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return bytes ? Buffer.from(bytes) : undefined;
}

test("WebP is normalized on the phone and printed through the JPEG path", async ({
  page,
  context,
}) => {
  const mobile = await openMobileAtFilePicker(page, context, "/kiosk?printing=auto");
  const webp = await createWebpBytes(mobile);
  test.skip(!webp, "This browser project cannot encode the synthetic WebP fixture.");

  await mobile.getByTestId("file-input").setInputFiles({
    name: "phone-photo.webp",
    mimeType: "image/webp",
    buffer: webp!,
  });
  await expect(mobile.getByRole("heading", { name: "Check your document" })).toBeVisible();
  await expect(mobile.getByRole("img", { name: "Selected document preview" })).toBeVisible();
  await mobile.getByRole("button", { name: "Print one A4 copy" }).click();

  await expect(page.getByRole("heading", { name: "자동 인쇄가 시작됐습니다" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("link", { name: "파일 다운로드" })).toHaveAttribute(
    "download",
    "print-cess-document.jpg",
  );
  await expect(mobile.getByRole("heading", { name: "Printing is complete" })).toBeVisible({
    timeout: 60_000,
  });
});

test("HWP selection gives a privacy-preserving PDF conversion instruction", async ({
  page,
  context,
}) => {
  const mobile = await openMobileAtFilePicker(page, context);
  await mobile.getByTestId("file-input").setInputFiles({
    name: "residence-form.hwp",
    mimeType: "application/x-hwp",
    buffer: Buffer.from("synthetic HWP placeholder for format routing"),
  });

  const fileError = mobile.locator(".mobile-file-error");
  await expect(fileError).toContainText(
    "not configured with the Hancom renderer required for HWP/HWPX",
  );
  await expect(fileError).toContainText("Save the document as PDF");
  await expect(mobile.getByRole("heading", { name: "Check your document" })).toHaveCount(0);
});
