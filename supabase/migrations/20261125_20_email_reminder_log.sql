-- =============================================================================
-- Migration: 20261125_20_email_reminder_log.sql
-- =============================================================================
-- PURPOSE (owner TODO F1 / N01-16 / N05-L14 — reminders by e-mail)
--   Three daily jobs now e-mail reminders through Resend
--   (src/lib/email/sendEmail.ts):
--     hearing_1d            the day before a scheduled hearing — to its owner
--                           and to its assignee (hearings.assignee_user_id,
--                           20261124_50) while he is still an active member
--                           of the hearing's firm;   POST /api/v1/cron/hearing-reminders
--     poa_30d / poa_7d      a power of attorney (contracts.contract_type =
--                           'power_of_attorney') whose ends_on is 30 / 7 days
--                           away — to the contract owner; POST /api/v1/cron/poa-reminders
--     library_7d / library_3d  the library-only subscription ends in 7 / 3
--                           days — to the subscriber;  POST /api/v1/cron/library-grant-reminders
--   Each must reach each recipient ONCE, even when n8n retries or two runs
--   overlap. No existing table keys all three: notification_outbox's once-only
--   keys need a deadline_id or a hearing_id (a row with neither never
--   conflicts), contract ids are text, and its pending hearing rows are
--   delivered by the in-app step of /api/v1/cron/deadlines, which would mark
--   an e-mail row failed. library_grant_reminders (20261030_66) is the in-app
--   marker; the e-mail keeps its own so a failed or not-yet-configured e-mail
--   does not use the in-app notice up, nor the other way round.
--
-- WHAT IT CHANGES (idempotent — safe to run any number of times)
--   public.email_reminder_log — ONE row per (reminder, recipient):
--     kind               text  CHECK in the five kinds above
--     subject_id         text  the hearing id / contract id / chain-end grant id
--     due_on             date  the day the reminder is about (hearing_date,
--                              ends_on, the chain end's Riyadh day). In the
--                              key: a re-dated hearing or a renewed power of
--                              attorney is a new reminder.
--     recipient_user_id  uuid  → auth.users ON DELETE CASCADE
--     status             'sending' | 'sent' | 'failed'
--     attempts, last_error (a short code, never a body or an address),
--     created_at, updated_at
--     PRIMARY KEY (kind, subject_id, recipient_user_id, due_on)
--   The job INSERTs the row first (ON CONFLICT DO NOTHING) and sends only
--   when the insert created it. A 'failed' row is claimed again (status
--   'failed' → 'sending', attempts + 1) up to 3 attempts; a 'sending' row left
--   by a crash is never re-sent (a missed e-mail beats a double one).
--   Service role only: RLS on, no policy, nothing for anon / authenticated /
--   PUBLIC (the cron routes use the service client).
--
-- HOW TO RUN (any time — before or after the deploy):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261125_20_email_reminder_log.sql
--   Expect: NOTICE  20261125_20 verify: OK  and a row with `t`.
--
-- RUN ORDER: independent of the deploy. Before this file runs, the three jobs
--   answer 200 with email {skipped: "schema_missing"} and send NO e-mail
--   (the library job still sends its in-app notices). Without RESEND_API_KEY +
--   EMAIL_FROM they answer email {skipped: "email_unavailable"} and write
--   nothing here.
--
-- Docker: supabase/tests/rls/email_reminder_log.test.sql (chain in its header).
--
-- ROLLBACK (the rows are only a send log):
--   begin; drop table if exists public.email_reminder_log; commit;
-- =============================================================================

begin;
set local lock_timeout = '10s';

create table if not exists public.email_reminder_log (
  kind              text        not null
                      check (kind in ('hearing_1d', 'poa_30d', 'poa_7d', 'library_7d', 'library_3d')),
  subject_id        text        not null check (char_length(subject_id) between 1 and 200),
  due_on            date        not null,
  recipient_user_id uuid        not null references auth.users(id) on delete cascade,
  status            text        not null default 'sending'
                      check (status in ('sending', 'sent', 'failed')),
  attempts          smallint    not null default 1 check (attempts between 0 and 100),
  last_error        text        check (last_error is null or char_length(last_error) <= 200),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (kind, subject_id, recipient_user_id, due_on)
);

comment on table public.email_reminder_log is
  '20261125_20: one row per reminder e-mail (hearing_1d, poa_30d/7d, library_7d/3d) and recipient. The primary key makes the daily cron jobs idempotent; a failed row is retried up to 3 attempts. Service role only.';

create index if not exists email_reminder_log_recipient_idx
  on public.email_reminder_log (recipient_user_id);

alter table public.email_reminder_log enable row level security;
revoke all on public.email_reminder_log from public, anon, authenticated;
grant select, insert, update, delete on public.email_reminder_log to service_role;

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  missing text := '';
  r text;
  p text;
begin
  if to_regclass('public.email_reminder_log') is null then
    raise exception '20261125_20 verify: email_reminder_log is missing';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.email_reminder_log'::regclass) then
    missing := missing || ' RLS is off;';
  end if;
  if exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'email_reminder_log') then
    missing := missing || ' a policy exists (the table is service role only);';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.email_reminder_log'::regclass and contype = 'p'
       and pg_catalog.pg_get_constraintdef(oid) ilike '%kind, subject_id, recipient_user_id, due_on%') then
    missing := missing || ' the (kind, subject_id, recipient_user_id, due_on) primary key is missing;';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.email_reminder_log'::regclass and contype = 'f'
       and confrelid = 'auth.users'::regclass and confdeltype = 'c') then
    missing := missing || ' recipient_user_id has no ON DELETE CASCADE key to auth.users;';
  end if;
  foreach r in array array['anon', 'authenticated', 'public'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(r, 'public.email_reminder_log', p) then
        missing := missing || format(' %s holds %s;', r, p);
      end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role', 'public.email_reminder_log', 'INSERT')
     or not has_table_privilege('service_role', 'public.email_reminder_log', 'UPDATE') then
    missing := missing || ' service_role cannot INSERT/UPDATE;';
  end if;
  if missing <> '' then
    raise exception '20261125_20 verify:%', missing;
  end if;
  raise notice '20261125_20 verify: OK — email_reminder_log (PK kind+subject+recipient+due_on, service role only)';
end
$verify$;

commit;

notify pgrst, 'reload schema';

-- The SQL editor hides NOTICEs — read this row: ok must be t.
select '20261125_20 email_reminder_log (service role only, once per reminder and recipient)' as step,
       to_regclass('public.email_reminder_log') is not null
       and coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.email_reminder_log')), false)
       and not has_table_privilege('authenticated', 'public.email_reminder_log', 'SELECT')
       and not has_table_privilege('anon', 'public.email_reminder_log', 'SELECT')
       and has_table_privilege('service_role', 'public.email_reminder_log', 'INSERT')
       as ok;
