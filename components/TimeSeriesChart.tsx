"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { deckColor } from "@/lib/colors";
import { formatMinuteOfDay } from "@/lib/time";
import { COLLECTION_START_MINUTE, COLLECTION_END_MINUTE } from "@/lib/time";

export interface ChartSeriesMeta {
  slug: string;
  displayName: string;
}

export interface ChartRow {
  minuteOfDay: number;
  [deckSlug: string]: number | null;
}

const HOUR_TICKS = (() => {
  const ticks: number[] = [];
  for (let m = COLLECTION_START_MINUTE; m <= COLLECTION_END_MINUTE; m += 60) ticks.push(m);
  return ticks;
})();

function CustomTooltip({
  active,
  payload,
  label,
  series,
  hidden,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number | null }>;
  label?: number;
  series: ChartSeriesMeta[];
  hidden: Set<string>;
}) {
  if (!active || label === undefined || !payload) return null;

  const rows = series
    .filter((s) => !hidden.has(s.slug))
    .map((s) => ({
      ...s,
      value: payload.find((p) => p.dataKey === s.slug)?.value ?? null,
    }))
    .filter((r) => r.value !== null)
    .sort((a, b) => (b.value as number) - (a.value as number));

  if (rows.length === 0) return null;

  return (
    <div className="card px-3 py-2 text-sm shadow-lg">
      <div className="mb-1 font-semibold">{formatMinuteOfDay(label)}</div>
      {rows.map((r) => (
        <div key={r.slug} className="flex items-center gap-2 tabular-nums">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: deckColor(r.slug) }}
            aria-hidden="true"
          />
          <span className="text-[color:var(--text-secondary)]">{r.displayName}:</span>
          <span className="font-semibold">{Math.round(r.value as number)}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartLegend({
  series,
  hidden,
  onToggle,
}: {
  series: ChartSeriesMeta[];
  hidden: Set<string>;
  onToggle: (slug: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {series.map((s) => {
        const isHidden = hidden.has(s.slug);
        return (
          <button
            key={s.slug}
            type="button"
            onClick={() => onToggle(s.slug)}
            aria-pressed={!isHidden}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-opacity ${
              isHidden ? "opacity-40" : "opacity-100"
            }`}
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: deckColor(s.slug) }}
              aria-hidden="true"
            />
            {s.displayName}
          </button>
        );
      })}
    </div>
  );
}

export function TimeSeriesChart({
  rows,
  series,
  hidden,
  emptyMessage = "No data collected for this selection yet.",
}: {
  rows: ChartRow[];
  series: ChartSeriesMeta[];
  hidden: Set<string>;
  emptyMessage?: string;
}) {
  const hasAnyData = rows.some((r) => series.some((s) => typeof r[s.slug] === "number"));

  if (!hasAnyData) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-[color:var(--text-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="h-72 w-full sm:h-96">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis
            dataKey="minuteOfDay"
            type="number"
            domain={[COLLECTION_START_MINUTE, COLLECTION_END_MINUTE]}
            ticks={HOUR_TICKS}
            tickFormatter={(m: number) => formatMinuteOfDay(m).replace(":00", "")}
            stroke="var(--baseline)"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            stroke="var(--baseline)"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            label={{
              value: "spaces available",
              angle: -90,
              position: "insideLeft",
              fill: "var(--text-muted)",
              fontSize: 11,
            }}
          />
          <Tooltip content={<CustomTooltip series={series} hidden={hidden} />} />
          {series.map((s) =>
            hidden.has(s.slug) ? null : (
              <Line
                key={s.slug}
                type="monotone"
                dataKey={s.slug}
                name={s.displayName}
                stroke={deckColor(s.slug)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ),
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
