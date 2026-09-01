"use client";

import { useEffect, useState } from "react";
import { WEEKDAYS } from "@/lib/types";
import { todayIsoWeekdayInAppZone, formatMinuteOfDay } from "@/lib/time";
import { STATUS_COLORS, STATUS_ICON, deckColor } from "@/lib/colors";
import { STATUS_LABEL } from "@/lib/stats";
import { fetchApi, friendlyApiErrorMessage, type ApiError } from "@/lib/fetchJson";
import { onCollected } from "@/lib/collectBus";
import type { AvailabilityStatus } from "@/lib/types";

const POLL_MS = 60_000;

interface HeatmapCell {
  deckSlug: string;
  bucketIndex: number;
  avgAvailable: number | null;
  status: AvailabilityStatus;
  distinctDays: number;
}

interface HeatmapApiResponse {
  weekday: number;
  weekdayLabel: string;
  buckets: Array<{ startMinute: number; label: string }>;
  decks: Array<{ slug: string; displayName: string }>;
  cells: HeatmapCell[];
}

const LEGEND_ORDER: AvailabilityStatus[] = ["plenty", "moderate", "low", "nearly_full", "full"];

export function Heatmap() {
  const [weekday, setWeekday] = useState(1);
  const [data, setData] = useState<HeatmapApiResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const todayIso = todayIsoWeekdayInAppZone();
    if (todayIso >= 1 && todayIso <= 5) setWeekday(todayIso);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await fetchApi<HeatmapApiResponse>(`/api/heatmap?weekday=${weekday}`);
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

  const hasAnyCellData = data?.cells.some((c) => c.avgAvailable !== null) ?? false;

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

      <div className="mb-3 flex flex-wrap gap-3">
        {LEGEND_ORDER.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5 text-xs text-[color:var(--text-secondary)]">
            <span aria-hidden="true" style={{ color: STATUS_COLORS[status].light }}>
              {STATUS_ICON[status]}
            </span>
            {STATUS_LABEL[status]}
          </span>
        ))}
      </div>

      {error && <p className="text-sm text-[color:var(--text-muted)]">{friendlyApiErrorMessage(error)}</p>}

      {data && !hasAnyCellData && (
        <p className="text-sm text-[color:var(--text-muted)]">
          No historical {data.weekdayLabel} data yet. The heatmap fills in as soon as any {data.weekdayLabel}{" "}
          readings are collected.
        </p>
      )}

      {data && hasAnyCellData && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-32 text-left text-xs font-medium text-[color:var(--text-muted)]">Deck</th>
                {data.buckets.map((b, i) => (
                  <th
                    key={b.startMinute}
                    className="text-center text-[10px] font-normal text-[color:var(--text-muted)]"
                  >
                    {i % 2 === 0 ? formatMinuteOfDay(b.startMinute).replace(":00", "").replace(" ", "") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.decks.map((deck) => (
                <tr key={deck.slug}>
                  <td className="whitespace-nowrap text-sm font-medium">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: deckColor(deck.slug) }}
                      aria-hidden="true"
                    />
                    {deck.displayName}
                  </td>
                  {data.buckets.map((_, bIdx) => {
                    const cell = data.cells.find(
                      (c) => c.deckSlug === deck.slug && c.bucketIndex === bIdx,
                    );
                    const status = cell?.status ?? "unknown";
                    const color = STATUS_COLORS[status].light;
                    const isCriticalStripe = status === "full" || status === "nearly_full";
                    return (
                      <td
                        key={bIdx}
                        title={`${deck.displayName} — ${formatMinuteOfDay(data.buckets[bIdx]!.startMinute)}: ${
                          cell?.avgAvailable !== null && cell?.avgAvailable !== undefined
                            ? `${Math.round(cell.avgAvailable)} avg spaces`
                            : "no data"
                        } (${STATUS_LABEL[status]})`}
                        className="h-9 w-9 rounded text-center align-middle text-[10px] font-semibold tabular-nums"
                        style={{
                          backgroundColor: cell ? `${color}33` : "var(--gridline)",
                          color: cell ? color : "var(--text-muted)",
                          backgroundImage: isCriticalStripe
                            ? `repeating-linear-gradient(45deg, ${color}33, ${color}33 3px, ${color}1a 3px, ${color}1a 6px)`
                            : undefined,
                        }}
                      >
                        {cell?.avgAvailable !== null && cell?.avgAvailable !== undefined
                          ? Math.round(cell.avgAvailable)
                          : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-[color:var(--text-muted)]">
        Each cell is the historical average available spaces for that deck and 30-minute window on{" "}
        {data?.weekdayLabel ?? "the selected day"}. Diagonal stripes mark Nearly Full / FULL cells as an
        extra cue beyond color for colorblind readers.
      </p>
    </div>
  );
}
