#!/bin/bash

set -euo pipefail

readonly production_origin="https://paradiso-print-cess-web.vercel.app"
readonly production_kiosk_url="${production_origin}/kiosk?printing=auto"
readonly default_profile_dir="${HOME}/Library/Application Support/Paradiso Print-cess Kiosk/Chrome"

mode="run"
case "${1:-}" in
  "") ;;
  --check) mode="check" ;;
  --reset-profile) mode="reset-profile" ;;
  --help|-h)
    printf '%s\n' "Usage: $0 [--check|--reset-profile]"
    exit 0
    ;;
  *)
    printf 'Unknown option: %s\n' "$1" >&2
    exit 64
    ;;
esac

# The dedicated profile is application-owned scratch space: it accumulates the
# browsing history, cache and cookies of every visitor who used the station.
# Deleting it is the only way this project can clear a browser history, so the
# path is checked before anything is removed. A typo must not reach a home
# directory.
assert_disposable_profile_dir() {
  local dir="${1%/}"

  if [[ -z "$dir" || "$dir" != /* ]]; then
    printf 'Refusing to reset a Chrome profile path that is not absolute: %s\n' "$1" >&2
    exit 78
  fi
  if [[ "$dir" == "${HOME%/}" ]]; then
    printf '%s\n' "Refusing to reset the home directory as a Chrome profile." >&2
    exit 78
  fi

  local depth
  depth="$(printf '%s' "$dir" | /usr/bin/tr -cd '/' | /usr/bin/wc -c | /usr/bin/tr -d '[:space:]')"
  if (( depth < 3 )); then
    printf 'Refusing to reset a Chrome profile path this shallow: %s\n' "$dir" >&2
    exit 78
  fi
}

reset_profile_dir() {
  local dir="$1"
  assert_disposable_profile_dir "$dir"
  /bin/rm -rf -- "${dir%/}"
  printf 'Chrome profile reset: %s\n' "${dir%/}"
  printf '%s\n' 'The previous shift left no browsing history, cache or cookies behind.'
}

profile_dir="${PRINT_CESS_CHROME_PROFILE_DIR:-$default_profile_dir}"

# Clearing the profile needs no printer, no network and no browser, so it runs
# before the launch preflight. An operator uses it at the end of a shift.
if [[ "$mode" == "reset-profile" ]]; then
  reset_profile_dir "$profile_dir"
  exit 0
fi

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

keep_profile="${PRINT_CESS_KEEP_CHROME_PROFILE:-0}"
if [[ "$keep_profile" == "1" ]]; then
  printf '%s\n' 'Chrome profile: preserved because PRINT_CESS_KEEP_CHROME_PROFILE=1'
else
  assert_disposable_profile_dir "$profile_dir"
  printf '%s\n' 'Chrome profile: reset before launch, so no visitor history carries over'
fi

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
  printf '%s\n' "Preflight passed. No browser was started and no profile was reset."
  exit 0
fi

if [[ "$keep_profile" != "1" ]]; then
  reset_profile_dir "$profile_dir"
fi
/bin/mkdir -p "$profile_dir"
exec "${command[@]}"
