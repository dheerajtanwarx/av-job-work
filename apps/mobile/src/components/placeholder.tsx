import { View } from "react-native";
import { Text } from "@/components/ui";
import { space, useTheme } from "@/theme";

/** Temporary screen body while a tab is being built. */
export function Placeholder({ title }: { title: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.xxl }}>
      <Text variant="title">{title}</Text>
      <Text tone="muted" align="center">
        Coming up next.
      </Text>
    </View>
  );
}
