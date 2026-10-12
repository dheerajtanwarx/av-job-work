import type { LucideIcon } from "lucide-react-native";
import { CloudOff, RotateCw } from "lucide-react-native";
import { useEffect } from "react";
import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, ReduceMotion } from "react-native-reanimated";
import { radius, space, useTheme } from "@/theme";
import { Button } from "./button";
import { Text } from "./text";

/** Placeholder block that gently pulses while content loads. Prefer it over spinners. */
export function Skeleton({ width = "100%", height = 14, style, r = radius.sm }: { width?: DimensionValue; height?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const o = useSharedValue(0.55);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 750, reduceMotion: ReduceMotion.System }), -1, true);
  }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: c.surface3 }, a, style]} />;
}

/** A stack of card-shaped skeletons for list screens. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ padding: space.gutter, gap: space.md }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ padding: space.lg, borderRadius: radius.lg, backgroundColor: c.surface, gap: space.sm + 2, borderWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Skeleton width="40%" height={16} />
            <Skeleton width="22%" height={16} />
          </View>
          <Skeleton width="65%" />
          <Skeleton width="85%" height={8} r={4} />
        </View>
      ))}
    </View>
  );
}

/** Nothing to show yet: say why, and offer the one next step. */
export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: { title: string; onPress: () => void } }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxxl * 1.5, paddingHorizontal: space.xxl, gap: space.md }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
        <Icon size={26} color={c.fgMuted} strokeWidth={1.75} />
      </View>
      <Text variant="headline" align="center">
        {title}
      </Text>
      {body ? (
        <Text tone="muted" align="center" style={{ maxWidth: 300 }}>
          {body}
        </Text>
      ) : null}
      {action ? <Button title={action.title} onPress={action.onPress} style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

/** Loading failed: plain words and a retry. */
export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong";
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxxl, paddingHorizontal: space.xxl, gap: space.md }}>
      <CloudOff size={28} color="#8c8c95" />
      <Text variant="headline" align="center">
        Couldn't load this
      </Text>
      <Text tone="muted" align="center">
        {msg}
      </Text>
      {onRetry ? <Button title="Try again" icon={RotateCw} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}
