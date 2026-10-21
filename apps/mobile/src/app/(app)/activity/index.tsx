import type { ActivityFolderKey, ActivityFolders } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { Boxes, Briefcase, Folder, History, PackageCheck, Palette, ReceiptText, ShieldCheck, Truck, Users, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { EmptyState, ErrorBlock, ListGroup, ListRow, ListSkeleton, SearchBar, Segmented, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { space, useTheme } from "@/theme";

const FOLDER_ICON: Record<ActivityFolderKey, LucideIcon> = {
  workers: Users,
  challans: Briefcase,
  issues: Truck,
  returns: PackageCheck,
  payments: ReceiptText,
  stock: Boxes,
  masters: Palette,
  team: ShieldCheck,
};
const when = (iso: string | null) => (iso ? `Last: ${new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}` : "Nothing yet");
const open = (params: { folder?: string; worker?: string; title: string }) => router.push({ pathname: "/activity/list", params });

/** Activity monitor: everything anyone did, filed in folders by record type or by job worker. Owner only. */
export default function ActivityFoldersScreen() {
  const { c } = useTheme();
  const { isOwner } = useRole();
  const [view, setView] = useState<"types" | "workers">("types");
  const [find, setFind] = useState("");
  const q = useQuery({ queryKey: ["activity-folders"], queryFn: () => api.get<ActivityFolders>("/activity/folders"), enabled: isOwner });

  const needle = find.trim().toLowerCase();
  const workers = (q.data?.workers ?? []).filter((w) => !needle || w.name.toLowerCase().includes(needle) || w.code?.toLowerCase().includes(needle));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Activity" }} />
      {!isOwner ? (
        <EmptyState icon={History} title="Owner only" body="Only the owner can see the activity monitor." />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.gutter, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxxl }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} colors={[c.accentSolid]} />}
        >
          <Text variant="caption" tone="muted">
            Everything anyone did, filed in folders. Nothing here can be edited or deleted.
          </Text>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "types", label: "By type" },
              { value: "workers", label: "By job worker" },
            ]}
          />
          {q.isPending ? (
            <ListSkeleton rows={6} />
          ) : q.error ? (
            <ErrorBlock error={q.error} onRetry={q.refetch} />
          ) : view === "types" ? (
            <ListGroup title="Folders">
              <ListRow icon={History} title="All activity" value={q.data.total.toLocaleString("en-IN")} onPress={() => open({ folder: "all", title: "All activity" })} />
              {q.data.types.map((t, i) => (
                <ListRow
                  key={t.key}
                  icon={FOLDER_ICON[t.key]}
                  title={t.label}
                  subtitle={when(t.lastAt)}
                  value={t.count.toLocaleString("en-IN")}
                  onPress={() => open({ folder: t.key, title: t.label })}
                  last={i === q.data.types.length - 1}
                />
              ))}
            </ListGroup>
          ) : (
            <>
              <SearchBar value={find} onChange={setFind} placeholder="Find a job worker…" />
              {workers.length ? (
                <ListGroup title="Job workers">
                  {workers.map((w, i) => (
                    <ListRow
                      key={w.clientId}
                      icon={Folder}
                      title={w.name}
                      subtitle={[w.code, when(w.lastAt)].filter(Boolean).join(" · ")}
                      value={w.count.toLocaleString("en-IN")}
                      onPress={() => open({ worker: w.clientId, title: w.name })}
                      last={i === workers.length - 1}
                    />
                  ))}
                </ListGroup>
              ) : (
                <EmptyState icon={Folder} title={needle ? "No job worker matches" : "No job worker activity yet"} body={needle ? "Try another name or code." : "Adding a job worker or a challan starts their folder."} />
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
