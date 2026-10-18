import { DISPATCH_KIND_LABEL, formatDate, formatINR, formatQty, formatShortDate, PAYMENT_METHOD_LABEL, PAYMENT_POLICY_LABEL, type JobDetail, type JobItemView, type TimelineEvent } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowDownToLine, Ban, BookOpen, ChevronRight, EllipsisVertical, IndianRupee, MessageCircle, Pencil, Phone, QrCode, Send, Share2, Truck } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlowBar } from "@/components/domain/flow-bar";
import { JobStatusBadge, PayStatusBadge } from "@/components/domain/status";
import { ActionSheet, AuthedImage, Badge, Button, Card, ErrorBlock, IconButton, ListSkeleton, ReasonSheet, Segmented, Text, toast, type SheetRef } from "@/components/ui";
import { api } from "@/lib/api";
import { call, whatsapp } from "@/lib/contact";
import { invalidateWork, useClientSummary, useJob } from "@/lib/queries";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

type Tab = "designs" | "returns" | "payments" | "timeline";

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const q = useJob(id);
  const j = q.data;
  const menu = useRef<SheetRef>(null);
  const cancelSheet = useRef<SheetRef>(null);
  const qc = useQueryClient();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: j?.jobNumber ?? "Challan",
          headerRight: () => (j ? <IconButton icon={EllipsisVertical} label="More actions" onPress={() => menu.current?.present()} /> : null),
        }}
      />
      {!j ? (
        q.error ? <ErrorBlock error={q.error} onRetry={q.refetch} /> : <ListSkeleton rows={3} />
      ) : (
        <>
          <Body j={j} refreshing={q.isRefetching} onRefresh={q.refetch} />
          <BottomBar j={j} />
          <ActionSheet
            ref={menu}
            title={j.jobNumber}
            actions={[
              { label: "Issue material", icon: Truck, hint: "Initial, additional or rework issue", onPress: () => router.push(`/jobs/${j.id}/issue`), hidden: j.status === "CANCELLED" },
              { label: "Edit challan", icon: Pencil, onPress: () => router.push(`/jobs/${j.id}/edit`), hidden: j.status === "CANCELLED" },
              { label: "Share challan PDF", icon: Share2, onPress: () => router.push(`/jobs/${j.id}/print`) },
              { label: "Challan QR code", icon: QrCode, hint: "Lets the worker see this challan without logging in", onPress: () => router.push(`/jobs/${j.id}/print?qr=1`) },
              { label: "Challan ledger", icon: BookOpen, onPress: () => router.push(`/jobs/${j.id}/ledger`) },
              { label: "Cancel challan", icon: Ban, danger: true, onPress: () => cancelSheet.current?.present(), hidden: j.status === "CANCELLED" || j.status === "COMPLETED" },
            ]}
          />
          <ReasonSheet
            ref={cancelSheet}
            title={`Cancel ${j.jobNumber}?`}
            body="The challan stays in history as cancelled. Nothing is deleted."
            confirmLabel="Cancel challan"
            danger
            onConfirm={async (reason) => {
              await api.post(`/jobs/${j.id}/cancel`, { reason });
              invalidateWork(qc, j.id);
              toast.success(`${j.jobNumber} cancelled`);
            }}
          />
        </>
      )}
    </View>
  );
}

function Body({ j, refreshing, onRefresh }: { j: JobDetail; refreshing: boolean; onRefresh: () => void }) {
  const { c } = useTheme();
  const s = useStyles(styles);
  const [tab, setTab] = useState<Tab>("designs");
  const t = j.totals;
  const worker = useClientSummary(j.client.id).data?.client;

  return (
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.lg, paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[c.accentSolid]} />}>
      {/* Who and what */}
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
          <JobStatusBadge status={j.status} overdue={j.overdue} />
          {j.edited ? <Badge label="Edited" /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => router.push(`/clients/${j.client.id}`)} style={{ flex: 1 }} accessibilityRole="link">
            <Text variant="title" numberOfLines={1}>
              {j.client.name}
            </Text>
            <Text tone="muted" numberOfLines={1}>
              {j.product.name}
              {j.jobWorkType ? ` · ${j.jobWorkType.name}` : ""}
            </Text>
          </Pressable>
          {worker?.phone ? (
            <>
              <IconButton icon={Phone} label={`Call ${j.client.name}`} tone="accent" onPress={() => call(worker.phone!)} />
              <IconButton icon={MessageCircle} label={`WhatsApp ${j.client.name}`} tone="accent" onPress={() => whatsapp(worker.phone!)} />
            </>
          ) : null}
        </View>
        <Text variant="caption" tone="muted">
          Issued {formatDate(j.jobDate)}
          {j.expectedReturnDate ? ` · Expected ${formatDate(j.expectedReturnDate)}` : ""} · {PAYMENT_POLICY_LABEL[j.terms.policy]}
          {j.terms.policy === "DAYS_AFTER_RETURN" ? ` (${j.terms.days} days)` : ""}
        </Text>
        {j.cancelledAt ? (
          <View style={s.banner}>
            <Ban size={16} color={c.danger} />
            <Text variant="label" tone="danger" style={{ flex: 1 }}>
              Cancelled {formatDate(j.cancelledAt)}
              {j.cancelReason ? `: ${j.cancelReason}` : ""}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Material reconciliation */}
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text variant="headline">Material</Text>
          <Text variant="caption" tone="muted" num>
            {formatQty(t.sent)} of {formatQty(t.quantity)} {j.unit} issued
          </Text>
        </View>
        <FlowBar sent={t.sent} ok={t.ok} exceptions={t.exceptions} pending={t.pending} height={10} />
        <View style={s.stats}>
          <Stat label="Good back" value={t.ok} unit={j.unit} color={c.success} />
          <Stat label="Not good" value={t.exceptions} unit={j.unit} color={c.dangerSolid} hint={t.exceptions ? `${formatQty(t.damaged)} dmg · ${formatQty(t.rejected)} rej · ${formatQty(t.lost)} lost` : undefined} />
          <Stat label="Still out" value={t.pending} unit={j.unit} color={c.warningSolid} hint={t.pending && j.daysOut ? `${j.daysOut} days` : undefined} />
        </View>
        {t.notYetSent > 0 && j.status !== "CANCELLED" ? (
          <Pressable onPress={() => router.push(`/jobs/${j.id}/issue`)} style={s.notice} accessibilityRole="button">
            <Truck size={16} color={c.fgMuted} strokeWidth={1.75} />
            <Text variant="label" tone="secondary" style={{ flex: 1 }}>
              {formatQty(t.notYetSent)} {j.unit} not issued yet. Issue material
            </Text>
            <ChevronRight size={16} color={c.fgFaint} />
          </Pressable>
        ) : null}
      </Card>

      {/* Money */}
      <Card style={{ flexDirection: "row", gap: space.md }}>
        <Money label="Work value" value={j.money.valuePaise} />
        <Money label="Paid" value={j.money.paidPaise} />
        {j.money.advancePaise > 0 ? <Money label="Advance" value={j.money.advancePaise} tone="info" /> : <Money label="To pay" value={j.money.outstandingPaise} tone={j.money.outstandingPaise ? "warning" : undefined} />}
      </Card>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "designs", label: `Designs ${j.items.length}` },
          { value: "returns", label: `Returns ${j.returns.length}` },
          { value: "payments", label: "Paid" },
          { value: "timeline", label: "History" },
        ]}
      />
      {tab === "designs" ? <Designs j={j} /> : tab === "returns" ? <Returns j={j} /> : tab === "payments" ? <Payments j={j} /> : <Timeline events={j.timeline} />}
    </ScrollView>
  );
}

function Stat({ label, value, unit, color, hint }: { label: string; value: number; unit: string; color: string; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      </View>
      <Text variant="headline" num>
        {formatQty(value)} <Text variant="caption" tone="muted">{unit}</Text>
      </Text>
      {hint ? (
        <Text variant="caption" tone="faint" numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function Money({ label, value, tone }: { label: string; value: number; tone?: "warning" | "info" }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="headline" num numberOfLines={1} adjustsFontSizeToFit tone={tone}>
        {formatINR(value)}
      </Text>
    </View>
  );
}

function Designs({ j }: { j: JobDetail }) {
  return (
    <View style={{ gap: space.sm + 2 }}>
      {j.items.map((it) => (
        <DesignCard key={it.id} it={it} />
      ))}
    </View>
  );
}

function DesignCard({ it }: { it: JobItemView }) {
  return (
    <Card style={{ gap: space.sm + 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{it.designName}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {it.material ? `${it.material.code} · ${it.material.name}` : "No material"}
            {it.jobWorkType ? ` · ${it.jobWorkType.name}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="bodyStrong" num>
            {formatINR(it.ratePaise)}
          </Text>
          <Text variant="caption" tone="muted">
            per {it.unit}
          </Text>
        </View>
      </View>
      <FlowBar sent={it.sent} ok={it.ok} exceptions={it.exceptions} pending={it.pending} />
      <Text variant="caption" tone="secondary" num>
        Ordered {formatQty(it.quantity)} · Issued {formatQty(it.sent)} · Good {formatQty(it.ok)}
        {it.exceptions ? ` · Not good ${formatQty(it.exceptions)}` : ""} · <Text variant="caption" tone={it.pending ? "secondary" : "muted"}>Out {formatQty(it.pending)}</Text>
      </Text>
      {it.photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {it.photos.map((p) => (
            <View key={p.id} style={{ gap: 2 }}>
              <AuthedImage path={`/job-photos/${p.id}/thumb`} size={64} />
              <Text variant="caption" tone="faint" style={{ fontSize: 10 }}>
                {p.kind === "DESIGN" ? "Design" : "Item"}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {it.notes ? (
        <Text variant="caption" tone="muted">
          {it.notes}
        </Text>
      ) : null}
    </Card>
  );
}

function Returns({ j }: { j: JobDetail }) {
  const { c } = useTheme();
  if (!j.returns.length) return <Text tone="muted" style={{ padding: space.sm }}>Nothing returned yet.</Text>;
  return (
    <Card padded={false}>
      {j.returns.map((r, i) => (
        <Pressable
          key={r.id}
          onPress={() => router.push(`/returns/${r.id}`)}
          android_ripple={{ color: c.surface2 }}
          style={{ flexDirection: "row", gap: space.md, padding: space.lg, borderTopWidth: i ? 1 : 0, borderColor: c.border, opacity: r.voidedAt ? 0.5 : 1 }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{r.returnNumber}</Text>
            <Text variant="caption" tone="muted">
              {formatShortDate(r.date)} · {formatQty(r.okQty)} good
              {r.damagedQty + r.rejectedQty + r.lostQty ? ` · ${formatQty(r.damagedQty + r.rejectedQty + r.lostQty)} not good` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text variant="bodyStrong" num>
              {formatINR(r.valuePaise)}
            </Text>
            {r.voidedAt ? <Badge tone="danger" label="Voided" /> : r.payment ? <PayStatusBadge status={r.payment.status} /> : null}
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

function Payments({ j }: { j: JobDetail }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.sm + 2 }}>
      {j.mainBill ? (
        <Card onPress={() => router.push(`/bills/main/${j.mainBill!.id}`)} style={{ backgroundColor: c.successSubtle }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text variant="bodyStrong">Final settlement {j.mainBill.billNumber}</Text>
              <Text variant="caption" tone="muted">
                {j.mainBill.cancelledAt ? "Cancelled" : "Challan settled"}
              </Text>
            </View>
            <Text variant="bodyStrong" num>
              {formatINR(j.mainBill.totalPaise)}
            </Text>
          </View>
        </Card>
      ) : null}
      {j.subBills.length ? (
        <Card padded={false}>
          {j.subBills.map((b, i) => (
            <Pressable
              key={b.id}
              onPress={() => router.push(`/bills/sub/${b.id}`)}
              android_ripple={{ color: c.surface2 }}
              style={{ flexDirection: "row", gap: space.md, padding: space.lg, borderTopWidth: i ? 1 : 0, borderColor: c.border, opacity: b.voidedAt ? 0.5 : 1 }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{b.billNumber}</Text>
                <Text variant="caption" tone="muted">
                  {formatShortDate(b.date)} · {PAYMENT_METHOD_LABEL[b.method]}
                  {b.returnNumber ? ` · ${b.returnNumber}` : ""}
                </Text>
              </View>
              <Text variant="bodyStrong" num style={b.voidedAt ? { textDecorationLine: "line-through" } : undefined}>
                {formatINR(b.amountPaise)}
              </Text>
            </Pressable>
          ))}
        </Card>
      ) : (
        <Text tone="muted" style={{ padding: space.sm }}>
          No payments on this challan yet.
        </Text>
      )}
    </View>
  );
}

function timelineText(e: TimelineEvent): { title: string; sub?: string; href?: string; voided?: boolean } {
  switch (e.type) {
    case "dispatch":
      return { title: `${DISPATCH_KIND_LABEL[e.kind]}: ${formatQty(e.total)}`, sub: e.lines.map((l) => `${l.designName} ${formatQty(l.qty)}`).join(", "), voided: !!e.voided };
    case "return":
      return { title: `${e.returnNumber}: ${formatQty(e.okTotal)} good${e.exceptionTotal ? `, ${formatQty(e.exceptionTotal)} not good` : ""}`, sub: formatINR(e.valuePaise), href: `/returns/${e.id}`, voided: !!e.voided };
    case "sub_bill":
      return { title: `Paid ${formatINR(e.amountPaise)} · ${e.billNumber}`, sub: PAYMENT_METHOD_LABEL[e.method], href: `/bills/sub/${e.id}`, voided: !!e.voided };
    case "main_bill":
      return { title: `Final settlement ${e.billNumber}`, sub: formatINR(e.totalPaise), href: `/bills/main/${e.id}`, voided: e.cancelled };
    case "audit":
      return { title: e.text, sub: e.by ?? undefined };
    default:
      return { title: e.text };
  }
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  const { c } = useTheme();
  return (
    <Card>
      {[...events].reverse().map((e, i, all) => {
        const t = timelineText(e);
        return (
          <Pressable key={`${e.type}-${e.at}-${i}`} disabled={!t.href} onPress={() => t.href && router.push(t.href as never)} style={{ flexDirection: "row", gap: space.md }}>
            <View style={{ alignItems: "center", width: 12 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 6, backgroundColor: t.voided ? c.fgFaint : e.type === "return" ? c.success : e.type === "sub_bill" || e.type === "main_bill" ? c.accent : c.fgMuted }} />
              {i < all.length - 1 ? <View style={{ flex: 1, width: 1.5, backgroundColor: c.border, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: space.lg, gap: 1 }}>
              <Text variant="bodyStrong" style={t.voided ? { textDecorationLine: "line-through", color: c.fgMuted } : undefined}>
                {t.title}
              </Text>
              {t.sub ? (
                <Text variant="caption" tone="muted">
                  {t.sub}
                </Text>
              ) : null}
              <Text variant="caption" tone="faint">
                {new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
                {t.voided ? " · voided" : ""}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

/** The next step for this challan, in the thumb zone. */
function BottomBar({ j }: { j: JobDetail }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (j.status === "CANCELLED") return null;
  const canReturn = j.totals.pending > 0;
  const due = j.money.outstandingPaise;
  const notIssued = j.totals.sent === 0;
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: space.sm, padding: space.gutter, paddingBottom: insets.bottom + space.md, backgroundColor: c.bg, borderTopWidth: 1, borderColor: c.border }}>
      {notIssued ? (
        <Button title="Issue material" icon={Send} size="lg" style={{ flex: 1 }} onPress={() => router.push(`/jobs/${j.id}/issue`)} />
      ) : (
        <>
          {due > 0 ? (
            <Button title={canReturn ? formatINR(due) : `Pay ${formatINR(due)}`} icon={IndianRupee} variant={canReturn ? "secondary" : "primary"} size="lg" style={{ flex: canReturn ? 0 : 1 }} onPress={() => router.push(`/bills/new?clientId=${j.client.id}&jobId=${j.id}`)} />
          ) : null}
          {canReturn ? <Button title="Record return" icon={ArrowDownToLine} size="lg" style={{ flex: 1 }} onPress={() => router.push(`/returns/new?job=${j.id}`)} /> : null}
          {!canReturn && due === 0 ? <Button title={j.status === "COMPLETED" ? "Completed & settled" : "Nothing pending"} variant="secondary" size="lg" disabled style={{ flex: 1 }} /> : null}
        </>
      )}
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    stats: { flexDirection: "row", gap: space.md },
    banner: { flexDirection: "row", gap: space.sm, alignItems: "center", padding: space.md, borderRadius: radius.control, backgroundColor: c.dangerSubtle },
    notice: { flexDirection: "row", gap: space.sm, alignItems: "center", padding: space.md, borderRadius: radius.control, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border },
  });
