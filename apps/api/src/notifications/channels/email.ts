import { mailConfigured, sendMail } from "../../lib/mailer.js";
import type { Channel } from "../types.js";

export const emailChannel: Channel = {
  name: "email",
  isConfigured: mailConfigured,
  notConfiguredMessage: "Email is not set up on the server (SMTP settings in .env)",
  async send(m) {
    try {
      await sendMail({ to: m.to, replyTo: m.replyTo, subject: m.subject, html: m.html, text: m.text, attachments: m.attachments });
      return { status: "sent", recipient: m.to, error: null };
    } catch (e) {
      return { status: "failed", recipient: m.to, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
