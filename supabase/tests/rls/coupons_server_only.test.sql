-- coupons_server_only.test.sql — proves 20261026_20 (owner answers of 25 Oct,
-- P7: coupons checked on the server only; pricing doc §13أ) and its _verify
-- section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE, with the old open policies, grants and loosened rules put back
-- between the runs; the second run must repair them. The _verify section is
-- extracted from _verify.sql between its markers and runs before the
-- migration (it must only NOTICE "not applied yet") and after the second run
-- (it must pass). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_coupons_block.sql
--   sed -n '/^-- >>> verify:coupons_server_only/,/^-- <<< verify:coupons_server_only/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $R/prelude_coupons_server_only_before.sql \
--     "$B" \
--     $M/20261026_20_coupons_server_only.sql \
--     $R/prelude_coupons_server_only_between_runs.sql \
--     $M/20261026_20_coupons_server_only.sql \
--     "$B" \
--     $R/coupons_server_only.test.sql
-- Why each link: 20260603_phase1_003 creates coupons / coupon_usage with the
-- open policies and seeds NZAMY50 / NEWCLIENT / LAUNCH2026 with the old
-- values; the "before" prelude proves the gap (B1 anon lists the codes, B2 a
-- session writes its own usage row) and leaves one redemption to keep.
--
-- NEGATIVE CONTROLS (each must FAIL):
--   (a) the chain without the two 20261026_20 files, the between-runs prelude
--       and the second "$B" → "T1 FAIL: …";
--   (b) $R/prelude_coupons_server_only_duplicate_trap.sql right before the
--       first 20261026_20 → the migration raises "20261026_20: coupon_usage
--       holds more than one row for: …" (nothing changed);
--   (c) the chain cut after prelude_coupons_server_only_between_runs.sql, then
--       "$B" → the _verify block raises "… has a policy again; …".
--
-- Every assertion RAISES on failure.

-- T1 RLS on, no policy, no session privilege on either table (negative control (a) stops here)
do $$
declare t text; r text; p text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'coupons' and column_name = 'max_discount_pct') then
    raise exception 'T1 FAIL: coupons.max_discount_pct is missing (20261026_20 not applied?)';
  end if;
  foreach t in array array['public.coupons', 'public.coupon_usage'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'T1 FAIL: % has RLS off', t;
    end if;
    if exists (select 1 from pg_policy where polrelid = t::regclass) then
      raise exception 'T1 FAIL: % still has a policy (the second run did not drop the restored ones)', t;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, t, p) then
          raise exception 'T1 FAIL: % holds % on %', r, p, t;
        end if;
      end loop;
    end loop;
    if not has_table_privilege('service_role', t, 'SELECT, INSERT, UPDATE, DELETE') then
      raise exception 'T1 FAIL: service_role cannot use %', t;
    end if;
  end loop;
  if has_sequence_privilege('authenticated', pg_get_serial_sequence('public.coupon_usage', 'id'), 'USAGE') then
    raise exception 'T1 FAIL: authenticated can still use the coupon_usage id sequence';
  end if;
  raise notice 'T1 PASS: coupons / coupon_usage — RLS on, no policy, nothing for anon / authenticated, service_role reads and writes';
end $$;

-- T2 a visitor cannot read the codes
set role anon;
do $$
begin
  perform 1 from public.coupons;
  raise exception 'T2 FAIL: anon read public.coupons';
exception when insufficient_privilege then
  raise notice 'T2 PASS: anon is refused on coupons (permission denied)';
end $$;
reset role;

-- T3 a signed-in session can neither read the codes nor write a redemption
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c2', false);
set role authenticated;
do $$
begin
  perform 1 from public.coupons where code = 'NZAMY50';
  raise exception 'T3 FAIL: an authenticated session read public.coupons';
exception when insufficient_privilege then
  raise notice 'T3 PASS (a): an authenticated session is refused on coupons';
end $$;
do $$
begin
  insert into public.coupon_usage (coupon_id, user_id, order_id)
  values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c2', 'forged');
  raise exception 'T3 FAIL: an authenticated session inserted a coupon_usage row';
exception when insufficient_privilege then
  raise notice 'T3 PASS (b): an authenticated session cannot write coupon_usage';
end $$;
do $$
begin
  perform 1 from public.coupon_usage;
  raise exception 'T3 FAIL: an authenticated session read coupon_usage';
exception when insufficient_privilege then
  raise notice 'T3 PASS (c): an authenticated session cannot read coupon_usage';
end $$;
reset role;

-- T4 once per user, once per order (as the service role would write them)
do $$
declare
  nz uuid := (select id from public.coupons where code = 'NZAMY50');
  lc uuid := (select id from public.coupons where code = 'LAUNCH2026');
  before int := (select used_count from public.coupons where code = 'NZAMY50');
begin
  if (select count(*) from public.coupon_usage where order_id = 'kept-order') <> 1 then
    raise exception 'T4 FAIL: the redemption made before 20261026_20 is gone';
  end if;
  insert into public.coupon_usage (coupon_id, user_id, order_id, discount_applied)
  values (nz, '00000000-0000-0000-0000-0000000000c2', 'order-1', 50);
  if (select used_count from public.coupons where code = 'NZAMY50') <> before + 1 then
    raise exception 'T4 FAIL: used_count did not follow the new redemption';
  end if;
  begin
    insert into public.coupon_usage (coupon_id, user_id, order_id) values (nz, '00000000-0000-0000-0000-0000000000c2', 'order-2');
    raise exception 'T4 FAIL: the same user redeemed NZAMY50 twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.coupon_usage (coupon_id, user_id, order_id) values (lc, '00000000-0000-0000-0000-0000000000c2', 'order-1');
    raise exception 'T4 FAIL: one order recorded two coupons';
  exception when unique_violation then null;
  end;
  -- another user may still redeem it
  insert into public.coupon_usage (coupon_id, user_id, order_id) values (nz, '00000000-0000-0000-0000-0000000000c1', 'order-3');
  raise notice 'T4 PASS: once per (coupon, user) and once per order are refused by unique guards; another user redeems; used_count follows';
end $$;

-- T5 the owner's rules on his two codes; the other seeded codes switched off (values kept); admin choices kept
do $$
declare k record;
begin
  select * into k from public.coupons where code = 'NZAMY50';
  if k.discount_type <> 'fixed' or k.discount_value <> 50 or k.min_order_amount <> 200
     or k.max_uses_per_user <> 1 or k.max_discount_pct <> 25 or k.excluded_kinds <> '{topup}' then
    raise exception 'T5 FAIL: NZAMY50 is %', row_to_json(k);
  end if;
  select * into k from public.coupons where code = 'NEWCLIENT';
  if k.discount_value <> 75 or k.min_order_amount <> 300 or k.max_discount_pct <> 25
     or not (k.excluded_kinds @> '{plan,library,topup}' and '{plan,library,topup}' @> k.excluded_kinds) then
    raise exception 'T5 FAIL: NEWCLIENT is %', row_to_json(k);
  end if;
  if k.active then
    raise exception 'T5 FAIL: the second run switched NEWCLIENT back on (an admin had switched it off)';
  end if;
  select * into k from public.coupons where code = 'LAUNCH2026';
  if k.discount_type <> 'percentage' or k.discount_value <> 25 or k.max_uses <> 500 or k.max_discount_pct <> 25
     or k.excluded_kinds <> '{topup}' then
    raise exception 'T5 FAIL: LAUNCH2026 was changed beyond the new defaults: %', row_to_json(k);
  end if;
  -- switched off by the first run (B3), switched back on by an admin, and the
  -- second run respected that (the stamp)
  if not k.active or coalesce(k.metadata->>'switched_off', '') not like '%20261026_20%' then
    raise exception 'T5 FAIL: LAUNCH2026 — the admin re-activation was undone or the stamp is gone: %', row_to_json(k);
  end if;
  if (select active from public.coupons where code = 'OLDPROMO') then
    raise exception 'T5 FAIL: OLDPROMO (seeded by SQL, not the owner''s) is active';
  end if;
  if not (select active from public.coupons where code = 'ADMIN10')
     or (select metadata ? 'switched_off' from public.coupons where code = 'ADMIN10') then
    raise exception 'T5 FAIL: ADMIN10 (created on the admin page) was touched';
  end if;
  if (select count(*) from public.coupons) <> 5 then
    raise exception 'T5 FAIL: a coupon code was invented (% rows)', (select count(*) from public.coupons);
  end if;
  raise notice 'T5 PASS: NZAMY50 50 SAR / min 200, NEWCLIENT 75 SAR / min 300 / single services; LAUNCH2026 and OLDPROMO switched off with values kept, an admin re-activation survives a re-run; admin-created ADMIN10 untouched; no code invented; admin off switch kept';
end $$;

-- T6 the database refuses a cap above 25 % and a coupon on top-ups
do $$
begin
  begin
    update public.coupons set max_discount_pct = 30 where code = 'NZAMY50';
    raise exception 'T6 FAIL: a 30 %% cap was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.coupons set excluded_kinds = '{plan}' where code = 'NZAMY50';
    raise exception 'T6 FAIL: a coupon valid on top-ups was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.coupons set excluded_kinds = '{topup,gift}' where code = 'NZAMY50';
    raise exception 'T6 FAIL: an unknown kind was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.coupons (code, discount_type, discount_value) values ('ADMINNEW', 'percentage', 50);
    if (select max_discount_pct from public.coupons where code = 'ADMINNEW') <> 25
       or (select excluded_kinds from public.coupons where code = 'ADMINNEW') <> '{topup}' then
      raise exception 'T6 FAIL: a new admin coupon did not get the 25 %% cap and the top-up exclusion by default';
    end if;
    raise exception using errcode = 'P0001', message = 't6-rollback';
  exception when raise_exception then
    if sqlerrm <> 't6-rollback' then raise; end if;
  end;
  raise notice 'T6 PASS: cap > 25 %%, a coupon on top-ups and an unknown kind are refused; a new admin coupon gets the defaults';
end $$;
