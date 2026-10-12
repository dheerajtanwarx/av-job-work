import { PAYMENT_POLICIES, PAYMENT_POLICY_LABEL, type PaymentPolicy } from "@av/shared";

/** Policies where a number of days applies (same rule as the web's payment-terms.tsx). */
export const POLICIES_WITH_DAYS: PaymentPolicy[] = ["AFTER_EACH_RETURN", "DAYS_AFTER_RETURN", "AFTER_COMPLETION"];

export function termsLabel(policy: PaymentPolicy | null | undefined, days: number | null | undefined) {
  if (!policy) return "—";
  const d = POLICIES_WITH_DAYS.includes(policy) && days ? ` · ${days} day${days === 1 ? "" : "s"}` : "";
  return `${PAYMENT_POLICY_LABEL[policy]}${d}`;
}

export const policyOptions = (inheritLabel: string) => [
  { value: "", label: inheritLabel },
  ...PAYMENT_POLICIES.map((p) => ({ value: p, label: PAYMENT_POLICY_LABEL[p] })),
];
