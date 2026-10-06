/**
 * Normalises a phone number to the international digits-only form WhatsApp uses ("919876543210").
 * A bare 10-digit number is taken as an Indian mobile (the business is in India). Returns null when it
 * cannot be a valid number.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? digits : null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return /^[6-9]/.test(digits) ? `91${digits}` : null;
  if (digits.length === 12 && digits.startsWith("91")) return /^91[6-9]/.test(digits) ? digits : null;
  return digits.length >= 8 && digits.length <= 15 && !digits.startsWith("0") ? digits : null;
}

/** "919876543210" → "+91 98765 43210" for messages and toasts. */
export function displayWhatsAppNumber(n: string) {
  return n.length === 12 && n.startsWith("91") ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : `+${n}`;
}
