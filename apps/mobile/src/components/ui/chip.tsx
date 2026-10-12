import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { font, radius, space, useTheme } from "@/theme";
import { Text } from "./text";

/** Toggleable filter/choice chip, 36dp high (48dp touch with hitSlop). */
export function Chip({ label, selected, onPress, icon: Icon, count }: { label: string; selected?: boolean; onPress?: () => void; icon?: LucideIcon; count?: number }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      hitSlop={6}
      onPress={() => {
        Haptics.selectionAsync();
        onPress?.();
      }}
      android_ripple={{ color: c.surface3 }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 36,
        paddingHorizontal: space.md + 2,
        borderRadius: radius.pill,
        overflow: "hidden",
        backgroundColor: selected ? c.accentSolid : c.surface,
        borderWidth: selected ? 0 : 1,
        borderColor: c.borderStrong,
      }}
    >
      {Icon ? <Icon size={16} color={selected ? c.onAccent : c.fg2} /> : null}
      <Text variant="label" style={{ color: selected ? c.onAccent : c.fg2, fontFamily: selected ? font.semibold : font.medium }}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="caption" num style={{ color: selected ? c.onAccent : c.fgMuted, opacity: 0.85 }}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A horizontally scrolling row of chips that runs edge to edge. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.gutter }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Mutually exclusive options in one bar, for 2–4 short choices. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", padding: 3, borderRadius: radius.md, backgroundColor: c.surface2, gap: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) Haptics.selectionAsync();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              minHeight: 38,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.md - 2,
              backgroundColor: on ? c.surface : "transparent",
              borderWidth: on ? 1 : 0,
              borderColor: c.border,
            }}
          >
            <Text variant="label" style={{ color: on ? c.fg : c.fgMuted, fontFamily: on ? font.semibold : font.medium }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
