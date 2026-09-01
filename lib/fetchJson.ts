"use client";

export type ApiFailureKind = "network" | "server" | "not_found" | "unknown";

export interface ApiError {
  kind: ApiFailureKind;
  status?: number;
  message: string;
}

export interface ApiResult<T> {
  data: T | null;
  error: ApiError | null;
}

/**
 * Fetch + parse JSON from one of our own /api/* routes, distinguishing
 * *why* it failed instead of collapsing everything into one generic
 * "couldn't load" message:
 *   - network: the request never reached the server at all
 *   - server: the server responded with an error (most commonly a
 *     misconfigured/unreachable Supabase connection — see friendlyApiErrorMessage)
 *   - not_found: 404
 * A successful response with genuinely empty data (e.g. zero historical
 * observations) is NOT an error — that's `{ data, error: null }` with
 * empty-looking data, which callers render as their own "no data yet"
 * state, not this error path.
 */
export async function fetchApi<T>(url: string): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    return {
      data: null,
      error: { kind: "network", message: err instanceof Error ? err.message : "Network error" },
    };
  }

  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    return {
      data: null,
      error: { kind: res.status === 404 ? "not_found" : "server", status: res.status, message },
    };
  }

  try {
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch {
    return { data: null, error: { kind: "unknown", message: "Received a malformed response" } };
  }
}

/** Plain-language message for the ApiError types above. */
export function friendlyApiErrorMessage(error: ApiError | null): string {
  if (!error) return "";
  if (error.kind === "network") {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (error.status === 500) {
    return "Database connection failed. Check that Supabase environment variables are set correctly (see /dev/data-status).";
  }
  if (error.kind === "not_found") {
    return "That data isn't available right now.";
  }
  return `Something went wrong loading this (${error.message}).`;
}

/** For the rare call site that only wants data-or-null and doesn't render its own error message. */
export async function fetchJsonOrNull<T>(url: string): Promise<T | null> {
  const { data } = await fetchApi<T>(url);
  return data;
}
