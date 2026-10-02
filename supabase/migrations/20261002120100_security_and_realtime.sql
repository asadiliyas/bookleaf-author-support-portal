-- =============================================================================
-- Security model
--
-- 1. Identity: role ('author' | 'admin') and author_id live in auth.users
--    app_metadata. Only the service role can write app_metadata, and it is
--    embedded in every JWT, so RLS checks need no extra queries.
--
-- 2. Reads: the browser (publishable key + user JWT) and the API's
--    request-scoped client can only SELECT rows the policies below allow.
--    Realtime postgres_changes applies the same policies per subscriber.
--
-- 3. Writes: clients have no INSERT/UPDATE/DELETE privileges at all. Every
--    mutation goes through the REST API, which authorises the request in the
--    service layer and then writes with the server-only secret key.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create or replace function private.current_author_id()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'author_id';
$$;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_author_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: read-only for signed-in users, nothing for anonymous users.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

-- Tables created by future migrations should not silently become writable.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.authors               enable row level security;
alter table public.admins                enable row level security;
alter table public.books                 enable row level security;
alter table public.tickets               enable row level security;
alter table public.ticket_messages       enable row level security;
alter table public.ticket_internal_notes enable row level security;
alter table public.ticket_events         enable row level security;
alter table public.ticket_attachments    enable row level security;
alter table public.ai_drafts             enable row level security;
alter table public.ai_requests           enable row level security;

-- Authors see their own profile, books, tickets, messages and attachments.
create policy "authors: own row or admin" on public.authors
  for select to authenticated
  using ((select private.is_admin()) or id = (select private.current_author_id()));

create policy "books: own or admin" on public.books
  for select to authenticated
  using ((select private.is_admin()) or author_id = (select private.current_author_id()));

create policy "tickets: own or admin" on public.tickets
  for select to authenticated
  using ((select private.is_admin()) or author_id = (select private.current_author_id()));

create policy "messages: own ticket or admin" on public.ticket_messages
  for select to authenticated
  using ((select private.is_admin()) or author_id = (select private.current_author_id()));

create policy "attachments: own ticket or admin" on public.ticket_attachments
  for select to authenticated
  using ((select private.is_admin()) or author_id = (select private.current_author_id()));

-- Ops-only data: internal notes, audit trail, AI internals, admin directory.
create policy "admins: admin only" on public.admins
  for select to authenticated using ((select private.is_admin()));

create policy "internal notes: admin only" on public.ticket_internal_notes
  for select to authenticated using ((select private.is_admin()));

create policy "events: admin only" on public.ticket_events
  for select to authenticated using ((select private.is_admin()));

create policy "ai drafts: admin only" on public.ai_drafts
  for select to authenticated using ((select private.is_admin()));

create policy "ai requests: admin only" on public.ai_requests
  for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Realtime: the UI subscribes to these tables as "something changed" signals
-- and re-fetches through the REST API. RLS above filters what each user gets.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.tickets,
  public.ticket_messages,
  public.ticket_internal_notes,
  public.ticket_events;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for ticket attachments. No client policies: uploads
-- go through the API, and downloads use short-lived signed URLs it issues.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
