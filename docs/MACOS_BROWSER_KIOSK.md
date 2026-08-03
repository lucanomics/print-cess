# macOS browser kiosk

The Production web kiosk already invokes the browser print API after a document is decrypted and
validated. A normal browser deliberately asks for confirmation. The managed macOS station removes
that interaction by launching Google Chrome with both `--kiosk` and `--kiosk-printing` against the
fixed Production origin.

Chromium defines `--kiosk-printing` as automatically accepting the print preview. It prints to the
default printer with that printer's saved defaults. The application cannot select a printer, paper
tray, duplex mode, or color mode from JavaScript.

## One-time station setup

1. Install current Google Chrome in `/Applications`.
2. Add the approved printer in **System Settings > Printers & Scanners**.
3. Set that device as the explicit default printer. Do not leave the setting at “Last Printer
   Used” and do not select “Save as PDF”. Verify it in Terminal:

   ```bash
   lpstat -d
   ```

   If necessary, list queues with `lpstat -p` and set the approved queue with:

   ```bash
   lpoptions -d "APPROVED_QUEUE_NAME"
   ```

4. From the repository, run the non-mutating preflight:

   ```bash
   ./scripts/kiosk/install-browser-kiosk-macos.sh --check
   ```

5. Install and start the per-user LaunchAgent:

   ```bash
   ./scripts/kiosk/install-browser-kiosk-macos.sh --install
   ```

The installer copies the launcher under the kiosk account's Application Support directory, creates
`com.paradiso.print-cess.browser-kiosk`, and starts it immediately. At each login it opens only the
managed `/kiosk?printing=auto` URL in a dedicated Chrome profile. That mode hides the manual
reprint control after submission to prevent an accidental duplicate silent print. `KeepAlive`
restarts Chrome after a crash or ordinary exit.

## Operations

```bash
# Inspect the LaunchAgent and last exit status
./scripts/kiosk/install-browser-kiosk-macos.sh --status

# Maintenance window
./scripts/kiosk/install-browser-kiosk-macos.sh --stop

# Return the station to service
./scripts/kiosk/install-browser-kiosk-macos.sh --start

# Remove auto-start while preserving the dedicated Chrome profile
./scripts/kiosk/install-browser-kiosk-macos.sh --uninstall
```

Logs are written to `~/Library/Logs/Paradiso Print-cess Kiosk/`. The dedicated browser profile is
kept outside the visitor's personal Chrome profile. Recovery downloads are intentionally not
deleted by automation; the site operator clears the kiosk account's Downloads folder manually
under the agreed local procedure.

## Acceptance test

Use a synthetic one-page PNG and a synthetic two-page PDF. For each document verify:

- the phone moves from upload to completion;
- no print confirmation remains on screen;
- exactly one job reaches the approved printer;
- page count, A4 scaling, orientation, color, and duplex settings match the approved defaults;
- Chrome returns to a new QR after 60 seconds;
- **Open print dialog again** is not used after a successful automatic print because it would
  intentionally submit another job;
- **Download file** works only as the operator-approved recovery action.

If Chrome shows a print dialog, stop the station and inspect the LaunchAgent command with `--status`.
Do not add `--disable-print-preview`; silent kiosk printing relies on Chrome's print preview path.
