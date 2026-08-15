import { afterEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
const { acceptLanguage } = vi.hoisted(() => ({ acceptLanguage: { value: "" } }));

vi.mock("next/navigation", () => ({ redirect }));
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

describe("home page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    redirect.mockReset();
    acceptLanguage.value = "";
  });

  it("opens the public browser kiosk from the deployment root", () => {
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "true");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");

    void HomePage();

    // The redirect is decided before the first await, so it does not wait on a
    // language the redirected visitor will never see.
    expect(redirect).toHaveBeenCalledWith("/kiosk");
  });

  it("keeps the legacy demo flag compatible with the browser kiosk", () => {
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "true");

    void HomePage();

    expect(redirect).toHaveBeenCalledWith("/kiosk");
  });

  it("opens the kiosk simulator on the dedicated Vercel Preview branch", () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "preview");

    void HomePage();

    expect(redirect).toHaveBeenCalledWith("/kiosk");
  });

  it("keeps the status page on unrelated Preview branches", async () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/example");

    const page = await HomePage();

    expect(redirect).not.toHaveBeenCalled();
    expect(page.props.className).toBe("status-page");
  });

  it("keeps the production status page when demo routes are disabled", async () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");
    vi.stubEnv("VERCEL_ENV", "production");

    const page = await HomePage();

    expect(redirect).not.toHaveBeenCalled();
    expect(page.props.className).toBe("status-page");
  });

  it("greets a visitor in the language their browser asked for", async () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");
    acceptLanguage.value = "ko-KR,ko;q=0.9,en;q=0.8";

    const copy = textOf(await HomePage());

    // The entry point used to be the one screen nobody had translated.
    expect(copy).toContain("안전하게 인쇄하고 주고받아요");
    expect(copy).toContain("파일 보내기");
    expect(copy).not.toContain("Secure print and transfer service");
  });

  it("falls back to English when no language is asked for", async () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");

    const copy = textOf(await HomePage());

    expect(copy).toContain("Secure print and transfer service");
  });
});
