-- Admin adjustments and directory balances use the authoritative points lots.
-- Apply after 20261022_20. One transaction returns actual balances or rolls back.
begin;
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
    perform public.debit_points(p_user,-p_amount,'admin_adjustment',p_ref);
  end if;
  after_balance := public.points_balance(p_user);
  return jsonb_build_object('previous_balance',before_balance,'new_balance',after_balance);
end $$;

create or replace function public.admin_points_balances(p_users uuid[])
returns table(user_id uuid,balance int) language sql security definer set search_path = '' as $$
  select u.id,coalesce(sum(l.points_left),0)::int from unnest(p_users) u(id)
  left join public.points_lots l on l.user_id = u.id and l.expires_at > now()
  group by u.id;
$$;

revoke all on function public.adjust_admin_points(uuid,int,timestamptz,text) from public,anon,authenticated;
revoke all on function public.admin_points_balances(uuid[]) from public,anon,authenticated;
grant execute on function public.adjust_admin_points(uuid,int,timestamptz,text),public.admin_points_balances(uuid[]) to service_role;
do $$ declare fn text; role_name text; begin
  foreach fn in array array['public.adjust_admin_points(uuid,int,timestamptz,text)','public.admin_points_balances(uuid[])'] loop
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,fn,'EXECUTE') then raise exception '20261022_33: session privilege on %',fn; end if;
    end loop;
    if not has_function_privilege('service_role',fn,'EXECUTE') or not exists
      (select 1 from pg_proc where oid = fn::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
      raise exception '20261022_33: missing service privilege or unsafe function %',fn;
    end if;
  end loop;
end $$;
commit;
notify pgrst, 'reload schema';
