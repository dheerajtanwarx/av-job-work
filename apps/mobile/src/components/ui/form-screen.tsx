import { Stack, router } from "expo-router";
import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useTheme } from "@/theme";
import { IconButton } from "./button";
import { Text } from "./text";

/**
 * Full-screen form: close (✕) at top-left, scrolling fields, and a sticky footer holding the summary and the
 * primary action, so Save is always under the thumb.
 */
export function FormScreen({ title, subtitle, children, footer, onClose }: { title: string; subtitle?: string; children: ReactNode; footer: ReactNode; onClose?: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="height">
      <Stack.Screen options={{ headerShown: false, animation: "slide_from_bottom" }} />
      <View style={{ paddingTop: insets.top, flexDirection: "row", alignItems: "center", paddingHorizontal: space.xs, minHeight: 56 + insets.top, gap: space.xs }}>
        <IconButton icon={X} label="Close" onPress={onClose ?? (() => router.back())} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">{title}</Text>
          {subtitle ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.xl, paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={{ padding: space.gutter, paddingBottom: insets.bottom + space.md, backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong, flexDirection: "row", alignItems: "center", gap: space.md }}>{footer}</View>
    </KeyboardAvoidingView>
  );
}
