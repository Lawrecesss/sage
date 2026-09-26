// Fixed hex values mirroring the light theme's design tokens (src/app/globals.css). Exported
// files are rendered server-side with no CSS/DOM, so the `var(--series-N)` tokens ChatChart.tsx
// uses can't resolve here — these are the same colors, pinned to light mode (documents are read
// on white, regardless of the app's theme).

export const SERIES_COLORS = [
  "#3653d4",
  "#8b9ce8",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
] as const;
export const OTHER_COLOR = "#9a9a94";

export const TEXT = "#1b1b18";
export const TEXT_MUTED = "#5c5b56";
export const GRID = "#ebeae5";
export const BORDER = "#e6e5e0";
export const SURFACE = "#ffffff";
export const SURFACE_MUTED = "#efefeb";
export const ACCENT = "#3653d4";
export const ACCENT_SOFT = "#eaeefc";
export const POSITIVE = "#1d7a4b";
export const NEGATIVE = "#c23a36";

export function seriesColor(i: number): string {
  return SERIES_COLORS[i] ?? OTHER_COLOR;
}
