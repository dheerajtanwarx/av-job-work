import { Search, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { font, hairline, radius, space, useTheme } from "@/theme";

/** Search field that reports its value after the user pauses typing (250 ms). */
export function SearchBar({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const { c } = useTheme();
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => text !== value && onChange(text), 250);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, height: 40, paddingHorizontal: space.md, borderRadius: radius.control, backgroundColor: c.surface, borderWidth: hairline, borderColor: focused ? c.fgFaint : c.border }}>
      <Search size={16} color={c.fgMuted} strokeWidth={1.75} />
      <TextInput
        value={text}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={c.fgFaint}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        cursorColor={c.accent}
        style={{ flex: 1, fontFamily: font.regular, fontSize: 15, color: c.fg, paddingVertical: 0 }}
      />
      {text ? (
        <Pressable onPress={() => setText("")} hitSlop={12} accessibilityLabel="Clear search">
          <X size={16} color={c.fgMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
