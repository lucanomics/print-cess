import { describe, expect, it } from "vitest";

import { isRightToLeft, SUPPORTED_LOCALES, TRANSLATIONS, translate } from "./index.js";
import { translate as publicTranslate } from "./public.js";

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

  it("explains every screen of the flow in every locale", () => {
    const helpKeys = [
      "helpOpen",
      "helpTitle",
      "helpClose",
      "helpLanguage",
      "helpGuide",
      "helpFile",
      "helpPreview",
      "helpProgress",
      "helpDone",
      "helpError",
      "helpAskStaff",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of helpKeys) expect(translate(locale, key).trim()).not.toBe("");
    }
  });

  it("gives the shared kiosk display a scan instruction in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(translate(locale, "kioskScanTitle").trim()).not.toBe("");
      expect(translate(locale, "kioskNoWifi").trim()).not.toBe("");
    }
  });

  it("keeps the published entry point and the source table in sync", () => {
    // Korean wording used to live in a locale-specific override layer. Every
    // locale is reviewed in one place now, so both modules must agree.
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of Object.keys(TRANSLATIONS.en)) {
        expect(publicTranslate(locale, key)).toBe(translate(locale, key));
      }
    }
  });

  it("marks only right-to-left locales as right-to-left", () => {
    expect(isRightToLeft("ar")).toBe(true);
    for (const locale of SUPPORTED_LOCALES.filter((candidate) => candidate !== "ar")) {
      expect(isRightToLeft(locale)).toBe(false);
    }
  });
});
