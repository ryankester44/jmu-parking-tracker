"use client";

import { useState } from "react";
import { emitCollected } from "@/lib/collectBus";

/**
 * Only ever rendered when NODE_ENV !== "production" (see app/page.tsx) —
 * this is the "open two terminals" alternative for anyone who'd rather
 * click a button than run `npm run collector`. One click = one real
 * collection cycle against the real JMU feed, stored for real.
 */
export function DevCollectButton() {
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function collectNow() {
    setLoading(true);
    setStatus(null);
    setIsError(false);
    try {
      const res = await fetch("/api/dev-collect", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      const r = json.result as {
        success: boolean;
        decksOk: number;
        decksFailed: number;
        errorMessage: string | null;
      };
      if (r.success) {
        setStatus(
          `Collected at ${new Date().toLocaleTimeString()} — ${r.decksOk} deck${
            r.decksOk === 1 ? "" : "s"
          } OK${r.decksFailed > 0 ? `, ${r.decksFailed} missing/invalid` : ""}.`,
        );
        emitCollected();
      } else {
        setIsError(true);
        setStatus(`Collection failed: ${r.errorMessage}`);
      }
    } catch (err) {
      setIsError(true);
      setStatus(err instanceof Error ? err.message : "Collection request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-jmu-purple/40 bg-jmu-purple/5 p-3 text-sm">
      <span className="rounded bg-jmu-purple px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        Dev only
      </span>
      <button
        type="button"
        onClick={collectNow}
        disabled={loading}
        className="rounded-md bg-jmu-purple px-3 py-1.5 font-semibold text-white transition-opacity disabled:opacity-50"
      >
        {loading ? "Collecting…" : "Collect Now"}
      </button>
      <span className="text-[color:var(--text-secondary)]">
        Runs one real JMU fetch + stores it — ignores the schedule window. Sections below refresh
        automatically.
      </span>
      {status && (
        <span className={isError ? "text-red-500" : "text-[color:var(--text-secondary)]"}>{status}</span>
      )}
    </div>
  );
}
