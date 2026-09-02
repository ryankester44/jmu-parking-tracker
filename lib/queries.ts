import type { ServiceClient } from "./supabase/server";
import type { DeckRow, DeckStatRow, ObservationStatus } from "./types";
import { COLLECTION_START_MINUTE, COLLECTION_END_MINUTE, todayLocalDate } from "./time";

export async function getActiveDecks(supabase: ServiceClient): Promise<DeckRow[]> {
  const { data, error } = await supabase
    .from("parking_decks")
    .select("id, slug, display_name, zone_id, sort_order, active, capacity, capacity_source, capacity_note")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`getActiveDecks: ${error.message}`);
  return data ?? [];
}

export interface DeckLatestJoined {
  deck_id: number;
  observed_at: string | null;
  available_spaces: number | null;
  status: ObservationStatus | null;
  source_as_of: string | null;
}

export async function getDeckLatest(supabase: ServiceClient): Promise<DeckLatestJoined[]> {
  const { data, error } = await supabase.from("deck_latest").select("*");
  if (error) throw new Error(`getDeckLatest: ${error.message}`);
  return data ?? [];
}

// Supabase's PostgREST layer hard-caps a single response's row count
// (project setting "Max Rows," 1000 by default) REGARDLESS of a wider
// .range() being requested — silently, no error. A single day's
// observations (deck count x up to 841 minutes) or a weekday's aggregated
// stats can both exceed that once enough of the day/week has been
// collected, which silently truncated "Today's Parking" partway through
// the afternoon in production even after widening the requested range.
// The only fix that doesn't depend on a project setting neither of us can
// change from here is to paginate explicitly and keep requesting pages
// until a short page signals the end.
const PAGE_SIZE = 1000;
// Safety bound on iterations, not an expected case — current queries top
// out around 5 decks x 841 minutes = ~4205 rows (5 pages).
const MAX_PAGES = 50;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function fetchAllPages<T>(
  label: string,
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

/** Full-resolution per-minute observations for one local calendar date, across all active decks. */
export async function getObservationsForDate(
  supabase: ServiceClient,
  localDate: string,
) {
  return fetchAllPages("getObservationsForDate", (from, to) =>
    supabase
      .from("parking_observations")
      .select("deck_id, minute_of_day, observed_at, available_spaces, status")
      .eq("local_date", localDate)
      .gte("minute_of_day", COLLECTION_START_MINUTE)
      .lte("minute_of_day", COLLECTION_END_MINUTE)
      .order("minute_of_day", { ascending: true })
      .range(from, to),
  );
}

/** Per-minute weekday averages for one or more decks, from the pre-aggregated materialized view. */
export async function getWeekdayMinuteStats(
  supabase: ServiceClient,
  weekday: number,
): Promise<DeckStatRow[]> {
  return fetchAllPages("getWeekdayMinuteStats", (from, to) =>
    supabase
      .from("deck_weekday_minute_stats")
      .select("*")
      .eq("day_of_week", weekday)
      .gte("minute_of_day", COLLECTION_START_MINUTE)
      .lte("minute_of_day", COLLECTION_END_MINUTE)
      .order("minute_of_day", { ascending: true })
      .range(from, to),
  );
}

export interface CoverageRow {
  deck_id: number;
  day_of_week: number;
  distinct_days: number;
}

/** How many distinct calendar dates of a given weekday have ever been observed, per deck. */
export async function getWeekdayCoverage(
  supabase: ServiceClient,
  weekday: number,
): Promise<CoverageRow[]> {
  const { data, error } = await supabase
    .from("deck_weekday_coverage")
    .select("*")
    .eq("day_of_week", weekday);
  if (error) throw new Error(`getWeekdayCoverage: ${error.message}`);
  return data ?? [];
}

export async function getMeta(supabase: ServiceClient) {
  const today = todayLocalDate();

  const [
    { data: earliest },
    { data: latest },
    { count: totalObservations },
    { count: observationsToday },
    { data: lastRun },
    { data: lastSuccessfulRun },
    { data: daysOfHistoryRaw },
  ] = await Promise.all([
    supabase
      .from("parking_observations")
      .select("observed_at")
      .order("observed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("parking_observations")
      .select("observed_at")
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("parking_observations").select("*", { count: "exact", head: true }),
    supabase
      .from("parking_observations")
      .select("*", { count: "exact", head: true })
      .eq("local_date", today),
    supabase
      .from("collection_runs")
      .select("run_at, success, decks_ok, decks_failed, error_message")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("collection_runs")
      .select("run_at, decks_ok, decks_failed")
      .eq("success", true)
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("days_of_history"),
  ]);

  return {
    earliestObservedAt: earliest?.observed_at ?? null,
    latestObservedAt: latest?.observed_at ?? null,
    totalObservations: totalObservations ?? 0,
    observationsToday: observationsToday ?? 0,
    daysOfHistory: typeof daysOfHistoryRaw === "number" ? daysOfHistoryRaw : 0,
    lastRun: lastRun ?? null,
    lastSuccessfulRunAt: lastSuccessfulRun?.run_at ?? null,
  };
}
