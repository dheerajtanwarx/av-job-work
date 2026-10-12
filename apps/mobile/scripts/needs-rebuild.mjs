// Tells you whether the native app on the phone is out of date (a native module or app config changed),
// i.e. whether you need `pnpm mobile:android` again or Fast Refresh is enough.
import { createFingerprintAsync, diffFingerprints } from "@expo/fingerprint";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = new URL("../.expo/native-fingerprint.json", import.meta.url);
const now = await createFingerprintAsync(new URL("..", import.meta.url).pathname);

if (process.argv.includes("--save")) {
  writeFileSync(file, JSON.stringify(now));
  console.log(`Saved native fingerprint ${now.hash}`);
} else if (!existsSync(file)) {
  console.log("No build recorded yet. Run `pnpm mobile:android` (it records the fingerprint).");
} else {
  const built = JSON.parse(readFileSync(file, "utf8"));
  if (built.hash === now.hash) console.log("✓ No rebuild needed: JS changes reach the phone through Fast Refresh.");
  else {
    console.log("✗ Native code changed since the last build. Run `pnpm mobile:android`. Changes:");
    for (const d of diffFingerprints(built, now)) console.log(" -", d.op, d.source?.type, d.source?.filePath ?? d.source?.id ?? "");
    process.exitCode = 1;
  }
}
