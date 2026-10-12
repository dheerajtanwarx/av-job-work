import { formatDate, formatINR, formatQty, formatShortDate, PAYMENT_METHOD_LABEL, type ClientSummary } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { Archive, ArchiveRestore, EllipsisVertical, FilePlus2, IndianRupee, Mail, MessageCircle, Pencil, Phone } from "lucide-react-native";
import { useRef, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlowBar } from "@/components/domain/flow-bar";
import { LedgerView } from "@/components/domain/ledger";
import { JobStatusBadge } from "@/components/domain/status";
import { ActionSheet, AuthedImage, Badge, Button, Card, ChipRow, Chip, ErrorBlock, IconButton, ListSkeleton, Text, toast, type SheetRef } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { call, whatsapp } from "@/lib/contact";
import { useClientLedger, useClientMaterial, useClientPerformance, useClientSummary } from "@/lib/queries";
import { termsLabel } from "@/lib/terms";
import { radius, space, useTheme } from "@/theme";

type Tab = "overview" | "material" | "challans" | "payments" | "ledger" | "performance";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "material", label: "Material" },
  { value: "challans", label: "Challans" },
  { value: "payments", label: "Payments" },
  { value: "ledger", label: "Ledger" },
  { value: "performance", label: "Performance" },
];

export default function WorkerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const q = useClientSummary(id);
  const d = q.data;
  const menu = useRef<SheetRef>(null);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  const setActive = async (isActive: boolean) => {
    try {
      await api.put(`/clients/${id}`, { isActive });
      qc.invalidateQueries({ queryKey: ["client", id] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(isActive ? "Reactivated" : "Archived");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d?.client.workerCode ?? "Job worker", headerRight: () => (d ? <IconButton icon={EllipsisVertical} label="More actions" onPress={() => menu.current?.present()} /> : null) }} />
      {!d ? (
        q.error ? <ErrorBlock error={q.error} onRetry={q.refetch} /> : <ListSkeleton rows={3} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 110, gap: space.lg }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} colors={[c.accentSolid]} />}>
            <Hero d={d} />
            <ChipRow>
              {TABS.map((t) => (
                <Chip key={t.value} label={t.label} selected={tab === t.value} onPress={() => setTab(t.value)} />
              ))}
            </ChipRow>
            <View style={{ paddingHorizontal: space.gutter, gap: space.md }}>
              {tab === "overview" ? <Overview d={d} /> : tab === "material" ? <Material id={id} /> : tab === "challans" ? <Challans d={d} /> : tab === "payments" ? <Payments d={d} /> : tab === "ledger" ? <Ledger id={id} /> : <Performance id={id} />}
            </View>
          </ScrollView>
          <BottomBar d={d} />
          <ActionSheet
            ref={menu}
            title={d.client.name}
            actions={[
              { label: "Edit details", icon: Pencil, onPress: () => router.push(`/clients/${id}/edit`) },
              { label: "Email", icon: Mail, onPress: () => Linking.openURL(`mailto:${d.client.email}`), hidden: !d.client.email },
              d.client.isActive ? { label: "Archive", icon: Archive, hint: "Hidden from pickers; history stays", danger: true, onPress: () => setActive(false) } : { label: "Reactivate", icon: ArchiveRestore, onPress: () => setActive(true) },
            ]}
          />
        </>
      )}
    </View>
  );
}

function Hero({ d }: { d: ClientSummary }) {
  const { c } = useTheme();
  const w = d.client;
  const initials = w.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View style={{ paddingHorizontal: space.gutter, gap: space.lg }}>
      <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
        {w.photoId ? (
          <Pressable onPress={() => router.push(`/worker-doc/${w.photoId}` as Href)}>
            <AuthedImage path={`/worker-documents/${w.photoId}/thumb`} style={{ width: 72, height: 72, borderRadius: 36 }} />
          </Pressable>
        ) : (
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.accentSubtle, alignItems: "center", justifyContent: "center" }}>
            <Text variant="title" tone="accent">
              {initials}
            </Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title">{w.name}</Text>
          <Text tone="muted" numberOfLines={2}>
            {[w.businessName, w.workItems].filter(Boolean).join(" · ") || w.workerCode}
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: 4 }}>
            {!w.isActive ? <Badge tone="danger" label="Archived" /> : null}
            <Badge label={termsLabel(w.paymentPolicy, w.paymentDays) === "—" ? "Default terms" : termsLabel(w.paymentPolicy, w.paymentDays)} />
          </View>
        </View>
      </View>
      {w.phone ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="Call" icon={Phone} variant="secondary" style={{ flex: 1 }} onPress={() => call(w.phone!)} />
          <Button title="WhatsApp" icon={MessageCircle} variant="secondary" style={{ flex: 1 }} onPress={() => whatsapp(w.phone!)} />
        </View>
      ) : (
        <Button title="Add mobile number" variant="secondary" onPress={() => router.push(`/clients/${w.id}/edit`)} />
      )}
      <Card style={{ flexDirection: "row", gap: space.md }}>
        <Metric label="Material out" value={`${formatQty(d.totals.pending)}`} />
        <Metric label="Work done" value={formatINR(d.totals.completedValuePaise)} />
        <Metric label="To pay" value={formatINR(d.totals.toPayPaise)} warn={d.totals.toPayPaise > 0} />
      </Card>
    </View>
  );
}

const Metric = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <View style={{ flex: 1 }}>
    <Text variant="caption" tone="muted">
      {label}
    </Text>
    <Text variant="headline" num tone={warn ? "warning" : undefined} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  </View>
);

function Overview({ d }: { d: ClientSummary }) {
  const { c } = useTheme();
  const w = d.client;
  const { isManager } = useRole();
  const active = d.jobs.filter((j) => j.status === "IN_PROGRESS" || j.status === "PARTIALLY_RECEIVED" || j.status === "DRAFT");
  return (
    <>
      <Text variant="headline">Active challans</Text>
      {active.length ? active.map((j) => <JobMini key={j.id} j={j} />) : <Text tone="muted">No active challans.</Text>}
      <Text variant="headline" style={{ marginTop: space.md }}>
        Details
      </Text>
      <Card style={{ gap: space.sm }}>
        {(
          [
            ["Code", w.workerCode],
            ["Mobile", [w.phone, w.alternatePhone].filter(Boolean).join(", ")],
            ["Email", w.email],
            ["Address", w.address],
            ["GSTIN", w.gstin],
            ["PAN", w.pan],
            ["Notes", w.notes],
          ] as [string, string | null][]
        )
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", gap: space.md }}>
              <Text tone="muted" style={{ width: 70 }}>
                {k}
              </Text>
              <Text style={{ flex: 1 }}>{v}</Text>
            </View>
          ))}
      </Card>
      {isManager && (w.aadhaarFrontId || w.aadhaarBackId) ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {[w.aadhaarFrontId, w.aadhaarBackId].filter(Boolean).map((docId) => (
            <Pressable key={docId} style={{ flex: 1 }} onPress={() => router.push(`/worker-doc/${docId}` as Href)} accessibilityLabel="Aadhaar photo">
              <AuthedImage path={`/worker-documents/${docId}/thumb`} style={{ width: "100%", aspectRatio: 1.58, borderRadius: radius.md }} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text variant="headline" style={{ marginTop: space.md }}>
        Recent activity
      </Text>
      <Card padded={false}>
        {d.timeline.slice(0, 12).map((t, i) => (
          <Pressable key={i} onPress={() => router.push(t.href as Href)} android_ripple={{ color: c.surface3 }} style={{ flexDirection: "row", padding: space.md + 2, gap: space.md, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: c.borderStrong }}>
            <Text variant="caption" tone="muted" style={{ width: 48 }}>
              {formatShortDate(t.date)}
            </Text>
            <Text style={{ flex: 1 }} numberOfLines={2}>
              {t.text}
            </Text>
            {t.amountPaise ? (
              <Text variant="label" num>
                {formatINR(t.amountPaise)}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </Card>
    </>
  );
}

function JobMini({ j }: { j: ClientSummary["jobs"][number] }) {
  return (
    <Card onPress={() => router.push(`/jobs/${j.id}`)} contentStyle={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="bodyStrong">
          {j.jobNumber} · {j.product.name}
        </Text>
        <JobStatusBadge status={j.status} overdue={j.overdue} />
      </View>
      <FlowBar sent={j.totals.sent} ok={j.totals.ok} exceptions={j.totals.exceptions} pending={j.totals.pending} />
      <Text variant="caption" tone="muted" num>
        {formatQty(j.totals.pending)} {j.unit} out · {formatDate(j.jobDate)}
        {j.money.outstandingPaise ? ` · ${formatINR(j.money.outstandingPaise)} to pay` : ""}
      </Text>
    </Card>
  );
}

function Material({ id }: { id: string }) {
  const q = useClientMaterial(id);
  if (!q.data) return <ListSkeleton rows={2} />;
  if (!q.data.length) return <Text tone="muted">No material with this worker.</Text>;
  return (
    <>
      {q.data.map((m) => (
        <Card key={`${m.materialId}-${m.unit}`} style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {m.materialName}
            </Text>
            <Text variant="bodyStrong" num tone={m.pending ? "warning" : undefined}>
              {formatQty(m.pending)} {m.unit} out
            </Text>
          </View>
          <FlowBar sent={m.issued} ok={m.returned} exceptions={m.damaged + m.rejected + m.lost} pending={m.pending} />
          <Text variant="caption" tone="muted" num>
            Issued {formatQty(m.issued)} · Back {formatQty(m.returned)}
            {m.damaged + m.rejected + m.lost ? ` · Not good ${formatQty(m.damaged + m.rejected + m.lost)}` : ""} · {m.challans} challan{m.challans === 1 ? "" : "s"}
            {m.pending ? ` · ${m.daysOutside} days · ${formatINR(m.valuePaise)}` : ""}
          </Text>
        </Card>
      ))}
    </>
  );
}

function Challans({ d }: { d: ClientSummary }) {
  return d.jobs.length ? (
    <>
      {d.jobs.map((j) => (
        <JobMini key={j.id} j={j} />
      ))}
    </>
  ) : (
    <Text tone="muted">No challans yet.</Text>
  );
}

function Payments({ d }: { d: ClientSummary }) {
  const { c } = useTheme();
  if (!d.subBills.length) return <Text tone="muted">No payments yet.</Text>;
  return (
    <Card padded={false}>
      {d.subBills.map((b, i) => (
        <Pressable key={b.id} onPress={() => router.push(`/bills/sub/${b.id}`)} android_ripple={{ color: c.surface3 }} style={{ flexDirection: "row", padding: space.lg, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: c.borderStrong, opacity: b.voidedAt ? 0.5 : 1 }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">
              {b.billNumber} · {b.job.jobNumber}
            </Text>
            <Text variant="caption" tone="muted">
              {formatDate(b.date)} · {PAYMENT_METHOD_LABEL[b.method]}
            </Text>
          </View>
          <Text variant="bodyStrong" num>
            {formatINR(b.amountPaise)}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}

function Ledger({ id }: { id: string }) {
  const q = useClientLedger(id);
  return q.data ? <LedgerView ledger={q.data} /> : <ListSkeleton rows={3} />;
}

function Performance({ id }: { id: string }) {
  const q = useClientPerformance(id);
  const p = q.data;
  if (!p) return <ListSkeleton rows={2} />;
  const rows: [string, string][] = [
    ["Challans", String(p.challans)],
    ["Average completion", p.avgCompletionDays != null ? `${p.avgCompletionDays} days` : "—"],
    ["First return after", p.avgFirstReturnDays != null ? `${p.avgFirstReturnDays} days` : "—"],
    ["Final return after", p.avgFinalReturnDays != null ? `${p.avgFinalReturnDays} days` : "—"],
    ["Defects (damaged + lost)", p.defectPct != null ? `${p.defectPct}%` : "—"],
    ["Rejections", p.rejectionPct != null ? `${p.rejectionPct}%` : "—"],
    ["Rework", p.reworkPct != null ? `${p.reworkPct}% · ${p.reworkChallans} challans` : "—"],
    ["Overdue challans", String(p.overdueChallans)],
    ["Total work", formatINR(p.totalWorkPaise)],
    ["Total paid", formatINR(p.totalPaidPaise)],
  ];
  return (
    <Card style={{ gap: space.sm }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text tone="muted">{k}</Text>
          <Text variant="bodyStrong" num>
            {v}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function BottomBar({ d }: { d: ClientSummary }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!d.client.isActive) return null;
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: space.sm, padding: space.gutter, paddingBottom: insets.bottom + space.md, backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong }}>
      <Button title="New challan" icon={FilePlus2} variant="secondary" size="lg" style={{ flex: 1 }} onPress={() => router.push(`/jobs/new?clientId=${d.client.id}`)} />
      <Button title={d.totals.toPayPaise ? `Pay ${formatINR(d.totals.toPayPaise)}` : "Payment"} icon={IndianRupee} size="lg" style={{ flex: 1 }} onPress={() => router.push(`/bills/new?clientId=${d.client.id}`)} />
    </View>
  );
}
