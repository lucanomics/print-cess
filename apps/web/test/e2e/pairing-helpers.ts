import { expect, type Page } from "@playwright/test";

import type { PairingShape } from "@print-cess/protocol";

export async function chooseSenderShape(page: Page, shape: PairingShape = "star"): Promise<void> {
  await page.getByTestId(`pairing-choice-${shape}`).click();
  await expect(page.getByTestId(`pairing-selected-${shape}`)).toBeVisible({ timeout: 60_000 });
}

export async function readShortCode(page: Page): Promise<string> {
  const digits = page.getByTestId("pairing-code");
  await expect(digits).toHaveText(/^[0-9]{2}$/u, { timeout: 180_000 });
  return ((await digits.textContent()) ?? "").trim();
}

export async function waitForReceiveHydration(page: Page): Promise<void> {
  await page.getByTestId("pairing-key-1").click();
  await expect(page.getByTestId("pairing-entry")).toHaveText(/^1/u);
  await page.getByTestId("pairing-key-back").click();
  await expect(page.getByTestId("pairing-entry")).not.toHaveText(/^1/u);
}

/** The full nearby-phone hand-off: sender shape, two digits, receiver shape. */
export async function handOver(sending: Page, receiving: Page): Promise<void> {
  const shape: PairingShape = "star";
  await chooseSenderShape(sending, shape);
  await waitForReceiveHydration(receiving);
  for (const digit of await readShortCode(sending)) {
    await receiving.getByTestId(`pairing-key-${digit}`).click();
  }
  await receiving.getByTestId(`pairing-shape-${shape}`).click();
}
