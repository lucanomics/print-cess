// The published entry point. Every locale, including Korean and English, keeps
// its reviewed wording in `index.ts`, so this module only re-exports it. No
// language is served from an override layer or an English fallback.
export {
  isRightToLeft,
  LOCALE_NAMES,
  matchAcceptLanguage,
  matchLocale,
  RTL_LOCALES,
  SUPPORTED_LOCALES,
  translate,
  TRANSLATIONS,
  type SupportedLocale,
  type TranslationKey,
} from "./index";
