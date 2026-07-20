# Device, accessibility, and native-language acceptance

Automated linting, axe checks, browser simulators, and machine-translated resources are development
evidence only. Production requires observed testing on supported phones and the target Windows
kiosk plus independent native-language review. Use synthetic documents and never capture a live QR,
URL fragment, signed URL, document preview, or provider credential in an attachment.

## Device matrix

At minimum test the oldest and newest institution-supported combinations:

- iPhone Safari on a small and current large viewport;
- Android Chrome on a small and current large viewport;
- target Windows 10/11 image, display scaling, screen, speakers, keyboard, and kiosk policy;
- cellular paths from at least two carriers while the desktop uses its production-like wired path.

For every combination run language selection, Photos/Gallery, Files/Downloads, KakaoTalk save help,
email save help, missing-document guidance, PDF/JPG/PNG preview, approve, progress, completion, QR
expiry/reuse, network loss, locked/damaged/oversize document, refresh/back, and reduced-motion paths.
Record OS/browser version, viewport/scaling, assistive technology, commit/deployment, tester, UTC time,
result, and sanitized issue link.

## Accessibility protocol

Run keyboard-only navigation and visible focus on every action. With VoiceOver, TalkBack, and the
target Windows screen reader, verify reading order, labels, selected language, step/progress changes,
error announcements, dialog/focus return, file-picker recovery, and completion. Verify at 200% text
zoom and 400% browser zoom/reflow where applicable, high contrast, portrait/landscape, large text,
reduced motion, speech unavailable, and muted audio. Text must remain sufficient without color,
icon, animation, or audio.

Measure the real rendered foreground/background colors and require WCAG 2.2 AA contrast: 4.5:1 for
normal text, 3:1 for large text and non-text controls/focus. Confirm 64px primary actions remain
usable, no horizontal scrolling blocks the task, no timed step expires without a clear recovery,
and the 30-second reminder does not trap or repeatedly interrupt assistive technology.

Any inaccessible file picker, unlabeled control, hidden focus, clipped translation, unannounced
blocking error, contrast failure, or inability to finish the primary flow is release-blocking.

## Native-language review

One qualified native reviewer per locale must review all visible text and speech in context:

| Locale  | Language   | Reviewer/sign-off required |
| ------- | ---------- | -------------------------- |
| `en`    | English    | Yes                        |
| `ko`    | 한국어     | Yes                        |
| `zh-CN` | 简体中文   | Yes                        |
| `vi`    | Tiếng Việt | Yes                        |
| `mn`    | Монгол     | Yes                        |
| `th`    | ไทย        | Yes                        |
| `ru`    | Русский    | Yes                        |
| `ne`    | नेपाली     | Yes                        |

Reviewers must confirm plain meaning, respectful neutral tone, action consistency, file-location
instructions, the exact `A4 한 부 인쇄` intent, no implication of government endorsement, no
promise the service cannot keep, correct response when the user lacks a phone/data/file, and
professional error recovery. Review at actual device widths; a string-level spreadsheet alone is
insufficient. Pre-recorded operational audio, if adopted, needs the same reviewer and a second
listening check on the target kiosk.

## Approval record

Acceptance is complete only when the product/accessibility owner and all eight language reviewers
sign a dated matrix tied to a commit and Preview deployment, every blocking issue is closed and
retested, and the target-device evidence is attached to the institution's private system of record.
No native-speaker or physical-device approval was available during the current implementation.
