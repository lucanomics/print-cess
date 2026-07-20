# Print-cess by Paradiso Kiosk

The Windows client for **Print-cess by Paradiso** is split into four projects:

- `Paradiso.PrintCess.Core` is portable `net8.0` code for protocol v1, cryptography, validation, print policy, idempotency, and contracts.
- `Paradiso.PrintCess.Infrastructure` targets both `net8.0` and `net8.0-windows10.0.19041.0`. The Windows target adds `Windows.Data.Pdf`, WPF/XPS, and `System.Printing` integration.
- `Paradiso.PrintCess.Kiosk` is the Windows 10/11 WPF shell.
- `Paradiso.PrintCess.Tests` is a portable xUnit suite. It hard-requires the shared TypeScript known-answer vector at `packages/test-fixtures/vectors/protocol-v1.json`.

## Safety invariants

- Production composition must wrap the platform engine in `IdempotentPrintEngine`. Its durable journal marker is written before the platform engine is invoked.
- Startup recovery marks unresolved or submitted work `RecoveryBlocked`; it never replays a print automatically.
- `WindowsPrintEngine` uses only the configured printer, validates a conflict-free A4/one-copy/one-sided/grayscale ticket, renders content to A4 itself for fit-to-page, and never opens a print dialog.
- `MockPrintEngine` requires explicit opt-in and writes metadata-only JSON artifacts, never document content.
- Plaintext document buffers, ECDH shared secrets, AES keys, and test private scalars are cleared when their owners are disposed.
- The admin chord is authenticated through `IAdminAuthenticator`. The WPF app reads `PRINT_CESS_ADMIN_PASSWORD_HASH`; there is no default password.

The administrator credential format is:

```text
pbkdf2-sha256$<iterations-at-least-210000>$<base64url-salt-at-least-16-bytes>$<base64url-32-byte-hash>
```

Provision it through protected machine configuration. Do not place the credential in source control or ordinary logs.

The production composition also requires `PRINT_CESS_SERVER_BASE_URL`,
`PRINT_CESS_KIOSK_REGISTRATION_SECRET`, `PRINT_CESS_PRINTER_NAME`, and the independent
`PRINT_CESS_ADMIN_API_SECRET` used only for authenticated server health and cleanup requests.
`PRINT_CESS_ALLOWED_PRINTERS` is a comma-separated allow-list of additional institution-approved
installed queues; the configured default printer is always included. Printer choices outside this
exact allow-list are never shown or accepted.
`PRINT_CESS_USE_MOCK_PRINT_ENGINE=true` is an explicit development-only opt-in and replaces the printer name with a metadata-only mock target.

The WPF runtime creates a fresh ephemeral P-256 key and server session, renders the QR locally, polls the kiosk status endpoint, consumes the encrypted blob exactly once, validates its size and ETag, decrypts and validates the document in memory, and submits it through the durable print gate. No remote QR service receives the fragment token or fingerprint.

After authenticated access, the admin screen exposes safe runtime status; approved installed-printer
selection and persisted choice; a synthetic test page; recovery acknowledgement; current-session
discard; restart; and audio test. A printer change first cancels/cleans a waiting session and rotates
to a fresh QR, and is blocked once encrypted content has been consumed.

The screen calls the authenticated `/api/admin/health` endpoint and displays server, Redis/session
store, Blob, and QStash/cleanup separately. Server and Redis `ready` values are live endpoint/read
checks. External Blob and QStash `configured-unverified` values only confirm server configuration;
they are deliberately not presented as provider reachability because a side-effect-free provider
probe is unavailable. The bounded orphan-sweep button calls `/api/cleanup` for at most 25 due
records per operator action; the server additionally rejects limits above 100. Neither response
nor the UI includes document identifiers, filenames, tokens, keys, or signed URLs.

## Commands

```powershell
dotnet build apps/kiosk/Paradiso.PrintCess.sln -c Release
dotnet test apps/kiosk/Paradiso.PrintCess.Tests/Paradiso.PrintCess.Tests.csproj -c Release
dotnet publish apps/kiosk/Paradiso.PrintCess.Kiosk/Paradiso.PrintCess.Kiosk.csproj `
  -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true `
  -o artifacts/kiosk-win-x64
```

Cross-target compilation on macOS or Linux is not physical printer validation. Before deployment, run the Windows CI job and manually test the exact printer model, driver ticket behavior, spooler retention policy, offline/out-of-paper states, PDF rendering, image rendering, and crash timing on the target machine.
