import { afterEach, describe, expect, it, vi } from "vitest";

const { acceptLanguage } = vi.hoisted(() => ({ acceptLanguage: { value: "" } }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ "accept-language": acceptLanguage.value })),
}));

import HomePage from "./page";

/** Walks the rendered tree collecting every string, so copy can be asserted. */
function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: unknown } }).props.children);
  }
  return "";
}

function hrefsOf(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(hrefsOf);
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props: { href?: unknown; children?: unknown } }).props;
    return [...(typeof props.href === "string" ? [props.href] : []), ...hrefsOf(props.children)];
  }
  return [];
}

describe("home page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    acceptLanguage.value = "";
  });

  it("keeps file hand-off and kiosk entry discoverable when the browser kiosk is enabled", async () => {
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "true");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("VERCEL_ENV", "production");

    const page = await HomePage();

    expect(page.props.className).toBe("status-page");
    expect(hrefsOf(page)).toEqual(expect.arrayContaining(["/send", "/receive", "/kiosk"]));
  });

  it("hides the kiosk shortcut when the production route is disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("VERCEL_ENV", "production");

    const page = await HomePage();
    const hrefs = hrefsOf(page);

    expect(hrefs).toEqual(expect.arrayContaining(["/send", "/receive"]));
    expect(hrefs).not.toContain("/kiosk");
  });

  it("keeps the public entry page on the dedicated kiosk Preview branch", async () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "preview");

    const page = await HomePage();

    expect(page.props.className).toBe("status-page");
    expect(hrefsOf(page)).toEqual(expect.arrayContaining(["/send", "/receive", "/kiosk"]));
  });

  it("greets a visitor in the language their browser asked for", async () => {
    acceptLanguage.value = "ko-KR,ko;q=0.9,en;q=0.8";

    const copy = textOf(await HomePage());

    expect(copy).toContain("안전하게 인쇄하고 주고받아요");
    expect(copy).toContain("파일 보내기");
    expect(copy).toContain("파일 받기");
    expect(copy).toContain("키오스크 열기");
    expect(copy).not.toContain("Secure print and transfer service");
  });

  it("falls back to English when no language is asked for", async () => {
    const copy = textOf(await HomePage());

    expect(copy).toContain("Secure print and transfer service");
    expect(copy).toContain("Send files");
    expect(copy).toContain("Receive files");
    expect(copy).toContain("Open kiosk");
  });
});
