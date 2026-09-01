/**
 * JMU commuter parking data source — fetch + parse only. No DB code here on
 * purpose: if JMU changes their page and the feed breaks, THIS is the only
 * file that should need to change.
 *
 * How the data actually flows (reverse-engineered by inspecting
 * https://www.jmu.edu/parking/commuter-space-counts.shtml — verified live,
 * not assumed):
 *
 *   1. The visible page embeds an <iframe> at PARKIFRAME_URL. That iframe's
 *      HTML contains a hidden input `#pkey` whose `value` is a short-lived
 *      token, plus an inline <script> that does:
 *        var hash = document.getElementById("pkey").value;
 *        hash += '|869835tg89dhkdnbnsv5sg5wg0vmcf4mfcfc2qwm5968unmeh5';
 *      Both the token and that trailing literal string are plain-text in
 *      JMU's own public, unauthenticated page source — this is not
 *      bypassing any access control, it's the same request any browser
 *      makes to render the page.
 *   2. The iframe's own JS then requests DATA_URL with `?hash=<that value>`
 *      and a Referer of the iframe's own URL, and gets back a flat XML
 *      document: repeated <ZoneVacanSpaces><AsOf>...</AsOf><ZoneId>...</ZoneId>
 *      <Result>...</Result></ZoneVacanSpaces> blocks, one appended per zone
 *      as the feed accumulates state (each ZoneId can repeat — take the
 *      FIRST occurrence, matching JMU's own client-side parser, which reads
 *      the first <Result> after the first matching <ZoneId>).
 *   3. `<Result>` is a plain integer: available commuter spaces. JMU's own
 *      JS treats <= 0 as "FULL" (see statusStyle()/getStat() in the iframe
 *      source) — that convention is preserved here.
 *
 * Zone IDs are looked up from JMU's own per-lot HTML/JS comments and can
 * change if JMU renames or remaps a deck (it has happened — e.g. Grace
 * Street's zone 4 was removed from the page entirely in August 2026, and
 * Mason's zone id changed the same month). If a deck stops updating,
 * check the current zone_id by fetching PARKIFRAME_URL and searching its
 * <script> for the relevant deck's div id, then update the `zone_id` in
 * the `parking_decks` table (db/migrations/001_init.sql seed) — no code
 * change needed here.
 */

const MAIN_PAGE_URL = "https://www.jmu.edu/parking/commuter-space-counts.shtml";
const PARKIFRAME_URL = "https://www.jmu.edu/cgi-bin/parkiframe";
const DATA_URL = "https://www.jmu.edu/cgi-bin/parking_sign_data.cgi";

// This literal is public, client-side JS shipped by JMU's own iframe page
// (see the header comment above) — not a secret we're extracting.
const HASH_SALT = "869835tg89dhkdnbnsv5sg5wg0vmcf4mfcfc2qwm5968unmeh5";

const PKEY_RE = /id="pkey"[^>]*value="([^"]+)"/;
const ZONE_RE = /<ZoneId>(\d+)<\/ZoneId><Result>([^<]*)<\/Result>/g;
const ASOF_RE = /<AsOf>([^<]*)<\/AsOf>/;

function userAgent(): string {
  const contact = process.env.COLLECTOR_CONTACT_URL;
  return `JMUParkingTracker/1.0 (student project; polls jmu.edu commuter parking feed at most once/minute, Mon-Fri 7am-9pm ET${
    contact ? `; ${contact}` : ""
  })`;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 2,
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} from ${url}`);
    } catch (err) {
      lastError = err;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface RawFeedResult {
  /** zoneId -> raw <Result> text, first occurrence only */
  counts: Map<string, string>;
  /** The feed's own <AsOf> value, verbatim (America/New_York, no offset) */
  asOf: string | null;
}

/** Two requests total: one for the token, one for the data feed. Never one request per deck. */
export async function fetchJmuFeed(): Promise<RawFeedResult> {
  const iframeRes = await fetchWithRetry(PARKIFRAME_URL, {
    headers: {
      Referer: MAIN_PAGE_URL,
      "User-Agent": userAgent(),
    },
    cache: "no-store",
  });
  const iframeHtml = await iframeRes.text();

  const pkeyMatch = PKEY_RE.exec(iframeHtml);
  if (!pkeyMatch || !pkeyMatch[1]) {
    throw new Error("pkey token not found in iframe HTML — JMU may have changed the page structure");
  }
  const hash = `${pkeyMatch[1]}|${HASH_SALT}`;

  const dataRes = await fetchWithRetry(
    `${DATA_URL}?hash=${encodeURIComponent(hash)}`,
    {
      headers: {
        Referer: PARKIFRAME_URL,
        "User-Agent": userAgent(),
      },
      cache: "no-store",
    },
  );
  const xml = await dataRes.text();

  if (!xml.includes("<decks>")) {
    throw new Error("feed response did not contain <decks> — format may have changed");
  }

  return parseFeedXml(xml);
}

export function parseFeedXml(xml: string): RawFeedResult {
  const counts = new Map<string, string>();
  ZONE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ZONE_RE.exec(xml)) !== null) {
    const zoneId = match[1]!;
    const result = match[2]!;
    if (!counts.has(zoneId)) {
      counts.set(zoneId, result);
    }
  }

  const asOfMatch = ASOF_RE.exec(xml);
  return { counts, asOf: asOfMatch?.[1] ?? null };
}

export interface ParsedZoneReading {
  /** Non-negative integer count, or null if this zone's value didn't parse cleanly. */
  value: number | null;
  /** 'ok' | 'invalid' | 'missing' */
  status: "ok" | "invalid" | "missing";
  raw: string | null;
}

/** A value more than this many spaces is treated as a parse anomaly, not a real reading. */
const MAX_PLAUSIBLE_SPACES = 3000;

export function interpretZoneReading(
  raw: string | undefined,
): ParsedZoneReading {
  if (raw === undefined) {
    return { value: null, status: "missing", raw: null };
  }
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "Errors") {
    return { value: null, status: "missing", raw: trimmed };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { value: null, status: "invalid", raw: trimmed };
  }
  if (n > MAX_PLAUSIBLE_SPACES) {
    return { value: null, status: "invalid", raw: trimmed };
  }
  // JMU's own convention: zero or negative means FULL. Clamp negative to 0
  // rather than discarding it — it's a legitimate (if oddly signed) FULL
  // reading, not a parse failure.
  return { value: Math.max(0, n), status: "ok", raw: trimmed };
}
