import { USER_ROLE_LABEL } from "@av/shared";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { BarChart3, Boxes, Brush, ChartPie, History, Images, LogOut, Package, Palette as PaletteIcon, Settings, Shapes, Users } from "lucide-react-native";
import { Alert, ScrollView, View } from "react-native";
import { ServerChip } from "@/components/server-sheet";
import { Card, ListGroup, ListRow, Segmented, TabBarRule, TabHeader, Text } from "@/components/ui";
import { useAuth, useRole } from "@/lib/auth";
import { hairline, space, useTheme, type Appearance } from "@/theme";

export default function More() {
  const { user, signOut } = useAuth();
  const { isOwner } = useRole();
  const { c, appearance, setAppearance } = useTheme();
  const go = (href: string) => () => router.push(href as Href);
  const initials = (user?.name ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title="More" />
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: space.sm, gap: space.xxl, paddingBottom: space.xxxl * 2 }}>
        <Card style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface2, borderWidth: hairline, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
            <Text variant="label" tone="secondary">
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{user?.name}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {user ? USER_ROLE_LABEL[user.role] : ""} · {user?.email}
            </Text>
          </View>
        </Card>

        <ListGroup title="Work">
          <ListRow icon={Users} title="Job workers" subtitle="Profiles, balances, material held" onPress={go("/clients")} />
          <ListRow icon={Boxes} title="Materials & stock" subtitle="Warehouse, with workers, movements" onPress={go("/materials")} />
          <ListRow icon={Images} title="Design gallery" subtitle="Photos from returns" onPress={go("/gallery")} />
          <ListRow icon={BarChart3} title="Reports" subtitle="Material, money, work, ledgers · export" onPress={go("/reports")} />
          <ListRow icon={ChartPie} title="Analytics" subtitle="Trends and charts" onPress={go("/analytics")} last={!isOwner} />
          {isOwner ? <ListRow icon={History} title="Activity" subtitle="Everything anyone did, in folders" onPress={go("/activity")} last /> : null}
        </ListGroup>

        <ListGroup title="Setup">
          <ListRow icon={Package} title="Products" onPress={go("/products")} />
          <ListRow icon={Shapes} title="Designs" onPress={go("/designs")} />
          <ListRow icon={Brush} title="Job work types" onPress={go("/job-work-types")} />
          <ListRow icon={Settings} title="Settings" subtitle="Business, users, notifications" onPress={go("/settings")} last />
        </ListGroup>

        <ListGroup title="Appearance">
          <View style={{ padding: space.md, gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs }}>
              <PaletteIcon size={18} color={c.fgMuted} strokeWidth={1.75} />
              <Text variant="bodyStrong">Theme</Text>
            </View>
            <Segmented<Appearance>
              value={appearance}
              onChange={setAppearance}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </View>
        </ListGroup>

        <ListGroup title="Account">
          <ListRow
            icon={LogOut}
            title="Sign out"
            danger
            last
            onPress={() =>
              Alert.alert("Sign out?", "You'll need your email and password to sign in again.", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign out", style: "destructive", onPress: signOut },
              ])
            }
          />
        </ListGroup>

        <View style={{ alignItems: "center", gap: space.sm }}>
          {__DEV__ ? <ServerChip /> : null}
          <Text variant="caption" tone="faint">
            {Constants.expoConfig?.name} {Constants.expoConfig?.version}
          </Text>
        </View>
      </ScrollView>
      <TabBarRule />
    </View>
  );
}
