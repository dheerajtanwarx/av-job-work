// Signs release builds with our own key instead of the shared debug key.
//
// android/ is regenerated on every prebuild, so this edit lives here rather than in build.gradle. The key's location
// and passwords are never in the repo: Gradle reads them from ~/.gradle/gradle.properties
// (AV_RELEASE_STORE_FILE, AV_RELEASE_KEY_ALIAS, AV_RELEASE_STORE_PASSWORD, AV_RELEASE_KEY_PASSWORD).
// Without those properties the release build is left unsigned (and `pnpm mobile:release` refuses to start), while
// debug / dev-client builds are unaffected.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "// @av-release-signing";

const SIGNING_CONFIG = `
        ${MARK}
        release {
            if (project.hasProperty('AV_RELEASE_STORE_FILE')) {
                storeFile file(AV_RELEASE_STORE_FILE)
                storePassword AV_RELEASE_STORE_PASSWORD
                keyAlias AV_RELEASE_KEY_ALIAS
                keyPassword AV_RELEASE_KEY_PASSWORD
            }
        }`;

function addReleaseSigning(gradle) {
  if (gradle.includes(MARK)) return gradle;

  // 1. A release signing config next to the debug one.
  const withConfig = gradle.replace(/(\n\s*signingConfigs\s*\{)/, `$1${SIGNING_CONFIG}`);
  if (withConfig === gradle) throw new Error("with-release-signing: no `signingConfigs {` block found in android/app/build.gradle");

  // 2. The release build type uses it (the template points it at the debug key).
  const withBuildType = withConfig.replace(
    /(\n\s*release\s*\{(?:(?!\n\s*\}\n)[\s\S])*?)signingConfig signingConfigs\.debug/,
    "$1signingConfig project.hasProperty('AV_RELEASE_STORE_FILE') ? signingConfigs.release : null",
  );
  if (withBuildType === withConfig) throw new Error("with-release-signing: release buildType's `signingConfig signingConfigs.debug` not found");
  return withBuildType;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== "groovy") throw new Error("with-release-signing: expected a Groovy build.gradle");
    c.modResults.contents = addReleaseSigning(c.modResults.contents);
    return c;
  });
};
