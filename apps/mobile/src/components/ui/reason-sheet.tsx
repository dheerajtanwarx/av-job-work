import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { forwardRef, useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/lib/api";
import { font, radius, space, useTheme } from "@/theme";
import { Button } from "./button";
import { Sheet, type SheetRef } from "./sheet";
import { Text } from "./text";

/**
 * Asks for the reason behind a void, cancel or override (the API requires ≥ 3 characters and logs it in history).
 * `onConfirm` may throw; the message is shown in the sheet.
 */
export const ReasonSheet = forwardRef<
  SheetRef,
  { title: string; body?: string; confirmLabel: string; danger?: boolean; placeholder?: string; onConfirm: (reason: string) => Promise<void> }
>(function ReasonSheet({ title, body, confirmLabel, danger, placeholder = "Reason (saved in history)", onConfirm }, ref) {
  const { c } = useTheme();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ok = reason.trim().length >= 3;
  return (
    <Sheet
      ref={ref}
      title={title}
      subtitle={body}
      onDismiss={() => {
        setReason("");
        setError(undefined);
      }}
    >
      <BottomSheetTextInput
        value={reason}
        onChangeText={setReason}
        placeholder={placeholder}
        placeholderTextColor={c.fgFaint}
        multiline
        autoFocus
        style={{ minHeight: 88, textAlignVertical: "top", borderRadius: radius.control, borderWidth: 1, borderColor: c.borderStrong, padding: space.md, fontFamily: font.regular, fontSize: 15, color: c.fg, backgroundColor: c.surface }}
      />
      {error ? (
        <Text variant="label" tone="danger">
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Back" variant="secondary" style={{ flex: 1 }} onPress={() => (ref as React.RefObject<SheetRef>).current?.dismiss()} />
        <Button
          title={confirmLabel}
          variant={danger ? "danger" : "primary"}
          disabled={!ok}
          loading={busy}
          style={{ flex: 2 }}
          onPress={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await onConfirm(reason.trim());
              (ref as React.RefObject<SheetRef>).current?.dismiss();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Sheet>
  );
});
