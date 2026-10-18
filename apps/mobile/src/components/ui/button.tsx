import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { font, hairline, type Palette, radius, space, useStyles, useTheme } from "@/theme";
import { Text } from "./text";

export { IconButton } from "@/components/ds/button";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerGhost";
type Size = "md" | "lg";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  title: string;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
  /** A light tap on press; on by default for primary actions. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** `primary` is the one filled accent action on a screen; `secondary` is outlined; `ghost` is text-only. */
export function Button({ title, variant = "primary", size = "md", icon: Icon, loading, block, haptic, disabled, onPress, style, ...rest }: ButtonProps) {
  const { c } = useTheme();
  const s = useStyles(styles);
  const fg = { primary: c.onAccent, secondary: c.fg, ghost: c.fg2, danger: c.onAccent, dangerGhost: c.danger }[variant];
  const pressedBg = { primary: c.accentPressed, secondary: c.surface2, ghost: c.surface2, danger: c.danger, dangerGhost: c.dangerSubtle }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      hitSlop={size === "md" ? 2 : 0}
      onPress={(e) => {
        if (haptic ?? variant === "primary") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={({ pressed }) => [s.base, s[variant], size === "lg" && s.lg, block && s.block, off && s.disabled, pressed && { backgroundColor: pressedBg }, style]}
      {...rest}
    >
      <View style={s.row}>
        {loading ? <ActivityIndicator size="small" color={fg} /> : Icon ? <Icon size={size === "lg" ? 18 : 16} color={fg} strokeWidth={2} /> : null}
        <Text variant={size === "lg" ? "bodyStrong" : "label"} style={{ color: fg, fontFamily: font.medium, fontSize: size === "lg" ? 15 : 14 }} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    base: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.control, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    lg: { minHeight: 48, paddingHorizontal: space.xl },
    block: { alignSelf: "stretch" },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm },
    primary: { backgroundColor: c.accentSolid },
    secondary: { backgroundColor: c.surface, borderWidth: hairline, borderColor: c.borderStrong },
    ghost: { backgroundColor: "transparent" },
    danger: { backgroundColor: c.dangerSolid },
    dangerGhost: { backgroundColor: "transparent", borderWidth: hairline, borderColor: c.borderStrong },
    disabled: { opacity: 0.45 },
  });
