import type { Channel } from "../types.js";

/** In-app notifications are not wired up yet: every attempt is logged as skipped. */
export const inAppChannel: Channel = {
  name: "in_app",
  isConfigured: () => false,
  notConfiguredMessage: "In-app is not configured yet",
  async send(m) {
    return { status: "skipped", recipient: m.to, error: "In-app is not configured yet" };
  },
};
