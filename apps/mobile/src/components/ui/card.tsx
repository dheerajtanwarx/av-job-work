import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { hairline, radius, space, useTheme } from "@/theme";

/** Flat surface with a 1px border and 12px radius. Pass onPress to make the whole card tappable. */
/** `style` is the outer box (size, margins, background); `contentStyle` the inside (padding, gap, layout). */
export function Card({
  style,
  contentStyle,
  onPress,
  padded = true,
  children,
  ...rest
}: ViewProps & { onPress?: () => void; padded?: boolean; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const card: ViewStyle = { backgroundColor: c.surface, borderRadius: radius.card, borderWidth: hairline, borderColor: c.border, overflow: "hidden" };
  const pad = padded ? { padding: space.lg } : null;
  if (onPress)
    return (
      <View style={[card, style]}>
        <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pad, pressed && { backgroundColor: c.surface2 }, contentStyle]} {...rest}>
          {children}
        </Pressable>
      </View>
    );
  return (
    <View style={[card, pad, style, contentStyle]} {...rest}>
      {children}
    </View>
  );
}
