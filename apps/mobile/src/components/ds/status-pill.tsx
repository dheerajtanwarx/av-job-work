import { View } from "react-native";
import { font, type Palette, radius, useTheme } from "@/theme";
import { Text } from "@/components/ui/text";

export type Status = "neutral" | "success" | "warning" | "danger" | "info";

export const statusColors = (c: Palette, s: Status) =>
  ({
    neutral: { fg: c.fgMuted, bg: c.surface2, dot: c.fgFaint },
    success: { fg: c.success, bg: c.successSubtle, dot: c.success },
    warning: { fg: c.warning, bg: c.warningSubtle, dot: c.warningSolid },
    danger: { fg: c.danger, bg: c.dangerSubtle, dot: c.dangerSolid },
    info: { fg: c.info, bg: c.infoSubtle, dot: c.info },
  })[s];

/** A 6px status dot. Pair it with words: colour is never the only signal. */
export function StatusDot({ status, size = 6 }: { status: Status; size?: number }) {
  const { c } = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: statusColors(c, status).dot }} />;
}

/** Soft pill: tinted background, dot, short sentence-case label. */
export function StatusPill({ label, status = "neutral" }: { label: string; status?: Status }) {
  const { c } = useTheme();
  const t = statusColors(c, status);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: t.bg }}>
      <StatusDot status={status} />
      <Text variant="caption" num style={{ color: t.fg, fontFamily: font.medium }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
