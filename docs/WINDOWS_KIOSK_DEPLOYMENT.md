# Windows kiosk deployment

## Verification status

The initial development host was macOS arm64 without .NET or a physical printer. A workspace-local
.NET 8.0.423 SDK was later installed under ignored `work/`; it can run portable tests and
cross-target the WPF build/publish, but it cannot run WPF, Windows printer APIs, Shell Launcher, or
printer-driver tests. GitHub `windows-latest` is the required compilation/test/publish lane, but a
hosted runner is not evidence for the target desktop, printer, driver, spooler policy, audio, or
physical paper output.

The WPF shell now composes live server registration/polling, local QR rendering,
consume/direct-download/decrypt/validate/print-once, terminal reporting/cleanup, and 15-second
reset. That path has not been run on Windows, against approved provider resources, or with a
physical printer. The authenticated administrator screen now provides allow-listed installed-
printer selection with an atomic persisted choice, configured-printer status, a synthetic test
print, recovery acknowledgement, destructive active-session reset, restart, audio test, explicit
server/Redis/Blob/QStash status, and a bounded authenticated orphan sweep. Server and Redis values
are live endpoint/read checks. External Blob/QStash values are explicitly marked
`configured-unverified` because no side-effect-free provider probe is available; Preview fault
injection and target-Windows acceptance remain required.

## Supported baseline

- Institution-managed Windows 10 or Windows 11 x64 on a supported servicing release.
- A dedicated standard local/domain/Entra kiosk account with no administrative rights.
- One institution-approved, explicitly named printer and driver.
- Wired internet with exact allow-listed service endpoints and monitored time synchronization.
- Full-disk encryption, endpoint protection, current Windows/driver security patches, and an
  administrator account separate from the kiosk account.
- Self-contained `win-x64` application under `%ProgramFiles%\Paradiso\Print-cess Kiosk`.
- Application state/temp under the dedicated account's ACL-restricted
  `%LocalAppData%\Paradiso\PrintCess` location, never Downloads or Documents.

The projects target .NET 8 as required by the objective. Microsoft lists .NET 8 LTS end of support
as **2026-11-10** in its
[lifecycle table](https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-and-net-core).
Self-contained deployment does not extend security support. Approve and test migration to a
supported .NET target before that date; deployment with an unsupported runtime is prohibited.

## Build and package

On a clean Windows x64 build host:

```powershell
dotnet restore apps/kiosk/Paradiso.PrintCess.sln --locked-mode
dotnet build apps/kiosk/Paradiso.PrintCess.sln -c Release --no-restore
dotnet test apps/kiosk/Paradiso.PrintCess.Tests/Paradiso.PrintCess.Tests.csproj `
  -c Release --no-build `
  --logger "trx;LogFileName=print-cess-tests.trx" `
  --results-directory artifacts/test-results
dotnet publish apps/kiosk/Paradiso.PrintCess.Kiosk/Paradiso.PrintCess.Kiosk.csproj `
  -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true `
  -o artifacts/kiosk-win-x64
```

The Release workflow creates a ZIP and SHA-256 checksum. Production also requires Authenticode
signing by an institution-approved certificate, timestamping, malware scanning, and verification
on the target before install. Never distribute an unsigned “stable” build.

## WebView2

The native WPF kiosk does not require WebView2 unless a later feature explicitly introduces it. Do
not install it speculatively. If introduced, use Microsoft's
[WebView2 Runtime distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution):
detect the Runtime and deploy the Evergreen bootstrapper for online or standalone installer for
controlled/offline installation. Pin and test the WebView2 SDK, apply update policy, and reassess
the browser attack surface.

## HWPX direct printing

Direct HWPX printing is available only in the native Windows kiosk. The mobile browser sends the
original HWPX inside the existing encrypted envelope; the kiosk validates the package, writes it to
an application-owned temporary directory, asks an installed Hancom Office automation component to
render PDF, validates the generated PDF, prints it through the existing fixed policy, and clears
both temporary files. The public browser kiosk does not claim or emulate HWPX printing.

Before enabling the capability:

1. Install an institution-approved Hancom Office version that registers `HWPFrame.HwpObject`.
2. Obtain, install, and register Hancom's file-path security module under the kiosk account.
3. Set `PRINT_CESS_HANCOM_SECURITY_MODULE` to the registered module name. The kiosk advertises HWPX
   in its QR only when both the COM component and this setting are present.
4. Confirm with Hancom that the institution's automation and redistribution use is licensed and
   approved. Personal-use automation terms must not be assumed to cover an institutional kiosk.
5. Test representative synthetic HWPX files containing tables, images, page breaks, headers,
   footers, and required fonts. Compare page count, wrapping, clipping, grayscale output, and
   margins against interactive Hancom Office output on the same machine.

HWPX files larger than 10 MiB, malformed or encrypted packages, unsafe archive paths, excessive
expansion ratios, scripts, and prohibited embedded objects fail closed. A missing Hancom component,
security module, font, or PDF output also fails the session without falling back to a third-party
conversion service.

## Printer provisioning

1. Install the approved vendor driver through institutional software management.
2. Give every approved queue a stable name, set `PRINT_CESS_PRINTER_NAME` to the exact default, and
   put any additional approved exact names in `PRINT_CESS_ALLOWED_PRINTERS`. Remove virtual or
   unapproved queues rather than adding them to the allow-list.
3. Remove/deny unapproved queues, “Print to PDF,” OneNote, fax, and virtual/cloud printers for the
   kiosk account.
4. Confirm `PrintQueue` status and `PrintCapabilities` behavior. The
   [WPF printing overview](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/documents/printing-overview)
   documents `PrintTicket`/`PrintCapabilities` and the XPS/GDI paths, but the target driver decides
   constraints and conversion behavior.
5. Verify A4, one copy, simplex, monochrome, fit-to-page, all pages, no dialog, and only the named
   queue for PDF/JPEG/PNG fixtures.
6. Confirm behavior for offline, unplugged, out of paper, paused, jam/error, driver restart, spooler
   restart, application crash before/during/after submission, and power loss.
7. Inspect Windows spool/job history, driver cache, printer disk/firmware job retention, and page
   file/crash dump behavior under the institution's privacy policy.

If the driver cannot reliably enforce any fixed setting or report state, deployment is blocked.
“Submitted to queue” and “physically printed” are distinct observations. An unknown submission is
never automatically retried.

## Kiosk lockdown

Microsoft's [Assigned Access overview](https://learn.microsoft.com/en-us/windows/configuration/assigned-access/)
limits its single-app kiosk experience to UWP applications or Microsoft Edge. For this unpackaged
WPF desktop application, the preferred single-app mechanism is therefore **Shell Launcher v2** on
a supported edition. Microsoft documents support on Enterprise, Education, and IoT Enterprise and
warns that Shell Launcher itself does not block every other application/component:
[Shell Launcher overview](https://learn.microsoft.com/en-us/windows/configuration/shell-launcher/).

Configure Shell Launcher through the Assigned Access CSP/MDM or approved provisioning process:

1. Finish Windows OOBE and patch the device before enabling the custom shell.
2. Install and verify the signed application as administrator.
3. Create the non-admin kiosk identity and a separate service administrator identity.
4. Enable/configure Shell Launcher for the kiosk identity only. Use the full executable path.
5. Set the default exit action to restart the shell. Define a documented exit code for restart
   device only when the app intentionally requests it.
6. Sign out/in and test normal exit, crash, hang/watchdog, Windows update restart, and loss of
   network/printer.

Microsoft's
[configuration guide](https://learn.microsoft.com/en-us/windows/configuration/shell-launcher/configure)
documents CSP/WMI/provisioning options and restart-device/restart-shell exit actions. Shell Launcher
is edition-dependent and cannot be configured before OOBE.

Defense in depth, subject to Windows edition and policy approval:

- [AppLocker](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/applocker-overview)
  or Windows Defender Application Control allow-list; Microsoft describes AppLocker as defense in
  depth, so use the stronger control when institutional policy requires it;
- GPO/MDM restrictions for Settings, Task Manager, Run, removable media, clipboard, notifications,
  screen capture, browser launch, and unauthorized executables;
- [Keyboard Filter](https://learn.microsoft.com/en-us/windows/configuration/keyboard-filter/) on
  supported editions for escape combinations, with a documented administrator maintenance path;
- firewall egress allow-list and inbound deny;
- disable ordinary crash dumps or protect/expire them; configure page file and hibernation policy;
- [Unified Write Filter](https://learn.microsoft.com/en-us/windows/configuration/unified-write-filter/)
  only after proving update, logging, printer, and cleanup exclusions. It changes servicing and
  update behavior and is not a substitute for application deletion.

The target Windows edition is unknown. Windows Pro must not be assumed to support Shell Launcher.
If Enterprise/Education/IoT Enterprise is unavailable, security engineering must approve a tested
restricted-user alternative before deployment.

## Runtime configuration

Set machine/account-protected variables or an approved configuration store:

- `PRINT_CESS_ENVIRONMENT=Production`: exact environment marker; only the exact value
  `Development` can authorize the simulator;
- `PRINT_CESS_SERVER_BASE_URL`: exact approved HTTPS origin;
- `PRINT_CESS_KIOSK_REGISTRATION_SECRET`: device-specific secret, rotated on reimage/transfer;
- `PRINT_CESS_PRINTER_NAME`: exact approved queue;
- `PRINT_CESS_ALLOWED_PRINTERS`: optional comma-separated additional approved installed queues,
  never wildcards; the configured default is always included;
- `PRINT_CESS_ADMIN_PASSWORD_HASH`: salted modern hash, never a plaintext/hard-coded password;
- `PRINT_CESS_ADMIN_API_SECRET`: independent random server administrator secret (at least 32
  characters) for `/api/admin/health` and the bounded `/api/cleanup` sweep; protect it separately
  from the local administrator password hash;
- `PRINT_CESS_USE_MOCK_PRINT_ENGINE=false` for every Production installation;
- `PRINT_CESS_ALLOWED_BLOB_HOSTS`: comma-separated exact DNS hostnames that may serve the signed
  encrypted-Blob GET for this environment. Do not include schemes, paths, credentials, or wildcard
  entries, and do not copy Preview hosts into Production.

The implemented administrator credential format is
`pbkdf2-sha256$<iterations-at-least-210000>$<base64url-salt-at-least-16-bytes>$<base64url-32-byte-hash>`.
Provision it through protected machine configuration and rotate it under the institutional access
policy.

The selected queue is stored atomically under the app-owned
`%LocalAppData%\Paradiso\PrintCess\printer-selection.json`. At startup it is accepted only when the
exact queue is still installed and present in the environment allow-list; otherwise the configured
default is used or startup fails closed. Changing the queue cancels/cleans a waiting session and
creates a fresh QR. The action is rejected after encrypted content has been consumed.

Mock printing defaults off and requires all three conditions: the literal opt-in value `true`,
`PRINT_CESS_ENVIRONMENT=Development` with exact casing, and a loopback server URL. The app fails
closed when the server URL is missing/non-HTTPS (except loopback development), when a real printer
name is missing, or when no encrypted-Blob host is allow-listed for a non-loopback server. It also
rejects a signed download URL outside that list, a URL containing user information, and every
server-supplied GET header. Production installation policy and acceptance must reject mock opt-in,
a missing registration secret, an unapproved origin/Blob host, or an absent configured printer.
Do not store secrets in a world-readable JSON file, command line, shortcut, or support screenshot.

## Startup, recovery, and health

- Shell Launcher starts/restarts the app. A separate institution-approved watchdog may restart a
  hung process but must never resubmit a print.
- On every startup, delete app-owned temp remnants, discard unrecoverable session/key state, request
  server cleanup if safely identifiable, and show a fresh QR.
- Do not persist plaintext, private keys, signed URLs, or a recoverable print payload.
- A session found as `consumed`, `validating`, or `printing` after crash is failed/cleaned; it is not
  printed again.
- Use Windows Event Log or approved telemetry with stable redacted codes only.
- Keep Windows time synchronized because token/URL expiry and TLS depend on it.
- The administrator health refresh calls `/api/admin/health` with the independently provisioned
  server secret. Treat `ready` server/Redis results as live checks, but treat external Blob/QStash
  `configured-unverified` only as configuration evidence. Use the capped 25-record WPF orphan
  sweep during approved operations; it never lists object/session identifiers.

## Installation acceptance checklist

- [ ] Exact Windows edition/build and patch level recorded and supported.
- [ ] .NET target still supported; migration plan approved before 2026-11-10.
- [ ] Authenticode signature and SHA-256 checksum verified.
- [ ] Standard kiosk account; separate administrator; no embedded secret.
- [ ] Shell/allow-list/keyboard/removable-media/firewall policies escape-tested.
- [ ] Mock engine demonstrably disabled.
- [ ] Environment marker is `Production`; exact server origin and Blob download hostname allow-list
      are captured from the approved Production resources and contain no wildcard/Preview host.
- [ ] Exact printer model, firmware, queue, driver, connection, and defaults recorded.
- [ ] All fixed print settings and fault cases pass with synthetic fixtures.
- [ ] No print dialog, alternate queue, external PDF action, or desktop escape.
- [ ] Spooler/driver/printer retention policy reviewed and tested.
- [ ] Startup/crash/update/network/power recovery produces no duplicate print or prior-user screen.
- [ ] Audio, QR readability, 15-second reset, and administrator authentication pass on hardware.
- [ ] Live WPF registration, local QR, claim/status, consume, direct Blob download, decrypt,
      validate, print-once, terminal report, cleanup, and destructive admin reset pass end to end.
- [ ] Cleanup works during injected server/Blob/QStash failure and after recovery.

## Updates and rollback

Deploy through institution-managed software distribution during a service window. Quiesce the
kiosk, let or force active sessions to terminal cleanup, then install. Verify signature, checksum,
configuration, printer, server health, and one synthetic test print before returning to service.

Keep the last signed approved package and configuration. Rollback only while the kiosk is out of
service; never recover or replay an old session. Revoke/rotate credentials if the rollback relates
to compromise. Record application version, protocol version, Windows build, printer driver, policy
revision, operator, and outcome.
