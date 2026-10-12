import type { ServiceClient } from "./supabase/server";
import { fetchJmuFeed, interpretZoneReading } from "./jmu-source";
import { truncateToMinute } from "./time";
import type { DeckRow, ObservationStatus } from "./types";
import { detectTransientZeroGlitch, MAX_GLITCH_RUN_MINUTES, type HistoryPoint } from "./anomaly";

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
 *   - Transient feed glitch (JMU's own site briefly reports 0 for a deck
 *     that's actually nowhere near full, then recovers): can't be caught
 *     at write-time (we don't know it'll recover until the NEXT good
 *     reading arrives), so this is healed retroactively — see
 *     healTransientZeroGlitch() below, called once per deck whenever a
 *     positive reading arrives, in case it's the "recovery" from an
 *     as-yet-uncorrected dip. Confirmed against a real incident
 *     (2026-09-07, decks 1 & 3, 4 straight minutes at 0 then back to
 *     within a few spaces of the pre-drop value) — see lib/anomaly.ts.
 */
const DECK_FETCH_MAX_ATTEMPTS = 3;
const DECK_FETCH_RETRY_DELAYS_MS = [300, 800];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The parking_decks lookup is a trivial 5-row query, but a sample of
 * production collection_runs (2026-09-14, 11:00-12:00 UTC) showed it
 * failing outright ~27% of the time during the 7-9am ET window, every
 * failure stalling for a near-identical ~5s before erroring — the
 * signature of transient connection/pool contention, not a real data
 * problem. That single failure used to blank out the entire minute (no
 * observation rows written at all, on ALL 5 decks) even though the
 * feed fetch right after it would very likely have succeeded. Retrying
 * a couple of times with a short backoff costs at most ~1.1s and turns
 * most of those into a normal successful run instead of a data gap.
 */
async function fetchActiveDecksWithRetry(supabase: ServiceClient) {
  let last: Awaited<ReturnType<typeof queryActiveDecks>> | null = null;
  for (let attempt = 0; attempt < DECK_FETCH_MAX_ATTEMPTS; attempt++) {
    last = await queryActiveDecks(supabase);
    if (!last.error && last.data && last.data.length > 0) return last;
    const delay = DECK_FETCH_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) {
      await sleep(delay);
    }
  }
  return last!;
}

function queryActiveDecks(supabase: ServiceClient) {
  return supabase
    .from("parking_decks")
    .select("id, slug, display_name, zone_id, sort_order, active, capacity, capacity_source, capacity_note")
    .eq("active", true);
}

export async function runCollection(
  supabase: ServiceClient,
): Promise<CollectionResult> {
  const startedAt = Date.now();
  const observedAt = truncateToMinute(new Date());
  const observedAtIso = observedAt.toISOString();

  const { data: decks, error: decksError } = await fetchActiveDecksWithRetry(supabase);

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

  // Any deck that just posted a positive reading might be the "recovery"
  // side of a transient zero-glitch a few minutes back — check and heal.
  for (const row of observationRows) {
    if (row.status === "ok" && row.available_spaces !== null && row.available_spaces > 0) {
      await healTransientZeroGlitch(supabase, row.deck_id, row.available_spaces, observedAtIso);
    }
  }

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

/**
 * Looks back at this deck's recent readings (strictly before the newest
 * one) for a transient zero-glitch pattern, and if found, retroactively
 * corrects those rows to available_spaces = NULL, status = 'invalid'.
 * See detectTransientZeroGlitch's docstring for why this can only be
 * decided after the fact, once a recovery reading is in hand.
 */
async function healTransientZeroGlitch(
  supabase: ServiceClient,
  deckId: number,
  newValue: number,
  beforeObservedAtIso: string,
): Promise<void> {
  const { data: recent } = await supabase
    .from("parking_observations")
    .select("observed_at, available_spaces, status")
    .eq("deck_id", deckId)
    .lt("observed_at", beforeObservedAtIso)
    .order("observed_at", { ascending: false })
    .limit(MAX_GLITCH_RUN_MINUTES + 1);

  if (!recent || recent.length === 0) return;

  const oldestFirst = [...recent].reverse();
  const priorHistory: HistoryPoint[] = oldestFirst.map((r) => ({
    value: r.available_spaces,
    status: r.status as ObservationStatus,
  }));

  const runLength = detectTransientZeroGlitch(priorHistory, newValue);
  if (runLength === 0) return;

  const timestampsToFix = oldestFirst.slice(oldestFirst.length - runLength).map((r) => r.observed_at);

  await supabase
    .from("parking_observations")
    .update({ available_spaces: null, status: "invalid" })
    .eq("deck_id", deckId)
    .in("observed_at", timestampsToFix);
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
