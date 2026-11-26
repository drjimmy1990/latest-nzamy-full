-- =============================================================================
-- Migration: 20261206_20_suspension_terms.sql   (batch l16, verify id: l16_suspension_terms)
-- =============================================================================
-- PURPOSE (owner decision س٢١٥, 25 Nov 2026): a flexible ADMIN suspension with
-- three ready templates (72 hours / 14 days / 7 days) or a custom end, each
-- with a written reason, an end time, an automatic lift, an audit row and a
-- right of appeal — and no open-ended suspension.
--
--   The ban itself stays in GoTrue + app_metadata (20261124_60) and the freeze
--   in public.account_suspension_freezes (20261127_60). This file only adds
--   the TERMS of a suspension and the appeals:
--
--   1. public.account_suspension_freezes gains
--        ends_at        timestamptz — when the suspension ends (the automatic
--                       lift, /api/v1/cron/suspension-lift, picks the open rows
--                       whose ends_at has passed);
--        template       '72h' | '14d' | '7d' | 'custom';
--        suspend_reason the admin's written reason (≤ 1000 characters).
--      All three are NULL on the rows written before this file (and on a
--      device-limit freeze); nothing else of the table or of
--      account_freeze_open / account_freeze_lift changes.
--   2. public.account_suspension_appeals — one row per appeal from the public
--      page /account-suspended: freeze, account, message (10..3000), status
--      'new' | 'rejected' | 'lifted' | 'ended', and the admin's decision.
--      At most one 'new' appeal per suspension. Server-only: RLS on, no
--      policy, no privilege for anon / authenticated.
--   3. Verify block — RAISES unless all of the above holds.
--
-- HOW TO RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261206_20_suspension_terms.sql
--   Expect: NOTICE  l16_suspension_terms verify: OK …  and a row with `t`.
--
-- RUN ORDER: after 20261127_60 (account_suspension_freezes). BEFORE the deploy
--   of batch l16 suspend is best; either order is safe:
--   * code first, SQL later: a suspension still bans, freezes and expires on
--     time (GoTrue ban length + app_metadata `until`); its reason and end are
--     only in the audit row, the automatic lift answers `skipped:
--     schema_missing` (the ban still ends by itself, the frozen days come back
--     on the admin's manual lift), and an appeal is refused «تعذّر الإرسال».
--   * SQL first, old code: the new columns stay NULL and the appeals table is
--     unused.
--
-- ROLLBACK (by hand):
--   begin;
--     drop table if exists public.account_suspension_appeals;
--     alter table public.account_suspension_freezes
--       drop constraint if exists account_suspension_freezes_template_check,
--       drop constraint if exists account_suspension_freezes_ends_check,
--       drop constraint if exists account_suspension_freezes_reason_len,
--       drop column if exists ends_at, drop column if exists template, drop column if exists suspend_reason;
--   commit;
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.account_suspension_freezes') is null then
    raise exception '20261206_20: public.account_suspension_freezes not found — run 20261127_60 first';
  end if;
end
$pre$;

-- ── 1. the terms of a suspension ─────────────────────────────────────────────
alter table public.account_suspension_freezes
  add column if not exists ends_at        timestamptz,
  add column if not exists template       text,
  add column if not exists suspend_reason text;

do $con$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.account_suspension_freezes'::regclass
                    and conname = 'account_suspension_freezes_template_check') then
    alter table public.account_suspension_freezes
      add constraint account_suspension_freezes_template_check
      check (template is null or template in ('72h', '14d', '7d', 'custom'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.account_suspension_freezes'::regclass
                    and conname = 'account_suspension_freezes_ends_check') then
    alter table public.account_suspension_freezes
      add constraint account_suspension_freezes_ends_check
      check (ends_at is null or ends_at > frozen_at);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.account_suspension_freezes'::regclass
                    and conname = 'account_suspension_freezes_reason_len') then
    alter table public.account_suspension_freezes
      add constraint account_suspension_freezes_reason_len
      check (suspend_reason is null or char_length(suspend_reason) <= 1000);
  end if;
end
$con$;

-- The automatic lift reads the open rows whose end has passed.
create index if not exists account_suspension_freezes_due_idx
  on public.account_suspension_freezes (ends_at)
  where lifted_at is null and ends_at is not null;

comment on column public.account_suspension_freezes.ends_at is
  'س٢١٥ (20261206_20): when the suspension ends; /api/v1/cron/suspension-lift lifts the open rows whose ends_at has passed. NULL = written before 20261206_20, or a device-limit freeze.';
comment on column public.account_suspension_freezes.template is
  'س٢١٥ (20261206_20): the template the admin chose — 72h, 14d, 7d or custom.';
comment on column public.account_suspension_freezes.suspend_reason is
  'س٢١٥ (20261206_20): the admin''s written reason, also sent to the account by e-mail.';

-- ── 2. appeals ───────────────────────────────────────────────────────────────
create table if not exists public.account_suspension_appeals (
  id            uuid primary key default gen_random_uuid(),
  freeze_id     uuid not null references public.account_suspension_freezes(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  message       text not null check (char_length(message) between 10 and 3000),
  status        text not null default 'new' check (status in ('new', 'rejected', 'lifted', 'ended')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000)
);

create unique index if not exists account_suspension_appeals_one_new
  on public.account_suspension_appeals (freeze_id) where status = 'new';
create index if not exists account_suspension_appeals_user_idx
  on public.account_suspension_appeals (user_id, created_at desc);

comment on table public.account_suspension_appeals is
  'س٢١٥ (20261206_20): appeals against an admin suspension, sent from /account-suspended. At most one new appeal per suspension. Service role only.';

alter table public.account_suspension_appeals enable row level security;
revoke all on public.account_suspension_appeals from public, anon, authenticated;
grant all on public.account_suspension_appeals to service_role;

-- ── 3. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  col text;
  r text;
  c text;
begin
  foreach col in array array['ends_at', 'template', 'suspend_reason'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'account_suspension_freezes' and column_name = col) then
      missing := missing || format(' account_suspension_freezes.%s is missing;', col);
    end if;
  end loop;
  foreach c in array array['account_suspension_freezes_template_check', 'account_suspension_freezes_ends_check',
                           'account_suspension_freezes_reason_len'] loop
    if not exists (select 1 from pg_catalog.pg_constraint
                    where conrelid = 'public.account_suspension_freezes'::regclass and conname = c) then
      missing := missing || format(' constraint %s is missing;', c);
    end if;
  end loop;

  if to_regclass('public.account_suspension_appeals') is null then
    missing := missing || ' account_suspension_appeals is missing;';
  else
    if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.account_suspension_appeals'::regclass) then
      missing := missing || ' RLS is off on account_suspension_appeals;';
    end if;
    if exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.account_suspension_appeals'::regclass) then
      missing := missing || ' account_suspension_appeals has a policy;';
    end if;
    if to_regclass('public.account_suspension_appeals_one_new') is null then
      missing := missing || ' the one-new-appeal index is missing;';
    end if;
  end if;

  foreach r in array array['anon', 'authenticated'] loop
    foreach c in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if to_regclass('public.account_suspension_appeals') is not null
         and has_table_privilege(r, 'public.account_suspension_appeals', c) then
        missing := missing || format(' %s holds %s on account_suspension_appeals;', r, c);
      end if;
      if has_table_privilege(r, 'public.account_suspension_freezes', c) then
        missing := missing || format(' %s holds %s on account_suspension_freezes;', r, c);
      end if;
    end loop;
  end loop;

  if missing <> '' then
    raise exception '20261206_20 l16_suspension_terms verify FAILED:%', missing;
  end if;
  raise notice 'l16_suspension_terms verify: OK — suspensions carry an end, a template and a reason; appeals are server-only (one new appeal per suspension); % open suspension(s) without an end (from before this file)',
    (select count(*) from public.account_suspension_freezes where lifted_at is null and ends_at is null and reason = 'admin');
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261206_20 suspension terms + appeals (service role only)' as migration, true as ok;
