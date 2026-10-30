-- library_grant_admin.test.sql — proves 20261030_65 (owner note ١٨, C01–C04):
-- the atomic stacked grant, the admin's mandatory reason, revoke and end change.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE with a stray EXECUTE / SELECT grant between the runs (the
-- self-host restore's default privileges) that the second run must take back.
-- From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $R/prelude_library_grant_admin_between_runs.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $R/library_grant_admin.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261030_65 files fails at
-- T0 ("library_grant_access does not exist").
--
-- Every DO block is one transaction, so now() is one instant inside it: the
-- functions and the assertions of a block see the same clock.
-- The two-session lock (C01) is proved separately, by hand, in the ledger.
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regprocedure('public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)') is null then
    raise exception 'T0 FAIL: library_grant_access does not exist (20261030_65 not applied)';
  end if;
end $$;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000c002'),
  ('00000000-0000-0000-0000-00000000c003'),
  ('00000000-0000-0000-0000-00000000c004');

-- T1 stacking: the second grant starts where the first ends, under the lock
do $$
declare
  u  constant uuid := '00000000-0000-0000-0000-00000000c001';
  a  jsonb;
  b  jsonb;
begin
  a := public.library_grant_access(u, 'lib-q1', 'request', 10, null, null, null, null);
  if (a ->> 'starts_at')::timestamptz <> now() or (a ->> 'ends_at')::timestamptz <> now() + interval '10 days' then
    raise exception 'T1 FAIL: first window %', a;
  end if;
  b := public.library_grant_access(u, 'lib-admin', 'admin', 5, '00000000-0000-0000-0000-0000000000ad', null, 'تعويض عن عطل', 'ملاحظة');
  if (b ->> 'starts_at')::timestamptz <> (a ->> 'ends_at')::timestamptz
     or (b ->> 'ends_at')::timestamptz <> now() + interval '15 days' then
    raise exception 'T1 FAIL: the second grant does not stack: %', b;
  end if;
  if not exists (select 1 from public.library_access_grant_admin
                  where grant_id = (b ->> 'id')::uuid and reason = 'تعويض عن عطل' and notes = 'ملاحظة') then
    raise exception 'T1 FAIL: the admin reason was not kept';
  end if;
  if exists (select 1 from public.library_access_grant_admin where grant_id = (a ->> 'id')::uuid) then
    raise exception 'T1 FAIL: a grant without a reason got an empty side row';
  end if;
end $$;

-- T2 refusals of the grant: no reason for an admin grant, days out of range
do $$
declare
  u constant uuid := '00000000-0000-0000-0000-00000000c002';
  st text;
begin
  begin
    perform public.library_grant_access(u, 'lib-admin', 'admin', 30, null, null, '   ', null);
    raise exception 'T2 FAIL: an admin grant without a reason was accepted';
  exception when sqlstate '22023' then null;
  end;
  foreach st in array array['0', '3661'] loop
    begin
      perform public.library_grant_access(u, 'lib-admin', 'request', st::int, null, null, null, null);
      raise exception 'T2 FAIL: % days was accepted', st;
    exception when sqlstate '22023' then null;
    end;
  end loop;
  begin
    perform public.library_grant_access(u, 'lib-nope', 'request', 30, null, null, null, null);
    raise exception 'T2 FAIL: an unknown plan_ref was accepted';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.library_access_grants where user_id = u) then
    raise exception 'T2 FAIL: a refused grant wrote a row';
  end if;
end $$;

-- T3 one grant per order: the second raises 23505 (grantPurchase reads it as done)
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c002',
        'library', 'lib-q1', 'once', 150000, 22500, 172500, 'exclusive', 'paid');
do $$
declare
  u constant uuid := '00000000-0000-0000-0000-00000000c002';
  o constant uuid := '00000000-0000-0000-0000-0000000000f1';
begin
  perform public.library_grant_access(u, 'lib-q1', 'purchase', 90, null, o, null, null);
  begin
    perform public.library_grant_access(u, 'lib-q1', 'purchase', 90, null, o, null, null);
    raise exception 'T3 FAIL: a second grant for the same order was accepted';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.library_access_grants where order_id = o) <> 1 then
    raise exception 'T3 FAIL: expected exactly one grant for the order';
  end if;
end $$;

-- T4 revoke the RUNNING grant: it ends now; the stacked one does NOT move (a gap)
do $$
declare
  u      constant uuid := '00000000-0000-0000-0000-00000000c003';
  a      jsonb;
  b      jsonb;
  r      jsonb;
  row_a  record;
  row_b  record;
begin
  -- A started yesterday (a grant made in this same transaction would start at
  -- now() itself, and the CHECK ends_at > starts_at keeps one microsecond)
  insert into public.library_access_grants (user_id, plan_ref, source, starts_at, ends_at)
  values (u, 'lib-q1', 'request', now() - interval '1 day', now() + interval '29 days')
  returning jsonb_build_object('id', id, 'ends_at', ends_at) into a;
  b := public.library_grant_access(u, 'lib-q2', 'request', 60, null, null, null, null);
  r := public.library_grant_revoke((a ->> 'id')::uuid, '00000000-0000-0000-0000-0000000000ad', 'طلب المستخدم');
  select * into row_a from public.library_access_grants where id = (a ->> 'id')::uuid;
  select * into row_b from public.library_access_grants where id = (b ->> 'id')::uuid;
  if row_a.ends_at <> now() or row_a.revoked_at <> now() or row_a.revoked_by <> '00000000-0000-0000-0000-0000000000ad' then
    raise exception 'T4 FAIL: the running grant was not ended now: % % %', row_a.ends_at, row_a.revoked_at, row_a.revoked_by;
  end if;
  if row_b.starts_at <> (a ->> 'ends_at')::timestamptz or row_b.ends_at <> (b ->> 'ends_at')::timestamptz then
    raise exception 'T4 FAIL: the later stacked grant moved: % %', row_b.starts_at, row_b.ends_at;
  end if;
  if (r -> 'before' ->> 'ends_at')::timestamptz <> (a ->> 'ends_at')::timestamptz then
    raise exception 'T4 FAIL: the answer does not carry the original end: %', r;
  end if;
  if not exists (select 1 from public.library_access_grant_admin
                  where grant_id = (a ->> 'id')::uuid and revoke_reason = 'طلب المستخدم'
                    and original_ends_at = (a ->> 'ends_at')::timestamptz) then
    raise exception 'T4 FAIL: the revoke reason / original window was not kept';
  end if;
  -- the same active test hasActiveLibraryGrant runs: nothing covers now
  if exists (select 1 from public.library_access_grants
              where user_id = u and starts_at <= now() and ends_at > now()) then
    raise exception 'T4 FAIL: the user still holds an active grant right after the revoke';
  end if;
end $$;

-- T5 revoke the FUTURE (stacked, not started) grant: wholly in the past
do $$
declare
  u   constant uuid := '00000000-0000-0000-0000-00000000c003';
  gid uuid;
  g   record;
begin
  select id into gid from public.library_access_grants
   where user_id = u and revoked_at is null and starts_at > now();
  perform public.library_grant_revoke(gid, null, 'إلغاء التجديد');
  select * into g from public.library_access_grants where id = gid;
  if g.ends_at > now() or g.starts_at >= g.ends_at then
    raise exception 'T5 FAIL: the future grant still has future time: % – %', g.starts_at, g.ends_at;
  end if;
  if not exists (select 1 from public.library_access_grant_admin
                  where grant_id = gid and original_starts_at > now()) then
    raise exception 'T5 FAIL: the original future start was not kept';
  end if;
end $$;

-- T6 revoke refusals: again (55000), unknown (P0002), blank reason (22023)
do $$
declare
  u   constant uuid := '00000000-0000-0000-0000-00000000c003';
  gid uuid;
begin
  select id into gid from public.library_access_grants where user_id = u limit 1;
  begin
    perform public.library_grant_revoke(gid, null, 'مرة ثانية');
    raise exception 'T6 FAIL: a revoked grant was revoked again';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.library_grant_revoke('00000000-0000-0000-0000-00000000dead', null, 'سبب');
    raise exception 'T6 FAIL: an unknown grant was revoked';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.library_grant_revoke(gid, null, '');
    raise exception 'T6 FAIL: a blank reason was accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- T7 a new grant after the revokes stacks from now (revoked rows do not count)
do $$
declare
  u constant uuid := '00000000-0000-0000-0000-00000000c003';
  c jsonb;
begin
  c := public.library_grant_access(u, 'lib-admin', 'admin', 7, null, null, 'إعادة', null);
  if (c ->> 'starts_at')::timestamptz <> now() then
    raise exception 'T7 FAIL: the new grant did not start now: %', c;
  end if;
end $$;

-- T8 end changes
do $$
declare
  u  constant uuid := '00000000-0000-0000-0000-00000000c004';
  a  jsonb;
  b  jsonb;
  x  jsonb;
  st text;
begin
  a := public.library_grant_access(u, 'lib-q1', 'request', 30, null, null, null, null);
  b := public.library_grant_access(u, 'lib-q1', 'request', 30, null, null, null, null);

  -- shorten A: allowed; B does not move
  x := public.library_grant_adjust_end((a ->> 'id')::uuid, null, now() + interval '20 days', 'تقصير');
  if (select ends_at from public.library_access_grants where id = (a ->> 'id')::uuid) <> now() + interval '20 days' then
    raise exception 'T8 FAIL: A was not shortened';
  end if;
  if (select starts_at from public.library_access_grants where id = (b ->> 'id')::uuid) <> now() + interval '30 days' then
    raise exception 'T8 FAIL: B moved when A was shortened';
  end if;
  if not exists (select 1 from public.library_access_grant_admin
                  where grant_id = (a ->> 'id')::uuid and adjust_reason = 'تقصير'
                    and original_ends_at = now() + interval '30 days') then
    raise exception 'T8 FAIL: the end change was not recorded';
  end if;

  -- lengthen A into B: refused (overlap)
  begin
    perform public.library_grant_adjust_end((a ->> 'id')::uuid, null, now() + interval '40 days', 'تمديد');
    raise exception 'T8 FAIL: lengthening into the next grant was accepted';
  exception when sqlstate '55000' then null;
  end;
  -- lengthen A up to B's start: allowed (no overlap: B starts at day 30)
  perform public.library_grant_adjust_end((a ->> 'id')::uuid, null, now() + interval '30 days', 'سد الفجوة');

  -- lengthen the LAST grant (B): allowed
  perform public.library_grant_adjust_end((b ->> 'id')::uuid, null, now() + interval '100 days', 'تمديد');

  -- refusals: before now, unchanged, longer than 3660 days, blank reason
  begin
    perform public.library_grant_adjust_end((b ->> 'id')::uuid, null, now() - interval '1 day', 'سبب');
    raise exception 'T8 FAIL: an end before now was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.library_grant_adjust_end((b ->> 'id')::uuid, null, now() + interval '100 days', 'سبب');
    raise exception 'T8 FAIL: an unchanged end was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.library_grant_adjust_end((b ->> 'id')::uuid, null, now() + interval '4000 days', 'سبب');
    raise exception 'T8 FAIL: a window over 3660 days was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.library_grant_adjust_end((b ->> 'id')::uuid, null, now() + interval '50 days', ' ');
    raise exception 'T8 FAIL: a blank reason was accepted';
  exception when sqlstate '22023' then null;
  end;
  -- a revoked grant cannot be moved
  perform public.library_grant_revoke((b ->> 'id')::uuid, null, 'سحب');
  begin
    perform public.library_grant_adjust_end((b ->> 'id')::uuid, null, now() + interval '50 days', 'سبب');
    raise exception 'T8 FAIL: a revoked grant was moved';
  exception when sqlstate '55000' then null;
  end;
end $$;

-- T9 privileges after the second run took back the stray grants
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)',
    'public.library_grant_revoke(uuid, uuid, text)',
    'public.library_grant_adjust_end(uuid, uuid, timestamptz, text)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'T9 FAIL: a session role can EXECUTE %', fn;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.library_access_grant_admin', 'SELECT')
     or has_table_privilege('anon', 'public.library_access_grant_admin', 'SELECT') then
    raise exception 'T9 FAIL: a session role can read the admin side table';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'library_access_grants') <> 1 then
    raise exception 'T9 FAIL: library_access_grants no longer has exactly one policy (_verify 20261019_10 would fail)';
  end if;
end $$;

-- T10 a signed-in user cannot read the side table (app_user has only what
-- `authenticated` would have on the live database)
revoke all on public.library_access_grant_admin from app_user;
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  begin
    perform 1 from public.library_access_grant_admin limit 1;
    raise exception 'T10 FAIL: a signed-in user read the admin side table';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'library_grant_admin.test.sql: ALL PASS' as result;
