-- =============================================================================
-- Migration: 20261026_63_branding_vault.sql
-- Plan: docs/plans/2026-10-25-owner-answers-10-25-phases-plan.md, phase D4.
-- Owner decision ٢٥٦: the official letterhead is open to BOTH the individual
-- licensed lawyer and the law firm, with the platform's Arabic wordmark and
-- smart QR in the footer / stamp.
-- Replaces the owner's own draft 20261019_vault_lawyer_branding.sql (never in
-- this repo), which read a `profiles.role` column that does not exist.
-- Run in the SQL editor (postgres). The Storage policies are a SEPARATE file,
-- supabase/storage_policies_branding.sql, run AFTER this one as supabase_admin
-- (storage.objects belongs to supabase_storage_admin — see 17_AFTER_16).
-- =============================================================================
--
-- WHAT IT ADDS
--   1. public.branding_vaults — one row per letterhead owner, EXACTLY one of:
--        lawyer_user_id  an individual lawyer (profiles.user_type = 'lawyer');
--        firm_id         a law firm (public.firm_profiles).
--      Display names (ar/en), address, phone, e-mail, website, the accent
--      colour (default the platform gold #C8A762) and the path of an optional
--      own logo in the `branding` bucket.
--      The LICENCE NUMBER is not stored here: the letterhead reads it from the
--      verified profile (lawyer_profiles / firm_profiles) and prints it only
--      when verification_status = 'verified'.
--
--   2. Who may read and write a vault — public.can_manage_branding_vault():
--        a lawyer vault: that lawyer himself, and only while his account is a
--          lawyer account;
--        a firm vault:   the firm's owner (firm_profiles.owner_user_id) or an
--          ACTIVE firm_members row with role managing_partner or office_admin
--          — the roles the firm dashboard already lets into its identity page
--          (src/constants/entityRouteAccess.ts, /dashboard/firm/branding).
--      Nobody else: not a colleague, not a client, not a guest. No admin read
--      either (the vault is the office's own stationery). service_role: all.
--
--   3. Column privileges: sessions INSERT the owner column and the text
--      fields, UPDATE the text fields only. `logo_path` is written by the
--      server's upload route alone (service role, after it has proved the
--      caller manages the vault): a session that could write it could point
--      its vault at someone else's object and have the server sign it.
--      A CHECK also ties logo_path to the vault's own folder. No session
--      DELETE (clearing the fields is the reset; a deleted row would orphan
--      the logo object).
--
--   4. The `branding` Storage bucket — PRIVATE, 1 MB, image/png, image/jpeg,
--      image/webp only. No SVG: an SVG is a document that can carry script.
--      (The upload route also checks the file's magic bytes; the bucket's MIME
--      list trusts the Content-Type the client declares.)
--      Objects live at  u/<lawyer uid>/logo-<random>.<ext>
--                  or   f/<firm id>/logo-<random>.<ext>.
--      public.can_manage_branding_object(name) answers the owner-only Storage
--      policies of supabase/storage_policies_branding.sql: false (never an
--      error) for any name that is not one of those two shapes.
--
-- Re-runnable: `if not exists`, `create or replace`, policies dropped by name,
-- the bucket upserted. One transaction. Ends with a self-check and
-- notify pgrst.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.firm_profiles') is null
     or to_regclass('public.firm_members') is null then
    raise exception '20261026_63: public.profiles / public.firm_profiles / public.firm_members missing — apply 20260903_phase2_clients_and_firm_membership.sql first';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.branding_vaults (
  id               uuid primary key default gen_random_uuid(),
  lawyer_user_id   uuid references public.profiles(id) on delete cascade,
  firm_id          uuid references public.firm_profiles(id) on delete cascade,
  display_name_ar  text not null default '',
  display_name_en  text not null default '',
  address          text not null default '',
  phone            text not null default '',
  email            text not null default '',
  website          text not null default '',
  accent_color     text not null default '#C8A762',
  logo_path        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  constraint branding_vaults_one_owner check (num_nonnulls(lawyer_user_id, firm_id) = 1),
  constraint branding_vaults_lawyer_key unique (lawyer_user_id),
  constraint branding_vaults_firm_key unique (firm_id),
  constraint branding_vaults_accent_hex check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint branding_vaults_lengths check (
        char_length(display_name_ar) <= 120 and char_length(display_name_en) <= 120
    and char_length(address) <= 300 and char_length(phone) <= 40
    and char_length(email) <= 160 and char_length(website) <= 200),
  constraint branding_vaults_email_shape check (email = '' or email ~ '^[^[:space:]@<>"]+@[^[:space:]@<>"]+\.[^[:space:]@<>"]+$'),
  constraint branding_vaults_website_shape check (website = '' or website ~* '^https?://[^[:space:]<>"]+$'),
  constraint branding_vaults_logo_path_shape check (
    logo_path is null or (
      logo_path ~ '^[uf]/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo-[a-z0-9]{8,40}\.(png|jpg|webp)$'
      and split_part(logo_path, '/', 1) = case when lawyer_user_id is not null then 'u' else 'f' end
      and split_part(logo_path, '/', 2) = coalesce(lawyer_user_id, firm_id)::text))
);

comment on table public.branding_vaults is
  'D4 (owner ٢٥٦): letterhead identity of one individual lawyer or one law firm. Licence number is read from the verified profile, never stored here. 20261026_63.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Who manages a vault
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_manage_branding_vault(p_lawyer uuid, p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(case
    when p_lawyer is not null and p_firm is null then
      p_lawyer = auth.uid()
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'lawyer')
    when p_firm is not null and p_lawyer is null then
      exists (select 1 from public.firm_profiles f where f.id = p_firm and f.owner_user_id = auth.uid())
      or exists (select 1 from public.firm_members m
                  where m.firm_id = p_firm and m.user_id = auth.uid()
                    and m.status = 'active' and m.role in ('managing_partner', 'office_admin'))
    else false
  end, false);
$$;

-- The Storage side: 'u/<uuid>/<file>' or 'f/<uuid>/<file>', exactly three
-- segments. Anything else is false — a malformed folder never raises 22P02.
create or replace function public.can_manage_branding_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text := split_part(coalesce(p_name, ''), '/', 1);
  v_id   text := split_part(coalesce(p_name, ''), '/', 2);
begin
  if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or split_part(p_name, '/', 3) = '' or split_part(p_name, '/', 4) <> '' then
    return false;
  end if;
  if v_kind = 'u' then
    return public.can_manage_branding_vault(v_id::uuid, null);
  elsif v_kind = 'f' then
    return public.can_manage_branding_vault(null, v_id::uuid);
  end if;
  return false;
end;
$$;

revoke all on function public.can_manage_branding_vault(uuid, uuid) from public;
revoke all on function public.can_manage_branding_object(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.can_manage_branding_vault(uuid, uuid) from anon;
    revoke all on function public.can_manage_branding_object(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.can_manage_branding_vault(uuid, uuid) to authenticated;
    grant execute on function public.can_manage_branding_object(text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.can_manage_branding_vault(uuid, uuid) to service_role;
    grant execute on function public.can_manage_branding_object(text) to service_role;
  end if;
end $$;

-- Stamp: updated_at always, updated_by when a session wrote it.
create or replace function public.branding_vaults_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_branding_vaults_touch on public.branding_vaults;
create trigger trg_branding_vaults_touch
  before insert or update on public.branding_vaults
  for each row execute function public.branding_vaults_touch();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS and privileges
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.branding_vaults enable row level security;

drop policy if exists "branding_vaults: manager reads" on public.branding_vaults;
drop policy if exists "branding_vaults: manager creates" on public.branding_vaults;
drop policy if exists "branding_vaults: manager updates" on public.branding_vaults;

create policy "branding_vaults: manager reads" on public.branding_vaults
  for select to authenticated
  using (public.can_manage_branding_vault(lawyer_user_id, firm_id));
create policy "branding_vaults: manager creates" on public.branding_vaults
  for insert to authenticated
  with check (public.can_manage_branding_vault(lawyer_user_id, firm_id) and logo_path is null);
create policy "branding_vaults: manager updates" on public.branding_vaults
  for update to authenticated
  using (public.can_manage_branding_vault(lawyer_user_id, firm_id))
  with check (public.can_manage_branding_vault(lawyer_user_id, firm_id));

revoke all on public.branding_vaults from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.branding_vaults from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.branding_vaults from authenticated;
    grant select on public.branding_vaults to authenticated;
    grant insert (lawyer_user_id, firm_id, display_name_ar, display_name_en, address, phone, email, website, accent_color)
      on public.branding_vaults to authenticated;
    grant update (display_name_ar, display_name_en, address, phone, email, website, accent_color)
      on public.branding_vaults to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.branding_vaults to service_role;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The bucket (private, 1 MB, png / jpeg / webp)
-- ─────────────────────────────────────────────────────────────────────────────
-- storage.buckets is normally writable by postgres (20260716 created
-- blog-covers the same way). If this project refuses it, storage_policies_
-- branding.sql (run as supabase_admin) creates the same bucket.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '20261026_63: storage.buckets not found — the branding bucket is created by storage_policies_branding.sql';
    return;
  end if;
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('branding', 'branding', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  exception when insufficient_privilege then
    raise warning '20261026_63: this role may not write storage.buckets — run storage_policies_branding.sql as supabase_admin, it creates the bucket';
  end;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Self-check
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare c text; r text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.branding_vaults'::regclass) then
    raise exception '20261026_63 verify: RLS is off on branding_vaults';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.branding_vaults'::regclass) <> 3 then
    raise exception '20261026_63 verify: branding_vaults must carry exactly the 3 policies of this file';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.branding_vaults'::regclass and polcmd in ('d', '*')) then
    raise exception '20261026_63 verify: a DELETE / ALL policy is on branding_vaults';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    foreach c in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.branding_vaults', c) then
        raise exception '20261026_63 verify: guests hold % on branding_vaults', c;
      end if;
    end loop;
    foreach r in array array['public.can_manage_branding_vault(uuid, uuid)', 'public.can_manage_branding_object(text)'] loop
      if has_function_privilege('anon', r, 'EXECUTE') then
        raise exception '20261026_63 verify: guests can EXECUTE %', r;
      end if;
    end loop;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_table_privilege('authenticated', 'public.branding_vaults', 'DELETE') then
      raise exception '20261026_63 verify: sessions can DELETE a vault';
    end if;
    foreach c in array array['logo_path', 'lawyer_user_id', 'firm_id', 'id', 'created_at', 'updated_at', 'updated_by'] loop
      if has_column_privilege('authenticated', 'public.branding_vaults', c, 'UPDATE') then
        raise exception '20261026_63 verify: sessions can UPDATE branding_vaults.%', c;
      end if;
    end loop;
    if has_column_privilege('authenticated', 'public.branding_vaults', 'logo_path', 'INSERT') then
      raise exception '20261026_63 verify: sessions can INSERT branding_vaults.logo_path';
    end if;
    foreach r in array array['public.can_manage_branding_vault(uuid, uuid)', 'public.can_manage_branding_object(text)'] loop
      if not has_function_privilege('authenticated', r, 'EXECUTE') then
        raise exception '20261026_63 verify: sessions cannot EXECUTE % — the Storage policies would deny every upload', r;
      end if;
    end loop;
  end if;
  foreach r in array array['public.can_manage_branding_vault(uuid, uuid)', 'public.can_manage_branding_object(text)'] loop
    if not (select prosecdef from pg_proc where oid = to_regprocedure(r))
       or not exists (select 1 from pg_proc where oid = to_regprocedure(r) and proconfig @> array['search_path=""']) then
      raise exception '20261026_63 verify: % is not SECURITY DEFINER with search_path ''''', r;
    end if;
  end loop;
  if to_regclass('storage.buckets') is not null
     and not exists (select 1 from storage.buckets where id = 'branding' and public = false) then
    raise warning '20261026_63 verify: the private bucket «branding» is not there yet — run storage_policies_branding.sql as supabase_admin';
  end if;
  raise notice '20261026_63 verify: OK — branding_vaults: one lawyer or one firm per row, read/write by the lawyer himself or the firm''s owner / managing partner / office admin only, logo_path server-only, no session delete; private bucket branding (1 MB, png/jpeg/webp)';
end $$;

commit;
notify pgrst, 'reload schema';
