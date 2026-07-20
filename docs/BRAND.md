# Brand and content guide

## Name and descriptors

The formal product name is **Print-cess by Paradiso**. Use the full name in screen titles,
metadata, README-level descriptions, installers, and first mention. “Print-cess” is acceptable in
compact repeated UI after the full-name context is visible.

- English descriptor: **Secure self-service document printing**
- Korean descriptor: **휴대전화에서 보내고 바로 출력하는 안전한 셀프 인쇄**
- Windows display name: **Print-cess Kiosk**

Do not imply a relationship with the unrelated “Printess” service. Paradiso is the parent brand.
No prior parent brand or repository name may remain in content or metadata.

## Visual language

The product is calm civic-service infrastructure: clear, steady, accessible, and neutral. Wit is
limited to the name. Do not use crowns, castles, princess imagery, sparkles, ornate scripts,
luxury motifs, or an excess of pink. Decoration never competes with the next action.

Current code tokens are the canonical starting palette:

| Role           | Token                          | Value                 |
| -------------- | ------------------------------ | --------------------- |
| Primary ink    | `--pc-ink`                     | `#071737`             |
| Body text      | `--pc-text`                    | `#23314c`             |
| Muted text     | `--pc-muted`                   | `#5c6880`             |
| Action teal    | `--pc-teal`                    | `#008a8a`             |
| Dark teal      | `--pc-teal-dark`               | `#006f72`             |
| Soft teal      | `--pc-teal-soft`               | `#e3f5f4`             |
| Border         | `--pc-line`                    | `#d9e5ed`             |
| Surface/subtle | `--pc-surface` / `--pc-subtle` | `#ffffff` / `#f4f8fa` |
| Error/success  | `--pc-error` / `--pc-success`  | `#a72c35` / `#087a57` |
| Focus          | `--pc-focus`                   | `#f5b700`             |

Use a system sans-serif stack with Inter, Pretendard, or Noto Sans where licensed and available.
Body copy is at least 18 px, primary controls at least 64 px high, and focus indication is obvious.
Color never carries meaning alone. Test contrast in every state.

## Wordmark and icon

The initial mark is code, not an image asset: a simple outline printer icon followed by
“Print-cess” in strong weight and “by Paradiso” in a quieter weight. Give the complete group the
accessible name “Print-cess by Paradiso”; decorative icon paths are hidden from assistive
technology.

Do not begin with a complex logo project. Do not use the Ministry of Justice, Jeju Immigration
Office, another public agency, airline, or travel-service logo without written permission.

## Layout and motion

- One screen, one clear decision; no more than two primary/secondary actions.
- Generous whitespace, short sentences, visible progress, and paired icon/text labels.
- Kiosk QR and collection direction are the dominant elements at their respective stages.
- Avoid carousels, promotional panels, ornamental mascots, and marketing landing-page patterns.
- Honor `prefers-reduced-motion`. Animation explains state only and must not delay an action.

## Government neutrality

It is acceptable to describe the intended installation location factually in internal deployment
documentation. Public UI must not claim “official government service,” “Ministry service,”
certification, endorsement, or legal authority unless separately approved. Avoid seals, flags,
official-looking crests, government color imitation, and agency domain styling.

## Voice

Use direct, respectful, plain language. Say what happened and provide exactly one safe next action.
Do not blame the visitor, expose implementation detail, or promise more privacy than the system can
technically establish.

Preferred:

- “This PDF is locked. Open it on your phone and save the required pages as screenshots.”
- “This service prints PDF, JPG, and PNG files only. Save the document as a PDF or take a clear
  screenshot.”
- “Printing service is temporarily unavailable. Error code: P-01. Your uploaded file has been
  deleted.”

Avoid:

- “Fatal error,” raw provider responses, stack traces, paths, or retry loops.
- “Ask an employee for help” as the default failure action.
- Requests that staff log in to KakaoTalk/email, enter a password, or search the visitor's phone.
- “Completely erased everywhere” or “the server can never see anything.”

When the visitor has no document, explain that the service cannot search, buy, or issue it and give
one action: contact the reservation holder, airline, or travel agency.

## Translation

All copy lives in translation resources with English fallback. Supported locales are English,
Korean, Simplified Chinese, Vietnamese, Mongolian, Thai, Russian, and Nepali. Machine translation
is a development placeholder only. Native-speaker review must cover accuracy, politeness,
line-breaking, screen-reader output, audio guidance, error instructions, and privacy/security
meaning before Production.
