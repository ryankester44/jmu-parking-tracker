"use client";

import { useEffect, useState } from "react";
import { ChartLegend, TimeSeriesChart, type ChartRow, type ChartSeriesMeta } from "./TimeSeriesChart";
import { todayLocalDate } from "@/lib/time";
import { fetchApi, friendlyApiErrorMessage, type ApiError } from "@/lib/fetchJson";
import { onCollected } from "@/lib/collectBus";

interface DayApiResponse {
  date: string;
  weekday: { full: string } | null;
  isWeekend: boolean;
  decks: ChartSeriesMeta[];
  rows: ChartRow[];
}

const POLL_MS = 60_000;

export function TodayPanel() {
  const [today, setToday] = useState(() => todayLocalDate());
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DayApiResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // `today` was previously computed once via useMemo(..., []) and never
  // updated — if this page is left open in a browser tab past midnight (or
  // just sits open for a while), that froze "today" at a stale date, and
  // since the date picker's max={today} blocks anything later, the REAL
  // current day became unselectable until a manual page refresh. Keeping
  // this in sync on an interval (and whenever the tab regains focus) fixes
  // that without requiring a reload.
  useEffect(() => {
    function sync() {
      const current = todayLocalDate();
      setToday((prev) => (prev === current ? prev : current));
    }
    const id = setInterval(sync, POLL_MS);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await fetchApi<DayApiResponse>(`/api/day?date=${date}`);
      if (cancelled) return;
      if (data) {
        setData(data);
        setError(null);
      } else {
        setError(error);
      }
    }

    load();
    // Only poll/live-update when looking at today — a past date's data
    // never changes, so there's nothing to refetch for it.
    if (date === today) {
      const id = setInterval(load, POLL_MS);
      const off = onCollected(load);
      return () => {
        cancelled = true;
        clearInterval(id);
        off();
      };
    }
    return () => {
      cancelled = true;
    };
  }, [date, today]);

  function toggle(slug: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-[color:var(--text-secondary)]" htmlFor="day-picker">
          Date
        </label>
        <input
          id="day-picker"
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="card px-3 py-1.5 text-sm"
        />
        {data?.weekday && (
          <span className="text-sm text-[color:var(--text-muted)]">{data.weekday.full}</span>
        )}
        {data?.isWeekend && (
          <span className="text-sm text-[color:var(--text-muted)]">
            No collection on weekends — nothing to show.
          </span>
        )}
      </div>

      {error && <p className="text-sm text-[color:var(--text-muted)]">{friendlyApiErrorMessage(error)}</p>}

      {data && (
        <>
          <ChartLegend series={data.decks} hidden={hidden} onToggle={toggle} />
          <TimeSeriesChart
            rows={data.rows}
            series={data.decks}
            hidden={hidden}
            emptyMessage={
              date === today
                ? "No data collected today yet. As soon as the collector runs, points will appear here — no need to wait for the day to finish."
                : "No data was collected on this date."
            }
          />
        </>
      )}
    </div>
  );
}
