import { formatMinuteOfDay } from "./time";
import { pluralizeWeekdayCount } from "./stats";
import type { ConfidenceLevel } from "./types";

export interface TypicalRow {
  minuteOfDay: number;
  [deckSlug: string]: number | null;
}

export interface DeckInsight {
  slug: string;
  displayName: string;
  confidence: ConfidenceLevel;
  distinctDays: number;
  sentences: string[];
}

/**
 * Plain historical-average insight generation — NOT a forecasting model.
 * Two simple statistics per deck: the minute-of-day with the highest
 * average availability, and the steepest 60-minute average decline (when
 * one exists).
 *
 * DISPLAY vs CONFIDENCE: the only gate on showing an insight is whether
 * any real data point exists at all (`points.length > 0`, i.e.
 * distinctDays >= 1). There is no minimum sample size beyond that — one
 * real Tuesday is enough to say something, it's just phrased and labeled
 * as an early estimate (see the `confidence === "low"` branch below)
 * rather than a settled pattern. Confidence changes the WORDING, never
 * whether a sentence is produced.
 */
export function generateInsights(
  rows: TypicalRow[],
  decks: Array<{ slug: string; displayName: string; confidence: ConfidenceLevel; distinctDays: number }>,
  weekdayLabel: string,
): DeckInsight[] {
  return decks.map((deck) => {
    const points = rows
      .map((r) => ({ minute: r.minuteOfDay, value: r[deck.slug] }))
      .filter((p): p is { minute: number; value: number } => typeof p.value === "number");

    const sentences: string[] = [];

    if (points.length > 0) {
      const isLow = deck.confidence === "low";
      const basis = pluralizeWeekdayCount(deck.distinctDays, weekdayLabel); // "Based on 1 Tuesday"

      const values = points.map((p) => p.value);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const range = max - min;

      const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]!);
      sentences.push(
        isLow
          ? `${basis} collected so far, ${deck.displayName} had the most availability around ${formatMinuteOfDay(peak.minute)}.`
          : `Historically has the most remaining spaces around ${formatMinuteOfDay(peak.minute)}.`,
      );

      if (peak.minute <= points[0]!.minute + 105 && !isLow) {
        // Only volunteered once there's more than a single early data
        // point behind it — with 1-2 days this would just restate the
        // sentence above.
        sentences.push(`Usually most available before ${formatMinuteOfDay(peak.minute + 15)}.`);
      }

      if (range > 0) {
        let steepest: { start: number; end: number; drop: number } | null = null;
        for (let i = 0; i < points.length; i++) {
          const windowEnd = points[i]!.minute + 60;
          const j = points.findIndex((p, idx) => idx > i && p.minute >= windowEnd);
          if (j === -1) continue;
          const drop = points[i]!.value - points[j]!.value;
          if (drop > 0 && (!steepest || drop > steepest.drop)) {
            steepest = { start: points[i]!.minute, end: points[j]!.minute, drop };
          }
        }
        if (steepest && steepest.drop >= range * 0.3) {
          sentences.push(
            isLow
              ? `Early data suggests availability drops after ${formatMinuteOfDay(steepest.start)}.`
              : `Availability typically drops rapidly between ${formatMinuteOfDay(
                  steepest.start,
                )} and ${formatMinuteOfDay(steepest.end)}.`,
          );
        }
      }
    }

    return {
      slug: deck.slug,
      displayName: deck.displayName,
      confidence: deck.confidence,
      distinctDays: deck.distinctDays,
      sentences: sentences.slice(0, 2),
    };
  });
}
