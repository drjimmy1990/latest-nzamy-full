-- prelude_account_deletion_requests_stub.sql — the columns and status CHECK of
-- public.account_deletion_requests (20261026_70, already on production), for a chain
-- that reads the table and does not need that migration's long chain of its own.
-- Used by letterhead_verify_card.test.sql (20261103_69).
create table if not exists public.account_deletion_requests (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  status             text not null default 'requested',
  requested_at       timestamptz not null default now(),
  purge_after        timestamptz not null default (now() + interval '60 days'),
  requested_by       text not null default 'self',
  requested_by_user  uuid,
  reason             text,
  cancelled_at       timestamptz,
  cancelled_by       uuid,
  purge_started_at   timestamptz,
  purged_at          timestamptz,
  purge_report       jsonb not null default '{}'::jsonb,
  last_error         text,
  prior_listing      jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint account_deletion_requests_status_check
    check (status in ('requested', 'purging', 'blocked', 'cancelled', 'purged'))
);
