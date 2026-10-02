-- =============================================================================
-- BookLeaf Author Support Portal: core schema
--
-- Tables
--   authors, admins, books              account + catalogue data (seeded)
--   tickets, ticket_messages            the support conversation
--   ticket_internal_notes               admin-only notes (separate table, so they
--                                       can never leak to authors via realtime)
--   ticket_events                       audit trail / activity timeline
--   ticket_attachments                  files stored in Supabase Storage
--   ai_drafts, ai_requests              AI draft cache + AI call log (tokens, latency)
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

create type public.ticket_category as enum (
  'royalty_payments',
  'isbn_metadata',
  'printing_quality',
  'distribution_availability',
  'book_status_production',
  'general_inquiry'
);

create type public.ticket_priority as enum ('critical', 'high', 'medium', 'low');

-- Where the current category/priority came from.
--   ai       = Gemini classification
--   fallback = rule-based classifier (used instantly on creation and whenever AI is unavailable)
--   admin    = manual override by the ops team (never overwritten by AI)
create type public.classification_source as enum ('ai', 'fallback', 'admin');

create type public.ai_status as enum ('pending', 'completed', 'failed');

create type public.production_stage as enum (
  'manuscript_received',
  'editing',
  'cover_design',
  'typesetting',
  'proofreading',
  'isbn_assignment',
  'printing',
  'distribution_setup',
  'published_live'
);

create type public.message_sender as enum ('author', 'admin');

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table public.authors (
  id          text primary key check (id ~ '^AUTH[0-9]{3,}$'),
  user_id     uuid unique references auth.users (id) on delete set null,
  name        text not null,
  email       text not null unique,
  phone       text,
  city        text,
  joined_date date not null,
  created_at  timestamptz not null default now()
);

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table public.books (
  id                       text primary key check (id ~ '^BK[0-9]{3,}$'),
  author_id                text not null references public.authors (id) on delete cascade,
  title                    text not null,
  isbn                     text not null unique,
  genre                    text not null,
  stage                    public.production_stage not null,
  publication_date         date,
  -- Pricing/royalty fields are null until a book is published.
  mrp                      numeric(10, 2) check (mrp >= 0),
  author_royalty_per_copy  numeric(10, 2) check (author_royalty_per_copy >= 0),
  total_copies_sold        integer not null default 0 check (total_copies_sold >= 0),
  total_royalty_earned     numeric(12, 2) not null default 0 check (total_royalty_earned >= 0),
  royalty_paid             numeric(12, 2) not null default 0 check (royalty_paid >= 0),
  royalty_pending          numeric(12, 2) not null default 0 check (royalty_pending >= 0),
  last_royalty_payout_date date,
  print_partner            text,
  available_on             text[] not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Lets tickets reference (book, author) together so a ticket can only
  -- point at a book owned by the same author.
  unique (id, author_id)
);

create index books_author_id_idx on public.books (author_id);

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create table public.tickets (
  id                 uuid primary key default gen_random_uuid(),
  number             bigint generated always as identity (start with 1001) unique,
  author_id          text not null references public.authors (id) on delete cascade,
  book_id            text, -- null = "General / Account Level"
  subject            text not null check (char_length(subject) between 5 and 150),
  description        text not null check (char_length(description) between 20 and 5000),
  status             public.ticket_status not null default 'open',

  -- Effective classification (what the queue shows and filters on)
  category           public.ticket_category not null,
  priority           public.ticket_priority not null,
  category_source    public.classification_source not null,
  priority_source    public.classification_source not null,

  -- Raw AI output, kept separately so overrides can be measured (AI accuracy)
  ai_status          public.ai_status not null default 'pending',
  ai_category        public.ticket_category,
  ai_priority        public.ticket_priority,
  ai_confidence      real check (ai_confidence between 0 and 1),
  ai_rationale       text,
  ai_error           text,
  ai_classified_at   timestamptz,

  assigned_admin_id  uuid references public.admins (user_id) on delete set null,
  first_response_at  timestamptz,
  resolved_at        timestamptz,
  closed_at          timestamptz,
  last_activity_at   timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  foreign key (book_id, author_id) references public.books (id, author_id) on delete set null (book_id),
  -- Lets child rows carry author_id with a guarantee it matches the ticket.
  unique (id, author_id)
);

create index tickets_author_id_idx on public.tickets (author_id, created_at desc);
create index tickets_queue_idx on public.tickets (status, priority, created_at);
create index tickets_category_idx on public.tickets (category);
create index tickets_assignee_idx on public.tickets (assigned_admin_id);

create table public.ticket_messages (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null,
  -- Denormalised from tickets so RLS and realtime filters need no join;
  -- the composite FK below keeps it consistent with the ticket.
  author_id        text not null,
  sender_role      public.message_sender not null,
  sender_user_id   uuid references auth.users (id) on delete set null,
  sender_name      text not null,
  body             text not null check (char_length(body) between 1 and 10000),
  -- When an admin reply started from an AI draft: which draft, and how much of it survived.
  ai_draft_id      uuid,
  draft_similarity real check (draft_similarity between 0 and 1),
  created_at       timestamptz not null default now(),
  foreign key (ticket_id, author_id) references public.tickets (id, author_id) on delete cascade
);

create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

create table public.ticket_internal_notes (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets (id) on delete cascade,
  admin_id   uuid not null references public.admins (user_id) on delete cascade,
  admin_name text not null,
  body       text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index ticket_internal_notes_ticket_idx on public.ticket_internal_notes (ticket_id, created_at);

create table public.ticket_events (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null, -- null = system / AI
  actor_label text not null,
  type        text not null check (type in (
                'created', 'status_changed', 'category_changed', 'priority_changed',
                'assigned', 'unassigned', 'ai_classified', 'ai_classification_failed',
                'admin_replied', 'author_replied', 'note_added', 'reopened'
              )),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at);

create table public.ticket_attachments (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null,
  author_id    text not null,
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   integer not null check (size_bytes > 0),
  created_at   timestamptz not null default now(),
  foreign key (ticket_id, author_id) references public.tickets (id, author_id) on delete cascade
);

create index ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id);

-- ---------------------------------------------------------------------------
-- AI bookkeeping
-- ---------------------------------------------------------------------------
create table public.ai_drafts (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null references public.tickets (id) on delete cascade,
  -- Fingerprint of the inputs (latest message, category, prompt version).
  -- Same key = same context, so the cached draft is reused instead of paying again.
  context_key      text not null,
  reply            text not null,
  suggested_status public.ticket_status,
  escalation       jsonb,
  admin_checklist  jsonb not null default '[]'::jsonb,
  model            text not null,
  prompt_version   text not null,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index ai_drafts_lookup_idx on public.ai_drafts (ticket_id, context_key, created_at desc);

alter table public.ticket_messages
  add constraint ticket_messages_ai_draft_fk
  foreign key (ai_draft_id) references public.ai_drafts (id) on delete set null;

create table public.ai_requests (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid references public.tickets (id) on delete set null,
  operation       text not null check (operation in ('classify', 'draft')),
  model           text,
  prompt_version  text not null,
  outcome         text not null check (outcome in ('success', 'error')),
  error_code      text,
  attempts        integer not null default 1,
  input_tokens    integer,
  output_tokens   integer,
  cached_tokens   integer,
  thinking_tokens integer,
  latency_ms      integer,
  created_at      timestamptz not null default now()
);

create index ai_requests_created_idx on public.ai_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger books_set_updated_at before update on public.books
  for each row execute function public.set_updated_at();

create trigger tickets_set_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();
