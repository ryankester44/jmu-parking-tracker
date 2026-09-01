-- Pre-aggregated weekday + minute-of-day statistics per deck.
--
-- Every "historical average" feature (Typical Availability, Best Times to
-- Park, the heatmap, Where Should I Park) reads this view instead of
-- scanning raw parking_observations — the raw table is designed to grow to
-- millions of rows, and re-averaging it on every page load would not
-- scale. Refresh on a schedule (see scripts/refresh-views.ts and the
-- "refresh-views" GitHub Actions job) rather than on every write.

create materialized view if not exists deck_weekday_minute_stats as
select
  deck_id,
  day_of_week,
  minute_of_day,
  count(*) filter (where available_spaces is not null) as sample_count,
  count(distinct local_date) filter (where available_spaces is not null) as distinct_days,
  avg(available_spaces) filter (where available_spaces is not null) as avg_available,
  min(available_spaces) filter (where available_spaces is not null) as min_available,
  max(available_spaces) filter (where available_spaces is not null) as max_available,
  stddev_pop(available_spaces) filter (where available_spaces is not null) as stddev_available,
  max(local_date) as last_observed_date
from parking_observations
group by deck_id, day_of_week, minute_of_day;

-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY (lets reads continue
-- against the old version while a refresh is in progress).
create unique index if not exists uq_deck_weekday_minute_stats
  on deck_weekday_minute_stats (deck_id, day_of_week, minute_of_day);

-- Coarser rollup: how many distinct Mondays/Tuesdays/etc. have we ever
-- observed for a deck, at all (any minute)? This backs the "Data
-- Confidence" badge without needing a per-minute join.
create materialized view if not exists deck_weekday_coverage as
select
  deck_id,
  day_of_week,
  count(distinct local_date) as distinct_days
from parking_observations
where available_spaces is not null
group by deck_id, day_of_week;

create unique index if not exists uq_deck_weekday_coverage
  on deck_weekday_coverage (deck_id, day_of_week);

create or replace function refresh_deck_stats() returns void as $$
begin
  refresh materialized view concurrently deck_weekday_minute_stats;
  refresh materialized view concurrently deck_weekday_coverage;
end;
$$ language plpgsql;

comment on function refresh_deck_stats() is
  'Call periodically (see scripts/refresh-views.ts) to bring the aggregated views up to date with newly collected observations. Not called on every write — that would defeat the point of pre-aggregating.';
