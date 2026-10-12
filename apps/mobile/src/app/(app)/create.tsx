import { router, Stack, type Href } from "expo-router";
import { ArrowDownToLine, FilePlus2, IndianRupee, PackagePlus, Truck, UserPlus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui";
import { radius, space, TOUCH, useTheme } from "@/theme";

const ACTIONS = [
  { label: "Record return", hint: "Work came back from a job worker", icon: ArrowDownToLine, href: "/returns/new" },
  { label: "New challan", hint: "Send material for job work", icon: FilePlus2, href: "/jobs/new" },
  { label: "New payment", hint: "Pay a job worker", icon: IndianRupee, href: "/bills/new" },
  { label: "Issue more material", hint: "On an existing challan", icon: Truck, href: "/jobs?status=open" },
  { label: "Receive stock", hint: "Material into the warehouse", icon: PackagePlus, href: "/materials?receive=1" },
  { label: "New job worker", hint: "Add a worker's details", icon: UserPlus, href: "/clients/new" },
] as const;

/** Everything you can create, as a bottom sheet over the current screen (opened by the + button). */
export default function Create() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <>
      <Stack.Screen options={{ presentation: "transparentModal", headerShown: false, animation: "fade" }} />
      <Pressable style={{ flex: 1, backgroundColor: c.scrim }} onPress={() => router.back()} accessibilityLabel="Close" />
      <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.md }}>
        <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: space.md }} />
        <Text variant="title" style={{ paddingHorizontal: space.gutter, paddingBottom: space.sm }}>
          Create
        </Text>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => router.replace(a.href as Href)}
            android_ripple={{ color: c.surface3 }}
            accessibilityRole="button"
            style={{ flexDirection: "row", alignItems: "center", gap: space.lg, paddingHorizontal: space.gutter, minHeight: TOUCH + 12 }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.accentSubtle, alignItems: "center", justifyContent: "center" }}>
              <a.icon size={20} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{a.label}</Text>
              <Text variant="caption" tone="muted">
                {a.hint}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </>
  );
}
