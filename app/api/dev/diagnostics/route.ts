import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getActiveDecks, getDeckLatest } from "@/lib/queries";
import { fetchJmuFeed } from "@/lib/jmu-source";
import { isWithinCollectionWindow, todayLocalDate } from "@/lib/time";

export const dynamic = "force-dynamic";

interface Diagnostics {
  supabaseConfigured: boolean;
  databaseReachable: boolean;
  parkingTableExists: boolean;
  totalRows: number | null;
  rowsToday: number | null;
  latestObservation: string | null;
  latestByDeck: Array<{
    slug: string;
    displayName: string;
    availableSpaces: number | null;
    observedAt: string | null;
    status: string | null;
  }>;
  lastCollectionRun: {
    run_at: string;
    success: boolean;
    decks_ok: number;
    decks_failed: number;
    error_message: string | null;
  } | null;
  collectionWindowActive: boolean;
  jmuSourceTested: boolean;
  jmuSourceReachable: boolean | null;
  jmuZonesReturned: number | null;
  errors: string[];
}

/**
 * Development diagnostics — the "why isn't anything showing" answer key.
 * Never exposes actual key/URL values, only booleans/counts/timestamps.
 * Refuses outright in production (NODE_ENV === "production"), same
 * pattern as /api/dev-collect.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const result: Diagnostics = {
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    databaseReachable: false,
    parkingTableExists: false,
    totalRows: null,
    rowsToday: null,
    latestObservation: null,
    latestByDeck: [],
    lastCollectionRun: null,
    collectionWindowActive: isWithinCollectionWindow(),
    jmuSourceTested: false,
    jmuSourceReachable: null,
    jmuZonesReturned: null,
    errors: [],
  };

  if (!result.supabaseConfigured) {
    result.errors.push(
      "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set. Copy .env.example to .env.local and fill them in.",
    );
    return NextResponse.json(result);
  }

  let supabase;
  try {
    supabase = getServiceClient();
    result.databaseReachable = true;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "Could not create Supabase client");
    return NextResponse.json(result);
  }

  try {
    const { count, error } = await supabase
      .from("parking_observations")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    result.parkingTableExists = true;
    result.totalRows = count ?? 0;
  } catch (err) {
    result.errors.push(
      `parking_observations table: ${err instanceof Error ? err.message : String(err)}. Have you run db/migrations/001_init.sql and 002_materialized_views.sql?`,
    );
  }

  try {
    const { count, error } = await supabase
      .from("parking_observations")
      .select("*", { count: "exact", head: true })
      .eq("local_date", todayLocalDate());
    if (error) throw error;
    result.rowsToday = count ?? 0;
  } catch (err) {
    result.errors.push(`rows today: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const { data, error } = await supabase
      .from("parking_observations")
      .select("observed_at")
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    result.latestObservation = data?.observed_at ?? null;
  } catch (err) {
    result.errors.push(`latest observation: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const [decks, latest] = await Promise.all([getActiveDecks(supabase), getDeckLatest(supabase)]);
    const latestByDeckId = new Map(latest.map((l) => [l.deck_id, l]));
    result.latestByDeck = decks.map((d) => {
      const l = latestByDeckId.get(d.id);
      return {
        slug: d.slug,
        displayName: d.display_name,
        availableSpaces: l?.available_spaces ?? null,
        observedAt: l?.observed_at ?? null,
        status: l?.status ?? null,
      };
    });
  } catch (err) {
    result.errors.push(`deck_latest: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const { data, error } = await supabase
      .from("collection_runs")
      .select("run_at, success, decks_ok, decks_failed, error_message")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    result.lastCollectionRun = data ?? null;
  } catch (err) {
    result.errors.push(`collection_runs: ${err instanceof Error ? err.message : String(err)}`);
  }

  // A live JMU fetch is a real request to JMU's servers, so it only
  // happens when explicitly asked for (?testJmu=true) — never as a side
  // effect of just opening this page, to keep total JMU traffic to
  // "once a minute, on purpose."
  if (req.nextUrl.searchParams.get("testJmu") === "true") {
    result.jmuSourceTested = true;
    try {
      const feed = await fetchJmuFeed();
      result.jmuSourceReachable = true;
      result.jmuZonesReturned = feed.counts.size;
    } catch (err) {
      result.jmuSourceReachable = false;
      result.errors.push(`JMU fetch test: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json(result);
}
