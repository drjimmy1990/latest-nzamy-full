-- =============================================================================
-- Migration: 20261208_52_l18_account_type_keeps_verification.sql
--            (batch l18-answers, verify id: l18_convert_keeps_verification)
-- =============================================================================
-- PURPOSE (owner answer ٢٢٣, 27 Nov 2026)
--   «لا يُعاد التوثيق إلى «قيد المراجعة» تلقائياً عند التحويل … وللإدارة
--   تعديله يدوياً عند الحاجة».
--
--   public.admin_change_account_type (20261206_80, batch l16) put the target
--   lawyer_profiles / provider_profiles row back to verification «pending» on
--   every conversion. This file re-creates the function WITHOUT that reset and
--   changes nothing else of it: the same checks (admin actor, not self, reason
--   5–1000, the three moves, the open-commitment blockers), the same snapshot,
--   the same conversion row and the same admin_audit_events row
--   (account_type_converted). The audit row now records the verification
--   state the account really has after the change (before_state / after_state
--   «verification»; metadata.verification_reset is always false), and the
--   function returns it as `verification`.
--
--   A row that did not exist before the conversion (individual → lawyer /
--   provider with no earlier sector row) is created with the column default
--   («pending») — that is a new row with no licence reviewed yet, not a reset.
--
-- ORDER: BEFORE the deploy of batch l18 (the admin card's new copy says the
--   verification is kept). Needs 20261206_80 (the function, its table and the
--   blockers). If 20261206_80 is ever re-run, re-run THIS file after it — the
--   older file brings the reset back.
-- DATA: none. No row is read or changed by this file (the function body only).
-- SAFE TO RE-RUN: yes (create or replace).
-- RUN: docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--        < supabase/migrations/20261208_52_l18_account_type_keeps_verification.sql
--   Expect: NOTICE  l18_convert_keeps_verification verify: OK …  and a row with `t`.
-- ROLLBACK: re-run supabase/migrations/20261206_80_admin_account_type_converter.sql
--   (it restores the l16 body with the reset).
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.admin_change_account_type(uuid, text, text, uuid)') is null
     or to_regprocedure('public.admin_account_type_blockers(uuid)') is null
     or to_regclass('public.account_type_conversions') is null then
    raise exception '20261208_52: run 20261206_80_admin_account_type_converter.sql first';
  end if;
end
$pre$;

create or replace function public.admin_change_account_type(
  p_user   uuid,
  p_target text,
  p_reason text,
  p_actor  uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_reason    text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_from_type text;
  v_from_kind text;
  v_to_type   text;
  v_lawyer    jsonb;
  v_provider  jsonb;
  v_archived  jsonb := '[]'::jsonb;
  v_blockers  text[];
  v_has_confirmed boolean;
  v_conv_id   bigint;
  v_prev_verification text;
  v_verification_kept text;
begin
  -- the caller
  if p_actor is null
     or not exists (select 1 from public.profiles a where a.id = p_actor and a.user_type = 'admin') then
    return jsonb_build_object('ok', false, 'code', 'actor_not_admin');
  end if;
  if p_user is null or p_user = p_actor then
    return jsonb_build_object('ok', false, 'code', 'self');
  end if;
  if pg_catalog.char_length(v_reason) < 5 or pg_catalog.char_length(v_reason) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  if p_target is null or p_target not in ('advocate', 'consultant', 'notary', 'arbitrator', 'bailiff') then
    return jsonb_build_object('ok', false, 'code', 'bad_target');
  end if;

  -- the account, locked for the whole conversion
  select p.user_type into v_from_type from public.profiles p where p.id = p_user for update;
  if v_from_type is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select pg_catalog.to_jsonb(l) into v_lawyer from public.lawyer_profiles l where l.user_id = p_user for update;
  select pg_catalog.to_jsonb(v) into v_provider from public.provider_profiles v where v.user_id = p_user for update;
  v_to_type := case when p_target in ('advocate', 'consultant') then 'lawyer' else 'provider' end;

  if v_from_type = 'lawyer' then
    v_from_kind := coalesce(v_lawyer ->> 'practice_kind', 'advocate');
  elsif v_from_type = 'provider' then
    v_from_kind := v_provider ->> 'sub_role';
  end if;

  -- the three moves of this slice
  if not (
       (v_from_type = 'lawyer' and v_to_type = 'lawyer' and v_from_kind is distinct from p_target)
    or (v_from_type = 'individual')
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_supported', 'from_type', v_from_type, 'from_kind', v_from_kind);
  end if;

  v_blockers := public.admin_account_type_blockers(p_user);
  if pg_catalog.cardinality(v_blockers) > 0 then
    return jsonb_build_object('ok', false, 'code', 'open_commitments', 'blockers', pg_catalog.to_jsonb(v_blockers));
  end if;

  -- archive: a snapshot of every sector row the account had (nothing deleted)
  if v_lawyer is not null then
    v_archived := v_archived || jsonb_build_array(jsonb_build_object('table', 'lawyer_profiles', 'row', v_lawyer));
  end if;
  if v_provider is not null then
    v_archived := v_archived || jsonb_build_array(jsonb_build_object('table', 'provider_profiles', 'row', v_provider));
  end if;

  v_has_confirmed := exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = 'lawyer_profiles'
                                and column_name = 'practice_kind_confirmed_at');

  -- the verification state the target row had before (NULL = no row yet)
  v_prev_verification := case when v_to_type = 'lawyer' then v_lawyer ->> 'verification_status'
                              else v_provider ->> 'verification_status' end;

  if v_to_type = 'lawyer' then
    -- a new row starts «pending» (the column default); the signup trigger may
    -- read old signup metadata, so the kind is written explicitly after it
    insert into public.lawyer_profiles (user_id) values (p_user)
      on conflict (user_id) do nothing;
    if v_has_confirmed then
      execute 'update public.lawyer_profiles set practice_kind = $2, practice_kind_confirmed_at = now() where user_id = $1'
        using p_user, p_target;
    else
      update public.lawyer_profiles set practice_kind = p_target where user_id = p_user;
    end if;
  else
    insert into public.provider_profiles (user_id, sub_role) values (p_user, p_target)
      on conflict (user_id) do update set sub_role = excluded.sub_role;
  end if;

  -- Owner answer ٢٢٣ (27 Nov 2026, batch l18): the conversion no longer puts
  -- the licence verification back to «pending». The row the account now works
  -- under keeps the state it had; a row created just above starts with the
  -- column default (a fresh row, not a reset). The admin changes the state by
  -- hand when needed. The state after is read back for the audit row.
  v_verification_kept := case when v_to_type = 'lawyer'
                                then (select l.verification_status from public.lawyer_profiles l where l.user_id = p_user)
                              else (select v.verification_status from public.provider_profiles v where v.user_id = p_user) end;

  if v_from_type <> v_to_type then
    update public.profiles set user_type = v_to_type where id = p_user;
  end if;

  insert into public.account_type_conversions
    (user_id, actor_id, from_type, from_kind, to_type, to_kind, reason, archived_rows)
  values
    (p_user, p_actor, v_from_type, v_from_kind, v_to_type, p_target, v_reason, v_archived)
  returning id into v_conv_id;

  insert into public.admin_audit_events
    (actor_id, actor_type, action, target_type, target_id, before_state, after_state, metadata)
  values (
    p_actor, 'admin', 'account_type_converted', 'user', p_user::text,
    jsonb_build_object('user_type', v_from_type, 'kind', v_from_kind, 'verification', v_prev_verification),
    jsonb_build_object('user_type', v_to_type, 'kind', p_target, 'verification', v_verification_kept),
    jsonb_build_object('reason', v_reason, 'conversion_id', v_conv_id,
                       'verification_reset', false,
                       'archived_tables', (select coalesce(jsonb_agg(e ->> 'table'), '[]'::jsonb) from jsonb_array_elements(v_archived) e))
  );

  return jsonb_build_object(
    'ok', true,
    'conversion_id', v_conv_id,
    'from_type', v_from_type, 'from_kind', v_from_kind,
    'to_type', v_to_type, 'to_kind', p_target,
    'verification', v_verification_kept,
    'verification_before', v_prev_verification
  );
end
$fn$;

comment on function public.admin_change_account_type(uuid, text, text, uuid) is
  'l16 C14 (20261206_80) + owner ٢٢٣ (20261208_52): admin account-type conversion — advocate↔consultant, individual→lawyer (kind), individual→provider (sub_role). Refuses open commitments; snapshots the sector rows; KEEPS the verification state (no reset to pending; a new row starts with the column default); writes the audit row (verification before / after) and the conversion row in the same transaction; deletes nothing. Service role only.';

-- privileges: unchanged by create or replace, re-asserted (service_role only)
revoke all on function public.admin_change_account_type(uuid, text, text, uuid) from public;
do $g$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke all on function public.admin_change_account_type(uuid, text, text, uuid) from anon;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    revoke all on function public.admin_change_account_type(uuid, text, text, uuid) from authenticated;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_change_account_type(uuid, text, text, uuid) to service_role;
  end if;
end
$g$;

do $verify$
declare
  f constant text := 'public.admin_change_account_type(uuid, text, text, uuid)';
  d text := coalesce(pg_catalog.pg_get_functiondef(to_regprocedure(f)), '');
  missing text := '';
  r text;
begin
  if position('set verification_status = ''pending''' in d) > 0 then
    missing := missing || ' the converter still resets the verification to pending;';
  end if;
  if position('v_verification_kept' in d) = 0 then
    missing := missing || ' the converter does not record the kept verification;';
  end if;
  if position('open_commitments' in d) = 0 or position('admin_account_type_blockers' in d) = 0 then
    missing := missing || ' the converter no longer refuses open commitments;';
  end if;
  if position('account_type_converted' in d) = 0 then
    missing := missing || ' the converter no longer writes the audit row;';
  end if;
  if position('delete from' in lower(d)) > 0 then
    missing := missing || ' the converter deletes a row;';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc where oid = to_regprocedure(f) and prosecdef and proconfig @> array['search_path=""']) then
    missing := missing || ' the converter is not SECURITY DEFINER with an empty search_path;';
  end if;
  if has_function_privilege('public', f, 'EXECUTE') then
    missing := missing || ' PUBLIC may execute the converter;';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) and has_function_privilege(r, f, 'EXECUTE') then
      missing := missing || format(' %s may execute the converter;', r);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') and not has_function_privilege('service_role', f, 'EXECUTE') then
    missing := missing || ' service_role cannot execute the converter;';
  end if;
  if missing <> '' then
    raise exception 'l18_convert_keeps_verification verify FAILED:%', missing;
  end if;
  raise notice 'l18_convert_keeps_verification verify: OK — the account-type converter keeps the verification state (no reset to pending), still refuses open commitments, writes the audit row, deletes nothing, service_role only';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261208_52 l18 account type keeps verification' as migration, true as ok;
