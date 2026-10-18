import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { font, hairline, radius, space, useTheme } from "@/theme";
import { Text } from "@/components/ui/text";

/** Toggleable filter chip. Selected = raised neutral surface with a stronger border, not a coloured fill. */
export function Chip({ label, selected, onPress, count, icon: Icon }: { label: string; selected?: boolean; onPress?: () => void; count?: number; icon?: LucideIcon }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 32,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        borderWidth: hairline,
        borderColor: selected ? c.fgFaint : c.border,
        backgroundColor: selected ? c.surface : pressed ? c.surface2 : "transparent",
      })}
    >
      {Icon ? <Icon size={14} color={selected ? c.fg : c.fgMuted} strokeWidth={1.75} /> : null}
      <Text variant="label" style={{ color: selected ? c.fg : c.fgMuted, fontFamily: font.medium }}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="caption" num tone="faint">
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Segmented control for 2–4 mutually exclusive options. Active segment is a white tab with a hairline border. */
export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { c, dark } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", padding: 2, height: 36, borderRadius: radius.control, backgroundColor: c.surface2, borderWidth: hairline, borderColor: c.border }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => {
              if (!on) Haptics.selectionAsync();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.control - 2,
              backgroundColor: on ? (dark ? c.surface3 : c.surface) : "transparent",
              borderWidth: on ? hairline : 0,
              borderColor: c.border,
            }}
          >
            <Text variant="label" numberOfLines={1} style={{ color: on ? c.fg : c.fgMuted, fontFamily: font.medium }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
