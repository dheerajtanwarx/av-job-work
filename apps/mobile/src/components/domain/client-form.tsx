import { clientSchema, type Client, type PaymentPolicy } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { File, UploadType } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Camera, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AuthedImage, Button, Field, FormScreen, Text, toast } from "@/components/ui";
import { api, apiUrl, authHeaders, ApiError, errorMessage } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { compressPhoto } from "@/lib/uploads";
import { radius, space, useTheme } from "@/theme";
import { TermsFields } from "./terms-fields";

type Slot = "photo" | "aadhaar-front" | "aadhaar-back";
const SLOTS: { slot: Slot; field: "photoId" | "aadhaarFrontId" | "aadhaarBackId"; label: string; managers?: boolean }[] = [
  { slot: "photo", field: "photoId", label: "Worker photo" },
  { slot: "aadhaar-front", field: "aadhaarFrontId", label: "Aadhaar front", managers: true },
  { slot: "aadhaar-back", field: "aadhaarBackId", label: "Aadhaar back", managers: true },
];

/** Create or edit a job worker, with photo and Aadhaar captured on the camera. */
export function ClientForm({ client }: { client?: Client }) {
  const qc = useQueryClient();
  const { isManager } = useRole();
  const [f, setF] = useState({
    name: client?.name ?? "",
    businessName: client?.businessName ?? "",
    phone: client?.phone ?? "",
    alternatePhone: client?.alternatePhone ?? "",
    email: client?.email ?? "",
    workItems: client?.workItems ?? "",
    address: client?.address ?? "",
    notes: client?.notes ?? "",
    gstin: client?.gstin ?? "",
    pan: client?.pan ?? "",
  });
  const [terms, setTerms] = useState<{ policy: PaymentPolicy | ""; days: string }>({ policy: client?.paymentPolicy ?? "", days: client?.paymentDays != null ? String(client.paymentDays) : "" });
  const [docs, setDocs] = useState<Partial<Record<Slot, string>>>({}); // local uris to upload after save
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...f, paymentPolicy: terms.policy || null, paymentDays: terms.days ? Number(terms.days) : null };
      const parsed = clientSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(422, parsed.error.issues[0].message, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
      const saved = client ? await api.put<Client>(`/clients/${client.id}`, body) : await api.post<Client>("/clients", body);
      for (const [slot, uri] of Object.entries(docs)) {
        const res = await new File(uri!).upload(apiUrl(`/clients/${saved.id}/documents/${slot}`), { httpMethod: "POST", uploadType: UploadType.MULTIPART, fieldName: "photo", mimeType: "image/jpeg", headers: authHeaders() });
        if (res.status >= 300) toast.error(`${slot} photo didn't upload`);
      }
      return saved;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", saved.id] });
      toast.success(client ? "Saved" : `${saved.name} added (${saved.workerCode})`);
      if (client) router.back();
      else router.replace(`/clients/${saved.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.error(errorMessage(e));
    },
  });

  const pick = async (slot: Slot) => {
    if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) return toast.error("Allow camera access to take photos");
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!res.canceled) {
      const uri = await compressPhoto(res.assets[0].uri);
      setDocs((d) => ({ ...d, [slot]: uri }));
    }
  };
  const removeDoc = async (slot: Slot) => {
    if (docs[slot]) return setDocs((d) => ({ ...d, [slot]: undefined }));
    if (!client) return;
    try {
      await api.post(`/clients/${client.id}/documents/${slot}/remove`, {});
      qc.invalidateQueries({ queryKey: ["client", client.id] });
      toast.success("Removed");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <FormScreen
      title={client ? `Edit ${client.name}` : "New job worker"}
      subtitle={client?.workerCode}
      footer={<Button title={client ? "Save changes" : "Add job worker"} size="lg" block loading={save.isPending} onPress={() => save.mutate()} style={{ flex: 1 }} />}
    >
      <Field label="Name *" value={f.name} onChangeText={set("name")} error={errors.name} autoCapitalize="words" />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Mobile" value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" num error={errors.phone} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Alternate mobile" value={f.alternatePhone} onChangeText={set("alternatePhone")} keyboardType="phone-pad" num />
        </View>
      </View>
      <Field label="Work / items" value={f.workItems} onChangeText={set("workItems")} placeholder="e.g. hand work, jardoji" />
      <Field label="Business name" value={f.businessName} onChangeText={set("businessName")} />
      <Field label="Email" value={f.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" error={errors.email} hint="Payment vouchers are emailed here." />
      <Field label="Address" value={f.address} onChangeText={set("address")} multiline />
      <TermsFields policy={terms.policy} days={terms.days} onChange={setTerms} inheritLabel="Business default" daysError={errors.paymentDays} />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field label="GSTIN" value={f.gstin} onChangeText={set("gstin")} autoCapitalize="characters" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="PAN" value={f.pan} onChangeText={set("pan")} autoCapitalize="characters" />
        </View>
      </View>
      <Field label="Notes" value={f.notes} onChangeText={set("notes")} multiline />

      <View style={{ gap: space.sm }}>
        <Text variant="label" tone="secondary">
          Photos
        </Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {SLOTS.filter((s) => !s.managers || isManager).map((s) => (
            <DocTile key={s.slot} label={s.label} localUri={docs[s.slot]} serverId={client?.[s.field] ?? null} onPick={() => pick(s.slot)} onRemove={() => removeDoc(s.slot)} />
          ))}
        </View>
      </View>
    </FormScreen>
  );
}

function DocTile({ label, localUri, serverId, onPick, onRemove }: { label: string; localUri?: string; serverId: string | null; onPick: () => void; onRemove: () => void }) {
  const { c } = useTheme();
  const has = localUri || serverId;
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Pressable onPress={onPick} accessibilityRole="button" accessibilityLabel={`${has ? "Retake" : "Take"} ${label}`} style={{ aspectRatio: 1, borderRadius: radius.control, borderWidth: has ? 0 : 1.5, borderStyle: "dashed", borderColor: c.borderStrong, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: c.surface }}>
        {localUri ? (
          <Image source={{ uri: localUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : serverId ? (
          <AuthedImage path={`/worker-documents/${serverId}/thumb`} style={{ width: "100%", height: "100%" }} />
        ) : (
          <Camera size={22} color={c.fgMuted} />
        )}
      </Pressable>
      {has ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${label}`} style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
          <X size={14} color="#fff" />
        </Pressable>
      ) : null}
      <Text variant="caption" tone="muted" align="center">
        {label}
      </Text>
    </View>
  );
}
