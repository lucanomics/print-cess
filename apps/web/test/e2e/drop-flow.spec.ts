import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const FILE_NAME = "paradiso-note.txt";
// Two chunks' worth would take minutes on a development server; one chunk with
// a partial tail is enough to prove the split, the seal, and the reassembly.
const CONTENTS = "Paradiso hand-off\n".repeat(2048);

/**
 * Chromium exposes `showSaveFilePicker` and `showDirectoryPicker`, and both
 * open a native dialog no automated browser can drive. Removing them puts these
 * runs on the fallback every other browser uses anyway — assemble, then hand
 * the file to the download machinery — which is the path with something a test
 * can actually observe. The direct-write path is asserted for its wording in
 * `drop-save.test.ts` and listed for manual verification in
 * `docs/FILE_COMPATIBILITY.md`.
 */
async function useDownloadFallback(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  });
}

async function pickFile(page: Page, name: string, body: string): Promise<void> {
  await page.setInputFiles('[data-testid="drop-file-input"]', {
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8"),
  });
}

async function readTransferCode(page: Page): Promise<string> {
  const code = page.locator(".drop-code strong");
  await expect(code).toBeVisible({ timeout: 120_000 });
  return ((await code.textContent()) ?? "").trim();
}

test("hands a file from one phone to another and back to disk", async ({ browser }) => {
  const sender = await browser.newContext();
  const receiver = await browser.newContext({ acceptDownloads: true });
  await useDownloadFallback(receiver);

  try {
    const sending = await sender.newPage();
    await sending.goto("/send");
    await expect(sending.getByRole("heading", { name: /Pick the files|보낼 파일/u })).toBeVisible();

    await pickFile(sending, FILE_NAME, CONTENTS);
    await expect(sending.getByText(FILE_NAME)).toBeVisible();

    await sending.getByRole("button", { name: /Send these files|이 파일 보내기/u }).click();

    const transferCode = await readTransferCode(sending);
    expect(transferCode).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/u,
    );

    const receiving = await receiver.newPage();
    await receiving.goto("/receive");
    await receiving.getByTestId("drop-code-input").fill(transferCode);
    await receiving.getByRole("button", { name: /Show me the files|파일 확인하기/u }).click();

    // The file list is only readable once the code has opened the manifest.
    await expect(receiving.getByText(FILE_NAME)).toBeVisible({ timeout: 60_000 });

    const download = receiving.waitForEvent("download", { timeout: 120_000 });
    await receiving.getByRole("button", { name: /Save to my phone|휴대전화에 저장하기/u }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe(FILE_NAME);

    const stream = await saved.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString("utf8")).toBe(CONTENTS);

    // The screen says what actually happened. A blob handed to the browser has
    // started a download; it has not been confirmed onto storage, and the copy
    // must not claim otherwise.
    await expect(receiving.getByText(/Download started|내려받기를 시작했어요/u)).toBeVisible();
    await expect(receiving.getByText(/handed over|건네줬어요/u)).toBeVisible();

    // The sender learns that the other phone finished, and nothing else.
    await expect(sending.getByText(/has taken the files|받아 갔어요/u)).toBeVisible({
      timeout: 60_000,
    });
  } finally {
    await sender.close();
    await receiver.close();
  }
});

test("saves one of several files without fetching the rest", async ({ browser }) => {
  const sender = await browser.newContext();
  const receiver = await browser.newContext({ acceptDownloads: true });
  await useDownloadFallback(receiver);

  try {
    const sending = await sender.newPage();
    await sending.goto("/send");
    await sending.setInputFiles('[data-testid="drop-file-input"]', [
      { name: "first.txt", mimeType: "text/plain", buffer: Buffer.from("first\n") },
      { name: "second.txt", mimeType: "text/plain", buffer: Buffer.from("second\n") },
      { name: "third.txt", mimeType: "text/plain", buffer: Buffer.from("third\n") },
    ]);
    await expect(sending.getByText("second.txt")).toBeVisible();

    // A selection is edited, not restarted: one wrong file costs one removal.
    await sending.getByRole("button", { name: /Remove second\.txt|second\.txt 빼기/u }).click();
    await expect(sending.getByText("second.txt")).toHaveCount(0);
    await expect(sending.getByText("first.txt")).toBeVisible();
    await expect(sending.getByText("third.txt")).toBeVisible();

    await sending.getByRole("button", { name: /Send these files|이 파일 보내기/u }).click();
    const transferCode = await readTransferCode(sending);

    const receiving = await receiver.newPage();
    await receiving.goto("/receive");
    await receiving.getByTestId("drop-code-input").fill(transferCode);
    await receiving.getByRole("button", { name: /Show me the files|파일 확인하기/u }).click();
    await expect(receiving.getByText("third.txt")).toBeVisible({ timeout: 60_000 });

    // Only the second row's Save is pressed. Somebody who wants one of five
    // files should not have to take all five.
    const downloads: string[] = [];
    receiving.on("download", (download) => downloads.push(download.suggestedFilename()));
    const rows = receiving.locator(".drop-file-list--actions > li");
    await rows
      .nth(1)
      .getByRole("button", { name: /^Save$|^저장하기$/u })
      .click();

    await expect(rows.nth(1).getByText(/Download started|내려받기를 시작했어요/u)).toBeVisible({
      timeout: 60_000,
    });
    await expect(rows.nth(0).getByText(/Not saved yet|아직 저장 안 했어요/u)).toBeVisible();
    expect(downloads).toEqual(["third.txt"]);
  } finally {
    await sender.close();
    await receiver.close();
  }
});

test("lets a receiver scan before the sender has finished uploading", async ({ browser }) => {
  const sender = await browser.newContext();
  const receiver = await browser.newContext({ acceptDownloads: true });
  await useDownloadFallback(receiver);

  try {
    const sending = await sender.newPage();
    // Hold the part uploads so the transfer stays unsealed while the receiver
    // arrives, which is exactly what a slow gigabyte looks like.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await sending.route("**/api/dev/blob**", async (route) => {
      if (route.request().method() === "PUT") await held;
      await route.continue();
    });

    await sending.goto("/send");
    await pickFile(sending, FILE_NAME, "waiting for the receiver\n");
    await sending.getByRole("button", { name: /Send these files|이 파일 보내기/u }).click();

    // The code appears as soon as the service holds the record, not when the
    // last byte lands.
    const transferCode = await readTransferCode(sending);

    const receiving = await receiver.newPage();
    await receiving.goto("/receive");
    await receiving.getByTestId("drop-code-input").fill(transferCode);
    await receiving.getByRole("button", { name: /Show me the files|파일 확인하기/u }).click();

    // The right code, an unfinished transfer: wait, do not claim it is wrong.
    await expect(receiving.getByRole("heading", { name: /Connected|연결됐어요/u })).toBeVisible({
      timeout: 60_000,
    });
    await expect(receiving.getByText(/still being prepared|준비하고 있어요/u)).toBeVisible();
    // Nothing about the files leaks before the transfer is sealed.
    await expect(receiving.getByText(FILE_NAME)).toHaveCount(0);

    release();
    await expect(receiving.getByText(FILE_NAME)).toBeVisible({ timeout: 120_000 });
  } finally {
    await sender.close();
    await receiver.close();
  }
});

test("opens a transfer from a pasted link, not just from twelve characters", async ({
  browser,
}) => {
  const sender = await browser.newContext();
  const receiver = await browser.newContext({ acceptDownloads: true });
  await useDownloadFallback(receiver);

  try {
    const sending = await sender.newPage();
    await sending.goto("/send");
    await pickFile(sending, FILE_NAME, "pasted link\n");
    await sending.getByRole("button", { name: /Send these files|이 파일 보내기/u }).click();
    const transferCode = await readTransferCode(sending);

    const receiving = await receiver.newPage();
    await receiving.goto("/receive");
    // A whole link is what a person actually pastes. The field used to strip it
    // to the letters of its own hostname and open nothing.
    await receiving
      .getByTestId("drop-code-input")
      .fill(`http://127.0.0.1:3000/receive#c=${transferCode}`);

    await expect(receiving.getByText(FILE_NAME)).toBeVisible({ timeout: 60_000 });
  } finally {
    await sender.close();
    await receiver.close();
  }
});

test("says so plainly when a transfer code matches nothing", async ({ page }) => {
  await page.goto("/receive");
  await page.getByTestId("drop-code-input").fill("2345-6789-ABCD");
  await page.getByRole("button", { name: /Show me the files|파일 확인하기/u }).click();

  await expect(
    page.getByRole("heading", { name: /No transfer matches that code|맞는 전송이 없어요/u }),
  ).toBeVisible({ timeout: 60_000 });
});

test("keeps the transfer code out of everything but the fragment", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (request) => sent.push(request.url()));

  await page.goto("/send");
  await pickFile(page, FILE_NAME, "short");
  await page.getByRole("button", { name: /Send these files|이 파일 보내기/u }).click();

  const transferCode = (await readTransferCode(page)).replaceAll("-", "");

  expect(transferCode).toHaveLength(12);
  for (const url of sent) {
    expect(url).not.toContain(transferCode);
  }
});
