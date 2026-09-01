import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// These tests hit the actual Route Handlers (the real HTTP surface the
// frontend calls) with the Supabase layer mocked out, to directly verify
// what the audit in lib/queries.ts / the materialized-view SQL already
// showed by inspection: nothing in the request path filters rows out for
// having a small (but nonzero) sample size. Only lib/supabase/server and
// lib/queries are mocked; the route handlers' own logic runs for real.

vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => ({}) as never,
}));

const DECKS = [
  { id: 1, slug: "ballard", display_name: "Ballard Deck", zone_id: "22", sort_order: 1, active: true, capacity: 1483, capacity_source: null, capacity_note: null },
  { id: 2, slug: "charlie-obaugh", display_name: "Charlie Obaugh Deck", zone_id: "13", sort_order: 2, active: true, capacity: 465, capacity_source: null, capacity_note: null },
];

// One deck (ballard) has exactly ONE observed Tuesday; the other
// (charlie-obaugh) has zero. This is exactly CASE 2 vs. CASE 1 from the
// bug report, exercised through the real route handler.
const STATS_ROWS = [
  { deck_id: 1, day_of_week: 2, minute_of_day: 630, sample_count: 1, distinct_days: 1, avg_available: 143, min_available: 143, max_available: 143, stddev_available: 0, last_observed_date: "2026-09-01" },
];
const COVERAGE_ROWS = [{ deck_id: 1, day_of_week: 2, distinct_days: 1 }];

vi.mock("@/lib/queries", () => ({
  getActiveDecks: vi.fn(async () => DECKS),
  getWeekdayMinuteStats: vi.fn(async () => STATS_ROWS),
  getWeekdayCoverage: vi.fn(async () => COVERAGE_ROWS),
}));

describe("GET /api/typical — a single observed Tuesday is displayed, not withheld", () => {
  it("returns the real average for the deck with 1 observation, labeled LOW, and 'none' for the deck with 0", async () => {
    const { GET } = await import("../app/api/typical/route");
    const req = new NextRequest("http://localhost/api/typical?weekday=2");
    const res = await GET(req);
    const json = await res.json();

    const ballard = json.decks.find((d: { slug: string }) => d.slug === "ballard");
    const obaugh = json.decks.find((d: { slug: string }) => d.slug === "charlie-obaugh");

    expect(ballard.confidence).toBe("low");
    expect(ballard.distinctDays).toBe(1);
    expect(obaugh.confidence).toBe("none");

    // The actual chart data: the row at minute 630 must carry the real
    // 143 value for ballard — not null, not withheld for being a sample
    // of one.
    const row630 = json.rows.find((r: { minuteOfDay: number }) => r.minuteOfDay === 630);
    expect(row630.ballard).toBe(143);
    expect(row630["charlie-obaugh"]).toBeNull(); // genuinely zero data — correctly null, not a fake 0
  });
});

describe("GET /api/where — ranks decks with real data, marks zero-data decks separately", () => {
  it("includes the 1-observation deck in the ranking with its real average, and null (not 0) for the no-data deck", async () => {
    const { GET } = await import("../app/api/where/route");
    const req = new NextRequest("http://localhost/api/where?weekday=2&minute=630");
    const res = await GET(req);
    const json = await res.json();

    const ballard = json.ranking.find((d: { slug: string }) => d.slug === "ballard");
    const obaugh = json.ranking.find((d: { slug: string }) => d.slug === "charlie-obaugh");

    expect(ballard.avgAvailable).toBe(143);
    expect(ballard.confidence).toBe("low");
    expect(ballard.distinctDays).toBe(1);

    expect(obaugh.avgAvailable).toBeNull();
    expect(obaugh.confidence).toBe("none");
  });
});

describe("GET /api/heatmap — a single observed weekday still produces colored cells", () => {
  it("produces a real cell value (not withheld) for the bucket covering minute 630 with only 1 distinct day", async () => {
    const { GET } = await import("../app/api/heatmap/route");
    const req = new NextRequest("http://localhost/api/heatmap?weekday=2");
    const res = await GET(req);
    const json = await res.json();

    const cell = json.cells.find(
      (c: { deckSlug: string; bucketIndex: number }) =>
        c.deckSlug === "ballard" && json.buckets[c.bucketIndex]?.startMinute <= 630 && 630 <= (json.buckets[c.bucketIndex]?.startMinute + 29),
    );
    expect(cell).toBeTruthy();
    expect(cell.avgAvailable).toBe(143);
    expect(cell.confidence).toBe("low");
  });
});
