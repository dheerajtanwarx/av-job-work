import { REPORTS, todayISO } from "@av/shared";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { ExportButtons, exportPath, FILTER_KEYS, ReportBody, ReportFilters, type ReportFilterValues } from "@/components/domain/reports";
import { ErrorBlock, Text } from "@/components/ui";
import { space, useTheme } from "@/theme";

const monthStart = () => `${todayISO().slice(0, 7)}-01`;

export default function Report() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<Record<string, string>>();
  const meta = REPORTS.find((r) => r.id === params.id);
  // Filters start from the link (dashboard links carry them); payments default to this month, like the web.
  const [filters, setFilters] = useState<ReportFilterValues>(() => {
    const f: ReportFilterValues = Object.fromEntries(FILTER_KEYS.filter((k) => params[k]).map((k) => [k, params[k]]));
    if (params.id === "payments" && !f.from && !f.to) f.from = monthStart();
    return f;
  });
  const [refreshing, setRefreshing] = useState(false);

  if (!meta)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: "Report" }} />
        <ErrorBlock error={new Error("This report doesn't exist.")} />
      </View>
    );
  const missing = !!meta.requires && !filters[meta.requires];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: meta.title }} />
      <ScrollView
        contentContainerStyle={{ padding: space.gutter, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxxl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await qc.invalidateQueries({ queryKey: ["report"] });
              setRefreshing(false);
            }}
            colors={[c.accentSolid]}
          />
        }
      >
        <Text tone="muted">{meta.description}</Text>
        <ReportFilters meta={meta} value={filters} onChange={setFilters} />
        <ExportButtons path={exportPath(meta, filters)} name={meta.id} disabled={missing} />
        <ReportBody meta={meta} filters={filters} />
      </ScrollView>
    </View>
  );
}
