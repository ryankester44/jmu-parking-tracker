import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/jmu-source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/jmu-source")>();
  return { ...actual, fetchJmuFeed: vi.fn() };
});

import { fetchJmuFeed } from "../lib/jmu-source";
import { runCollection } from "../lib/collector";
import type { ServiceClient } from "../lib/supabase/server";

const FAKE_DECKS = [
  { id: 1, slug: "ballard", display_name: "Ballard Deck", zone_id: "22", sort_order: 1, active: true, capacity: 1483, capacity_source: null, capacity_note: null },
  { id: 2, slug: "charlie-obaugh", display_name: "Charlie Obaugh Deck", zone_id: "13", sort_order: 2, active: true, capacity: 465, capacity_source: null, capacity_note: null },
  { id: 3, slug: "chesapeake", display_name: "Chesapeake Deck", zone_id: "19", sort_order: 3, active: true, capacity: 688, capacity_source: null, capacity_note: null },
  { id: 4, slug: "mason", display_name: "Mason Deck", zone_id: "54", sort_order: 4, active: true, capacity: null, capacity_source: null, capacity_note: null },
  { id: 5, slug: "warsaw", display_name: "Warsaw Deck", zone_id: "42", sort_order: 5, active: true, capacity: 613, capacity_source: null, capacity_note: null },
];

interface RecordedCall {
  table: string;
  method: "upsert" | "insert";
  payload: unknown;
  options?: unknown;
}

function makeFakeSupabase(opts: { upsertError?: { message: string } } = {}) {
  const calls: RecordedCall[] = [];

  const client = {
    from(table: string) {
      if (table === "parking_decks") {
        return {
          select() {
            return { eq: () => Promise.resolve({ data: FAKE_DECKS, error: null }) };
          },
        };
      }
      if (table === "parking_observations" || table === "deck_latest") {
        return {
          upsert(rows: unknown, options: unknown) {
            calls.push({ table, method: "upsert", payload: rows, options });
            return Promise.resolve({ error: table === "parking_observations" ? (opts.upsertError ?? null) : null });
          },
        };
      }
      if (table === "collection_runs") {
        return {
          insert(row: unknown) {
            calls.push({ table, method: "insert", payload: row });
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
  };

  return { client: client as unknown as ServiceClient, calls };
}

const mockedFetch = vi.mocked(fetchJmuFeed);

beforeEach(() => {
  mockedFetch.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("runCollection — whole-feed outage", () => {
  it("writes no observation rows and logs a failed run when JMU is unreachable", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("network error"));
    const { client, calls } = makeFakeSupabase();

    const result = await runCollection(client);

    expect(result.success).toBe(false);
    const observationWrites = calls.filter((c) => c.table === "parking_observations");
    const latestWrites = calls.filter((c) => c.table === "deck_latest");
    expect(observationWrites).toHaveLength(0);
    expect(latestWrites).toHaveLength(0); // never fabricate a "current" reading during an outage

    const runLogs = calls.filter((c) => c.table === "collection_runs");
    expect(runLogs).toHaveLength(1);
    expect((runLogs[0]!.payload as { success: boolean }).success).toBe(false);
  });
});

describe("runCollection — partial failure", () => {
  it("records a per-deck 'missing' row (available_spaces = null) for a zone absent from the feed, without failing the whole run", async () => {
    mockedFetch.mockResolvedValueOnce({
      asOf: "2026-08-31 18:33:22",
      counts: new Map([
        ["22", "1298"],
        ["13", "134"],
        ["19", "578"],
        // zone 54 (Mason) deliberately absent
        ["42", "426"],
      ]),
    });
    const { client, calls } = makeFakeSupabase();

    const result = await runCollection(client);

    expect(result.success).toBe(true);
    expect(result.decksOk).toBe(4);
    expect(result.decksFailed).toBe(1);

    const obsRows = calls.find((c) => c.table === "parking_observations")!.payload as Array<{
      deck_id: number;
      available_spaces: number | null;
      status: string;
    }>;
    const masonRow = obsRows.find((r) => r.deck_id === 4)!;
    expect(masonRow.available_spaces).toBeNull(); // never coerced to 0
    expect(masonRow.status).toBe("missing");

    const ballardRow = obsRows.find((r) => r.deck_id === 1)!;
    expect(ballardRow.available_spaces).toBe(1298);
    expect(ballardRow.status).toBe("ok");
  });
});

describe("runCollection — duplicate prevention wiring", () => {
  it("upserts observations with ON CONFLICT DO NOTHING on (deck_id, observed_at)", async () => {
    mockedFetch.mockResolvedValueOnce({
      asOf: "2026-08-31 18:33:22",
      counts: new Map([
        ["22", "100"],
        ["13", "100"],
        ["19", "100"],
        ["54", "100"],
        ["42", "100"],
      ]),
    });
    const { client, calls } = makeFakeSupabase();

    await runCollection(client);

    const obsCall = calls.find((c) => c.table === "parking_observations")!;
    expect(obsCall.options).toEqual({ onConflict: "deck_id,observed_at", ignoreDuplicates: true });
  });
});
