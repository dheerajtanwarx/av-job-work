import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, type ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useTheme } from "@/theme";
import { Text } from "./text";

export type SheetRef = BottomSheetModal;

/**
 * Themed bottom sheet that sizes itself to its content. Open with `ref.current?.present()`.
 * Use it for pickers, filters, confirmations and reasons: anything that keeps the user in context.
 */
export const Sheet = forwardRef<BottomSheetModal, { title?: string; subtitle?: string; children: ReactNode; onDismiss?: () => void }>(function Sheet(
  { title, subtitle, children, onDismiss },
  ref,
) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const backdrop = useCallback(
    (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={1} style={[p.style, { backgroundColor: c.scrim }]} />,
    [c.scrim],
  );
  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onDismiss}
      backdropComponent={backdrop}
      backgroundStyle={{ backgroundColor: c.surface, borderRadius: radius.xl }}
      handleIndicatorStyle={{ backgroundColor: c.borderStrong, width: 36 }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      enableDynamicSizing
    >
      <BottomSheetView style={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.lg, gap: space.lg }}>
        {title ? (
          <View style={{ gap: space.xxs, paddingTop: space.xs }}>
            <Text variant="title">{title}</Text>
            {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});
