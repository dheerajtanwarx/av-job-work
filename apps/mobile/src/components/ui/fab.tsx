import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { Pressable } from "react-native";
import { font, radius, space, useTheme } from "@/theme";
import { Text } from "./text";

/** The screen's one primary action, floating bottom-right in the thumb zone. Long-press for alternatives. */
export function Fab({ icon: Icon, label, onPress, onLongPress }: { icon: LucideIcon; label: string; onPress: () => void; onLongPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        position: "absolute",
        right: space.gutter,
        bottom: space.gutter,
        height: 48,
        paddingHorizontal: space.lg,
        borderRadius: radius.card,
        backgroundColor: pressed ? c.accentPressed : c.accentSolid,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        // Just enough lift to separate it from the list scrolling underneath.
        elevation: 3,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      })}
    >
      <Icon size={18} color={c.onAccent} strokeWidth={2} />
      <Text variant="bodyStrong" style={{ color: c.onAccent, fontFamily: font.medium }}>
        {label}
      </Text>
    </Pressable>
  );
}
