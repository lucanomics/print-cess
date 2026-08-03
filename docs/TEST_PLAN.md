# Test plan

## Rules

Use only generated, obviously synthetic documents. No real name, booking, flight, passport,
immigration, email, phone, or other personal data may enter fixtures, local storage, Preview, CI,
artifacts, screenshots, or logs.

Tests distinguish four evidence levels:

1. local macOS/Linux platform-independent behavior;
2. GitHub hosted Windows WPF/build/mock behavior;
3. approved credential-backed Preview provider behavior;
4. target Windows device plus exact physical printer/driver behavior.

Evidence from one level must not be reported as another. In particular, `windows-latest` has no
physical printer.

## Synthetic fixture catalog

Generate and label each page “SYNTHETIC TEST DOCUMENT — NOT VALID”:

- one-page fake ticket PDF;
- two-page fake reservation confirmation PDF;
- JPEG and PNG fake ticket screenshots;
- 11-page PDF;
- password-protected PDF;
- damaged/truncated PDF;
- non-PDF renamed `.pdf`;
- exactly 10 MiB plaintext boundary file and one-byte-over boundary file;
- image with excessive dimensions/pixel budget;
- malformed/truncated JPEG and PNG;
- PDF with prohibited JavaScript/OpenAction/Launch/attachment/external-link structures where the
  fixture generator can safely construct them.

Fixtures use fictitious values that cannot be mistaken for a real traveler or valid reservation.

## TypeScript unit tests

| Area            | Required cases                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| State machine   | Every allowed edge, every unlisted edge rejected, terminal immutability, revision conflict                                         |
| Tokens          | CSPRNG length/encoding, independent token values, SHA-256 storage, malformed input, timing-safe equality including unequal lengths |
| Time            | waiting TTL, claim work deadline, exact expiry boundary, signed URL capped by session expiry, clock-skew handling                  |
| Envelope        | exact offsets/endianness/lengths, 10 MiB maximum, truncation/trailing bytes, flags/reserved/version/kind rejection                 |
| Cryptography    | P-256 ECDH, HKDF info/salt, AES-GCM round trip, fingerprint validation, best-effort secret buffer clearing                         |
| Tamper          | one byte in header/public key/salt/IV/ciphertext/tag, wrong session/fingerprint/kiosk key                                          |
| File validation | magic/type mismatch, size, PDF pages/encryption/parse/actions, image decode/dimensions/resource budget                             |
| Stores          | claim race, upload-once, consume-once, completed-not-reactivated, expiration                                                       |
| Cleanup         | terminal seal/finalize, delete failure, lost session, conditional ETag, lease race, due orphan sweep, schedule retry/dedup         |
| Logging         | tokens, fragments, filenames, signed URLs, keys, identifiers, and provider bodies are redacted                                     |

## C# unit tests

- protocol DTO/status values and transition rejection;
- exact envelope parser offsets, checked length arithmetic, maximum allocation, and unknown fields;
- raw SEC1 P-256 import/export, ECDH, HKDF-SHA-256, AES-256-GCM, and AAD construction;
- all tamper/AAD/key/version failures before file validation;
- file magic/type/size/PDF/image policy and malformed/adversarial fixtures;
- `IPrintEngine` contract, fixed `PrintSettings`, session idempotency, and
  `MockPrintEngine` artifact;
- printer status mapping and unsupported capabilities without a dialog;
- bounded API responses plus committed download size/ETag enforcement;
- recovery from every session state, especially no resubmit for consumed/validating/printing,
  24-hour resolved-record pruning, and authenticated recovery acknowledgement;
- buffer/temp cleanup on success, validation failure, print failure, cancellation, and startup.

Tests that invoke `WindowsPrintEngine` without a real configured printer are contract/smoke tests
only.

## TypeScript/C# interoperability

Use the committed immutable `packages/test-fixtures/vectors/protocol-v1.json` vector with fixed
kiosk/mobile keys, salt, IV, synthetic plaintext, session, fingerprint, header, derived key,
ciphertext/tag, and envelope digest:

1. TypeScript generates bytes that exactly equal the vector and C# decrypts them.
2. C# generates/loads the same bytes and TypeScript decrypts them.
3. Both calculate the same fingerprint, shared secret, derived key, 135-byte header, AAD, envelope,
   and envelope SHA-256.
4. Both reject each tamper, wrong AAD/key, invalid SEC1 point, length error, and protocol version.

Do not make a test pass by accepting two layouts or normalizing malformed data.

## API integration tests

Run through public interfaces with the memory/local adapters:

- kiosk session create with independent raw tokens returned once;
- public status view omits keys, hashes, path, ETag, and credentials;
- first claim wins under concurrency; repeated/second-phone claim conflicts;
- authorization reserves one random non-filename path and safely replays one deduplicated cleanup
  deadline after a failed/lost scheduling acknowledgement;
- ciphertext goes direct to mock/local Blob, never through a Route Handler;
- upload completion compares the expected size, commits provider-authoritative size/ETag, and rejects
  replacement/oversize;
- consume returns one GET authorization and repeated consume conflicts;
- invalid/expired/cancelled/terminal sessions cannot advance;
- cleanup verifies authorization/signature boundary, is idempotent, and handles every race/failure;
- strict CORS, no-store, schema/body limits, timeouts/rate limits, and sanitized errors;
- demo/admin disabled under Production configuration.

With approved Preview credentials, repeat the atomicity tests against Upstash and the signed URL
scope/expiry/replay/ETag suite against Vercel Blob 2.6.1. QStash tests use genuine signed delivery.
Skip with an explicit “credentials unavailable” result rather than silently passing.

## Playwright E2E

At minimum:

- all eight language selections and English fallback;
- Photos/Gallery, Files/Downloads, KakaoTalk save guidance, Email save guidance, and no-document
  route;
- PDF/JPEG/PNG selection, local preview, summary, one A4-copy approval;
- local encryption/direct upload, kiosk simulator state sequence, completion, deletion, 15-second
  reset;
- QR expiry/reuse/second phone, missing fragment, fingerprint mismatch;
- cancel, back, refresh, duplicate tap, connection interruption/recovery;
- locked/damaged/11-page/unsupported/oversized/excess-dimension files;
- iPhone-like and Android-like viewports and current Safari/Chrome manual spot check;
- keyboard-only navigation, focus visibility, labels/name/role, progress announcement, contrast
  check, reduced motion, 30-second reminder, audio unavailable/replay;
- no admin link in public UI and Production demo-route denial;
- no token/signed URL in page URL after fragment consumption, console, trace, screenshot name, or
  application log.

Automated Playwright runs disable raw trace and screenshot capture because network bodies and QR
images contain short-lived credentials. CI uploads only the HTML report and assertion output; use a
fresh disposable local session for explicitly requested visual debugging and never upload that raw
capture.

## GitHub Windows CI

`.github/workflows/ci.yml` must run:

```powershell
pwsh -NoProfile -File scripts/windows/Test-AcceptancePolicy.ps1
dotnet restore apps/kiosk/Paradiso.PrintCess.sln --locked-mode
dotnet build apps/kiosk/Paradiso.PrintCess.sln -c Release --no-restore
dotnet test apps/kiosk/Paradiso.PrintCess.Tests/Paradiso.PrintCess.Tests.csproj `
  -c Release --no-build `
  --logger "trx;LogFileName=print-cess-tests.trx" `
  --results-directory artifacts/test-results
dotnet publish apps/kiosk/Paradiso.PrintCess.Kiosk/Paradiso.PrintCess.Kiosk.csproj `
  -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -o artifacts/kiosk-win-x64
```

Upload TRX even when tests fail; upload publish output only after successful build/test/publish.
Check that Production configuration cannot activate `MockPrintEngine`. A hosted runner has no
physical-printer acceptance value.

## Physical printer and kiosk acceptance

Record desktop asset, Windows edition/build, app/protocol version, printer model/firmware, driver/
queue version, connection, policies, operator, and date. With synthetic fixtures:

- every supported type/page range and fixed print setting;
- fit/crop/orientation/readability against expected output;
- offline, paper-out, paused, jam, disconnect, queue rejection, driver/spooler restart;
- crash/power loss before consume, during download/decrypt/validate, before submit, ambiguous submit,
  after submit, completion, and cleanup;
- one job at most under double click, duplicated API requests, app restart, and staff action;
- spool files/job history/printer storage, temp directory, crash dump/page file, and prior-user UI;
- QR readability, mobile data flow, audio, 15-second reset, admin authentication, and kiosk escape;
- authenticated printer selection/status, synthetic print, active server/Redis/Blob/QStash health,
  recovery acknowledgement, force-discard, bounded orphan sweep, restart, redacted diagnostics,
  and audio-test actions;
- network/provider outage and later orphan cleanup.

Do not auto-retry an ambiguous job during testing. Count physical sheets and inspect the queue before
starting a new session.

## Commands

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:workflow
pnpm test:acceptance-evidence
pnpm test:integration
pnpm build
pnpm --filter @print-cess/web exec playwright install --with-deps chromium webkit
pnpm test:e2e
```

The repository selects Node.js 24.18.0 and pnpm 11.15.1 in CI. The initial local host had Node.js
24.14.0, pnpm 11.9.0, and no .NET SDK. A workspace-local .NET 8.0.423 SDK was subsequently
installed under ignored `work/`; portable tests and cross-target compilation/publish from macOS
must still be distinguished from Windows runtime and physical-printer evidence.

## Release exit criteria

- All deterministic suites pass on the pinned toolchain.
- Cross-language vector is byte-identical and all negative cases fail closed.
- Windows CI build/test/publish succeeds with uploaded evidence.
- Approved Preview signed URL/Redis/QStash tests pass or Production remains blocked.
- Exact physical printer/kiosk acceptance passes or Production remains blocked.
- Signed candidates and target-device evidence agree on the manifest digest, release tag/commit,
  executable hash/version, exact approved signer thumbprint, and timestamp certificate.
- No real data, forbidden brand string, token, signed URL, filename, or sensitive log field appears
  in repository or artifacts.
- Security/privacy reviewers accept remaining risks and rollback/incident procedures are exercised.

## External readiness evidence policy

Run `pnpm test:acceptance-evidence` in CI to exercise the dossier contract with synthetic positive
and adversarial cases. Before go/no-go, run
`pnpm validate:readiness-evidence --input <private-readiness-dossier.json>` on the institution's
sanitized export. The validator must reject missing native GitHub controls, release/deployment drift,
incomplete physical/accessibility/language matrices, observer conflicts, unsafe evidence fields,
missed recovery objectives, and approval timestamps that predate their evidence. A passing policy
test is not a passing real dossier.
