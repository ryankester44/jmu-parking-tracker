import { describe, expect, it } from "vitest";
import { generateInsights, type TypicalRow } from "../lib/insights";
import { classifyConfidence } from "../lib/stats";

function buildRows(peakMinute: number): TypicalRow[] {
  const rows: TypicalRow[] = [];
  for (let m = 420; m <= 1260; m += 30) {
    const distanceFromPeak = Math.abs(m - peakMinute);
    const value = m < peakMinute ? 200 - distanceFromPeak * 0.3 : Math.max(20, 200 - distanceFromPeak * 1.2);
    rows.push({ minuteOfDay: m, "test-deck": Math.round(value) });
  }
  return rows;
}

function deckMeta(distinctDays: number) {
  return {
    slug: "test-deck",
    displayName: "Test Deck",
    confidence: classifyConfidence(distinctDays),
    distinctDays,
  };
}

describe("generateInsights — display gate is 'any data', not a minimum sample size", () => {
  it("CASE 1: zero observations -> no sentences at all", () => {
    const rows: TypicalRow[] = Array.from({ length: 30 }, (_, i) => ({
      minuteOfDay: 420 + i * 30,
      "test-deck": null,
    }));
    const insights = generateInsights(rows, [deckMeta(0)], "Tuesday");
    expect(insights[0]!.sentences).toHaveLength(0);
    expect(insights[0]!.confidence).toBe("none");
  });

  it("CASE 2: exactly ONE observed day is enough to show a real result, labeled LOW", () => {
    const rows = buildRows(480);
    const insights = generateInsights(rows, [deckMeta(1)], "Tuesday");
    expect(insights[0]!.confidence).toBe("low");
    expect(insights[0]!.sentences.length).toBeGreaterThan(0);
    // Sample size is stated plainly, not hidden.
    expect(insights[0]!.sentences[0]).toMatch(/Based on 1 Tuesday/);
    expect(insights[0]!.sentences[0]).toMatch(/8:00 AM/);
  });

  it("CASE 3: two observed days -> still LOW, still shown", () => {
    const insights = generateInsights(buildRows(480), [deckMeta(2)], "Tuesday");
    expect(insights[0]!.confidence).toBe("low");
    expect(insights[0]!.sentences.length).toBeGreaterThan(0);
    expect(insights[0]!.sentences[0]).toMatch(/Based on 2 Tuesdays/);
  });

  it("CASE 4/5: three to seven observed days -> MEDIUM, shown", () => {
    for (const days of [3, 7]) {
      const insights = generateInsights(buildRows(480), [deckMeta(days)], "Tuesday");
      expect(insights[0]!.confidence).toBe("medium");
      expect(insights[0]!.sentences.length).toBeGreaterThan(0);
      // Medium/high phrasing doesn't repeat "Based on N" inline (the
      // adjacent ConfidenceBadge already states it) — just verify a real
      // sentence was produced.
      expect(insights[0]!.sentences[0]).toMatch(/8:00 AM/);
    }
  });

  it("CASE 6/7: eight or twenty observed days -> HIGH, shown", () => {
    for (const days of [8, 20]) {
      const insights = generateInsights(buildRows(480), [deckMeta(days)], "Tuesday");
      expect(insights[0]!.confidence).toBe("high");
      expect(insights[0]!.sentences.length).toBeGreaterThan(0);
    }
  });

  it("never fabricates an insight for a deck with no numeric data, regardless of a nonzero distinctDays count", () => {
    // Defensive case: distinctDays says data exists, but this deck's own
    // column is entirely null (shouldn't happen given how the stats view
    // is built, but the insight generator must not assume it).
    const rows: TypicalRow[] = Array.from({ length: 30 }, (_, i) => ({
      minuteOfDay: 420 + i * 30,
      "empty-deck": null,
    }));
    const insights = generateInsights(
      rows,
      [{ slug: "empty-deck", displayName: "Empty Deck", confidence: "high", distinctDays: 10 }],
      "Tuesday",
    );
    expect(insights[0]!.sentences).toHaveLength(0);
  });

  it("a single data point (not just a single day) still produces a result, without crashing on a zero range", () => {
    const rows: TypicalRow[] = [{ minuteOfDay: 480, "test-deck": 143 }];
    const insights = generateInsights(rows, [deckMeta(1)], "Tuesday");
    expect(insights[0]!.sentences.length).toBeGreaterThan(0);
    expect(insights[0]!.sentences[0]).toMatch(/8:00 AM/);
    expect(insights[0]!.sentences[0]).toMatch(/Based on 1 Tuesday/);
  });
});
