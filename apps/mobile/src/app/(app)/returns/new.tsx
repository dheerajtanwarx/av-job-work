import { formatDate, formatINR, formatQty, PAYMENT_POLICY_LABEL, roundQty, todayISO, UNIT_DECIMALS, type JobDetail, type JobItemView, type JobListRow, type PaymentMethod, type ReturnResult } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { AlertTriangle, Camera, ChevronDown, ChevronUp, CircleCheck, ImagePlus, IndianRupee, MessageCircle, PackageCheck, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JobStatusBadge } from "@/components/domain/status";
import { Badge, Button, Card, Chip, DateField, EmptyState, ErrorBlock, Field, IconButton, ListSkeleton, MethodChips, QtyInput, SearchBar, Segmented, Text, toast, ToggleRow } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { invalidateWork, useJob, useOpenJobs, useSettings } from "@/lib/queries";
import { initLine, lineCalc, newIdempotencyKey, rupeesInput, type LineState } from "@/lib/returns";
import { compressPhoto, uploads, useUploads } from "@/lib/uploads";
import { sendWhatsApp } from "@/lib/whatsapp";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

type Step = "qty" | "photos" | "pay";
type PayMode = "full" | "partial" | "none";
const STEPS: { key: Step; label: string }[] = [
  { key: "qty", label: "Quantities" },
  { key: "photos", label: "Photos" },
  { key: "pay", label: "Payment" },
];

interface Photo {
  uri: string;
  /** jobItemId of the design the photo shows (null = whole return). */
  tag: string | null;
}

/**
 * Record Return: the most frequent job in the app, usually done standing at the counter with the worker waiting.
 * Challan → quantities → photos → payment, then one save. Photos upload in the background afterwards.
 */
export default function RecordReturn() {
  const params = useLocalSearchParams<{ job?: string }>();
  const [jobId, setJobId] = useState(params.job ?? "");
  const [result, setResult] = useState<ReturnResult | null>(null);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "slide_from_bottom", gestureEnabled: false }} />
      {result ? (
        <Success r={result} onAnother={() => (setResult(null), setJobId(""))} />
      ) : jobId ? (
        <ReturnForm jobId={jobId} onChangeJob={params.job ? undefined : () => setJobId("")} onSaved={setResult} />
      ) : (
        <PickChallan onPick={setJobId} />
      )}
    </>
  );
}

function Header({ title, subtitle, onClose, progress }: { title: string; subtitle?: string; onClose: () => void; progress?: number }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.xs, minHeight: 56, gap: space.xs }}>
        <IconButton icon={X} label="Close" onPress={onClose} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">{title}</Text>
          {subtitle ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {progress !== undefined ? (
        <View style={{ height: 3, backgroundColor: c.surface3 }}>
          <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: c.accentSolid }} />
        </View>
      ) : null}
    </View>
  );
}

// ───────────────────────── Step 0: which challan ─────────────────────────

function PickChallan({ onPick }: { onPick: (id: string) => void }) {
  const { c } = useTheme();
  const open = useOpenJobs();
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const list = (open.data ?? []).filter((j) => !s || [j.jobNumber, j.client.name, j.product.name, ...j.designs].some((x) => x.toLowerCase().includes(s)));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Record return" subtitle="Which challan is the work for?" onClose={() => router.back()} progress={0.08} />
      <View style={{ padding: space.gutter, paddingBottom: space.sm }}>
        <SearchBar value={q} onChange={setQ} placeholder="Worker name, challan no., design…" autoFocus={false} />
      </View>
      {open.isPending ? (
        <ListSkeleton rows={5} />
      ) : open.error ? (
        <ErrorBlock error={open.error} onRetry={open.refetch} />
      ) : !open.data?.length ? (
        <EmptyState icon={PackageCheck} title="Nothing is outside" body="All material is back. Challans show up here once material is issued." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: space.sm, gap: space.sm, paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
          {list.length === 0 ? <EmptyState icon={PackageCheck} title="No matching challan" body="Try the worker's name or the challan number." /> : null}
          {list.map((j) => (
            <ChallanOption key={j.id} j={j} onPress={() => onPick(j.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ChallanOption({ j, onPress }: { j: JobListRow; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} padded={false}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" numberOfLines={1}>
            {j.client.name}
          </Text>
          <Text variant="label" tone="secondary" num numberOfLines={1}>
            {j.jobNumber} · {j.product.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {j.designs.join(", ")} · issued {formatDate(j.jobDate)}
            {j.overdue ? <Text variant="caption" tone="danger"> · Overdue</Text> : null}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="headline" num style={{ color: c.warning }}>
            {formatQty(j.totals.pending)}
          </Text>
          <Text variant="caption" tone="muted">
            {j.unit} out
          </Text>
        </View>
      </View>
    </Card>
  );
}

// ───────────────────────── Steps 1–3: the form ─────────────────────────

function ReturnForm({ jobId, onChangeJob, onSaved }: { jobId: string; onChangeJob?: () => void; onSaved: (r: ReturnResult) => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const job = useJob(jobId);
  const settings = useSettings();
  const { isManager } = useRole();

  const [step, setStep] = useState<Step>("qty");
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [payMode, setPayMode] = useState<PayMode>("none");
  const [partial, setPartial] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [needsAdvance, setNeedsAdvance] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [idemKey] = useState(newIdempotencyKey);

  const j = job.data;
  // "Immediate" payment terms mean the worker is paid on the spot, so start on "Pay full".
  useEffect(() => {
    if (j) setPayMode(j.terms.policy === "IMMEDIATE" ? "full" : "none");
  }, [j?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaults = { payDamaged: settings.data?.payDamagedDefault ?? false, payRejected: settings.data?.payRejectedDefault ?? false, payLost: settings.data?.payLostDefault ?? false };
  const items = useMemo(() => j?.items ?? [], [j]);
  const get = (it: JobItemView) => lines[it.id] ?? initLine(it);
  const set = (it: JobItemView, patch: Partial<LineState>) => setLines((ls) => ({ ...ls, [it.id]: { ...(ls[it.id] ?? initLine(it)), ...patch } }));
  const calcs = items.map((it) => ({ it, l: get(it), c: lineCalc(it, get(it), defaults, isManager) }));
  const entered = calcs.filter((x) => x.c.total > 0);
  const received = roundQty(entered.reduce((s, x) => s + x.c.total, 0));
  const value = entered.reduce((s, x) => s + x.c.amountPaise, 0);
  const pendingAfter = roundQty(calcs.reduce((s, x) => s + (x.c.total > 0 ? x.c.after : x.it.pending), 0));
  const earlier = j?.money.outstandingPaise ?? 0;
  const amountPaise = payMode === "full" ? value : payMode === "partial" ? rupeesInput(partial) : 0;

  const qtyProblem =
    received === 0
      ? "Enter at least one quantity"
      : calcs.some((x) => x.c.hasError)
        ? "Fix the highlighted quantities or rates"
        : entered.some((x) => x.c.needsReason)
          ? "Some quantities are more than pending: add a reason"
          : entered.some((x) => x.c.needsPayReason)
            ? "Give a reason for changing what is paid"
            : null;
  const payProblem = payMode === "partial" && !(amountPaise > 0) ? "Enter the amount paid now" : needsAdvance && amountPaise > 0 && !advanceReason.trim() ? "Give a reason for the advance" : null;

  const dirty = received > 0 || photos.length > 0;
  const close = () => {
    if (!dirty) return router.back();
    Alert.alert("Discard this return?", "The quantities and photos you entered will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };
  const back = () => {
    if (step === "pay") return setStep("photos"), true;
    if (step === "photos") return setStep("qty"), true;
    close();
    return true;
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", back);
    return () => sub.remove();
  });

  const save = useMutation({
    mutationFn: () =>
      api.post<ReturnResult>(`/jobs/${jobId}/returns`, {
        date,
        notes: notes.trim() || null,
        idempotencyKey: idemKey,
        lines: entered.map(({ it, l, c: x }) => ({
          jobItemId: it.id,
          ...x.line,
          ratePaise: x.ratePaise,
          exceptionReason: x.over ? l.reason.trim() : null,
          ...(isManager && x.overridden ? { ...x.flags, payOverrideReason: l.payReason.trim() } : {}),
        })),
        payment: amountPaise > 0 ? { amountPaise, method, reference: reference.trim() || null, advanceReason: advanceReason.trim() || null, idempotencyKey: idemKey } : null,
      }),
    onSuccess: (r) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateWork(qc, jobId);
      // Photos go to the background queue, tagged to this return's lines.
      const byItem = new Map(r.lines.map((ln) => [ln.jobItemId, ln.id]));
      const only = r.lines.length === 1 ? r.lines[0].id : null;
      if (photos.length) uploads.enqueue(photos.map((p) => ({ uri: p.uri, target: { kind: "return", returnId: r.id, returnLineId: only ?? (p.tag ? (byItem.get(p.tag) ?? null) : null) } })));
      onSaved(r);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422) {
        const d = (e.body.details ?? {}) as { needsAdvanceReason?: boolean; exceeds?: unknown[] };
        if (d.needsAdvanceReason) {
          setNeedsAdvance(true);
          setShowErrors(true);
          setStep("pay");
        } else if (d.exceeds?.length) {
          setShowErrors(true);
          setStep("qty");
        }
      }
      toast.error(e.message || "Could not save");
    },
  });

  if (!j)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Header title="Record return" onClose={() => router.back()} />
        {job.error ? <ErrorBlock error={job.error} onRetry={job.refetch} /> : <ListSkeleton rows={3} />}
      </View>
    );

  const stepIdx = STEPS.findIndex((s) => s.key === step);
  const next = () => {
    if (step === "qty") {
      setShowErrors(true);
      if (qtyProblem) return toast.error(qtyProblem);
      setShowErrors(false);
      return setStep("photos");
    }
    if (step === "photos") {
      if (photos.length) return setStep("pay");
      return Alert.alert("No design photo?", "AV Creation keeps a photo of every job work return.", [
        { text: "Add photo", style: "cancel", onPress: () => takePhoto() },
        { text: "Continue without", onPress: () => setStep("pay") },
      ]);
    }
    setShowErrors(true);
    if (payProblem) return toast.error(payProblem);
    save.mutate();
  };

  const takePhoto = async (fromGallery = false) => {
    const perm = fromGallery ? { granted: true } : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return toast.error("Allow camera access in Settings to take photos");
    const res = fromGallery
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10 - photos.length, quality: 1 })
      : await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (res.canceled) return;
    const defaultTag = entered.length === 1 ? entered[0].it.id : null;
    const added = await Promise.all(res.assets.map(async (a) => ({ uri: await compressPhoto(a.uri), tag: defaultTag })));
    setPhotos((p) => [...p, ...added].slice(0, 10));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={`${j.client.name} · ${j.jobNumber}`} subtitle={`Step ${stepIdx + 1} of 3 · ${STEPS[stepIdx].label}`} onClose={close} progress={(stepIdx + 1) / 3} />
      <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {step === "qty" ? (
          <QtyStep j={j} calcs={calcs} set={set} showErrors={showErrors} isManager={isManager} defaults={defaults} date={date} setDate={setDate} notes={notes} setNotes={setNotes} onChangeJob={onChangeJob} setLines={setLines} />
        ) : step === "photos" ? (
          <PhotoStep photos={photos} setPhotos={setPhotos} take={takePhoto} tags={entered.length > 1 ? entered.map((x) => ({ id: x.it.id, label: x.it.designName })) : null} />
        ) : (
          <PayStep
            j={j}
            value={value}
            received={received}
            pendingAfter={pendingAfter}
            earlier={earlier}
            payMode={payMode}
            setPayMode={(m) => (setPayMode(m), setNeedsAdvance(false))}
            partial={partial}
            setPartial={setPartial}
            method={method}
            setMethod={setMethod}
            reference={reference}
            setReference={setReference}
            needsAdvance={needsAdvance}
            advanceReason={advanceReason}
            setAdvanceReason={setAdvanceReason}
            showErrors={showErrors}
            photos={photos.length}
            amountPaise={amountPaise}
          />
        )}
      </ScrollView>
      {/* Sticky footer: what will be saved, and the next step */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space.gutter, paddingBottom: insets.bottom + space.md, backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong, flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" num>
            {formatQty(received)} {j.unit} · {formatINR(value)}
          </Text>
          <Text variant="caption" tone="muted" num>
            {step === "pay" ? (amountPaise > 0 ? `Paying ${formatINR(amountPaise)}` : "No payment now") : `${formatQty(pendingAfter)} ${j.unit} still out after this`}
          </Text>
        </View>
        <Button title={step === "pay" ? "Save return" : "Next"} size="lg" loading={save.isPending} onPress={next} style={{ minWidth: 150 }} />
      </View>
    </View>
  );
}

type Calcs = { it: JobItemView; l: LineState; c: ReturnType<typeof lineCalc> }[];

function QtyStep({
  j,
  calcs,
  set,
  showErrors,
  isManager,
  defaults,
  date,
  setDate,
  notes,
  setNotes,
  onChangeJob,
  setLines,
}: {
  j: JobDetail;
  calcs: Calcs;
  set: (it: JobItemView, p: Partial<LineState>) => void;
  showErrors: boolean;
  isManager: boolean;
  defaults: { payDamaged: boolean; payRejected: boolean; payLost: boolean };
  date: string;
  setDate: (d: string) => void;
  notes: string;
  setNotes: (n: string) => void;
  onChangeJob?: () => void;
  setLines: React.Dispatch<React.SetStateAction<Record<string, LineState>>>;
}) {
  const [showDone, setShowDone] = useState(false);
  const open = calcs.filter((x) => x.it.pending > 0 || x.c.total > 0);
  const done = calcs.filter((x) => !(x.it.pending > 0 || x.c.total > 0));
  const shown = open.length ? [...open, ...(showDone ? done : [])] : calcs;
  return (
    <>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            <Text variant="label" tone="secondary" num>
              {j.product.name}
            </Text>
            <JobStatusBadge status={j.status} overdue={j.overdue} />
          </View>
          <Text variant="caption" tone="muted">
            Issued {formatDate(j.jobDate)} · {PAYMENT_POLICY_LABEL[j.terms.policy]}
          </Text>
        </View>
        {onChangeJob ? <Button title="Change" variant="ghost" onPress={onChangeJob} /> : null}
      </Card>
      {j.totals.pending > 0 ? (
        <Button
          title={`Everything came back (${formatQty(j.totals.pending)} ${j.unit})`}
          variant="secondary"
          icon={PackageCheck}
          onPress={() => {
            Haptics.selectionAsync();
            setLines((ls) => Object.fromEntries(calcs.map(({ it }) => [it.id, { ...(ls[it.id] ?? initLine(it)), ok: it.pending ? String(it.pending) : "" }])));
          }}
        />
      ) : null}
      {shown.map(({ it, l, c: x }) => (
        <LineCard key={it.id} it={it} l={l} x={x} onChange={(p) => set(it, p)} showErrors={showErrors} isManager={isManager} defaults={defaults} />
      ))}
      {open.length > 0 && done.length > 0 ? (
        <Button title={showDone ? "Hide fully returned designs" : `${done.length} design${done.length === 1 ? "" : "s"} fully returned`} variant="ghost" onPress={() => setShowDone((v) => !v)} />
      ) : null}
      <DateField label="Received on" value={date} onChange={(d) => d && setDate(d)} hint="The exact time is recorded automatically." maximumDate={new Date()} />
      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
    </>
  );
}

function LineCard({
  it,
  l,
  x,
  onChange,
  showErrors,
  isManager,
  defaults,
}: {
  it: JobItemView;
  l: LineState;
  x: ReturnType<typeof lineCalc>;
  onChange: (p: Partial<LineState>) => void;
  showErrors: boolean;
  isManager: boolean;
  defaults: { payDamaged: boolean; payRejected: boolean; payLost: boolean };
}) {
  const { c } = useTheme();
  const s = useStyles(styles);
  const decimals = UNIT_DECIMALS[it.unit] ?? 0;
  const issues = roundQty(x.line.damagedQty + x.line.rejectedQty + x.line.lostQty);
  const err = (k: keyof typeof x.errors) => (showErrors || (k !== "ok" && l[k as keyof LineState]) ? x.errors[k] : undefined);
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="headline">{it.designName}</Text>
          <Text variant="caption" tone="muted" num>
            {it.material ? `${it.material.name} · ` : ""}sent {formatQty(it.sent)} · back {formatQty(it.ok + it.exceptions)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="caption" tone="muted">
            Pending
          </Text>
          <Text variant="headline" num style={{ color: it.pending ? c.warning : c.fgMuted }}>
            {formatQty(it.pending)} <Text variant="caption" tone="muted">{it.unit}</Text>
          </Text>
        </View>
      </View>

      <View style={{ gap: space.xs + 2 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="label" tone="secondary">
            Good qty ({it.unit})
          </Text>
          {it.pending > 0 ? <Chip label={`All ${formatQty(it.pending)}`} selected={Number(l.ok) === it.pending} onPress={() => onChange({ ok: String(it.pending) })} /> : null}
        </View>
        <QtyInput label={`Good ${it.designName}`} value={l.ok} onChange={(v) => onChange({ ok: v })} decimals={decimals} error={!!err("ok")} />
        {err("ok") ? (
          <Text variant="caption" tone="danger">
            {err("ok")}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}>
          <Field label="Rate per piece" prefix="₹" value={l.rate} onChangeText={(v) => onChange({ rate: v })} keyboardType="decimal-pad" num error={err("rate")} hint={x.rateChanged ? `Challan rate ${formatINR(it.ratePaise)}` : undefined} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end", paddingBottom: x.rateChanged || err("rate") ? 22 : 12 }}>
          <Text variant="caption" tone="muted">
            Amount
          </Text>
          <Text variant="headline" num>
            {formatINR(x.amountPaise)}
          </Text>
        </View>
      </View>

      <Pressable onPress={() => onChange({ showIssues: !l.showIssues })} style={s.disclosure} accessibilityRole="button" accessibilityState={{ expanded: l.showIssues }}>
        <AlertTriangle size={16} color={issues ? c.danger : c.fgMuted} />
        <Text variant="label" tone={issues ? "danger" : "secondary"} style={{ flex: 1 }}>
          Damaged / rejected / lost{issues ? ` · ${formatQty(issues)}` : ""}
        </Text>
        {l.showIssues ? <ChevronUp size={18} color={c.fgMuted} /> : <ChevronDown size={18} color={c.fgMuted} />}
      </Pressable>
      {l.showIssues ? (
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {(
              [
                ["damaged", "Damaged"],
                ["rejected", "Rejected"],
                ["lost", "Lost"],
              ] as const
            ).map(([k, label]) => (
              <View key={k} style={{ flex: 1 }}>
                <Field label={label} value={l[k]} onChangeText={(v) => onChange({ [k]: v })} keyboardType={decimals ? "decimal-pad" : "number-pad"} placeholder="0" num error={err(k)} />
              </View>
            ))}
          </View>
          {isManager && issues > 0 ? (
            <View style={{ gap: space.xs }}>
              <Text variant="caption" tone="muted">
                Pay the worker for these pieces? Default comes from Settings.
              </Text>
              {x.line.damagedQty > 0 ? <ToggleRow label="Pay for damaged" value={x.flags.payDamaged} onChange={(v) => onChange({ payDamaged: v })} /> : null}
              {x.line.rejectedQty > 0 ? <ToggleRow label="Pay for rejected" value={x.flags.payRejected} onChange={(v) => onChange({ payRejected: v })} /> : null}
              {x.line.lostQty > 0 ? <ToggleRow label="Pay for lost" value={x.flags.payLost} onChange={(v) => onChange({ payLost: v })} /> : null}
              {x.overridden ? <Field label="Why the change?" value={l.payReason} onChangeText={(v) => onChange({ payReason: v })} error={showErrors && x.needsPayReason ? "Required" : undefined} placeholder="Reason (saved in history)" /> : null}
            </View>
          ) : issues > 0 && (defaults.payDamaged || defaults.payRejected || defaults.payLost) ? (
            <Text variant="caption" tone="muted">
              Paid for as set in Settings.
            </Text>
          ) : null}
        </View>
      ) : null}

      {x.over ? (
        <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.warningSubtle }}>
          <Text variant="label" tone="warning">
            This is more than the {formatQty(it.pending)} {it.unit} pending.
          </Text>
          <Field value={l.reason} onChangeText={(v) => onChange({ reason: v })} placeholder="Reason (e.g. extra pieces made)" error={showErrors && x.needsReason ? "A reason is required" : undefined} />
        </View>
      ) : x.total > 0 ? (
        <Text variant="caption" tone="muted" num>
          After this: {formatQty(x.after)} {it.unit} still out
        </Text>
      ) : null}
    </Card>
  );
}

function PhotoStep({ photos, setPhotos, take, tags }: { photos: Photo[]; setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>; take: (gallery?: boolean) => void; tags: { id: string; label: string }[] | null }) {
  const { c } = useTheme();
  return (
    <>
      <View style={{ gap: space.xs }}>
        <Text variant="title">Design photo</Text>
        <Text tone="muted">A photo of the returned work, kept with this return and shown in the gallery.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Take photo" icon={Camera} size="lg" style={{ flex: 1 }} onPress={() => take(false)} disabled={photos.length >= 10} />
        <Button title="Gallery" icon={ImagePlus} variant="secondary" size="lg" onPress={() => take(true)} disabled={photos.length >= 10} />
      </View>
      {photos.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {photos.map((p, i) => (
            <View key={p.uri} style={{ width: "48.5%", gap: space.xs }}>
              <Image source={{ uri: p.uri }} style={{ width: "100%", aspectRatio: 1, borderRadius: radius.md, backgroundColor: c.surface2 }} contentFit="cover" />
              <Pressable
                onPress={() => setPhotos((ps) => ps.filter((_, k) => k !== i))}
                accessibilityLabel="Remove photo"
                hitSlop={8}
                style={{ position: "absolute", top: 6, right: 6, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}
              >
                <X size={16} color="#fff" />
              </Pressable>
              {tags ? (
                <Pressable
                  onPress={() => {
                    // Cycle the design this photo shows: whole return → design 1 → design 2 …
                    const order = [null, ...tags.map((t) => t.id)];
                    setPhotos((ps) => ps.map((q, k) => (k === i ? { ...q, tag: order[(order.indexOf(q.tag) + 1) % order.length] } : q)));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Change which design this photo shows"
                >
                  <Badge tone={p.tag ? "accent" : "neutral"} label={p.tag ? tags.find((t) => t.id === p.tag)!.label : "Whole return · tap to tag"} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ alignItems: "center", padding: space.xxxl, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.borderStrong, gap: space.sm }}>
          <Camera size={32} color={c.fgFaint} />
          <Text tone="muted" align="center">
            No photo yet. Photos upload after saving, so you don't have to wait.
          </Text>
        </View>
      )}
    </>
  );
}

function PayStep(p: {
  j: JobDetail;
  value: number;
  received: number;
  pendingAfter: number;
  earlier: number;
  payMode: PayMode;
  setPayMode: (m: PayMode) => void;
  partial: string;
  setPartial: (v: string) => void;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  reference: string;
  setReference: (v: string) => void;
  needsAdvance: boolean;
  advanceReason: string;
  setAdvanceReason: (v: string) => void;
  showErrors: boolean;
  photos: number;
  amountPaise: number;
}) {
  const { c } = useTheme();
  const row = (label: string, value: string, tone?: "warning" | "muted") => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text tone="muted">{label}</Text>
      <Text variant="bodyStrong" num tone={tone === "warning" ? "warning" : undefined}>
        {value}
      </Text>
    </View>
  );
  return (
    <>
      <Card style={{ gap: 2 }}>
        <Text variant="overline" tone="muted" style={{ marginBottom: space.xs }}>
          Summary
        </Text>
        {row("Received now", `${formatQty(p.received)} ${p.j.unit}`)}
        {row("Still out after this", `${formatQty(p.pendingAfter)} ${p.j.unit}`, "warning")}
        {row("Work value", formatINR(p.value))}
        {row("Photos", p.photos ? String(p.photos) : "None", p.photos ? undefined : "warning")}
      </Card>

      <View style={{ gap: space.md }}>
        <Text variant="title">Pay now?</Text>
        <Segmented<PayMode>
          value={p.payMode}
          onChange={p.setPayMode}
          options={[
            { value: "full", label: `Full ${formatINR(p.value)}` },
            { value: "partial", label: "Partial" },
            { value: "none", label: "Later" },
          ]}
        />
        {p.earlier > 0 ? (
          <Pressable
            onPress={() => {
              p.setPayMode("partial");
              p.setPartial(String((p.earlier + p.value) / 100));
            }}
            style={{ padding: space.md, borderRadius: radius.md, backgroundColor: c.accentSubtle }}
            accessibilityRole="button"
          >
            <Text variant="label" tone="accent">
              {formatINR(p.earlier)} is unpaid from earlier returns. Pay everything due ({formatINR(p.earlier + p.value)})
            </Text>
          </Pressable>
        ) : null}
        {p.payMode === "partial" ? (
          <Field label="Amount paid now" prefix="₹" value={p.partial} onChangeText={p.setPartial} keyboardType="decimal-pad" num autoFocus error={p.showErrors && !(p.amountPaise > 0) ? "Enter the amount" : undefined} />
        ) : null}
        {p.payMode !== "none" ? (
          <>
            <MethodChips value={p.method} onChange={p.setMethod} />
            {p.method !== "CASH" ? <Field label="Reference" value={p.reference} onChangeText={p.setReference} placeholder="UTR / cheque no. (optional)" autoCapitalize="characters" /> : null}
          </>
        ) : null}
        {p.needsAdvance && p.amountPaise > 0 ? (
          <Field label="Reason for paying more than is due (advance)" value={p.advanceReason} onChangeText={p.setAdvanceReason} error={p.showErrors && !p.advanceReason.trim() ? "Required" : undefined} />
        ) : null}
      </View>
    </>
  );
}

// ───────────────────────── Saved ─────────────────────────

function Success({ r, onAnother }: { r: ReturnResult; onAnother: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const queue = useUploads((i) => i.target.kind === "return" && i.target.returnId === r.id);
  const uploading = queue.filter((i) => i.status === "queued" || i.status === "uploading").length;
  const failed = queue.filter((i) => i.status === "error").length;
  const due = r.job.money.outstandingPaise;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: space.xxl, gap: space.xxl, paddingBottom: insets.bottom + space.xxl }}>
        <View style={{ alignItems: "center", gap: space.md, paddingTop: space.xxxl }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.successSubtle, alignItems: "center", justifyContent: "center" }}>
            <CircleCheck size={40} color={c.success} />
          </View>
          <Text variant="title" align="center">
            {r.duplicate ? "Already saved" : "Return saved"}
          </Text>
          <Text tone="muted" align="center" num>
            {r.returnNumber} · {formatQty(r.receivedNow)} {r.job.unit} on {r.job.jobNumber}
            {"\n"}
            {r.job.client.name} · {formatINR(r.okValueNowPaise)} of work
          </Text>
          {r.justCompleted ? <Badge tone="success" label="Challan complete: everything is back" /> : null}
        </View>

        <Card style={{ gap: space.sm }}>
          {r.voucher ? (
            <Text variant="bodyStrong">
              Paid {formatINR(r.voucher.amountPaise)} · voucher {r.voucher.billNumber}
              {r.voucher.email.status === "sent" ? <Text variant="caption" tone="muted">{`\nEmailed to ${r.voucher.email.to}`}</Text> : null}
            </Text>
          ) : (
            <Text variant="bodyStrong">No payment made now</Text>
          )}
          <Text variant="caption" tone={due ? "warning" : "muted"} num>
            {due ? `${formatINR(due)} still to pay on this challan` : "Nothing more to pay on this challan"}
          </Text>
          {queue.length ? (
            <Text variant="caption" tone={failed ? "danger" : "muted"}>
              {uploading ? `Uploading photos… ${queue.length - uploading}/${queue.length}` : failed ? `${failed} photo${failed === 1 ? "" : "s"} failed.` : `${queue.length} photo${queue.length === 1 ? "" : "s"} uploaded`}
            </Text>
          ) : null}
          {failed ? <Button title="Retry photos" variant="secondary" onPress={() => uploads.retry()} /> : null}
          {r.warnings.map((w) => (
            <Text key={w} variant="caption" tone="warning">
              {w}
            </Text>
          ))}
        </Card>

        <View style={{ gap: space.sm }}>
          <Button title="Send receipt on WhatsApp" icon={MessageCircle} size="lg" onPress={() => sendWhatsApp("returns", r.id)} />
          {due > 0 ? <Button title={`Pay ${formatINR(due)}`} icon={IndianRupee} variant="secondary" size="lg" onPress={() => router.replace(`/bills/new?clientId=${r.job.client.id}&jobId=${r.job.id}&returnId=${r.id}`)} /> : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Open return" variant="secondary" style={{ flex: 1 }} onPress={() => router.replace(`/returns/${r.id}`)} />
            <Button title="Record another" variant="secondary" style={{ flex: 1 }} onPress={onAnother} />
          </View>
          <Button title="Done" variant="ghost" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    disclosure: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.surface2 },
  });
