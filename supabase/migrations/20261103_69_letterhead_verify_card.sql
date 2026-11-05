-- =============================================================================
-- Migration: 20261103_69_letterhead_verify_card.sql
-- The short card a verified, unpublished lawyer's QR opens, and its privacy
-- switch. Owner-free wave, S4 Task 22 (q343, report item ٢٥).
-- =============================================================================
--
-- WHAT IT ADDS
--   branding_vaults.verify_token     a random 32-character base32 token. Never
--                                    the user id. Written by the server only.
--   branding_vaults.qr_verify_card   the lawyer's switch, ON by default (the
--                                    owner's choice), written by the server only.
--   letterhead_verification_card()   what the public page may show: the name,
--                                    the licence number and the state. Every
--                                    other case answers the same {"state":"home"},
--                                    so a token reveals nothing and printed paper
--                                    never leads to a 404.
--   mint_letterhead_verify_token()   sets the token once and returns the stored
--                                    one, so two requests in a race agree.
--
-- WHO — both functions are service role only. No session grant is added: 63's
--   column grants stay exactly as they are, so a session's UPDATE of either
--   column is 42501. No RLS policy changes on any table, and nothing here reads
--   a migration of the skipped firm tasks (R32).
--
-- DEPENDS ON — public.branding_vaults (20261026_63), public.lawyer_profiles with
--   slug and marketplace_visible, public.profiles.
--
-- DEPLOY ORDER — BEFORE the deploy. The new code survives its absence: the
--   branding route answers verifyCard null (42703, PGRST202), the public page
--   sends the visitor home, and the switch answers 503. The old code never
--   reads these columns.
--
-- RE-RUN — re-running 20261026_63 is safe: it revokes and re-grants the same
--   column list, which does not name these two columns.
--
-- ROLLBACK — drop function if exists public.letterhead_verification_card(text);
--            drop function if exists public.mint_letterhead_verify_token(uuid, text);
--            alter table public.branding_vaults drop column if exists verify_token,
--              drop column if exists qr_verify_card;
-- Docker: supabase/tests/rls/letterhead_verify_card.test.sql (chain in its header).
-- =============================================================================

begin;

alter table public.branding_vaults
  add column if not exists verify_token text
    constraint branding_vaults_verify_token_key unique
    constraint branding_vaults_verify_token_shape check (verify_token ~ '^[a-z2-7]{32}$'),
  add column if not exists qr_verify_card boolean not null default true;

comment on column public.branding_vaults.verify_token is
  'q343: the token in a verified, unpublished lawyer''s QR. Random, never the user id. Server-written (20261103_69).';
comment on column public.branding_vaults.qr_verify_card is
  'q343: the lawyer''s privacy switch for the verification card. On by default. Server-written (20261103_69).';

-- ─────────────────────────────────────────────────────────────────────────────
-- The public answer. One word unless every condition holds.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.letterhead_verification_card(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_licence text;
  v_visible boolean;
  v_slug text;
begin
  if p_token is null or p_token !~ '^[a-z2-7]{32}$' then
    return jsonb_build_object('state', 'home');
  end if;

  select coalesce(nullif(b.display_name_ar, ''), p.display_name, ''), lp.license_number, lp.marketplace_visible, lp.slug
    into v_name, v_licence, v_visible, v_slug
    from public.branding_vaults b
    join public.lawyer_profiles lp on lp.user_id = b.lawyer_user_id
    join public.profiles p on p.id = b.lawyer_user_id
   where b.verify_token = p_token
     and b.lawyer_user_id is not null
     and b.qr_verify_card
     and lp.verification_status = 'verified';

  if not found then
    return jsonb_build_object('state', 'home');
  end if;

  return jsonb_build_object(
    'state', 'card',
    'name', v_name,
    'licence', v_licence,
    'published', coalesce(v_visible, false),
    'slug', case when coalesce(v_visible, false) then v_slug else null end
  );
end;
$$;

comment on function public.letterhead_verification_card(text) is
  'q343: the public verification card, or {"state":"home"}. Never the user id, phone or e-mail (20261103_69). Service role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The mint. VOLATILE: it writes.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mint_letterhead_verify_token(p_vault uuid, p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  update public.branding_vaults
     set verify_token = p_token
   where id = p_vault
     and verify_token is null;

  select b.verify_token into v_token from public.branding_vaults b where b.id = p_vault;
  return v_token;
end;
$$;

comment on function public.mint_letterhead_verify_token(uuid, text) is
  'q343: sets a vault''s verification token once and returns the stored one (20261103_69). Service role only.';

revoke all on function public.letterhead_verification_card(text) from public;
revoke all on function public.mint_letterhead_verify_token(uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.letterhead_verification_card(text) from anon;
    revoke all on function public.mint_letterhead_verify_token(uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.letterhead_verification_card(text) from authenticated;
    revoke all on function public.mint_letterhead_verify_token(uuid, text) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.letterhead_verification_card(text) to service_role;
    grant execute on function public.mint_letterhead_verify_token(uuid, text) to service_role;
  end if;
end $$;

commit;

-- Expected: one row, ok = true. ok is never NULL.
select coalesce(
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'branding_vaults' and column_name = 'verify_token')
         and exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'branding_vaults' and column_name = 'qr_verify_card')
         and not has_column_privilege('authenticated', 'public.branding_vaults', 'verify_token', 'UPDATE')
         and not has_column_privilege('authenticated', 'public.branding_vaults', 'qr_verify_card', 'UPDATE')
         and not has_function_privilege('anon', 'public.letterhead_verification_card(text)', 'EXECUTE')
         and not has_function_privilege('authenticated', 'public.letterhead_verification_card(text)', 'EXECUTE')
         and has_function_privilege('service_role', 'public.letterhead_verification_card(text)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.mint_letterhead_verify_token(uuid, text)', 'EXECUTE')
         and not has_function_privilege('authenticated', 'public.mint_letterhead_verify_token(uuid, text)', 'EXECUTE')
         and has_function_privilege('service_role', 'public.mint_letterhead_verify_token(uuid, text)', 'EXECUTE'),
         false) as ok;
