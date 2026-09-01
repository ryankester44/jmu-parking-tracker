import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getActiveDecks, getWeekdayMinuteStats } from "@/lib/queries";
import { COLLECTION_START_MINUTE, COLLECTION_END_MINUTE } from "@/lib/time";
import { classifyConfidence } from "@/lib/stats";
import { WEEKDAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

const NEAREST_TOLERANCE_MINUTES = 15;

/**
 * "Where Should I Park?" — ranks decks by historical average availability
 * at (or nearest to) a given weekday + minute-of-day, from real collected
 * observations only. If no observation has ever landed on the exact
 * requested minute for a deck (common early on, before much history has
 * accumulated), falls back to the nearest minute within 15 minutes and
 * reports which minute was actually used.
 */
export async function GET(req: NextRequest) {
  const weekdayParam = Number(req.nextUrl.searchParams.get("weekday"));
  const minuteParam = Number(req.nextUrl.searchParams.get("minute"));
  const weekdayMeta = WEEKDAYS.find((w) => w.iso === weekdayParam);

  if (!weekdayMeta) {
    return NextResponse.json(
      { error: "weekday must be 1-5 (Monday-Friday)" },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(minuteParam) ||
    minuteParam < COLLECTION_START_MINUTE ||
    minuteParam > COLLECTION_END_MINUTE
  ) {
    return NextResponse.json(
      { error: `minute must be between ${COLLECTION_START_MINUTE} and ${COLLECTION_END_MINUTE}` },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const [decks, stats] = await Promise.all([
    getActiveDecks(supabase),
    getWeekdayMinuteStats(supabase, weekdayMeta.iso),
  ]);

  const statsByDeck = new Map<number, typeof stats>();
  for (const s of stats) {
    if (!statsByDeck.has(s.deck_id)) statsByDeck.set(s.deck_id, []);
    statsByDeck.get(s.deck_id)!.push(s);
  }

  const ranking = decks.map((deck) => {
    const deckStats = statsByDeck.get(deck.id) ?? [];
    let best: (typeof deckStats)[number] | null = null;
    let bestDistance = Infinity;
    for (const s of deckStats) {
      if (s.avg_available === null) continue;
      const distance = Math.abs(s.minute_of_day - minuteParam);
      if (distance <= NEAREST_TOLERANCE_MINUTES && distance < bestDistance) {
        best = s;
        bestDistance = distance;
      }
    }

    return {
      slug: deck.slug,
      displayName: deck.display_name,
      avgAvailable: best ? Number(best.avg_available) : null,
      resolvedMinute: best ? best.minute_of_day : null,
      distinctDays: best ? best.distinct_days : 0,
      confidence: classifyConfidence(best ? best.distinct_days : 0),
    };
  });

  ranking.sort((a, b) => {
    if (a.avgAvailable === null && b.avgAvailable === null) return 0;
    if (a.avgAvailable === null) return 1;
    if (b.avgAvailable === null) return -1;
    return b.avgAvailable - a.avgAvailable;
  });

  return NextResponse.json({
    weekday: weekdayMeta.iso,
    weekdayLabel: weekdayMeta.full,
    requestedMinute: minuteParam,
    ranking: ranking.map((r, i) => ({ ...r, rank: i + 1 })),
  });
}
