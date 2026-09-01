import { DateTime } from "luxon";
import type { IsoWeekday } from "./types";

export const APP_TIMEZONE = "America/New_York";

// Collection window: Monday-Friday, 7:00 AM through 9:00 PM, America/New_York.
export const COLLECTION_START_MINUTE = 7 * 60; // 420 = 7:00 AM
export const COLLECTION_END_MINUTE = 21 * 60; // 1260 = 9:00 PM (inclusive)

export function nowInAppZone(date: Date = new Date()): DateTime {
  return DateTime.fromJSDate(date).setZone(APP_TIMEZONE);
}

/** Monday-Friday, 7:00 AM-9:00 PM America/New_York, DST-safe. */
export function isWithinCollectionWindow(date: Date = new Date()): boolean {
  const dt = nowInAppZone(date);
  const isWeekday = dt.weekday >= 1 && dt.weekday <= 5;
  const minuteOfDay = dt.hour * 60 + dt.minute;
  return (
    isWeekday &&
    minuteOfDay >= COLLECTION_START_MINUTE &&
    minuteOfDay <= COLLECTION_END_MINUTE
  );
}

/** Truncate to the start of the current minute, as a Date (UTC instant). */
export function truncateToMinute(date: Date = new Date()): Date {
  const ms = date.getTime();
  return new Date(ms - (ms % 60000));
}

export function formatMinuteOfDay(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

export function formatClockTime(date: Date | string): string {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: "utc" }).setZone(APP_TIMEZONE)
      : DateTime.fromJSDate(date).setZone(APP_TIMEZONE);
  return dt.toFormat("h:mm a");
}

export function todayIsoWeekdayInAppZone(date: Date = new Date()): IsoWeekday {
  const dt = nowInAppZone(date);
  const weekday = dt.weekday <= 5 ? dt.weekday : 1;
  return weekday as IsoWeekday;
}

export function todayLocalDate(date: Date = new Date()): string {
  return nowInAppZone(date).toFormat("yyyy-LL-dd");
}
