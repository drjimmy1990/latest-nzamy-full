-- pay_l11_guest_offers_renewal.test.sql — proves 20261201_20 (batch l11 pay:
-- offers for visitors, founder renewal setting + notice markers) and its
-- _verify block.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261201_20
-- runs TWICE (idempotent); the _verify block, extracted from _verify.sql
-- between its markers, runs after the second run and must print t / t.
-- From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l11_pay.sql
--   sed -n '/^-- >>> verify:l11_pay/,/^-- <<< verify:l11_pay/p' $M/_verify.sql > "$B"
--   bash $R/run.sh $M/20260627_platform_settings.sql $M/20261128_50_offers.sql \
--     $M/20261201_20_pay_guest_offers_founder_renewal.sql $M/20261201_20_pay_guest_offers_founder_renewal.sql \
--     "$B" $R/pay_l11_guest_offers_renewal.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261201_20
-- files → "T1 FAIL: a guest offer was refused".
--
-- Every assertion RAISES on failure.

-- T1 a guest offer with verification 'any' is accepted
do $$
begin
  begin
    insert into public.offers (title, cta_label, cta_href, audience_account_types, audience_verification, status)
    values ('عرض الزوار', 'اشترك', '/pricing', array['guest', 'individual'], 'any', 'active');
  exception when check_violation then
    raise exception 'T1 FAIL: a guest offer was refused';
  end;
  raise notice 'T1 PASS';
end
$$;

-- T2 an unknown key is still refused; a guest offer bound to a verification state is refused
do $$
begin
  begin
    insert into public.offers (title, cta_label, cta_href, audience_account_types)
    values ('x', 'y', '/pricing', array['visitor']);
    raise exception 'T2 FAIL: the unknown key visitor was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.offers (title, cta_label, cta_href, audience_account_types, audience_verification)
    values ('x', 'y', '/pricing', array['guest'], 'verified');
    raise exception 'T2 FAIL: a guest offer with verification verified was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.offers set audience_verification = 'unverified' where title = 'عرض الزوار';
    raise exception 'T2 FAIL: a guest offer could be switched to unverified';
  exception when check_violation then null;
  end;
  raise notice 'T2 PASS';
end
$$;

-- T3 the founder offer stays advocate-lawyer only (guest refused there)
do $$
begin
  if not exists (select 1 from public.offers where slug = 'founder-2026') then
    raise exception 'T3 FAIL: the founder offer seed is missing';
  end if;
  begin
    update public.offers set audience_account_types = array['lawyer', 'guest'], audience_verification = 'any'
     where slug = 'founder-2026';
    raise exception 'T3 FAIL: the founder offer accepted the guest audience';
  exception when check_violation then null;
  end;
  raise notice 'T3 PASS';
end
$$;

-- T4 the renewal setting: inserted once, OFF, no price; an admin value survives a re-run
do $$
declare v jsonb;
begin
  select value into v from public.platform_settings where key = 'founder_renewal';
  if v is distinct from '{"enabled": false, "price_sar": null}'::jsonb then
    raise exception 'T4 FAIL: founder_renewal is % (want OFF, no price)', v;
  end if;
  raise notice 'T4 PASS';
end
$$;

-- T5 the markers: server-only, one per (seat, cycle end)
do $$
declare
  u uuid := gen_random_uuid();
  s uuid := gen_random_uuid();
begin
  if not (select relrowsecurity from pg_class where oid = 'public.founder_renewal_notices'::regclass) then
    raise exception 'T5 FAIL: RLS off';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.founder_renewal_notices'::regclass) then
    raise exception 'T5 FAIL: a policy exists';
  end if;
  if has_table_privilege('anon', 'public.founder_renewal_notices', 'SELECT')
     or has_table_privilege('authenticated', 'public.founder_renewal_notices', 'SELECT')
     or has_table_privilege('authenticated', 'public.founder_renewal_notices', 'INSERT')
     or has_table_privilege('authenticated', 'public.founder_renewal_notices', 'UPDATE') then
    raise exception 'T5 FAIL: a session role holds a privilege';
  end if;
  if not has_table_privilege('service_role', 'public.founder_renewal_notices', 'INSERT') then
    raise exception 'T5 FAIL: service_role cannot write';
  end if;
  insert into auth.users (id) values (u);
  insert into public.founder_renewal_notices (seat_id, cycle_end, user_id, price_net_halalas)
  values (s, '2027-11-20T00:00:00Z', u, 299600);
  insert into public.founder_renewal_notices (seat_id, cycle_end, user_id, price_net_halalas)
  values (s, '2027-11-20T00:00:00Z', u, 299600) on conflict do nothing;
  if (select count(*) from public.founder_renewal_notices where seat_id = s) <> 1 then
    raise exception 'T5 FAIL: two markers for one seat and cycle';
  end if;
  begin
    insert into public.founder_renewal_notices (seat_id, cycle_end, user_id, price_net_halalas)
    values (gen_random_uuid(), now(), u, 0);
    raise exception 'T5 FAIL: a zero price was accepted';
  exception when check_violation then null;
  end;
  delete from auth.users where id = u;
  if exists (select 1 from public.founder_renewal_notices where user_id = u) then
    raise exception 'T5 FAIL: the marker outlived its account';
  end if;
  raise notice 'T5 PASS';
end
$$;

-- T6 a value the admin saved is never overwritten by a re-run (simulated: the
-- migration's own insert, again)
do $$
begin
  update public.platform_settings set value = '{"enabled": true, "price_sar": 3990}'::jsonb where key = 'founder_renewal';
  insert into public.platform_settings (key, value, description)
  values ('founder_renewal', '{"enabled": false, "price_sar": null}'::jsonb, 'x')
  on conflict (key) do nothing;
  if (select value from public.platform_settings where key = 'founder_renewal') <> '{"enabled": true, "price_sar": 3990}'::jsonb then
    raise exception 'T6 FAIL: the admin value was overwritten';
  end if;
  raise notice 'T6 PASS';
end
$$;
