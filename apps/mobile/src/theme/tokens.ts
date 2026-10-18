/**
 * Design tokens. Linear / Vercel (Geist) direction: near-monochrome neutrals, hairline borders, one indigo accent kept
 * for the primary action and active states. Green / amber / red appear only as status dots and soft pills.
 * Names are semantic: never reach for a raw hex in a component.
 */
const light = {
  bg: "#fafafa",
  surface: "#ffffff",
  surface2: "#f4f4f5",
  surface3: "#e9e9ec",
  border: "rgba(9,9,11,0.08)",
  borderStrong: "rgba(9,9,11,0.14)",
  fg: "#09090b",
  fg2: "#3f3f46",
  fgMuted: "#71717a",
  fgFaint: "#a1a1aa",
  accent: "#4f58c9",
  accentSolid: "#5e6ad2",
  accentPressed: "#5059c4",
  accentSubtle: "rgba(94,106,210,0.09)",
  onAccent: "#ffffff",
  success: "#18794e",
  successSubtle: "rgba(24,121,78,0.09)",
  warning: "#a35200",
  warningSolid: "#f59e0b",
  warningSubtle: "rgba(245,158,11,0.12)",
  danger: "#c4302b",
  dangerSolid: "#e5484d",
  dangerSubtle: "rgba(229,72,77,0.09)",
  info: "#0b68cb",
  infoSubtle: "rgba(11,104,203,0.08)",
  scrim: "rgba(0,0,0,0.32)",
  chart: ["#2a78d6", "#eb6834", "#1baf7a"],
};

export type Palette = typeof light;

const dark: Palette = {
  bg: "#0a0a0b",
  surface: "#111113",
  surface2: "#18181b",
  surface3: "#232327",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  fg: "#ededef",
  fg2: "#c5c5cb",
  fgMuted: "#8b8b94",
  fgFaint: "#5c5c65",
  accent: "#929bf2",
  accentSolid: "#5e6ad2",
  accentPressed: "#6c77da",
  accentSubtle: "rgba(146,155,242,0.12)",
  onAccent: "#ffffff",
  success: "#4cc38a",
  successSubtle: "rgba(76,195,138,0.12)",
  warning: "#f1a10d",
  warningSolid: "#f1a10d",
  warningSubtle: "rgba(241,161,13,0.12)",
  danger: "#ff6369",
  dangerSolid: "#e5484d",
  dangerSubtle: "rgba(255,99,105,0.12)",
  info: "#52a9ff",
  infoSubtle: "rgba(82,169,255,0.12)",
  scrim: "rgba(0,0,0,0.6)",
  chart: ["#3987e5", "#d95926", "#199e70"],
};

export const palettes = { light, dark };

/** 8-pt grid (4 is the half-step for tight insides). `gutter` is the screen edge padding. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, gutter: 16 } as const;

/** `card` (12) is the standard surface radius; `control` (8) is for buttons, inputs and segmented tracks. */
export const radius = { sm: 6, control: 8, md: 10, card: 12, lg: 14, xl: 20, pill: 999 } as const;

/** 1px rule used for every border. */
export const hairline = 1;

/** Minimum touch target (Material: 48dp). */
export const TOUCH = 48;

export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

/**
 * Type scale. Body is 15 because this is read at arm's length in the godown.
 * Numbers always use tabular figures (`<Text num>`) so columns of ₹ and quantities line up.
 * Labels are sentence case; `overline` (all caps) is legacy and is being phased out.
 */
export const type = {
  hero: { fontFamily: font.semibold, fontSize: 40, lineHeight: 46, letterSpacing: -1.4 },
  display: { fontFamily: font.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  stat: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.6 },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  headline: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.medium, fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: "uppercase" as const },
} as const;

export type TypeVariant = keyof typeof type;
