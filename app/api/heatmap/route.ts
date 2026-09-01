import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getActiveDecks, getWeekdayMinuteStats } from "@/lib/queries";
import { COLLECTION_START_MINUTE, COLLECTION_END_MINUTE, formatMinuteOfDay } from "@/lib/time";
import { classifyConfidence, classifyStatus } from "@/lib/stats";
import { WEEKDAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

const BUCKET_MINUTES = 30;

/**
 * Deck x time-of-day availability heatmap for one weekday. Buckets raw
 * per-minute stats into 30-minute columns (28 columns, 7:00 AM-9:00 PM) —
 * fine-grained enough to show fill patterns, coarse enough to be legible
 * as a grid. Bucket averages are weighted by each minute's sample_count
 * so a minute with 12 historical readings counts more than one with 1.
 */
export async function GET(req: NextRequest) {
  const weekdayParam = Number(req.nextUrl.searchParams.get("weekday"));
  const weekdayMeta = WEEKDAYS.find((w) => w.iso === weekdayParam);
  if (!weekdayMeta) {
    return NextResponse.json(
      { error: "weekday must be 1-5 (Monday-Friday)" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const [decks, stats] = await Promise.all([
    getActiveDecks(supabase),
    getWeekdayMinuteStats(supabase, weekdayMeta.iso),
  ]);

  const bucketStarts: number[] = [];
  for (let m = COLLECTION_START_MINUTE; m <= COLLECTION_END_MINUTE; m += BUCKET_MINUTES) {
    bucketStarts.push(m);
  }

  const buckets = bucketStarts.map((start, i) => {
    const end = i === bucketStarts.length - 1 ? COLLECTION_END_MINUTE : Math.min(start + BUCKET_MINUTES - 1, COLLECTION_END_MINUTE);
    return {
      startMinute: start,
      endMinute: end,
      label: formatMinuteOfDay(start),
    };
  });

  function bucketIndexFor(minute: number): number {
    const idx = Math.floor((minute - COLLECTION_START_MINUTE) / BUCKET_MINUTES);
    return Math.min(idx, buckets.length - 1);
  }

  const deckById = new Map(decks.map((d) => [d.id, d]));

  // deckId -> bucketIndex -> { weightedSum, weight, minDistinctDays }
  const acc = new Map<number, Map<number, { sum: number; weight: number; minDays: number }>>();

  for (const s of stats) {
    if (s.avg_available === null || s.sample_count === 0) continue;
    const bIdx = bucketIndexFor(s.minute_of_day);
    if (!acc.has(s.deck_id)) acc.set(s.deck_id, new Map());
    const deckAcc = acc.get(s.deck_id)!;
    const cell = deckAcc.get(bIdx) ?? { sum: 0, weight: 0, minDays: Infinity };
    cell.sum += Number(s.avg_available) * s.sample_count;
    cell.weight += s.sample_count;
    cell.minDays = Math.min(cell.minDays, s.distinct_days);
    deckAcc.set(bIdx, cell);
  }

  const cells = decks.flatMap((deck) =>
    buckets.map((bucket, bIdx) => {
      const cell = acc.get(deck.id)?.get(bIdx);
      const avgAvailable = cell ? cell.sum / cell.weight : null;
      const distinctDays = cell && cell.minDays !== Infinity ? cell.minDays : 0;
      return {
        deckSlug: deck.slug,
        bucketIndex: bIdx,
        avgAvailable,
        status: classifyStatus(
          avgAvailable === null ? null : Math.round(avgAvailable),
          deck.capacity,
        ),
        confidence: classifyConfidence(distinctDays),
        distinctDays,
      };
    }),
  );
  void deckById;

  return NextResponse.json({
    weekday: weekdayMeta.iso,
    weekdayLabel: weekdayMeta.full,
    bucketMinutes: BUCKET_MINUTES,
    buckets,
    decks: decks.map((d) => ({ slug: d.slug, displayName: d.display_name })),
    cells,
  });
}
