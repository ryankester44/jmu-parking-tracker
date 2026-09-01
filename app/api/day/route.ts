import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getServiceClient } from "@/lib/supabase/server";
import { getActiveDecks, getObservationsForDate } from "@/lib/queries";
import { COLLECTION_START_MINUTE, COLLECTION_END_MINUTE, todayLocalDate } from "@/lib/time";
import { WEEKDAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Minute-level observations for one local calendar date (?date=YYYY-MM-DD,
 * defaults to today in America/New_York), across all active decks.
 *
 * Returns a fully populated minute grid (every minute from 7:00 AM to
 * 9:00 PM, even ones with no data) so the chart can render a true visual
 * gap for missing minutes instead of a misleading straight line across
 * them.
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? todayLocalDate();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const [decks, observations] = await Promise.all([
    getActiveDecks(supabase),
    getObservationsForDate(supabase, date),
  ]);

  const isoWeekday = DateTime.fromISO(date, { zone: "utc" }).weekday;
  const weekdayMeta = WEEKDAYS.find((w) => w.iso === isoWeekday) ?? null;

  const byMinute = new Map<number, Map<number, { available: number | null; status: string }>>();
  for (const obs of observations) {
    if (!byMinute.has(obs.minute_of_day)) byMinute.set(obs.minute_of_day, new Map());
    byMinute.get(obs.minute_of_day)!.set(obs.deck_id, {
      available: obs.available_spaces,
      status: obs.status,
    });
  }

  const rows: Array<Record<string, number | string | null>> = [];
  for (let minute = COLLECTION_START_MINUTE; minute <= COLLECTION_END_MINUTE; minute++) {
    const row: Record<string, number | string | null> = { minuteOfDay: minute };
    const atMinute = byMinute.get(minute);
    for (const deck of decks) {
      row[deck.slug] = atMinute?.get(deck.id)?.available ?? null;
    }
    rows.push(row);
  }

  return NextResponse.json({
    date,
    weekday: weekdayMeta,
    isWeekend: weekdayMeta === null,
    decks: decks.map((d) => ({ slug: d.slug, displayName: d.display_name, sortOrder: d.sort_order })),
    rows,
  });
}
