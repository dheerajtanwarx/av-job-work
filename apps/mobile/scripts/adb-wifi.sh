#!/bin/sh
# Connects adb to the phone over Wi-Fi (Android 11+ Wireless debugging, no USB cable).
#
#   pnpm mobile:adb                         reconnect to a phone paired before (found via mDNS)
#   pnpm mobile:adb pair <ip:port> <code>   first time: phone → Developer options → Wireless debugging
#                                            → "Pair device with pairing code"
#   pnpm mobile:adb <ip:port>               connect to the ip:port shown on the Wireless debugging screen
set -e
command -v adb >/dev/null || { echo "adb not found. Run: brew install --cask android-platform-tools"; exit 1; }

if [ "$1" = "pair" ]; then
  [ -n "$2" ] && [ -n "$3" ] || { echo "Usage: pnpm mobile:adb pair <ip:pair-port> <6-digit-code>"; exit 1; }
  adb pair "$2" "$3"
  echo "Paired. Now connecting (the connect port differs from the pairing port)…"
  shift 3
fi

if [ -n "$1" ]; then
  adb connect "$1"
elif adb devices | grep -q "_adb-tls-connect._tcp[[:space:]]*device"; then
  : # adb already connected to the phone by itself through mDNS; connecting again would list it twice
else
  # The phone announces itself as _adb-tls-connect._tcp; Samsung changes the port after a reboot or Wi-Fi toggle.
  target=$(adb mdns services 2>/dev/null | awk '/_adb-tls-connect/ {print $NF}' | head -1)
  if [ -z "$target" ]; then
    echo "No phone found on the network. Check that:"
    echo "  - the phone and Mac are on the same Wi-Fi"
    echo "  - Wireless debugging is ON (Developer options); it turns off when Wi-Fi changes"
    echo "  - you paired once:  pnpm mobile:adb pair <ip:port> <code>"
    echo "Or connect directly: pnpm mobile:adb <ip:port from the Wireless debugging screen>"
    exit 1
  fi
  adb connect "$target"
fi
adb devices -l
