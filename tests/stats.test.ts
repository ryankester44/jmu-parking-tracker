import { describe, expect, it } from "vitest";
import { classifyStatus, classifyConfidence } from "../lib/stats";

describe("classifyStatus — capacity-based (known capacity)", () => {
  const capacity = 1000;

  it("is plenty at/above 50%", () => {
    expect(classifyStatus(500, capacity)).toBe("plenty");
  });

  it("is moderate between 20% and 49%", () => {
    expect(classifyStatus(300, capacity)).toBe("moderate");
  });

  it("is low between 5% and 19%", () => {
    expect(classifyStatus(100, capacity)).toBe("low");
  });

  it("is nearly_full below 5% but above 0", () => {
    expect(classifyStatus(10, capacity)).toBe("nearly_full");
  });

  it("is full at exactly 0", () => {
    expect(classifyStatus(0, capacity)).toBe("full");
  });
});

describe("classifyStatus — absolute fallback (capacity unknown)", () => {
  it("is plenty above 150", () => {
    expect(classifyStatus(200, null)).toBe("plenty");
  });

  it("is moderate between 51 and 150", () => {
    expect(classifyStatus(100, null)).toBe("moderate");
  });

  it("is low between 16 and 50", () => {
    expect(classifyStatus(30, null)).toBe("low");
  });

  it("is nearly_full between 1 and 15", () => {
    expect(classifyStatus(5, null)).toBe("nearly_full");
  });

  it("is full at 0 regardless of capacity", () => {
    expect(classifyStatus(0, null)).toBe("full");
  });
});

describe("classifyStatus — missing data is never treated as zero", () => {
  it("returns 'unknown' for a null reading, not 'full'", () => {
    expect(classifyStatus(null, 1000)).toBe("unknown");
    expect(classifyStatus(null, null)).toBe("unknown");
  });
});

describe("classifyConfidence", () => {
  it("is 'none' with zero observed days", () => {
    expect(classifyConfidence(0)).toBe("none");
  });

  it("is 'low' for 1-2 days (matches the '1 Tuesday' example)", () => {
    expect(classifyConfidence(1)).toBe("low");
    expect(classifyConfidence(2)).toBe("low");
  });

  it("is 'medium' for 3-7 days (matches the '5 Tuesdays' example)", () => {
    expect(classifyConfidence(3)).toBe("medium");
    expect(classifyConfidence(5)).toBe("medium");
    expect(classifyConfidence(7)).toBe("medium");
  });

  it("is 'high' for 8+ days (matches the '12 Tuesdays' example)", () => {
    expect(classifyConfidence(8)).toBe("high");
    expect(classifyConfidence(12)).toBe("high");
  });
});
