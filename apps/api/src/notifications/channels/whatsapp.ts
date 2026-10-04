import type { Channel } from "../types.js";

/** WhatsApp notifications are not wired up yet: every attempt is logged as skipped. */
export const whatsappChannel: Channel = {
  name: "whatsapp",
  isConfigured: () => false,
  notConfiguredMessage: "WhatsApp is not configured yet",
  async send(m) {
    return { status: "skipped", recipient: m.to, error: "WhatsApp is not configured yet" };
  },
};
