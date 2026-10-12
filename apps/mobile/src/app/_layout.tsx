import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Toaster } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { persister, queryClient } from "@/lib/query";
import { ThemeProvider, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 200 });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000 }}>
          <AuthProvider>
            <BottomSheetModalProvider>{fontsLoaded ? <RootStack /> : null}</BottomSheetModalProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const { user } = useAuth();
  const { c, dark } = useTheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg);
  }, [c.bg]);
  useEffect(() => {
    if (user !== undefined) SplashScreen.hideAsync();
  }, [user]);
  if (user === undefined) return null; // still reading the saved session; the splash stays up

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: "fade_from_bottom" }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      <Toaster />
    </>
  );
}
