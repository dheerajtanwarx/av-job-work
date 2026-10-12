import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Check, CircleAlert, Server } from "lucide-react-native";
import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { Button, Sheet, Text, type SheetRef } from "@/components/ui";
import { customUrl, localUrl, normalizeUrl, pingServer, productionUrl, serverMode, setServer, urlFor, type ServerMode } from "@/lib/server";
import { storage } from "@/lib/storage";
import { font, type Palette, radius, space, useStyles, useTheme } from "@/theme";

const LABEL: Record<ServerMode, string> = { local: "This Mac (local)", production: "Production", custom: "Custom" };
const hostOf = (url?: string) => url?.replace(/^https?:\/\//, "") ?? "not set";

/** Re-renders when the server changes. */
export function useServer() {
  useMMKVString("server.mode", storage);
  useMMKVString("server.custom", storage);
  const mode = serverMode();
  return { mode, url: urlFor(mode) };
}

/** Small pill naming the server in use: amber for local/custom, red for production (real data). */
export function ServerChip({ onPress }: { onPress?: () => void }) {
  const { c } = useTheme();
  const { mode, url } = useServer();
  const prod = mode === "production";
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`Server: ${LABEL[mode]}, ${hostOf(url)}`}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: prod ? c.dangerSubtle : c.warningSubtle }}
    >
      <Server size={14} color={prod ? c.danger : c.warning} />
      <Text variant="caption" style={{ color: prod ? c.danger : c.warning, fontFamily: font.medium }} numberOfLines={1}>
        {LABEL[mode]} · {hostOf(url)}
      </Text>
    </Pressable>
  );
}

/** Choose which API the app talks to. Opened by long-pressing the logo on the sign-in screen. */
export const ServerSheet = forwardRef<SheetRef, { onChanged?: () => void }>(function ServerSheet({ onChanged }, ref) {
  const s = useStyles(styles);
  const { c } = useTheme();
  const [mode, setMode] = useState<ServerMode>(serverMode);
  const [custom, setCustom] = useState(customUrl);
  const [test, setTest] = useState<{ busy?: boolean; ok?: boolean; text?: string }>({});

  const options: { mode: ServerMode; url?: string; hint: string }[] = [
    ...(__DEV__ ? [{ mode: "local" as const, url: localUrl(), hint: "API on the Mac running Metro, port 4000" }] : []),
    { mode: "production", url: productionUrl(), hint: "The live server. Real data." },
    { mode: "custom", url: custom ? normalizeUrl(custom) : undefined, hint: "Any address, e.g. a staging server" },
  ];
  const target = mode === "custom" ? normalizeUrl(custom) : options.find((o) => o.mode === mode)?.url;

  const runTest = async () => {
    if (!target) return setTest({ ok: false, text: "No address for this option." });
    setTest({ busy: true });
    const r = await pingServer(target);
    setTest(r.ok ? { ok: true, text: `Connected in ${r.ms} ms` } : { ok: false, text: r.error });
  };

  return (
    <Sheet ref={ref} title="Server" subtitle="Which AV Job Work server this app signs in to." onDismiss={() => setTest({})}>
      <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.mode === mode;
          return (
            <Pressable
              key={o.mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                setMode(o.mode);
                setTest({});
              }}
              style={[s.option, on && s.optionOn]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{LABEL[o.mode]}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {o.mode === "custom" ? o.hint : `${hostOf(o.url)} · ${o.hint}`}
                </Text>
              </View>
              {on ? <Check size={20} color={c.accent} /> : null}
            </Pressable>
          );
        })}
      </View>
      {mode === "custom" ? (
        <BottomSheetTextInput
          value={custom}
          onChangeText={(t) => {
            setCustom(t);
            setTest({});
          }}
          placeholder="https://erp.example.com/api or 192.168.1.20:4000"
          placeholderTextColor={c.fgFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={s.input}
        />
      ) : null}
      {test.text ? (
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }} accessibilityLiveRegion="polite">
          {test.ok ? <Check size={16} color={c.success} /> : <CircleAlert size={16} color={c.danger} />}
          <Text variant="label" tone={test.ok ? "success" : "danger"} style={{ flex: 1 }}>
            {test.text}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Test" variant="secondary" loading={test.busy} onPress={runTest} style={{ flex: 1 }} />
        <Button
          title="Use this server"
          disabled={!target}
          style={{ flex: 2 }}
          onPress={() => {
            setServer(mode, mode === "custom" ? custom : undefined);
            onChanged?.();
            (ref as React.RefObject<SheetRef>).current?.dismiss();
          }}
        />
      </View>
    </Sheet>
  );
});

const styles = (c: Palette) =>
  StyleSheet.create({
    option: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md + 2, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, minHeight: 60 },
    optionOn: { borderColor: c.accent, backgroundColor: c.accentSubtle },
    input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, paddingHorizontal: space.md + 2, fontFamily: font.regular, fontSize: 16, color: c.fg, backgroundColor: c.surface },
  });
