-- =============================================================================
-- Migration: 20261026_66_document_shares_path_ownership.sql
-- Security fix (independent review of the 2026-10-26 dashboard track, the
-- document_shares half of finding 1, HIGH). The hole is LIVE ON PRODUCTION
-- today. 20261026_65 named it and left it open; this file closes it.
-- Requires 20261026_65 (public.storage_path_in_folder).
-- =============================================================================
--
-- THE HOLE
--   POST /api/v1/share/[token]/verify looks a share row up by token_hash and
--   signs its document_path with the SERVICE client, which Storage RLS does
--   not confine. The database never tied document_path to anything:
--   "document_shares_owner_write" (20260706_content_and_ops.sql, FOR ALL)
--   checks only owner_id = auth.uid(). So a signed-in session could, through
--   raw PostgREST, skipping POST /api/v1/share entirely:
--     insert into document_shares (owner_id, document_path, token_hash)
--     values (<me>, '<victim uid>/<ms>-<name>', sha256('<a token I chose>'))
--   and then open /share/<that token>: the verify route hands back a signed
--   link to the victim's file. Or UPDATE the document_path of a share he
--   already holds. The route-level check (ef360b4d) does not help — the
--   attack never reaches the route.
--
-- THE RULE (this file)
--   A row written by a SESSION (any role but postgres / service_role /
--   supabase_admin — the 20261018_04 / 20261026_65 pattern):
--     INSERT  owner_id = auth.uid(), and (document_id, document_path) is
--             (id, storage_path) of a LIVE attachments row (deleted_at null)
--             that the caller OWNS (owner_user_id = auth.uid()), whose file
--             sits in that owner's folder (storage_path_in_folder);
--             token_hash present; the plaintext token / passcode columns
--             empty (the app has written neither since 20260909).
--     UPDATE  owner_id, document_id, document_path, token_hash and token
--             never change. (title / expires_at / passcode_hash stay editable
--             by the owner: they change only his own share of his own file.)
--   WHY OWNER-ONLY, not "any attachment the caller may read":
--     the app's only share flow is POST /api/v1/share, and its only two
--     callers share the caller's OWN documents — the lawyer documents page
--     (lists attachments where owner_user_id = the user) and the contracts
--     review hook (shares the user's own upload, or his own vault copy made
--     by documents/[id]/copy). Nothing in the UI shares a file somebody else
--     uploaded, so the narrow rule breaks no real flow; a wider one would let
--     a case participant mint a public link to the other side's file.
--     POST /api/v1/share now refuses a non-owned attachment itself (the same
--     404 a hidden row gets), so the trigger is never the first to say no.
--   Admins are sessions too ("document_shares_admin_all" lets them write):
--   the same rule holds for them. Nothing admin-side mints shares.
--
--   Enforced by a BEFORE INSERT OR UPDATE trigger (trg_00_… so it fires
--   first), SECURITY INVOKER (current_user must be the session's role), and
--   per-command policies replacing the FOR ALL one: every INSERT policy but
--   the new one is dropped by catalogue scan (permissive policies OR
--   together); an ALL policy other than document_shares_admin_all is
--   reported. A trigger, not only a policy: a re-run of 20260706 or a
--   restore cannot reopen it.
--
--   The verify route also stops serving a share whose attachment is gone,
--   binned, no longer the share owner's, or whose path moved / sits outside
--   its uploader's folder (src/lib/services/shareServable.ts) — so rows
--   written BEFORE this file are not trusted either, once the code deploys.
--   Existing rows are NOT rewritten; the verify below counts the live ones
--   that fail the rule (a non-zero count is most likely a forged row; the
--   README gives the one-line expiry).
--
-- lawyer_profiles.licence_image_path (checked, same class): a session holds
-- no privilege on the column (20261019_20 / 20260922_03 / 20261016_10), the
-- only writer is POST /api/v1/lawyer/licence-image (service role,
-- `licences/<uid>/…`), and the signup fill does not read it. Nothing to close
-- here; the verify below WARNS if a session can write it again (_verify.sql
-- raises), and GET /api/v1/admin/verifications now signs only a
-- `licences/<that lawyer>/…` key.
--
-- DEPLOY ORDER — EITHER ORDER, AND SOON (after 65)
--   The app's one writer, POST /api/v1/share (unchanged since 2026-09-05),
--   inserts with the RLS-scoped client: owner_id = user.id,
--   document_id = String(attachment.id), document_path = that attachment's
--   storage_path, token_hash / passcode_hash, token / passcode omitted — and
--   both callers share the user's own file. So the deployed app keeps
--   working, and the hole is closed for new rows the moment this commits.
--   Nothing in the app UPDATEs or DELETEs document_shares. Writers outside
--   this repo with a USER's JWT are guarded the same way; service-role ones
--   are not.
--
-- IDEMPOTENT: create or replace / drop … if exists / a policy scan;
-- revoke/grant are absolute. Docker:
--   supabase/tests/rls/document_shares_path_ownership.test.sql (runs it twice).
--
-- ROLLBACK (manual):
--   drop trigger if exists trg_00_document_shares_session_guard on public.document_shares;
--   drop policy if exists "document_shares insert own share of own file" on public.document_shares;
--   drop policy if exists "document_shares owner update" on public.document_shares;
--   drop policy if exists "document_shares owner delete" on public.document_shares;
--   create policy "document_shares_owner_write" on public.document_shares
--     for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());   -- 20260706
--   drop function if exists public.guard_document_share_session_writes();
--   drop function if exists public.can_share_attachment(text, text);
-- =============================================================================

begin;

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.document_shares') is null then
    raise exception '20261026_66: public.document_shares is missing — apply 20260706_content_and_ops.sql first';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'document_shares'
         and column_name in ('owner_id', 'document_id', 'document_path', 'token', 'token_hash', 'passcode', 'passcode_hash')) <> 7 then
    raise exception '20261026_66: document_shares lacks token_hash / passcode_hash / document_path — apply 20260909_document_shares_hashes.sql first';
  end if;
  if to_regclass('public.attachments') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'attachments' and column_name = 'deleted_at') then
    raise exception '20261026_66: public.attachments / attachments.deleted_at is missing — apply 20260906_phase6_settings_out_of_browser.sql first';
  end if;
  if to_regprocedure('public.storage_path_in_folder(text, uuid)') is null then
    raise exception '20261026_66: public.storage_path_in_folder is missing — run 20261026_65_attachments_path_ownership.sql first';
  end if;
end $$;


-- ── 1. Helper ────────────────────────────────────────────────────────────────
-- (p_document_id, p_path) is (id, storage_path) of a live attachment the
-- caller owns, in its owner's folder. DEFINER so the answer does not depend on
-- the caller's attachments policies. a.id::text — no cast of the caller's
-- text, so junk ids answer false instead of raising.
create or replace function public.can_share_attachment(p_document_id text, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_document_id is not null and p_path is not null and auth.uid() is not null and exists (
    select 1 from public.attachments a
     where a.id::text = p_document_id
       and a.storage_path = p_path
       and a.owner_user_id = auth.uid()
       and a.deleted_at is null
       and public.storage_path_in_folder(a.storage_path, a.owner_user_id));
$$;

comment on function public.can_share_attachment(text, text) is
  '20261026_66: (p_document_id, p_path) is (id, storage_path) of a live attachment (deleted_at null) the caller owns, whose file sits in the owner''s folder — what a session may put in a document_shares row.';

revoke all on function public.can_share_attachment(text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.can_share_attachment(text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.can_share_attachment(text, text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.can_share_attachment(text, text) to service_role;
  end if;
end $$;


-- ── 2. The session guard ─────────────────────────────────────────────────────
create or replace function public.guard_document_share_session_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.owner_id is null or new.owner_id is distinct from auth.uid() then
      raise exception using errcode = '42501',
        message = 'document_shares: a share is created by its own owner (owner_id = auth.uid())';
    end if;
    if not public.can_share_attachment(new.document_id, new.document_path) then
      raise exception using errcode = '42501',
        message = 'document_shares: document_id / document_path must be one of the caller''s own live documents, in his own folder';
    end if;
    if new.token_hash is null or new.token is not null or new.passcode is not null then
      raise exception using errcode = '42501',
        message = 'document_shares: a share carries token_hash only — no plaintext token or passcode';
    end if;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.document_id is distinct from old.document_id
     or new.document_path is distinct from old.document_path
     or new.token_hash is distinct from old.token_hash
     or new.token is distinct from old.token then
    raise exception using errcode = '42501',
      message = 'document_shares: a share''s owner, document, file and token are fixed once created';
  end if;
  return new;
end $$;

comment on function public.guard_document_share_session_writes() is
  '20261026_66: a session (any role but postgres / service_role / supabase_admin) creates a share only as itself, of one of its own live documents in its own folder, hash-only; and never changes owner_id, document_id, document_path, token_hash or token.';

revoke all on function public.guard_document_share_session_writes() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.guard_document_share_session_writes() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.guard_document_share_session_writes() from authenticated;
  end if;
end $$;

drop trigger if exists trg_00_document_shares_session_guard on public.document_shares;
create trigger trg_00_document_shares_session_guard
  before insert or update on public.document_shares
  for each row execute function public.guard_document_share_session_writes();

comment on trigger trg_00_document_shares_session_guard on public.document_shares is
  'PATH-OWNERSHIP GUARD since 20261026_66 — read by _verify.sql.';


-- ── 3. Policies: per command instead of FOR ALL ──────────────────────────────
drop policy if exists "document_shares_owner_write" on public.document_shares;

do $$
declare p record;
begin
  for p in select polname, polcmd from pg_policy
            where polrelid = 'public.document_shares'::regclass and polcmd in ('a', '*')
              and polname not in ('document_shares_admin_all', 'document_shares insert own share of own file') loop
    if p.polcmd = 'a' then
      raise notice '20261026_66: dropping INSERT policy "%" on public.document_shares', p.polname;
      execute format('drop policy %I on public.document_shares', p.polname);
    else
      raise warning '20261026_66: public.document_shares carries an ALL policy "%" — it also grants INSERT / UPDATE; the session guard trigger still applies to it. Review it.', p.polname;
    end if;
  end loop;
end $$;

drop policy if exists "document_shares insert own share of own file" on public.document_shares;
create policy "document_shares insert own share of own file" on public.document_shares
  for insert to authenticated
  with check (owner_id = auth.uid() and public.can_share_attachment(document_id, document_path));

drop policy if exists "document_shares owner update" on public.document_shares;
create policy "document_shares owner update" on public.document_shares
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "document_shares owner delete" on public.document_shares;
create policy "document_shares owner delete" on public.document_shares
  for delete to authenticated
  using (owner_id = auth.uid());


-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  first_before text; n int; r text;
begin
  select tg.tgname into first_before
    from pg_trigger tg
   where tg.tgrelid = 'public.document_shares'::regclass and not tg.tgisinternal and (tg.tgtype & 2) = 2 and tg.tgenabled <> 'D'
   order by tg.tgname limit 1;
  if first_before is distinct from 'trg_00_document_shares_session_guard' then
    raise exception '20261026_66 verify: the session guard on public.document_shares is missing, disabled or not the first BEFORE trigger (first: %)', first_before;
  end if;
  if (select prosecdef from pg_proc where oid = 'public.guard_document_share_session_writes()'::regprocedure) then
    raise exception '20261026_66 verify: the session guard is SECURITY DEFINER (current_user would always be its owner)';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.can_share_attachment(text, text)'::regprocedure) then
    raise exception '20261026_66 verify: can_share_attachment is not SECURITY DEFINER';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.document_shares'::regclass and polname = 'document_shares_owner_write') then
    raise exception '20261026_66 verify: the FOR ALL policy document_shares_owner_write is still there';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.document_shares'::regclass and polcmd = 'a';
  if n <> 1 or not exists (select 1 from pg_policy where polrelid = 'public.document_shares'::regclass
                            and polname = 'document_shares insert own share of own file') then
    raise exception '20261026_66 verify: public.document_shares carries % INSERT policies, expected exactly "document_shares insert own share of own file"', n;
  end if;

  -- licence_image_path stays server-only (20261019_20). A WARNING, not a
  -- raise: a lapse there must not hold back the share fix above; _verify.sql
  -- raises on it, and the admin queue signs only licences/<that lawyer>/….
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'lawyer_profiles' and column_name = 'licence_image_path') then
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r)
         and has_column_privilege(r, 'public.lawyer_profiles', 'licence_image_path', 'INSERT, UPDATE') then
        raise warning '20261026_66: % can write lawyer_profiles.licence_image_path — the admin queue signs it with the service role. Re-run 20261016_10, then 20261019_20.', r;
      end if;
    end loop;
  end if;

  -- Live shares (unexpired) written before this file that the rule refuses.
  -- Not rewritten; the verify route refuses them once the code deploys. A
  -- non-zero count is most likely a forged row.
  select count(*) into n
    from public.document_shares s
   where (s.expires_at is null or s.expires_at > now())
     and not exists (select 1 from public.attachments a
                      where a.id::text = s.document_id
                        and a.storage_path = s.document_path
                        and a.owner_user_id = s.owner_id
                        and a.deleted_at is null
                        and public.storage_path_in_folder(a.storage_path, a.owner_user_id));
  if n > 0 then
    raise warning '20261026_66: % live document_shares row(s) do not point at a live document of their own owner, in his folder — until the code deploy the share link still opens them. List: select s.id, s.owner_id, s.document_id, s.document_path, s.created_at, s.expires_at from public.document_shares s where (s.expires_at is null or s.expires_at > now()) and not exists (select 1 from public.attachments a where a.id::text = s.document_id and a.storage_path = s.document_path and a.owner_user_id = s.owner_id and a.deleted_at is null and public.storage_path_in_folder(a.storage_path, a.owner_user_id));', n;
  end if;

  raise notice '20261026_66 verify: OK — document_shares written by a session: own share of an own live document in its own folder, hash-only, owner / document / file / token fixed after insert; per-command policies; licence_image_path write access checked';
end $$;

commit;
notify pgrst, 'reload schema';
