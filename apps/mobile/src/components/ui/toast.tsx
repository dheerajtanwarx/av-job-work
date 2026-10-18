import * as Haptics from "expo-haptics";
import { CircleAlert, CircleCheck, Info } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useTheme } from "@/theme";
import { Text } from "./text";

type Kind = "success" | "error" | "info";
interface Item {
  id: number;
  kind: Kind;
  text: string;
  action?: { label: string; onPress: () => void };
}

let push: ((t: Omit<Item, "id">) => void) | null = null;
let seq = 0;

/** Short confirmation at the bottom of the screen (Material snackbar). Errors also buzz. */
export const toast = {
  success: (text: string, action?: Item["action"]) => push?.({ kind: "success", text, action }),
  error: (text: string, action?: Item["action"]) => push?.({ kind: "error", text, action }),
  info: (text: string, action?: Item["action"]) => push?.({ kind: "info", text, action }),
};

export function Toaster() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<Item | null>(null);

  useEffect(() => {
    push = (t) => {
      if (t.kind === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setItem({ ...t, id: ++seq });
    };
    return () => {
      push = null;
    };
  }, []);
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => setItem(null), item.action ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [item]);

  if (!item) return null;
  const Icon = item.kind === "success" ? CircleCheck : item.kind === "error" ? CircleAlert : Info;
  const iconColor = item.kind === "success" ? "#55c48d" : item.kind === "error" ? "#f0786b" : "#9aa5f6";
  return (
    <Animated.View
      key={item.id}
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(150)}
      pointerEvents="box-none"
      style={{ position: "absolute", left: space.gutter, right: space.gutter, bottom: insets.bottom + 88 }}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingLeft: space.lg, paddingRight: item.action ? space.sm : space.lg, minHeight: 52, borderRadius: radius.card, backgroundColor: dark ? c.surface3 : "#18181b", borderWidth: 1, borderColor: dark ? c.borderStrong : "#18181b", elevation: 3 }}
      >
        <Icon size={20} color={iconColor} />
        <Text variant="bodyStrong" style={{ color: "#f4f4f2", flex: 1, paddingVertical: space.md }}>
          {item.text}
        </Text>
        {item.action ? (
          <Pressable
            onPress={() => {
              item.action?.onPress();
              setItem(null);
            }}
            style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}
            accessibilityRole="button"
          >
            <Text variant="bodyStrong" style={{ color: "#9aa5f6" }}>
              {item.action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
