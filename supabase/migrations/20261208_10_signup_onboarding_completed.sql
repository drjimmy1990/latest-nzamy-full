-- =============================================================================
-- Migration: 20261208_10_signup_onboarding_completed.sql   (batch l18, verify id: l18_signup)
-- =============================================================================
-- PURPOSE (owner package 26 Nov 2026, LIVE-01 part B)
--   An account created through one of the sign-up FORMS (/register/client,
--   /register/provider) was sent through the 4-step onboarding wizard after
--   its WhatsApp code, asking again what the form had just asked. The form
--   sends `onboarding_completed: true` in the sign-up metadata, but
--   public.handle_new_user() has not copied that key since 20260616 (its
--   latest body, 20260921_04, inserts id, names, e-mail, type, phone, city,
--   country only), and the column defaults to false.
--
--   1. public.profiles_form_signup_onboarded() + a BEFORE INSERT trigger on
--      public.profiles: when the auth.users row being created is an e-mail
--      sign-up (raw_app_meta_data.provider = 'email', written by GoTrue, not
--      by the browser), carries a user_type (the forms always send one; a
--      Google sign-up does not) and asks for onboarding_completed = true,
--      the new profile starts completed. A Google sign-up keeps the wizard:
--      it has not chosen its role yet.
--      handle_new_user() itself is NOT re-created (no ~150-line carry-forward,
--      no drift from the live body): the same pattern as the lawyer_profiles
--      trigger of 20261019_20 and the firm_profiles trigger of 20261126_50.
--      It adds no new trust: the account may already set this one column
--      itself (column-level UPDATE grant, 20261016_02), and the edge still
--      sends anyone without a valid mobile to the wizard (onboardingGate.ts).
--   2. A guarded one-time backfill for the accounts already caught: a
--      confirmed mobile (phone_verified_at), not admin, still marked
--      unfinished, an `email` identity and NO `google` identity, and the
--      form's user_type in the sign-up metadata. NOT «user_type + phone
--      confirmed» alone: handle_new_user files every Google account as
--      'individual', so that rule would let a Google user skip choosing his
--      real role. Prints how many rows it changed; a re-run changes 0.
--   3. Verify block — RAISES unless 1 holds.
--   The app half (deployed with this batch): verifyPhoneOtp marks a form
--   sign-up onboarded when its mobile is confirmed (src/lib/phoneOtp/service.ts,
--   isFormSignup), and /register/provider now sends onboarding_completed: true.
--
-- PREVIEW (read-only, before running — how many rows the backfill will change):
--   select count(*) from public.profiles p
--    where p.onboarding_completed = false and p.phone_verified_at is not null
--      and p.user_type <> 'admin'
--      and exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'email')
--      and not exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'google')
--      and exists (select 1 from auth.users u where u.id = p.id
--                   and nullif(btrim(u.raw_user_meta_data->>'user_type'), '') is not null);
--
-- HOW TO RUN (on the server, from the project folder):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261208_10_signup_onboarding_completed.sql
--   Expect: NOTICE  20261208_10 backfill: N profile(s) marked onboarding complete …
--           NOTICE  l18_signup verify: OK …   and a final row with `t`.
--
-- RUN ORDER: AFTER the deploy of batch l18. Run before it, the old pages
--   would send a new client sign-up past the wizard while the plan chosen on
--   /pricing still waits for the wizard (the new /verify-phone sends it on to
--   payment). Then _verify.sql (block l18_signup).
-- SAFE TO RE-RUN: yes (create or replace, drop trigger if exists; the
--   backfill touches only rows still false).
-- ROLLBACK (the backfilled rows stay completed — that is what they are):
--   drop trigger if exists trg_profiles_form_signup_onboarded on public.profiles;
--   drop function if exists public.profiles_form_signup_onboarded();
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. preconditions ────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.profiles') is null or to_regclass('auth.users') is null then
    raise exception '20261208_10: public.profiles / auth.users are missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding_completed') then
    raise exception '20261208_10: profiles.onboarding_completed is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'auth' and table_name = 'users' and column_name = 'raw_app_meta_data')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'auth' and table_name = 'users' and column_name = 'raw_user_meta_data') then
    raise exception '20261208_10: auth.users.raw_app_meta_data / raw_user_meta_data are missing';
  end if;
end
$pre$;

-- ── 1. a form sign-up's profile starts completed ───────────────────────────
create or replace function public.profiles_form_signup_onboarded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.onboarding_completed is distinct from true
     and exists (
       select 1
         from auth.users u
        where u.id = new.id
          and u.raw_app_meta_data ->> 'provider' = 'email'
          and nullif(btrim(u.raw_user_meta_data ->> 'user_type'), '') is not null
          and u.raw_user_meta_data ->> 'onboarding_completed' = 'true'
     ) then
    new.onboarding_completed := true;
  end if;
  return new;
end
$fn$;

comment on function public.profiles_form_signup_onboarded() is
  'LIVE-01 (l18): a profile created for an e-mail sign-up from the forms (user_type and onboarding_completed=true in the sign-up metadata) starts with onboarding_completed = true. Google sign-ups keep the wizard. See 20261208_10.';

revoke all on function public.profiles_form_signup_onboarded() from public, anon, authenticated;

drop trigger if exists trg_profiles_form_signup_onboarded on public.profiles;
create trigger trg_profiles_form_signup_onboarded
  before insert on public.profiles
  for each row execute function public.profiles_form_signup_onboarded();

-- ── 2. backfill (guarded, counted, re-runnable) ─────────────────────────────
do $backfill$
declare
  v_changed integer;
begin
  if to_regclass('auth.identities') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone_verified_at') then
    raise notice '20261208_10 backfill: skipped (auth.identities or profiles.phone_verified_at is missing here) — 0 rows changed';
    return;
  end if;

  update public.profiles p
     set onboarding_completed = true
   where p.onboarding_completed = false
     and p.phone_verified_at is not null
     and p.user_type <> 'admin'
     and exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'email')
     and not exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'google')
     and exists (select 1 from auth.users u
                  where u.id = p.id
                    and nullif(btrim(u.raw_user_meta_data ->> 'user_type'), '') is not null);
  get diagnostics v_changed = row_count;
  raise notice '20261208_10 backfill: % profile(s) marked onboarding complete (form sign-ups with a confirmed mobile; Google and admin accounts untouched)', v_changed;
end
$backfill$;

-- ── 3. verify ───────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
begin
  if not exists (select 1 from pg_proc
                  where oid = to_regprocedure('public.profiles_form_signup_onboarded()')
                    and prosecdef and proconfig @> array['search_path=""']) then
    missing := missing || ' profiles_form_signup_onboarded() is not SECURITY DEFINER with an empty search_path;';
  end if;
  if has_function_privilege('anon', 'public.profiles_form_signup_onboarded()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.profiles_form_signup_onboarded()', 'EXECUTE') then
    missing := missing || ' a session may execute profiles_form_signup_onboarded();';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.profiles'::regclass
                    and t.tgname = 'trg_profiles_form_signup_onboarded'
                    and not t.tgisinternal
                    and t.tgenabled <> 'D'
                    and t.tgfoid = to_regprocedure('public.profiles_form_signup_onboarded()')
                    and (t.tgtype & 2) = 2      -- BEFORE
                    and (t.tgtype & 4) = 4      -- INSERT
                    and (t.tgtype & 1) = 1) then -- FOR EACH ROW
    missing := missing || ' trg_profiles_form_signup_onboarded is not a BEFORE INSERT row trigger on public.profiles;';
  end if;
  if position('''provider'' = ''email''' in pg_catalog.pg_get_functiondef(to_regprocedure('public.profiles_form_signup_onboarded()'))) = 0 then
    missing := missing || ' the trigger does not require an e-mail sign-up;';
  end if;

  if missing <> '' then
    raise exception 'l18_signup verify FAILED:%', missing;
  end if;
  raise notice 'l18_signup verify: OK — a form sign-up''s profile starts onboarding_completed (e-mail sign-ups with a user_type only); Google sign-ups keep the wizard';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261208_10 signup_onboarding_completed' as migration, true as ok;
