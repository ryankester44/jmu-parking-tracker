import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getActiveDecks, getDeckLatest } from "@/lib/queries";
import { classifyStatus, methodologyForDeck } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceClient();
  const [decks, latest] = await Promise.all([
    getActiveDecks(supabase),
    getDeckLatest(supabase),
  ]);

  const latestByDeck = new Map(latest.map((l) => [l.deck_id, l]));

  const decksOut = decks.map((deck) => {
    const row = latestByDeck.get(deck.id) ?? null;
    const availableSpaces = row?.available_spaces ?? null;
    return {
      slug: deck.slug,
      displayName: deck.display_name,
      sortOrder: deck.sort_order,
      capacity: deck.capacity,
      capacityNote: deck.capacity_note,
      methodology: methodologyForDeck(deck),
      availableSpaces,
      status: classifyStatus(availableSpaces, deck.capacity),
      observedAt: row?.observed_at ?? null,
      sourceAsOf: row?.source_as_of ?? null,
      readingStatus: row?.status ?? null,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    decks: decksOut,
  });
}
