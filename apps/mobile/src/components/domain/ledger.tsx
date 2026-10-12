import { formatDate, formatINR, type Ledger } from "@av/shared";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, Text } from "@/components/ui";
import { space, useTheme } from "@/theme";

/** A running account: work done (debit) vs paid (credit), with the balance after each line. */
export function LedgerView({ ledger }: { ledger: Ledger }) {
  const { c } = useTheme();
  const t = ledger.totals;
  return (
    <View style={{ gap: space.md }}>
      <Card style={{ flexDirection: "row", gap: space.md }}>
        {[
          ["Work", t.debitPaise],
          ["Paid", t.creditPaise],
          ["Balance", t.closingPaise],
        ].map(([k, v]) => (
          <View key={k as string} style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              {k}
            </Text>
            <Text variant="bodyStrong" num tone={k === "Balance" && (v as number) > 0 ? "warning" : undefined}>
              {formatINR(v as number)}
            </Text>
          </View>
        ))}
      </Card>
      <Card padded={false}>
        {ledger.openingPaise ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", padding: space.lg }}>
            <Text tone="muted">Opening balance</Text>
            <Text num>{formatINR(ledger.openingPaise)}</Text>
          </View>
        ) : null}
        {ledger.rows.map((r, i) => (
          <Pressable
            key={`${r.ref}-${i}`}
            onPress={() => router.push(r.href.replace(/^\/api/, "") as Href)}
            android_ripple={{ color: c.surface3 }}
            style={{ flexDirection: "row", gap: space.md, padding: space.lg, borderTopWidth: i || ledger.openingPaise ? StyleSheet.hairlineWidth : 0, borderColor: c.borderStrong, opacity: r.type === "void" ? 0.6 : 1 }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {r.particular}
              </Text>
              <Text variant="caption" tone="muted">
                {formatDate(r.date)} · {r.ref}
                {r.job ? ` · ${r.job.jobNumber}` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              {r.debitPaise ? (
                <Text variant="bodyStrong" num>
                  +{formatINR(r.debitPaise)}
                </Text>
              ) : (
                <Text variant="bodyStrong" num tone="success">
                  −{formatINR(r.creditPaise)}
                </Text>
              )}
              <Text variant="caption" tone="muted" num>
                {formatINR(r.balancePaise)}
              </Text>
            </View>
          </Pressable>
        ))}
        {!ledger.rows.length ? (
          <Text tone="muted" style={{ padding: space.lg }}>
            No entries yet.
          </Text>
        ) : null}
      </Card>
    </View>
  );
}
