"use client";

import { useEffect, useState } from "react";
import { formatClockTime } from "@/lib/time";
import { fetchApi, friendlyApiErrorMessage, type ApiError } from "@/lib/fetchJson";
import { onCollected } from "@/lib/collectBus";

interface MetaApiResponse {
  earliestObservedAt: string | null;
  latestObservedAt: string | null;
  totalObservations: number;
  observationsToday: number;
  daysOfHistory: number;
  lastRun: {
    run_at: string;
    success: boolean;
    decks_ok: number;
    decks_failed: number;
    error_message: string | null;
  } | null;
  lastSuccessfulRunAt: string | null;
  collectorWindowActive: boolean;
  collectionWindow: { days: string; start: string; end: string; timezone: string };
  decks: Array<{
    slug: string;
    displayName: string;
    capacity: number | null;
    capacitySource: string | null;
    capacityNote: string | null;
    methodology: "capacity" | "absolute";
  }>;
}

const POLL_MS = 60_000;

export function DataInfo() {
  const [data, setData] = useState<MetaApiResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await fetchApi<MetaApiResponse>("/api/meta");
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
  }, []);

  return (
    <div className="space-y-6 text-sm text-[color:var(--text-secondary)]">
      <div>
        <h3 className="mb-1 font-semibold text-[color:var(--text-primary)]">Collector status</h3>
        {error && <p className="text-sm text-[color:var(--text-muted)]">{friendlyApiErrorMessage(error)}</p>}
        {!error && !data && <p>Loading…</p>}
        {!error && data && data.totalObservations === 0 && (
          <p>No parking observations have been collected yet.</p>
        )}
        {!error && data && data.totalObservations > 0 && (
          <div className="card grid grid-cols-1 gap-x-6 gap-y-1 p-4 sm:grid-cols-2">
            <div>
              Collector:{" "}
              <strong className={data.collectorWindowActive ? "text-emerald-600" : "text-[color:var(--text-primary)]"}>
                {data.collectorWindowActive ? "Active window" : "Outside scheduled window"}
              </strong>
            </div>
            <div>
              Last successful collection:{" "}
              <strong>{data.lastSuccessfulRunAt ? formatClockTime(data.lastSuccessfulRunAt) : "never"}</strong>
            </div>
            <div>
              Latest database observation:{" "}
              <strong>{data.latestObservedAt ? formatClockTime(data.latestObservedAt) : "none"}</strong>
            </div>
            <div>
              Observations today: <strong>{data.observationsToday.toLocaleString()}</strong>
            </div>
            <div>
              Days of history: <strong>{data.daysOfHistory.toLocaleString()}</strong>
            </div>
            <div>
              Total observations stored: <strong>{data.totalObservations.toLocaleString()}</strong>
            </div>
          </div>
        )}
        {data?.lastRun && !data.lastRun.success && (
          <p className="mt-2 text-xs text-red-500">
            Most recent collection attempt ({formatClockTime(data.lastRun.run_at)}) failed:{" "}
            {data.lastRun.error_message}
          </p>
        )}
        <p className="mt-2 text-xs">
          Nothing here is backfilled or simulated — there is no historical data from before this app
          began collecting. See{" "}
          <a className="text-jmu-purple underline" href="/dev/data-status">
            /dev/data-status
          </a>{" "}
          (development only) for a full connection/collector diagnostic.
        </p>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-[color:var(--text-primary)]">Where this data comes from</h3>
        <p>
          JMU&apos;s{" "}
          <a
            className="text-jmu-purple underline"
            href="https://www.jmu.edu/parking/commuter-space-counts.shtml"
            target="_blank"
            rel="noreferrer"
          >
            Commuter Space Counts page
          </a>{" "}
          only ever shows the current count — it has no history. This site polls JMU&apos;s own public
          data feed (the same one that page uses, extracting all five decks from a single response) once
          per minute, {data?.collectionWindow.days ?? "Monday-Friday"} {data?.collectionWindow.start ?? "7:00 AM"}-
          {data?.collectionWindow.end ?? "9:00 PM"} {data?.collectionWindow.timezone ?? "America/New_York"}, and
          stores every reading permanently. That stored history is what every chart, average, and
          insight on this page is built from — never a live re-fetch of JMU&apos;s page.
        </p>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-[color:var(--text-primary)]">
          How &quot;Plenty / Moderate / Low / Nearly Full&quot; is decided
        </h3>
        <p>
          When a deck&apos;s total commuter capacity is confirmed directly from JMU&apos;s own per-lot
          pages, status is a percentage of that capacity (≥50% Plenty, 20-49% Moderate, 5-19% Low,
          &lt;5% Nearly Full, ≤0 FULL — JMU&apos;s own feed reports 0 or negative as FULL). When capacity
          isn&apos;t reliably confirmed, status instead uses fixed space-count thresholds (&gt;150
          Plenty, 51-150 Moderate, 16-50 Low, 1-15 Nearly Full) — no capacity number is invented.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {data?.decks.map((d) => (
            <li key={d.slug}>
              <strong>{d.displayName}:</strong>{" "}
              {d.methodology === "capacity" ? (
                <>
                  {d.capacity?.toLocaleString()} commuter spaces (
                  <a className="text-jmu-purple underline" href={d.capacitySource ?? "#"} target="_blank" rel="noreferrer">
                    source
                  </a>
                  ). {d.capacityNote}
                </>
              ) : (
                <>Capacity not reliably confirmed — uses space-count thresholds. {d.capacityNote}</>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-[color:var(--text-primary)]">Data Confidence thresholds</h3>
        <p>
          Historical data is displayed as soon as at least one valid observation exists — a single
          Tuesday reading <em>is</em> the Tuesday average until a second one arrives. Confidence
          indicates how much history supports that estimate, not whether it&apos;s shown:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>LOW: 1-2 matching weekdays</li>
          <li>MEDIUM: 3-7 matching weekdays</li>
          <li>HIGH: 8+ matching weekdays</li>
        </ul>
        <p className="mt-2">
          Estimates update automatically as more data is collected — every valid reading is folded into
          the average, the charts, the heatmap, and Where Should I Park as soon as it&apos;s stored. The
          only time you&apos;ll see &quot;no historical data yet&quot; is when zero valid observations
          exist for that exact deck/weekday/time — never because the sample is merely small.
        </p>
      </div>

      <div>
        <h3 className="mb-1 font-semibold text-[color:var(--text-primary)]">Data quality</h3>
        <p>
          Missing minutes are never filled with zero or a guess — a failed reading is stored as &quot;no
          data&quot; and shows as a gap in the charts. Duplicate readings for the same deck and minute are
          prevented at the database level.
        </p>
      </div>
    </div>
  );
}
