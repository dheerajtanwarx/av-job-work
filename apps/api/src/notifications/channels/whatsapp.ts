import { env } from "../../env.js";
import type { Channel, SendResult } from "../types.js";

/**
 * WhatsApp Business Cloud API (graph.facebook.com). A message we start must use a Meta-approved template, so a send
 * is: upload the PDF as media → send the template with that media as its DOCUMENT header and the body parameters.
 * Configured with WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID; `to` is digits only with country code ("919876543210").
 */
export const whatsappChannel: Channel = {
  name: "whatsapp",
  isConfigured: () => !!(env.whatsapp.token && env.whatsapp.phoneNumberId),
  notConfiguredMessage: "WhatsApp Business API is not set up on the server (WHATSAPP_* settings in .env)",
  async send(m): Promise<SendResult> {
    const wa = m.whatsapp;
    if (!wa) return { status: "failed", recipient: m.to, error: "Nothing to send on WhatsApp" };
    try {
      const mediaId = await uploadPdf(wa.document.filename, wa.document.content);
      const body = await graph("messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: m.to,
          type: "template",
          template: {
            name: wa.template,
            language: { code: env.whatsapp.templateLang },
            components: [
              { type: "header", parameters: [{ type: "document", document: { id: mediaId, filename: wa.document.filename } }] },
              { type: "body", parameters: wa.params.map((text) => ({ type: "text", text: oneLine(text) })) },
            ],
          },
        }),
      });
      if (!body.messages?.[0]?.id) throw new Error("WhatsApp did not accept the message");
      return { status: "sent", recipient: m.to, error: null };
    } catch (e) {
      return { status: "failed", recipient: m.to, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

interface GraphResponse {
  id?: string;
  messages?: { id: string }[];
  error?: { message?: string; error_data?: { details?: string } };
}

async function graph(path: string, init: RequestInit): Promise<GraphResponse> {
  const url = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/${path}`;
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${env.whatsapp.token}` }, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as GraphResponse;
  if (!res.ok || body.error) {
    const detail = body.error?.error_data?.details ?? body.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`WhatsApp: ${detail}`);
  }
  return body;
}

async function uploadPdf(filename: string, content: Buffer) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([new Uint8Array(content)], { type: "application/pdf" }), filename);
  const body = await graph("media", { method: "POST", body: form });
  if (!body.id) throw new Error("WhatsApp did not return a media id for the PDF");
  return body.id;
}

/** Template parameters may not contain new lines, tabs or more than 4 consecutive spaces. */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim() || "-";
