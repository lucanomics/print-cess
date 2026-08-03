#!/bin/bash

set -euo pipefail

readonly production_origin="https://paradiso-print-cess-web.vercel.app"
readonly production_kiosk_url="${production_origin}/kiosk?printing=auto"
readonly default_profile_dir="${HOME}/Library/Application Support/Paradiso Print-cess Kiosk/Chrome"

mode="run"
case "${1:-}" in
  "") ;;
  --check) mode="check" ;;
  --help|-h)
    printf '%s\n' "Usage: $0 [--check]"
    exit 0
    ;;
  *)
    printf 'Unknown option: %s\n' "$1" >&2
    exit 64
    ;;
esac

kiosk_url="${PRINT_CESS_KIOSK_URL:-$production_kiosk_url}"
case "$kiosk_url" in
  "$production_kiosk_url") ;;
  *)
    if [[ "${PRINT_CESS_ALLOW_CUSTOM_URL:-0}" != "1" ]]; then
      printf 'Refusing non-Production kiosk URL: %s\n' "$kiosk_url" >&2
      exit 78
    fi
    ;;
esac

chrome_binary="${PRINT_CESS_CHROME_BINARY:-}"
if [[ -z "$chrome_binary" ]]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "${HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if [[ -x "$candidate" ]]; then
      chrome_binary="$candidate"
      break
    fi
  done
fi
if [[ -z "$chrome_binary" || ! -x "$chrome_binary" ]]; then
  printf '%s\n' "Google Chrome was not found. Install it in /Applications before enabling the kiosk." >&2
  exit 69
fi

default_printer="${PRINT_CESS_DEFAULT_PRINTER:-}"
if [[ -z "$default_printer" ]]; then
  lpstat_binary="${PRINT_CESS_LPSTAT_BINARY:-/usr/bin/lpstat}"
  printer_line="$("$lpstat_binary" -d 2>/dev/null || true)"
  if [[ "$printer_line" != *:* ]]; then
    printf '%s\n' "No explicit default printer is configured." >&2
    printf '%s\n' 'Set one in System Settings > Printers & Scanners, then verify with `lpstat -d`.' >&2
    exit 78
  fi
  default_printer="${printer_line#*: }"
fi

health_url="${kiosk_url%%\?*}"
if [[ "$health_url" != */kiosk ]]; then
  health_url="${health_url%/}/kiosk"
fi
if [[ "${PRINT_CESS_SKIP_NETWORK_CHECK:-0}" != "1" ]]; then
  if ! /usr/bin/curl --fail --silent --show-error --head --max-time 15 "$health_url" >/dev/null; then
    printf 'The live kiosk is not reachable: %s\n' "$health_url" >&2
    exit 69
  fi
fi

profile_dir="${PRINT_CESS_CHROME_PROFILE_DIR:-$default_profile_dir}"
command=(
  "$chrome_binary"
  "--user-data-dir=$profile_dir"
  --kiosk
  --kiosk-printing
  --no-first-run
  --no-default-browser-check
  --disable-session-crashed-bubble
  "$kiosk_url"
)

printf 'Kiosk URL: %s\n' "$kiosk_url"
printf 'Default printer: %s\n' "$default_printer"
printf 'Chrome profile: %s\n' "$profile_dir"
printf 'Launch command:'
printf ' %q' "${command[@]}"
printf '\n'

if [[ "$mode" == "check" ]]; then
  printf '%s\n' "Preflight passed. No browser was started."
  exit 0
fi

/bin/mkdir -p "$profile_dir"
exec "${command[@]}"
