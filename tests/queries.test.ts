import { describe, expect, it, vi } from "vitest";
import { getObservationsForDate, getWeekdayMinuteStats } from "../lib/queries";
import type { ServiceClient } from "../lib/supabase/server";

// Regression test for a real production bug: Supabase's PostgREST layer
// hard-caps a single response at 1000 rows (project "Max Rows" setting)
// REGARDLESS of a wider .range() being requested by the client — silently,
// no error. A single day's observations easily exceed 1000 rows (5 decks
// x 200+ minutes), which truncated "Today's Parking" partway through the
// afternoon in production even after widening the requested range. The
// fix is pagination: keep requesting pages until a short page signals the
// end. This test simulates exactly that server-side cap (a fake backing
// store of 1500 rows, each page capped at 1000 regardless of what range
// is asked for) and asserts all 1500 rows still come back.

function makeCappedFakeTable<T>(allRows: T[], hardCap: number) {
  const calls: Array<[number, number]> = [];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.gte = vi.fn(chain);
  builder.lte = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.range = vi.fn((from: number, to: number) => {
    calls.push([from, to]);
    // Simulate Supabase's server-side hard cap: however wide the
    // requested range is, never return more than `hardCap` rows.
    const requested = to - from + 1;
    const size = Math.min(requested, hardCap, Math.max(0, allRows.length - from));
    return Promise.resolve({ data: allRows.slice(from, from + size), error: null });
  });
  return { builder, calls };
}

describe("pagination regression: queries that can exceed the server's row cap must page through it", () => {
  it("getObservationsForDate retrieves all rows even when the server caps each page at 1000", async () => {
    const allRows = Array.from({ length: 1500 }, (_, i) => ({ minute_of_day: i, ballard: i }));
    const { builder, calls } = makeCappedFakeTable(allRows, 1000);
    const supabase = { from: () => builder } as unknown as ServiceClient;

    const result = await getObservationsForDate(supabase, "2026-09-02");

    expect(result).toHaveLength(1500);
    // Must have made at least two requests — one page alone (capped at
    // 1000) would have silently dropped the remaining 500 rows, which is
    // exactly the bug that shipped to production.
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("getWeekdayMinuteStats retrieves all rows even when the server caps each page at 1000", async () => {
    const allRows = Array.from({ length: 1500 }, (_, i) => ({ minute_of_day: i, deck_id: 1 }));
    const { builder, calls } = makeCappedFakeTable(allRows, 1000);
    const supabase = { from: () => builder } as unknown as ServiceClient;

    const result = await getWeekdayMinuteStats(supabase, 2);

    expect(result).toHaveLength(1500);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("stops after the first page when there's nothing more to fetch (no wasted requests)", async () => {
    const allRows = Array.from({ length: 200 }, (_, i) => ({ minute_of_day: i }));
    const { builder, calls } = makeCappedFakeTable(allRows, 1000);
    const supabase = { from: () => builder } as unknown as ServiceClient;

    const result = await getObservationsForDate(supabase, "2026-09-02");

    expect(result).toHaveLength(200);
    expect(calls).toHaveLength(1);
  });
});
