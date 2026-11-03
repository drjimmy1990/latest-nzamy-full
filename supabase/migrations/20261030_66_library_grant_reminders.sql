-- =============================================================================
-- Migration: 20261030_66_library_grant_reminders.sql
-- =============================================================================
-- PURPOSE (owner note ١٨ «مشترك المكتبة فقط», criterion C06)
--   A library-only subscriber is reminded 7 days and 3 days before his
--   library access ends. The job is POST /api/v1/cron/library-grant-reminders
--   (x-cron-secret), run by n8n. It must never send the same reminder twice,
--   even when n8n retries or two runs overlap.
--
-- WHAT IT CHANGES (idempotent — safe to run any number of times)
--   public.library_grant_reminders — ONE row per reminder sent:
--     grant_id    uuid  → library_access_grants(id) ON DELETE CASCADE
--                         the grant whose end is the END OF THE USER'S CHAIN
--                         (stacked grants run end to start; the user is
--                         reminded about the day his access really stops —
--                         libraryCoverage().lastGrantId in src/lib/libraryAccess.ts)
--     offset_days smallint CHECK (offset_days IN (7, 3))
--     user_id     uuid  (no FK: like granted_by, a row may outlive edits)
--     ends_at     timestamptz — the chain end the reminder announced
--     sent_at     timestamptz DEFAULT now()
--     PRIMARY KEY (grant_id, offset_days)
--   The job INSERTs the marker first (ON CONFLICT DO NOTHING) and sends the
--   in-app notice ONLY when the insert created the row — the primary key is
--   the idempotency. A user who renews before the reminder moves his chain
--   end to the NEW grant, so the new grant gets its own 7/3-day reminders.
--
--   Service role only: RLS on, no policy, nothing for anon / authenticated /
--   PUBLIC (the route uses the service client).
--
-- PREREQUISITES: 20261019_10 (library_access_grants) and 20261030_65
--   (revoked_at — the job skips revoked grants). Raised, not guessed.
--
-- ORDER vs DEPLOY: any time. Before this file runs the job answers 200
--   {skipped: "schema_missing"} and sends NOTHING (no marker → no notice).
--
-- ROLLBACK (only if no reminders should be kept):
--   begin;
--   drop table if exists public.library_grant_reminders;
--   commit;
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.library_access_grants') is null then
    raise exception '20261030_66 needs public.library_access_grants (20261019_10) first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'library_access_grants'
                    and column_name = 'revoked_at') then
    raise exception '20261030_66 needs library_access_grants.revoked_at (20261030_65) first';
  end if;
end $$;

create table if not exists public.library_grant_reminders (
  grant_id    uuid        not null references public.library_access_grants(id) on delete cascade,
  offset_days smallint    not null check (offset_days in (7, 3)),
  user_id     uuid        not null,
  ends_at     timestamptz not null,
  sent_at     timestamptz not null default now(),
  primary key (grant_id, offset_days)
);

comment on table public.library_grant_reminders is
  'One row per library-subscription reminder sent (owner note ١٨ C06): 7 and 3 days before the end of the user''s chain of grants. The primary key makes the cron job idempotent. Service role only.';

create index if not exists library_grant_reminders_user_idx
  on public.library_grant_reminders (user_id, sent_at desc);

alter table public.library_grant_reminders enable row level security;
revoke all on public.library_grant_reminders from public, anon, authenticated;
grant select, insert, update, delete on public.library_grant_reminders to service_role;

-- ── Verify (raises — a half-applied file is never silent) ────────────────────
do $$
declare
  missing text := '';
  r text;
  p text;
begin
  if to_regclass('public.library_grant_reminders') is null then
    raise exception '20261030_66 verify: library_grant_reminders is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.library_grant_reminders'::regclass) then
    missing := missing || ' RLS is off;';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'library_grant_reminders') then
    missing := missing || ' a policy exists (the table is service role only);';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.library_grant_reminders'::regclass and contype = 'p'
       and pg_get_constraintdef(oid) ilike '%grant_id%offset_days%') then
    missing := missing || ' the (grant_id, offset_days) primary key is missing;';
  end if;
  foreach r in array array['anon', 'authenticated', 'public'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(r, 'public.library_grant_reminders', p) then
        missing := missing || format(' %s holds %s;', r, p);
      end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role', 'public.library_grant_reminders', 'INSERT') then
    missing := missing || ' service_role cannot INSERT;';
  end if;
  if missing <> '' then
    raise exception '20261030_66 verify:%', missing;
  end if;
  raise notice '20261030_66 verify: OK — library_grant_reminders (PK grant_id+offset_days, service role only)';
end $$;

commit;

notify pgrst, 'reload schema';

-- ── Check (the SQL editor hides NOTICEs — run this and read the row) ─────────
-- Expected: one row, every column true.
select
  to_regclass('public.library_grant_reminders') is not null                             as reminders_table,
  (select relrowsecurity from pg_class where oid = to_regclass('public.library_grant_reminders')) as rls_on,
  not has_table_privilege('authenticated', 'public.library_grant_reminders', 'SELECT')  as hidden_from_users,
  has_table_privilege('service_role', 'public.library_grant_reminders', 'INSERT')       as server_can_write;
