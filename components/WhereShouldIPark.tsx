"use client";

import { useEffect, useMemo, useState } from "react";
import { WEEKDAYS } from "@/lib/types";
import {
  COLLECTION_END_MINUTE,
  COLLECTION_START_MINUTE,
  formatMinuteOfDay,
  nowInAppZone,
  todayIsoWeekdayInAppZone,
} from "@/lib/time";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { deckColor } from "@/lib/colors";
import { fetchApi, friendlyApiErrorMessage, type ApiError } from "@/lib/fetchJson";
import { onCollected } from "@/lib/collectBus";
import type { ConfidenceLevel } from "@/lib/types";

const POLL_MS = 60_000;

interface RankedDeck {
  slug: string;
  displayName: string;
  avgAvailable: number | null;
  confidence: ConfidenceLevel;
  distinctDays: number;
  rank: number;
}

interface WhereApiResponse {
  weekday: number;
  weekdayLabel: string;
  requestedMinute: number;
  ranking: RankedDeck[];
}

const MINUTE_OPTIONS = (() => {
  const opts: number[] = [];
  for (let m = COLLECTION_START_MINUTE; m <= COLLECTION_END_MINUTE; m += 15) opts.push(m);
  return opts;
})();

export function WhereShouldIPark() {
  const [weekday, setWeekday] = useState(1);
  const [minute, setMinute] = useState(480); // 8:00 AM, deterministic default
  const [data, setData] = useState<WhereApiResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const todayIso = todayIsoWeekdayInAppZone();
    if (todayIso >= 1 && todayIso <= 5) setWeekday(todayIso);

    const now = nowInAppZone();
    const nowMinute = now.hour * 60 + now.minute;
    const rounded = Math.round(nowMinute / 15) * 15;
    const clamped = Math.min(Math.max(rounded, COLLECTION_START_MINUTE), COLLECTION_END_MINUTE);
    setMinute(clamped);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await fetchApi<WhereApiResponse>(
        `/api/where?weekday=${weekday}&minute=${minute}`,
      );
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
  }, [weekday, minute]);

  const weekdayLabel = useMemo(() => WEEKDAYS.find((w) => w.iso === weekday)?.full ?? "", [weekday]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--text-secondary)]" htmlFor="wsp-weekday">
            Weekday
          </label>
          <select
            id="wsp-weekday"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="card px-3 py-1.5 text-sm"
          >
            {WEEKDAYS.map((w) => (
              <option key={w.iso} value={w.iso}>
                {w.full}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--text-secondary)]" htmlFor="wsp-time">
            Arrival time
          </label>
          <select
            id="wsp-time"
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            className="card px-3 py-1.5 text-sm"
          >
            {MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {formatMinuteOfDay(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-[color:var(--text-muted)]">{friendlyApiErrorMessage(error)}</p>}

      {data && (
        <div>
          <p className="mb-3 text-sm text-[color:var(--text-secondary)]">
            Best options around {formatMinuteOfDay(data.requestedMinute)} {weekdayLabel}:
          </p>
          <ol className="space-y-2">
            {data.ranking.map((deck) => (
              <li key={deck.slug} className="card flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-bold text-[color:var(--text-muted)]">
                    {deck.rank}
                  </span>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: deckColor(deck.slug) }}
                    aria-hidden="true"
                  />
                  <span className="font-medium">{deck.displayName}</span>
                </div>
                <div className="flex items-center gap-3">
                  {deck.avgAvailable !== null ? (
                    <>
                      <span className="tabular-nums text-sm font-semibold">
                        avg {Math.round(deck.avgAvailable)} spaces
                      </span>
                      <ConfidenceBadge
                        confidence={deck.confidence}
                        distinctDays={deck.distinctDays}
                        weekdayLabel={weekdayLabel}
                      />
                    </>
                  ) : (
                    <span className="text-sm italic text-[color:var(--text-muted)]">
                      No historical data yet
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
