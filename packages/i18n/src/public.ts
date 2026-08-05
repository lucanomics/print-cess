// The published entry point. Every locale, including Korean, now keeps its
// reviewed wording in `index.ts`, so this module only re-exports it. Keeping a
// separate public module means the package surface stays small and stable.
export {
  isRightToLeft,
  LOCALE_NAMES,
  RTL_LOCALES,
  SUPPORTED_LOCALES,
  translate,
  TRANSLATIONS,
  type SupportedLocale,
  type TranslationKey,
} from "./index";
