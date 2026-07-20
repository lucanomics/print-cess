import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES, TRANSLATIONS, translate } from "./index.js";

describe("translations", () => {
  it("provides every English key in every locale", () => {
    const englishKeys = Object.keys(TRANSLATIONS.en);
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(TRANSLATIONS[locale]).sort()).toEqual(englishKeys.sort());
    }
  });

  it("falls back to English and interpolates values", () => {
    expect(translate("ko", "step", { current: 2, total: 5 })).toContain("2");
    expect(translate("ko", "unknown-key")).toBe("unknown-key");
  });
});
