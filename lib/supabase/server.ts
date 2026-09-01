import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER-SIDE ONLY.
 *
 * Import this only from Route Handlers (app/api/.../route.ts) or other
 * server-only modules (scripts/). Never import it from a Client Component
 * or anything bundled for the browser — the service role key bypasses
 * Row Level Security entirely.
 */
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ServiceClient = ReturnType<typeof getServiceClient>;
