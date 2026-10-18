import { forwardRef, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { font, hairline, type Palette, radius, space, useStyles, useTheme } from "@/theme";
import { Text } from "./text";

export interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Rendered inside the box, before the text (e.g. "₹"). */
  prefix?: ReactNode;
  /** Rendered inside the box, after the text (e.g. a show-password button). */
  suffix?: ReactNode;
  num?: boolean;
}

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, hint, error, prefix, suffix, num, style, onFocus, onBlur, ...rest }, ref) {
  const { c } = useTheme();
  const s = useStyles(styles);
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.wrap}>
      {label ? (
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      ) : null}
      <View style={[s.box, focused && s.focused, !!error && s.error]}>
        {typeof prefix === "string" ? <Text tone="muted">{prefix}</Text> : prefix}
        <TextInput
          ref={ref}
          placeholderTextColor={c.fgFaint}
          selectionColor={c.accent}
          cursorColor={c.accent}
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[s.input, num && { fontVariant: ["tabular-nums"] }, style]}
          {...rest}
        />
        {suffix}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = (c: Palette) =>
  StyleSheet.create({
    wrap: { gap: space.xs + 2 },
    box: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.control,
      backgroundColor: c.surface,
      borderWidth: hairline,
      borderColor: c.borderStrong,
    },
    // Same 1px width when focused, so the field never shifts.
    focused: { borderColor: c.accent },
    error: { borderColor: c.danger },
    input: { flex: 1, fontFamily: font.regular, fontSize: 16, color: c.fg, paddingVertical: space.md },
  });
