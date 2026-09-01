# JMU Parking Tracker

A real, deployable web app that tracks live commuter parking availability at
five JMU decks (Ballard, Charlie Obaugh, Chesapeake, Mason, Warsaw), builds
its own minute-by-minute historical dataset (JMU's own page only shows the
current count), and turns that history into charts, weekday averages, a
heatmap, and a "where should I park?" ranking.

Not an official JMU product.

## HOW TO START COLLECTING REAL DATA

1. Create a free [Supabase](https://supabase.com) project.
2. In its SQL Editor, run `db/migrations/001_init.sql`, then
   `002_materialized_views.sql`, then `003_diagnostics.sql`, in that order.
3. Copy your Project URL (Project Settings -> API -> Project URL).
4. Copy your `service_role` secret key (same page — **not** the `anon`
   key).
5. `cp .env.example .env.local` and paste those two values in, plus a
   random `CRON_SECRET` (`openssl rand -hex 32`).
6. `npm install`
7. `npm run dev`
8. In a second terminal: `npm run collector` (or click "Collect Now" in
   the browser instead — see "Local development" below).
9. Open `http://localhost:3000`.
10. Verify Live Availability shows real numbers with a real "Last updated"
    time.
11. Verify Today's Parking starts drawing points as each minute is
    collected.
12. (Optional) Visit `/dev/data-status` to confirm rows are actually
    landing in Supabase.

That's a working local instance collecting real JMU data. See "Deploying
this from scratch" below when you're ready to put it on the public
internet with an automatic scheduler.

## How the data actually works (verified, not assumed)

JMU's [Commuter Space Counts page](https://www.jmu.edu/parking/commuter-space-counts.shtml)
does **not** put the numbers directly in the page HTML. Inspecting it (live,
while building this) showed:

1. The page embeds an `<iframe>` at `https://www.jmu.edu/cgi-bin/parkiframe`.
   That iframe's HTML contains a hidden `#pkey` input (a short-lived token)
   and an inline script that appends a fixed public string to it to build a
   `hash`.
2. The iframe's own JS then requests
   `https://www.jmu.edu/cgi-bin/parking_sign_data.cgi?hash=<that value>` and
   gets back XML: repeated `<ZoneId>/<Result>` pairs, one per parking zone
   (take the first occurrence of each — the feed accumulates state as more
   zones are read).
3. `<Result>` is a plain integer — spaces available. JMU's own client-side JS
   treats `<= 0` as "FULL," which this app preserves.

That whole exchange is two plain HTTP requests to public, unauthenticated
JMU endpoints — the same requests any browser makes to render the page. This
isn't bypassing any login, rate limit, or CAPTCHA; it's replicating what the
page already does client-side, extracting all five tracked decks from a
**single** feed response instead of hitting JMU once per deck.

Zone IDs, verified live on 2026-08-31:

| Deck | Zone ID |
|---|---|
| Ballard | `22` |
| Charlie Obaugh | `13` |
| Chesapeake | `19` |
| Mason | `54` |
| Warsaw | `42` |

All the fetch/parse logic lives in **`lib/jmu-source.ts`**, deliberately
isolated from database code — if JMU changes the page (they already have:
Grace Street's deck was removed from the page in August 2026, and Mason's
zone ID changed the same month), that file plus the `zone_id` column in the
`parking_decks` table are the only things that should need updating.

### Deck capacities (for percentage-based status)

JMU doesn't publish one "total spaces" figure per deck — their site breaks
each deck into zones by permit type. Summing each deck's **Commuter**-level
zones from JMU's own per-lot pages gives a reliable commuter capacity for
four of the five decks; Mason's commuter-level total could not be reliably
confirmed (one of its lot sub-pages 404s). See the `capacity` /
`capacity_source` / `capacity_note` columns in
`db/migrations/001_init.sql` for the exact numbers, sources, and caveats.
Mason's live status uses an absolute space-count fallback instead of a
percentage — see `lib/stats.ts` for both threshold sets, fully documented.

## Architecture

```
JMU's public feed (2 requests/minute, during the collection window)
        |
GitHub Actions (every minute, Mon-Fri, wide UTC window)
        | POST /api/collect  (Authorization: Bearer CRON_SECRET)
        v
Next.js API route (Vercel)  --  lib/jmu-source.ts (fetch+parse)
        |                       lib/collector.ts (orchestration)
        v
Supabase Postgres
  parking_observations   (1 row / deck / minute, raw history)
  deck_latest             (O(1) "current status" for the dashboard)
  collection_runs         (run-level success/failure log)
  deck_weekday_minute_stats, deck_weekday_coverage
                           (materialized views, refreshed every 15 min
                            by a second GitHub Actions job -> /api/refresh-views)
        |
Next.js API routes (/api/live, /api/day, /api/typical, /api/heatmap,
                     /api/where, /api/meta)
        |
React frontend (charts, heatmap, rankings) — Vercel
```

The website **never** talks to JMU directly — only the collector does, and
only from the server. Every chart reads from Supabase.

### Why GitHub Actions instead of Vercel Cron

Vercel's free (Hobby) plan only allows **daily** cron invocations — far too
coarse for a once-a-minute collector. GitHub Actions is free and
minute-capable for public repos, so it's the scheduler here
(`.github/workflows/collect.yml`); Vercel only hosts the Next.js app.
GitHub's scheduler doesn't guarantee exact-minute delivery (it can lag a few
minutes under load) — that shows up as a small, honest gap in the data, not
a fabricated reading. If you're on Vercel Pro, you can switch to Vercel
Cron by adding a `crons` block to `vercel.json` pointed at the same
`/api/collect` route and disabling the GitHub Actions workflow so you don't
double-collect.

Because GitHub Actions cron is UTC-only and can't express "America/New_York,
DST-aware," the two cron schedules in `collect.yml` are deliberately wider
than the real 7:00 AM-9:00 PM window (covering both EST and EDT). The
**authoritative** Mon-Fri 7am-9pm America/New_York check happens inside
`/api/collect` (`lib/time.ts`) — any tick outside the true window is a
cheap no-op, never a database write.

## Data model

See `db/migrations/001_init.sql`, `002_materialized_views.sql`, and
`003_diagnostics.sql` for the full, commented schema. Highlights:

- `observed_at` (a real `timestamptz`) is the only time value ever written.
  `local_date`, `day_of_week`, `minute_of_day` are **generated columns**
  computed from it in `America/New_York` — always internally consistent,
  correct across DST changes, impossible to desync from `observed_at`.
- `UNIQUE (deck_id, observed_at)` + `upsert(..., { ignoreDuplicates: true })`
  is what actually prevents duplicate readings — not application logic that
  could have a bug, a database constraint that can't be bypassed.
- A failed reading is never `0`. Either the whole run fails (no rows written
  at all — a gap) or a specific deck's row gets `available_spaces = NULL`
  and `status = 'missing'/'invalid'` (see `lib/jmu-source.ts`
  `interpretZoneReading`).
- Indexes: `(deck_id, observed_at)`, `(deck_id, day_of_week, minute_of_day)`
  (the weekday-average query pattern used by almost every feature),
  `(local_date, deck_id)`, and a plain `observed_at` index.
- `deck_weekday_minute_stats` / `deck_weekday_coverage` are **materialized
  views**, refreshed on a schedule (every 15 min), not on every write — every
  historical-average feature reads these, never a live aggregation over
  potentially millions of raw rows.

## Deploying this from scratch

### 1. Create the Supabase project

1. [supabase.com](https://supabase.com) -> New Project. Free tier is fine to
   start.
2. In the SQL Editor, run `db/migrations/001_init.sql`, then
   `002_materialized_views.sql`, then `003_diagnostics.sql`, in that order.
3. Project Settings -> API: copy the **Project URL** and the
   **`service_role` secret key** (not the `anon` key — this app's API
   routes use the service role key server-side only, and never expose it to
   the browser).

> Free-tier Supabase projects pause after 7 days with zero API activity.
> Once the collector is running every minute during the week, that alone
> counts as activity, so this shouldn't come up in practice — but if you
> deploy and then don't turn on the scheduler for a week, check the
> Supabase dashboard for a "paused" project.

### 2. Deploy the app to Vercel

1. Push this repo to GitHub (see step 3 — you need this anyway for the
   collector).
2. [vercel.com](https://vercel.com) -> New Project -> import the repo.
3. Add environment variables (Project Settings -> Environment Variables),
   copying from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` — generate with `openssl rand -hex 32`
   - `COLLECTOR_CONTACT_URL` (optional) — your repo URL, sent as part of
     the User-Agent header on requests to jmu.edu so JMU can identify the
     traffic if they ever need to.
4. Deploy. Note the resulting URL (e.g. `https://jmu-parking-tracker.vercel.app`).

### 3. Turn on the scheduler (GitHub Actions)

1. In the GitHub repo -> Settings -> Secrets and variables -> Actions, add:
   - `APP_URL` — your Vercel deployment URL, no trailing slash
   - `CRON_SECRET` — the **same** value you set in Vercel
2. Make sure Actions are enabled for the repo (Settings -> Actions ->
   General). Scheduled workflows only run on the **default branch**, and
   GitHub disables schedules automatically after 60 days of repo
   inactivity — push something occasionally, or trigger the workflow
   manually (Actions tab -> "Collect parking data" -> "Run workflow") to
   re-enable it.
3. Watch the Actions tab — within a few minutes (during Mon-Fri 7am-9pm ET)
   you should see green runs, and rows appearing in `parking_observations`
   in the Supabase table editor.

### 4. Verify end-to-end

```bash
# Manually trigger one collection cycle (bypasses the schedule window for testing):
curl -X POST "https://YOUR-APP.vercel.app/api/collect?force=true" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Should return {"ranAt":...,"withinWindow":true or false,"result":{"success":true,...}}

curl "https://YOUR-APP.vercel.app/api/live"
# Should show the 5 decks with real current availableSpaces
```

## Local development — real data, no Vercel required

You do not need to deploy anything to test this end-to-end. You need a
Supabase project (that's the actual database — see "HOW TO START COLLECTING
REAL DATA" below if you haven't made one yet) and a filled-in `.env.local`;
everything else runs on your machine.

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's values
npm run dev                  # http://localhost:3000
```

At this point the site loads but every section says "no data yet" — that's
correct, nothing has been collected. Three ways to actually collect:

**Option A — click "Collect Now" in the browser.** In development, the Live
Availability section shows a purple "Collect Now" button. One click = one
real fetch from JMU + one real insert into Supabase, and every section on
the page updates automatically within a second or two (no manual refresh
needed).

**Option B — a second terminal that collects every minute**, exactly like
production will:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run collector          # respects Mon-Fri 7am-9pm America/New_York
npm run collector:force    # ignores the window — collects right now regardless
```

Leave Terminal 2 running and watch it print a line every minute; refresh
the browser (or just wait — every section polls every 60s) to see the
database grow in real time.

**Option C — one-off curl**, useful for scripting/CI:

```bash
curl -X POST "http://localhost:3000/api/collect?force=true" \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
npm run refresh-views   # updates the materialized views used by the charts
```

(Options A and B call `refresh_deck_stats()` automatically after every
collection, so Typical Availability / Heatmap / Where Should I Park update
immediately too, not just Live Availability and Today's Parking. Option C's
raw curl doesn't refresh views for you — that's what the `npm run
refresh-views` line is for.)

### Diagnosing "why is nothing showing"

Visit **`/dev/data-status`** (development only — 404s in production). It
reports, without ever exposing your actual keys:

- Supabase configured / database reachable / table exists (YES/NO)
- Rows currently stored, rows collected today
- Latest observation timestamp, latest reading per deck
- The last collection run's result (and its error message, if it failed)
- Whether the Mon-Fri 7am-9pm window is active right now
- An opt-in "Test JMU Fetch Now" button (a real request to JMU's servers,
  only made when you click it — not automatically on page load)

## Testing

```bash
npm run typecheck
npm test
```

What's covered by automated tests (`tests/`) and what isn't:

| # | Requirement | How it's verified |
|---|---|---|
| 1 | JMU data retrieved correctly | `jmu-source.test.ts` parses a real, captured sample response |
| 2 | All five decks recognized | Same file, asserts all 5 known zone IDs extract correctly |
| 3 | One observation per deck per minute; duplicates prevented | DB-level `UNIQUE` constraint (schema); `collector.test.ts` asserts the upsert call uses `onConflict: "deck_id,observed_at", ignoreDuplicates: true` |
| 4 | Historical averages calculated correctly | `stats.test.ts` (confidence tiers), `insights.test.ts` (peak/decline detection against synthetic data with a known answer) |
| 5 | Missing observations never become zero | `jmu-source.test.ts` (`interpretZoneReading`), `stats.test.ts` (`classifyStatus(null, ...)` is `"unknown"`, never `"full"`), `collector.test.ts` (a missing zone gets `available_spaces: null`, not `0`) |
| 6 | Collector only runs Mon-Fri 7am-9pm ET | `time.test.ts` — window edges, weekends, and both EST/EDT explicitly |
| 7 | Dashboard updates correctly | Manually verified via `npm run dev` + `/api/live` polling (see below) — not unit tested, since it's a live-polling UI behavior |
| 8 | Charts work on mobile | Manually verified in a resized/mobile-emulated browser (see below) |
| 9 | Graceful handling of a JMU outage | `collector.test.ts` "whole-feed outage" case: a rejected fetch writes **zero** observation rows and logs a failed `collection_runs` row — a gap, never a fake reading |

Items 7 and 8 need a running instance (they're about live UI behavior, not
pure logic) — see `npm run dev` above, or drive the deployed URL directly in
a mobile-width browser window.

### Manual test scenarios (need a real Supabase connection)

| Case | Steps | Expected |
|---|---|---|
| Empty database | Fresh Supabase project, no collection run yet | Live Availability: "No readings collected yet." Today's Parking: "No data collected today yet." `/dev/data-status` shows 0 rows. |
| One collection | Click "Collect Now" once | 5 new rows in `parking_observations`; Live cards show real values; Today's Parking has exactly one point per deck |
| Second collection a minute later | Click "Collect Now" again | 10 total rows; Today's Parking now has two timestamps per deck |
| One deck missing from JMU's response | (Rare in practice — JMU's feed has been reliable) | The other four decks still insert; the missing one gets `available_spaces: NULL, status: 'missing'` — never a `0` |
| JMU itself unreachable | Temporarily point `DATA_URL` in `lib/jmu-source.ts` at a bad host and collect | Zero rows written, `collection_runs` logs a failed run, Live Availability keeps showing the last real reading with its real (aging) timestamp |
| Restart `next dev` | Stop and restart the dev server | All previously collected data is still there — it lives in Supabase, not in the Next.js process |
| Only one weekday collected so far | Collect on a single Tuesday | Typical Availability draws a line from that one Tuesday, labeled "LOW CONFIDENCE · Based on 1 Tuesday" — not withheld |

## Data quality & confidence, in plain terms

- **A gap in a chart means a gap in reality** (a JMU outage, a missed
  scheduler tick) — it is never interpolated or filled with a guess.
- **Data Confidence is a label, not a gate.** As soon as ONE valid
  observation exists for a deck/weekday, it's shown — that single reading
  *is* the current average, labeled LOW confidence. HIGH needs 8+ of that
  weekday ever observed; MEDIUM is 3-7; LOW is 1-2. The only time nothing
  is shown is zero observations. See `lib/stats.ts`
  (`classifyConfidence`'s doc comment spells this out explicitly).
- **Status thresholds** (Plenty/Moderate/Low/Nearly Full/FULL) are a
  documented judgment call, not a JMU standard — see the "How this is
  decided" section on the live site itself (Data Information), or
  `lib/stats.ts`.
- There is **no historical data from before this app started collecting**.
  Nothing is backfilled or simulated to make early charts look fuller.

## Known limitations

- GitHub Actions scheduled workflows are best-effort on timing, not exact.
- Mason Deck's total commuter capacity isn't fully confirmed by JMU's own
  site (see above) — its live status uses a coarser, absolute-count method
  until/unless a reliable number turns up.
- Exact-count Postgres `count(*)` (used for the "total observations" figure
  in Data Information) can get slow on a genuinely huge table; fine at this
  app's expected scale, worth switching to an estimated count if it ever
  grows far beyond a semester's worth of data.
