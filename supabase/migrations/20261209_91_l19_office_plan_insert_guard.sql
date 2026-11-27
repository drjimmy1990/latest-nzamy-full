-- =============================================================================
-- Migration: 20261209_91_l19_office_plan_insert_guard.sql   (verify id: l19_office_insert_guard)
-- =============================================================================
-- PURPOSE (l19 review, access S5)
--
--   Owner ق٢٦-٤ / ق٢٦-٥ (batch l19): the paid «إدارة المكتب» writes are refused
--   to an account on the free side — at the API (officePlanRefusal,
--   src/lib/auth/assertOfficePlan.ts, 36 write handlers). A signed-in session
--   also holds INSERT on public.time_entries, public.lawyer_expenses and
--   public.client_trust_ledger (20261126_40, column grants + RLS) and an
--   INSERT policy on public.contracts (20260905_phase3), so the same free
--   account could add rows straight through PostgREST with its own token and
--   skip the route's check.
--
--   One BEFORE INSERT trigger on each of the four tables asks the same
--   question the routes ask — public.office_features_locked(auth.uid())
--   (20261206_70; the routes call my_office_features_locked(), which is that
--   function on auth.uid()) — and refuses the row with
--   «office_plan_required» (errcode 42501, PostgREST → 403):
--     * a session (auth.uid() set) on the free side → refused;
--     * a paying lawyer, a founder, a paid firm's member, an admin, a demo
--       account, a client / company (not professional) → passes, exactly as
--       office_features_locked answers for the routes;
--     * the service role / no session (auth.uid() NULL) → passes (the
--       server's own writes, crons, migrations).
--   The four routes (POST lawyer/time-entries, lawyer/expenses, lawyer/trust,
--   lawyer/contracts) gate every insert with no exemption, so the trigger has
--   none either. INSERT only, as briefed: no grant or policy changes, nothing
--   already stored is touched, reads stay open.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261209_91_l19_office_plan_insert_guard.sql
--   Expect: NOTICE  20261209_91: the office-plan insert guard is on 4 table(s) …
--           NOTICE  l19_office_insert_guard verify: OK …  and a row with `t`.
--   Rows changed: none.
--
-- RUN ORDER: AFTER THE DEPLOY of the l19 code. The four routes' office gate
-- is new in this batch (origin/main's routes do not call officePlanRefusal):
-- run before the deploy, the old code would meet a raw 42501 from the
-- trigger instead of its own Arabic refusal. After the deploy the routes
-- refuse the same accounts first and the trigger closes the direct path.
-- Requires 20261206_70 (on prod). A table that does not exist is skipped
-- (order-tolerant); safe to re-run.
--
-- ROLLBACK:
--   drop trigger if exists trg_office_plan_insert_guard on public.time_entries;
--   drop trigger if exists trg_office_plan_insert_guard on public.lawyer_expenses;
--   drop trigger if exists trg_office_plan_insert_guard on public.client_trust_ledger;
--   drop trigger if exists trg_office_plan_insert_guard on public.contracts;
--   drop function if exists public.office_plan_insert_guard();
-- =============================================================================

begin;

set local lock_timeout = '5s';

do $pre$
begin
  if to_regprocedure('public.office_features_locked(uuid)') is null then
    raise exception '20261209_91: public.office_features_locked(uuid) does not exist — run 20261206_70 first';
  end if;
end
$pre$;

create or replace function public.office_plan_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- the service role (no session): the server's own writes
  if v_uid is null then
    return new;
  end if;
  if public.office_features_locked(v_uid) then
    raise exception 'office_plan_required'
      using errcode = '42501',
            detail = pg_catalog.format('%s: a «إدارة المكتب» write on the free side', tg_table_name),
            hint = 'The account needs the office plan (owner ق٢٦-٥).';
  end if;
  return new;
end;
$$;

comment on function public.office_plan_insert_guard() is
  'l19 review S5 (20261209_91): BEFORE INSERT on time_entries / lawyer_expenses / client_trust_ledger / contracts — a session on the free side (office_features_locked(auth.uid())) is refused with office_plan_required (42501); the service role and every account the routes let through pass. Trigger function only.';

revoke all on function public.office_plan_insert_guard() from public;
do $gr$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.office_plan_insert_guard() from %I', r);
    end if;
  end loop;
end
$gr$;

do $trg$
declare
  t text;
  n int := 0;
begin
  foreach t in array array['time_entries', 'lawyer_expenses', 'client_trust_ledger', 'contracts'] loop
    if to_regclass('public.' || t) is null then
      raise notice '20261209_91: public.% does not exist — skipped', t;
      continue;
    end if;
    execute pg_catalog.format('drop trigger if exists trg_office_plan_insert_guard on public.%I', t);
    execute pg_catalog.format(
      'create trigger trg_office_plan_insert_guard before insert on public.%I for each row execute function public.office_plan_insert_guard()', t);
    n := n + 1;
  end loop;
  raise notice '20261209_91: the office-plan insert guard is on % table(s) (time_entries, lawyer_expenses, client_trust_ledger, contracts)', n;
end
$trg$;

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  fn constant text := 'public.office_plan_insert_guard()';
  t text;
begin
  if to_regprocedure(fn) is null then
    missing := missing || ' the guard function is missing;';
  else
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p
                      where p.oid = to_regprocedure(fn)), false) then
      missing := missing || ' the guard function is not SECURITY DEFINER with an empty search_path;';
    end if;
    if position('office_features_locked(v_uid)' in pg_catalog.pg_get_functiondef(to_regprocedure(fn))) = 0 then
      missing := missing || ' the guard does not ask office_features_locked;';
    end if;
  end if;
  foreach t in array array['time_entries', 'lawyer_expenses', 'client_trust_ledger', 'contracts'] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_catalog.pg_trigger tg
                        where tg.tgrelid = to_regclass('public.' || t)
                          and tg.tgname = 'trg_office_plan_insert_guard' and not tg.tgisinternal and tg.tgenabled <> 'D') then
      missing := missing || pg_catalog.format(' public.%s has no office-plan insert guard;', t);
    end if;
  end loop;
  if missing <> '' then
    raise exception 'l19_office_insert_guard verify:%', missing;
  end if;
  raise notice 'l19_office_insert_guard verify: OK — a free-side session cannot insert into time_entries / lawyer_expenses / client_trust_ledger / contracts directly; the service role and paid accounts pass';
end
$verify$;

commit;

select '20261209_91 l19 office-plan insert guard (access S5)' as migration,
       to_regprocedure('public.office_plan_insert_guard()') is not null as ok;
