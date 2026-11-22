-- DRAFT — NOT APPLIED. Review by the platform developer before use.
-- Personal access tokens (PATs) for the Nezamy Lawyer API v1 (/api/v1/ext/*).
-- Design: the token itself is shown once; only its SHA-256 is stored.

create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  token_hash    text not null unique,               -- sha256 hex of the full token
  token_prefix  text not null,                      -- first 12 chars, for display only ("nzy_pat_ab12")
  scopes        text[] not null default '{library:read,account:read}'
                check (scopes <@ array['library:read','ai:run','graph:read','account:read']),
  expires_at    timestamptz not null default (now() + interval '90 days'),
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  -- the "device" this token counts as for the library device limit
  device_hash   text generated always as ('pat:' || id::text) stored
);
create index if not exists api_tokens_user_idx on public.api_tokens(user_id) where revoked_at is null;

alter table public.api_tokens enable row level security;
-- The owner may list and revoke their own tokens; creation and lookup go through the service role.
create policy api_tokens_select_own on public.api_tokens for select using (user_id = auth.uid());
create policy api_tokens_revoke_own on public.api_tokens for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and revoked_at is not null);
-- Never expose token_hash to clients: grant column-level select only.
revoke all on public.api_tokens from anon, authenticated;
grant select (id, user_id, name, token_prefix, scopes, expires_at, revoked_at, last_used_at, created_at) on public.api_tokens to authenticated;
grant update (revoked_at) on public.api_tokens to authenticated;

-- Audit log: metadata only, never request/response bodies, never library text. Retention 90 days.
create table if not exists public.api_token_audit (
  id          bigint generated always as identity primary key,
  token_id    uuid references public.api_tokens(id) on delete set null,
  user_id     uuid,
  request_id  text not null,
  route       text not null,
  status      int  not null,
  client_ip_hash text,
  created_at  timestamptz not null default now()
);
create index if not exists api_token_audit_created_idx on public.api_token_audit(created_at);
alter table public.api_token_audit enable row level security;
revoke all on public.api_token_audit from anon, authenticated;
-- schedule: delete from public.api_token_audit where created_at < now() - interval '90 days';  (pg_cron or the existing sweeper)

-- Lookup helper: returns the live token row; touches last_used_at at most once a minute.
create or replace function public.api_token_lookup(p_hash text)
returns table(id uuid, user_id uuid, scopes text[], device_hash text)
language plpgsql security definer set search_path = public as $$
begin
  update public.api_tokens t set last_used_at = now()
   where t.token_hash = p_hash and (t.last_used_at is null or t.last_used_at < now() - interval '1 minute');
  return query
    select t.id, t.user_id, t.scopes, t.device_hash from public.api_tokens t
     where t.token_hash = p_hash and t.revoked_at is null and t.expires_at > now();
end $$;
revoke all on function public.api_token_lookup(text) from public, anon, authenticated;
grant execute on function public.api_token_lookup(text) to service_role;

-- OAuth 2.1 (phase 2, optional): clients registered dynamically (RFC 7591) and one-time PKCE codes.
create table if not exists public.oauth_clients (
  client_id     text primary key,
  client_name   text not null,
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);
create table if not exists public.oauth_codes (
  code_hash      text primary key,
  client_id      text not null references public.oauth_clients(client_id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  scopes         text[] not null,
  code_challenge text not null,              -- S256 only
  redirect_uri   text not null,
  expires_at     timestamptz not null default (now() + interval '60 seconds'),
  used_at        timestamptz
);
alter table public.oauth_clients enable row level security;
alter table public.oauth_codes   enable row level security;
revoke all on public.oauth_clients, public.oauth_codes from anon, authenticated;
-- An OAuth access token is stored as an api_tokens row (name = client_name, short expiry + refresh), so one verification path serves both.
