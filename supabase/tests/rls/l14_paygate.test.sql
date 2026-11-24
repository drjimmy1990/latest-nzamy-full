-- l14_paygate.test.sql — proves 20261204_60 (batch l14, owner package of
-- 23 Nov §٤ / §٢-٣): coupons.purpose and the 100 % ceiling (above 25 only
-- with a purpose), and the library device limit of one or two devices (the
-- admin's switch untouched). Also proves the two older files stay re-run
-- safe after it (20261108_20 no longer widens the device CHECK; 20261026_20's
-- own verify accepts a cap above 25).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261204_60
-- runs TWICE, then the two older files are re-run. From the repo root, in
-- Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l14_paygate.sql
--   sed -n '/^-- >>> verify:l14_paygate/,/^-- <<< verify:l14_paygate/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20261026_20_coupons_server_only.sql \
--     $M/20261030_80_library_read_quota.sql \
--     $M/20261031_10_library_activity_monitor.sql \
--     $M/20261108_20_library_device_limit.sql \
--     $R/prelude_l14_paygate_before.sql \
--     "$B" \
--     $M/20261204_60_l14_paygate.sql \
--     $M/20261204_60_l14_paygate.sql \
--     $R/prelude_l14_paygate_high_cap.sql \
--     $M/20261108_20_library_device_limit.sql \
--     $M/20261026_20_coupons_server_only.sql \
--     "$B" \
--     $R/l14_paygate.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL):
--   (a) the chain without the two 20261204_60 files and the high-cap prelude
--       → "T0 FAIL: …" (the first "$B" only NOTICEs "not applied yet");
--   (b) $R/prelude_l14_paygate_widen_trap.sql right before the second "$B"
--       (it puts back the 1–10 device CHECK) → the _verify block raises
--       "the library device limit is not 1–2".
--
-- Every assertion RAISES on failure.

-- T0 precondition (negative control (a) stops here)
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'coupons' and column_name = 'purpose') then
    raise exception 'T0 FAIL: coupons.purpose is missing (20261204_60 not applied)';
  end if;
end $$;

-- T1 the purpose and the ceiling
do $$
declare
  ok boolean;
begin
  -- a full-discount code with its purpose is accepted
  insert into public.coupons (code, discount_type, discount_value, min_order_amount, max_discount_pct, excluded_kinds, purpose)
  values ('L14FULL', 'percentage', 100, 1, 100, '{topup}', 'تجربة مجانية لمكتب شريك');

  -- above 25 without a purpose → refused
  begin
    insert into public.coupons (code, discount_type, discount_value, min_order_amount, max_discount_pct, excluded_kinds)
    values ('L14NOPURPOSE', 'percentage', 50, 1, 50, '{topup}');
    raise exception 'T1 FAIL: a 50 %% cap without a purpose was accepted';
  exception when check_violation then null;
  end;

  -- above 100 → refused, even with a purpose
  begin
    insert into public.coupons (code, discount_type, discount_value, min_order_amount, max_discount_pct, excluded_kinds, purpose)
    values ('L14OVER', 'percentage', 50, 1, 101, '{topup}', 'غرض واضح');
    raise exception 'T1 FAIL: a cap of 101 was accepted';
  exception when check_violation then null;
  end;

  -- a purpose of under 3 characters after trimming → refused
  begin
    insert into public.coupons (code, discount_type, discount_value, min_order_amount, max_discount_pct, excluded_kinds, purpose)
    values ('L14SHORT', 'fixed', 10, 1, 25, '{topup}', '  ab  ');
    raise exception 'T1 FAIL: a two-character purpose was accepted';
  exception when check_violation then null;
  end;

  -- a top-up is still never discounted (20261026_20 unchanged)
  begin
    insert into public.coupons (code, discount_type, discount_value, min_order_amount, max_discount_pct, excluded_kinds, purpose)
    values ('L14TOPUP', 'fixed', 10, 1, 25, '{plan}', 'غرض واضح');
    raise exception 'T1 FAIL: a coupon without topup in excluded_kinds was accepted';
  exception when check_violation then null;
  end;

  -- the code saved before (no purpose, 25 %) is still valid
  select (max_discount_pct = 25 and purpose is null) into ok from public.coupons where code = 'L14OLD';
  if not coalesce(ok, false) then
    raise exception 'T1 FAIL: the old 25 %% code changed or is gone';
  end if;
  -- the default cap is still 25 (owner ١٥٥)
  insert into public.coupons (code, discount_type, discount_value, min_order_amount, excluded_kinds, purpose)
  values ('L14DEFAULT', 'fixed', 10, 1, '{topup}', 'غرض واضح');
  select max_discount_pct = 25 into ok from public.coupons where code = 'L14DEFAULT';
  if not coalesce(ok, false) then
    raise exception 'T1 FAIL: the default cap is no longer 25';
  end if;
  -- the purpose of a code above 25 % cannot be cleared
  begin
    update public.coupons set purpose = null where code = 'L14FULL';
    raise exception 'T1 FAIL: the purpose of a 100 %% code was cleared';
  exception when check_violation then null;
  end;
end $$;

-- T2 the library device limit: one or two, the switch untouched
do $$
declare
  lim int;
  en boolean;
begin
  select device_limit, device_limit_enabled into lim, en from public.library_monitor_settings where id;
  if coalesce(lim, 0) <> 2 then
    raise exception 'T2 FAIL: the stored limit 5 was not lowered to 2 (got %)', lim;
  end if;
  if en is distinct from true then
    raise exception 'T2 FAIL: device_limit_enabled was changed by the migration (got %)', en;
  end if;
  update public.library_monitor_settings set device_limit = 1 where id;
  update public.library_monitor_settings set device_limit = 2 where id;
  begin
    update public.library_monitor_settings set device_limit = 3 where id;
    raise exception 'T2 FAIL: a limit of 3 devices was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.library_monitor_settings set device_limit = 0 where id;
    raise exception 'T2 FAIL: a limit of 0 devices was accepted';
  exception when check_violation then null;
  end;
end $$;

-- T3 coupons stays server-only: no session privilege came back
do $$
declare
  r text;
  p text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(r, 'public.coupons', p) then
        raise exception 'T3 FAIL: % holds % on public.coupons', r, p;
      end if;
    end loop;
  end loop;
end $$;

select 'l14_paygate: all assertions passed' as result;
