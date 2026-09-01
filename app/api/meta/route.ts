import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getActiveDecks, getMeta } from "@/lib/queries";
import { methodologyForDeck } from "@/lib/stats";
import { isWithinCollectionWindow } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceClient();
  const [decks, meta] = await Promise.all([
    getActiveDecks(supabase),
    getMeta(supabase),
  ]);

  return NextResponse.json({
    earliestObservedAt: meta.earliestObservedAt,
    latestObservedAt: meta.latestObservedAt,
    totalObservations: meta.totalObservations,
    observationsToday: meta.observationsToday,
    daysOfHistory: meta.daysOfHistory,
    lastRun: meta.lastRun,
    lastSuccessfulRunAt: meta.lastSuccessfulRunAt,
    collectorWindowActive: isWithinCollectionWindow(),
    collectionWindow: {
      days: "Monday-Friday",
      start: "7:00 AM",
      end: "9:00 PM",
      timezone: "America/New_York",
    },
    decks: decks.map((d) => ({
      slug: d.slug,
      displayName: d.display_name,
      capacity: d.capacity,
      capacitySource: d.capacity_source,
      capacityNote: d.capacity_note,
      methodology: methodologyForDeck(d),
    })),
  });
}
