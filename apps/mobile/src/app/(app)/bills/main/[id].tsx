import { formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL } from "@av/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { FileDown, Printer } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Badge, Button, Card, ErrorBlock, ListSkeleton, Section, Text } from "@/components/ui";
import { settlementHtml } from "@/lib/print/bills";
import { printHtml, sharePdf } from "@/lib/print/sheet";
import { useMainBill } from "@/lib/queries";
import { space, useTheme } from "@/theme";

/** Final settlement: made automatically once a challan is complete and fully paid. */
export default function SettlementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const q = useMainBill(id);
  const m = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: m?.billNumber ?? "Final settlement" }} />
      {!m ? (
        q.error ? <ErrorBlock error={q.error} onRetry={q.refetch} /> : <ListSkeleton rows={3} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.xl, paddingBottom: space.xxxl * 2 }}>
          <View style={{ alignItems: "center", gap: space.xs, paddingVertical: space.lg }}>
            {m.cancelledAt ? <Badge tone="danger" label="Cancelled" /> : <Badge tone="success" label="Settled" />}
            <Text variant="hero" num style={{ marginTop: space.sm }}>
              {formatINR(m.totalPaise)}
            </Text>
            <Text tone="muted">
              paid to {m.client.name} for {m.job.jobNumber}
            </Text>
            {m.cancelReason ? (
              <Text variant="caption" tone="danger" align="center">
                {m.cancelReason}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Share PDF" icon={FileDown} style={{ flex: 1 }} onPress={() => sharePdf(settlementHtml(m), `${m.billNumber}.pdf`)} />
            <Button title="Print" icon={Printer} variant="secondary" style={{ flex: 1 }} onPress={() => printHtml(settlementHtml(m))} />
          </View>
          <Section title={`Work done · ${m.product.name}`}>
            <Card padded={false}>
              {m.designs.map((d, i) => (
                <View key={d.jobItemId} style={{ padding: space.lg, gap: 3, borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text variant="bodyStrong">{d.designName}</Text>
                    <Text variant="bodyStrong" num>
                      {formatINR(d.paidValuePaise)}
                    </Text>
                  </View>
                  <Text variant="caption" tone="muted" num>
                    Ordered {formatQty(d.quantity)} · Issued {formatQty(d.sent)} · Good {formatQty(d.ok)}
                    {d.damaged + d.rejected + d.lost ? ` · Not good ${formatQty(d.damaged + d.rejected + d.lost)}` : ""} · {formatQty(d.paidQty)} × {formatINR(d.ratePaise)}
                  </Text>
                </View>
              ))}
            </Card>
          </Section>
          <Section title="Payments">
            <Card padded={false}>
              {m.subBills.map((s, i) => (
                <Pressable key={s.id} onPress={() => router.push(`/bills/sub/${s.id}`)} android_ripple={{ color: c.surface2 }} style={{ flexDirection: "row", padding: space.lg, borderTopWidth: i ? 1 : 0, borderColor: c.border, opacity: s.voidedAt ? 0.5 : 1 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{s.billNumber}</Text>
                    <Text variant="caption" tone="muted">
                      {formatDate(s.date)} · {PAYMENT_METHOD_LABEL[s.method]}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" num>
                    {formatINR(s.amountPaise)}
                  </Text>
                </Pressable>
              ))}
            </Card>
          </Section>
        </ScrollView>
      )}
    </View>
  );
}
