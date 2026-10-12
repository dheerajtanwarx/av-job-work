import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { Pressable } from "react-native";
import { radius, space, useTheme } from "@/theme";
import { Text } from "./text";

/** Extended floating action button, bottom-right in the thumb zone. Long-press for alternatives. */
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
      android_ripple={{ color: "rgba(255,255,255,0.2)" }}
      style={{
        position: "absolute",
        right: space.gutter,
        bottom: space.gutter,
        height: 56,
        paddingHorizontal: space.xl,
        borderRadius: radius.lg + 2,
        backgroundColor: c.accentSolid,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm + 2,
        overflow: "hidden",
        elevation: 6,
        shadowColor: "#000",
      }}
    >
      <Icon size={22} color={c.onAccent} strokeWidth={2.1} />
      <Text variant="headline" style={{ color: c.onAccent, fontSize: 16 }}>
        {label}
      </Text>
    </Pressable>
  );
}
