import { describe, expect, it } from "vitest";

import {
  isRightToLeft,
  matchAcceptLanguage,
  matchLocale,
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
      "guideOpen",
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

  it("keeps one politeness register in every Korean sentence", () => {
    // Korean carries register in every sentence ending, and the flow reads as
    // one voice only if they all agree.
    //
    // Two ways to write this guard too weakly, both of which let the exact
    // defect the review found walk straight back in. Anchoring on the end of
    // the whole value only sees the last sentence, so a formal sentence
    // followed by an informal one passes — and a value mixing registers across
    // its own two sentences is what `guideScanBody` actually contained.
    // Listing 습니다 and 입니다 only catches two conjugations, so 됩니다 and
    // 합니다 pass — and `closedBody` actually contained 됩니다. Match the
    // 합니다체 endings themselves, at every sentence boundary.
    const formalEnding = /(니다|니까|십시오|십시다|읍시다)$/u;
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(TRANSLATIONS.ko)) {
      for (const sentence of value.split(/[.!?\n]+/u)) {
        const trimmed = sentence.trim();
        if (formalEnding.test(trimmed)) offenders.push(`${key}: ${trimmed}`);
      }
    }
    expect(offenders, "Korean copy mixing 합니다체 into a 해요체 flow").toEqual([]);
  });

  it("marks only right-to-left locales as right-to-left", () => {
    expect(isRightToLeft("ar")).toBe(true);
    for (const locale of SUPPORTED_LOCALES.filter((candidate) => candidate !== "ar")) {
      expect(isRightToLeft(locale)).toBe(false);
    }
  });
});

describe("choosing a locale for a visitor", () => {
  it("prefers an exact tag, then the base language", () => {
    expect(matchLocale(["zh-CN"])).toBe("zh-CN");
    expect(matchLocale(["ko-KR"])).toBe("ko");
    expect(matchLocale(["KO"])).toBe("ko");
    expect(matchLocale(["zh-TW", "ru-RU"])).toBe("zh-CN");
  });

  it("falls back to English rather than guessing", () => {
    expect(matchLocale([])).toBe("en");
    expect(matchLocale(["ja", "sv"])).toBe("en");
  });

  it("reads a browser's Accept-Language in quality order", () => {
    expect(matchAcceptLanguage("ko-KR,ko;q=0.9,en;q=0.8")).toBe("ko");
    // A lower-quality first entry must not win just by being written first.
    expect(matchAcceptLanguage("ja;q=0.2,uk;q=0.9")).toBe("uk");
    expect(matchAcceptLanguage("en-US,en;q=0.5")).toBe("en");
  });

  it("survives a header that is missing, empty, or malformed", () => {
    expect(matchAcceptLanguage(null)).toBe("en");
    expect(matchAcceptLanguage("")).toBe("en");
    expect(matchAcceptLanguage("*")).toBe("en");
    // A broken entry is skipped on its own; the readable preference after it
    // still decides, rather than the whole header being thrown away.
    expect(matchAcceptLanguage(";;;,vi")).toBe("vi");
    expect(matchAcceptLanguage("ko;q=0")).toBe("en");
  });
});
