import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type PaymentMethod } from "@av/shared";
import * as Haptics from "expo-haptics";
import { Minus, Plus } from "lucide-react-native";
import { Pressable, Switch, TextInput, View } from "react-native";
import { font, radius, space, TOUCH, useTheme } from "@/theme";
import { Chip } from "./chip";
import { Text } from "./text";

/** Payment method as chips: one tap, no dropdown. */
export function MethodChips({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <View style={{ gap: space.xs + 2 }}>
      <Text variant="label" tone="secondary">
        Paid by
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {PAYMENT_METHODS.map((m) => (
          <Chip key={m} label={m === "BANK" ? "Bank" : PAYMENT_METHOD_LABEL[m]} selected={value === m} onPress={() => onChange(m)} />
        ))}
      </View>
    </View>
  );
}

/**
 * Big quantity input with − / + steppers either side, for counting pieces quickly with a thumb.
 * Decimal units (MTR, KG) get the decimal keypad.
 */
export function QtyInput({ value, onChange, decimals = 0, max, error, label, size = "lg" }: { value: string; onChange: (v: string) => void; decimals?: number; max?: number; error?: boolean; label: string; size?: "lg" | "md" }) {
  const { c } = useTheme();
  const n = Number(value) || 0;
  const h = size === "lg" ? 56 : TOUCH;
  const step = (d: number) => {
    Haptics.selectionAsync();
    const next = Math.max(0, Math.round((n + d) * 1000) / 1000);
    onChange(next ? String(next) : "");
  };
  const btn = (icon: typeof Plus, d: number, a11y: string, disabled: boolean) => {
    const Icon = icon;
    return (
      <Pressable
        onPress={() => step(d)}
        onLongPress={() => step(d * 10)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        android_ripple={{ color: c.surface3, borderless: false }}
        style={{ width: h, height: h, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}
      >
        <Icon size={20} color={c.accent} strokeWidth={2.2} />
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: error ? 1.5 : 1, borderColor: error ? c.danger : c.borderStrong, backgroundColor: c.surface, overflow: "hidden" }}>
      {btn(Minus, -1, `Decrease ${label}`, n <= 0)}
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(",", "."))}
        keyboardType={decimals > 0 ? "decimal-pad" : "number-pad"}
        placeholder="0"
        placeholderTextColor={c.fgFaint}
        selectTextOnFocus
        accessibilityLabel={label}
        cursorColor={c.accent}
        style={{ flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: size === "lg" ? 24 : 18, color: c.fg, fontVariant: ["tabular-nums"], paddingVertical: 0, height: h, borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.border }}
      />
      {btn(Plus, 1, `Increase ${label}`, max !== undefined && n >= max)}
    </View>
  );
}

/** A labelled on/off switch row. */
export function ToggleRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TOUCH, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.accentSolid, false: c.surface3 }} thumbColor="#fff" />
    </Pressable>
  );
}
