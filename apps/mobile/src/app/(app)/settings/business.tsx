import { MAX_LOGO_CHARS, PAYMENT_POLICIES, PAYMENT_POLICY_LABEL, settingsSchema, type PaymentPolicy, type Settings } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SaveFormat, ImageManipulator } from "expo-image-manipulator";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import { Check, ImageUp, Lock, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, ErrorBlock, Field, FormScreen, ListSkeleton, Text, toast, ToggleRow } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { useSettings } from "@/lib/queries";
import { POLICIES_WITH_DAYS } from "@/lib/terms";
import { radius, space, useTheme } from "@/theme";

const POLICY_HELP: Record<PaymentPolicy, string> = {
  IMMEDIATE: "Payment is due the day work comes back.",
  AFTER_EACH_RETURN: "Each return is paid for separately, within the days below (0 = same day).",
  DAYS_AFTER_RETURN: "Payment for each return is due a set number of days after it is received.",
  AFTER_COMPLETION: "Payment is due once the whole challan is back, within the days below.",
  MANUAL: "No due date. Keep a running balance and record payment vouchers whenever you pay.",
};

const PAYABLE = [
  ["payDamagedDefault", "Pay for damaged quantity", "Work was done but the piece came back damaged."],
  ["payRejectedDefault", "Pay for rejected quantity", "Work did not meet quality and was rejected."],
  ["payLostDefault", "Pay for lost quantity", "Material the job worker could not return."],
] as const;

export default function BusinessSettings() {
  const { c } = useTheme();
  const s = useSettings();
  if (s.data) return <BusinessForm initial={s.data} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Business details" }} />
      {s.isPending ? <ListSkeleton rows={5} /> : <ErrorBlock error={s.error} onRetry={s.refetch} />}
    </View>
  );
}

function BusinessForm({ initial }: { initial: Settings }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { isOwner } = useRole();
  const [f, setF] = useState({
    businessName: initial.businessName,
    address: initial.address ?? "",
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    logo: initial.logo,
    defaultPaymentPolicy: initial.defaultPaymentPolicy,
    days: String(initial.defaultPaymentDays ?? 0),
    payDamagedDefault: initial.payDamagedDefault,
    payRejectedDefault: initial.payRejectedDefault,
    payLostDefault: initial.payLostDefault,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const needsDays = POLICIES_WITH_DAYS.includes(f.defaultPaymentPolicy);

  const save = useMutation({
    mutationFn: async () => {
      const { days, ...rest } = f;
      const body = { ...rest, defaultPaymentDays: needsDays ? Math.max(0, Math.min(365, Math.trunc(Number(days) || 0))) : 0 };
      const parsed = settingsSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(422, parsed.error.issues[0].message, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
      return api.put<Settings>("/settings", body);
    },
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      toast.success("Settings saved");
      router.back();
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.error(errorMessage(e));
    },
  });

  const pickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (res.canceled) return;
    try {
      // Logos are stored inline and printed on every receipt, so keep them small: 400 px wide is plenty for print.
      const ctx = ImageManipulator.manipulate(res.assets[0].uri);
      ctx.resize({ width: 400 });
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ compress: 0.85, format: SaveFormat.JPEG, base64: true });
      const url = `data:image/jpeg;base64,${out.base64}`;
      if (url.length > MAX_LOGO_CHARS) return toast.error("Logo must be smaller than 200 KB");
      setF((x) => ({ ...x, logo: url }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <FormScreen
      title="Business details"
      subtitle="Printed on every challan, voucher and receipt"
      footer={
        isOwner ? (
          <Button title="Save settings" size="lg" block loading={save.isPending} onPress={() => save.mutate()} style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 }}>
            <Lock size={18} color={c.fgMuted} />
            <Text tone="muted">Only an owner can change these settings.</Text>
          </View>
        )
      }
    >
      <View pointerEvents={isOwner ? "auto" : "none"} style={{ gap: space.xl, opacity: isOwner ? 1 : 0.75 }}>
        <Field label="Business name *" value={f.businessName} onChangeText={(businessName) => setF({ ...f, businessName })} error={errors.businessName} />
        <Field label="Address" value={f.address} onChangeText={(address) => setF({ ...f, address })} multiline />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Phone" value={f.phone} onChangeText={(phone) => setF({ ...f, phone })} keyboardType="phone-pad" num />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Email" value={f.email} onChangeText={(email) => setF({ ...f, email })} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text variant="label" tone="secondary">
            Logo
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ width: 80, height: 80, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: f.logo ? "#fff" /* logos are made for white paper */ : c.surface2, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {f.logo ? <Image source={{ uri: f.logo }} style={{ width: 72, height: 72 }} contentFit="contain" accessibilityLabel="Business logo" /> : <ImageUp size={22} color={c.fgFaint} />}
            </View>
            <View style={{ flex: 1, gap: space.sm }}>
              <Button title={f.logo ? "Change logo" : "Choose logo"} variant="secondary" onPress={pickLogo} />
              {f.logo ? <Button title="Remove" icon={Trash2} variant="dangerGhost" onPress={() => setF({ ...f, logo: null })} /> : null}
            </View>
          </View>
          <Text variant="caption" tone={errors.logo ? "danger" : "muted"}>
            {errors.logo ?? "Shown on printed vouchers, the QR challan view and WhatsApp receipts."}
          </Text>
        </View>

        <View style={{ gap: space.sm }}>
          <Text variant="label" tone="secondary">
            Default payment terms
          </Text>
          <Text variant="caption" tone="muted">
            Used for job workers and challans without their own terms. Drives due dates and overdue payments.
          </Text>
          <View style={[styles.box, { borderColor: c.border, backgroundColor: c.surface }]}>
            {PAYMENT_POLICIES.map((p, i) => {
              const on = f.defaultPaymentPolicy === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setF({ ...f, defaultPaymentPolicy: p })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  android_ripple={{ color: c.surface3 }}
                  style={{ flexDirection: "row", gap: space.md, padding: space.md + 2, backgroundColor: on ? c.accentSubtle : undefined, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: c.borderStrong }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant={on ? "bodyStrong" : "body"}>{PAYMENT_POLICY_LABEL[p]}</Text>
                    <Text variant="caption" tone="muted">
                      {POLICY_HELP[p]}
                    </Text>
                  </View>
                  {on ? <Check size={18} color={c.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
          {needsDays ? <Field label="Payment due within (days)" value={f.days} onChangeText={(days) => setF({ ...f, days })} keyboardType="number-pad" num hint="0 means the same day." error={errors.defaultPaymentDays} /> : null}
        </View>

        <View style={{ gap: space.xs }}>
          <Text variant="label" tone="secondary">
            Payable by default
          </Text>
          <Text variant="caption" tone="muted">
            Whether non-good quantities on a return are paid for. Each return can override this (with a reason).
          </Text>
          {PAYABLE.map(([k, label, hint]) => (
            <ToggleRow key={k} label={label} hint={hint} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} />
          ))}
        </View>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
});
