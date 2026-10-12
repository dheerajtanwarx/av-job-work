import { Linking } from "react-native";
import { toast } from "@/components/ui/toast";

/** 10-digit Indian mobiles are taken as +91, the same rule the API uses for wa.me links. */
export function waNumber(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

export const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => toast.error("Can't open the dialer"));

export const whatsapp = (phone: string, text?: string) =>
  Linking.openURL(`https://wa.me/${waNumber(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}`).catch(() => toast.error("WhatsApp isn't available"));
