-- 20261022_34_points_admin_adjustment_reason.sql — Moyasar payments B1, Tasks 8+9 fix round 1.
--
-- WHY
--   20261022_33's adjust_admin_points passed 'admin_adjustment' as
--   debit_points' THIRD parameter, which is p_tool. debit_points always writes
--   reason 'usage', so every admin deduction landed in points_ledger as
--   reason 'usage', tool 'admin_adjustment' — an admin deduction read as if
--   the user had spent the points.
--
-- WHAT
--   * public.admin_debit_points(p_user, p_points, p_ref) — an INTERNAL helper:
--     the same nearest-expiry-first debit as debit_points (same lock order,
--     same 'insufficient_points' P0001 when short, changes nothing then), but
--     each ledger row reads reason 'admin_adjustment', tool null. No session
--     role and not service_role may EXECUTE it; only the SECURITY DEFINER
--     adjust_admin_points (same owner) calls it.
--   * public.adjust_admin_points — same signature and grants as _33; its
--     deductions now go through admin_debit_points.
--   * Backfill: the rows _33 mislabelled (reason 'usage', tool
--     'admin_adjustment') become reason 'admin_adjustment', tool null.
--   * public.debit_points is NOT changed.
--
-- Idempotent: create or replace + a backfill that matches nothing the second
-- time. Safe at any time after 20261022_33. One transaction; the verify block
-- raises (and rolls everything back) when the result is not as described.
begin;

do $$ begin
  if to_regclass('public.points_ledger') is null or to_regclass('public.points_lots') is null
     or to_regprocedure('public.debit_points(uuid,int,text,text)') is null
     or to_regprocedure('public.adjust_admin_points(uuid,int,timestamptz,text)') is null then
    raise exception '20261022_34: run 20261022_20 and 20261022_33 first';
  end if;
end $$;

create or replace function public.admin_debit_points(p_user uuid, p_points int, p_ref text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avail bigint;
  v_need  int;
  v_take  int;
  v_lot   record;
begin
  if p_user is null or p_points is null or p_points <= 0 then
    raise exception 'admin_debit_points: p_user and a positive p_points are required' using errcode = '22023';
  end if;

  -- The same lock order as debit_points: concurrent debits queue, never deadlock.
  select coalesce(sum(l.points_left), 0) into v_avail
    from (select pl.points_left
            from public.points_lots pl
           where pl.user_id = p_user and pl.expires_at > now() and pl.points_left > 0
           order by pl.expires_at, pl.created_at, pl.id
             for update) l;

  if v_avail < p_points then
    raise exception 'insufficient_points' using errcode = 'P0001',
      detail = format('available %s, requested %s', v_avail, p_points);
  end if;

  v_need := p_points;
  for v_lot in
    select pl.id, pl.points_left
      from public.points_lots pl
     where pl.user_id = p_user and pl.expires_at > now() and pl.points_left > 0
     order by pl.expires_at, pl.created_at, pl.id
       for update
  loop
    exit when v_need = 0;
    v_take := least(v_lot.points_left, v_need);
    update public.points_lots set points_left = points_left - v_take where id = v_lot.id;
    insert into public.points_ledger (user_id, lot_id, delta, reason, tool, ref)
      values (p_user, v_lot.id, -v_take, 'admin_adjustment', null, p_ref);
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    raise exception 'debit_points_invariant' using errcode = 'P0001',
      detail = format('%s of %s points not found after the lock', v_need, p_points);
  end if;

  return coalesce((select sum(l.points_left) from public.points_lots l
                    where l.user_id = p_user and l.expires_at > now()), 0)::int;
end;
$$;

comment on function public.admin_debit_points(uuid, int, text) is
  'Internal to adjust_admin_points: debits nearest-expiry first like debit_points, ledger reason admin_adjustment, tool null (20261022_34, B1). No role may EXECUTE it directly.';

create or replace function public.adjust_admin_points(p_user uuid, p_amount int, p_expires_at timestamptz, p_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare before_balance int; after_balance int;
begin
  if p_amount is null or p_amount = 0 or p_amount = -2147483648 then
    raise exception 'invalid_points_adjustment' using errcode = '22023';
  end if;
  -- Same order as debit_points: concurrent debits cannot change the locked lots.
  perform 1 from public.points_lots where user_id = p_user and expires_at > now() and points_left > 0
    order by expires_at,created_at,id for update;
  before_balance := public.points_balance(p_user);
  if p_amount > 0 then
    perform public.credit_points(p_user,p_amount,'admin',p_expires_at,null,p_ref);
  else
    -- 20261022_34: an admin deduction is reason 'admin_adjustment', not 'usage'.
    perform public.admin_debit_points(p_user,-p_amount,p_ref);
  end if;
  after_balance := public.points_balance(p_user);
  return jsonb_build_object('previous_balance',before_balance,'new_balance',after_balance);
end $$;

revoke all on function public.admin_debit_points(uuid,int,text) from public, anon, authenticated, service_role;
revoke all on function public.adjust_admin_points(uuid,int,timestamptz,text) from public, anon, authenticated;
grant execute on function public.adjust_admin_points(uuid,int,timestamptz,text) to service_role;

-- Backfill the deductions 20261022_33 recorded as usage.
update public.points_ledger
   set reason = 'admin_adjustment', tool = null
 where reason = 'usage' and tool = 'admin_adjustment';

do $$
declare role_name text; body text;
begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(role_name,'public.admin_debit_points(uuid,int,text)','EXECUTE') then
      raise exception '20261022_34: % can EXECUTE the internal admin_debit_points', role_name;
    end if;
  end loop;
  foreach role_name in array array['anon','authenticated'] loop
    if has_function_privilege(role_name,'public.adjust_admin_points(uuid,int,timestamptz,text)','EXECUTE') then
      raise exception '20261022_34: % can EXECUTE adjust_admin_points', role_name;
    end if;
  end loop;
  if not has_function_privilege('service_role','public.adjust_admin_points(uuid,int,timestamptz,text)','EXECUTE') then
    raise exception '20261022_34: service_role lost EXECUTE on adjust_admin_points';
  end if;
  if exists (select 1 from pg_proc where oid in ('public.admin_debit_points(uuid,int,text)'::regprocedure,
                                                  'public.adjust_admin_points(uuid,int,timestamptz,text)'::regprocedure)
              and not (prosecdef and proconfig @> array['search_path=""'])) then
    raise exception '20261022_34: a points function is not SECURITY DEFINER with search_path ''''';
  end if;
  select prosrc into body from pg_proc where oid = 'public.adjust_admin_points(uuid,int,timestamptz,text)'::regprocedure;
  if body not like '%public.admin_debit_points(%' or body like '%debit_points(p_user,-p_amount,''admin_adjustment''%' then
    raise exception '20261022_34: adjust_admin_points still debits through debit_points (reason usage)';
  end if;
  if exists (select 1 from public.points_ledger where reason = 'usage' and tool = 'admin_adjustment') then
    raise exception '20261022_34: admin deductions are still labelled usage after the backfill';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
