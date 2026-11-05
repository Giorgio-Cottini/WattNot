// The light theme: a navy accent on the iOS grouped grey, white cards, the type
// ramp and the spacing grid. The role colours are shared with the app icon
// ("Signal", release/icon/icon.svg). Light only (D21).

import type { TextStyle } from "react-native";

import type { PriceRole } from "./lib/levels.ts";

export const color = {
  // The one tint of the app: controls, links, the tab bar. The navy of the icon
  // background, so green means cheap only. 15.3:1 on white.
  accent: "#10263f",
  onAccent: "#ffffff",
  // Behind a pressed row or a selected chip.
  accentSoft: "#e8ebf0",
  // The page, and the cards on it.
  ground: "#f2f2f7",
  card: "#ffffff",
  ink: "#1c1c1e",
  // Secondary text, 5.0:1 on the ground.
  inkSecondary: "#5f6773",
  hairline: "#e2e4e9",
  // The track of the day bar and the segmented control.
  control: "#e9e9ee",
  // Behind the best window in the chart.
  shade: "rgba(28, 28, 30, 0.05)",
  // Chart fill of a day without levels: no level is implied.
  unleveled: "#d6dce3",
} as const;

// Fill and text of each price role, and the role's own hue as text on a white
// card. Every text pair is at least 4.5:1: the light fills are deepened for text.
export const roleColor: Record<
  PriceRole,
  { fill: string; ink: string; text: string }
> = {
  zeroOrNegative: { fill: "#2276b0", ink: "#ffffff", text: "#2276b0" },
  cheap: { fill: "#4fb874", ink: "#1c1c1e", text: "#2e7d4f" },
  normal: { fill: "#c9d3de", ink: "#1c1c1e", text: "#4b5d70" },
  expensive: { fill: "#efbf3a", ink: "#1c1c1e", text: "#8f6200" },
  veryExpensive: { fill: "#b8327a", ink: "#ffffff", text: "#b8327a" },
};

// The price in the hue of its role, ink when the day has no levels.
export function roleText(role: PriceRole | null): string {
  return role ? roleColor[role].text : color.ink;
}

export const ROLE_ORDER: readonly PriceRole[] = [
  "zeroOrNegative",
  "cheap",
  "normal",
  "expensive",
  "veryExpensive",
];

export const space = {
  gutter: 16,
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
} as const;

// Corners: cards, the blocks inside them, chips and tags.
export const radius = { card: 16, block: 12, chip: 8 } as const;

// Minimum side of a touch target (HIG).
export const TARGET = 44;

// React Native scales every size by one factor. The large display sizes stop
// growing here, so a title keeps its words whole at accessibility sizes.
export const DISPLAY_SCALE_CAP = 1.6;

// Dimmed while a finger is down, as a system control.
export const PRESSED = { opacity: 0.55 } as const;

const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

// System font (SF Pro). Sizes follow the iOS text styles, so Dynamic Type scales
// them. The current price is the one size exception.
export const type = {
  // Title 1, bold: the screen titles and the first run.
  zone: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  // The price in the current price block.
  bigPrice: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: -0.8,
    ...tabular,
  },
  // Title 3: the date of a day page.
  title: { fontSize: 20, lineHeight: 25, fontWeight: "600" },
  window: { fontSize: 28, lineHeight: 34, fontWeight: "600", ...tabular },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 22, ...tabular },
  subhead: { fontSize: 15, lineHeight: 20, ...tabular },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  tag: { fontSize: 13, lineHeight: 16, fontWeight: "600" },
} satisfies Record<string, TextStyle>;

// The native segmented control in the app's tint: navy selection, white label.
export const segmented = {
  appearance: "light",
  tintColor: color.accent,
  backgroundColor: color.control,
  fontStyle: { color: color.ink, fontSize: 13 },
  activeFontStyle: { color: color.onAccent, fontSize: 13, fontWeight: "600" },
} as const;
