import { headers } from "next/headers";

import { matchAcceptLanguage, type SupportedLocale } from "@print-cess/i18n";

/**
 * The visitor's language for this request, read from `Accept-Language`.
 *
 * The printing flow asks for a language on its own screen because the visitor
 * arrives at a shared kiosk with no context. Everything reachable from a phone
 * — the entry page and both halves of the hand-off — already has the answer in
 * the request, so asking again would be a question the service could have
 * answered itself. Resolving it on the server also means the first paint is
 * already correct: a client-only guess renders English and then swaps, which a
 * visitor sees as the page changing language under them.
 */
export async function requestLocale(): Promise<SupportedLocale> {
  const requestHeaders = await headers();
  return matchAcceptLanguage(requestHeaders.get("accept-language"));
}
