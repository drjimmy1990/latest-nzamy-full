-- library_invitation_redemptions.test.sql — proves 20261109_10 (SAST-02): a
-- library invitation code gives each account ONE grant; the seat, the grant
-- and the redemption row are one transaction; the function and the table are
-- service role only. The migration runs TWICE with a stray grant between the
-- runs (a self-host restore's default privileges) that the second run takes back.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260626_legal_library_schema.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261103_11_library_invitation_grant_days.sql \
--     $M/20261109_10_library_invitation_redemptions.sql \
--     $R/prelude_library_invitation_redemptions_between_runs.sql \
--     $M/20261109_10_library_invitation_redemptions.sql \
--     $R/library_invitation_redemptions.test.sql
-- NEGATIVE CONTROL: the same chain without the 20261109_10 files and the
-- between-prelude stops at T0 ("redeem_library_invitation does not exist").
--
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regprocedure('public.redeem_library_invitation(uuid, text)') is null then
    raise exception 'T0 FAIL: redeem_library_invitation does not exist (20261109_10 not applied)';
  end if;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000d001'),
  ('00000000-0000-0000-0000-00000000d002'),
  ('00000000-0000-0000-0000-00000000d003'),
  ('00000000-0000-0000-0000-00000000d004'),
  ('00000000-0000-0000-0000-00000000d005');

insert into library.invitations (code, max_uses, grant_days, expires_at) values
  ('MULTI0001', 3, 10, null),
  ('SINGLE001', 1, null, null),
  ('OLD000001', 5, 10, now() - interval '1 day'),
  ('FAIL00001', 5, 10, null);

-- T1 the same account twice: ok, then already_redeemed; one seat, one grant
do $$
declare
  u constant uuid := '00000000-0000-0000-0000-00000000d001';
  a jsonb;
  b jsonb;
begin
  a := public.redeem_library_invitation(u, 'MULTI0001');
  if a ->> 'result' <> 'ok' or (a ->> 'days')::int <> 10 or a ->> 'ends_at' is null or a ->> 'grant_id' is null then
    raise exception 'T1 FAIL: first redeem answered %', a;
  end if;
  if (a ->> 'ends_at')::timestamptz <> now() + interval '10 days' then
    raise exception 'T1 FAIL: the grant does not last the code''s 10 days: %', a;
  end if;
  b := public.redeem_library_invitation(u, 'MULTI0001');
  if b ->> 'result' <> 'already_redeemed' then
    raise exception 'T1 FAIL: the same account redeemed the same code twice: %', b;
  end if;
  if (select current_uses from library.invitations where code = 'MULTI0001') <> 1 then
    raise exception 'T1 FAIL: the repeat spent a seat';
  end if;
  if (select count(*) from public.library_access_grants where user_id = u and source = 'invite_code' and plan_ref = 'lib-invite') <> 1 then
    raise exception 'T1 FAIL: expected exactly one lib-invite grant for the account';
  end if;
  if not exists (select 1 from public.library_invitation_redemptions r
                   join library.invitations i on i.id = r.invitation_id
                  where i.code = 'MULTI0001' and r.user_id = u and r.grant_id = (a ->> 'grant_id')::uuid) then
    raise exception 'T1 FAIL: the redemption row (with its grant id) was not written';
  end if;
end $$;

-- T2 other accounts take the remaining seats; then exhausted
do $$
declare
  r jsonb;
begin
  r := public.redeem_library_invitation('00000000-0000-0000-0000-00000000d002', 'MULTI0001');
  if r ->> 'result' <> 'ok' then raise exception 'T2 FAIL: second account answered %', r; end if;
  r := public.redeem_library_invitation('00000000-0000-0000-0000-00000000d003', 'MULTI0001');
  if r ->> 'result' <> 'ok' then raise exception 'T2 FAIL: third account answered %', r; end if;
  r := public.redeem_library_invitation('00000000-0000-0000-0000-00000000d004', 'MULTI0001');
  if r ->> 'result' <> 'exhausted' then raise exception 'T2 FAIL: a fourth seat was given: %', r; end if;
  if (select current_uses from library.invitations where code = 'MULTI0001') <> 3 then
    raise exception 'T2 FAIL: current_uses is not 3';
  end if;
  -- a repeat on a FULL code still says "already redeemed" (the clearer answer)
  r := public.redeem_library_invitation('00000000-0000-0000-0000-00000000d001', 'MULTI0001');
  if r ->> 'result' <> 'already_redeemed' then raise exception 'T2 FAIL: repeat on a full code answered %', r; end if;
end $$;

-- T3 grant_days null → 30 days; single seat
do $$
declare
  r jsonb;
begin
  r := public.redeem_library_invitation('00000000-0000-0000-0000-00000000d004', 'SINGLE001');
  if r ->> 'result' <> 'ok' or (r ->> 'days')::int <> 30 then
    raise exception 'T3 FAIL: a code without grant_days answered %', r;
  end if;
  r := public.redeem_library_invitation('00000000-0000-0000-0000-00000000d005', 'SINGLE001');
  if r ->> 'result' <> 'exhausted' then raise exception 'T3 FAIL: a one-seat code gave a second seat: %', r; end if;
end $$;

-- T4 expired, unknown, blank, overlong, null user
do $$
declare
  u constant uuid := '00000000-0000-0000-0000-00000000d005';
begin
  if public.redeem_library_invitation(u, 'OLD000001') ->> 'result' <> 'expired' then
    raise exception 'T4 FAIL: an expired code was not refused as expired';
  end if;
  if public.redeem_library_invitation(u, 'NOPE00001') ->> 'result' <> 'invalid' then
    raise exception 'T4 FAIL: an unknown code was not invalid';
  end if;
  if public.redeem_library_invitation(u, '   ') ->> 'result' <> 'invalid'
     or public.redeem_library_invitation(u, repeat('A', 65)) ->> 'result' <> 'invalid'
     or public.redeem_library_invitation(null, 'MULTI0001') ->> 'result' <> 'invalid' then
    raise exception 'T4 FAIL: a blank / overlong code or a null user was not invalid';
  end if;
  if (select current_uses from library.invitations where code = 'OLD000001') <> 0 then
    raise exception 'T4 FAIL: an expired code spent a seat';
  end if;
end $$;

-- T5 a failed grant rolls back the seat and the redemption
create function pg_temp.refuse_grant() returns trigger language plpgsql as $$
begin
  if new.user_id = '00000000-0000-0000-0000-00000000d005' then
    raise exception 'test: grant refused';
  end if;
  return new;
end $$;
create trigger trg_test_refuse_grant before insert on public.library_access_grants
  for each row execute function pg_temp.refuse_grant();
do $$
begin
  begin
    perform public.redeem_library_invitation('00000000-0000-0000-0000-00000000d005', 'FAIL00001');
    raise exception 'T5 FAIL: the redeem succeeded although the grant was refused';
  exception when raise_exception then
    if sqlerrm <> 'test: grant refused' then raise; end if;
  end;
  if (select current_uses from library.invitations where code = 'FAIL00001') <> 0 then
    raise exception 'T5 FAIL: a failed grant still spent a seat';
  end if;
  if exists (select 1 from public.library_invitation_redemptions r join library.invitations i on i.id = r.invitation_id
              where i.code = 'FAIL00001') then
    raise exception 'T5 FAIL: a failed grant left a redemption row';
  end if;
end $$;
drop trigger trg_test_refuse_grant on public.library_access_grants;

-- T6 the unique key itself refuses a second row for (code, account)
do $$
begin
  begin
    insert into public.library_invitation_redemptions (invitation_id, user_id)
    select id, '00000000-0000-0000-0000-00000000d001' from library.invitations where code = 'MULTI0001';
    raise exception 'T6 FAIL: a second redemption row for the same (code, account) was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- T7 sessions: no EXECUTE, no table access (the second run took the stray grants back)
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    execute format('set local role %I', r);
    begin
      perform public.redeem_library_invitation('00000000-0000-0000-0000-00000000d005', 'FAIL00001');
      raise exception 'T7 FAIL: % could EXECUTE redeem_library_invitation', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform 1 from public.library_invitation_redemptions limit 1;
      raise exception 'T7 FAIL: % could read library_invitation_redemptions', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
end $$;

-- T8 service_role (what the route uses) can redeem
do $$
declare
  r jsonb;
begin
  set local role service_role;
  r := public.redeem_library_invitation('00000000-0000-0000-0000-00000000d005', 'FAIL00001');
  reset role;
  if r ->> 'result' <> 'ok' then raise exception 'T8 FAIL: service_role redeem answered %', r; end if;
end $$;

do $$ begin raise notice 'library_invitation_redemptions: ALL PASS (T0–T8)'; end $$;
