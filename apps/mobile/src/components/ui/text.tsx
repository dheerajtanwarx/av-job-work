import { Text as RNText, type TextProps } from "react-native";
import { type Palette, type TypeVariant, type as typeScale, useTheme } from "@/theme";

type Tone = "default" | "secondary" | "muted" | "faint" | "accent" | "success" | "warning" | "danger" | "info" | "onAccent";

const toneColor = (c: Palette, tone: Tone) =>
  ({
    default: c.fg,
    secondary: c.fg2,
    muted: c.fgMuted,
    faint: c.fgFaint,
    accent: c.accent,
    success: c.success,
    warning: c.warning,
    danger: c.danger,
    info: c.info,
    onAccent: c.onAccent,
  })[tone];

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: Tone;
  /** Tabular figures, for ₹ and quantities that should line up. */
  num?: boolean;
  align?: "left" | "center" | "right";
}

export function Text({ variant = "body", tone = "default", num, align, style, ...rest }: AppTextProps) {
  const { c } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[typeScale[variant], { color: toneColor(c, tone) }, num && { fontVariant: ["tabular-nums"] }, align && { textAlign: align }, style]}
    />
  );
}
