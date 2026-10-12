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
// The dev build is amber so it's never mistaken for the real app.
const variants: Record<Variant, { name: string; androidPackage: string; scheme: string; icon: string; iconBg: string }> = {
  development: { name: "AV Job Work (Dev)", androidPackage: `${PACKAGE}.dev`, scheme: "avjobwork-dev", icon: "./assets/images/icon-dev.png", iconBg: "#b45309" },
  preview: { name: "AV Job Work (Preview)", androidPackage: `${PACKAGE}.preview`, scheme: "avjobwork-preview", icon: "./assets/images/icon.png", iconBg: "#3b4ba8" },
  production: { name: "AV Job Work", androidPackage: PACKAGE, scheme: "avjobwork", icon: "./assets/images/icon.png", iconBg: "#3b4ba8" },
};
const v = variants[VARIANT];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: v.name,
  slug: "av-job-work",
  version: "1.0.0",
  orientation: "portrait",
  icon: v.icon,
  scheme: v.scheme,
  userInterfaceStyle: "automatic",
  backgroundColor: "#fafaf9",
  android: {
    package: v.androidPackage,
    adaptiveIcon: {
      backgroundColor: v.iconBg,
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: true,
    softwareKeyboardLayoutMode: "resize",
    permissions: ["android.permission.CAMERA", "android.permission.USE_BIOMETRIC"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
    "expo-secure-store",
    "expo-local-authentication",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#fafaf9",
        image: "./assets/images/splash-icon.png",
        imageWidth: 88,
        dark: { backgroundColor: "#0d0d0f", image: "./assets/images/splash-icon.png" },
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
