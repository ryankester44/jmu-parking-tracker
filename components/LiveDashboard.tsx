"use client";

import { useEffect, useState } from "react";
import { DeckCard, type LiveDeck } from "./DeckCard";
import { fetchApi, friendlyApiErrorMessage, type ApiError } from "@/lib/fetchJson";
import { onCollected } from "@/lib/collectBus";

interface LiveApiDeck {
  slug: string;
  displayName: string;
  sortOrder: number;
  capacity: number | null;
  methodology: "capacity" | "absolute";
  availableSpaces: number | null;
  status: LiveDeck["status"];
  observedAt: string | null;
}

interface LiveApiResponse {
  decks: LiveApiDeck[];
}

const POLL_MS = 60_000;

export function LiveDashboard() {
  const [decks, setDecks] = useState<LiveApiDeck[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await fetchApi<LiveApiResponse>("/api/live");
      if (cancelled) return;
      if (data) {
        setDecks(data.decks);
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

  if (error) {
    return <p className="text-sm text-[color:var(--text-muted)]">{friendlyApiErrorMessage(error)}</p>;
  }

  if (!decks) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-40 animate-pulse p-5" />
        ))}
      </div>
    );
  }

  const noReadingsAtAll = decks.every((d) => d.availableSpaces === null);
  if (noReadingsAtAll) {
    return (
      <p className="text-sm text-[color:var(--text-muted)]">
        No readings collected yet. Once the collector runs (see Data Information below for how to start
        it), current availability will appear here immediately.
      </p>
    );
  }

  const bestSlug = decks
    .filter((d) => d.availableSpaces !== null)
    .sort((a, b) => (b.availableSpaces ?? 0) - (a.availableSpaces ?? 0))[0]?.slug;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {decks.map((deck) => (
          <DeckCard
            key={deck.slug}
            deck={{ ...deck, isBest: deck.slug === bestSlug && deck.availableSpaces !== null }}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-[color:var(--text-muted)]">Updates approximately every minute.</p>
    </div>
  );
}
