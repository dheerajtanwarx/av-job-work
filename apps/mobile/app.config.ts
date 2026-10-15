import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * One config, three installs that can live side by side on the phone:
 *  - development: the dev-client build used with `pnpm mobile` (Fast Refresh over Wi-Fi)
 *  - preview:     a release APK for sideloading/testing
 *  - production:  the store/release build
 */
type Variant = "development" | "preview" | "production";
const VARIANT = (process.env.APP_VARIANT as Variant) ?? "production";

const PACKAGE = "in.avcreation.jobwork";
// Every variant wears the AV Creation icon (the needle-and-thread mark on black); the dev and preview builds are told
// apart by their name under the icon.
const ICON = "./assets/images/app-icon-1024.png";
const ICON_BG = "#000000";
const variants: Record<Variant, { name: string; androidPackage: string; scheme: string; icon: string; iconBg: string }> = {
  development: { name: "AV Job Work (Dev)", androidPackage: `${PACKAGE}.dev`, scheme: "avjobwork-dev", icon: ICON, iconBg: ICON_BG },
  preview: { name: "AV Job Work (Preview)", androidPackage: `${PACKAGE}.preview`, scheme: "avjobwork-preview", icon: ICON, iconBg: ICON_BG },
  production: { name: "AV Job Work", androidPackage: PACKAGE, scheme: "avjobwork", icon: ICON, iconBg: ICON_BG },
};
const v = variants[VARIANT];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: v.name,
  slug: "av-job-work",
  version: "1.0.2",
  orientation: "portrait",
  icon: v.icon,
  scheme: v.scheme,
  userInterfaceStyle: "automatic",
  backgroundColor: "#fafaf9",
  android: {
    package: v.androidPackage,
    // Raise by 1 for every APK you hand out: Android only installs an update over a lower versionCode.
    versionCode: 3,
    adaptiveIcon: {
      backgroundColor: v.iconBg,
      foregroundImage: "./assets/images/av-icon-foreground.png",
      monochromeImage: "./assets/images/av-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: true,
    softwareKeyboardLayoutMode: "resize",
    permissions: ["android.permission.CAMERA", "android.permission.USE_BIOMETRIC"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
  },
  plugins: [
    // Release APKs are signed with our own key from ~/.gradle/gradle.properties (see the plugin).
    "./plugins/with-release-signing",
    "expo-router",
    "expo-dev-client",
    "expo-secure-store",
    "expo-local-authentication",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#fafaf9",
        image: "./assets/images/av-splash.png",
        imageWidth: 88,
        dark: { backgroundColor: "#0d0d0f", image: "./assets/images/av-splash.png" },
      },
    ],
    [
      "expo-image-picker",
      {
        cameraPermission: "Allow AV Job Work to use the camera to photograph returned work, samples and worker documents.",
        photosPermission: "Allow AV Job Work to attach photos from your gallery.",
        microphonePermission: false,
      },
    ],
    [
      "expo-build-properties",
      {
        // Release builds only talk HTTPS; debug (dev-client) builds may reach the API on the Mac's LAN IP over HTTP.
        android: { usesCleartextTraffic: VARIANT === "development" },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    variant: VARIANT,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  },
});
