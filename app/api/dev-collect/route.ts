import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { runCollection } from "@/lib/collector";

export const dynamic = "force-dynamic";

/**
 * Dev-only manual collection trigger — backs the "Collect Now" button and
 * lets you test the full pipeline locally without curling /api/collect
 * and juggling CRON_SECRET. Deliberately unauthenticated (unlike
 * /api/collect) because it's neutralized by environment instead: it hard
 * refuses to run whenever NODE_ENV is "production" (which is what Vercel
 * sets on real deployments), so it can never become a live, unauthenticated
 * write endpoint by accident.
 *
 * Always ignores the Mon-Fri 7am-9pm window — a manual "collect now" click
 * means "collect now," regardless of when "now" is.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Supabase is not configured" },
      { status: 500 },
    );
  }

  const result = await runCollection(supabase);

  if (result.success) {
    const { error } = await supabase.rpc("refresh_deck_stats");
    if (error) {
      return NextResponse.json({
        ranAt: new Date().toISOString(),
        result,
        viewRefreshError: error.message,
      });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), result });
}
