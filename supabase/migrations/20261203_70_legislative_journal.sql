-- =============================================================================
-- Migration: 20261203_70_legislative_journal.sql
-- =============================================================================
-- PURPOSE (batch l13-journal; owner Q190–Q195, answers of 22 Nov 2026)
--   Phase 1 of «المجلة التشريعية»: entries typed in by an admin (Q195: manual
--   entry first), approved by an admin («محامي المنصة» is not named yet, Q194),
--   a monthly issue built on the 1st of each Gregorian month from the approved
--   entries (Q192), approved by an admin before it is sent, and e-mailed to the
--   registered accounts that turned on «النشرة» in their settings (Q191 أ).
--   Everything sits behind the server switch `legislative_journal_enabled`
--   (platform_settings.feature_flags, default OFF — src/lib/featureFlags), so
--   this file needs no settings row.
--
-- WHAT IT CREATES (idempotent — safe to run any number of times)
--   public.journal_entries        one news item: title, published_on (the
--                                 legislation's date), issuing body, source
--                                 link, impact lines, badge «معدّل» /
--                                 «سريان وشيك», effective_on, status
--                                 draft | approved (+ who / when).
--   public.journal_issues         one issue per month (period_month = the 1st
--                                 of the month it covers, UNIQUE): status
--                                 draft → approved → sending → sent. An issue
--                                 that is not a draft MUST carry approved_at +
--                                 approved_by (CHECK): nothing is sent without
--                                 an admin's approval.
--   public.journal_issue_entries  which entries an issue carries (an entry is
--                                 in at most ONE issue: UNIQUE entry_id).
--   public.journal_issue_sends    one row per (issue, recipient): the e-mail
--                                 goes out once; status sending | sent |
--                                 failed | sunk, a short error code only
--                                 (never a body or an address).
--
-- WHO SEES WHAT (Q190 ب)
--   No visitor and no subscriber reads these tables: anon and authenticated
--   hold no privilege on the rows except what the admin policies need. The
--   public page and the PDF read them with the service role on the server and
--   shape each item for the viewer (visitor: title + date; library subscriber:
--   badge + effective date + impact as well).
--   Admins (public.is_admin()) may read and write entries, issues and the
--   issue↔entry links through RLS (defence in depth: the admin routes use the
--   service role after requireStaff). The send log is readable by admins and
--   written by the service role only.
--
-- HOW TO RUN (any time — before or after the deploy):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261203_70_legislative_journal.sql
--   Expect: NOTICE  l13_journal verify: OK  and a row with `t`.
--
-- RUN ORDER: independent of the deploy. Code first: the admin page says the
--   tables are missing, /journal shows «قيد التفعيل», the cron answers
--   {skipped: "schema_missing"}. SQL first: nothing reads the tables yet.
--
-- Docker: supabase/tests/rls/legislative_journal.test.sql (chain in its header).
--
-- ROLLBACK (drops every entry and issue):
--   begin;
--   drop table if exists public.journal_issue_sends;
--   drop table if exists public.journal_issue_entries;
--   drop table if exists public.journal_issues;
--   drop table if exists public.journal_entries;
--   drop function if exists public.journal_touch_updated_at();
--   commit;
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception '20261203_70: public.is_admin() is missing';
  end if;
end $$;

-- ── 1. updated_at stamp (own function: no dependency on handle_updated_at) ──
create or replace function public.journal_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.journal_touch_updated_at() from public, anon, authenticated;

-- ── 2. entries ───────────────────────────────────────────────────────────────
create table if not exists public.journal_entries (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null check (char_length(btrim(title)) between 3 and 300),
  published_on  date        not null,
  issuing_body  text        check (issuing_body is null or char_length(issuing_body) <= 200),
  source_url    text        check (source_url is null or (char_length(source_url) <= 1000 and source_url ~ '^https?://[^[:space:]]+$')),
  impact_lines  text[]      not null default '{}'::text[]
                  check (cardinality(impact_lines) <= 10
                         and char_length(array_to_string(impact_lines, '')) <= 5000),
  badge         text        check (badge is null or badge in ('amended', 'imminent_effect')),
  effective_on  date,
  status        text        not null default 'draft' check (status in ('draft', 'approved')),
  approved_by   uuid        references auth.users(id) on delete set null,
  approved_at   timestamptz,
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint journal_entries_approved_stamp check (status = 'draft' or approved_at is not null)
);

comment on table public.journal_entries is
  '20261203_70 (owner Q190–Q195): «المجلة التشريعية» entries, typed in and approved by an admin. Read by the server only (the public page shapes each item per viewer); admins via RLS.';

create index if not exists journal_entries_status_date_idx
  on public.journal_entries (status, published_on desc);

drop trigger if exists trg_journal_entries_updated_at on public.journal_entries;
create trigger trg_journal_entries_updated_at
  before update on public.journal_entries
  for each row execute function public.journal_touch_updated_at();

-- ── 3. issues ────────────────────────────────────────────────────────────────
create table if not exists public.journal_issues (
  id               uuid        primary key default gen_random_uuid(),
  period_month     date        not null unique check (extract(day from period_month) = 1),
  title            text        not null check (char_length(btrim(title)) between 3 and 200),
  status           text        not null default 'draft'
                     check (status in ('draft', 'approved', 'sending', 'sent')),
  built_at         timestamptz not null default now(),
  built_by         uuid        references auth.users(id) on delete set null,
  approved_by      uuid        references auth.users(id) on delete set null,
  approved_at      timestamptz,
  send_started_at  timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Nothing leaves the draft state without an admin's approval on record.
  constraint journal_issues_approved_stamp check (status = 'draft' or approved_at is not null),
  constraint journal_issues_sent_stamp check (status <> 'sent' or sent_at is not null)
);

comment on table public.journal_issues is
  '20261203_70 (owner Q192): one monthly issue per Gregorian month (period_month = its 1st). draft → approved (by an admin) → sending → sent.';

drop trigger if exists trg_journal_issues_updated_at on public.journal_issues;
create trigger trg_journal_issues_updated_at
  before update on public.journal_issues
  for each row execute function public.journal_touch_updated_at();

-- ── 4. issue ↔ entries ───────────────────────────────────────────────────────
create table if not exists public.journal_issue_entries (
  issue_id  uuid     not null references public.journal_issues(id) on delete cascade,
  entry_id  uuid     not null unique references public.journal_entries(id) on delete restrict,
  position  smallint not null default 0 check (position between 0 and 1000),
  primary key (issue_id, entry_id)
);

comment on table public.journal_issue_entries is
  '20261203_70: the entries an issue carries; an entry is in at most one issue (UNIQUE entry_id). An entry in an issue cannot be deleted (ON DELETE RESTRICT).';

-- ── 5. send log ──────────────────────────────────────────────────────────────
create table if not exists public.journal_issue_sends (
  issue_id    uuid        not null references public.journal_issues(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  status      text        not null default 'sending'
                check (status in ('sending', 'sent', 'failed', 'sunk')),
  attempts    smallint    not null default 1 check (attempts between 0 and 100),
  last_error  text        check (last_error is null or char_length(last_error) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (issue_id, user_id)
);

comment on table public.journal_issue_sends is
  '20261203_70: one row per (issue, recipient) — the issue e-mail goes out once. Written by the service role only; admins may read it.';

create index if not exists journal_issue_sends_user_idx on public.journal_issue_sends (user_id);

drop trigger if exists trg_journal_issue_sends_updated_at on public.journal_issue_sends;
create trigger trg_journal_issue_sends_updated_at
  before update on public.journal_issue_sends
  for each row execute function public.journal_touch_updated_at();

-- ── 6. RLS + privileges ──────────────────────────────────────────────────────
alter table public.journal_entries       enable row level security;
alter table public.journal_issues        enable row level security;
alter table public.journal_issue_entries enable row level security;
alter table public.journal_issue_sends   enable row level security;

-- Start from nothing (Supabase's default privileges grant anon/authenticated
-- ALL on a new public table), then give back only what the admin policies use.
revoke all on public.journal_entries       from public, anon, authenticated;
revoke all on public.journal_issues        from public, anon, authenticated;
revoke all on public.journal_issue_entries from public, anon, authenticated;
revoke all on public.journal_issue_sends   from public, anon, authenticated;

grant select, insert, update, delete on public.journal_entries       to authenticated;
grant select, insert, update, delete on public.journal_issues        to authenticated;
grant select, insert, update, delete on public.journal_issue_entries to authenticated;
grant select                         on public.journal_issue_sends   to authenticated;

grant select, insert, update, delete on public.journal_entries       to service_role;
grant select, insert, update, delete on public.journal_issues        to service_role;
grant select, insert, update, delete on public.journal_issue_entries to service_role;
grant select, insert, update, delete on public.journal_issue_sends   to service_role;

drop policy if exists journal_entries_admin_all on public.journal_entries;
create policy journal_entries_admin_all on public.journal_entries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists journal_issues_admin_all on public.journal_issues;
create policy journal_issues_admin_all on public.journal_issues
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists journal_issue_entries_admin_all on public.journal_issue_entries;
create policy journal_issue_entries_admin_all on public.journal_issue_entries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists journal_issue_sends_admin_read on public.journal_issue_sends;
create policy journal_issue_sends_admin_read on public.journal_issue_sends
  for select to authenticated
  using (public.is_admin());

-- ── 7. verify (raises → the whole file rolls back) ───────────────────────────
do $verify$
declare
  missing text := '';
  t text;
  p text;
  n int;
begin
  foreach t in array array['journal_entries', 'journal_issues', 'journal_issue_entries', 'journal_issue_sends'] loop
    if to_regclass('public.' || t) is null then
      missing := missing || format(' %s is missing;', t);
      continue;
    end if;
    if not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.' || t)), false) then
      missing := missing || format(' RLS is off on %s;', t);
    end if;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.' || t, p) then
        missing := missing || format(' anon holds %s on %s;', p, t);
      end if;
    end loop;
    if not has_table_privilege('service_role', 'public.' || t, 'INSERT') then
      missing := missing || format(' service_role cannot INSERT %s;', t);
    end if;
    -- every policy on these tables is an admin policy
    select count(*) into n from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = t
       and coalesce(qual, '') not ilike '%is_admin()%';
    if n > 0 then
      missing := missing || format(' %s has a policy that is not admin-only;', t);
    end if;
  end loop;
  foreach p in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('authenticated', 'public.journal_issue_sends', p) then
      missing := missing || format(' authenticated holds %s on journal_issue_sends;', p);
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conname = 'journal_issues_approved_stamp'
                    and conrelid = to_regclass('public.journal_issues')) then
    missing := missing || ' the issue approval CHECK is missing;';
  end if;
  if missing <> '' then
    raise exception 'l13_journal verify:%', missing;
  end if;
  raise notice 'l13_journal verify: OK — 4 journal tables, RLS on, admin-only policies, no anon privilege';
end
$verify$;

commit;

notify pgrst, 'reload schema';

-- The SQL editor hides NOTICEs — read this row: ok must be t.
select '20261203_70 legislative journal (entries, monthly issues, send log; admin-only RLS)' as migration,
       to_regclass('public.journal_entries') is not null
       and to_regclass('public.journal_issue_sends') is not null
       and coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.journal_entries')), false)
       and not has_table_privilege('anon', 'public.journal_entries', 'SELECT')
       and not has_table_privilege('authenticated', 'public.journal_issue_sends', 'INSERT')
       as ok;
