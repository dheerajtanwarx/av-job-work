import { formatINR, formatQty, lineAmount, payableQty, returnLineTotal, UNIT_DECIMALS, type ReturnDetail, type ReturnLineView } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, DateField, Field, FormScreen, ListSkeleton, Text, toast, ToggleRow } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { invalidateWork, useReturn } from "@/lib/queries";
import { paiseToInput, parseQty, qtyError, rupeesInput } from "@/lib/returns";
import { radius, space, useTheme } from "@/theme";

interface EditLine {
  ok: string;
  damaged: string;
  rejected: string;
  lost: string;
  rate: string;
  payDamaged: boolean;
  payRejected: boolean;
  payLost: boolean;
  exceptionReason: string;
}
const fromLine = (l: ReturnLineView): EditLine => ({ ok: String(l.okQty), damaged: String(l.damagedQty), rejected: String(l.rejectedQty), lost: String(l.lostQty), rate: paiseToInput(l.ratePaise), payDamaged: l.payDamaged, payRejected: l.payRejected, payLost: l.payLost, exceptionReason: l.exceptionReason ?? "" });
const QTY = [
  ["ok", "Good"],
  ["damaged", "Damaged"],
  ["rejected", "Rejected"],
  ["lost", "Lost"],
] as const;

export default function EditReturn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useReturn(id);
  return q.data ? <EditForm r={q.data} /> : <ListSkeleton rows={3} />;
}

/** Edit quantities, rate and (managers) payable flags. A reason is always required and kept in the history. */
function EditForm({ r }: { r: ReturnDetail }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { isManager } = useRole();
  const [lines, setLines] = useState<Record<string, EditLine>>(() => Object.fromEntries(r.lines.map((l) => [l.id, fromLine(l)])));
  const [date, setDate] = useState(r.date.slice(0, 10));
  const [notes, setNotes] = useState(r.notes ?? "");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (id: string, patch: Partial<EditLine>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));

  const calc = r.lines.map((l) => {
    const e = lines[l.id];
    const errors: Record<string, string> = {};
    for (const [k] of QTY) {
      const err = qtyError(e[k], l.unit);
      if (err) errors[k] = err;
    }
    const n = (v: string) => Math.max(0, parseQty(v) || 0);
    const q = { okQty: n(e.ok), damagedQty: n(e.damaged), rejectedQty: n(e.rejected), lostQty: n(e.lost) };
    const ratePaise = rupeesInput(e.rate);
    if (Number.isNaN(ratePaise)) errors.rate = "Enter a valid rate";
    const over = returnLineTotal(q) > l.pendingBefore + 1e-9;
    const payable = payableQty(q, e);
    return { l, e, q, ratePaise, errors, over, payable, valuePaise: Number.isNaN(ratePaise) ? 0 : lineAmount(payable, ratePaise) };
  });
  const total = calc.reduce((s, x) => s + x.valuePaise, 0);

  const save = async () => {
    setTouched(true);
    if (reason.trim().length < 3) return toast.error("Give a reason for the change");
    if (calc.some((x) => Object.keys(x.errors).length || (x.over && !x.e.exceptionReason.trim()))) return toast.error("Fix the highlighted lines");
    setBusy(true);
    try {
      const res = await api.patch<ReturnDetail & { warnings: string[] }>(`/returns/${r.id}`, {
        reason: reason.trim(),
        date,
        notes: notes || null,
        lines: calc.map((x) => ({ id: x.l.id, ...x.q, ratePaise: x.ratePaise, exceptionReason: x.e.exceptionReason.trim() || null, ...(isManager ? { payDamaged: x.e.payDamaged, payRejected: x.e.payRejected, payLost: x.e.payLost } : {}) })),
      });
      invalidateWork(qc, r.job.id);
      qc.invalidateQueries({ queryKey: ["return", r.id] });
      toast.success(`${r.returnNumber} updated`);
      res.warnings?.forEach((w) => toast.info(w));
      router.back();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen
      title={`Edit ${r.returnNumber}`}
      subtitle="Pending, value and payments update everywhere"
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Text variant="headline" num>
              {formatINR(total)}
            </Text>
            <Text variant="caption" tone="muted">
              was {formatINR(r.valuePaise)}
            </Text>
          </View>
          <Button title="Save changes" size="lg" loading={busy} onPress={save} />
        </>
      }
    >
      {calc.map(({ l, e, errors, over, payable, valuePaise }) => (
        <Card key={l.id} contentStyle={{ gap: space.md }}>
          <View>
            <Text variant="headline">{l.designName}</Text>
            <Text variant="caption" tone="muted" num>
              Room on this return: {formatQty(l.pendingBefore)} {l.unit} · challan rate {formatINR(l.challanRatePaise)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {QTY.map(([k, label]) => (
              <View key={k} style={{ width: "48%" }}>
                <Field label={label} value={e[k]} onChangeText={(v) => set(l.id, { [k]: v.replace(",", ".") })} keyboardType={UNIT_DECIMALS[l.unit] ? "decimal-pad" : "number-pad"} num error={errors[k]} />
              </View>
            ))}
          </View>
          <Field label="Rate" prefix="₹" value={e.rate} onChangeText={(v) => set(l.id, { rate: v })} keyboardType="decimal-pad" num error={errors.rate} />
          {isManager ? (
            <View>
              <ToggleRow label="Pay for damaged" value={e.payDamaged} onChange={(v) => set(l.id, { payDamaged: v })} />
              <ToggleRow label="Pay for rejected" value={e.payRejected} onChange={(v) => set(l.id, { payRejected: v })} />
              <ToggleRow label="Pay for lost" value={e.payLost} onChange={(v) => set(l.id, { payLost: v })} />
            </View>
          ) : null}
          <Text variant="label" tone="secondary" num>
            {formatQty(payable)} payable × {formatINR(Number.isNaN(rupeesInput(e.rate)) ? 0 : rupeesInput(e.rate))} = {formatINR(valuePaise)}
          </Text>
          {over ? (
            <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: c.warningSubtle, gap: space.sm }}>
              <Text variant="label" tone="warning">
                More than was pending for this return.
              </Text>
              <Field value={e.exceptionReason} onChangeText={(v) => set(l.id, { exceptionReason: v })} placeholder="Reason to record it anyway" error={touched && !e.exceptionReason.trim() ? "Required" : undefined} />
            </View>
          ) : null}
        </Card>
      ))}
      <DateField label="Received date" value={date} onChange={(d) => d && setDate(d)} maximumDate={new Date()} />
      <Field label="Notes" value={notes} onChangeText={setNotes} />
      <Field label="Reason for the change *" value={reason} onChangeText={setReason} multiline placeholder="e.g. Recount at the shop: 2 more pieces were damaged" error={touched && reason.trim().length < 3 ? "Kept in the history" : undefined} />
    </FormScreen>
  );
}
