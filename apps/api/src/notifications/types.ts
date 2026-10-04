import type { NotifyChannel } from "@av/shared";
import type { Attachment } from "nodemailer/lib/mailer/index.js";

/** What a channel is asked to deliver. Channels use the fields that make sense for them. */
export interface OutgoingMessage {
  to: string;
  subject?: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: Attachment[];
}

/** Outcome of one delivery attempt. `error` carries the reason for skipped / failed. */
export interface SendResult {
  status: "sent" | "skipped" | "failed";
  recipient: string | null;
  error: string | null;
}

export interface Channel {
  name: NotifyChannel;
  /** False when the server has no credentials for this channel (sending is then skipped, never failed). */
  isConfigured(): boolean;
  /** Shown in the log when the channel is not configured. */
  notConfiguredMessage: string;
  send(message: OutgoingMessage): Promise<SendResult>;
}
