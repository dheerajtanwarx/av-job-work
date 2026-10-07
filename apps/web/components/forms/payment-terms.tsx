"use client";

import { PAYMENT_POLICIES, PAYMENT_POLICY_LABEL, type PaymentPolicy } from "@av/shared";
import { Field, Input, Select } from "@/components/ui/input";

/** Policies where a number of days applies. */
export const POLICIES_WITH_DAYS: PaymentPolicy[] = ["AFTER_EACH_RETURN", "DAYS_AFTER_RETURN", "AFTER_COMPLETION"];

/** "Days after return · 7 days" */
export function termsLabel(policy: PaymentPolicy | null | undefined, days: number | null | undefined) {
  if (!policy) return "—";
  const d = POLICIES_WITH_DAYS.includes(policy) && days ? ` · ${days} day${days === 1 ? "" : "s"}` : "";
  return `${PAYMENT_POLICY_LABEL[policy]}${d}`;
}

/**
 * Payment policy + days. `inheritLabel` is the text for the empty option (e.g. "Worker's terms (After each return)").
 * `policy` "" means inherit.
 */
export function PaymentTermsFields({
  policy,
  days,
  onChange,
  inheritLabel,
  errors = {},
  className,
}: {
  policy: PaymentPolicy | "";
  days: string;
  onChange: (v: { policy: PaymentPolicy | ""; days: string }) => void;
  inheritLabel: string;
  errors?: { policy?: string; days?: string };
  className?: string;
}) {
  const showDays = policy !== "" && POLICIES_WITH_DAYS.includes(policy);
  return (
    <div className={className ?? "grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]"}>
      <Field label="Payment terms" error={errors.policy}>
        <Select value={policy} onChange={(e) => onChange({ policy: e.target.value as PaymentPolicy | "", days })}>
          <option value="">{inheritLabel}</option>
          {PAYMENT_POLICIES.map((p) => (
            <option key={p} value={p}>
              {PAYMENT_POLICY_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>
      {showDays && (
        <Field label="Days" error={errors.days} hint={policy === "AFTER_COMPLETION" ? "After the challan completes" : "After each return"}>
          <Input type="number" inputMode="numeric" min={0} max={365} step={1} value={days} onChange={(e) => onChange({ policy, days: e.target.value })} className="num" placeholder="0" />
        </Field>
      )}
    </div>
  );
}
