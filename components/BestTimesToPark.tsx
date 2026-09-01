"use client";

import { useEffect, useState } from "react";
import { WEEKDAYS } from "@/lib/types";
import { todayIsoWeekdayInAppZone } from "@/lib/time";
import { generateInsights, type DeckInsight, type TypicalRow } from "@/lib/insights";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { deckColor } from "@/lib/colors";
import { fetchApi, friendlyApiErrorMessage, type ApiError } from "@/lib/fetchJson";
import { onCollected } from "@/lib/collectBus";
import type { ConfidenceLevel } from "@/lib/types";

const POLL_MS = 60_000;

interface TypicalApiResponse {
  weekday: number;
  weekdayLabel: string;
  decks: Array<{ slug: string; displayName: string; confidence: ConfidenceLevel; distinctDays: number }>;
  rows: TypicalRow[];
}

export function BestTimesToPark() {
  const [weekday, setWeekday] = useState(1);
  const [data, setData] = useState<TypicalApiResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

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

  const insights: DeckInsight[] = data ? generateInsights(data.rows, data.decks, data.weekdayLabel) : [];
  const withSentences = insights.filter((i) => i.sentences.length > 0);

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

      {data && withSentences.length === 0 && (
        <p className="text-sm text-[color:var(--text-muted)]">
          No historical {data.weekdayLabel} data yet. As soon as one {data.weekdayLabel} is collected,
          insights will appear here — labeled LOW confidence until more accumulate.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {withSentences.map((insight) => (
          <div key={insight.slug} className="card p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: deckColor(insight.slug) }}
                aria-hidden="true"
              />
              <h4 className="font-semibold">{insight.displayName}</h4>
            </div>
            <ul className="mb-2 space-y-1 text-sm text-[color:var(--text-secondary)]">
              {insight.sentences.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            {data && (
              <ConfidenceBadge
                confidence={insight.confidence}
                distinctDays={insight.distinctDays}
                weekdayLabel={data.weekdayLabel}
                showTrailer
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
