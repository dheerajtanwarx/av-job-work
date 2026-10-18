import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { font, hairline, radius, space, TOUCH, useTheme } from "@/theme";
import { Text } from "@/components/ui/text";

type Variant = "primary" | "outline" | "ghost";

/**
 * `primary` is the one filled, accent-coloured action on a screen. `outline` for secondary actions, `ghost` for
 * tertiary. 40dp tall with hitSlop to reach the 48dp touch target.
 */
export function Button({ title, onPress, variant = "outline", icon: Icon, loading, disabled, style }: { title: string; onPress?: () => void; variant?: Variant; icon?: LucideIcon; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const off = disabled || loading;
  const fg = variant === "primary" ? c.onAccent : c.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      hitSlop={4}
      onPress={() => {
        if (variant === "primary") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        { height: 40, paddingHorizontal: space.md, borderRadius: radius.control, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
        variant === "primary" && { backgroundColor: pressed ? c.accentPressed : c.accentSolid },
        variant === "outline" && { backgroundColor: pressed ? c.surface2 : c.surface, borderWidth: hairline, borderColor: c.borderStrong },
        variant === "ghost" && { backgroundColor: pressed ? c.surface2 : "transparent" },
        off && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : Icon ? <Icon size={16} color={variant === "primary" ? fg : c.fg2} strokeWidth={2} /> : null}
      <Text variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: fg, fontFamily: font.medium, flexShrink: 1 }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Square ghost icon button: 36dp visual, 48dp touch target. Always give it a label for TalkBack. */
export function IconButton({ icon: Icon, label, onPress, tone = "default", size = 20 }: { icon: LucideIcon; label: string; onPress?: () => void; tone?: "default" | "accent"; size?: number }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(TOUCH - 36) / 2}
      onPress={onPress}
      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: radius.control, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.surface2 : "transparent" })}
    >
      <Icon size={size} color={tone === "accent" ? c.accent : c.fg2} strokeWidth={1.75} />
    </Pressable>
  );
}
