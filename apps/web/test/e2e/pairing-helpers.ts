import { expect, type Page } from "@playwright/test";

/**
 * The two digits the other phone is asked to type. They name the pairing and
 * nothing else: on their own they open no files.
 */
export async function readShortCode(page: Page): Promise<string> {
  const digits = page.getByTestId("pairing-code");
  await expect(digits).toHaveText(/^[0-9]{2}$/u, { timeout: 180_000 });
  return ((await digits.textContent()) ?? "").trim();
}

/**
 * Reads the shape off the receiving screen the way its human does — by looking
 * at the drawing — rather than from any value the test was told in advance.
 */
export async function shapeOnScreen(page: Page): Promise<string> {
  return page.evaluate(() => {
    const child = document.querySelector(".pairing-shown__figure svg")?.firstElementChild;
    if (!child) return "unknown";
    if (child.tagName === "circle") return "circle";
    if (child.tagName === "rect") return "square";
    return (child.getAttribute("points") ?? "").split(" ").length > 4 ? "star" : "triangle";
  });
}

/**
 * Proof that the receive page is hydrated. A keypad press is React's to handle,
 * so the entry display only changes once the handlers are attached; filling the
 * link field before that point puts the link in the DOM with nothing listening,
 * and a keypad press lands on nothing at all. The digit is taken back
 * afterwards so this can also be used by the tests whose subject is the digits.
 */
export async function waitForReceiveHydration(page: Page): Promise<void> {
  await page.getByTestId("pairing-key-1").click();
  await expect(page.getByTestId("pairing-entry")).toHaveText(/^1/u);
  await page.getByTestId("pairing-key-back").click();
  await expect(page.getByTestId("pairing-entry")).not.toHaveText(/^1/u);
}

/**
 * The whole hand-off as two people perform it: two digits typed on the
 * receiving phone, then the shape that phone displays picked on the sending
 * one. Nothing the receiving phone can do alone gets it the files, which is
 * what makes a hundred possible codes safe to hand out.
 */
export async function handOver(sending: Page, receiving: Page): Promise<void> {
  await waitForReceiveHydration(receiving);
  for (const digit of await readShortCode(sending)) {
    await receiving.getByTestId(`pairing-key-${digit}`).click();
  }
  await expect(receiving.locator(".pairing-shown__figure")).toBeVisible({ timeout: 60_000 });
  const shape = await shapeOnScreen(receiving);
  await expect(sending.getByTestId(`pairing-choice-${shape}`)).toBeVisible({ timeout: 60_000 });
  await sending.getByTestId(`pairing-choice-${shape}`).click();
}
