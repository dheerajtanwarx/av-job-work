import type { LucideIcon } from "lucide-react-native";
import { forwardRef } from "react";
import { Pressable, View } from "react-native";
import { space, TOUCH, useTheme } from "@/theme";
import { Sheet, type SheetRef } from "./sheet";
import { Text } from "./text";

export interface SheetAction {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  danger?: boolean;
  hint?: string;
  hidden?: boolean;
}

/** A menu of actions in a bottom sheet (Android "⋯" menu, within thumb reach). Dismisses before running the action. */
export const ActionSheet = forwardRef<SheetRef, { title?: string; actions: SheetAction[] }>(function ActionSheet({ title, actions }, ref) {
  const { c } = useTheme();
  const close = () => (ref as React.RefObject<SheetRef>).current?.dismiss();
  return (
    <Sheet ref={ref} title={title}>
      <View style={{ marginHorizontal: -space.gutter }}>
        {actions
          .filter((a) => !a.hidden)
          .map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              onPress={() => {
                close();
                setTimeout(a.onPress, 180);
              }}
              android_ripple={{ color: c.surface3 }}
              style={{ flexDirection: "row", alignItems: "center", gap: space.lg, minHeight: TOUCH + 4, paddingHorizontal: space.gutter + space.xs }}
            >
              <a.icon size={21} color={a.danger ? c.danger : c.fg2} strokeWidth={1.8} />
              <View style={{ flex: 1 }}>
                <Text tone={a.danger ? "danger" : "default"}>{a.label}</Text>
                {a.hint ? (
                  <Text variant="caption" tone="muted">
                    {a.hint}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
      </View>
    </Sheet>
  );
});
