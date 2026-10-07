import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { env } from "../env.js";

let transport: Transporter | null | undefined;

/** The SMTP transport from `.env`, or null when email is not configured. */
function getTransport(): Transporter | null {
  if (transport === undefined) {
    const { host, port, secure, user, pass } = env.smtp;
    transport = host
      ? nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 })
      : null;
  }
  return transport;
}

/** Tests swap in an in-memory transport (or null to simulate "not configured"). */
export function setTransport(t: Transporter | null | undefined) {
  transport = t;
}

export function mailConfigured() {
  return getTransport() !== null;
}

export async function sendMail(options: SendMailOptions) {
  const t = getTransport();
  if (!t) throw new Error("Email is not configured. Set SMTP_HOST in .env");
  return t.sendMail({ from: env.smtp.from, ...options });
}
