import { formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL, type ReturnDetail } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Ban, Camera, EllipsisVertical, FileDown, IndianRupee, MessageCircle, Pencil } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PayStatusBadge } from "@/components/domain/status";
import { ActionSheet, AuthedImage, Badge, Button, Card, ErrorBlock, IconButton, ListSkeleton, ReasonSheet, Section, Text, toast, type SheetRef } from "@/components/ui";
import { api } from "@/lib/api";
import { downloadAndShare } from "@/lib/files";
import { invalidateWork, useReturn } from "@/lib/queries";
import { compressPhoto, uploads, useUploads } from "@/lib/uploads";
import { sendWhatsApp } from "@/lib/whatsapp";
import { radius, space, useTheme } from "@/theme";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export default function ReturnScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const q = useReturn(id);
  const r = q.data;
  const menu = useRef<SheetRef>(null);
  const voidSheet = useRef<SheetRef>(null);
  const qc = useQueryClient();

  const addPhotos = async (r: ReturnDetail, camera: boolean) => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return toast.error("Allow camera access to take photos");
    const res = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10 });
    if (res.canceled) return;
    const lineId = r.lines.length === 1 ? r.lines[0].id : null;
    const uris = await Promise.all(res.assets.map((a) => compressPhoto(a.uri)));
    uploads.enqueue(uris.map((uri) => ({ uri, target: { kind: "return", returnId: r.id, returnLineId: lineId } })));
    toast.info(`Uploading ${uris.length} photo${uris.length === 1 ? "" : "s"}…`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: r?.returnNumber ?? "Return", headerRight: () => (r ? <IconButton icon={EllipsisVertical} label="More actions" onPress={() => menu.current?.present()} /> : null) }} />
      {!r ? (
        q.error ? <ErrorBlock error={q.error} onRetry={q.refetch} /> : <ListSkeleton rows={3} />
      ) : (
        <>
          <Body r={r} refreshing={q.isRefetching} onRefresh={q.refetch} />
          {!r.voidedAt ? <BottomBar r={r} /> : null}
          <ActionSheet
            ref={menu}
            title={r.returnNumber}
            actions={[
              { label: "Share receipt PDF", icon: FileDown, onPress: () => downloadAndShare(`/returns/${r.id}/pdf`, `${r.returnNumber}.pdf`) },
              { label: "Take photo", icon: Camera, onPress: () => addPhotos(r, true), hidden: !!r.voidedAt },
              { label: "Add photos from gallery", icon: Camera, onPress: () => addPhotos(r, false), hidden: !!r.voidedAt },
              { label: "Edit return", icon: Pencil, hint: "Quantities, rate, date (a reason is required)", onPress: () => router.push(`/returns/${r.id}/edit`), hidden: !!r.voidedAt },
              { label: "Void return", icon: Ban, danger: true, onPress: () => voidSheet.current?.present(), hidden: !!r.voidedAt },
            ]}
          />
          <ReasonSheet
            ref={voidSheet}
            title={`Void ${r.returnNumber}?`}
            body="The pieces count as still outside again. Any final settlement on the challan is cancelled. Nothing is deleted."
            confirmLabel="Void return"
            danger
            onConfirm={async (reason) => {
              await api.post(`/returns/${r.id}/void`, { reason });
              invalidateWork(qc, r.job.id);
              qc.invalidateQueries({ queryKey: ["return", r.id] });
              toast.success(`${r.returnNumber} voided`);
            }}
          />
        </>
      )}
    </View>
  );
}

function Body({ r, refreshing, onRefresh }: { r: ReturnDetail; refreshing: boolean; onRefresh: () => void }) {
  const { c } = useTheme();
  const pending = useUploads((i) => i.target.kind === "return" && i.target.returnId === r.id && i.status !== "done");
  const bad = r.damagedQty + r.rejectedQty + r.lostQty;
  return (
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.xl, paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[c.accentSolid]} />}>
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: "row", gap: space.sm }}>{r.voidedAt ? <Badge tone="danger" label="Voided" /> : r.payment ? <PayStatusBadge status={r.payment.status} /> : null}{r.editedAt ? <Badge label="Edited" /> : null}</View>
        <Pressable onPress={() => router.push(`/clients/${r.client.id}`)} accessibilityRole="link">
          <Text variant="title">{r.client.name}</Text>
        </Pressable>
        <Pressable onPress={() => router.push(`/jobs/${r.job.id}`)} accessibilityRole="link">
          <Text tone="accent">
            {r.job.jobNumber} · {r.productName}
          </Text>
        </Pressable>
        <Text variant="caption" tone="muted">
          Received {formatDate(r.date)}, {time(r.receivedAt)}
          {r.enteredBy ? ` · by ${r.enteredBy}` : ""}
        </Text>
        {r.voidedAt ? (
          <View style={{ padding: space.md, borderRadius: radius.control, backgroundColor: c.dangerSubtle, marginTop: space.sm }}>
            <Text variant="label" tone="danger">
              Voided {formatDate(r.voidedAt)}
              {r.voidReason ? `: ${r.voidReason}` : ""}
            </Text>
          </View>
        ) : null}
      </View>

      <Card style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            Good
          </Text>
          <Text variant="headline" num>
            {formatQty(r.okQty)} <Text variant="caption" tone="muted">{r.unit}</Text>
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            Not good
          </Text>
          <Text variant="headline" num>
            {formatQty(bad)}
          </Text>
        </View>
        <View style={{ flex: 1.3, alignItems: "flex-end" }}>
          <Text variant="caption" tone="muted">
            Work value
          </Text>
          <Text variant="headline" num>
            {formatINR(r.valuePaise)}
          </Text>
          {r.payment && r.payment.outstandingPaise > 0 ? (
            <Text variant="caption" tone="warning" num>
              {formatINR(r.payment.outstandingPaise)} to pay
            </Text>
          ) : null}
        </View>
      </Card>

      <Section title="Designs">
        <Card padded={false}>
          {r.lines.map((l, i) => (
            <View key={l.id} style={{ padding: space.lg, gap: 4, borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text variant="bodyStrong">{l.designName}</Text>
                <Text variant="bodyStrong" num>
                  {formatINR(l.valuePaise)}
                </Text>
              </View>
              <Text variant="caption" tone="muted" num>
                Good {formatQty(l.okQty)}
                {l.damagedQty ? ` · Damaged ${formatQty(l.damagedQty)}` : ""}
                {l.rejectedQty ? ` · Rejected ${formatQty(l.rejectedQty)}` : ""}
                {l.lostQty ? ` · Lost ${formatQty(l.lostQty)}` : ""} · {formatQty(l.payableQty)} payable × {formatINR(l.ratePaise)}
              </Text>
              {l.ratePaise !== l.challanRatePaise ? (
                <Text variant="caption" tone="warning">
                  Challan rate was {formatINR(l.challanRatePaise)}
                </Text>
              ) : null}
              {l.exceptionReason ? (
                <Text variant="caption" tone="muted">
                  Over pending: {l.exceptionReason}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      </Section>

      <Section title={`Photos${r.photos.length ? ` · ${r.photos.length}` : ""}`}>
        {pending.length ? (
          <Text variant="caption" tone={pending.some((p) => p.status === "error") ? "danger" : "muted"}>
            {pending.some((p) => p.status === "error") ? "Some photos failed to upload." : `Uploading ${pending.length} photo${pending.length === 1 ? "" : "s"}…`}
          </Text>
        ) : null}
        {r.photos.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {r.photos.map((p) => (
              <Pressable key={p.id} onPress={() => router.push(`/photo/${p.id}`)} style={{ width: "31.5%", aspectRatio: 1 }} accessibilityLabel={`Photo of ${p.design?.name ?? "return"}`}>
                <AuthedImage path={`/photos/${p.id}/thumb`} style={{ width: "100%", height: "100%", borderRadius: radius.control, opacity: p.voidedAt ? 0.4 : 1 }} />
              </Pressable>
            ))}
          </View>
        ) : !pending.length ? (
          <Text tone="muted">No photos. Add one from the ⋯ menu.</Text>
        ) : null}
      </Section>

      {r.vouchers.length ? (
        <Section title="Payments">
          <Card padded={false}>
            {r.vouchers.map((b, i) => (
              <Pressable key={b.id} onPress={() => router.push(`/bills/sub/${b.id}`)} android_ripple={{ color: c.surface2 }} style={{ flexDirection: "row", padding: space.lg, borderTopWidth: i ? 1 : 0, borderColor: c.border, opacity: b.voidedAt ? 0.5 : 1 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{b.billNumber}</Text>
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
        </Section>
      ) : null}

      {r.notes ? (
        <Section title="Notes">
          <Text tone="secondary">{r.notes}</Text>
        </Section>
      ) : null}

      <Section title="History">
        <Card style={{ gap: space.md }}>
          {r.history.map((h, i) => (
            <View key={i} style={{ gap: 1 }}>
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
        </Card>
      </Section>
    </ScrollView>
  );
}

function BottomBar({ r }: { r: ReturnDetail }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const due = r.payment?.outstandingPaise ?? 0;
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: space.sm, padding: space.gutter, paddingBottom: insets.bottom + space.md, backgroundColor: c.bg, borderTopWidth: 1, borderColor: c.border }}>
      <Button title="WhatsApp" icon={MessageCircle} variant={due ? "secondary" : "primary"} size="lg" style={{ flex: 1 }} onPress={() => sendWhatsApp("returns", r.id)} />
      {due > 0 ? <Button title={`Pay ${formatINR(due)}`} icon={IndianRupee} size="lg" style={{ flex: 1.2 }} onPress={() => router.push(`/bills/new?clientId=${r.client.id}&jobId=${r.job.id}&returnId=${r.id}`)} /> : null}
    </View>
  );
}
