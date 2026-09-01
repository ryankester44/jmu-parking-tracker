-- Small helper used by /api/meta and /dev/data-status to report how many
-- distinct calendar days of ANY weekday have contributed real data, without
-- pulling every local_date value into the application to dedupe in JS
-- (which would mean scanning the whole, potentially-millions-of-rows
-- parking_observations table on every page load).

create or replace function days_of_history() returns integer as $$
  select count(distinct local_date)::integer
  from parking_observations
  where available_spaces is not null;
$$ language sql stable;

comment on function days_of_history() is
  'Total distinct calendar dates with at least one valid observation, across all decks. Used for the "Days of history" figure in Data Information / diagnostics.';
