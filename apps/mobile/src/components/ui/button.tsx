import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { type Palette, radius, space, TOUCH, useStyles, useTheme } from "@/theme";
import { Text } from "./text";

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

export function Button({ title, variant = "primary", size = "md", icon: Icon, loading, block, haptic, disabled, onPress, style, ...rest }: ButtonProps) {
  const { c } = useTheme();
  const s = useStyles(styles);
  const fg = { primary: c.onAccent, secondary: c.fg, ghost: c.accent, danger: c.onAccent, dangerGhost: c.danger }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      android_ripple={{ color: variant === "primary" || variant === "danger" ? "rgba(255,255,255,0.18)" : c.surface3 }}
      disabled={off}
      onPress={(e) => {
        if (haptic ?? variant === "primary") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={({ pressed }) => [s.base, s[variant], size === "lg" && s.lg, block && s.block, off && s.disabled, pressed && variant !== "ghost" && s.pressed, style]}
      {...rest}
    >
      <View style={s.row}>
        {loading ? <ActivityIndicator size="small" color={fg} /> : Icon ? <Icon size={size === "lg" ? 20 : 18} color={fg} strokeWidth={2} /> : null}
        <Text variant={size === "lg" ? "headline" : "bodyStrong"} style={{ color: fg }} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    base: { minHeight: TOUCH - 4, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    lg: { minHeight: 54, paddingHorizontal: space.xl, borderRadius: radius.lg },
    block: { alignSelf: "stretch" },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm },
    primary: { backgroundColor: c.accentSolid },
    secondary: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.borderStrong },
    ghost: { backgroundColor: "transparent" },
    danger: { backgroundColor: c.dangerSolid },
    dangerGhost: { backgroundColor: c.dangerSubtle },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.9 },
  });

/** Round icon-only button with a 48dp touch target. Always give it a label for TalkBack. */
export function IconButton({ icon: Icon, label, onPress, tone = "default", size = 22 }: { icon: LucideIcon; label: string; onPress?: () => void; tone?: "default" | "accent"; size?: number }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      android_ripple={{ color: c.surface3, borderless: true, radius: 22 }}
      style={{ width: TOUCH - 4, height: TOUCH - 4, alignItems: "center", justifyContent: "center" }}
    >
      <Icon size={size} color={tone === "accent" ? c.accent : c.fg2} strokeWidth={1.9} />
    </Pressable>
  );
}
