import { amountInWords, formatDate, formatINR, PAYMENT_METHOD_LABEL, type SubBillDetail } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Ban, EllipsisVertical, FileDown, Pencil, Printer, ShieldAlert } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActionSheet, Badge, Card, ErrorBlock, IconButton, ListSkeleton, ReasonSheet, Section, Text, toast, type SheetRef } from "@/components/ui";
import { api } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { voucherHtml } from "@/lib/print/bills";
import { printHtml, sharePdf } from "@/lib/print/sheet";
import { invalidateWork, useSubBill } from "@/lib/queries";
import { radius, space, useTheme } from "@/theme";

export default function VoucherScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const q = useSubBill(id);
  const b = q.data;
  const { isOwner } = useRole();
  const menu = useRef<SheetRef>(null);
  const voidSheet = useRef<SheetRef>(null);
  const qc = useQueryClient();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: b?.billNumber ?? "Payment voucher", headerRight: () => (b ? <IconButton icon={EllipsisVertical} label="More actions" onPress={() => menu.current?.present()} /> : null) }} />
      {!b ? (
        q.error ? <ErrorBlock error={q.error} onRetry={q.refetch} /> : <ListSkeleton rows={3} />
      ) : (
        <>
          <Body b={b} refreshing={q.isRefetching} onRefresh={q.refetch} isOwner={isOwner} />
          <ActionSheet
            ref={menu}
            title={b.billNumber}
            actions={[
              { label: "Share PDF", icon: FileDown, onPress: () => sharePdf(voucherHtml(b), `${b.billNumber}.pdf`) },
              { label: "Print", icon: Printer, onPress: () => printHtml(voucherHtml(b)) },
              { label: "Edit payment", icon: Pencil, hint: "Owner only · a reason is required", onPress: () => router.push(`/bills/sub/${b.id}/edit`), hidden: !isOwner || !!b.voidedAt },
              { label: "Void payment", icon: Ban, danger: true, onPress: () => voidSheet.current?.present(), hidden: !isOwner || !!b.voidedAt },
            ]}
          />
          <ReasonSheet
            ref={voidSheet}
            title={`Void ${b.billNumber}?`}
            body="The amount counts as unpaid again. A final settlement on this challan is cancelled. Nothing is deleted."
            confirmLabel="Void payment"
            danger
            onConfirm={async (reason) => {
              await api.post(`/sub-bills/${b.id}/void`, { reason });
              invalidateWork(qc, b.job.id);
              qc.invalidateQueries({ queryKey: ["sub-bill", b.id] });
              toast.success(`${b.billNumber} voided`);
            }}
          />
        </>
      )}
    </View>
  );
}

function Body({ b, refreshing, onRefresh, isOwner }: { b: SubBillDetail; refreshing: boolean; onRefresh: () => void; isOwner: boolean }) {
  const { c } = useTheme();
  const m = b.challanMoney;
  const kv = (k: string, v: string, onPress?: () => void) => (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: space.sm, gap: space.md }}>
      <Text tone="muted">{k}</Text>
      <Text tone={onPress ? "accent" : "default"} style={{ flexShrink: 1, textAlign: "right" }}>
        {v}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.xl, paddingBottom: space.xxxl * 2 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[c.accentSolid]} />}>
      <View style={{ alignItems: "center", gap: space.xs, paddingVertical: space.lg }}>
        {b.voidedAt ? <Badge tone="danger" label="Voided" /> : b.edited ? <Badge label={`Edited${b.edited.by ? ` by ${b.edited.by}` : ""}`} /> : <Badge tone="success" label="Paid" />}
        <Text variant="display" num style={[{ fontSize: 40, lineHeight: 48, marginTop: space.sm }, b.voidedAt ? { textDecorationLine: "line-through", color: c.fgMuted } : null]}>
          {formatINR(b.amountPaise)}
        </Text>
        <Text tone="muted" align="center" style={{ fontStyle: "italic", paddingHorizontal: space.xl }}>
          {amountInWords(b.amountPaise)}
        </Text>
        <Pressable onPress={() => router.push(`/clients/${b.client.id}`)}>
          <Text variant="headline" tone="accent" style={{ marginTop: space.sm }}>
            to {b.client.name}
          </Text>
        </Pressable>
      </View>

      {b.voidedAt ? (
        <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: c.dangerSubtle }}>
          <Text variant="label" tone="danger">
            Voided {formatDate(b.voidedAt)}
            {b.voidedBy ? ` by ${b.voidedBy}` : ""}
            {b.voidReason ? `: ${b.voidReason}` : ""}
          </Text>
        </View>
      ) : null}

      <Card padded={false} style={{ paddingHorizontal: space.lg, paddingVertical: space.xs }}>
        {kv("Date", formatDate(b.date))}
        {kv("Paid by", `${PAYMENT_METHOD_LABEL[b.method]}${b.reference ? ` · ${b.reference}` : ""}`)}
        {kv("Challan", `${b.job.jobNumber} · ${b.job.productName}`, () => router.push(`/jobs/${b.job.id}`))}
        {b.returnId ? kv("Return", b.returnNumber ?? "", () => router.push(`/returns/${b.returnId}`)) : null}
        {b.mainBill ? kv("Final settlement", `${b.mainBill.billNumber}${b.mainBill.cancelled ? " (cancelled)" : ""}`, () => router.push(`/bills/main/${b.mainBill!.id}`)) : null}
        {b.advanceReason ? kv("Advance reason", b.advanceReason) : null}
        {b.notes ? kv("Notes", b.notes) : null}
        {b.enteredBy ? kv("Entered by", b.enteredBy) : null}
      </Card>

      <Section title="Challan account">
        <Card style={{ flexDirection: "row", gap: space.md }}>
          {[
            ["Work value", m.valuePaise],
            ["Paid to date", m.paidPaise],
            [m.advancePaise ? "Advance" : "Outstanding", m.advancePaise || m.outstandingPaise],
          ].map(([k, v]) => (
            <View key={k as string} style={{ flex: 1 }}>
              <Text variant="caption" tone="muted">
                {k}
              </Text>
              <Text variant="bodyStrong" num>
                {formatINR(v as number)}
              </Text>
            </View>
          ))}
        </Card>
      </Section>

      {!isOwner && !b.voidedAt ? (
        <View style={{ flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface2 }}>
          <ShieldAlert size={16} color={c.fgMuted} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            Only the owner can change or void a payment.
          </Text>
        </View>
      ) : null}

      <Section title="History">
        <Card style={{ gap: space.md }}>
          {b.history.map((h, i) => (
            <View key={i}>
              <Text variant="bodyStrong">{h.summary ?? h.action}</Text>
              {h.reason ? (
                <Text variant="caption" tone="secondary">
                  Reason: {h.reason}
                </Text>
              ) : null}
              <Text variant="caption" tone="faint">
                {new Date(h.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
                {h.user ? ` · ${h.user}` : ""}
              </Text>
            </View>
          ))}
          {b.notifications.map((n) => (
            <View key={n.id} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong, paddingTop: space.sm }}>
              <Text variant="label">
                {n.channel} · {n.status}
                {n.recipient ? ` · ${n.recipient}` : ""}
              </Text>
              {n.error ? (
                <Text variant="caption" tone="danger">
                  {n.error}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      </Section>
    </ScrollView>
  );
}
