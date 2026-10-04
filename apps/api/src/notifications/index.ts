import { prisma } from "@av/db";
import type { NotifyChannel } from "@av/shared";
import { emailChannel } from "./channels/email.js";
import { inAppChannel } from "./channels/in-app.js";
import { smsChannel } from "./channels/sms.js";
import { whatsappChannel } from "./channels/whatsapp.js";
import type { Channel, OutgoingMessage } from "./types.js";

export type { Channel, OutgoingMessage, SendResult } from "./types.js";

export const channels: Record<NotifyChannel, Channel> = {
  email: emailChannel,
  whatsapp: whatsappChannel,
  sms: smsChannel,
  in_app: inAppChannel,
};

export interface NotifyInput {
  channel: NotifyChannel;
  /** What is being sent, e.g. "payment_voucher". */
  kind: string;
  entity: string;
  entityId: string;
  recipient: string | null;
  /** Sent by the system (e.g. on save) rather than by an explicit user action. */
  auto: boolean;
  userId?: string | null;
  /** Builds the message; only called when it will actually be sent. */
  render: () => Omit<OutgoingMessage, "to"> | Promise<Omit<OutgoingMessage, "to">>;
  /** When set, the attempt is logged as skipped with this reason and nothing is sent. */
  skipReason?: string | null;
}

export interface NotifyResult {
  /** "duplicate": an automatic attempt for this entity already exists – nothing was sent or logged. */
  status: "sent" | "skipped" | "failed" | "duplicate";
  recipient: string | null;
  error: string | null;
  logId: string | null;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Sends one notification and ALWAYS records the attempt in NotificationLog (sent / skipped / failed, with the
 * error text). Never throws.
 *
 * Automatic sends happen at most once per (channel, kind, entity): the first auto attempt claims the slot
 * under a transaction-scoped advisory lock, so concurrent or repeated auto calls see the claim and return
 * "duplicate". Manual sends (auto = false) are always attempted and always logged.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const channel = channels[input.channel];
  const base = { channel: input.channel, kind: input.kind, entity: input.entity, entityId: input.entityId, recipient: input.recipient, auto: input.auto, userId: input.userId ?? null };
  let logId: string | null = null;

  try {
    if (input.auto) {
      const key = `notify:${input.channel}:${input.kind}:${input.entity}:${input.entityId}`;
      logId = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        const existing = await tx.notificationLog.findFirst({
          where: { channel: input.channel, kind: input.kind, entity: input.entity, entityId: input.entityId, auto: true },
          select: { id: true },
        });
        if (existing) return null;
        return (await tx.notificationLog.create({ data: { ...base, status: "pending" }, select: { id: true } })).id;
      });
      if (!logId) return { status: "duplicate", recipient: input.recipient, error: null, logId: null };
    }

    let status: "sent" | "skipped" | "failed";
    let error: string | null = null;
    if (input.skipReason) {
      status = "skipped";
      error = input.skipReason;
    } else if (!input.recipient) {
      status = "skipped";
      error = "No recipient";
    } else if (!channel.isConfigured()) {
      status = "skipped";
      error = channel.notConfiguredMessage;
    } else {
      try {
        const msg = await input.render();
        const r = await channel.send({ ...msg, to: input.recipient });
        status = r.status;
        error = r.error;
      } catch (e) {
        status = "failed";
        error = errorText(e);
      }
    }

    if (logId) await prisma.notificationLog.update({ where: { id: logId }, data: { status, error } });
    else logId = (await prisma.notificationLog.create({ data: { ...base, status, error }, select: { id: true } })).id;
    return { status, recipient: input.recipient, error, logId };
  } catch (e) {
    // Logging itself failed (database down). Report it; the caller's main work is already saved.
    console.error("notification failed", e);
    return { status: "failed", recipient: input.recipient, error: errorText(e), logId };
  }
}
