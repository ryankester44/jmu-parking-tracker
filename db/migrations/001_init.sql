-- JMU Parking Tracker — initial schema
-- Run this in the Supabase SQL editor (or via `psql`) against a fresh project.
--
-- Design notes:
--   * `observed_at` is the single source of truth for time — a real instant
--     (timestamptz). Every other time-derived column (local date, local
--     time, day of week, minute-of-day) is a STORED GENERATED column
--     computed from it in the America/New_York zone, so it is always
--     internally consistent and automatically correct across DST changes —
--     there is no way for the app to write a `day_of_week` that disagrees
--     with `observed_at`.
--   * A UNIQUE constraint on (deck_id, observed_at) is what actually
--     prevents duplicate readings for the same deck in the same minute —
--     the collector upserts (`ON CONFLICT DO NOTHING`), so a retried or
--     overlapping run can never create a second row.
--   * Missing/failed reads are never coerced to 0. A failed fetch either
--     produces no row at all (whole-feed outage — logged in
--     `collection_runs` only) or a row with `available_spaces = NULL` and
--     `status <> 'ok'` (single-deck parse failure). Charts and averages
--     must treat NULL as "no data," not zero.

create table if not exists parking_decks (
  id smallint primary key,
  slug text not null unique,
  display_name text not null,
  -- JMU's own "ZoneId" for this deck's commuter sign feed. This is the one
  -- thing likely to change if JMU renames or remaps a deck (it has
  -- happened before — see README "If JMU changes their page"). Update the
  -- zone_id here; no code changes needed.
  zone_id text not null unique,
  sort_order smallint not null,
  active boolean not null default true,
  -- Total COMMUTER-level capacity, when JMU's own per-lot pages state it
  -- unambiguously. NULL means "not reliably confirmed" — the app must NOT
  -- invent a number, and falls back to an absolute-count status heuristic
  -- instead of a percentage. See capacity_source / capacity_note.
  capacity integer,
  capacity_source text,
  capacity_note text,
  created_at timestamptz not null default now()
);

comment on table parking_decks is
  'Registry of tracked commuter decks. Deliberately small and hand-maintained — this is the one file/table to edit if JMU adds, renames, or remaps a deck.';

insert into parking_decks (id, slug, display_name, zone_id, sort_order, capacity, capacity_source, capacity_note)
values
  (1, 'ballard',        'Ballard Deck',        '22', 1, 1483, 'https://www.jmu.edu/parking/lots/all-lots/ballard-deck-commuter.shtml',                     'Commuter Levels 2-4 only; excludes 112 separate Faculty/Staff spaces on Level G.'),
  (2, 'charlie-obaugh',  'Charlie Obaugh Deck', '13', 2, 465,  'https://www.jmu.edu/parking/lots/all-lots/charlie-obaugh-auto-group-deck-commuter.shtml',    'Commuter Levels G-5 only; excludes 33 separate Faculty/Staff spaces on Level G.'),
  (3, 'chesapeake',      'Chesapeake Deck',     '19', 3, 688,  'https://www.jmu.edu/parking/lots/all-lots/chesapeake-avenue-deck-commuter.shtml',            'Entire deck is commuter parking (JMU''s page states no Faculty/Staff spaces here).'),
  (4, 'mason',           'Mason Deck',          '54', 4, null, null,                                                                                        'JMU''s per-lot pages only confirm 243 Commuter (Level 5) spaces plus separate Faculty/Staff and Pay-By-Plate levels; one lot sub-page (Hotel Valet) 404s, so a reliable deck-wide commuter total could not be confirmed. Status uses the absolute-count fallback, not a percentage.'),
  (5, 'warsaw',          'Warsaw Deck',         '42', 5, 613,  'https://www.jmu.edu/parking/lots/all-lots/warsaw-ave-deck-commuter.shtml',                   'Commuter Levels 3-5 only; excludes 200 separate Faculty/Staff spaces on Levels G-2.')
on conflict (id) do update set
  display_name = excluded.display_name,
  zone_id = excluded.zone_id,
  sort_order = excluded.sort_order,
  capacity = excluded.capacity,
  capacity_source = excluded.capacity_source,
  capacity_note = excluded.capacity_note;

create table if not exists parking_observations (
  id bigserial primary key,
  deck_id smallint not null references parking_decks(id),
  observed_at timestamptz not null,

  -- Generated, always consistent with observed_at — never written directly.
  local_ts timestamp generated always as (observed_at at time zone 'America/New_York') stored,
  local_date date generated always as ((observed_at at time zone 'America/New_York')::date) stored,
  -- ISO day of week: 1=Monday ... 7=Sunday
  day_of_week smallint generated always as (
    extract(isodow from (observed_at at time zone 'America/New_York'))::smallint
  ) stored,
  -- Minutes since local midnight (0-1439). 7:00 AM = 420, 9:00 PM = 1260.
  minute_of_day smallint generated always as (
    extract(hour from (observed_at at time zone 'America/New_York'))::smallint * 60
    + extract(minute from (observed_at at time zone 'America/New_York'))::smallint
  ) stored,

  -- NULL = no valid reading for this deck this minute. Never 0 as a
  -- substitute for missing data. 0 is a legitimate "FULL" reading.
  available_spaces integer,
  status text not null default 'ok' check (status in ('ok', 'invalid', 'missing', 'error')),

  -- The upstream feed's own <AsOf> freshness timestamp, parsed as-is
  -- (America/New_York, no offset supplied by JMU) — kept for debugging
  -- staleness, distinct from observed_at (our collector's clock).
  source_as_of timestamp,
  source text not null default 'jmu.edu/cgi-bin/parking_sign_data.cgi',
  -- Raw string JMU returned for this zone, kept when it didn't parse as a
  -- clean non-negative integer, so a format change is diagnosable.
  raw_result text,

  created_at timestamptz not null default now(),

  constraint uq_deck_minute unique (deck_id, observed_at),
  constraint chk_available_nonneg check (available_spaces is null or available_spaces >= 0)
);

comment on table parking_observations is
  'One row per deck per minute-level collection attempt. This is the historical dataset JMU does not provide — the whole reason this app exists.';

-- Deck + timestamp range scans (the unique constraint already covers exact
-- deck+minute lookups; this covers "all of deck X between date A and B").
create index if not exists idx_obs_deck_time on parking_observations (deck_id, observed_at desc);

-- Weekday + minute-of-day averaging is the single most common query in
-- this app (Typical Availability, Best Times to Park, Where Should I
-- Park, the heatmap). Index it directly.
create index if not exists idx_obs_deck_dow_minute on parking_observations (deck_id, day_of_week, minute_of_day);

-- "Today's chart" / date-scoped lookups.
create index if not exists idx_obs_local_date on parking_observations (local_date, deck_id);

create index if not exists idx_obs_observed_at on parking_observations (observed_at);

-- Run-level collector log: one row per scheduled invocation, independent
-- of per-deck rows. A whole-feed outage (JMU down, token fetch failing,
-- etc.) shows up here with success = false and zero parking_observations
-- rows written for that minute — which is exactly what should produce a
-- gap in the charts, not a fabricated reading.
create table if not exists collection_runs (
  id bigserial primary key,
  run_at timestamptz not null default now(),
  success boolean not null,
  decks_ok smallint not null default 0,
  decks_failed smallint not null default 0,
  http_status integer,
  error_message text,
  duration_ms integer
);

create index if not exists idx_runs_run_at on collection_runs (run_at desc);

-- O(1) "current status" lookup for the live dashboard — upserted by the
-- collector on every run alongside the historical row, so the dashboard
-- never has to scan parking_observations for "latest per deck."
create table if not exists deck_latest (
  deck_id smallint primary key references parking_decks(id),
  observed_at timestamptz not null,
  available_spaces integer,
  status text not null,
  source_as_of timestamp
);
