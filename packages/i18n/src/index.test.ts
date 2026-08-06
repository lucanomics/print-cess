import { describe, expect, it } from "vitest";

import {
  isRightToLeft,
  SUPPORTED_LOCALES,
  TRANSLATIONS,
  translate,
  type SupportedLocale,
} from "./index.js";
import { translate as publicTranslate } from "./public.js";

// `translate` echoes an unknown key back, so asserting "not empty" would pass
// for a key that has been removed. Require a real, different value.
function expectTranslated(locale: SupportedLocale, key: string): void {
  const value = translate(locale, key).trim();
  expect(value).not.toBe("");
  expect(value).not.toBe(key);
}

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
      for (const key of guideKeys) expectTranslated(locale, key);
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
      for (const key of helpKeys) expectTranslated(locale, key);
    }
  });

  it("lets every locale shut the finished page down", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expectTranslated(locale, "closePage");
      expectTranslated(locale, "closedTitle");
      expectTranslated(locale, "closedBody");
    }
  });

  it("gives the shared kiosk display a scan instruction in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expectTranslated(locale, "kioskScanTitle");
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

  // A reviewer reads the copy once; these keep the classes of defect that the
  // review found from coming back on the next edit.

  it("keeps every interpolation placeholder in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, english] of Object.entries(TRANSLATIONS.en)) {
        const expected = [...english.matchAll(/\{\{(\w+)\}\}/gu)].map(([, name]) => name).sort();
        const actual = [...translate(locale, key).matchAll(/\{\{(\w+)\}\}/gu)]
          .map(([, name]) => name)
          .sort();
        expect(actual, `${locale}.${key}`).toEqual(expected);
      }
    }
  });

  it("leaves the HWPX token substitutable in every locale", () => {
    // The phone rewrites "HWPX" to "HWP/HWPX" when the station also prints
    // legacy HWP, so a translation that spells the format differently silently
    // stops being rewritten.
    const hwpxKeys = ["guideChooseBodyHwpx", "fileRulesHwpx", "hwpxUnavailable", "hwpxPreview"];
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of hwpxKeys) {
        expect(translate(locale, key), `${locale}.${key}`).toContain("HWPX");
      }
    }
  });

  it("only quotes control names that a visitor can actually find", () => {
    // Help text tells the visitor which button to press by quoting its label.
    // If a label is reworded and the help text is not, the instruction names a
    // control that is not on the screen.
    const quotingKeys = [
      "languageReminder",
      "guideReminder",
      "helpLanguage",
      "helpGuide",
      "helpFile",
      "helpPreview",
      "guideCheckBody",
    ];
    const labelKeys = [
      "continue",
      "guideStart",
      "locationPhotos",
      "locationFiles",
      "printOneCopy",
      "chooseAnother",
      "helpClose",
      "closePage",
      "listenAgain",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      const labels = new Set(labelKeys.map((key) => translate(locale, key)));
      for (const key of quotingKeys) {
        for (const quoted of translate(locale, key).matchAll(
          /[\u201c\u2018\u00ab]([^\u201d\u2019\u00bb]+)[\u201d\u2019\u00bb]/gu,
        )) {
          expect(labels, `${locale}.${key} quotes "${quoted[1]}"`).toContain(quoted[1]!.trim());
        }
      }
    }
  });

  it("does not mix numeral scripts inside one locale", () => {
    // A visitor who reads slowly should not meet the same count written two
    // ways on the same screen.
    const nativeDigits: Partial<Record<SupportedLocale, string>> = {
      km: "\u17e0\u17e1\u17e2\u17e3\u17e4\u17e5\u17e6\u17e7\u17e8\u17e9",
      ne: "\u0966\u0967\u0968\u0969\u096a\u096b\u096c\u096d\u096e\u096f",
      ar: "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669",
      th: "\u0e50\u0e51\u0e52\u0e53\u0e54\u0e55\u0e56\u0e57\u0e58\u0e59",
    };
    for (const [locale, digits] of Object.entries(nativeDigits)) {
      const values = Object.values(TRANSLATIONS[locale as SupportedLocale]);
      const native = values.filter((value) => [...digits!].some((digit) => value.includes(digit)));
      const latin = values.filter((value) => /\d/u.test(value));
      expect(
        native.length === 0 || latin.length === 0,
        `${locale} uses both native and Latin digits`,
      ).toBe(true);
    }
  });

  it("keeps one politeness register in Korean", () => {
    // Korean carries register in every sentence ending, and the flow reads as
    // one voice only if they agree. The review found three that had slipped.
    const values = Object.values(TRANSLATIONS.ko);
    const formal = values.filter((value) => /(습니다|입니다)[.!?]?$/u.test(value.trim()));
    expect(formal, "Korean copy mixing 합니다체 into a 해요체 flow").toEqual([]);
  });

  it("marks only right-to-left locales as right-to-left", () => {
    expect(isRightToLeft("ar")).toBe(true);
    for (const locale of SUPPORTED_LOCALES.filter((candidate) => candidate !== "ar")) {
      expect(isRightToLeft(locale)).toBe(false);
    }
  });
});
