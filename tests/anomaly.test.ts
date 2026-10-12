import { describe, expect, it } from "vitest";
import { detectTransientZeroGlitch, type HistoryPoint } from "../lib/anomaly";

function ok(value: number | null): HistoryPoint {
  return { value, status: "ok" };
}

describe("detectTransientZeroGlitch", () => {
  it("flags the real 2026-09-07 incident shape: high, 4x zero, recovery near the pre-drop value", () => {
    // deck 1: 641 -> 0,0,0,0 -> 650
    const history = [ok(639), ok(638), ok(641), ok(639), ok(641), ok(0), ok(0), ok(0), ok(0)];
    expect(detectTransientZeroGlitch(history, 650)).toBe(4);
  });

  it("flags the deck 3 shape from the same incident (smaller absolute numbers)", () => {
    // deck 3: 41 -> 0,0,0,0 -> 52
    const history = [ok(30), ok(33), ok(32), ok(39), ok(41), ok(0), ok(0), ok(0), ok(0)];
    expect(detectTransientZeroGlitch(history, 52)).toBe(4);
  });

  it("does NOT flag a deck that legitimately sits at 0 for a sustained period", () => {
    // Real full-lot behavior: stays at 0 far longer than the glitch window,
    // and even when checked mid-way through (not yet recovered), the
    // function is never called with a positive newValue during a real
    // sustained-full stretch — but if a recovery eventually comes after a
    // very long zero run, it should NOT be treated as a glitch.
    const longZeroRun = Array(20).fill(ok(0));
    const history = [ok(15), ok(12), ...longZeroRun];
    expect(detectTransientZeroGlitch(history, 20)).toBe(0);
  });

  it("does NOT flag a deck that was already low before dropping to 0", () => {
    // Pre-drop value below the plausibility floor (e.g. a lot that's
    // nearly full anyway) — a drop from 5 to 0 and back is unremarkable.
    const history = [ok(5), ok(3), ok(0), ok(0)];
    expect(detectTransientZeroGlitch(history, 4)).toBe(0);
  });

  it("does NOT flag a recovery to a very different value (real state change, not a glitch)", () => {
    // Recovers to something far from the pre-drop value — e.g. a real
    // event genuinely changed occupancy, not a feed hiccup.
    const history = [ok(600), ok(0), ok(0)];
    expect(detectTransientZeroGlitch(history, 50)).toBe(0);
  });

  it("does NOT flag when the newest reading is itself zero (not a recovery)", () => {
    const history = [ok(600), ok(0)];
    expect(detectTransientZeroGlitch(history, 0)).toBe(0);
  });

  it("does NOT flag when there's no history", () => {
    expect(detectTransientZeroGlitch([], 500)).toBe(0);
  });

  it("does NOT flag when the reading before the zero-run was itself invalid/missing", () => {
    const history: HistoryPoint[] = [
      { value: null, status: "missing" },
      ok(0),
      ok(0),
    ];
    expect(detectTransientZeroGlitch(history, 500)).toBe(0);
  });

  it("handles a single-minute glitch (run length 1)", () => {
    const history = [ok(200), ok(0)];
    expect(detectTransientZeroGlitch(history, 195)).toBe(1);
  });
});
