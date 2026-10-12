import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, StatusBar, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ZoomableImage } from "@/components/ui";
import { apiUrl, authHeaders } from "@/lib/api";

/** A job worker's photo or Aadhaar image, full screen. */
export default function WorkerDoc() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <StatusBar barStyle="light-content" />
      <ZoomableImage source={{ uri: apiUrl(`/worker-documents/${id}/display`), headers: authHeaders() }} />
      <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ position: "absolute", top: insets.top + 4, left: 4, width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
        <ArrowLeft size={24} color="#fff" />
      </Pressable>
    </View>
  );
}
