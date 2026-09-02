import { describe, expect, it, vi } from "vitest";
import { getObservationsForDate, getWeekdayMinuteStats } from "../lib/queries";
import type { ServiceClient } from "../lib/supabase/server";

// Regression test for a real production bug: Supabase/PostgREST caps a
// response at 1000 rows unless a wider .range() is explicitly requested —
// silently, no error. A single day's observations easily exceed 1000 rows
// (5 decks x 200+ minutes) partway through the afternoon, which truncated
// "Today's Parking" without any error surfacing. Assert every query that
// can return more than 1000 rows explicitly requests a wider range.

function makeFakeQueryBuilder(capture: { range?: [number, number] }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.gte = vi.fn(chain);
  builder.lte = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.range = vi.fn((from: number, to: number) => {
    capture.range = [from, to];
    return Promise.resolve({ data: [], error: null });
  });
  return builder;
}

describe("row-limit regression: queries that can exceed 1000 rows must call .range()", () => {
  it("getObservationsForDate explicitly requests a range well beyond Supabase's default 1000-row cap", async () => {
    const capture: { range?: [number, number] } = {};
    const supabase = {
      from: () => makeFakeQueryBuilder(capture),
    } as unknown as ServiceClient;

    await getObservationsForDate(supabase, "2026-09-02");

    expect(capture.range).toBeDefined();
    const [from, to] = capture.range!;
    expect(from).toBe(0);
    // Must comfortably exceed 5 decks x 841 minutes = 4205, the real
    // failure case observed in production.
    expect(to).toBeGreaterThan(5000);
  });

  it("getWeekdayMinuteStats explicitly requests a range well beyond Supabase's default 1000-row cap", async () => {
    const capture: { range?: [number, number] } = {};
    const supabase = {
      from: () => makeFakeQueryBuilder(capture),
    } as unknown as ServiceClient;

    await getWeekdayMinuteStats(supabase, 2);

    expect(capture.range).toBeDefined();
    const [from, to] = capture.range!;
    expect(from).toBe(0);
    expect(to).toBeGreaterThan(5000);
  });
});
