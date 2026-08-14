import { expect, test, type Page } from "@playwright/test";

const FILE_NAME = "paradiso-note.txt";
// Two chunks' worth would take minutes on a development server; one chunk with
// a partial tail is enough to prove the split, the seal, and the reassembly.
const CONTENTS = "Paradiso hand-off\n".repeat(2048);

async function pickFile(page: Page, name: string, body: string): Promise<void> {
  await page.setInputFiles('[data-testid="drop-file-input"]', {
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8"),
  });
}

test("hands a file from one phone to another and back to disk", async ({ browser }) => {
  const sender = await browser.newContext();
  const receiver = await browser.newContext({ acceptDownloads: true });

  try {
    const sending = await sender.newPage();
    await sending.goto("/send");
    await expect(sending.getByRole("heading", { name: /Pick the files|보낼 파일/u })).toBeVisible();

    await pickFile(sending, FILE_NAME, CONTENTS);
    await expect(sending.getByText(FILE_NAME)).toBeVisible();

    await sending.getByRole("button", { name: /Send these files|이 파일 보내기/u }).click();

    // Key stretching plus the upload takes a moment on a development server.
    const code = sending.locator(".drop-code strong");
    await expect(code).toBeVisible({ timeout: 120_000 });
    const transferCode = (await code.textContent())?.trim() ?? "";
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

    await expect(receiving.getByRole("heading", { name: /Saved|저장했어요/u })).toBeVisible();

    // The sender's screen reports the pickup without ever seeing the file.
    await expect(sending.getByText(/picked these files up|받아 갔어요/u)).toBeVisible({
      timeout: 60_000,
    });
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

  const code = page.locator(".drop-code strong");
  await expect(code).toBeVisible({ timeout: 120_000 });
  const transferCode = ((await code.textContent()) ?? "").replaceAll("-", "");

  expect(transferCode).toHaveLength(12);
  for (const url of sent) {
    expect(url).not.toContain(transferCode);
  }
});
