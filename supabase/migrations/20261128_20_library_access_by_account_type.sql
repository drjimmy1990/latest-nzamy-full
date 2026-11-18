-- =============================================================================
-- Migration: 20261128_20_library_access_by_account_type.sql
-- =============================================================================
-- PURPOSE (owner message 18 Nov 2026, item 9 + question ٥٨; batch l8-liblock)
--
--   1. The library is open per ACCOUNT TYPE until the campaign settles:
--        platform_settings 'library_access_by_account_type'
--          {"lawyer": true, "consultant": false, "firm": false,
--           "individual": false, "business": false, "provider": false}
--      inserted only when missing (an admin's value is never reset). Edited at
--      /dashboard/admin/library-access (PUT /api/v1/admin/library-access,
--      requireStaff("settings.write"), audited before/after). Takes effect on
--      the next request (never cached).
--        lawyer      profiles.user_type 'lawyer' (a firm member who is a lawyer
--                    keeps it; no lawyer_profiles row = an advocate)
--        consultant  'lawyer' whose lawyer_profiles.practice_kind = 'consultant'
--        firm        'firm' (the firm account itself)
--        individual  'individual'
--        business    'corporate', 'micro', 'government', 'ngo'
--        provider    'provider' (not in the owner's list: closed like the rest)
--        admin       always open (no switch)
--      A key missing from the stored map, or not a boolean, keeps its default.
--
--   2. public.library_access_user_overrides — an admin's exception for ONE
--      account (a team member, a trial): allowed true opens, false closes,
--      whatever the type's switch says. Written only by the admin route
--      (service role), audited there. RLS on, no policy, no session grant.
--
--   3. public.library_access_for(p_user) → (allowed, account_key, via) — THE
--      rule, used by the app (src/lib/library/accountAccessServer.ts asks it
--      on every signed-in library request, checkout of a library plan and the
--      library assistant) and by the free questions below. via = admin |
--      override | type | no_profile. Service role only.
--
--   4. ٥٨ — public.ai_free_question_status(p_user), copied from its LATEST
--      definition (20261127_40) with one change: the allowance is 0 unless
--        * the account's e-mail is verified (auth.users.email_confirmed_at), and
--        * the library is open for the account (library_access_for).
--      ai_start_free_question (20261127_40) reads its allowance from this
--      function under the start lock, so it is NOT re-created: a locked or
--      unverified account gets free_question_not_eligible and the question is
--      charged the normal way. Reopening a type gives the questions back
--      (nothing is spent while it is closed). "Once per account" is the
--      existing lifetime allowance (10 lawyer / 5 individual); Turnstile is
--      already required at signup.
--
-- WHO CAN DO WHAT
--   library_access_for, ai_free_question_status: EXECUTE for service_role
--   only, SECURITY DEFINER, search_path ''. The overrides table: service role
--   only. The setting row is a platform_settings row like the others.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261128_20_library_access_by_account_type.sql
--   Expect: NOTICE  l8_liblock verify: OK  and a row with `t`.
--
-- RUN ORDER: any time after 20261127_40 (batch 7, already live); before or
--   after the l8 deploy.
--   * Code first: the app applies the same rule itself (the setting row
--     missing → the defaults: only lawyers open; the overrides table missing →
--     no exceptions; the admin page saves the map — the row is upserted — but
--     refuses an exception until this file has run). The free questions still
--     follow the 20261127_40 function, and the app itself hides them from an
--     unverified or locked account.
--   * SQL first with the old code: nothing changes for the old code except
--     the free questions (an unverified or locked account has none).
--   RE-RUN HAZARD: re-running 20261127_40 brings back its
--   ai_free_question_status (no e-mail / lock rule). Re-run this file after
--   it. This file itself is safe to run any number of times.
--
-- ROLLBACK (in one transaction):
--   1. re-run section 5 («ai_free_question_status» only) of
--      20261127_40_points_wallets.sql;
--   2. drop function if exists public.library_access_for(uuid);
--      drop table if exists public.library_access_user_overrides;
--   3. delete from public.platform_settings where key = 'library_access_by_account_type';
--      (the app then answers its defaults: lawyers only — to open everyone,
--      set every key to true instead of deleting the row)
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 1. the switch (never reset an admin's value) ─────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('library_access_by_account_type',
   '{"lawyer": true, "consultant": false, "firm": false, "individual": false, "business": false, "provider": false}'::jsonb,
   'المكتبة القانونية مفتوحة لكل نوع حساب أو مغلقة (المحامي مفتوح والباقي مغلق افتراضياً) — owner item 9 (20261128_20)')
on conflict (key) do nothing;

-- ── 2. per-account exceptions ────────────────────────────────────────────────
create table if not exists public.library_access_user_overrides (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  allowed    boolean not null,
  reason     text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint library_access_user_overrides_reason_len check (char_length(reason) <= 500)
);

comment on table public.library_access_user_overrides is
  'Owner item 9 (20261128_20): an admin''s library exception for one account — allowed true opens the library whatever its type''s switch, false closes it. Written by /api/v1/admin/library-access only (audited there). Server only.';

alter table public.library_access_user_overrides enable row level security;
revoke all on public.library_access_user_overrides from anon, authenticated, public;
grant all on public.library_access_user_overrides to service_role;

-- ── 3. the rule ──────────────────────────────────────────────────────────────
create or replace function public.library_access_for(p_user uuid)
returns table (allowed boolean, account_key text, via text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type     text;
  v_kind     text;
  v_key      text;
  v_override boolean;
  v_map      jsonb;
begin
  if p_user is null then
    raise exception 'library_access_for: p_user is required' using errcode = '22023';
  end if;

  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type is null then
    return query select false, null::text, 'no_profile'::text;
    return;
  end if;
  if v_type = 'admin' then
    return query select true, 'admin'::text, 'admin'::text;
    return;
  end if;

  if v_type = 'lawyer' then
    select lp.practice_kind into v_kind from public.lawyer_profiles lp where lp.user_id = p_user;
  end if;
  v_key := case
    when v_type = 'lawyer' then case when v_kind = 'consultant' then 'consultant' else 'lawyer' end
    when v_type in ('firm', 'individual', 'provider') then v_type
    when v_type in ('corporate', 'micro', 'government', 'ngo') then 'business'
    else null end;

  select o.allowed into v_override from public.library_access_user_overrides o where o.user_id = p_user;
  if v_override is not null then
    return query select v_override, v_key, 'override'::text;
    return;
  end if;

  if v_key is null then
    return query select false, null::text, 'type'::text;
    return;
  end if;

  select ps.value into v_map from public.platform_settings ps where ps.key = 'library_access_by_account_type';
  return query select
    case when jsonb_typeof(v_map -> v_key) = 'boolean' then (v_map ->> v_key)::boolean
         else v_key = 'lawyer' end,
    v_key, 'type'::text;
end;
$$;

comment on function public.library_access_for(uuid) is
  'Owner item 9 (20261128_20): may this account use the legal library? admin → open; a library_access_user_overrides row → its allowed; else platform_settings.library_access_by_account_type by account key (lawyer / consultant by practice_kind / firm / individual / business = corporate, micro, government, ngo / provider); a missing key → open for lawyer only. Service role only.';

revoke all on function public.library_access_for(uuid) from public, anon, authenticated;
grant execute on function public.library_access_for(uuid) to service_role;

-- ── 4. ٥٨: free questions only for a verified e-mail and an open library ─────
-- Copied from 20261127_40 (its latest definition); the two rules are the
-- block after v_allow.
create or replace function public.ai_free_question_status(p_user uuid)
returns table (allowance int, used int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type  text;
  v_set   jsonb;
  v_allow int;
begin
  if p_user is null then
    raise exception 'ai_free_question_status: p_user is required' using errcode = '22023';
  end if;
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  select ps.value into v_set from public.platform_settings ps where ps.key = 'free_questions_by_account_type';
  v_allow := case
    when v_type is null then 0
    when v_set is null then case v_type when 'lawyer' then 10 when 'individual' then 5 else 0 end
    when jsonb_typeof(v_set -> v_type) = 'number' then greatest(0, floor((v_set ->> v_type)::numeric))::int
    else 0 end;
  -- 20261128_20 (٥٨, owner item 9.7): only an e-mail-verified account, and
  -- only while the library is open for it. Nothing is used up meanwhile.
  if v_allow > 0 and (
       not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null)
       or not coalesce((select a.allowed from public.library_access_for(p_user) a), false)) then
    v_allow := 0;
  end if;
  return query
    select v_allow,
           (select count(*)::int from public.ai_free_question_uses u
              join public.ai_runs r on r.id = u.run_id
             where u.user_id = p_user and r.status <> 'failed');
end;
$$;

comment on function public.ai_free_question_status(uuid) is
  'Owner ٣٠ (20261127_40) + ٥٨ (20261128_20): the account''s lifetime free library-assistant questions — allowance from platform_settings.free_questions_by_account_type by profiles.user_type (no row: lawyer 10, individual 5), 0 unless the e-mail is verified and library_access_for says the library is open for the account; used = its free runs that did not fail. Service role only.';

revoke all on function public.ai_free_question_status(uuid) from public, anon, authenticated;
grant execute on function public.ai_free_question_status(uuid) to service_role;

-- ── 5. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  fn text;
begin
  if not exists (select 1 from public.platform_settings where key = 'library_access_by_account_type') then
    raise exception 'l8_liblock verify: the library_access_by_account_type setting is missing';
  end if;
  if to_regclass('public.library_access_user_overrides') is null
     or not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.library_access_user_overrides')), false) then
    raise exception 'l8_liblock verify: library_access_user_overrides is missing or has RLS off';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and (has_table_privilege('authenticated', 'public.library_access_user_overrides', 'SELECT')
          or has_table_privilege('anon', 'public.library_access_user_overrides', 'SELECT')) then
    raise exception 'l8_liblock verify: a session role can read library_access_user_overrides';
  end if;
  foreach fn in array array['public.library_access_for(uuid)', 'public.ai_free_question_status(uuid)'] loop
    if not exists (select 1 from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)
                    and p.prosecdef and p.proconfig @> array['search_path=""']) then
      raise exception 'l8_liblock verify: % is missing or not SECURITY DEFINER with search_path ''''', fn;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and (has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')) then
      raise exception 'l8_liblock verify: a session role can EXECUTE %', fn;
    end if;
  end loop;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_free_question_status(uuid)'::regprocedure), 'library_access_for') = 0
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_free_question_status(uuid)'::regprocedure), 'email_confirmed_at') = 0 then
    raise exception 'l8_liblock verify: ai_free_question_status lacks the e-mail / library rule (20261127_40 re-run after this file?)';
  end if;
  raise notice 'l8_liblock verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261128_20 library access by account type (switch + exceptions + library_access_for; ٥٨ free questions)' as step,
       (exists (select 1 from public.platform_settings where key = 'library_access_by_account_type')
        and to_regclass('public.library_access_user_overrides') is not null
        and to_regprocedure('public.library_access_for(uuid)') is not null
        and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_free_question_status(uuid)'::regprocedure), 'library_access_for') > 0) as ok;
