export type ObservationStatus = "ok" | "invalid" | "missing" | "error";

export interface DeckRow {
  id: number;
  slug: string;
  display_name: string;
  zone_id: string;
  sort_order: number;
  active: boolean;
  capacity: number | null;
  capacity_source: string | null;
  capacity_note: string | null;
}

export interface DeckLatestRow {
  deck_id: number;
  observed_at: string;
  available_spaces: number | null;
  status: ObservationStatus;
  source_as_of: string | null;
}

export interface DeckStatRow {
  deck_id: number;
  day_of_week: number; // 1=Mon .. 7=Sun
  minute_of_day: number; // 0-1439
  sample_count: number;
  distinct_days: number;
  avg_available: number | null;
  min_available: number | null;
  max_available: number | null;
  stddev_available: number | null;
  last_observed_date: string | null;
}

export interface ObservationPoint {
  minute_of_day: number;
  observed_at: string;
  available_spaces: number | null;
  status: ObservationStatus;
}

export type AvailabilityStatus =
  | "plenty"
  | "moderate"
  | "low"
  | "nearly_full"
  | "full"
  | "unknown";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export const WEEKDAYS = [
  { iso: 1, short: "Mon", full: "Monday" },
  { iso: 2, short: "Tue", full: "Tuesday" },
  { iso: 3, short: "Wed", full: "Wednesday" },
  { iso: 4, short: "Thu", full: "Thursday" },
  { iso: 5, short: "Fri", full: "Friday" },
] as const;

export type IsoWeekday = 1 | 2 | 3 | 4 | 5;
