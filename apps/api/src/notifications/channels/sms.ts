import type { Channel } from "../types.js";

/** SMS notifications are not wired up yet: every attempt is logged as skipped. */
export const smsChannel: Channel = {
  name: "sms",
  isConfigured: () => false,
  notConfiguredMessage: "SMS is not configured yet",
  async send(m) {
    return { status: "skipped", recipient: m.to, error: "SMS is not configured yet" };
  },
};
