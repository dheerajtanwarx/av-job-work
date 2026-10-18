import type { ReactNode } from "react";
import { View } from "react-native";
import { space } from "@/theme";
import { Card } from "./card";
import { Text } from "./text";

type StatTone = "default" | "warning" | "danger" | "success" | "muted";

/** Two-up grid of figures (wraps; an odd last tile stretches to full width). */
export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>{children}</View>;
}

/** One figure: muted label, tight tabular number, one line of context. Tappable when `onPress` is given. */
export function Stat({ label, value, sub, tone = "default", subTone = "muted", onPress }: { label: string; value: string; sub?: string; tone?: StatTone; subTone?: StatTone; onPress?: () => void }) {
  return (
    <Card onPress={onPress} padded={false} style={{ flexBasis: "47%", flexGrow: 1 }}>
      <View style={{ padding: space.lg, gap: space.xs }}>
        <Text variant="label" tone="muted" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="stat" num numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} tone={tone}>
          {value}
        </Text>
        {sub ? (
          <Text variant="caption" tone={subTone} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
