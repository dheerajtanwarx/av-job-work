import { Stack } from "expo-router";
import { font, useTheme } from "@/theme";

/** Signed-in area: the tabs, plus detail screens and full-screen flows pushed over them. */
export default function AppLayout() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: c.bg },
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.fg,
        headerTitleStyle: { fontFamily: font.semibold, fontSize: 18 },
        headerShadowVisible: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
