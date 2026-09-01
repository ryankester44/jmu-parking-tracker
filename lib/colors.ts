import type { AvailabilityStatus } from "./types";

/**
 * Categorical palette for the 5 tracked decks, in FIXED order (never
 * cycled, never reassigned when a deck is filtered out) — from the
 * dataviz skill's validated default theme (worst adjacent CVD ΔE 24.2 in
 * light mode). Deck identity is carried by this color everywhere: cards,
 * charts, heatmap row labels, rankings.
 *
 * JMU purple/gold are used as brand/UI accents elsewhere (header, active
 * tab, buttons) but deliberately NOT as data-encoding colors here — mixing
 * brand color into the categorical set would break the validated ordering.
 */
export const DECK_COLORS: Record<string, { light: string; dark: string }> = {
  ballard: { light: "#2a78d6", dark: "#3987e5" }, // blue
  "charlie-obaugh": { light: "#1baf7a", dark: "#199e70" }, // aqua
  chesapeake: { light: "#eda100", dark: "#c98500" }, // yellow
  mason: { light: "#008300", dark: "#008300" }, // green
  warsaw: { light: "#4a3aa7", dark: "#9085e9" }, // violet
};

export const DECK_ORDER = ["ballard", "charlie-obaugh", "chesapeake", "mason", "warsaw"];

export function deckColor(slug: string, mode: "light" | "dark" = "light"): string {
  return DECK_COLORS[slug]?.[mode] ?? "#898781";
}

/** Fixed status palette — reserved, never reused for series identity. */
export const STATUS_COLORS: Record<AvailabilityStatus, { light: string; dark: string }> = {
  plenty: { light: "#0ca30c", dark: "#0ca30c" },
  moderate: { light: "#fab219", dark: "#fab219" },
  low: { light: "#ec835a", dark: "#ec835a" },
  nearly_full: { light: "#d03b3b", dark: "#d03b3b" },
  full: { light: "#d03b3b", dark: "#d03b3b" },
  unknown: { light: "#898781", dark: "#898781" },
};

export const STATUS_ICON: Record<AvailabilityStatus, string> = {
  plenty: "●", // filled circle — plenty
  moderate: "◒", // half circle — moderate
  low: "◔", // quarter circle — low
  nearly_full: "◢", // small triangle — nearly full
  full: "✕", // x — full
  unknown: "–", // dash — no reading
};
