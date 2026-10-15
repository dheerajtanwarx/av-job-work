import { REPORTS, type ReportGroup } from "@av/shared";
import { Redirect, router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { ScrollView, View } from "react-native";
import { ListGroup, ListRow } from "@/components/ui";
import { FILTER_KEYS } from "@/components/domain/reports";
import { qs } from "@/lib/api";
import { space, useTheme } from "@/theme";

const GROUPS: ReportGroup[] = ["Material", "Money", "Work", "Photos", "Ledgers"];
/** Old ?tab= links keep working, as on the web. */
const LEGACY_TABS: Record<string, string> = { pending: "pending-material", clients: "client-summary", payments: "payments", "to-pay": "to-pay" };

/** Every report, grouped. Dashboard links (`/reports?report=to-pay&clientId=…`) open that report straight away. */
export default function Reports() {
  const { c } = useTheme();
  const params = useLocalSearchParams<Record<string, string>>();
  const asked = params.report ?? LEGACY_TABS[params.tab ?? ""];
  if (asked && REPORTS.some((r) => r.id === asked)) {
    const f = Object.fromEntries(FILTER_KEYS.filter((k) => params[k]).map((k) => [k, params[k]]));
    return <Redirect href={`/reports/${asked}${qs(f)}` as Href} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Reports" }} />
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: space.xs, gap: space.xxl, paddingBottom: space.xxxl }}>
        {GROUPS.map((g) => {
          const items = REPORTS.filter((r) => r.group === g);
          return (
            <ListGroup key={g} title={g}>
              {items.map((r, i) => (
                <ListRow key={r.id} title={r.title} subtitle={r.description} onPress={() => router.push(`/reports/${r.id}` as Href)} last={i === items.length - 1} />
              ))}
            </ListGroup>
          );
        })}
      </ScrollView>
    </View>
  );
}
