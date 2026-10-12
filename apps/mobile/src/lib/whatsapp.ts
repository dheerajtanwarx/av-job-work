import type { WhatsAppSendResult } from "@av/shared";
import { router } from "expo-router";
import { Linking } from "react-native";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "./api";

/**
 * Sends a receipt (return) or issue slip (dispatch) to the job worker. With the WhatsApp Business API configured
 * the server sends it; otherwise WhatsApp opens on the worker's chat with the message and PDF link ready to send.
 */
export async function sendWhatsApp(kind: "returns" | "dispatches", id: string) {
  try {
    const r = await api.post<WhatsAppSendResult>(`/${kind}/${id}/whatsapp`);
    if (r.status === "sent") return toast.success(`Sent on WhatsApp to ${r.worker.name}`);
    if (r.share.phone) {
      await Linking.openURL(`https://wa.me/${r.share.phone}?text=${encodeURIComponent(r.share.text)}`);
      return;
    }
    toast.error(r.message || `${r.worker.name} has no WhatsApp number`, { label: "Add number", onPress: () => router.push(`/clients/${r.worker.id}/edit`) });
  } catch (e) {
    toast.error(errorMessage(e));
  }
}
