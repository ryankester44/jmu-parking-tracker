import type { AvailabilityStatus, ConfidenceLevel, DeckRow } from "./types";

/**
 * Status thresholds.
 *
 * When a deck's total COMMUTER capacity is reliably known (see
 * db/migrations/001_init.sql `capacity` / `capacity_source`), status is a
 * percentage of that capacity:
 *   >= 50%            Plenty of Spaces
 *   20% - 49%         Moderate Availability
 *   5%  - 19%         Low Availability
 *   > 0% and < 5%     Nearly Full
 *   <= 0              Full (JMU's own feed reports 0/negative as FULL)
 *
 * When capacity is NOT reliably known (currently: Mason Deck — see the
 * capacity_note on that row), status falls back to an absolute count of
 * open spaces instead of inventing a capacity:
 *   > 150             Plenty of Spaces
 *   51 - 150          Moderate Availability
 *   16 - 50           Low Availability
 *   1  - 15           Nearly Full
 *   <= 0              Full
 *
 * These thresholds are a judgment call, not a JMU-published standard —
 * they're documented here (and surfaced in the Data Information section)
 * so they're auditable, not a black box.
 */
export function classifyStatus(
  availableSpaces: number | null,
  capacity: number | null,
): AvailabilityStatus {
  if (availableSpaces === null) return "unknown";
  if (availableSpaces <= 0) return "full";

  if (capacity && capacity > 0) {
    const pct = availableSpaces / capacity;
    if (pct >= 0.5) return "plenty";
    if (pct >= 0.2) return "moderate";
    if (pct >= 0.05) return "low";
    return "nearly_full";
  }

  if (availableSpaces > 150) return "plenty";
  if (availableSpaces > 50) return "moderate";
  if (availableSpaces > 15) return "low";
  return "nearly_full";
}

export const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  plenty: "Plenty of Spaces",
  moderate: "Moderate Availability",
  low: "Low Availability",
  nearly_full: "Nearly Full",
  full: "FULL",
  unknown: "No Reading",
};

/**
 * Data-confidence tiers, based on how many distinct calendar dates of a
 * given weekday have contributed at least one valid observation.
 *   HIGH    >= 8 of that weekday observed
 *   MEDIUM  3-7
 *   LOW     1-2
 *   NONE    0
 *
 * IMPORTANT: this is a LABEL, not a display gate. Data availability and
 * data confidence are two separate questions:
 *   - Availability: is distinctDays >= 1? If so, show the real average —
 *     one real observation IS the average until a second one arrives.
 *   - Confidence: how much history backs that average? This function
 *     answers only that, and must never be used to decide whether to show
 *     a result. The only case where nothing is shown is distinctDays === 0
 *     (no valid observation exists at all) — callers should treat NONE as
 *     "no data," never LOW/MEDIUM as "not enough to show."
 */
export function classifyConfidence(distinctDays: number): ConfidenceLevel {
  if (distinctDays >= 8) return "high";
  if (distinctDays >= 3) return "medium";
  if (distinctDays >= 1) return "low";
  return "none";
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High Confidence",
  medium: "Medium Confidence",
  low: "Low Confidence",
  none: "Not Enough Data",
};

/**
 * Short qualifier shown alongside the confidence label — purely
 * informational framing, never a reason to hide the underlying number.
 * A LOW badge still sits next to a real, displayed average; it just says
 * so plainly.
 */
export const CONFIDENCE_TRAILER: Record<ConfidenceLevel, string> = {
  low: "Early estimate — more data will improve accuracy.",
  medium: "Estimate improving as additional weeks are collected.",
  high: "Based on a larger historical sample.",
  none: "",
};

/** "1 Tuesday" / "5 Tuesdays" / "No Tuesdays collected yet" */
export function pluralizeWeekdayCount(distinctDays: number, weekdayLabel: string): string {
  if (distinctDays === 0) return `No ${weekdayLabel}s collected yet`;
  const plural = distinctDays === 1 ? weekdayLabel : `${weekdayLabel}s`;
  return `Based on ${distinctDays} ${plural}`;
}

export function methodologyForDeck(deck: Pick<DeckRow, "capacity">): "capacity" | "absolute" {
  return deck.capacity && deck.capacity > 0 ? "capacity" : "absolute";
}
