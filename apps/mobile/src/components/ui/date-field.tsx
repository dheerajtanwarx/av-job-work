import { formatDate } from "@av/shared";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { CalendarDays, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { radius, space, useTheme } from "@/theme";
import { Text } from "./text";

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/** A calendar date (YYYY-MM-DD) picked with the Material date picker. */
export function DateField({
  label,
  value,
  onChange,
  hint,
  error,
  clearable,
  placeholder = "Pick a date",
  maximumDate,
  minimumDate,
}: {
  label?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  hint?: string;
  error?: string;
  clearable?: boolean;
  placeholder?: string;
  maximumDate?: Date;
  minimumDate?: Date;
}) {
  const { c } = useTheme();
  const open = () =>
    DateTimePickerAndroid.open({
      value: value ? fromISO(value) : new Date(),
      mode: "date",
      design: "material",
      title: label,
      maximumDate,
      minimumDate,
      onChange: (e, d) => {
        if (e.type === "set" && d) onChange(toISO(d));
      },
    });
  return (
    <View style={{ gap: space.xs + 2 }}>
      {label ? (
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? "Date"}: ${value ? formatDate(value) : "not set"}`}
        android_ripple={{ color: c.surface3 }}
        style={{ minHeight: 50, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md + 2, borderRadius: radius.md, borderWidth: 1, borderColor: error ? c.danger : c.borderStrong, backgroundColor: c.surface, overflow: "hidden" }}
      >
        <CalendarDays size={18} color={c.fgMuted} />
        <Text style={{ flex: 1 }} tone={value ? "default" : "faint"} num>
          {value ? formatDate(value) : placeholder}
        </Text>
        {clearable && value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={12} accessibilityLabel="Clear date">
            <X size={18} color={c.fgMuted} />
          </Pressable>
        ) : null}
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
    </View>
  );
}
