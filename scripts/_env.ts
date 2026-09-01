/**
 * Loads .env.local for standalone scripts run via `tsx`.
 *
 * Next.js auto-loads .env.local for `next dev`/`next build`, but a script
 * invoked directly (`tsx scripts/whatever.ts`) is a separate Node process
 * that does NOT get that for free — without this, every standalone script
 * in this folder would fail with "Missing Supabase env vars" even with a
 * correctly filled-in .env.local. Import this first, before anything that
 * reads process.env.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
} else {
  console.warn(
    "[env] No .env.local found at the project root. Copy .env.example to .env.local and fill in your Supabase values first.",
  );
}
