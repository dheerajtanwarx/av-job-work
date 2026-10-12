import { View } from "react-native";
import { radius, useTheme } from "@/theme";

/**
 * Where the issued material stands, as one bar: good back · damaged/rejected/lost · still out.
 * The same reconciliation the web shows (Issued − Good − Exceptions = Pending).
 */
export function FlowBar({ sent, ok, exceptions, pending, height = 6 }: { sent: number; ok: number; exceptions: number; pending: number; height?: number }) {
  const { c } = useTheme();
  const total = Math.max(sent, ok + exceptions + pending, 1);
  const seg = (v: number, color: string) => (v > 0 ? <View style={{ flex: v / total, backgroundColor: color }} /> : null);
  return (
    <View
      accessible
      accessibilityLabel={`${ok} good back, ${exceptions} damaged or lost, ${pending} still out, of ${sent} issued`}
      style={{ height, borderRadius: radius.pill, overflow: "hidden", flexDirection: "row", backgroundColor: c.surface3, gap: 1.5 }}
    >
      {seg(ok, c.success)}
      {seg(exceptions, c.dangerSolid)}
      {seg(pending, c.warningSolid)}
      {sent === 0 ? null : <View style={{ flex: Math.max(0, total - ok - exceptions - pending) / total }} />}
    </View>
  );
}
