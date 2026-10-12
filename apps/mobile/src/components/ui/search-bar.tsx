import { Search, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { font, radius, space, useTheme } from "@/theme";

/** Search field that reports its value after the user pauses typing (250 ms). */
export function SearchBar({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const { c } = useTheme();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => text !== value && onChange(text), 250);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, height: 46, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.surface2 }}>
      <Search size={18} color={c.fgMuted} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={c.fgMuted}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        cursorColor={c.accent}
        style={{ flex: 1, fontFamily: font.regular, fontSize: 16, color: c.fg, paddingVertical: 0 }}
      />
      {text ? (
        <Pressable onPress={() => setText("")} hitSlop={12} accessibilityLabel="Clear search">
          <X size={18} color={c.fgMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
