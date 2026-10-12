import { Image, type ImageProps } from "expo-image";
import { ImageOff } from "lucide-react-native";
import { View } from "react-native";
import { apiUrl, authHeaders } from "@/lib/api";
import { radius, useTheme } from "@/theme";

/** An image served by the API (needs the Bearer token). `path` is an API path like /photos/:id/thumb. */
export function AuthedImage({ path, size, style, ...rest }: Omit<ImageProps, "source"> & { path: string | null | undefined; size?: number }) {
  const { c } = useTheme();
  const box = size ? { width: size, height: size, borderRadius: radius.md } : null;
  if (!path)
    return (
      <View style={[box, { backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, style as object]}>
        <ImageOff size={(size ?? 40) * 0.4} color={c.fgFaint} />
      </View>
    );
  return (
    <Image
      source={{ uri: apiUrl(path), headers: authHeaders(), cacheKey: path }}
      transition={150}
      contentFit="cover"
      recyclingKey={path}
      style={[box, { backgroundColor: c.surface2 }, style]}
      {...rest}
    />
  );
}
