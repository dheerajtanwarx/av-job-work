import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { space, useTheme } from "@/theme";
import { Text } from "@/components/ui/text";
import { Card } from "./card";
import { StatusDot, type Status } from "./status-pill";

/** One figure in a 2-up grid: line icon + muted label, a tight tabular number, one line of context. */
export function StatCard({ icon: Icon, label, value, sub, subStatus, onPress }: { icon: LucideIcon; label: string; value: string; sub?: string; subStatus?: Status; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ""}`} style={{ flexBasis: "47%", flexGrow: 1, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon size={15} color={c.fgMuted} strokeWidth={1.75} />
        <Text variant="label" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="stat" num numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {value}
        </Text>
        {sub ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {subStatus ? <StatusDot status={subStatus} /> : null}
            <Text variant="caption" tone={subStatus === "danger" ? "danger" : "muted"} numberOfLines={1} style={{ flexShrink: 1 }}>
              {sub}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** Two-up grid of StatCards (an odd last card stretches to full width). */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>{children}</View>;
}
