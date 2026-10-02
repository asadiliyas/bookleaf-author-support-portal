-- The admin queue sorts "unresolved first, then most urgent, then oldest".
-- Enum declaration order already gives critical < high < medium < low, so a
-- stored flag for unresolved tickets lets Postgres do the whole sort + paging.
alter table public.tickets
  add column is_unresolved boolean generated always as (status in ('open', 'in_progress')) stored;

drop index if exists public.tickets_queue_idx;
create index tickets_queue_idx on public.tickets (is_unresolved desc, priority, created_at);
