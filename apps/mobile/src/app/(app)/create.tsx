import { BottomSheetBackdrop, BottomSheetView, default as BottomSheet, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { router, Stack, type Href } from "expo-router";
import { ArrowDownToLine, FilePlus2, IndianRupee, PackagePlus, Truck, UserPlus } from "lucide-react-native";
import { useCallback } from "react";
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

/** Everything you can create, as a bottom sheet over the current screen (opened by the + button). Swipe down or tap outside to close. */
export default function Create() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const backdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={1} pressBehavior="close" style={[p.style, { backgroundColor: c.scrim }]} />
    ),
    [c.scrim],
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ presentation: "transparentModal", headerShown: false, animation: "none", contentStyle: { backgroundColor: "transparent" } }} />
      <BottomSheet
        index={0}
        enableDynamicSizing
        enablePanDownToClose
        onClose={() => router.back()}
        backdropComponent={backdrop}
        backgroundStyle={{ backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.border }}
        handleIndicatorStyle={{ backgroundColor: c.borderStrong, width: 36 }}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom + space.md }}>
          <Text variant="headline" style={{ paddingHorizontal: space.gutter, paddingBottom: space.sm }}>
            Create
          </Text>
          {ACTIONS.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => router.replace(a.href as Href)}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.gutter, minHeight: TOUCH + 12, backgroundColor: pressed ? c.surface2 : "transparent" })}
            >
              <View style={{ width: 36, height: 36, borderRadius: radius.control, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
                <a.icon size={18} color={c.fg2} strokeWidth={1.75} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{a.label}</Text>
                <Text variant="caption" tone="muted">
                  {a.hint}
                </Text>
              </View>
            </Pressable>
          ))}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
