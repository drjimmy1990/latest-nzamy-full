-- admin_account_type_l16.test.sql — proves 20261206_80 (batch l16-admin, C14
-- first slice): the admin account-type converter.
--   * individual → advocate / consultant / notary; advocate ↔ consultant;
--   * the signup trigger's old metadata cannot override the admin's choice;
--   * open commitments (paid plan, firm membership or ownership, open
--     request or case, founder seat) refuse — and change nothing;
--   * a free or expired plan, a completed request, a released seat do not;
--   * actor must be an admin and not the account; reason 5–1000; only the
--     three moves; an admin account is never converted;
--   * snapshot + audit row + conversion row; nothing deleted;
--   * service_role only (a session cannot execute or read the history).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $T/prelude_l16_account_type.sql \
--     $M/20261206_80_admin_account_type_converter.sql \
--     $M/20261206_80_admin_account_type_converter.sql \
--     $T/admin_account_type_l16.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261206_80
-- lines → «function public.admin_change_account_type(…) does not exist».
--
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1

-- ── fixtures (postgres) ──────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'a1@l16.test', '{}'),
  ('00000000-0000-0000-0000-00000000a002', 'a2@l16.test', '{}'),
  ('00000000-0000-0000-0000-00000000c001', 'i1@l16.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000c002', 'i2@l16.test', '{"user_type": "individual", "practice_kind": "consultant"}'),
  ('00000000-0000-0000-0000-00000000c003', 'i3@l16.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000d001', 'l1@l16.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-00000000e001', 'p1@l16.test', '{"user_type": "provider", "sub_role": "notary"}'),
  ('00000000-0000-0000-0000-00000000b001', 'b1@l16.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000b002', 'b2@l16.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000b003', 'b3@l16.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-00000000b004', 'b4@l16.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000b005', 'b5@l16.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000b006', 'b6@l16.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-00000000b007', 'b7@l16.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000b008', 'b8@l16.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000b009', 'b9@l16.test', '{"user_type": "individual"}');
update public.profiles set user_type = 'admin'
 where id in ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002');

insert into public.subscriptions (user_id, tier, status, current_period_end) values
  ('00000000-0000-0000-0000-00000000b001', 'pro', 'active', now() + interval '200 days'),
  ('00000000-0000-0000-0000-00000000b002', 'free', 'active', null),
  ('00000000-0000-0000-0000-00000000b002', 'pro', 'active', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000b002', 'pro', 'cancelled', now() + interval '20 days');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000b008', 'مكتب اختبار');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000b003', 'lawyer', 'active');
insert into public.service_requests (id, requester_user_id, title, status) values
  ('l16-sr-open', '00000000-0000-0000-0000-00000000b004', 'طلب مفتوح', 'pending_assignment'),
  ('l16-sr-done', '00000000-0000-0000-0000-00000000b005', 'طلب منتهٍ', 'completed'),
  ('l16-sr-draft', '00000000-0000-0000-0000-00000000b005', 'مسودة', 'draft');
insert into public.founder_seats (user_id, status, ends_at) values
  ('00000000-0000-0000-0000-00000000b006', 'active', now() + interval '300 days'),
  ('00000000-0000-0000-0000-00000000b009', 'released', null);
insert into public.cases (id, client_user_id, title, status) values
  ('case-open', '00000000-0000-0000-0000-00000000b007', 'قضية', 'open');

create temp table t_res (k text primary key, v jsonb);
grant all on t_res to public;

-- ── T1: individual → advocate ────────────────────────────────────────────────
do $$
declare r jsonb; lp record;
begin
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c001', 'advocate', 'تصحيح نوع الحساب بطلب صاحبه', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T1 refused: %', r; end if;
  if (select user_type from public.profiles where id = '00000000-0000-0000-0000-00000000c001') <> 'lawyer' then
    raise exception 'T1 user_type not lawyer';
  end if;
  select practice_kind, verification_status, practice_kind_confirmed_at into lp
    from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000c001';
  if lp.practice_kind is distinct from 'advocate' or lp.verification_status is distinct from 'pending' or lp.practice_kind_confirmed_at is null then
    raise exception 'T1 lawyer row wrong: %', row_to_json(lp);
  end if;
  if not exists (select 1 from public.account_type_conversions
                  where user_id = '00000000-0000-0000-0000-00000000c001' and from_type = 'individual'
                    and to_type = 'lawyer' and to_kind = 'advocate' and reason = 'تصحيح نوع الحساب بطلب صاحبه'
                    and actor_id = '00000000-0000-0000-0000-00000000a001' and archived_rows = '[]'::jsonb) then
    raise exception 'T1 conversion row missing';
  end if;
  if not exists (select 1 from public.admin_audit_events
                  where action = 'account_type_converted' and target_id = '00000000-0000-0000-0000-00000000c001'
                    and actor_id = '00000000-0000-0000-0000-00000000a001' and actor_type = 'admin'
                    and before_state ->> 'user_type' = 'individual' and after_state ->> 'kind' = 'advocate'
                    and metadata ->> 'reason' = 'تصحيح نوع الحساب بطلب صاحبه') then
    raise exception 'T1 audit row missing';
  end if;
  raise notice 'T1 ok: individual → advocate (pending verification, audited)';
end $$;

-- ── T2/T3: advocate → consultant → advocate (snapshot each time) ────────────
do $$
declare r jsonb; n int;
begin
  update public.lawyer_profiles set verification_status = 'verified', license_number = 'L-1'
   where user_id = '00000000-0000-0000-0000-00000000d001';
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000d001', 'consultant', 'مستشار وليس محامياً مترافعاً', '00000000-0000-0000-0000-00000000a002');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T2 refused: %', r; end if;
  if (select practice_kind from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000d001') <> 'consultant' then
    raise exception 'T2 kind not consultant';
  end if;
  if (select verification_status from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000d001') <> 'verified' then
    raise exception 'T2 an existing row must keep its verification state';
  end if;
  if not exists (select 1 from public.account_type_conversions
                  where user_id = '00000000-0000-0000-0000-00000000d001' and from_kind = 'advocate' and to_kind = 'consultant'
                    and archived_rows -> 0 ->> 'table' = 'lawyer_profiles'
                    and archived_rows -> 0 -> 'row' ->> 'practice_kind' = 'advocate'
                    and archived_rows -> 0 -> 'row' ->> 'license_number' = 'L-1') then
    raise exception 'T2 snapshot missing';
  end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000d001', 'advocate', 'رجوع إلى محامٍ مترافع', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) or r ->> 'from_kind' <> 'consultant' then raise exception 'T3 refused: %', r; end if;
  select count(*) into n from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000d001';
  if n <> 1 or (select user_type from public.profiles where id = '00000000-0000-0000-0000-00000000d001') <> 'lawyer' then
    raise exception 'T3 row count/type wrong';
  end if;
  -- same kind again: not a move
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000d001', 'advocate', 'لا تغيير هنا أبداً', '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'not_supported' then raise exception 'T3 same-kind must be not_supported: %', r; end if;
  raise notice 'T2/T3 ok: advocate ↔ consultant, snapshot kept, verification kept';
end $$;

-- ── T4: the signup trigger's old metadata cannot override the admin ─────────
do $$
declare r jsonb;
begin
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c002', 'advocate', 'اختار المحاماة عند التحويل', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T4 refused: %', r; end if;
  if (select practice_kind from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000c002') <> 'advocate' then
    raise exception 'T4 the metadata «consultant» overrode the admin''s «advocate»';
  end if;
  raise notice 'T4 ok: the admin''s kind wins over old signup metadata';
end $$;

-- ── T5: individual → notary ──────────────────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c003', 'notary', 'موثّق معتمد بطلب صاحبه', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T5 refused: %', r; end if;
  if (select user_type from public.profiles where id = '00000000-0000-0000-0000-00000000c003') <> 'provider'
     or (select sub_role from public.provider_profiles where user_id = '00000000-0000-0000-0000-00000000c003') <> 'notary'
     or (select verification_status from public.provider_profiles where user_id = '00000000-0000-0000-0000-00000000c003') <> 'pending' then
    raise exception 'T5 provider row wrong';
  end if;
  raise notice 'T5 ok: individual → notary';
end $$;

-- ── T6–T10: open commitments refuse and change nothing ──────────────────────
do $$
declare
  r jsonb;
  c record;
  n_conv int;
  n_audit int;
begin
  select count(*) into n_conv from public.account_type_conversions;
  select count(*) into n_audit from public.admin_audit_events;
  for c in select * from (values
      ('00000000-0000-0000-0000-00000000b001'::uuid, 'advocate', 'paid_plan', 'individual'),
      ('00000000-0000-0000-0000-00000000b003'::uuid, 'consultant', 'firm_membership', 'lawyer'),
      ('00000000-0000-0000-0000-00000000b008'::uuid, 'advocate', 'firm_membership', 'individual'),
      ('00000000-0000-0000-0000-00000000b004'::uuid, 'notary', 'open_cases', 'individual'),
      ('00000000-0000-0000-0000-00000000b006'::uuid, 'consultant', 'founder_seat', 'lawyer'),
      ('00000000-0000-0000-0000-00000000b007'::uuid, 'advocate', 'open_cases', 'individual')
    ) as t(u, target, blocker, type_before) loop
    r := public.admin_change_account_type(c.u, c.target, 'سبب مكتوب للتحويل', '00000000-0000-0000-0000-00000000a001');
    if r ->> 'code' is distinct from 'open_commitments' or not (r -> 'blockers') ? c.blocker then
      raise exception 'T6 % should be refused for %: %', c.u, c.blocker, r;
    end if;
    if (select user_type from public.profiles where id = c.u) <> c.type_before then
      raise exception 'T6 % type changed despite the refusal', c.u;
    end if;
  end loop;
  if (select count(*) from public.account_type_conversions) <> n_conv
     or (select count(*) from public.admin_audit_events) <> n_audit then
    raise exception 'T6 a refusal wrote a row';
  end if;
  if exists (select 1 from public.lawyer_profiles where user_id in ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b007', '00000000-0000-0000-0000-00000000b008'))
     or exists (select 1 from public.provider_profiles where user_id = '00000000-0000-0000-0000-00000000b004') then
    raise exception 'T6 a refusal created a sector row';
  end if;
  if (select practice_kind from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000b006') <> 'advocate' then
    raise exception 'T6 a refused lawyer''s kind changed';
  end if;
  raise notice 'T6–T10 ok: paid plan, firm member/owner, open request, open case, founder seat refuse and change nothing';
end $$;

-- ── T11: what does NOT block ─────────────────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000b002', 'arbitrator', 'محكّم — خطة مجانية فقط', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T11 free/expired/cancelled plans must not block: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000b005', 'bailiff', 'مراجع حكومي — طلب منتهٍ', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T11 completed/draft requests must not block: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000b009', 'consultant', 'مقعد مؤسس محرَّر سابقاً', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T11 a released founder seat must not block: %', r; end if;
  raise notice 'T11 ok: free / expired / cancelled plan, completed request, released seat do not block';
end $$;

-- ── T12: the caller, the reason, the move ────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c001', 'consultant', 'سبب مكتوب كافٍ', '00000000-0000-0000-0000-00000000c003');
  if r ->> 'code' is distinct from 'actor_not_admin' then raise exception 'T12 non-admin actor: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c001', 'consultant', 'سبب مكتوب كافٍ', null);
  if r ->> 'code' is distinct from 'actor_not_admin' then raise exception 'T12 null actor: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000a001', 'consultant', 'سبب مكتوب كافٍ', '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'self' then raise exception 'T12 self: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c001', 'consultant', '   لا  ', '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'reason_required' then raise exception 'T12 short reason: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c001', 'consultant', repeat('س', 1001), '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'reason_required' then raise exception 'T12 long reason: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c001', 'admin', 'سبب مكتوب كافٍ', '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'bad_target' then raise exception 'T12 admin target: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000a002', 'advocate', 'سبب مكتوب كافٍ', '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'not_supported' then raise exception 'T12 an admin account: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000e001', 'advocate', 'سبب مكتوب كافٍ', '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'not_supported' then raise exception 'T12 provider → lawyer: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000d001', 'notary', 'سبب مكتوب كافٍ', '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'not_supported' then raise exception 'T12 lawyer → notary: %', r; end if;
  r := public.admin_change_account_type('00000000-0000-0000-0000-0000000000ff', 'advocate', 'سبب مكتوب كافٍ', '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'not_found' then raise exception 'T12 unknown user: %', r; end if;
  if (select user_type from public.profiles where id = '00000000-0000-0000-0000-00000000e001') <> 'provider' then
    raise exception 'T12 a refused provider changed';
  end if;
  raise notice 'T12 ok: actor, self, reason, target and move are checked';
end $$;

-- ── T13: the state read ──────────────────────────────────────────────────────
do $$
declare s jsonb;
begin
  s := public.admin_account_type_state('00000000-0000-0000-0000-00000000b001');
  if s ->> 'user_type' <> 'individual' or not (s -> 'blockers') ? 'paid_plan'
     or jsonb_array_length(s -> 'targets') <> 5 then
    raise exception 'T13 individual state: %', s;
  end if;
  s := public.admin_account_type_state('00000000-0000-0000-0000-00000000d001');
  if s ->> 'kind' <> 'advocate' or s -> 'targets' <> '["consultant"]'::jsonb or s ->> 'lawyer_verification' <> 'verified' then
    raise exception 'T13 lawyer state: %', s;
  end if;
  s := public.admin_account_type_state('00000000-0000-0000-0000-00000000e001');
  if s ->> 'kind' <> 'notary' or jsonb_array_length(s -> 'targets') <> 0 then
    raise exception 'T13 provider state: %', s;
  end if;
  if (public.admin_account_type_state('00000000-0000-0000-0000-0000000000ff') ->> 'found')::boolean then
    raise exception 'T13 unknown user found';
  end if;
  raise notice 'T13 ok: the state read';
end $$;

-- ── T14: service_role only ───────────────────────────────────────────────────
-- The harness role app_user is not a Supabase role; stubs.sql gives it every
-- new table by default privilege. Live has no such role, so take it back here
-- (the migration revokes anon / authenticated, which app_user also inherits).
revoke all on public.account_type_conversions from app_user;
revoke all on sequence public.account_type_conversions_id_seq from app_user;
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-00000000a001', false);
do $$
begin
  begin
    perform public.admin_change_account_type('00000000-0000-0000-0000-00000000b005', 'advocate', 'سبب مكتوب كافٍ', '00000000-0000-0000-0000-00000000a001');
    raise exception 'T14 a session executed the converter';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_account_type_state('00000000-0000-0000-0000-00000000b005');
    raise exception 'T14 a session executed the state read';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_account_type_blockers('00000000-0000-0000-0000-00000000b005');
    raise exception 'T14 a session executed the blocker check';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.account_type_conversions limit 1;
    raise exception 'T14 a session read the conversion history';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('test.uid', '', false);

set role service_role;
do $$
begin
  if (public.admin_account_type_state('00000000-0000-0000-0000-00000000b005') ->> 'user_type') <> 'provider' then
    raise exception 'T14 service_role read wrong';
  end if;
  perform 1 from public.account_type_conversions limit 1;
end $$;
reset role;
\echo 'T14 ok: a session cannot execute the functions or read the history; service_role can'

\echo 'admin_account_type_l16: ALL OK'
