import { CONFIDENCE_LABEL, CONFIDENCE_TRAILER, pluralizeWeekdayCount } from "@/lib/stats";
import type { ConfidenceLevel } from "@/lib/types";

const DOT_COLOR: Record<ConfidenceLevel, string> = {
  high: "#0ca30c",
  medium: "#fab219",
  low: "#898781",
  none: "#c3c2b7",
};

/** @deprecated use `pluralizeWeekdayCount` from lib/stats — kept as a thin re-export so existing imports don't break. */
export function confidenceSentence(distinctDays: number, weekdayLabel: string): string {
  return `${pluralizeWeekdayCount(distinctDays, weekdayLabel)}.`;
}

/**
 * Confidence is a label sitting alongside real data, never a gate on it —
 * this badge is shown next to whatever the current best estimate is
 * (even from a single observation), it just says plainly how much history
 * backs that estimate. See lib/stats.ts classifyConfidence for the
 * display-vs-confidence distinction this depends on.
 */
export function ConfidenceBadge({
  confidence,
  distinctDays,
  weekdayLabel,
  showTrailer = false,
}: {
  confidence: ConfidenceLevel;
  distinctDays: number;
  weekdayLabel: string;
  showTrailer?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-[color:var(--text-secondary)]">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: DOT_COLOR[confidence] }}
          aria-hidden="true"
        />
        {CONFIDENCE_LABEL[confidence]} &middot; {pluralizeWeekdayCount(distinctDays, weekdayLabel)}
      </span>
      {showTrailer && confidence !== "none" && (
        <span className="text-[color:var(--text-muted)]">{CONFIDENCE_TRAILER[confidence]}</span>
      )}
    </span>
  );
}
