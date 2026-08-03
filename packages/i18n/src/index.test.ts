import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES, TRANSLATIONS, translate } from "./index.js";

describe("translations", () => {
  it("supports every visitor language required by the kiosk", () => {
    expect(SUPPORTED_LOCALES).toEqual(
      expect.arrayContaining([
        "zh-CN",
        "id",
        "fil",
        "vi",
        "th",
        "ne",
        "km",
        "ar",
        "ru",
        "mn",
        "uk",
      ]),
    );
  });

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

  it("provides a complete four-step guide in every locale", () => {
    const guideKeys = [
      "guideTitle",
      "guideScanTitle",
      "guideScanBody",
      "guideChooseTitle",
      "guideChooseBody",
      "guideCheckTitle",
      "guideCheckBody",
      "guideCollectTitle",
      "guideCollectBody",
      "guideStart",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of guideKeys) expect(translate(locale, key).trim()).not.toBe("");
    }
  });
});
