#!/bin/sh
# Builds the signed production APK for internal distribution:  pnpm mobile:release
#
#   → releases/AV-Job-Work-<version>.apk   (repo root; git-ignored)
#
# Needs the release key's settings in ~/.gradle/gradle.properties (see plugins/with-release-signing.js).
# Before each release, raise `version` and `android.versionCode` in app.config.ts.
# This replaces android/ with the production project; afterwards restore the dev one with
#   APP_VARIANT=development npx expo prebuild --platform android --clean --no-install
set -e

API_URL="https://api.jaipuriodhani.com"

mobile="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$mobile/../.." && pwd)"
props="$HOME/.gradle/gradle.properties"

# Only check that the settings exist; never print them.
for key in AV_RELEASE_STORE_FILE AV_RELEASE_KEY_ALIAS AV_RELEASE_STORE_PASSWORD AV_RELEASE_KEY_PASSWORD; do
  grep -q "^[[:space:]]*$key[[:space:]]*=" "$props" 2>/dev/null || { echo "Missing $key in $props. Add the release key settings first."; exit 1; }
done

export APP_VARIANT=production
export EXPO_PUBLIC_API_URL="$API_URL"
cd "$mobile"

version=$(npx expo config --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).version))')
echo "Building AV Job Work $version (production, API $EXPO_PUBLIC_API_URL)…"

npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a)

apk="$mobile/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$apk" ] || { echo "No signed APK at $apk (an unsigned build means the release key settings weren't picked up)."; exit 1; }
mkdir -p "$root/releases"
out="$root/releases/AV-Job-Work-$version.apk"
cp "$apk" "$out"
echo "Done: $out"
