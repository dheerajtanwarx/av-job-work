import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetTextInput, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { Check, ChevronDown, Plus, Search } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, radius, space, TOUCH, useTheme } from "@/theme";
import { Text } from "./text";

export interface PickerOption {
  value: string;
  label: string;
  sub?: string;
  /** Right-aligned detail, e.g. an amount due. */
  aside?: string;
  asideTone?: "warning" | "muted";
  keywords?: string[];
}

/**
 * A field that opens a searchable list in a tall bottom sheet: the mobile replacement for a combobox.
 * `onCreate` adds a "+ New …" row that receives the typed text.
 */
export function PickerField({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  error,
  hint,
  loading,
  onCreate,
  createLabel = "New",
  disabled,
  clearable,
}: {
  label: string;
  value: string | null | undefined;
  options: PickerOption[];
  onChange: (v: string | null, option?: PickerOption) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  loading?: boolean;
  onCreate?: (typed: string) => void;
  createLabel?: string;
  disabled?: boolean;
  clearable?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheetModal>(null);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const s = q.trim().toLowerCase();
  const filtered = useMemo(() => (s ? options.filter((o) => [o.label, o.sub ?? "", ...(o.keywords ?? [])].some((x) => x.toLowerCase().includes(s))) : options), [options, s]);
  const backdrop = useCallback((p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={1} style={[p.style, { backgroundColor: c.scrim }]} />, [c.scrim]);

  const pick = (o: PickerOption | null) => {
    onChange(o?.value ?? null, o ?? undefined);
    ref.current?.dismiss();
  };

  return (
    <View style={{ gap: space.xs + 2 }}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Pressable
        disabled={disabled}
        onPress={() => ref.current?.present()}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? "not chosen"}`}
        android_ripple={{ color: c.surface3 }}
        style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md + 2, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: error ? c.danger : c.borderStrong, backgroundColor: c.surface, overflow: "hidden", opacity: disabled ? 0.5 : 1 }}
      >
        <View style={{ flex: 1 }}>
          <Text tone={selected ? "default" : "faint"} numberOfLines={1}>
            {selected?.label ?? (loading ? "Loading…" : placeholder)}
          </Text>
          {selected?.sub ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {selected.sub}
            </Text>
          ) : null}
        </View>
        {selected?.aside ? (
          <Text variant="label" num tone={selected.asideTone === "warning" ? "warning" : "muted"}>
            {selected.aside}
          </Text>
        ) : null}
        <ChevronDown size={18} color={c.fgMuted} />
      </Pressable>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}

      <BottomSheetModal
        ref={ref}
        snapPoints={["88%"]}
        enableDynamicSizing={false}
        backdropComponent={backdrop}
        backgroundStyle={{ backgroundColor: c.surface, borderRadius: radius.xl }}
        handleIndicatorStyle={{ backgroundColor: c.borderStrong, width: 36 }}
        keyboardBehavior="extend"
        android_keyboardInputMode="adjustPan" // see Sheet: edge-to-edge, so the window never resizes
        onDismiss={() => setQ("")}
      >
        <View style={{ paddingHorizontal: space.gutter, gap: space.md, paddingBottom: space.sm }}>
          <Text variant="title">{label}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, height: 46, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.surface2 }}>
            <Search size={18} color={c.fgMuted} />
            <BottomSheetTextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search"
              placeholderTextColor={c.fgMuted}
              autoCorrect={false}
              style={{ flex: 1, fontFamily: font.regular, fontSize: 16, color: c.fg, paddingVertical: 0 }}
            />
          </View>
        </View>
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(o: PickerOption) => o.value}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
          ListHeaderComponent={
            <>
              {onCreate ? (
                <Row
                  label={q.trim() ? `${createLabel} "${q.trim()}"` : createLabel}
                  icon={<Plus size={20} color={c.accent} />}
                  accent
                  onPress={() => {
                    ref.current?.dismiss();
                    onCreate(q.trim());
                  }}
                />
              ) : null}
              {clearable && value ? <Row label="None" onPress={() => pick(null)} /> : null}
            </>
          }
          ListEmptyComponent={
            <Text tone="muted" align="center" style={{ padding: space.xxl }}>
              {loading ? "Loading…" : q ? `Nothing matches "${q}"` : "Nothing to choose yet"}
            </Text>
          }
          renderItem={({ item }: { item: PickerOption }) => <Row option={item} label={item.label} selected={item.value === value} onPress={() => pick(item)} />}
        />
      </BottomSheetModal>
    </View>
  );
}

function Row({ option, label, selected, onPress, icon, accent }: { option?: PickerOption; label: string; selected?: boolean; onPress: () => void; icon?: React.ReactNode; accent?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} android_ripple={{ color: c.surface3 }} accessibilityRole="button" accessibilityState={{ selected }} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TOUCH + 8, paddingHorizontal: space.gutter, paddingVertical: space.sm, backgroundColor: selected ? c.accentSubtle : undefined }}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text tone={accent ? "accent" : "default"} variant={selected ? "bodyStrong" : "body"} numberOfLines={1}>
          {label}
        </Text>
        {option?.sub ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {option.sub}
          </Text>
        ) : null}
      </View>
      {option?.aside ? (
        <Text variant="label" num tone={option.asideTone === "warning" ? "warning" : "muted"}>
          {option.aside}
        </Text>
      ) : null}
      {selected ? <Check size={18} color={c.accent} /> : null}
    </Pressable>
  );
}
