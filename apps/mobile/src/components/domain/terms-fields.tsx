import type { PaymentPolicy } from "@av/shared";
import { View } from "react-native";
import { Field, PickerField } from "@/components/ui";
import { policyOptions, POLICIES_WITH_DAYS } from "@/lib/terms";
import { space } from "@/theme";

/** Payment policy + days. `policy` "" means "inherit" (worker → business default). */
export function TermsFields({ policy, days, onChange, inheritLabel, daysError }: { policy: PaymentPolicy | ""; days: string; onChange: (v: { policy: PaymentPolicy | ""; days: string }) => void; inheritLabel: string; daysError?: string }) {
  const showDays = policy !== "" && POLICIES_WITH_DAYS.includes(policy);
  return (
    <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
      <View style={{ flex: 2 }}>
        <PickerField label="Payment terms" value={policy || ""} options={policyOptions(inheritLabel)} onChange={(v) => onChange({ policy: (v ?? "") as PaymentPolicy | "", days })} />
      </View>
      {showDays ? (
        <View style={{ flex: 1 }}>
          <Field label="Days" value={days} onChangeText={(d) => onChange({ policy, days: d })} keyboardType="number-pad" num error={daysError} />
        </View>
      ) : null}
    </View>
  );
}
