/**
 * Local/manual equivalent of POST /api/refresh-views — refreshes the
 * aggregated materialized views directly against Supabase. Useful in
 * local development so you don't need a deployed URL to see historical
 * averages update. Requires .env.local (or the environment) to have
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set.
 *
 * Usage: npm run refresh-views
 */
import "./_env";
import { getServiceClient } from "../lib/supabase/server";

async function main() {
  const supabase = getServiceClient();
  const { error } = await supabase.rpc("refresh_deck_stats");
  if (error) {
    console.error("Refresh failed:", error.message);
    process.exit(1);
  }
  console.log(`Refreshed at ${new Date().toISOString()}`);
}

main();
