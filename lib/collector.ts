import type { ServiceClient } from "./supabase/server";
import { fetchJmuFeed, interpretZoneReading } from "./jmu-source";
import { truncateToMinute } from "./time";
import type { DeckRow, ObservationStatus } from "./types";

export interface CollectionResult {
  success: boolean;
  decksOk: number;
  decksFailed: number;
  errorMessage: string | null;
  observedAt: string;
}

/**
 * Runs one collection cycle: fetch JMU's feed once, extract all tracked
 * decks from that single response, and write results. Does NOT check the
 * Mon-Fri 7am-9pm window itself — callers (the API route) decide whether
 * to invoke this at all, so it stays testable/forceable independent of
 * the schedule.
 *
 * Failure handling:
 *   - Whole-feed failure (token fetch fails, data fetch fails, format
 *     changed): no parking_observations rows are written at all for this
 *     minute. That is intentional — a gap in the data, not a fabricated
 *     reading. Logged to collection_runs only.
 *   - Partial failure (feed responded, but a specific zone is missing or
 *     unparseable): that deck gets a row with available_spaces = NULL and
 *     status set accordingly; other decks in the same run are unaffected.
 */
export async function runCollection(
  supabase: ServiceClient,
): Promise<CollectionResult> {
  const startedAt = Date.now();
  const observedAt = truncateToMinute(new Date());
  const observedAtIso = observedAt.toISOString();

  const { data: decks, error: decksError } = await supabase
    .from("parking_decks")
    .select("id, slug, display_name, zone_id, sort_order, active, capacity, capacity_source, capacity_note")
    .eq("active", true);

  if (decksError || !decks || decks.length === 0) {
    await logRun(supabase, {
      success: false,
      decksOk: 0,
      decksFailed: 0,
      errorMessage: `Could not load deck registry: ${decksError?.message ?? "no active decks"}`,
      durationMs: Date.now() - startedAt,
    });
    return {
      success: false,
      decksOk: 0,
      decksFailed: 0,
      errorMessage: "Could not load deck registry",
      observedAt: observedAtIso,
    };
  }

  let feed;
  try {
    feed = await fetchJmuFeed();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logRun(supabase, {
      success: false,
      decksOk: 0,
      decksFailed: decks.length,
      errorMessage: message,
      durationMs: Date.now() - startedAt,
    });
    return {
      success: false,
      decksOk: 0,
      decksFailed: decks.length,
      errorMessage: message,
      observedAt: observedAtIso,
    };
  }

  const sourceAsOf = feed.asOf ? feed.asOf.replace(" ", "T") : null;

  const observationRows: Array<{
    deck_id: number;
    observed_at: string;
    available_spaces: number | null;
    status: ObservationStatus;
    source_as_of: string | null;
    raw_result: string | null;
  }> = [];

  const latestRows: Array<{
    deck_id: number;
    observed_at: string;
    available_spaces: number | null;
    status: ObservationStatus;
    source_as_of: string | null;
  }> = [];

  let decksOk = 0;
  let decksFailed = 0;

  for (const deck of decks as DeckRow[]) {
    const raw = feed.counts.get(deck.zone_id);
    const reading = interpretZoneReading(raw);

    if (reading.status === "ok") decksOk++;
    else decksFailed++;

    observationRows.push({
      deck_id: deck.id,
      observed_at: observedAtIso,
      available_spaces: reading.value,
      status: reading.status,
      source_as_of: sourceAsOf,
      raw_result: reading.raw,
    });

    latestRows.push({
      deck_id: deck.id,
      observed_at: observedAtIso,
      available_spaces: reading.value,
      status: reading.status,
      source_as_of: sourceAsOf,
    });
  }

  const { error: insertError } = await supabase
    .from("parking_observations")
    .upsert(observationRows, {
      onConflict: "deck_id,observed_at",
      ignoreDuplicates: true,
    });

  if (insertError) {
    await logRun(supabase, {
      success: false,
      decksOk: 0,
      decksFailed: decks.length,
      errorMessage: `Insert failed: ${insertError.message}`,
      durationMs: Date.now() - startedAt,
    });
    return {
      success: false,
      decksOk: 0,
      decksFailed: decks.length,
      errorMessage: insertError.message,
      observedAt: observedAtIso,
    };
  }

  // deck_latest only tracks decks we actually got *some* reading attempt
  // for this run. If the whole feed failed we already returned above, so
  // deck_latest is left untouched — the dashboard keeps showing the last
  // real reading (with its real, aging timestamp) rather than pretending
  // a new one arrived.
  await supabase.from("deck_latest").upsert(latestRows, { onConflict: "deck_id" });

  await logRun(supabase, {
    success: true,
    decksOk,
    decksFailed,
    errorMessage: decksFailed > 0 ? `${decksFailed} deck(s) missing/invalid this run` : null,
    durationMs: Date.now() - startedAt,
  });

  return {
    success: true,
    decksOk,
    decksFailed,
    errorMessage: null,
    observedAt: observedAtIso,
  };
}

async function logRun(
  supabase: ServiceClient,
  params: {
    success: boolean;
    decksOk: number;
    decksFailed: number;
    errorMessage: string | null;
    durationMs: number;
  },
) {
  await supabase.from("collection_runs").insert({
    success: params.success,
    decks_ok: params.decksOk,
    decks_failed: params.decksFailed,
    error_message: params.errorMessage,
    duration_ms: params.durationMs,
  });
}
