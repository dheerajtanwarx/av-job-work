import { formatDate, USER_ROLE_LABEL, type UserRow } from "@av/shared";
import { router, Stack } from "expo-router";
import { KeyRound, Power, PowerOff, ShieldCheck, UserCog, UserPlus, Users as UsersIcon } from "lucide-react-native";
import { useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useUpdateUser, useUsers } from "@/components/domain/users";
import { ActionSheet, Badge, EmptyState, ErrorBlock, Fab, ListSkeleton, Text, type SheetRef } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";

export default function UsersScreen() {
  const { c } = useTheme();
  const q = useUsers();
  const update = useUpdateUser();
  const menu = useRef<SheetRef>(null);
  const [sel, setSel] = useState<UserRow | null>(null);

  const toggleAccess = (u: UserRow) =>
    Alert.alert(
      u.disabled ? `Let ${u.name} log in again?` : `Turn off access for ${u.name}?`,
      u.disabled ? "They can log in with their old password." : "They are logged out straight away and can't log in. Everything they recorded stays, with their name on it.",
      [
        { text: "Cancel", style: "cancel" },
        { text: u.disabled ? "Turn access on" : "Turn off access", style: u.disabled ? "default" : "destructive", onPress: () => update.mutate({ id: u.id, disabled: !u.disabled }) },
      ],
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Users" }} />
      <ScrollView
        contentContainerStyle={{ padding: space.gutter, paddingTop: space.xs, gap: space.sm, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} colors={[c.accentSolid]} />}
      >
        <Text variant="caption" tone="muted" style={{ paddingBottom: space.sm }}>
          Owners can do everything, including users, settings and changing or voiding payments. Sub-owners do all daily work but can't change payments, users or settings.
        </Text>
        {q.isPending ? (
          <ListSkeleton rows={3} />
        ) : q.error && !q.data ? (
          <ErrorBlock error={q.error} onRetry={q.refetch} />
        ) : !q.data?.length ? (
          <EmptyState icon={UsersIcon} title="No users" />
        ) : (
          q.data.map((u) => (
            <View key={u.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: u.disabled ? 0.6 : 1 }]}>
              <Pressable
                onPress={() => {
                  setSel(u);
                  menu.current?.present();
                }}
                android_ripple={{ color: c.surface2 }}
                accessibilityRole="button"
                accessibilityHint="Opens actions for this user"
                style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md + 2 }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {u.name}
                    {u.isYou ? (
                      <Text variant="caption" tone="muted">
                        {"  "}(you)
                      </Text>
                    ) : null}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {u.email}
                  </Text>
                  <Text variant="caption" tone="faint">
                    Added {formatDate(u.createdAt)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: space.xs }}>
                  <Badge tone={u.role === "OWNER" ? "accent" : "neutral"} label={USER_ROLE_LABEL[u.role]} />
                  {u.disabled ? <Badge tone="neutral" label="No access" /> : <Badge tone="success" label="Active" />}
                </View>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
      <Fab icon={UserPlus} label="Add user" onPress={() => router.push("/settings/users/new")} />
      <ActionSheet
        ref={menu}
        title={sel?.name}
        actions={[
          {
            label: sel?.role === "OWNER" ? "Make sub-owner" : "Make owner",
            icon: sel?.role === "OWNER" ? UserCog : ShieldCheck,
            hint: sel?.role === "OWNER" ? "Daily work only: no payment edits, users or settings" : "Everything, including users and settings",
            hidden: !sel || sel.disabled,
            onPress: () => sel && update.mutate({ id: sel.id, role: sel.role === "OWNER" ? "SUB_OWNER" : "OWNER" }),
          },
          { label: "Set a new password", icon: KeyRound, onPress: () => sel && router.push(`/settings/users/${sel.id}/password`) },
          { label: sel?.disabled ? "Turn access back on" : "Turn off access", icon: sel?.disabled ? Power : PowerOff, danger: !sel?.disabled, hidden: !sel || sel.isYou, onPress: () => sel && toggleAccess(sel) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: "hidden", borderWidth: 1 },
});
