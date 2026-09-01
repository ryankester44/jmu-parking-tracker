"use client";

import { useEffect, useState } from "react";
import { formatClockTime } from "@/lib/time";

interface Diagnostics {
  supabaseConfigured: boolean;
  databaseReachable: boolean;
  parkingTableExists: boolean;
  totalRows: number | null;
  rowsToday: number | null;
  latestObservation: string | null;
  latestByDeck: Array<{
    slug: string;
    displayName: string;
    availableSpaces: number | null;
    observedAt: string | null;
    status: string | null;
  }>;
  lastCollectionRun: {
    run_at: string;
    success: boolean;
    decks_ok: number;
    decks_failed: number;
    error_message: string | null;
  } | null;
  collectionWindowActive: boolean;
  jmuSourceTested: boolean;
  jmuSourceReachable: boolean | null;
  jmuZonesReturned: number | null;
  errors: string[];
}

function YesNo({ value }: { value: boolean }) {
  return (
    <span className={value ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>
      {value ? "YES" : "NO"}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--border)] py-2 text-sm">
      <span className="text-[color:var(--text-secondary)]">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

export function DataStatusClient() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [testingJmu, setTestingJmu] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  async function load(testJmu = false) {
    if (testJmu) setTestingJmu(true);
    try {
      const res = await fetch(`/api/dev/diagnostics${testJmu ? "?testJmu=true" : ""}`);
      const json = await res.json();
      setDiag(json);
      setLoadedAt(new Date());
    } finally {
      if (testJmu) setTestingJmu(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!diag) {
    return <div className="p-8 font-mono text-sm">Loading diagnostics…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6 font-sans">
      <h1 className="text-xl font-bold">Data Status</h1>
      <p className="mb-1 text-xs text-[color:var(--text-muted)]">
        Dev-only diagnostics — not available in production. Never shows key/URL values.
      </p>
      {loadedAt && (
        <p className="mb-4 text-xs text-[color:var(--text-muted)]">Loaded {loadedAt.toLocaleTimeString()}</p>
      )}

      <button
        onClick={() => load()}
        className="mb-4 mr-2 rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-semibold"
      >
        Refresh
      </button>
      <button
        onClick={() => load(true)}
        disabled={testingJmu}
        className="mb-4 rounded-md bg-jmu-purple px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {testingJmu ? "Testing…" : "Test JMU Fetch Now"}
      </button>
      <p className="mb-6 text-xs text-[color:var(--text-muted)]">
        JMU reachability is not tested automatically on every page load — that would be an extra request
        to JMU's servers every time this page opens. Click the button above for a real, one-off test.
      </p>

      <div className="card mb-4 p-4">
        <Row label="Supabase configured">
          <YesNo value={diag.supabaseConfigured} />
        </Row>
        <Row label="Database reachable">
          <YesNo value={diag.databaseReachable} />
        </Row>
        <Row label="parking_observations table exists">
          <YesNo value={diag.parkingTableExists} />
        </Row>
        <Row label="Rows currently stored">{diag.totalRows ?? "—"}</Row>
        <Row label="Rows today">{diag.rowsToday ?? "—"}</Row>
        <Row label="Latest observation">
          {diag.latestObservation ? formatClockTime(diag.latestObservation) : "none yet"}
        </Row>
        <Row label="Collector window currently active">
          <YesNo value={diag.collectionWindowActive} />
        </Row>
        <Row label="JMU source reachable">
          {diag.jmuSourceTested ? (
            <YesNo value={diag.jmuSourceReachable ?? false} />
          ) : (
            <span className="text-[color:var(--text-muted)]">not tested this load</span>
          )}
        </Row>
        {diag.jmuZonesReturned !== null && <Row label="JMU zones returned">{diag.jmuZonesReturned}</Row>}
      </div>

      <h2 className="mb-2 font-semibold">Latest value per deck</h2>
      <div className="card mb-4 p-4">
        {diag.latestByDeck.length === 0 && (
          <p className="text-sm text-[color:var(--text-muted)]">No decks configured or reachable.</p>
        )}
        {diag.latestByDeck.map((d) => (
          <Row key={d.slug} label={d.displayName}>
            {d.availableSpaces !== null
              ? `${d.availableSpaces} spaces (${d.status}) @ ${d.observedAt ? formatClockTime(d.observedAt) : "—"}`
              : "no reading"}
          </Row>
        ))}
      </div>

      <h2 className="mb-2 font-semibold">Last collection run</h2>
      <div className="card mb-4 p-4">
        {diag.lastCollectionRun ? (
          <>
            <Row label="Ran at">{formatClockTime(diag.lastCollectionRun.run_at)}</Row>
            <Row label="Result">
              <YesNo value={diag.lastCollectionRun.success} />
            </Row>
            <Row label="Decks OK / failed">
              {diag.lastCollectionRun.decks_ok} / {diag.lastCollectionRun.decks_failed}
            </Row>
            {diag.lastCollectionRun.error_message && (
              <p className="mt-2 text-xs text-red-500">{diag.lastCollectionRun.error_message}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-[color:var(--text-muted)]">
            No collection has ever run — see the README's "HOW TO START COLLECTING REAL DATA" checklist.
          </p>
        )}
      </div>

      {diag.errors.length > 0 && (
        <>
          <h2 className="mb-2 font-semibold text-red-500">Errors</h2>
          <ul className="card list-disc space-y-1 p-4 pl-8 text-sm text-red-500">
            {diag.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
