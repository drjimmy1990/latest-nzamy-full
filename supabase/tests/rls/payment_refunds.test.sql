-- CHAIN (Git Bash, repo root):
-- bash supabase/tests/rls/run.sh \
-- supabase/migrations/20260603_phase1_003_subscriptions_billing.sql \
-- supabase/migrations/20260627_platform_settings.sql \
-- supabase/migrations/20261019_10_library_access_grants.sql \
-- supabase/migrations/20261022_10_payments_core.sql \
-- supabase/tests/rls/prelude_points_lots_fixture.sql \
-- supabase/migrations/20261022_20_points_lots.sql \
-- supabase/migrations/20261022_30_claim_payment_order.sql \
-- supabase/tests/rls/prelude_payment_refunds.sql \
-- supabase/migrations/20261022_32_payment_refunds.sql \
-- supabase/migrations/20261022_32_payment_refunds.sql \
-- supabase/tests/rls/payment_refunds.test.sql
-- NEGATIVE: same chain without _32; T0 fails.
-- Repair a restored stray EXECUTE grant by running _32 again between runs
-- (the migration's verify rejects effective session privileges).
do $$ begin
 if to_regprocedure('public.claim_payment_refund(uuid,uuid,text)') is null then raise exception 'T0 FAIL: refund claim missing'; end if;
 if has_function_privilege('authenticated','public.claim_payment_refund(uuid,uuid,text)','EXECUTE')
    or has_function_privilege('anon','public.finish_payment_refund(uuid,text,text)','EXECUTE') then raise exception 'T1 FAIL: session can refund'; end if;
end $$;

set role authenticated;
do $$ begin
  begin
    perform public.claim_payment_refund('00000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000f001','refund');
    raise exception 'T18 FAIL: session executed refund claim';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.payment_orders (id,user_id,kind,item_id,billing,net_halalas,vat_halalas,total_halalas,vat_mode,status,live,fulfilled_at) values
 ('00000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000e001','plan','lawyer-pro','monthly',39900,5985,45885,'exclusive','paid',false,now()),
 ('00000000-0000-0000-0000-00000000fa02','00000000-0000-0000-0000-00000000e001','library','lib-q1','once',10000,1500,11500,'exclusive','paid',false,now()),
 ('00000000-0000-0000-0000-00000000fa03','00000000-0000-0000-0000-00000000e002','plan','ind-preventive','monthly',12957,1943,14900,'inclusive','paid',false,now());
insert into public.subscriptions (user_id,plan_id,tier,status,current_period_end,metadata) values
 ('00000000-0000-0000-0000-00000000e001','lawyer-pro','pro','active',now()+interval '1 month','{"order_id":"00000000-0000-0000-0000-00000000fa01"}'),
 ('00000000-0000-0000-0000-00000000e001','ind-litigation','max','active',now()+interval '1 month','{"order_id":"a-later-order"}');
insert into public.subscriptions (id,user_id,plan_id,tier,status,started_at,cancelled_at,current_period_end,metadata) values
 ('00000000-0000-0000-0000-00000000fb01','00000000-0000-0000-0000-00000000e002','ind-preventive','pro','cancelled',now()-interval '1 month',now(),now()+interval '1 month','{"order_id":"previous-paid-period"}'),
 ('00000000-0000-0000-0000-00000000fb02','00000000-0000-0000-0000-00000000e002','ind-preventive','pro','active',now(),null,now()+interval '2 months','{"order_id":"00000000-0000-0000-0000-00000000fa03","replaced_ids":["00000000-0000-0000-0000-00000000fb01"]}');
insert into public.points_lots (user_id,source,points_total,points_left,expires_at,order_id) values
 ('00000000-0000-0000-0000-00000000e001','plan_monthly',1500,1400,now()+interval '1 month','00000000-0000-0000-0000-00000000fa01');
insert into public.library_access_grants (user_id,plan_ref,source,starts_at,ends_at,order_id) values
 ('00000000-0000-0000-0000-00000000e001','lib-q1','purchase',now()-interval '1 day',now()+interval '3 months','00000000-0000-0000-0000-00000000fa02');
do $$ declare job jsonb; result jsonb; token text; n int;
begin
 begin
  perform public.claim_payment_refund('00000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000e001','refund');
  raise exception 'T2 FAIL: non-staff authorized';
 exception when insufficient_privilege then null; end;
 job := public.claim_payment_refund('00000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000f001','refund');
 token := job ->> 'token';
 if token is null then raise exception 'T3 FAIL: no claim'; end if;
 if public.claim_payment_refund('00000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000f001','refund') is not null then raise exception 'T4 FAIL: claimed twice'; end if;
 begin
  perform public.finish_payment_refund('00000000-0000-0000-0000-00000000fa01','wrong','refund');
  raise exception 'T5 FAIL: wrong token accepted';
 exception when invalid_parameter_value then null; end;
 result := public.finish_payment_refund('00000000-0000-0000-0000-00000000fa01',token,'refund');
 if result ->> 'tier' <> 'max' or (result ->> 'points_revoked')::int <> 1400 then raise exception 'T6 FAIL: reversal/tier wrong: %',result; end if;
 if (select status from public.payment_orders where id = '00000000-0000-0000-0000-00000000fa01') <> 'refunded' then raise exception 'T7 FAIL: not stamped'; end if;
 if (select status from public.subscriptions where metadata ->> 'order_id' = 'a-later-order') <> 'active' then raise exception 'T8 FAIL: later plan cancelled'; end if;
 result := public.finish_payment_refund('00000000-0000-0000-0000-00000000fa01',token,'refund');
 select count(*) into n from public.admin_audit_events;
 if n <> 1 or result ->> 'duplicate' <> 'true' then raise exception 'T9 FAIL: duplicate audit/reversal'; end if;
 job := public.claim_payment_refund('00000000-0000-0000-0000-00000000fa02','00000000-0000-0000-0000-00000000f001','void');
 perform public.finish_payment_refund('00000000-0000-0000-0000-00000000fa02',job ->> 'token','void');
 if (select ends_at from public.library_access_grants where order_id = '00000000-0000-0000-0000-00000000fa02') > now() then raise exception 'T10 FAIL: library access remains'; end if;
 job := public.claim_payment_refund('00000000-0000-0000-0000-00000000fa03','00000000-0000-0000-0000-00000000f001','refund');
 perform public.finish_payment_refund('00000000-0000-0000-0000-00000000fa03',job ->> 'token','refund');
 if (select status from public.subscriptions where id = '00000000-0000-0000-0000-00000000fb01') <> 'active' then raise exception 'T11 FAIL: previous paid period lost'; end if;
 raise notice 'payment_refunds: T0-T11 PASS';
end $$;

insert into public.payment_orders (id,user_id,kind,item_id,billing,net_halalas,vat_halalas,total_halalas,vat_mode,status,live,fulfilled_at) values
 ('00000000-0000-0000-0000-00000000fa04','00000000-0000-0000-0000-00000000e001','topup','topup-100','once',10000,1500,11500,'exclusive','paid',false,now());
insert into public.points_lots (user_id,source,points_total,points_left,expires_at,order_id) values
 ('00000000-0000-0000-0000-00000000e001','purchase',100,70,now()+interval '1 month','00000000-0000-0000-0000-00000000fa04');
-- A deliberate audit error must roll back the entitlement reversal and stamp.
alter table public.admin_audit_events add constraint test_refund_audit_failure check (action <> 'payment_refunded') not valid;
do $$ declare job jsonb; replacement jsonb; begin
  begin
    perform public.finish_payment_refund('00000000-0000-0000-0000-00000000fa04',null,null);
    raise exception 'T12 FAIL: null claim accepted';
  exception when invalid_parameter_value then null; end;
  job := public.claim_payment_refund('00000000-0000-0000-0000-00000000fa04','00000000-0000-0000-0000-00000000f001','refund');
  if public.release_payment_refund('00000000-0000-0000-0000-00000000fa04','wrong') then raise exception 'T13 FAIL: wrong token released'; end if;
  if not public.release_payment_refund('00000000-0000-0000-0000-00000000fa04',job ->> 'token') then raise exception 'T13 FAIL: rejection not recorded'; end if;
  replacement := public.claim_payment_refund('00000000-0000-0000-0000-00000000fa04','00000000-0000-0000-0000-00000000f001','refund');
  if replacement ->> 'token' = job ->> 'token' then raise exception 'T14 FAIL: reused failed claim'; end if;
  begin
    perform public.finish_payment_refund('00000000-0000-0000-0000-00000000fa04',replacement ->> 'token','refund');
    raise exception 'T15 FAIL: audit error did not propagate';
  exception when check_violation then null; end;
  if (select status from public.payment_orders where id = '00000000-0000-0000-0000-00000000fa04') <> 'paid'
     or (select points_left from public.points_lots where order_id = '00000000-0000-0000-0000-00000000fa04') <> 70 then
    raise exception 'T16 FAIL: audit failure did not roll back';
  end if;
end $$;
alter table public.admin_audit_events drop constraint test_refund_audit_failure;
do $$ declare token text; begin
  select metadata -> 'refund_job' ->> 'token' into token from public.payment_orders where id = '00000000-0000-0000-0000-00000000fa04';
  perform public.finish_payment_refund('00000000-0000-0000-0000-00000000fa04',token,'refund');
  if (select points_left from public.points_lots where order_id = '00000000-0000-0000-0000-00000000fa04') <> 0 then raise exception 'T17 FAIL: recovery failed'; end if;
  raise notice 'payment_refunds: T12-T17 PASS';
end $$;
