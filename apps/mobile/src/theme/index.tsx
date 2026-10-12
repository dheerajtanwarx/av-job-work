import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { storage } from "@/lib/storage";
import { palettes, radius, space, type, type Palette } from "./tokens";

export * from "./tokens";

export type Appearance = "system" | "light" | "dark";

interface Theme {
  c: Palette;
  dark: boolean;
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
}

const ThemeContext = createContext<Theme | null>(null);
const KEY = "appearance";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setState] = useState<Appearance>(() => (storage.getString(KEY) as Appearance) ?? "system");
  const dark = appearance === "dark" || (appearance === "system" && system === "dark");
  const value = useMemo<Theme>(
    () => ({
      c: dark ? palettes.dark : palettes.light,
      dark,
      appearance,
      setAppearance: (a) => {
        storage.set(KEY, a);
        setState(a);
      },
    }),
    [dark, appearance],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const t = use(ThemeContext);
  if (!t) throw new Error("useTheme outside ThemeProvider");
  return t;
}

/**
 * Theme-aware styles, memoised per palette: `const s = useStyles(styles)` with
 * `const styles = (c: Palette) => StyleSheet.create({...})`.
 */
export function useStyles<T>(factory: (c: Palette) => T): T {
  const { c } = useTheme();
  return useMemo(() => factory(c), [factory, c]);
}

export const tokens = { space, radius, type };
