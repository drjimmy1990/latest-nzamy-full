-- DRAFT — NOT APPLIED. Additions for the MCP/Word v2 contract. Apply AFTER migration.sql, on staging first.
-- Nothing here touches a live database from this repository.

-- 1) New scopes (staff-only at first; enforced in the token-creation route and the OAuth grant).
alter table public.api_tokens drop constraint if exists api_tokens_scopes_check;
alter table public.api_tokens add constraint api_tokens_scopes_check
  check (scopes <@ array['library:read','ai:run','graph:read','account:read','dossier:read','research:write']);

-- 2) Cap on live tokens per user (device/token limit). Default 5; the owner decides the number.
create or replace function public.api_tokens_cap() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.api_tokens
       where user_id = new.user_id and revoked_at is null and expires_at > now()) >= 5 then
    raise exception 'token_cap' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists api_tokens_cap_trg on public.api_tokens;
create trigger api_tokens_cap_trg before insert on public.api_tokens for each row execute function public.api_tokens_cap();

-- 3) Library read log: metadata only (never text), 90-day retention. Written by the ext library routes.
create table if not exists public.library_read_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  token_id   uuid references public.api_tokens(id) on delete set null,
  item_id    text not null,
  outcome    text not null check (outcome in ('full','excerpt','denied')),
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists library_read_log_user_day on public.library_read_log(user_id, created_at);
alter table public.library_read_log enable row level security;
revoke all on public.library_read_log from anon, authenticated;
-- schedule: delete from public.library_read_log where created_at < now() - interval '90 days';

-- 4) Instant kill switch: one row in platform_settings, read by requireExtCaller on every ext request.
--    key 'ext_kill_switch' value true => every /api/v1/ext/* answers 503 {code:'kill_switch'}; per-user kill = revoke the user's tokens.
--    (platform_settings already exists; no new table.)
-- insert into public.platform_settings(key, value) values ('ext_kill_switch', 'false'::jsonb) on conflict do nothing;

-- 5) Server-side "cited only" rule for full text: the ext article route returns the full text only when the item is in
--    a run's citations or a citations/check result of this token in the last 24h; otherwise excerpt (<=240 chars) with excerpt_only=true.
create table if not exists public.ext_cited_items (
  token_id   uuid not null references public.api_tokens(id) on delete cascade,
  item_id    text not null,
  cited_at   timestamptz not null default now(),
  primary key (token_id, item_id)
);
alter table public.ext_cited_items enable row level security;
revoke all on public.ext_cited_items from anon, authenticated;

-- 6) Daily full-read cap per token: counted from library_read_log where outcome='full' (same day), default 30; shares the
--    user's existing library quota (src/lib/library/readQuotaServer.ts), whichever is smaller wins.
