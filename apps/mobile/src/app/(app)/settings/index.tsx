import { Redirect, router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { BellRing, Building2, History, Users } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { ListGroup, ListRow } from "@/components/ui";
import { useRole } from "@/lib/auth";
import { termsLabel } from "@/lib/terms";
import { useSettings } from "@/lib/queries";
import { space, useTheme } from "@/theme";

/** The web's `?tab=` links (e.g. from the activity monitor) open the matching screen here. */
const TABS: Record<string, Href> = { general: "/settings/business", users: "/settings/users", changes: "/activity", notifications: "/settings/notifications" };

export default function SettingsHome() {
  const { c } = useTheme();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { isOwner } = useRole();
  const s = useSettings();
  if (tab && TABS[tab]) return <Redirect href={TABS[tab]} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Settings" }} />
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: space.xs, gap: space.xxl, paddingBottom: space.xxxl }}>
        <ListGroup title="Business">
          <ListRow
            icon={Building2}
            title="Business details & terms"
            subtitle={s.data ? `${s.data.businessName} · ${termsLabel(s.data.defaultPaymentPolicy, s.data.defaultPaymentDays)}` : "Name, logo, default payment terms"}
            onPress={() => router.push("/settings/business")}
            last
          />
        </ListGroup>
        {isOwner ? (
          <ListGroup title="Team">
            <ListRow icon={Users} title="Users" subtitle="Who can log in, owner or sub-owner" onPress={() => router.push("/settings/users")} />
            <ListRow icon={History} title="Activity monitor" subtitle="Everything anyone did, in folders" onPress={() => router.push("/activity")} last />
          </ListGroup>
        ) : null}
        <ListGroup title="Messages">
          <ListRow icon={BellRing} title="Notification log" subtitle="Every WhatsApp message attempt" onPress={() => router.push("/settings/notifications")} last />
        </ListGroup>
      </ScrollView>
    </View>
  );
}
