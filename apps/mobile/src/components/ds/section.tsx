import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { space } from "@/theme";
import { Text } from "@/components/ui/text";

/** A titled group: muted sentence-case label with an optional quiet text action on the right. */
export function Section({ title, action, children, style }: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: space.sm }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 24, paddingHorizontal: space.xs }}>
        <Text variant="label" tone="muted" accessibilityRole="header">
          {title}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={12} accessibilityRole="button">
            {({ pressed }) => (
              <Text variant="label" tone={pressed ? "default" : "secondary"}>
                {action.label}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
