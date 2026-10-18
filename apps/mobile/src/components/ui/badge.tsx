import { View } from "react-native";
import { font, type Palette, radius, useTheme } from "@/theme";
import { Text } from "./text";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const toneColors = (c: Palette, tone: Tone) =>
  ({
    neutral: { fg: c.fgMuted, bg: c.surface2, dot: c.fgFaint },
    accent: { fg: c.accent, bg: c.accentSubtle, dot: c.accent },
    success: { fg: c.success, bg: c.successSubtle, dot: c.success },
    warning: { fg: c.warning, bg: c.warningSubtle, dot: c.warningSolid },
    danger: { fg: c.danger, bg: c.dangerSubtle, dot: c.dangerSolid },
    info: { fg: c.info, bg: c.infoSubtle, dot: c.info },
  })[tone];

/**
 * Status as a word plus colour (never colour alone). `dot` = calm inline status; `pill` = soft tinted pill with a dot.
 */
export function Badge({ label, tone = "neutral", look = "pill" }: { label: string; tone?: Tone; look?: "pill" | "dot" }) {
  const { c } = useTheme();
  const t = toneColors(c, tone);
  const dot = <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.dot }} />;
  if (look === "dot")
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {dot}
        <Text variant="label" style={{ color: tone === "neutral" ? c.fg2 : t.fg }} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: t.bg }}>
      {dot}
      <Text variant="caption" num style={{ color: t.fg, fontFamily: font.medium }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
