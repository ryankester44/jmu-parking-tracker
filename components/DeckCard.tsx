"use client";

import { deckColor } from "@/lib/colors";
import { formatClockTime } from "@/lib/time";
import { StatusBadge } from "./StatusBadge";
import type { AvailabilityStatus } from "@/lib/types";

export interface LiveDeck {
  slug: string;
  displayName: string;
  availableSpaces: number | null;
  status: AvailabilityStatus;
  observedAt: string | null;
  capacity: number | null;
  methodology: "capacity" | "absolute";
  isBest: boolean;
}

export function DeckCard({ deck }: { deck: LiveDeck }) {
  const color = deckColor(deck.slug);

  return (
    <div
      className={`card relative flex flex-col gap-3 p-5 transition-shadow ${
        deck.isBest ? "shadow-[0_0_0_2px_var(--tw-shadow-color)] shadow-emerald-500" : ""
      }`}
    >
      {deck.isBest && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          Best right now
        </span>
      )}
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <h3 className="text-sm font-semibold text-[color:var(--text-secondary)]">{deck.displayName}</h3>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="tabular-nums text-4xl font-bold">
          {deck.availableSpaces !== null ? deck.availableSpaces.toLocaleString() : "—"}
        </span>
        <span className="text-sm text-[color:var(--text-muted)]">
          {deck.availableSpaces !== null ? "spaces available" : "no reading"}
        </span>
      </div>

      <StatusBadge status={deck.status} />

      <p className="mt-1 text-xs text-[color:var(--text-muted)]">
        {deck.observedAt ? `Last updated ${formatClockTime(deck.observedAt)}` : "No data yet"}
        {deck.methodology === "absolute" && (
          <span className="block">Capacity unconfirmed — status uses space-count thresholds.</span>
        )}
      </p>
    </div>
  );
}
