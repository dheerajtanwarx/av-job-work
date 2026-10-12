import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

/** Surface with a hairline border. Pass onPress to make the whole card tappable (with ripple). */
/** `style` is the outer box (size, margins, background); `contentStyle` the inside (padding, gap, layout). */
export function Card({
  style,
  contentStyle,
  onPress,
  padded = true,
  children,
  ...rest
}: ViewProps & { onPress?: () => void; padded?: boolean; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> }) {
  const s = useStyles(styles);
  const { c } = useTheme();
  if (onPress)
    return (
      <View style={[s.card, style]}>
        <Pressable accessibilityRole="button" onPress={onPress} android_ripple={{ color: c.surface3 }} style={[padded && s.pad, contentStyle]} {...rest}>
          {children}
        </Pressable>
      </View>
    );
  return (
    <View style={[s.card, padded && s.pad, style, contentStyle]} {...rest}>
      {children}
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border, overflow: "hidden" },
    pad: { padding: space.lg },
  });
