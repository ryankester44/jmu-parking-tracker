import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Refreshes the pre-aggregated materialized views (deck_weekday_minute_stats,
 * deck_weekday_coverage) that every historical-average feature reads from.
 * Called on a schedule (see .github/workflows/refresh-views.yml), NOT on
 * every write — refreshing on every collection tick would defeat the
 * purpose of pre-aggregating a table designed to grow to millions of rows.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET is not set" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { error } = await supabase.rpc("refresh_deck_stats");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ refreshedAt: new Date().toISOString() });
}
