/**
 * Local development collector — the "Terminal 2" process.
 *
 * Run this alongside `npm run dev` to actually collect real JMU data every
 * minute without needing Vercel or GitHub Actions:
 *
 *   Terminal 1:  npm run dev
 *   Terminal 2:  npm run collector
 *
 * It calls the exact same runCollection() used by the production
 * /api/collect endpoint and the GitHub Actions scheduler — this is not a
 * different code path, just a different trigger. By default it only
 * collects Monday-Friday 7:00 AM-9:00 PM America/New_York, same as
 * production; pass --force to collect regardless (useful for testing on a
 * weekend or outside the window).
 *
 * After each successful collection it also refreshes the aggregated
 * materialized views (deck_weekday_minute_stats / deck_weekday_coverage),
 * so Typical Availability / Heatmap / Where Should I Park reflect the new
 * reading within the same minute — in production that refresh is batched
 * every 15 minutes instead, since it's cheap here at local-dev data
 * volumes but not something to do on every tick at real scale.
 *
 * Never inserts anything when a collection cycle fails outright — a
 * failed JMU fetch just gets logged and produces a real gap, exactly like
 * production.
 */
import "./_env";
import { getServiceClient } from "../lib/supabase/server";
import { runCollection } from "../lib/collector";
import { isWithinCollectionWindow } from "../lib/time";

const FORCE = process.argv.includes("--force") || process.env.FORCE_COLLECT === "true";
const INTERVAL_MS = 60_000;

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" });
}

async function tick() {
  const now = new Date();

  if (!FORCE && !isWithinCollectionWindow(now)) {
    console.log(`[${timestamp()}] outside Mon-Fri 7am-9pm ET window — skipping (use --force to override)`);
    return;
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error(`[${timestamp()}] cannot start: ${err instanceof Error ? err.message : err}`);
    console.error("Fill in .env.local with your Supabase project's values (see .env.example) and restart.");
    process.exit(1);
  }

  const result = await runCollection(supabase);

  if (result.success) {
    console.log(
      `[${timestamp()}] collected: ${result.decksOk} ok, ${result.decksFailed} missing/invalid` +
        (result.decksFailed > 0 ? " (partial — see collection_runs for details)" : ""),
    );
    const { error } = await supabase.rpc("refresh_deck_stats");
    if (error) console.warn(`[${timestamp()}] view refresh failed: ${error.message}`);
  } else {
    console.error(`[${timestamp()}] collection FAILED: ${result.errorMessage} — no rows written, this is a real gap`);
  }
}

console.log("JMU Parking Tracker — local collector");
console.log(
  FORCE
    ? "Mode: --force (ignoring the Mon-Fri 7am-9pm America/New_York window)"
    : "Mode: respecting the Mon-Fri 7am-9pm America/New_York window (use --force to override)",
);
console.log(`Collecting every ${INTERVAL_MS / 1000}s. Press Ctrl+C to stop.\n`);

tick();
setInterval(tick, INTERVAL_MS);
