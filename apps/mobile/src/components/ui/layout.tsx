import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, TOUCH, useTheme } from "@/theme";
import { Text } from "./text";

/** Large title header used at the top of each tab (Material "large top app bar"). */
export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.gutter, paddingBottom: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={{ flex: 1 }}>
        <Text variant="title" accessibilityRole="header" style={{ fontSize: 24, lineHeight: 30 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="label" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", marginRight: -space.sm }}>{right}</View>
    </View>
  );
}

/** A titled group of content with an optional "See all" style action. */
export function Section({ title, action, children, style }: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ gap: space.sm + 2 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={12} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center" }}>
            <Text variant="label" tone="accent">
              {action.label}
            </Text>
            <ChevronRight size={16} color={c.accent} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** One tappable row in a grouped list (settings-style). */
export function ListRow({ icon: Icon, title, subtitle, value, onPress, danger, last }: { icon?: LucideIcon; title: string; subtitle?: string; value?: string; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      android_ripple={{ color: c.surface3 }}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md + 2, minHeight: TOUCH + 8, paddingHorizontal: space.lg }}
    >
      {Icon ? <Icon size={20} color={danger ? c.danger : c.fg2} strokeWidth={1.8} /> : null}
      <View style={{ flex: 1, paddingVertical: space.md, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: c.borderStrong, flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "stretch" }}>
        <View style={{ flex: 1 }}>
          <Text tone={danger ? "danger" : "default"}>{title}</Text>
          {subtitle ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text variant="label" tone="muted">
            {value}
          </Text>
        ) : null}
        {onPress && !danger ? <ChevronRight size={18} color={c.fgFaint} /> : null}
      </View>
    </Pressable>
  );
}
