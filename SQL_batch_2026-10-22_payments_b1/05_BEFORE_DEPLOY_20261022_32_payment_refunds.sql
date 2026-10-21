-- Full platform refunds: durable claim, atomic grant reversal and audit.
-- Apply after _10, _20, _30 and platform_staff/admin_audit migrations.
begin;
do $$ begin
  if to_regclass('public.platform_staff') is null or to_regclass('public.admin_audit_events') is null
     or to_regprocedure('public.revoke_lot(uuid,text)') is null then
    raise exception '20261022_32: run staff/audit and points migrations first';
  end if;
end $$;
create or replace function public.claim_payment_refund(p_order uuid, p_actor uuid, p_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.payment_orders%rowtype; job jsonb;
begin
  if not exists (select 1 from public.platform_staff s join public.profiles p on p.id = s.user_id
                 where s.user_id = p_actor and s.staff_role = 'super_admin' and p.user_type = 'admin') then
    raise exception 'refund_not_authorized' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('void','refund') then raise exception 'invalid_refund_method' using errcode = '22023'; end if;
  select * into o from public.payment_orders where id = p_order for update;
  if not found or o.status <> 'paid' or o.fulfilled_at is null or o.merchant <> 'platform' then return null; end if;
  if o.metadata ? 'refund_job' and o.metadata -> 'refund_job' ->> 'state' is distinct from 'retryable' then return null; end if;
  job := jsonb_build_object('token',gen_random_uuid(),'state','processing','method',p_method,'actor_id',p_actor,'started_at',now());
  update public.payment_orders set metadata = metadata || jsonb_build_object('refund_job',job) where id = p_order;
  return job;
end $$;

-- Called only after Moyasar returned a definite validation rejection.
-- Keep a durable failure record; a subsequent verified paid fetch may retry.
create or replace function public.release_payment_refund(p_order uuid, p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.payment_orders set metadata = jsonb_set(metadata,'{refund_job}',
    (metadata -> 'refund_job') || jsonb_build_object('state','retryable','failed_at',now()))
   where id = p_order and status = 'paid' and metadata -> 'refund_job' ->> 'token' = p_token
     and metadata -> 'refund_job' ->> 'state' = 'processing';
  return found;
end $$;

create or replace function public.finish_payment_refund(p_order uuid, p_token text, p_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.payment_orders%rowtype; lot record; purchased record; removed integer := 0; tier_now text := 'free'; now_at timestamptz := now(); job jsonb;
begin
  select * into o from public.payment_orders where id = p_order for update;
  if not found then raise exception 'refund_order_missing' using errcode = '22023'; end if;
  job := o.metadata -> 'refund_job';
  if p_token is null or p_method is null or p_method not in ('void','refund')
     or job ->> 'token' is distinct from p_token or job ->> 'method' is distinct from p_method then
    raise exception 'refund_claim_mismatch' using errcode = '22023';
  end if;
  if job ->> 'state' = 'done' then return jsonb_build_object('done',true,'duplicate',true,'tier',job ->> 'tier'); end if;
  if job ->> 'state' is distinct from 'processing' then raise exception 'refund_claim_not_processing' using errcode = '22023'; end if;
  if o.status <> 'paid' then raise exception 'refund_order_closed' using errcode = '22023'; end if;

  -- Touch only grants made for this order; never cancel a later purchase.
  if o.kind = 'plan' then
    select id,started_at,metadata into purchased from public.subscriptions
      where metadata ->> 'order_id' = o.id::text and user_id = o.user_id limit 1;
    update public.subscriptions set status = 'cancelled', cancelled_at = now_at, auto_renew = false, updated_at = now_at
     where metadata ->> 'order_id' = o.id::text and user_id = o.user_id;
    -- Restore a latest renewal's still-valid predecessors only when no newer
    -- plan runs. An admin cancellation or refunded prior period stays closed.
    if purchased.id is not null and not exists (select 1 from public.subscriptions s
       where s.user_id = o.user_id and s.status = 'active' and (s.current_period_end is null or s.current_period_end > now_at)) then
      update public.subscriptions s set status = 'active',cancelled_at = null,updated_at = now_at
       where s.user_id = o.user_id and s.id::text in
         (select jsonb_array_elements_text(coalesce(purchased.metadata -> 'replaced_ids','[]'::jsonb)))
         and s.status = 'cancelled' and s.cancelled_at = purchased.started_at
         and (s.current_period_end is null or s.current_period_end > now_at)
         and not exists (select 1 from public.payment_orders previous
                         where previous.id::text = s.metadata ->> 'order_id' and previous.status in ('refunded','voided'));
    end if;
  elsif o.kind = 'library' then
    update public.library_access_grants
       set ends_at = greatest(starts_at + interval '1 second', now_at)
     where order_id = o.id and ends_at > now_at;
  end if;
  for lot in select id from public.points_lots where order_id = o.id order by id for update loop
    removed := removed + public.revoke_lot(lot.id,'refund_revoke');
  end loop;
  select s.tier into tier_now from public.subscriptions s
   where s.user_id = o.user_id and s.status = 'active' and (s.current_period_end is null or s.current_period_end > now_at)
   order by case s.tier when 'enterprise' then 6 when 'corp' then 5 when 'max' then 4 when 'pro' then 3 when 'ai' then 2 when 'shield' then 1 else 0 end desc limit 1;
  tier_now := coalesce(tier_now,'free');
  job := job || jsonb_build_object('state','done','finished_at',now_at,'tier',tier_now,'points_revoked',removed);
  update public.payment_orders
     set status = case p_method when 'void' then 'voided' else 'refunded' end,
         refunded_halalas = total_halalas, refunded_at = now_at,
         metadata = metadata || jsonb_build_object('refund_job',job)
   where id = o.id;
  -- An audit failure rolls back reversal and stamp together; retry finishes
  -- from the gateway's already-refunded state without charging/refunding again.
  insert into public.admin_audit_events (actor_id,actor_type,action,target_type,target_id,before_state,after_state,metadata)
  values ((select id from public.profiles where id = (job ->> 'actor_id')::uuid),'admin','payment_refunded','payment_order',o.id::text,
          jsonb_build_object('status',o.status),jsonb_build_object('status',case p_method when 'void' then 'voided' else 'refunded' end,'refunded_halalas',o.total_halalas),
          jsonb_build_object('method',p_method,'points_revoked',removed,'payment_id',o.moyasar_payment_id,'refund_actor_id',job ->> 'actor_id'));
  return jsonb_build_object('done',true,'duplicate',false,'tier',tier_now,'points_revoked',removed);
end $$;

revoke all on function public.claim_payment_refund(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.finish_payment_refund(uuid,text,text) from public,anon,authenticated;
revoke all on function public.release_payment_refund(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_payment_refund(uuid,uuid,text) to service_role;
grant execute on function public.finish_payment_refund(uuid,text,text) to service_role;
grant execute on function public.release_payment_refund(uuid,text) to service_role;
do $$ declare fn text; role_name text; begin
  foreach fn in array array['public.claim_payment_refund(uuid,uuid,text)','public.finish_payment_refund(uuid,text,text)','public.release_payment_refund(uuid,text)'] loop
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,fn,'EXECUTE') then raise exception '20261022_32: session privilege on %',fn; end if;
    end loop;
    if not has_function_privilege('service_role',fn,'EXECUTE') or not exists
      (select 1 from pg_proc where oid = fn::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
      raise exception '20261022_32: missing service privilege or unsafe function %',fn;
    end if;
  end loop;
end $$;
commit;
notify pgrst, 'reload schema';
