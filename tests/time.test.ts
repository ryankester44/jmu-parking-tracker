import { describe, expect, it } from "vitest";
import { isWithinCollectionWindow, truncateToMinute, formatMinuteOfDay } from "../lib/time";

// Helper: build a UTC instant that corresponds to a specific America/New_York
// wall-clock time, given a fixed UTC offset for the date in question
// (EST = UTC-5, EDT = UTC-4). Using explicit offsets (rather than relying on
// the test runner's local timezone) keeps this deterministic in CI.
function nyTime(isoDateNoTz: string, offsetHours: 4 | 5): Date {
  return new Date(`${isoDateNoTz}${offsetHours === 5 ? "-05:00" : "-04:00"}`);
}

describe("isWithinCollectionWindow", () => {
  it("is true on a weekday morning at the start of the window (EST)", () => {
    // Tuesday 2026-01-06, 7:00 AM EST
    expect(isWithinCollectionWindow(nyTime("2026-01-06T07:00:00", 5))).toBe(true);
  });

  it("is true on a weekday at the end of the window, inclusive (EST)", () => {
    expect(isWithinCollectionWindow(nyTime("2026-01-06T21:00:00", 5))).toBe(true);
  });

  it("is false one minute before the window opens", () => {
    expect(isWithinCollectionWindow(nyTime("2026-01-06T06:59:00", 5))).toBe(false);
  });

  it("is false one minute after the window closes", () => {
    expect(isWithinCollectionWindow(nyTime("2026-01-06T21:01:00", 5))).toBe(false);
  });

  it("is false at midday on a Saturday", () => {
    // 2026-01-10 is a Saturday
    expect(isWithinCollectionWindow(nyTime("2026-01-10T12:00:00", 5))).toBe(false);
  });

  it("is false at midday on a Sunday", () => {
    // 2026-01-11 is a Sunday
    expect(isWithinCollectionWindow(nyTime("2026-01-11T12:00:00", 5))).toBe(false);
  });

  it("correctly handles the window during EDT (summer, UTC-4)", () => {
    // Wednesday 2026-06-03, 7:00 AM EDT
    expect(isWithinCollectionWindow(nyTime("2026-06-03T07:00:00", 4))).toBe(true);
    expect(isWithinCollectionWindow(nyTime("2026-06-03T06:59:00", 4))).toBe(false);
    expect(isWithinCollectionWindow(nyTime("2026-06-03T21:00:00", 4))).toBe(true);
    expect(isWithinCollectionWindow(nyTime("2026-06-03T21:01:00", 4))).toBe(false);
  });
});

describe("truncateToMinute", () => {
  it("zeroes out seconds and milliseconds", () => {
    const d = new Date("2026-01-06T12:34:56.789Z");
    const truncated = truncateToMinute(d);
    expect(truncated.getUTCSeconds()).toBe(0);
    expect(truncated.getUTCMilliseconds()).toBe(0);
    expect(truncated.getUTCMinutes()).toBe(34);
  });

  it("produces the same instant for two calls within the same minute", () => {
    const a = truncateToMinute(new Date("2026-01-06T12:34:01.000Z"));
    const b = truncateToMinute(new Date("2026-01-06T12:34:59.000Z"));
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("formatMinuteOfDay", () => {
  it("formats the start of the collection window", () => {
    expect(formatMinuteOfDay(420)).toBe("7:00 AM");
  });

  it("formats the end of the collection window", () => {
    expect(formatMinuteOfDay(1260)).toBe("9:00 PM");
  });

  it("formats noon correctly", () => {
    expect(formatMinuteOfDay(720)).toBe("12:00 PM");
  });
});
