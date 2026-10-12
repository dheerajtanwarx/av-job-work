import { formatDate, formatINR, formatQty } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Ban, Info, RotateCcw, Share2 } from "lucide-react-native";
import { useRef, useState } from "react";
import { FlatList, Pressable, StatusBar, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReasonSheet, Text, toast, ZoomableImage, type SheetRef } from "@/components/ui";
import { api, apiUrl, authHeaders } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { downloadAndShare } from "@/lib/files";
import { usePhoto } from "@/lib/queries";
import { space } from "@/theme";

/** Full-screen photo viewer (always dark). `ids` (comma-separated) lets you swipe through a set, e.g. a gallery page. */
export default function PhotoViewer() {
  const { id, ids } = useLocalSearchParams<{ id: string; ids?: string }>();
  const list = ids ? ids.split(",") : [id];
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(Math.max(0, list.indexOf(id)));
  const [zoomed, setZoomed] = useState(false);
  const [chrome, setChrome] = useState(true);
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <StatusBar barStyle="light-content" />
      <FlatList
        data={list}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(x) => x}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <Pressable onPress={() => setChrome((v) => !v)}>
            <ZoomableImage source={{ uri: apiUrl(`/photos/${item}/display`), headers: authHeaders(), cacheKey: `/photos/${item}/display` }} onZoomChange={setZoomed} />
          </Pressable>
        )}
      />
      {chrome ? <Chrome id={list[index]} position={list.length > 1 ? `${index + 1} / ${list.length}` : undefined} /> : null}
    </View>
  );
}

function Chrome({ id, position }: { id: string; position?: string }) {
  const insets = useSafeAreaInsets();
  const p = usePhoto(id).data;
  const { isManager, isOwner } = useRole();
  const qc = useQueryClient();
  const voidSheet = useRef<SheetRef>(null);
  const restoreSheet = useRef<SheetRef>(null);
  const [info, setInfo] = useState(true);
  const btn = (Icon: typeof Share2, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={{ width: 46, height: 46, alignItems: "center", justifyContent: "center" }}>
      <Icon size={22} color="#fff" />
    </Pressable>
  );
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["photo", id] });
    qc.invalidateQueries({ queryKey: ["photos"] });
  };
  return (
    <>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: space.xs }}>
        {btn(ArrowLeft, "Back", () => router.back())}
        <Text variant="bodyStrong" style={{ color: "#fff", flex: 1 }} numberOfLines={1}>
          {p ? `${p.returnNumber} · ${p.client.name}` : ""}
          {position ? `   ${position}` : ""}
        </Text>
        {btn(Info, "Details", () => setInfo((v) => !v))}
        {btn(Share2, "Share watermarked copy", () => downloadAndShare(`/photos/${id}/share`, `${p?.returnNumber ?? "photo"}-${id.slice(-4)}.jpg`))}
        {p && isManager && !p.voidedAt ? btn(Ban, "Void photo", () => voidSheet.current?.present()) : null}
        {p && isOwner && p.voidedAt ? btn(RotateCcw, "Restore photo", () => restoreSheet.current?.present()) : null}
      </View>
      {p && info ? (
        <Pressable onPress={() => router.push(`/returns/${p.returnId}`)} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space.gutter, paddingBottom: insets.bottom + space.lg, backgroundColor: "rgba(0,0,0,0.6)", gap: 3 }}>
          {p.voidedAt ? (
            <Text variant="label" style={{ color: "#f0786b" }}>
              Voided{p.voidReason ? `: ${p.voidReason}` : ""}
            </Text>
          ) : null}
          <Text variant="headline" style={{ color: "#fff" }}>
            {p.design?.name ?? p.productName}
          </Text>
          <Text variant="label" style={{ color: "#c6c6cc" }} num>
            {formatQty(p.qty)} {p.unit}
            {p.ratePaise != null ? ` × ${formatINR(p.ratePaise)}` : ""} = {formatINR(p.valuePaise)} · {p.job.jobNumber}
          </Text>
          <Text variant="caption" style={{ color: "#8c8c95" }}>
            Received {formatDate(p.receivedDate)}
            {p.uploadedBy ? ` · photo by ${p.uploadedBy}` : ""} · tap to open the return
          </Text>
        </Pressable>
      ) : null}
      <ReasonSheet
        ref={voidSheet}
        title="Void this photo?"
        body="It's hidden from the gallery and lists but kept in history."
        confirmLabel="Void photo"
        danger
        onConfirm={async (reason) => {
          await api.post(`/photos/${id}/void`, { reason });
          refresh();
          toast.success("Photo voided");
        }}
      />
      <ReasonSheet
        ref={restoreSheet}
        title="Restore this photo?"
        confirmLabel="Restore"
        onConfirm={async (reason) => {
          await api.post(`/photos/${id}/restore`, { reason });
          refresh();
          toast.success("Photo restored");
        }}
      />
    </>
  );
}
