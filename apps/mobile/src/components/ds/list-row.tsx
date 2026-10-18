import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { hairline, space, useTheme } from "@/theme";
import { Text } from "@/components/ui/text";
import { StatusDot, type Status } from "./status-pill";

/**
 * One row in a Card list. Leading: a status dot or a line icon. Trailing: a value (string = tabular figure) or any node.
 * Rows after the first draw a hairline above themselves, so a list is just `rows.map((r, i) => <ListRow first={!i} />)`.
 */
export function ListRow({
  title,
  meta,
  subtitle,
  status,
  icon: Icon,
  trailing,
  onPress,
  first,
  accessibilityHint,
}: {
  title: string;
  /** Muted text right after the title, e.g. a count. */
  meta?: string;
  subtitle?: string;
  status?: Status;
  icon?: LucideIcon;
  trailing?: ReactNode;
  onPress?: () => void;
  first?: boolean;
  accessibilityHint?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityHint={accessibilityHint}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        minHeight: 56,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderTopWidth: first ? 0 : hairline,
        borderColor: c.border,
        backgroundColor: pressed ? c.surface2 : "transparent",
      })}
    >
      {status ? <StatusDot status={status} size={8} /> : Icon ? <Icon size={18} color={c.fgMuted} strokeWidth={1.75} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
          {meta ? (
            <Text variant="label" tone="faint" num>
              {"  "}
              {meta}
            </Text>
          ) : null}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof trailing === "string" ? (
        <Text variant="label" num tone="secondary">
          {trailing}
        </Text>
      ) : (
        trailing
      )}
      {onPress ? <ChevronRight size={16} color={c.fgFaint} strokeWidth={1.75} /> : null}
    </Pressable>
  );
}
