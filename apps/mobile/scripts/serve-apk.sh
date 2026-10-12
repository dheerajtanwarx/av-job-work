#!/bin/sh
# Fallback when adb won't connect: serve the built dev APK on the LAN and install it from the phone's browser.
set -e
dir="$(cd "$(dirname "$0")/.." && pwd)/android/app/build/outputs/apk/debug"
[ -f "$dir/app-debug.apk" ] || { echo "No APK yet. Build it first: pnpm mobile:android (or cd android && ./gradlew assembleDebug)"; exit 1; }
ip=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
echo "On the phone, open:  http://$ip:8000/app-debug.apk"
echo "(allow your browser to 'Install unknown apps' when asked). Ctrl+C to stop."
cd "$dir" && python3 -m http.server 8000
