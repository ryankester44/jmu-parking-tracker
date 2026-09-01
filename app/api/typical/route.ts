import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getActiveDecks,
  getWeekdayCoverage,
  getWeekdayMinuteStats,
} from "@/lib/queries";
import { COLLECTION_START_MINUTE, COLLECTION_END_MINUTE } from "@/lib/time";
import { classifyConfidence } from "@/lib/stats";
import { WEEKDAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Historical per-minute averages for one weekday (?weekday=1..5, ISO
 * Mon-Fri), one line per deck, from the pre-aggregated materialized view
 * — never a live scan of raw observations. Averages for different
 * weekdays are never mixed together; this endpoint only ever returns one
 * weekday at a time.
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
  const [decks, stats, coverage] = await Promise.all([
    getActiveDecks(supabase),
    getWeekdayMinuteStats(supabase, weekdayMeta.iso),
    getWeekdayCoverage(supabase, weekdayMeta.iso),
  ]);

  const coverageByDeck = new Map(coverage.map((c) => [c.deck_id, c.distinct_days]));

  const decksOut = decks.map((d) => {
    const distinctDays = coverageByDeck.get(d.id) ?? 0;
    return {
      slug: d.slug,
      displayName: d.display_name,
      capacity: d.capacity,
      distinctDays,
      confidence: classifyConfidence(distinctDays),
    };
  });

  const statsByMinute = new Map<number, Map<number, number | null>>();
  for (const s of stats) {
    if (!statsByMinute.has(s.minute_of_day)) statsByMinute.set(s.minute_of_day, new Map());
    statsByMinute.get(s.minute_of_day)!.set(
      s.deck_id,
      s.avg_available === null ? null : Number(s.avg_available),
    );
  }

  const rows: Array<Record<string, number | null>> = [];
  for (let minute = COLLECTION_START_MINUTE; minute <= COLLECTION_END_MINUTE; minute++) {
    const row: Record<string, number | null> = { minuteOfDay: minute };
    const atMinute = statsByMinute.get(minute);
    for (const deck of decks) {
      row[deck.slug] = atMinute?.get(deck.id) ?? null;
    }
    rows.push(row);
  }

  return NextResponse.json({
    weekday: weekdayMeta.iso,
    weekdayLabel: weekdayMeta.full,
    decks: decksOut,
    rows,
  });
}
