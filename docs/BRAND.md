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

The product is calm civic-service infrastructure: clear, steady, accessible, and neutral. The
name's wordplay may appear once in the primary mark through a compact tiara-shaped paper edge,
but it must remain readable first as a printer. Do not add castles, princess characters, ornate
scripts, glitter effects, luxury motifs, or an excess of pink. Decoration never competes with the
next action.

Current code tokens are the canonical starting palette:

| Role           | Token                          | Value                 |
| -------------- | ------------------------------ | --------------------- |
| Primary ink    | `--pc-ink`                     | `#071737`             |
| Body text      | `--pc-text`                    | `#23314c`             |
| Muted text     | `--pc-muted`                   | `#5c6880`             |
| Action teal    | `--pc-teal`                    | `#008a8a`             |
| Dark teal      | `--pc-teal-dark`               | `#006f72`             |
| Soft teal      | `--pc-teal-soft`               | `#e3f5f4`             |
| Warm paper     | `--pc-paper-warm`              | `#fff8ea`             |
| Border         | `--pc-line`                    | `#d9e5ed`             |
| Surface/subtle | `--pc-surface` / `--pc-subtle` | `#ffffff` / `#f4f8fa` |
| Error/success  | `--pc-error` / `--pc-success`  | `#a72c35` / `#087a57` |
| Focus          | `--pc-focus`                   | `#f5b700`             |

Use a system sans-serif stack with Inter, Pretendard, or Noto Sans where licensed and available.
Body copy is at least 18 px, primary controls at least 64 px high, and focus indication is obvious.
Color never carries meaning alone. Test contrast in every state.

## Wordmark and icon

The primary mark combines a rounded printer with a raised sheet whose top edge forms three small
points. This is the only princess reference: it should read as useful equipment before it reads as
a tiara. The warm paper fill adds a restrained playful note without changing the civic-service
palette.

The wordmark places the icon before “Print-cess” in strong weight and “by Paradiso” in a quieter
weight. The hyphen may use action teal as a small visual wink. Give the complete group the
accessible name “Print-cess by Paradiso”; decorative icon paths are hidden from assistive
technology.

Use `docs/assets/print-cess-mark.svg` for documentation and repository surfaces. The web app's
file-based icon lives at `apps/web/src/app/icon.svg`; the shared React mark is implemented in
`packages/ui/src/index.tsx`. Keep these variants visually synchronized.

Do not use the Ministry of Justice, Jeju Immigration Office, another public agency, airline, or
travel-service logo without written permission.

## Layout and motion

- One screen, one clear decision; no more than two primary/secondary actions.
- Generous whitespace, short sentences, visible progress, and paired icon/text labels.
- A help control stays in the phone header on every step. It explains the current screen in the
  chosen language, can be read aloud, and never counts against the two-action limit.
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

Write for a visitor who has never used a kiosk, may read slowly, and is standing in a queue. One
idea per sentence, one action per line, everyday words instead of product vocabulary. Say “the big
screen” rather than “the kiosk”, “locked” rather than “encrypted”, and name the button the visitor
must press using the exact words printed on it.

Preferred:

- “This PDF has a password. Open it on your phone and take a screenshot of the pages you need.”
- “You can print PDF, JPG and PNG only. Save your page as a PDF, or take a clear screenshot.”
- “Printing service is temporarily unavailable. Error code: P-01. Your uploaded file has been
  deleted.”

Avoid:

- “Fatal error,” raw provider responses, stack traces, paths, or retry loops.
- “Ask an employee for help” as the default or only failure action. It may appear as a closing
  line in the help sheet, after the screen has already given a concrete next step.
- Requests that staff log in to KakaoTalk/email, enter a password, or search the visitor's phone.
- “Completely erased everywhere” or “the server can never see anything.”
- Referring to a control by its color, position alone, or an English product term the visitor has
  no reason to know.

When the visitor has no document, explain that the service cannot search, buy, or issue it and give
one action: contact the reservation holder, airline, or travel agency.

## Translation

All copy lives in `packages/i18n` with English fallback, and English is the source of truth: a
locale that is missing a key fails the build. Supported locales are English, Korean, Simplified
Chinese, Bahasa Indonesia, Filipino, Vietnamese, Thai, Nepali, Khmer, Arabic, Russian, Mongolian,
and Ukrainian. No locale may keep its wording in a separate override layer; every language is
edited and reviewed in the same table so a change to one is visible against all the others.

Machine translation is a development placeholder only. Native-speaker review must cover accuracy,
politeness, line-breaking, screen-reader output, error instructions, the plain-
language help sheet, and privacy/security meaning before Production.

The shared kiosk display keeps Korean and English on screen permanently and rotates the single
scan instruction through the remaining eleven languages, so the display stays readable while every
supported visitor still sees their own language.
