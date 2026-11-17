-- prelude_auth_sessions_live.sql — the parts of GoTrue's auth schema that
-- 20261124_60 touches, as the self-hosted stack defines them (supabase/auth
-- migrations): auth.users.banned_until, auth.sessions, auth.refresh_tokens
-- (session_id → sessions ON DELETE CASCADE, user_id varchar) and
-- auth.mfa_amr_claims (session_id → sessions ON DELETE CASCADE).
alter table auth.users add column if not exists banned_until timestamptz;

create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz,
  aal text,
  not_after timestamptz
);

create table if not exists auth.refresh_tokens (
  id bigserial primary key,
  token varchar(255),
  user_id varchar(255),
  revoked boolean,
  created_at timestamptz default now(),
  parent varchar(255),
  session_id uuid references auth.sessions(id) on delete cascade
);

create table if not exists auth.mfa_amr_claims (
  id uuid primary key,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  authentication_method text not null
);
