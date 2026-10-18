import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hairline, radius, space, TOUCH, useTheme } from "@/theme";
import { Text } from "./text";

export { Section } from "@/components/ds/section";

/** Compact header used at the top of each tab. `brand` replaces the title text (Home's logo). */
export function TabHeader({ title, subtitle, right, brand }: { title: string; subtitle?: string; right?: ReactNode; brand?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.gutter, paddingBottom: space.md, flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        {brand ?? (
          <Text variant="title" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, letterSpacing: -0.5 }}>
            {title}
          </Text>
        )}
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: space.xs }}>{right}</View>
    </View>
  );
}

/** 1px rule at the bottom of a tab screen: the native tab bar has no top border of its own on Android. */
export function TabBarRule() {
  const { c } = useTheme();
  return <View style={{ height: hairline, backgroundColor: c.border }} />;
}

/** One tappable row in a grouped list (settings-style). */
export function ListRow({ icon: Icon, title, subtitle, value, onPress, danger, last }: { icon?: LucideIcon; title: string; subtitle?: string; value?: string; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TOUCH + 8, paddingHorizontal: space.lg, backgroundColor: pressed ? c.surface2 : "transparent" })}
    >
      {Icon ? <Icon size={18} color={danger ? c.danger : c.fgMuted} strokeWidth={1.75} /> : null}
      <View style={{ flex: 1, paddingVertical: space.md, borderBottomWidth: last ? 0 : hairline, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "stretch" }}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="bodyStrong" tone={danger ? "danger" : "default"}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text variant="label" tone="muted" num>
            {value}
          </Text>
        ) : null}
        {onPress && !danger ? <ChevronRight size={16} color={c.fgFaint} strokeWidth={1.75} /> : null}
      </View>
    </Pressable>
  );
}

/** A titled, bordered group of ListRows (settings-style). */
export function ListGroup({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label" tone="muted" accessibilityRole="header" style={{ paddingHorizontal: space.xs }}>
        {title}
      </Text>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.card, overflow: "hidden", borderWidth: hairline, borderColor: c.border }}>{children}</View>
    </View>
  );
}
