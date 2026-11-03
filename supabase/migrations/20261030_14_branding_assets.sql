-- =============================================================================
-- Migration: 20261030_14_branding_assets.sql
-- Owner package 2026-10-30, note 09 §٢-أ (NOTE-09-C01, LIVE-F08): the office
-- uploads its own ready-made stationery into the legal vault — the official
-- Word letterhead template, a full-page PDF letterhead, the stamp and the
-- signature — next to the identity of 20261026_63.
-- Ledger: docs/audits/2026-10-30-owner-package-letterhead-vault.md
-- Run in the SQL editor (postgres), AFTER 20261026_63_branding_vault.sql.
-- =============================================================================
--
-- WHAT IT ADDS
--   1. public.branding_assets — at most ONE file per (vault, kind):
--        kind  letterhead_docx | letterhead_pdf | stamp | signature
--        path  the object in the private `branding-files` bucket, in the vault
--              owner's own folder:
--                u/<lawyer uid>/asset-<kind>-<random>.<ext>
--                f/<firm id>/asset-<kind>-<random>.<ext>
--              The CHECK pins the shape and the extension per kind; the
--              trigger pins the folder to the vault's owner (a CHECK cannot
--              read branding_vaults).
--        original_name, mime, size_bytes — what the download shows.
--
--   2. Who sees a row: exactly who manages the vault —
--      public.can_manage_branding_vault(lawyer_user_id, firm_id) of 63 (the
--      lawyer himself; the firm's owner / active managing_partner / active
--      office_admin). Sessions get SELECT only. Every write (insert, replace,
--      delete) is the server's (service role), AFTER it has read the caller's
--      vault through RLS — the same order as the logo route. A session that
--      could write `path` could point its row at someone else's object and
--      have the server sign it.
--
--   3. The `branding-files` bucket — PRIVATE, 5 MB, application/pdf, the
--      .docx MIME type, image/png, image/webp. A SEPARATE bucket on purpose:
--      _verify.sql pins `branding` (the logo) to 1 MB and images only. No
--      session Storage policy is created — the app reaches this bucket only
--      through the service role, after the RLS read above. The upload route
--      also checks the file's magic bytes (a .docx with macros is refused).
--
-- Re-runnable: `if not exists`, `create or replace`, policies dropped by name,
-- the bucket upserted. One transaction. Ends with a self-check and
-- notify pgrst.
--
-- CHECK AFTER RUNNING (expect one row: t | t | t | 1 | t):
--   select to_regclass('public.branding_assets') is not null              as table_exists,
--          (select relrowsecurity from pg_class
--            where oid = 'public.branding_assets'::regclass)              as rls_on,
--          not has_table_privilege('authenticated', 'public.branding_assets', 'INSERT')
--            and not has_table_privilege('authenticated', 'public.branding_assets', 'UPDATE')
--            and not has_table_privilege('authenticated', 'public.branding_assets', 'DELETE') as sessions_read_only,
--          (select count(*) from pg_policy
--            where polrelid = 'public.branding_assets'::regclass)         as policies,
--          exists (select 1 from storage.buckets
--                   where id = 'branding-files' and public = false
--                     and file_size_limit = 5242880)                       as private_bucket;
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.branding_vaults') is null
     or to_regprocedure('public.can_manage_branding_vault(uuid, uuid)') is null then
    raise exception '20261030_14: public.branding_vaults / can_manage_branding_vault missing — apply 20261026_63_branding_vault.sql first';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.branding_assets (
  id             uuid primary key default gen_random_uuid(),
  vault_id       uuid not null references public.branding_vaults(id) on delete cascade,
  kind           text not null,
  path           text not null,
  original_name  text not null default '',
  mime           text not null,
  size_bytes     integer not null,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  constraint branding_assets_one_per_kind unique (vault_id, kind),
  constraint branding_assets_path_key unique (path),
  constraint branding_assets_kind check (kind in ('letterhead_docx', 'letterhead_pdf', 'stamp', 'signature')),
  constraint branding_assets_mime check (
       (kind = 'letterhead_docx' and mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    or (kind = 'letterhead_pdf'  and mime = 'application/pdf')
    or (kind in ('stamp', 'signature') and mime in ('image/png', 'image/webp'))),
  constraint branding_assets_size check (
    size_bytes > 0 and size_bytes <= case when kind in ('stamp', 'signature') then 1048576 else 5242880 end),
  constraint branding_assets_name check (char_length(original_name) <= 160),
  constraint branding_assets_path_shape check (
    path ~ '^[uf]/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/asset-(letterhead-docx|letterhead-pdf|stamp|signature)-[a-z0-9]{8,40}\.(docx|pdf|png|webp)$'
    and (   (kind = 'letterhead_docx' and path like '%/asset-letterhead-docx-%.docx')
         or (kind = 'letterhead_pdf'  and path like '%/asset-letterhead-pdf-%.pdf')
         or (kind = 'stamp'           and path ~ '/asset-stamp-[a-z0-9]+\.(png|webp)$')
         or (kind = 'signature'       and path ~ '/asset-signature-[a-z0-9]+\.(png|webp)$')))
);

comment on table public.branding_assets is
  'Owner note 09 (2026-10-30): the office''s ready-made stationery (Word / PDF letterhead, stamp, signature) in the private branding-files bucket, one per kind per branding vault. Server-written only. 20261030_14.';

-- The folder must be the vault owner's: u/<lawyer uid>/ or f/<firm id>/.
create or replace function public.branding_assets_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lawyer uuid;
  v_firm   uuid;
  v_prefix text;
begin
  select v.lawyer_user_id, v.firm_id into v_lawyer, v_firm
    from public.branding_vaults v where v.id = new.vault_id;
  if not found then
    raise exception 'branding_assets: vault % does not exist', new.vault_id using errcode = '23503';
  end if;
  -- (computed first: inside IF, plpgsql would end the condition at CASE's THEN)
  v_prefix := case when v_lawyer is not null then 'u' else 'f' end;
  if split_part(new.path, '/', 1) <> v_prefix
     or split_part(new.path, '/', 2) <> coalesce(v_lawyer, v_firm)::text then
    raise exception 'branding_assets: path % is not in the folder of vault %', new.path, new.vault_id using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

revoke all on function public.branding_assets_guard() from public;

drop trigger if exists trg_branding_assets_guard on public.branding_assets;
create trigger trg_branding_assets_guard
  before insert or update on public.branding_assets
  for each row execute function public.branding_assets_guard();

create index if not exists idx_branding_assets_vault on public.branding_assets (vault_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS and privileges — sessions read their own vault's rows, nothing else
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.branding_assets enable row level security;

drop policy if exists "branding_assets: manager reads" on public.branding_assets;
create policy "branding_assets: manager reads" on public.branding_assets
  for select to authenticated
  using (exists (select 1 from public.branding_vaults v
                  where v.id = branding_assets.vault_id
                    and public.can_manage_branding_vault(v.lawyer_user_id, v.firm_id)));

revoke all on public.branding_assets from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.branding_assets from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.branding_assets from authenticated;
    grant select on public.branding_assets to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.branding_assets to service_role;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The bucket (private, 5 MB, pdf / docx / png / webp)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '20261030_14: storage.buckets not found — create the private bucket branding-files by hand (5 MB; pdf, docx, png, webp)';
    return;
  end if;
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('branding-files', 'branding-files', false, 5242880,
            array['application/pdf',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'image/png', 'image/webp'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  exception when insufficient_privilege then
    raise warning '20261030_14: this role may not write storage.buckets — create the private bucket branding-files as supabase_admin (5 MB; pdf, docx, png, webp)';
  end;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Self-check
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare c text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.branding_assets'::regclass) then
    raise exception '20261030_14 verify: RLS is off on branding_assets';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.branding_assets'::regclass) <> 1
     or exists (select 1 from pg_policy where polrelid = 'public.branding_assets'::regclass and polcmd <> 'r') then
    raise exception '20261030_14 verify: branding_assets must carry exactly the one SELECT policy of this file';
  end if;
  foreach c in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if exists (select 1 from pg_roles where rolname = 'anon')
       and has_table_privilege('anon', 'public.branding_assets', c) then
      raise exception '20261030_14 verify: guests hold % on branding_assets', c;
    end if;
    if c <> 'SELECT' and exists (select 1 from pg_roles where rolname = 'authenticated')
       and has_table_privilege('authenticated', 'public.branding_assets', c) then
      raise exception '20261030_14 verify: sessions hold % on branding_assets — writes are the server''s only', c;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.branding_assets'::regclass
                  and tgname = 'trg_branding_assets_guard' and tgenabled <> 'D') then
    raise exception '20261030_14 verify: the folder guard trigger is missing or disabled';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.branding_assets_guard()'::regprocedure)
     or not exists (select 1 from pg_proc where oid = 'public.branding_assets_guard()'::regprocedure
                     and proconfig @> array['search_path=""']) then
    raise exception '20261030_14 verify: branding_assets_guard is not SECURITY DEFINER with search_path ''''';
  end if;
  if to_regclass('storage.buckets') is not null
     and not exists (select 1 from storage.buckets where id = 'branding-files' and public = false
                      and file_size_limit = 5242880) then
    raise warning '20261030_14 verify: the private bucket «branding-files» (5 MB) is not there yet — create it as supabase_admin';
  end if;
  raise notice '20261030_14 verify: OK — branding_assets: one file per kind per vault, read by the vault''s managers only, written by the server only, folder pinned to the vault owner; private bucket branding-files (5 MB, pdf/docx/png/webp)';
end $$;

commit;
notify pgrst, 'reload schema';
