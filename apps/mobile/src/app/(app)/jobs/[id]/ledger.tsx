import { useQuery } from "@tanstack/react-query";
import type { Ledger, MoneyPosition } from "@av/shared";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { LedgerView } from "@/components/domain/ledger";
import { ErrorBlock, ListSkeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { space, useTheme } from "@/theme";

export default function ChallanLedger() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const q = useQuery({ queryKey: ["job", id, "ledger"], queryFn: () => api.get<Ledger & { issuedValuePaise: number; money: MoneyPosition }>(`/jobs/${id}/ledger`) });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Challan ledger" }} />
      {q.data ? (
        <ScrollView contentContainerStyle={{ padding: space.gutter }}>
          <LedgerView ledger={q.data} />
        </ScrollView>
      ) : q.error ? (
        <ErrorBlock error={q.error} onRetry={q.refetch} />
      ) : (
        <ListSkeleton rows={4} />
      )}
    </View>
  );
}
