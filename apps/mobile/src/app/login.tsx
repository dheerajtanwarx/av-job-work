import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Eye, EyeOff, CircleAlert } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View, type TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ServerChip, ServerSheet } from "@/components/server-sheet";
import { Button, Field, Text, type SheetRef } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { googleIdToken } from "@/lib/google";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

export default function Login() {
  const { signIn, signInWithGoogle } = useAuth();
  const { c } = useTheme();
  const s = useStyles(styles);
  const insets = useSafeAreaInsets();
  const serverSheet = useRef<SheetRef>(null);
  const passwordRef = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);
  // Keep Sign in visible above the keyboard (edge-to-edge Android no longer resizes the window).
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => scroll.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The API's Google client ID; null hides the Google button (not set up, or the server can't be reached).
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const loadGoogle = () =>
    api
      .get<{ clientId: string | null }>("/auth/google")
      .then((r) => setGoogleClientId(r.clientId))
      .catch(() => setGoogleClientId(null));
  useEffect(() => {
    loadGoogle();
  }, []);

  const google = async () => {
    if (!googleClientId) return;
    setGoogleBusy(true);
    setError(undefined);
    try {
      const idToken = await googleIdToken(googleClientId);
      if (!idToken) return setGoogleBusy(false); // backed out of the picker
      await signInWithGoogle(idToken);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(errorMessage(e));
      setGoogleBusy(false);
    }
  };

  const submit = async () => {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(undefined);
    try {
      await signIn(email, password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="height">
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + space.xxl }]}>
        <View style={s.brand}>
          <Pressable
            style={{ alignSelf: "flex-start" }}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              serverSheet.current?.present();
            }}
            delayLongPress={600}
            accessibilityLabel="AV Job Work logo. Long-press to choose the server."
          >
            <Image source={require("@/../assets/images/av-splash.png")} style={s.logo} />
          </Pressable>
          <View style={{ gap: space.xs }}>
            <Text variant="display">AV Job Work</Text>
            <Text tone="muted">Challans, returns and payments for your job workers.</Text>
          </View>
        </View>

        <View style={s.form}>
          <Field
            label="Email"
            value={email}
            onChangeText={(v) => (setEmail(v), setError(undefined))}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            submitBehavior="submit"
          />
          <Field
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={(v) => (setPassword(v), setError(undefined))}
            placeholder="Your password"
            secureTextEntry={!show}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            suffix={
              <Pressable onPress={() => setShow((v) => !v)} hitSlop={12} accessibilityRole="button" accessibilityLabel={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff size={20} color={c.fgMuted} /> : <Eye size={20} color={c.fgMuted} />}
              </Pressable>
            }
          />
          {error ? (
            <View style={s.error} accessibilityLiveRegion="assertive">
              <CircleAlert size={18} color={c.danger} />
              <Text variant="label" tone="danger" style={{ flex: 1 }}>
                {error}
              </Text>
            </View>
          ) : null}
          <Button title="Sign in" size="lg" block loading={busy} disabled={googleBusy} onPress={submit} style={{ marginTop: space.sm }} />
          {googleClientId ? (
            <>
              <View style={s.divider}>
                <View style={s.rule} />
                <Text variant="caption" tone="muted">
                  or
                </Text>
                <View style={s.rule} />
              </View>
              <Button title="Continue with Google" variant="secondary" size="lg" block loading={googleBusy} disabled={busy} onPress={google} />
            </>
          ) : null}
        </View>

        {/* Which backend the app talks to: a developer tool, so dev builds only. */}
        {__DEV__ ? (
          <View style={s.footer}>
            <ServerChip onPress={() => serverSheet.current?.present()} />
          </View>
        ) : null}
      </ScrollView>
      <ServerSheet ref={serverSheet} onChanged={() => (setError(undefined), loadGoogle())} />
    </KeyboardAvoidingView>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    page: { flexGrow: 1, paddingHorizontal: space.xxl, gap: space.xxxl },
    brand: { gap: space.xl },
    logo: { width: 64, height: 64 },
    form: { gap: space.lg },
    error: { flexDirection: "row", gap: space.sm, alignItems: "center", padding: space.md, borderRadius: radius.control, backgroundColor: c.dangerSubtle },
    divider: { flexDirection: "row", alignItems: "center", gap: space.md },
    rule: { flex: 1, height: 1, backgroundColor: c.border },
    footer: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  });
