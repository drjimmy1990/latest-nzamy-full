-- l18_convert_keeps_verification.test.sql — proves 20261208_52 (batch
-- l18-answers, owner answer ٢٢٣): the admin account-type converter KEEPS the
-- licence verification state.
--   * a verified advocate → consultant stays verified; the answer and the audit
--     row say verified before and after; verification_reset is false;
--   * a rejected provider row stays rejected when an individual with an
--     earlier provider row is converted back (no silent reset either way);
--   * a brand-new row (individual → lawyer with no earlier row) starts with
--     the column default «pending» (a new row, not a reset);
--   * everything else of 20261206_80 still holds: open commitments refuse and
--     change nothing, the snapshot and the conversion row are written.
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
--     $M/20261208_52_l18_account_type_keeps_verification.sql \
--     $M/20261208_52_l18_account_type_keeps_verification.sql \
--     $T/l18_convert_keeps_verification.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261208_52
-- lines → «T1 the verification must be kept».
--
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'a1@l18.test', '{}'),
  ('00000000-0000-0000-0000-00000000d001', 'l1@l18.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-00000000c001', 'i1@l18.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000c002', 'i2@l18.test', '{"user_type": "individual"}'),
  ('00000000-0000-0000-0000-00000000b001', 'b1@l18.test', '{"user_type": "lawyer"}');
update public.profiles set user_type = 'admin' where id = '00000000-0000-0000-0000-00000000a001';
insert into public.subscriptions (user_id, tier, status, current_period_end) values
  ('00000000-0000-0000-0000-00000000b001', 'pro', 'active', now() + interval '200 days');

-- ── T1: a verified advocate → consultant stays verified ──────────────────────
do $$
declare r jsonb;
begin
  update public.lawyer_profiles set verification_status = 'verified', license_number = 'L-1'
   where user_id = '00000000-0000-0000-0000-00000000d001';
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000d001', 'consultant', 'مستشار وليس محامياً مترافعاً', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T1 refused: %', r; end if;
  if (select practice_kind from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000d001') <> 'consultant' then
    raise exception 'T1 kind not consultant';
  end if;
  if (select verification_status from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000d001') <> 'verified' then
    raise exception 'T1 the verification must be kept (owner ٢٢٣)';
  end if;
  if r ->> 'verification_before' is distinct from 'verified' or r ->> 'verification' is distinct from 'verified' then
    raise exception 'T1 the answer does not report the kept verification: %', r;
  end if;
  if not exists (select 1 from public.admin_audit_events
                  where target_id = '00000000-0000-0000-0000-00000000d001' and action = 'account_type_converted'
                    and before_state ->> 'verification' = 'verified' and after_state ->> 'verification' = 'verified'
                    and (metadata ->> 'verification_reset')::boolean = false) then
    raise exception 'T1 the audit row does not record the kept verification';
  end if;
  if not exists (select 1 from public.account_type_conversions
                  where user_id = '00000000-0000-0000-0000-00000000d001' and from_kind = 'advocate' and to_kind = 'consultant'
                    and archived_rows -> 0 -> 'row' ->> 'license_number' = 'L-1') then
    raise exception 'T1 snapshot missing';
  end if;
  raise notice 'T1 ok: verified advocate → consultant stays verified, audited';
end $$;

-- ── T2: an earlier provider row keeps its own state (rejected stays rejected) ─
do $$
declare r jsonb;
begin
  insert into public.provider_profiles (user_id, sub_role, verification_status)
    values ('00000000-0000-0000-0000-00000000c002', 'notary', 'rejected')
    on conflict (user_id) do update set sub_role = 'notary', verification_status = 'rejected';
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c002', 'arbitrator', 'تحويل إلى محكّم بطلبه', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T2 refused: %', r; end if;
  if (select verification_status from public.provider_profiles where user_id = '00000000-0000-0000-0000-00000000c002') <> 'rejected'
     or r ->> 'verification' is distinct from 'rejected' then
    raise exception 'T2 the provider row''s state changed: %', r;
  end if;
  raise notice 'T2 ok: an earlier provider row keeps its state';
end $$;

-- ── T3: a brand-new row starts with the column default ───────────────────────
do $$
declare r jsonb;
begin
  delete from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000c001';
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000c001', 'advocate', 'تصحيح نوع الحساب بطلب صاحبه', '00000000-0000-0000-0000-00000000a001');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'T3 refused: %', r; end if;
  if (select verification_status from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000c001') <> 'pending'
     or r ->> 'verification' is distinct from 'pending' or r ->> 'verification_before' is not null then
    raise exception 'T3 a new row must start pending (column default): %', r;
  end if;
  raise notice 'T3 ok: a new row starts pending — a fresh row, not a reset';
end $$;

-- ── T4: open commitments still refuse and change nothing ─────────────────────
do $$
declare r jsonb;
begin
  r := public.admin_change_account_type('00000000-0000-0000-0000-00000000b001', 'consultant', 'محاولة مع اشتراك ساري', '00000000-0000-0000-0000-00000000a001');
  if r ->> 'code' is distinct from 'open_commitments' or not (r -> 'blockers') ? 'paid_plan' then
    raise exception 'T4 a paid plan must refuse: %', r;
  end if;
  if exists (select 1 from public.account_type_conversions where user_id = '00000000-0000-0000-0000-00000000b001') then
    raise exception 'T4 a refused conversion wrote a row';
  end if;
  raise notice 'T4 ok: open commitments still refuse';
end $$;

-- ── T5: still service_role only, still no reset text in the body ─────────────
do $$
begin
  if has_function_privilege('authenticated', 'public.admin_change_account_type(uuid, text, text, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_change_account_type(uuid, text, text, uuid)', 'EXECUTE') then
    raise exception 'T5 a session may execute the converter';
  end if;
  if position('set verification_status = ''pending''' in pg_get_functiondef('public.admin_change_account_type(uuid, text, text, uuid)'::regprocedure)) > 0 then
    raise exception 'T5 the reset is still in the body';
  end if;
  raise notice 'T5 ok: service_role only, no reset';
end $$;

select 'l18_convert_keeps_verification: ALL OK' as result;
