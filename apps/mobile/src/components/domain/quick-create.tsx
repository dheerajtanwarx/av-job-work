import { UNITS, type Client, type Design, type JobWorkType, type Material, type Product, type Unit } from "@av/shared";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Chip, Sheet, Text, toast, type SheetRef } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { rupeesInput } from "@/lib/returns";
import { font, radius, space, useTheme } from "@/theme";

export type QuickKind = "client" | "product" | "design" | "material" | "type";
type Created = { client: Client; product: Product; design: Design; material: Material; type: JobWorkType };
const TITLE: Record<QuickKind, string> = { client: "New job worker", product: "New product", design: "New design", material: "New material", type: "New job work type" };
const PATH: Record<QuickKind, string> = { client: "/clients", product: "/products", design: "/designs", material: "/materials", type: "/job-work-types" };
const KEY: Record<QuickKind, string> = { client: "clients", product: "products", design: "designs", material: "materials", type: "job-work-types" };

export interface QuickCreateRef {
  open<K extends QuickKind>(kind: K, name: string, onCreated: (x: Created[K]) => void): void;
}

/**
 * Create a master record without leaving the form you're in: just the essentials (name, plus unit/rate/phone),
 * the rest can be filled in later from Setup.
 */
export const QuickCreate = forwardRef<QuickCreateRef>(function QuickCreate(_, ref) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const sheet = useRef<SheetRef>(null);
  const [kind, setKind] = useState<QuickKind>("design");
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [unit, setUnit] = useState<Unit>("PCS");
  const [busy, setBusy] = useState(false);
  const done = useRef<(x: never) => void>(() => {});

  useImperativeHandle(ref, () => ({
    open(k, n, cb) {
      setKind(k);
      setName(n);
      setExtra("");
      setUnit("PCS");
      done.current = cb as (x: never) => void;
      sheet.current?.present();
    },
  }));

  const save = async () => {
    if (!name.trim()) return toast.error("Enter a name");
    setBusy(true);
    try {
      const body =
        kind === "client"
          ? { name, phone: extra || null }
          : kind === "product"
            ? { name, unit }
            : kind === "design"
              ? { name, defaultRatePaise: Number.isNaN(rupeesInput(extra)) ? 0 : rupeesInput(extra) }
              : kind === "material"
                ? { name, unit, openingQty: extra ? Number(extra) : undefined }
                : { name };
      const created = await api.post<never>(PATH[kind], body);
      qc.invalidateQueries({ queryKey: [KEY[kind]] });
      done.current(created);
      sheet.current?.dismiss();
      toast.success(`${name} added`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const input = (value: string, onChange: (v: string) => void, placeholder: string, opts: object = {}) => (
    <BottomSheetTextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={c.fgFaint}
      style={{ minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, paddingHorizontal: space.md + 2, fontFamily: font.regular, fontSize: 16, color: c.fg, backgroundColor: c.surface }}
      {...opts}
    />
  );

  return (
    <Sheet ref={sheet} title={TITLE[kind]} subtitle="More details can be added later in Setup.">
      {input(name, setName, "Name", { autoFocus: true, autoCapitalize: "words" })}
      {kind === "client" ? input(extra, setExtra, "Mobile (optional)", { keyboardType: "phone-pad" }) : null}
      {kind === "design" ? input(extra, setExtra, "Default rate ₹ (optional)", { keyboardType: "decimal-pad" }) : null}
      {kind === "product" || kind === "material" ? (
        <View style={{ gap: space.xs }}>
          <Text variant="label" tone="secondary">
            Unit
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {UNITS.map((u) => (
              <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />
            ))}
          </View>
        </View>
      ) : null}
      {kind === "material" ? input(extra, setExtra, "Opening stock in warehouse (optional)", { keyboardType: "decimal-pad" }) : null}
      <Button title="Add" size="lg" loading={busy} onPress={save} />
    </Sheet>
  );
});
