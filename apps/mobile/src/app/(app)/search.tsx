import { formatDate, formatINR, JOB_STATUS_LABEL, type SearchResultsV2 } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, type Href } from "expo-router";
import { ArrowLeft, Boxes, Clock, Inbox, Package, ReceiptText, Search as SearchIcon, Shapes, User, Wallet, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, IconButton, Text } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { prefs } from "@/lib/storage";
import { font, radius, space, TOUCH, useTheme } from "@/theme";

const RECENT_KEY = "search.recent";
type Hit = { key: string; icon: typeof User; title: string; sub: string; aside?: string; href: string };

/** One search box for everything: challans, workers, returns, vouchers, materials, designs, products, ₹ amounts and dates. */
export default function SearchScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>(() => prefs.getJSON<string[]>(RECENT_KEY) ?? []);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 220);
    return () => clearTimeout(t);
  }, [text]);
  const res = useQuery({ queryKey: ["search", q], queryFn: () => api.get<SearchResultsV2>(`/search${qs({ q })}`), enabled: q.length >= 2, placeholderData: (p) => p });

  const open = (h: Hit) => {
    const next = [text.trim(), ...recent.filter((r) => r !== text.trim())].filter(Boolean).slice(0, 8);
    prefs.setJSON(RECENT_KEY, next);
    setRecent(next);
    router.push(h.href as Href);
  };

  const d = q.length >= 2 ? res.data : undefined;
  const groups: { title: string; hits: Hit[] }[] = d
    ? [
        { title: "Job workers", hits: d.clients.map((x) => ({ key: x.id, icon: User, title: x.name, sub: x.sub ?? "", href: `/clients/${x.id}` })) },
        { title: "Challans", hits: d.jobs.map((x) => ({ key: x.id, icon: ReceiptText, title: `${x.jobNumber} · ${x.clientName}`, sub: `${x.productName} · ${formatDate(x.jobDate)}`, aside: JOB_STATUS_LABEL[x.status], href: `/jobs/${x.id}` })) },
        { title: "Returns", hits: d.returns.map((x) => ({ key: x.id, icon: Inbox, title: `${x.returnNumber} · ${x.clientName}`, sub: `${x.jobNumber} · ${formatDate(x.date)}${x.voided ? " · voided" : ""}`, aside: formatINR(x.valuePaise), href: `/returns/${x.id}` })) },
        { title: "Payments", hits: d.bills.map((x) => ({ key: x.id, icon: Wallet, title: `${x.billNumber} · ${x.clientName}`, sub: `${x.kind === "main" ? "Final settlement" : "Payment voucher"} · ${formatDate(x.date)}`, aside: formatINR(x.amountPaise), href: `/bills/${x.kind}/${x.id}` })) },
        { title: "Materials", hits: d.materials.map((x) => ({ key: x.id, icon: Boxes, title: `${x.code} · ${x.name}`, sub: [x.unit, x.lotNumber && `Lot ${x.lotNumber}`, x.rollNumber && `Roll ${x.rollNumber}`].filter(Boolean).join(" · "), href: `/materials/${x.id}` })) },
        { title: "Designs", hits: d.designs.map((x) => ({ key: x.id, icon: Shapes, title: x.name, sub: x.code ?? "", href: `/jobs?designId=${x.id}` })) },
        { title: "Products", hits: d.products.map((x) => ({ key: x.id, icon: Package, title: x.name, sub: x.code ?? "", href: `/jobs?productId=${x.id}` })) },
      ].filter((g) => g.hits.length)
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.xs, flexDirection: "row", alignItems: "center", gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong, paddingBottom: space.xs }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          placeholder="Search challans, workers, ₹2,000, 04 Oct…"
          placeholderTextColor={c.fgMuted}
          returnKeyType="search"
          autoCorrect={false}
          cursorColor={c.accent}
          accessibilityLabel="Search"
          style={{ flex: 1, fontFamily: font.regular, fontSize: 17, color: c.fg, height: TOUCH }}
        />
        {text ? <IconButton icon={X} label="Clear" onPress={() => setText("")} /> : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        {q.length < 2 ? (
          recent.length ? (
            <View style={{ paddingTop: space.md }}>
              <Text variant="overline" tone="muted" style={{ paddingHorizontal: space.gutter, paddingVertical: space.sm }}>
                Recent
              </Text>
              {recent.map((r) => (
                <Pressable key={r} onPress={() => setText(r)} android_ripple={{ color: c.surface3 }} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.gutter, minHeight: TOUCH }}>
                  <Clock size={18} color={c.fgMuted} />
                  <Text>{r}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState icon={SearchIcon} title="Search everything" body="Worker names, challan or voucher numbers, designs, lots — or an amount like ₹2,000 or a date like 04 Oct." />
          )
        ) : d && !groups.length ? (
          <EmptyState icon={SearchIcon} title={`Nothing for "${q}"`} body="Try a worker's name or a number." />
        ) : (
          <>
            {d?.matchedAmountPaise != null || d?.matchedDate ? (
              <Text variant="caption" tone="muted" style={{ paddingHorizontal: space.gutter, paddingTop: space.md }}>
                Matching {d?.matchedAmountPaise != null ? `amount ${formatINR(d.matchedAmountPaise)}` : `date ${formatDate(d!.matchedDate)}`}
              </Text>
            ) : null}
            {groups.map((g) => (
              <View key={g.title} style={{ paddingTop: space.md }}>
                <Text variant="overline" tone="muted" style={{ paddingHorizontal: space.gutter, paddingVertical: space.sm }}>
                  {g.title}
                </Text>
                {g.hits.map((h) => (
                  <Pressable key={h.key} onPress={() => open(h)} android_ripple={{ color: c.surface3 }} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.gutter, paddingVertical: space.md }}>
                    <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
                      <h.icon size={18} color={c.fg2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {h.title}
                      </Text>
                      {h.sub ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {h.sub}
                        </Text>
                      ) : null}
                    </View>
                    {h.aside ? (
                      <Text variant="label" tone="secondary" num>
                        {h.aside}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
