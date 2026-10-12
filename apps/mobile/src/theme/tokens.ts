/**
 * Design tokens: the same palette as the web app (apps/web/app/globals.css), so both feel like one product.
 * Names are semantic: never reach for a raw hex in a component.
 */
const light = {
  bg: "#fafaf9",
  surface: "#ffffff",
  surface2: "#f4f4f2",
  surface3: "#ebebe8",
  border: "rgba(24,24,20,0.085)",
  borderStrong: "rgba(24,24,20,0.15)",
  fg: "#18181b",
  fg2: "#3f3f46",
  fgMuted: "#6e6e76",
  fgFaint: "#a1a1a8",
  accent: "#3b4ba8",
  accentSolid: "#3b4ba8",
  accentPressed: "#33419a",
  accentSubtle: "rgba(59,75,168,0.08)",
  onAccent: "#ffffff",
  success: "#1d7a4b",
  successSubtle: "rgba(29,122,75,0.09)",
  warning: "#9a5a00",
  warningSolid: "#d98a0b",
  warningSubtle: "rgba(217,138,11,0.11)",
  danger: "#c0352a",
  dangerSolid: "#c93a2f",
  dangerSubtle: "rgba(192,53,42,0.08)",
  info: "#1f6fbf",
  infoSubtle: "rgba(31,111,191,0.09)",
  scrim: "rgba(0,0,0,0.32)",
  chart: ["#2a78d6", "#eb6834", "#1baf7a"],
};

export type Palette = typeof light;

const dark: Palette = {
  bg: "#0d0d0f",
  surface: "#141417",
  surface2: "#1b1b1f",
  surface3: "#232328",
  border: "rgba(255,255,255,0.075)",
  borderStrong: "rgba(255,255,255,0.13)",
  fg: "#ececee",
  fg2: "#c6c6cc",
  fgMuted: "#8c8c95",
  fgFaint: "#5e5e68",
  accent: "#9aa5f6",
  accentSolid: "#5664d2",
  accentPressed: "#6370dc",
  accentSubtle: "rgba(130,145,245,0.12)",
  onAccent: "#ffffff",
  success: "#55c48d",
  successSubtle: "rgba(85,196,141,0.12)",
  warning: "#e8a64a",
  warningSolid: "#d9922a",
  warningSubtle: "rgba(232,166,74,0.12)",
  danger: "#f0786b",
  dangerSolid: "#d2473b",
  dangerSubtle: "rgba(240,120,107,0.12)",
  info: "#6aa8ef",
  infoSubtle: "rgba(106,168,239,0.12)",
  scrim: "rgba(0,0,0,0.55)",
  chart: ["#3987e5", "#d95926", "#199e70"],
};

export const palettes = { light, dark };

/** 4-pt grid. `gutter` is the screen edge padding. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, gutter: 16 } as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

/** Minimum touch target (Material: 48dp). */
export const TOUCH = 48;

export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

/**
 * Type scale. Body is 15 (the web uses 13–14) because this is read at arm's length in the godown.
 * Numbers always use tabular figures so columns of ₹ and quantities line up.
 */
export const type = {
  display: { fontFamily: font.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  headline: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: "uppercase" as const },
} as const;

export type TypeVariant = keyof typeof type;
