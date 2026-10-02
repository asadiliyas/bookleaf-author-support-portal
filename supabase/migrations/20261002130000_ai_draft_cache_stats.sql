-- Draft cache bookkeeping: how often a cached draft was served instead of
-- calling the model again, and whose name the sign-off was generated with
-- (so a cached draft can be re-signed for a different agent without a new call).
alter table public.ai_drafts
  add column cache_hits integer not null default 0,
  add column agent_name text not null default 'BookLeaf Author Support';
