import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { hairline, radius, space, useTheme } from "@/theme";

/**
 * Flat surface: 1px border, 12px radius, no shadow. Pass `onPress` to make it tappable (pressed = one step darker).
 * `padded={false}` for cards that hold rows, which bring their own padding.
 */
export function Card({ children, onPress, padded = true, style, accessibilityLabel, accessibilityHint }: { children: ReactNode; onPress?: () => void; padded?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; accessibilityHint?: string }) {
  const { c } = useTheme();
  const base: ViewStyle = { backgroundColor: c.surface, borderRadius: radius.card, borderWidth: hairline, borderColor: c.border, overflow: "hidden", padding: padded ? space.lg : 0 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [base, pressed && { backgroundColor: c.surface2 }, style]}
    >
      {children}
    </Pressable>
  );
}

/** A 1px rule. Rows inside a Card use it between items; screens use it above the tab bar. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: hairline, backgroundColor: c.border, marginLeft: inset }} />;
}
