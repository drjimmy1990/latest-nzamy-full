-- 20261016_08 on the live shape (prelude_profiles_subscriptions_live.sql).
-- Run: run.sh prelude_profiles_subscriptions_live.sql \
--        ../../migrations/20261016_08_reassert_profiles_subscriptions_revokes.sql <this file>
\set ON_ERROR_STOP on

-- T1: neither API role can write a subscription or a credit row.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
    execute format('set local role %I', r);
    begin
      insert into public.subscriptions (user_id, tier) values ('00000000-0000-0000-0000-0000000000a1', 'enterprise');
      raise exception 'T1 FAIL: % inserted a subscription', r;
    exception when insufficient_privilege then
      if sqlerrm not like 'permission denied for table%' then
        raise exception 'T1 FAIL: % insert into subscriptions was refused by RLS, not by the grant (%)', r, sqlerrm;
      end if;
    end;
    begin
      update public.subscriptions set tier = 'enterprise';
      raise exception 'T1 FAIL: % updated a subscription', r;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.credit_transactions (user_id, amount) values ('00000000-0000-0000-0000-0000000000a1', 1000);
      raise exception 'T1 FAIL: % inserted a credit row', r;
    exception when insufficient_privilege then
      if sqlerrm not like 'permission denied for table%' then
        raise exception 'T1 FAIL: % insert into credit_transactions was refused by RLS, not by the grant (%)', r, sqlerrm;
      end if;
    end;
    reset role;
  end loop;
  raise notice 'T1 PASS: anon and authenticated cannot write subscriptions or credit_transactions (42501)';
end $$;

-- T2: a signed-in user still reads their own subscription and profile.
begin;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.subscriptions;
  if n <> 1 then raise exception 'T2 FAIL: user read % own subscriptions, expected 1', n; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'T2 FAIL: user read % profiles, expected 1', n; end if;
  raise notice 'T2 PASS: the signed-in user reads their own subscription and profile';
end $$;
commit;

-- T3: a guest reads zero profile rows, cannot write one, and still reads the
-- public table whose admin policy reads profiles inline.
begin;
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'T3 FAIL: guest read % profiles, expected 0', n; end if;
  select count(*) into n from public.guest_readable;
  if n <> 1 then raise exception 'T3 FAIL: guest read % public rows, expected 1', n; end if;
  begin
    update public.profiles set display_name = 'x';
    raise exception 'T3 FAIL: guest updated a profile';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: guest reads 0 profiles, cannot write one, and the public table still loads';
end $$;
commit;

-- T4: idempotent — a second run passes its own verify.
\i /tmp/mig2.sql
