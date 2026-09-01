"use client";

import { useEffect, useState } from "react";
import { ChartLegend, TimeSeriesChart, type ChartRow, type ChartSeriesMeta } from "./TimeSeriesChart";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { WEEKDAYS } from "@/lib/types";
import { todayIsoWeekdayInAppZone } from "@/lib/time";
import { fetchApi, friendlyApiErrorMessage, type ApiError } from "@/lib/fetchJson";
import { onCollected } from "@/lib/collectBus";
import type { ConfidenceLevel } from "@/lib/types";

const POLL_MS = 60_000;

interface TypicalDeck extends ChartSeriesMeta {
  confidence: ConfidenceLevel;
  distinctDays: number;
}

interface TypicalApiResponse {
  weekday: number;
  weekdayLabel: string;
  decks: TypicalDeck[];
  rows: ChartRow[];
}

export function TypicalPanel() {
  // Deterministic default for the server-rendered / first client render
  // (Monday) to avoid a hydration mismatch; snapped to today's actual
  // weekday right after mount if today is Mon-Fri.
  const [weekday, setWeekday] = useState(1);
  const [data, setData] = useState<TypicalApiResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    const todayIso = todayIsoWeekdayInAppZone();
    if (todayIso >= 1 && todayIso <= 5) setWeekday(todayIso);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await fetchApi<TypicalApiResponse>(`/api/typical?weekday=${weekday}`);
      if (cancelled) return;
      if (data) {
        setData(data);
        setError(null);
      } else {
        setError(error);
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    const off = onCollected(load);
    return () => {
      cancelled = true;
      clearInterval(id);
      off();
    };
  }, [weekday]);

  function toggle(slug: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/5" role="tablist">
        {WEEKDAYS.map((w) => (
          <button
            key={w.iso}
            role="tab"
            aria-selected={weekday === w.iso}
            onClick={() => setWeekday(w.iso)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              weekday === w.iso
                ? "bg-[color:var(--card)] text-jmu-purple shadow-sm"
                : "text-[color:var(--text-secondary)]"
            }`}
          >
            {w.short}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-[color:var(--text-muted)]">{friendlyApiErrorMessage(error)}</p>}

      {data && (
        <>
          <ChartLegend series={data.decks} hidden={hidden} onToggle={toggle} />
          <TimeSeriesChart
            rows={data.rows}
            series={data.decks}
            hidden={hidden}
            emptyMessage={`No historical ${data.weekdayLabel} data yet. The moment one ${data.weekdayLabel} is collected — even a single reading — it will appear here.`}
          />
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {data.decks.map((d) => (
              <div key={d.slug} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{d.displayName}:</span>
                <ConfidenceBadge
                  confidence={d.confidence}
                  distinctDays={d.distinctDays}
                  weekdayLabel={data.weekdayLabel}
                  showTrailer
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
