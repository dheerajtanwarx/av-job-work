import { amountInWords, formatINR, type PaymentMethod, type SubBillDetail } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, DateField, Field, FormScreen, ListSkeleton, MethodChips, Text, toast } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { invalidateWork, useSubBill } from "@/lib/queries";
import { paiseToInput, rupeesInput } from "@/lib/returns";
import { space } from "@/theme";

export default function EditPayment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useSubBill(id);
  return q.data ? <EditForm b={q.data} /> : <ListSkeleton rows={3} />;
}

/** Owner only: change amount, date, method or reference of a voucher, with a reason kept in its history. */
function EditForm({ b }: { b: SubBillDetail }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(paiseToInput(b.amountPaise));
  const [date, setDate] = useState(b.date.slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>(b.method);
  const [reference, setReference] = useState(b.reference ?? "");
  const [notes, setNotes] = useState(b.notes ?? "");
  const [advanceReason, setAdvanceReason] = useState(b.advanceReason ?? "");
  const [needsAdvance, setNeedsAdvance] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const amountPaise = rupeesInput(amount);

  const save = async () => {
    setTouched(true);
    if (!(amountPaise > 0)) return toast.error("Enter the amount paid");
    if (reason.trim().length < 3) return toast.error("Give a reason for the change");
    setBusy(true);
    try {
      await api.patch(`/sub-bills/${b.id}`, { amountPaise, date, method, reference: reference || null, notes: notes || null, advanceReason: advanceReason.trim() || null, reason: reason.trim() });
      invalidateWork(qc, b.job.id);
      qc.invalidateQueries({ queryKey: ["sub-bill", b.id] });
      toast.success(`${b.billNumber} updated`);
      router.back();
    } catch (e) {
      if (e instanceof ApiError && (e.body.details as { needsAdvanceReason?: boolean } | undefined)?.needsAdvanceReason) setNeedsAdvance(true);
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen title={`Edit ${b.billNumber}`} subtitle={`${b.client.name} · ${b.job.jobNumber}`} footer={<Button title="Save changes" size="lg" block loading={busy} onPress={save} style={{ flex: 1 }} />}>
      <View style={{ gap: space.xs }}>
        <Field label="Amount" prefix="₹" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" num error={touched && !(amountPaise > 0) ? "Enter the amount" : undefined} />
        <Text variant="caption" tone="muted">
          {amountPaise > 0 ? amountInWords(amountPaise) : ""} · was {formatINR(b.amountPaise)}
        </Text>
      </View>
      {needsAdvance || b.advanceReason ? <Field label="Reason for the advance" value={advanceReason} onChangeText={setAdvanceReason} /> : null}
      <MethodChips value={method} onChange={setMethod} />
      <Field label="Reference" value={reference} onChangeText={setReference} autoCapitalize="characters" />
      <DateField label="Date" value={date} onChange={(d) => d && setDate(d)} maximumDate={new Date()} />
      <Field label="Notes" value={notes} onChangeText={setNotes} />
      <Field label="Reason for the change *" value={reason} onChangeText={setReason} multiline error={touched && reason.trim().length < 3 ? "Kept in the voucher's history" : undefined} />
    </FormScreen>
  );
}
