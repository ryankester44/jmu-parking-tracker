import type { ObservationStatus } from "./types";

/**
 * Detects a transient feed glitch: a short run of zero ("FULL") readings
 * immediately preceded by, and now followed by, a similar and substantially
 * higher value. Confirmed live on 2026-09-07: decks 1 and 3 both read 0 for
 * exactly 4 straight minutes (17:50-17:53 UTC), then recovered to within a
 * few spaces of their pre-drop value (641 -> 0x4 -> 650; 41 -> 0x4 -> 52).
 * JMU's own site was the source of the bad reading, not our collector.
 *
 * This is deliberately NOT "any simultaneous multi-deck zero is suspect" —
 * some decks legitimately sit at 0 for hours at a time (verified in this
 * same dataset: decks 2/4/5 holding 0 for multi-hour stretches, which is
 * real occupancy, not a glitch). The distinguishing signal is the SHAPE:
 * a real full-lot event is sustained; a glitch self-reverses within
 * minutes back to essentially the same count as before the dip.
 */

export interface HistoryPoint {
  value: number | null;
  status: ObservationStatus;
}

export const MAX_GLITCH_RUN_MINUTES = 15;
const MIN_PRE_DROP_VALUE = 10;
const RECOVERY_TOLERANCE_FRACTION = 0.5;

/**
 * @param priorHistory This deck's recent readings, oldest first, NOT
 *   including the newest one (the one that just arrived this cycle).
 * @param newValue      This cycle's just-parsed, "ok"-status value.
 * @returns the number of trailing rows in `priorHistory` (immediately
 *   before the newest reading) that should be retroactively corrected to
 *   null/"invalid", or 0 if this isn't a glitch pattern.
 */
export function detectTransientZeroGlitch(
  priorHistory: HistoryPoint[],
  newValue: number,
): number {
  if (newValue <= 0) return 0; // not a recovery reading

  let runLength = 0;
  for (let i = priorHistory.length - 1; i >= 0; i--) {
    const point = priorHistory[i];
    if (point && point.status === "ok" && point.value === 0) {
      runLength++;
    } else {
      break;
    }
  }
  if (runLength === 0 || runLength > MAX_GLITCH_RUN_MINUTES) return 0;

  const beforeDrop = priorHistory[priorHistory.length - 1 - runLength];
  if (!beforeDrop || beforeDrop.status !== "ok" || beforeDrop.value === null) return 0;
  if (beforeDrop.value < MIN_PRE_DROP_VALUE) return 0;

  const diff = Math.abs(newValue - beforeDrop.value);
  if (diff > beforeDrop.value * RECOVERY_TOLERANCE_FRACTION) return 0;

  return runLength;
}
