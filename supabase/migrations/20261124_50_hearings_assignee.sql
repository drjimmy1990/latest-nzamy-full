-- =============================================================================
-- Migration: 20261124_50_hearings_assignee.sql
-- =============================================================================
-- PURPOSE (owner package 13 Nov 2026, N01-18 «جلساتي تُظهر ما أُسند إليّ»)
--   Tasks have carried an assignee since 20260903_phase1 (tasks.assignee_user_id,
--   owner item 59), and «مهامي» lists owner OR assignee. Hearings had no such
--   column, so a hearing a colleague scheduled for me never reached my diary.
--
--   1. public.hearings.assignee_user_id uuid NULL
--        references auth.users(id) ON DELETE SET NULL, + a partial index.
--      Nullable: every existing row keeps meaning "the owner attends".
--
--   2. trg_hearings_assignee_member (BEFORE INSERT OR UPDATE OF
--      assignee_user_id, SECURITY DEFINER, empty search_path): a non-null
--      assignee that is being SET (insert, or an update that changes it) must
--      be the row's owner, or an ACTIVE member of the row's firm
--      (firm_members.status = 'active'). Otherwise 23514. A solo hearing
--      (firm_id null) can therefore only be "assigned" to its owner. Setting
--      it to NULL always passes (a cascade, or clearing the assignee). The
--      check runs only when the value changes, so a row whose assignee later
--      leaves the firm stays editable by its owner.
--
--   3. The Art. 18 guard's trigger on hearings (trg_00_refuse_consultant_
--      court_rows, 20261019_21) is re-created with the table's CURRENT
--      ON DELETE SET NULL pointers as its arguments — now stage_id, firm_id
--      AND assignee_user_id. Without this, deleting the account of a hearing's
--      assignee would cascade a SET NULL the guard does not recognise as a
--      cascade, and _verify (20261019_21 block) would flag the drift. Done only
--      when the guard function exists on this database.
--
-- RLS — NO NEW POLICY, ON PURPOSE
--   The brief: "an assignee who is an active member of the hearing's firm may
--   read it (and update it as the owner can)". That is EXACTLY the firm arm of
--   public.can_access_case_row(owner_user_id, firm_id), which the existing
--   "hearings readable by owner or firm" (SELECT) and "hearings updatable by
--   owner or firm" (UPDATE) policies already use; the 20261122_31 restrictive
--   policies (firm_id is the writer's firm) also hold for an active member.
--   So such an assignee already reads and updates the row, and loses both the
--   moment his membership stops being active (removed / suspended).
--   The tasks-style arm `or assignee_user_id = auth.uid()` was NOT copied: it
--   would let a solo owner (firm_id null) grant read access to ANY user id —
--   wider than the brief. The trigger in (2) makes such a row impossible to
--   write anyway. The API (/api/v1/lawyer/hearings) restricts what an
--   assignee may do (outcome actions only) and filters the diary to
--   owner OR assignee.
--
-- WHAT IT DOES NOT DO
--   * public.firm_asset_specs() is unchanged: a member's REMOVAL does not
--     rewrite hearings assigned to him (the firm owner can re-assign them);
--     his ACCOUNT deletion nulls the column through the FK.
--   * Reminders (hearing_reminder_targets, 20261025_30) still go to the owner.
--
-- HOW TO RUN — BEFORE the code deploy (the new code selects the column; on a
--   database without it every hearings read answers 500):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261124_50_hearings_assignee.sql
--   Expect: NOTICE  20261124_50 verify: OK  and a row with `t`.
--   Needs 20260903_phase1_case_tables, 20260903_phase2_clients_and_firm_membership
--   (refused below otherwise). Idempotent: safe to run twice.
--
-- RE-RUN ORDER: re-running 20261019_21_consultant_court_write_guard.sql puts
--   back its 2-argument trigger on hearings — re-run THIS file after it
--   (_verify block l3_firm and the 20261019_21 block both say so).
--
-- Docker: supabase/tests/rls/hearings_assignee.test.sql (chain in its header).
--
-- ROLLBACK (the column is data — drop it only if no row uses it):
--   drop trigger if exists trg_hearings_assignee_member on public.hearings;
--   drop function if exists public.hearing_assignee_member_check();
--   alter table public.hearings drop column if exists assignee_user_id;
--   then re-run 20261019_21_consultant_court_write_guard.sql (its 2-arg trigger).
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.hearings') is null then
    raise exception '20261124_50: public.hearings is missing — run 20260903_phase1_case_tables.sql first';
  end if;
  if to_regclass('public.firm_members') is null then
    raise exception '20261124_50: public.firm_members is missing — run 20260903_phase2_clients_and_firm_membership.sql first';
  end if;
  if to_regprocedure('public.can_access_case_row(uuid, uuid)') is null then
    raise exception '20261124_50: public.can_access_case_row is missing — run 20260903_phase1_case_tables.sql first';
  end if;
end
$pre$;

-- ── 1. the column + index ────────────────────────────────────────────────────
alter table public.hearings
  add column if not exists assignee_user_id uuid references auth.users(id) on delete set null;

comment on column public.hearings.assignee_user_id is
  'N01-18 (20261124_50): who attends this hearing for the firm, when not the owner. NULL = the owner. Must be the owner or an ACTIVE member of the row''s firm when set (trg_hearings_assignee_member). Read/update access is the existing firm arm of can_access_case_row — no assignee-only policy.';

create index if not exists idx_hearings_assignee
  on public.hearings (assignee_user_id, hearing_date)
  where assignee_user_id is not null;

-- ── 2. the assignee must be the owner or an active member of the row's firm ──
create or replace function public.hearing_assignee_member_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.assignee_user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assignee_user_id is not distinct from old.assignee_user_id then
    return new;
  end if;
  if new.assignee_user_id = new.owner_user_id then
    return new;
  end if;
  if new.firm_id is not null and exists (
       select 1 from public.firm_members m
        where m.firm_id = new.firm_id
          and m.user_id = new.assignee_user_id
          and m.status = 'active') then
    return new;
  end if;
  raise exception using
    errcode = '23514',
    message = 'المحامي المُكلَّف بالجلسة يجب أن يكون عضواً نشطاً في مكتب الجلسة.';
end
$fn$;

comment on function public.hearing_assignee_member_check() is
  'N01-18 (20261124_50): BEFORE INSERT OR UPDATE OF assignee_user_id on hearings — a non-null assignee being set must be the owner or an ACTIVE member of the row''s firm (23514). NULL always passes.';

revoke all on function public.hearing_assignee_member_check() from public;
do $grants$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.hearing_assignee_member_check() from %I', r);
    end if;
  end loop;
end
$grants$;

drop trigger if exists trg_hearings_assignee_member on public.hearings;
create trigger trg_hearings_assignee_member
  before insert or update of assignee_user_id on public.hearings
  for each row execute function public.hearing_assignee_member_check();

-- ── 3. the Art. 18 guard learns the new SET NULL pointer ─────────────────────
-- Its arguments are the table's ON DELETE SET NULL columns, read from the
-- catalog here (sorted) so this cannot drift from the FK list.
do $guard$
declare
  v_args text;
begin
  if to_regprocedure('public.refuse_consultant_court_rows()') is null then
    raise notice '20261124_50: the Art. 18 guard (20261019_21) is not on this database — nothing to re-create';
    return;
  end if;
  select pg_catalog.string_agg(pg_catalog.quote_literal(a.attname::text), ', ' order by a.attname)
    into v_args
    from pg_catalog.pg_constraint c
    cross join lateral unnest(case when coalesce(cardinality(c.confdelsetcols), 0) = 0
                                   then c.conkey else c.confdelsetcols end) k(attnum)
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.conrelid = 'public.hearings'::regclass and c.contype = 'f' and c.confdeltype = 'n';
  execute 'drop trigger if exists trg_00_refuse_consultant_court_rows on public.hearings';
  execute pg_catalog.format(
    'create trigger trg_00_refuse_consultant_court_rows before insert or update on public.hearings '
    'for each row execute function public.refuse_consultant_court_rows(%s)', coalesce(v_args, ''));
  execute 'comment on trigger trg_00_refuse_consultant_court_rows on public.hearings is '
    || pg_catalog.quote_literal('Art. 18 (20261019_21; arguments re-read by 20261124_50): a consultant''s session writes are refused; the arguments are the table''s ON DELETE SET NULL pointers (cascade nulls pass).');
end
$guard$;

-- ── 4. verify (raises → the whole file rolls back) ───────────────────────────
do $verify$
declare
  missing text := '';
  args text[];
  fks  text[];
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.hearings'::regclass and attname = 'assignee_user_id'
                    and not attisdropped and atttypid = 'uuid'::regtype and not attnotnull) then
    missing := missing || ' hearings.assignee_user_id (uuid, nullable) missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                   join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
                  where c.conrelid = 'public.hearings'::regclass and c.contype = 'f'
                    and a.attname = 'assignee_user_id'
                    and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'n') then
    missing := missing || ' hearings.assignee_user_id has no ON DELETE SET NULL key to auth.users;';
  end if;
  if to_regclass('public.idx_hearings_assignee') is null then
    missing := missing || ' idx_hearings_assignee missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
                  where t.tgrelid = 'public.hearings'::regclass and t.tgname = 'trg_hearings_assignee_member'
                    and not t.tgisinternal and t.tgenabled in ('O', 'A')
                    and t.tgfoid = 'public.hearing_assignee_member_check()'::regprocedure) then
    missing := missing || ' trg_hearings_assignee_member missing or disabled;';
  end if;
  if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid = 'public.hearing_assignee_member_check()'::regprocedure) then
    missing := missing || ' hearing_assignee_member_check is not SECURITY DEFINER (it reads firm_members past RLS);';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.hearings'::regclass) then
    missing := missing || ' RLS is off on hearings;';
  end if;
  if to_regprocedure('public.refuse_consultant_court_rows()') is not null then
    select coalesce(array_agg(x order by x), '{}') into args
      from pg_catalog.pg_trigger t,
           unnest(array_remove(string_to_array(encode(t.tgargs, 'escape'), '\000'), '')) x
     where t.tgrelid = 'public.hearings'::regclass and t.tgname = 'trg_00_refuse_consultant_court_rows';
    select coalesce(array_agg(a.attname::text order by a.attname), '{}') into fks
      from pg_catalog.pg_constraint c
      cross join lateral unnest(case when coalesce(cardinality(c.confdelsetcols), 0) = 0
                                     then c.conkey else c.confdelsetcols end) k(attnum)
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.conrelid = 'public.hearings'::regclass and c.contype = 'f' and c.confdeltype = 'n';
    if args is distinct from fks or not ('assignee_user_id' = any (args)) then
      missing := missing || pg_catalog.format(' the Art. 18 guard''s pointers %s differ from the SET NULL keys %s;', args, fks);
    end if;
  end if;

  if missing <> '' then
    raise exception '20261124_50 verify:%', missing;
  end if;
  raise notice '20261124_50 verify: OK — hearings.assignee_user_id (SET NULL), owner-or-active-member trigger, Art. 18 guard pointers in step';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261124_50 hearings.assignee_user_id + member check + Art. 18 pointers' as step,
       exists (select 1 from pg_catalog.pg_attribute
                where attrelid = 'public.hearings'::regclass and attname = 'assignee_user_id' and not attisdropped)
       and exists (select 1 from pg_catalog.pg_trigger
                    where tgrelid = 'public.hearings'::regclass and tgname = 'trg_hearings_assignee_member')
       as ok;
