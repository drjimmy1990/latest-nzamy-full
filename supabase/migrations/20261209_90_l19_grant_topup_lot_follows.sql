-- =============================================================================
-- Migration: 20261209_90_l19_grant_topup_lot_follows.sql   (verify id: l19_grant_topup_follow)
-- =============================================================================
-- PURPOSE (l19 review, access S4)
--
--   20261209_50 tops an admin / request library grantee up to 50 points with
--   ONE lot that expires with the grant (library_grant_points_topups.lot_id).
--   Revoking the grant (library_grant_revoke) or moving its end
--   (library_grant_adjust_end, both 20261030_65, on prod) moved only the
--   grant: a mistaken 3660-day grant revoked the next minute left up to 50
--   points (50 SAR) spendable for ten years, and an extension did not extend
--   the lot.
--
--   One AFTER UPDATE trigger on public.library_access_grants moves the
--   grant's top-up lot with it whenever the grant's end changes:
--     revoked (revoked_at set) → least(lot expiry, the new end)  — never later;
--     otherwise (an adjusted end, longer or shorter) → the new end.
--   Every writer is covered — the two admin functions, the founder seat's
--   revoke (20261127_10, through library_grant_revoke) and any later one —
--   without re-creating the two functions. Balances read lots with
--   expires_at > now() (points_balance, debit_points, the library gate), so
--   a lot moved to now is no longer spendable. Grants without a top-up row
--   and every other lot are untouched.
--
--   One-time sync (guarded, prints its count, 0 on a re-run): a top-up lot
--   whose grant's end already moved before this file ran is brought in line
--   by the same rule.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261209_90_l19_grant_topup_lot_follows.sql
--   Expect: NOTICE  20261209_90: … top-up lot(s) brought in line …  then
--           NOTICE  l19_grant_topup_follow verify: OK …  and a row with `t`.
--
-- RUN ORDER: AFTER 20261209_50 (before or after the deploy). Order-tolerant:
-- run before 20261209_50 the trigger is created and does nothing until the
-- top-up table exists; the sync is skipped.
-- Requires 20261019_10 (library_access_grants) and 20261022_20 (points_lots),
-- both on prod. Safe to re-run.
--
-- ROLLBACK:
--   drop trigger if exists library_grant_topup_lot_follow on public.library_access_grants;
--   drop function if exists public.library_grant_topup_lot_follow();
-- =============================================================================

begin;

set local lock_timeout = '5s';

do $pre$
begin
  if to_regclass('public.library_access_grants') is null then
    raise exception '20261209_90: public.library_access_grants does not exist — run 20261019_10 first';
  end if;
  if to_regclass('public.points_lots') is null then
    raise exception '20261209_90: public.points_lots does not exist — run 20261022_20 first';
  end if;
end
$pre$;

create or replace function public.library_grant_topup_lot_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot uuid;
begin
  -- before 20261209_50 there is no top-up to move
  if to_regclass('public.library_grant_points_topups') is null then
    return new;
  end if;
  select t.lot_id into v_lot from public.library_grant_points_topups t where t.grant_id = new.id;
  if v_lot is null then
    return new;
  end if;
  update public.points_lots pl
     set expires_at = case when new.revoked_at is not null then least(pl.expires_at, new.ends_at) else new.ends_at end
   where pl.id = v_lot
     and pl.expires_at is distinct from
         (case when new.revoked_at is not null then least(pl.expires_at, new.ends_at) else new.ends_at end);
  return new;
end;
$$;

comment on function public.library_grant_topup_lot_follow() is
  'l19 review S4 (20261209_90): moves a library grant''s top-up lot (library_grant_points_topups.lot_id) with the grant''s end — revoked: never later than the new end; adjusted: the new end. Trigger function only.';

revoke all on function public.library_grant_topup_lot_follow() from public;
do $gr$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.library_grant_topup_lot_follow() from %I', r);
    end if;
  end loop;
end
$gr$;

drop trigger if exists library_grant_topup_lot_follow on public.library_access_grants;
create trigger library_grant_topup_lot_follow
  after update of ends_at, revoked_at on public.library_access_grants
  for each row
  when (new.ends_at is distinct from old.ends_at or new.revoked_at is distinct from old.revoked_at)
  execute function public.library_grant_topup_lot_follow();

-- one-time sync: a top-up lot whose grant's end moved before this file ran
do $sync$
declare
  n int := 0;
begin
  if to_regclass('public.library_grant_points_topups') is null then
    raise notice '20261209_90: library_grant_points_topups is not there yet (20261209_50) — nothing to bring in line';
    return;
  end if;
  update public.points_lots pl
     set expires_at = case when g.revoked_at is not null then least(pl.expires_at, g.ends_at) else g.ends_at end
    from public.library_grant_points_topups t
    join public.library_access_grants g on g.id = t.grant_id
   where t.lot_id is not null
     and pl.id = t.lot_id
     and pl.expires_at is distinct from
         (case when g.revoked_at is not null then least(pl.expires_at, g.ends_at) else g.ends_at end);
  get diagnostics n = row_count;
  raise notice '20261209_90: % top-up lot(s) brought in line with their grant''s end (0 on a re-run)', n;
end
$sync$;

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  fn constant text := 'public.library_grant_topup_lot_follow()';
begin
  if to_regprocedure(fn) is null then
    missing := missing || ' the trigger function is missing;';
  elsif not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p
                       where p.oid = to_regprocedure(fn)), false) then
    missing := missing || ' the trigger function is not SECURITY DEFINER with an empty search_path;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger tg
                  where tg.tgrelid = 'public.library_access_grants'::regclass
                    and tg.tgname = 'library_grant_topup_lot_follow' and not tg.tgisinternal and tg.tgenabled <> 'D') then
    missing := missing || ' trigger library_grant_topup_lot_follow is missing or disabled;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and has_function_privilege('authenticated', fn, 'EXECUTE') then
    missing := missing || ' authenticated can execute the trigger function;';
  end if;
  if missing <> '' then
    raise exception 'l19_grant_topup_follow verify:%', missing;
  end if;
  raise notice 'l19_grant_topup_follow verify: OK — a library grant''s top-up lot follows its end (revoke: never later; adjust: the new end)';
end
$verify$;

commit;

select '20261209_90 l19 grant top-up lot follows the grant (access S4)' as migration,
       to_regprocedure('public.library_grant_topup_lot_follow()') is not null
       and exists (select 1 from pg_catalog.pg_trigger tg
                    where tg.tgrelid = 'public.library_access_grants'::regclass
                      and tg.tgname = 'library_grant_topup_lot_follow') as ok;
