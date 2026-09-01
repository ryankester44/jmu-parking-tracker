import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { runCollection } from "@/lib/collector";
import { isWithinCollectionWindow } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Collector trigger endpoint. Called every minute by the scheduler (see
 * .github/workflows/collect.yml) — this is the ONLY thing that writes to
 * parking_observations.
 *
 * Auth: requires "Authorization: Bearer <CRON_SECRET>". Without a valid
 * secret this refuses to run, so it can't be abused as a public trigger
 * for hitting JMU's servers.
 *
 * By default this is a no-op outside the Mon-Fri 7am-9pm America/New_York
 * window (the scheduler is expected to only fire inside that window
 * anyway, but this is a second, authoritative guard against clock drift,
 * manual curls, or a misconfigured scheduler). Pass ?force=true to bypass
 * the window check for manual testing.
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

  const force = req.nextUrl.searchParams.get("force") === "true";
  const now = new Date();

  if (!force && !isWithinCollectionWindow(now)) {
    return NextResponse.json({
      ranAt: now.toISOString(),
      withinWindow: false,
      skipped: true,
      result: null,
    });
  }

  const supabase = getServiceClient();
  const result = await runCollection(supabase);

  return NextResponse.json({
    ranAt: now.toISOString(),
    withinWindow: true,
    skipped: false,
    result,
  });
}
