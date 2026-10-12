import { DISPATCH_KIND_LABEL, formatQty, qtyFitsUnit, roundQty, todayISO, UNIT_DECIMALS, type DispatchKind, type JobDetail } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Card, DateField, Field, FormScreen, ListSkeleton, QtyInput, ReasonSheet, Segmented, Text, toast, type SheetRef } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { invalidateWork, useJob } from "@/lib/queries";
import { space } from "@/theme";

const HINT: Record<DispatchKind, string> = {
  INITIAL: "Issue the rest of the ordered quantity.",
  ADDITIONAL: "Issue more than ordered (extra material). A reason is required.",
  REWORK: "Send damaged / rejected pieces back for rework. A reason is required.",
};
interface StockShort {
  name: string;
  unit: string;
  available: number;
  wanted: number;
}

export default function IssueMaterial() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useJob(id);
  return q.data ? <IssueForm job={q.data} /> : <ListSkeleton rows={3} />;
}

function IssueForm({ job }: { job: JobDetail }) {
  const qc = useQueryClient();
  const shortSheet = useRef<SheetRef>(null);
  const canInitial = job.items.some((i) => i.notYetSent > 0);
  const canRework = job.items.some((i) => i.rejected + i.damaged - i.reworkSent > 0);
  const [kind, setKind] = useState<DispatchKind>(canInitial ? "INITIAL" : canRework ? "REWORK" : "ADDITIONAL");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [short, setShort] = useState<StockShort[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const max = (it: JobDetail["items"][number]) => (kind === "INITIAL" ? it.notYetSent : kind === "REWORK" ? Math.max(0, roundQty(it.rejected + it.damaged - it.reworkSent)) : Infinity);
  useEffect(() => {
    setQty(Object.fromEntries(job.items.map((i) => [i.id, kind === "INITIAL" && i.notYetSent ? String(i.notYetSent) : ""])));
  }, [kind, job.items]);

  const lines = Object.entries(qty).map(([jobItemId, v]) => ({ jobItemId, qty: Number(v) || 0 }));
  const units = useMemo(() => new Set(job.items.map((i) => i.unit)), [job.items]);
  const total = roundQty(lines.reduce((s, l) => s + l.qty, 0));
  const totalLabel = units.size === 1 ? `${formatQty(total)} ${[...units][0]}` : formatQty(total);
  const lineError = (it: JobDetail["items"][number]) => {
    const v = Number(qty[it.id]) || 0;
    if (v < 0) return "Can't be negative";
    if (v && !qtyFitsUnit(v, it.unit)) return `Whole ${it.unit} only`;
    if (v > max(it) + 1e-9) return `At most ${formatQty(max(it))}`;
    return null;
  };

  const send = async (overrideReason?: string) => {
    setTouched(true);
    if (total <= 0) return toast.error("Enter at least one quantity to send");
    if (job.items.some(lineError)) return toast.error("Fix the highlighted quantities");
    if (kind !== "INITIAL" && reason.trim().length < 3) return toast.error("Give a reason");
    setBusy(true);
    try {
      await api.post(`/jobs/${job.id}/dispatches`, { date, kind, notes: notes.trim() || null, reason: (overrideReason ?? reason).trim() || null, lines });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateWork(qc, job.id);
      toast.success(`${DISPATCH_KIND_LABEL[kind]}: ${totalLabel} recorded`);
      router.back();
    } catch (e) {
      const d = e instanceof ApiError ? (e.body.details as { stockShort?: StockShort[] } | undefined) : undefined;
      if (e instanceof ApiError && e.status === 422 && d?.stockShort?.length) {
        setShort(d.stockShort);
        shortSheet.current?.present();
      } else toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen
      title="Issue material"
      subtitle={`${job.jobNumber} · ${job.client.name}`}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" num>
              {totalLabel}
            </Text>
            <Text variant="caption" tone="muted">
              {DISPATCH_KIND_LABEL[kind]}
            </Text>
          </View>
          <Button title="Issue" size="lg" loading={busy} onPress={() => send()} style={{ minWidth: 140 }} />
        </>
      }
    >
      <View style={{ gap: space.sm }}>
        <Segmented<DispatchKind>
          value={kind}
          onChange={setKind}
          options={[
            ...(canInitial ? [{ value: "INITIAL" as const, label: "Initial" }] : []),
            { value: "ADDITIONAL", label: "Additional" },
            ...(canRework ? [{ value: "REWORK" as const, label: "Rework" }] : []),
          ]}
        />
        <Text variant="caption" tone="muted">
          {HINT[kind]}
        </Text>
      </View>
      {job.items.map((it) => {
        const m = max(it);
        const err = touched ? lineError(it) : null;
        return (
          <Card key={it.id} contentStyle={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {it.designName}
              </Text>
              <Text variant="caption" tone="muted" num>
                {Number.isFinite(m) ? `up to ${formatQty(m)} ${it.unit}` : it.unit}
              </Text>
            </View>
            <Text variant="caption" tone="muted" num>
              {it.material ? `${it.material.code} · ` : ""}Ordered {formatQty(it.quantity)} · Issued {formatQty(it.sent)}
              {kind === "REWORK" ? ` · Damaged/rejected ${formatQty(it.damaged + it.rejected)}` : ""}
            </Text>
            <QtyInput label={`Issue ${it.designName}`} value={qty[it.id] ?? ""} onChange={(v) => setQty((x) => ({ ...x, [it.id]: v }))} decimals={UNIT_DECIMALS[it.unit]} size="md" max={Number.isFinite(m) ? m : undefined} error={!!err} />
            {err ? (
              <Text variant="caption" tone="danger">
                {err}
              </Text>
            ) : null}
          </Card>
        );
      })}
      {kind !== "INITIAL" ? <Field label="Reason *" value={reason} onChangeText={setReason} placeholder={kind === "REWORK" ? "e.g. Stitching to be redone" : "e.g. Extra pieces ordered"} error={touched && reason.trim().length < 3 ? "Required" : undefined} /> : null}
      <DateField label="Date" value={date} onChange={(d) => d && setDate(d)} maximumDate={new Date()} />
      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" />
      <ReasonSheet
        ref={shortSheet}
        title="Not enough stock"
        body={short.map((s) => `${s.name}: ${formatQty(s.available)} in stock, issuing ${formatQty(s.wanted)} ${s.unit}`).join("\n")}
        placeholder="Reason to issue anyway"
        confirmLabel="Issue anyway"
        onConfirm={async (r) => {
          shortSheet.current?.dismiss();
          await send(r);
        }}
      />
    </FormScreen>
  );
}
