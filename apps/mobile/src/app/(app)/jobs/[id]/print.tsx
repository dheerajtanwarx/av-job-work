import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams } from "expo-router";
import { Copy, FileDown, MessageCircle, Printer, RefreshCw } from "lucide-react-native";
import { Alert, ScrollView, Share, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Button, Card, ErrorBlock, ListSkeleton, Text, toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { whatsapp } from "@/lib/contact";
import { challanHtml } from "@/lib/print/challan";
import { printHtml, sharePdf } from "@/lib/print/sheet";
import { qrSvg } from "@/lib/qr";
import { useClientSummary, useJob, useSettings } from "@/lib/queries";
import { webBase } from "@/lib/server";
import { radius, space, useTheme } from "@/theme";

/** Challan PDF, print, and the QR code / public link the worker can open to see the challan's status. */
export default function ChallanPrint() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const qc = useQueryClient();
  const job = useJob(id);
  const settings = useSettings();
  const worker = useClientSummary(job.data?.client.id).data?.client;
  const j = job.data;
  const base = webBase();
  const publicUrl = j && base ? `${base}/c/${j.publicToken}` : undefined;
  const html = () => challanHtml(j!, settings.data, worker ?? undefined, publicUrl);

  const regenerate = () =>
    Alert.alert("Make a new QR code?", "The old QR and link stop working. Reprint the challan after this.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "New QR",
        style: "destructive",
        onPress: async () => {
          try {
            await api.post(`/jobs/${id}/public-token`);
            qc.invalidateQueries({ queryKey: ["job", id] });
            toast.success("New QR code made");
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: j ? `${j.jobNumber} · print` : "Challan" }} />
      {!j ? (
        job.error ? <ErrorBlock error={job.error} onRetry={job.refetch} /> : <ListSkeleton rows={2} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.lg }}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Share PDF" icon={FileDown} style={{ flex: 1 }} onPress={() => sharePdf(html(), `${j.jobNumber}.pdf`)} />
            <Button title="Print" icon={Printer} variant="secondary" style={{ flex: 1 }} onPress={() => printHtml(html())} />
          </View>
          <Card contentStyle={{ alignItems: "center", gap: space.md }}>
            <Text variant="headline">Challan QR code</Text>
            <Text tone="muted" align="center">
              The worker scans it to see this challan's status: issued, returned, pending and paid. No login needed; phone numbers and photos stay private.
            </Text>
            {publicUrl ? (
              <>
                <View style={{ padding: space.md, backgroundColor: "#fff", borderRadius: radius.card }}>
                  <SvgXml xml={qrSvg(publicUrl, 220)} width={220} height={220} />
                </View>
                <Text variant="caption" tone="muted" num align="center" selectable>
                  {publicUrl}
                </Text>
                <View style={{ flexDirection: "row", gap: space.sm, alignSelf: "stretch" }}>
                  <Button title="Copy link" icon={Copy} variant="secondary" style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(publicUrl).then(() => toast.success("Link copied"))} />
                  <Button
                    title="Send"
                    icon={MessageCircle}
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => (worker?.phone ? whatsapp(worker.phone, `Challan ${j.jobNumber}: ${publicUrl}`) : Share.share({ message: `Challan ${j.jobNumber}: ${publicUrl}` }))}
                  />
                </View>
                <Button title="Make a new QR code" icon={RefreshCw} variant="dangerGhost" onPress={regenerate} />
              </>
            ) : (
              <Text tone="warning">Set the web address (EXPO_PUBLIC_WEB_URL) to show the QR code.</Text>
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
