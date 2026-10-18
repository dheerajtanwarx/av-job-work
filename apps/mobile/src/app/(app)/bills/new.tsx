import { amountInWords, formatDate, formatINR, PAYMENT_POLICY_LABEL, todayISO, type PaymentMethod, type SubBillDetail } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Card, DateField, Field, FormScreen, MethodChips, PickerField, Text, toast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { invalidateWork, useClients, useJob, useJobsFor } from "@/lib/queries";
import { newIdempotencyKey, paiseToInput, rupeesInput } from "@/lib/returns";
import { space, useTheme } from "@/theme";

/** Record any amount paid to a job worker: full, part, or an advance. Saved as a payment voucher. */
export default function NewPayment() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ clientId?: string; jobId?: string; returnId?: string }>();
  const qc = useQueryClient();
  const clients = useClients(false);
  const [clientId, setClientId] = useState(params.clientId ?? "");
  const [jobId, setJobId] = useState(params.jobId ?? "");
  const [returnId, setReturnId] = useState(params.returnId ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [needsAdvance, setNeedsAdvance] = useState(false);
  const [touched, setTouched] = useState(false);
  const [idemKey] = useState(newIdempotencyKey);
  const prefilledFor = useRef("");

  const jobs = useJobsFor(clientId);
  const job = useJob(jobId || undefined);

  useEffect(() => {
    if (!clientId && job.data) setClientId(job.data.client.id);
  }, [clientId, job.data]);

  const jobList = useMemo(
    () =>
      (jobs.data ?? [])
        .filter((j) => j.status !== "DRAFT" && (j.status !== "CANCELLED" || j.money.valuePaise > 0))
        .sort((a, b) => b.money.outstandingPaise - a.money.outstandingPaise || b.jobDate.localeCompare(a.jobDate)),
    [jobs.data],
  );
  // Only one challan owes anything: choose it.
  useEffect(() => {
    if (!jobs.data || jobId) return;
    const owing = jobList.filter((j) => j.money.outstandingPaise > 0);
    if (owing.length === 1) setJobId(owing[0].id);
  }, [jobs.data, jobList, jobId]);

  const returns = useMemo(() => (job.data?.returns ?? []).filter((r) => !r.voidedAt), [job.data]);
  const selectedReturn = returns.find((r) => r.id === returnId) ?? null;
  const money = job.data?.money;

  // Prefill with what is outstanding on the chosen return (or the whole challan), once per choice.
  useEffect(() => {
    if (!job.data || job.data.id !== jobId) return;
    const key = `${jobId}|${returnId}`;
    if (prefilledFor.current === key) return;
    prefilledFor.current = key;
    const out = selectedReturn?.payment?.outstandingPaise ?? job.data.money.outstandingPaise;
    setAmount(out > 0 ? paiseToInput(out) : "");
    setNeedsAdvance(false);
  }, [job.data, jobId, returnId, selectedReturn]);

  const amountPaise = rupeesInput(amount);
  const valid = amountPaise > 0;
  const over = money ? valid && amountPaise > money.outstandingPaise : false;

  const create = useMutation({
    mutationFn: () =>
      api.post<SubBillDetail & { duplicate?: boolean }>("/sub-bills", {
        jobId,
        returnId: returnId || null,
        date,
        amountPaise,
        method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        advanceReason: advanceReason.trim() || null,
        idempotencyKey: idemKey,
      }),
    onSuccess: (b) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateWork(qc, jobId);
      if (b.duplicate) toast.info(`${b.billNumber} was already recorded`);
      else if (b.mainBill && !b.mainBill.cancelled) toast.success(`${b.billNumber} saved. Challan fully paid: settlement ${b.mainBill.billNumber}`);
      else toast.success(`${b.billNumber}: ${formatINR(b.amountPaise)} paid to ${b.client.name}`);
      router.replace(`/bills/sub/${b.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422 && (e.body.details as { needsAdvanceReason?: boolean } | undefined)?.needsAdvanceReason) {
        setNeedsAdvance(true);
        setTouched(true);
      }
      toast.error(e.message);
    },
  });

  const submit = () => {
    setTouched(true);
    if (!jobId) return toast.error("Choose a challan");
    if (!valid) return toast.error("Enter the amount paid");
    if ((needsAdvance || over) && !advanceReason.trim()) {
      setNeedsAdvance(true);
      return toast.error("Paying more than is due: give a reason for the advance");
    }
    create.mutate();
  };

  const clientOptions = (clients.data ?? []).map((cl) => ({ value: cl.id, label: cl.name, sub: [cl.workerCode, cl.phone].filter(Boolean).join(" · "), keywords: [cl.businessName ?? ""] }));
  const jobOptions = jobList.map((j) => ({
    value: j.id,
    label: `${j.jobNumber} · ${j.product.name}`,
    sub: `${formatDate(j.jobDate)} · ${j.designs.join(", ")}`,
    aside: j.money.outstandingPaise ? `${formatINR(j.money.outstandingPaise)} due` : j.money.advancePaise ? `${formatINR(j.money.advancePaise)} adv.` : "Paid",
    asideTone: (j.money.outstandingPaise ? "warning" : "muted") as "warning" | "muted",
  }));
  const returnOptions = returns.map((r) => ({
    value: r.id,
    label: `${r.returnNumber} · ${formatDate(r.date)}`,
    sub: `${r.okQty} good · ${formatINR(r.valuePaise)}`,
    aside: r.payment?.outstandingPaise ? `${formatINR(r.payment.outstandingPaise)} due` : "Paid",
    asideTone: (r.payment?.outstandingPaise ? "warning" : "muted") as "warning" | "muted",
  }));
  const owing = jobList.filter((j) => j.money.outstandingPaise > 0).length;

  return (
    <FormScreen
      title="New payment"
      subtitle="Saved as a payment voucher"
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Text variant="headline" num>
              {valid ? formatINR(amountPaise) : "₹0"}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {job.data ? `to ${job.data.client.name}` : "Choose who you're paying"}
            </Text>
          </View>
          <Button title="Save payment" size="lg" loading={create.isPending} onPress={submit} style={{ minWidth: 160 }} />
        </>
      }
    >
      <PickerField
        label="Job worker"
        value={clientId}
        options={clientOptions}
        loading={clients.isPending}
        onChange={(v) => {
          setClientId(v ?? "");
          setJobId("");
          setReturnId("");
        }}
        error={touched && !clientId ? "Choose a job worker" : undefined}
      />
      {clientId ? (
        <PickerField
          label="Challan"
          value={jobId}
          options={jobOptions}
          loading={jobs.isPending}
          onChange={(v) => {
            setJobId(v ?? "");
            setReturnId("");
          }}
          hint={jobs.data ? `${owing} challan${owing === 1 ? "" : "s"} with money due` : undefined}
          error={touched && !jobId ? "Choose a challan" : undefined}
        />
      ) : null}
      {job.data && money ? (
        <Card style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              Work value
            </Text>
            <Text variant="bodyStrong" num>
              {formatINR(money.valuePaise)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              Paid
            </Text>
            <Text variant="bodyStrong" num>
              {formatINR(money.paidPaise)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              {money.advancePaise ? "Advance" : "Due"}
            </Text>
            <Text variant="bodyStrong" num>
              {formatINR(money.advancePaise || money.outstandingPaise)}
            </Text>
          </View>
        </Card>
      ) : null}
      {job.data ? (
        <>
          <Text variant="caption" tone="muted" style={{ marginTop: -space.md }}>
            Terms: {PAYMENT_POLICY_LABEL[job.data.terms.policy]}
          </Text>
          {returns.length ? (
            <PickerField
              label="For return (optional)"
              value={returnId}
              options={returnOptions}
              clearable
              placeholder="Oldest unpaid first"
              onChange={(v) => setReturnId(v ?? "")}
              hint={returnId ? undefined : "Without a return, the payment clears the oldest unpaid return first."}
            />
          ) : null}
          <View style={{ gap: space.xs }}>
            <Field label="Amount" prefix="₹" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" num error={touched && !valid ? "Enter the amount" : undefined} style={{ fontSize: 22 }} />
            {valid ? (
              <Text variant="caption" tone="muted">
                {amountInWords(amountPaise)}
              </Text>
            ) : null}
            {over ? (
              <Text variant="caption" tone="warning">
                More than the {formatINR(money!.outstandingPaise)} due: the extra is an advance.
              </Text>
            ) : null}
          </View>
          {needsAdvance || over ? <Field label="Reason for the advance" value={advanceReason} onChangeText={setAdvanceReason} error={touched && !advanceReason.trim() ? "Required" : undefined} /> : null}
          <MethodChips value={method} onChange={setMethod} />
          {method !== "CASH" ? <Field label="Reference" value={reference} onChangeText={setReference} placeholder="UTR / cheque no. (optional)" autoCapitalize="characters" /> : null}
          <DateField label="Date" value={date} onChange={(d) => d && setDate(d)} maximumDate={new Date()} />
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
        </>
      ) : null}
      <View style={{ height: space.sm, backgroundColor: c.bg }} />
    </FormScreen>
  );
}
