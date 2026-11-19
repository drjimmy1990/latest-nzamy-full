-- =============================================================================
-- Migration: 20261129_20_secleak_contracts_shares_licences.sql
-- =============================================================================
-- PURPOSE (owner file 15 rows #4 and #48, file 19 §1ب.2; batch l9-secleak)
--
--   1. #4 — the lawyer's internal notes and his DRAFT contracts never reach
--      the client, through the API or through a direct PostgREST read.
--        * "contracts select" loses its client arm (client_user_id =
--          auth.uid()). The owner and his active firm colleagues keep it
--          (can_access_case_row), unchanged.
--        * public.can_access_contract(text) — the SELECT rule of
--          contract_versions / contract_parties / contract_obligations /
--          contract_payments — loses the same arm (it now equals
--          can_manage_contract). A client therefore reads NO contract table
--          directly any more.
--        * The client reads through three SECURITY DEFINER functions
--          (EXECUTE for authenticated + service_role), all scoped to
--          client_user_id = auth.uid() AND status <> 'draft', with a column
--          WHITELIST that never includes contracts.notes, contracts.metadata
--          (the counterparty's phone / id number), or the notes of a
--          version, obligation or payment:
--            client_contracts_list()            the «عقودي» list (≤ 200)
--            client_contract_detail(p_contract) one contract + its four lists, jsonb
--            client_contract_versions(p_contract) the files (download / ZIP)
--        * "Draft" = contracts.status 'draft'. A version's label ('draft',
--          'revised', …) does not hide it: a contract the lawyer moved out of
--          draft is shared with its files.
--        * Both objects are replaced only while they still have their
--          20260905_phase3 shape (or this file's): a migration that changed
--          either since stops this file («merge … by hand») instead of being
--          silently undone. (l9-secroles adds RESTRICTIVE policies only.)
--
--   2. #48 — share links (public.document_shares):
--        wrong_total int  — EVERY wrong passcode, never reset (failed_attempts
--                           keeps its 0..5 role for the 15-minute lock)
--        revoked_at       — set by the 20th wrong passcode: the link is dead
--                           for good; every later attempt (the right passcode
--                           too) answers 'revoked'
--        view_count int / last_viewed_at — one per successful open
--      share_passcode_check is re-created from its LATEST definition
--      (20261109_11) with the cumulative counter and the 'revoked' answer.
--      public.share_count_view(p_token_hash) adds a view (service role).
--      A trigger keeps revoked_at once set (nobody clears it), and lets no
--      session lower wrong_total / view_count or touch last_viewed_at (the
--      share's owner may update his own row — policy 20261026_66).
--
--   3. File 19 §1ب.2 — a licence number of the fake test pattern `1448-LAW-`
--      is never verified: a BEFORE INSERT/UPDATE trigger on lawyer_profiles
--      and provider_profiles refuses verification_status = 'verified' for it
--      (errcode 23514, message starting «fake_test_licence»). The pattern is
--      matched after removing every non-alphanumeric character, folding case
--      and Arabic-Indic digits (1448-LAW-001, ١٤٤٨ law 001, 1448/LAW/001 …).
--      THE ROWS ALREADY VERIFIED with such a number (the 10 test lawyers) are
--      moved to 'rejected' — no account is deleted. T28: zero verified rows.
--
--   NOT HERE: file 19 §3 (no admin exemption from the library read quota) is
--   done by batch l9-read's 20261129_40, which drops and re-creates
--   public.library_read_quota_hit. This file does not touch that function.
--
-- WHO CAN DO WHAT
--   client_contracts_list / client_contract_detail / client_contract_versions:
--   authenticated + service_role. share_passcode_check / share_count_view:
--   service_role only. is_fake_test_licence: everyone (pure). The trigger
--   functions: nobody.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261129_20_secleak_contracts_shares_licences.sql
--   Expect: NOTICE  l9_secleak verify: OK  and a row with `t`.
--
-- RUN ORDER: any time after 20261109_11 (live); before
--   or after the l9-secleak deploy.
--   * Code first: the client contract routes call the three functions and,
--     while they are missing (PGRST202 / 42883), read the tables through the
--     old client arm with the same whitelist and the same draft filter — the
--     client already gets no notes / metadata / drafts. The share route knows
--     'revoked' (unused until the SQL runs) and counts views only once
--     share_count_view exists. The admin approval refuses a 1448-LAW- licence
--     in the app too.
--   * SQL first with the OLD code: the old client routes read the tables
--     directly, which this file closes — «عقودي» is EMPTY until the deploy.
--     So prefer: deploy, then this file.
--   RE-RUN HAZARD: re-running 20260905_phase3 brings back the client arm;
--   re-running 20261109_11 brings back the old share_passcode_check (no 20th
--   revoke). Re-run this file after either of them. This file itself is idempotent.
--
-- ROLLBACK (in one transaction):
--   1. contracts: re-run section 2g of 20260905_phase3 («contracts select» and
--      can_access_contract only), then
--      drop function if exists public.client_contracts_list();
--      drop function if exists public.client_contract_detail(text);
--      drop function if exists public.client_contract_versions(text);
--   2. shares: re-run section 2 of 20261109_11 (share_passcode_check), then
--      drop trigger if exists trg_01_document_shares_counters_guard on public.document_shares;
--      drop function if exists public.document_share_counters_guard();
--      drop function if exists public.share_count_view(text);
--      (the four columns may stay; the old code ignores them)
--   3. licences: drop trigger if exists trg_lawyer_profiles_no_fake_licence on public.lawyer_profiles;
--      drop trigger if exists trg_provider_profiles_no_fake_licence on public.provider_profiles;
--      drop function if exists public.refuse_fake_test_licence_verification();
--      drop function if exists public.is_fake_test_licence(text);
--      (the 10 rows moved to 'rejected' stay rejected — on purpose)
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- ── 0. prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.can_access_case_row(uuid, uuid)') is null
     or to_regprocedure('public.can_access_contract(text)') is null
     or to_regclass('public.contract_versions') is null
     or to_regclass('public.contract_parties') is null
     or to_regclass('public.contract_obligations') is null
     or to_regclass('public.contract_payments') is null then
    raise exception '20261129_20: the Phase 3 contract tables are missing — run 20260905_phase3_consultations_and_contracts.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'contract_versions' and column_name = 'folder_owner_id') then
    raise exception '20261129_20: contract_versions.folder_owner_id is missing — run 20261026_72_file_folder_owner.sql first';
  end if;
  if to_regprocedure('public.share_passcode_check(text, text)') is null then
    raise exception '20261129_20: share_passcode_check is missing — run 20261109_11_share_passcode_lockout.sql first';
  end if;
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261129_20: public.lawyer_profiles is missing';
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. #4 — contracts: no client arm on the tables; whitelisted reads for him
-- ═════════════════════════════════════════════════════════════════════════════
-- Both objects are re-created from their 20260905_phase3 shape. If another
-- migration has changed either since (other than this file), stop: replacing
-- it would silently erase that change — merge by hand. (Batch l9-secroles
-- adds RESTRICTIVE policies and does not touch either.)
do $$
declare
  q   text;
  src text;
begin
  select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)),
                                   '(public\.|auth\.|\s|\(|\))', '', 'g')
    into q
    from pg_catalog.pg_policy p
   where p.polrelid = 'public.contracts'::regclass and p.polname = 'contracts select';
  if q is not null and q not in (
       'can_access_case_rowowner_user_id,firm_idorclient_user_idisnotnullandclient_user_id=uid',   -- 20260905_phase3
       'can_access_case_rowowner_user_id,firm_id') then                                            -- this file
    raise exception '20261129_20: "contracts select" was changed since 20260905_phase3 (%) — merge the client-arm removal by hand', q;
  end if;
  select pg_catalog.regexp_replace(p.prosrc, '\s', '', 'g') into src
    from pg_catalog.pg_proc p where p.oid = 'public.can_access_contract(text)'::regprocedure;
  if src not in (
       'selectexists(select1frompublic.contractscwherec.id=p_contractand(public.can_access_case_row(c.owner_user_id,c.firm_id)or(c.client_user_idisnotnullandc.client_user_id=auth.uid())));',
       'selectexists(select1frompublic.contractscwherec.id=p_contractandpublic.can_access_case_row(c.owner_user_id,c.firm_id));') then
    raise exception '20261129_20: can_access_contract was changed since 20260905_phase3 — merge the client-arm removal by hand: %', src;
  end if;
end $$;

drop policy if exists "contracts select" on public.contracts;
create policy "contracts select" on public.contracts for select
  using (public.can_access_case_row(owner_user_id, firm_id));

create or replace function public.can_access_contract(p_contract text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract
       and public.can_access_case_row(c.owner_user_id, c.firm_id));
$$;

comment on function public.can_access_contract(text) is
  'SELECT rule of contract_versions / parties / obligations / payments: the contract''s owner or an active firm colleague. Since 20261129_20 (owner #4) NOT the client — he reads through client_contract_detail / client_contract_versions, which never return notes.';

create or replace function public.client_contracts_list()
returns table (
  id                  text,
  owner_user_id       uuid,
  firm_id             uuid,
  lawyer_client_id    uuid,
  client_user_id      uuid,
  request_id          text,
  title               text,
  contract_type       text,
  status              text,
  counterparty_name   text,
  value_sar           numeric,
  currency            text,
  starts_on           date,
  ends_on             date,
  auto_renew          boolean,
  renewal_notice_days integer,
  signed_on           date,
  current_version_id  uuid,
  created_at          timestamptz,
  updated_at          timestamptz,
  versions_count      integer,
  pending_obligations integer,
  next_due_on         date)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.owner_user_id, c.firm_id, c.lawyer_client_id, c.client_user_id, c.request_id,
         c.title, c.contract_type, c.status, c.counterparty_name, c.value_sar, c.currency,
         c.starts_on, c.ends_on, c.auto_renew, c.renewal_notice_days, c.signed_on,
         c.current_version_id, c.created_at, c.updated_at,
         (select count(*)::int from public.contract_versions v where v.contract_id = c.id),
         (select count(*)::int from public.contract_obligations o where o.contract_id = c.id and o.status = 'pending'),
         (select min(o.due_on) from public.contract_obligations o where o.contract_id = c.id and o.status = 'pending')
    from public.contracts c
   where auth.uid() is not null
     and c.client_user_id = auth.uid()
     and c.status <> 'draft'
   order by c.updated_at desc
   limit 200;
$$;

comment on function public.client_contracts_list() is
  'Owner #4 (20261129_20): the CALLER''s contracts as the client (client_user_id = auth.uid()), never a draft, never notes or metadata; with the version count, the pending obligations and the earliest pending date. ≤ 200, newest first.';

create or replace function public.client_contract_versions(p_contract text)
returns table (
  id              uuid,
  contract_id     text,
  version_no      integer,
  label           text,
  file_name       text,
  storage_path    text,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid,
  folder_owner_id uuid,
  created_at      timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.contract_id, v.version_no, v.label, v.file_name, v.storage_path, v.mime_type,
         v.size_bytes, v.uploaded_by, v.folder_owner_id, v.created_at
    from public.contract_versions v
    join public.contracts c on c.id = v.contract_id
   where v.contract_id = p_contract
     and auth.uid() is not null
     and c.client_user_id = auth.uid()
     and c.status <> 'draft'
   order by v.version_no desc;
$$;

comment on function public.client_contract_versions(text) is
  'Owner #4 (20261129_20): the files of one of the CALLER''s non-draft contracts as the client — no version notes. Empty when the contract is not his or is a draft.';

create or replace function public.client_contract_detail(p_contract text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
           'contract', pg_catalog.jsonb_build_object(
              'id', c.id, 'owner_user_id', c.owner_user_id, 'firm_id', c.firm_id,
              'lawyer_client_id', c.lawyer_client_id, 'client_user_id', c.client_user_id,
              'request_id', c.request_id, 'title', c.title, 'contract_type', c.contract_type,
              'status', c.status, 'counterparty_name', c.counterparty_name, 'value_sar', c.value_sar,
              'currency', c.currency, 'starts_on', c.starts_on, 'ends_on', c.ends_on,
              'auto_renew', c.auto_renew, 'renewal_notice_days', c.renewal_notice_days,
              'signed_on', c.signed_on, 'current_version_id', c.current_version_id,
              'created_at', c.created_at, 'updated_at', c.updated_at),
           'versions', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) order by v.version_no desc)
                from public.client_contract_versions(c.id) v), '[]'::jsonb),
           'parties', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                       'id', p.id, 'contract_id', p.contract_id, 'role', p.role, 'party_kind', p.party_kind,
                       'name', p.name, 'entity_type', p.entity_type, 'lawyer_client_id', p.lawyer_client_id,
                       'commercial_register_no', p.commercial_register_no, 'contact_phone', p.contact_phone,
                       'contact_email', p.contact_email, 'position', p.position, 'created_at', p.created_at)
                     order by p.position, p.created_at)
                from public.contract_parties p where p.contract_id = c.id), '[]'::jsonb),
           'obligations', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                       'id', o.id, 'contract_id', o.contract_id, 'title', o.title, 'kind', o.kind,
                       'due_on', o.due_on, 'responsible_party_id', o.responsible_party_id,
                       'status', o.status, 'deadline_id', o.deadline_id,
                       'created_at', o.created_at, 'updated_at', o.updated_at)
                     order by o.due_on)
                from public.contract_obligations o where o.contract_id = c.id), '[]'::jsonb),
           'payments', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                       'id', y.id, 'contract_id', y.contract_id, 'label', y.label, 'stage', y.stage,
                       'amount_sar', y.amount_sar, 'due_on', y.due_on, 'status', y.status,
                       'paid_on', y.paid_on, 'position', y.position,
                       'created_at', y.created_at, 'updated_at', y.updated_at)
                     order by y.position, y.due_on)
                from public.contract_payments y where y.contract_id = c.id), '[]'::jsonb))
    from public.contracts c
   where c.id = p_contract
     and auth.uid() is not null
     and c.client_user_id = auth.uid()
     and c.status <> 'draft';
$$;

comment on function public.client_contract_detail(text) is
  'Owner #4 (20261129_20): one of the CALLER''s non-draft contracts as the client, with its versions, parties, obligations and payments — a column whitelist without any notes or metadata. null when it is not his or is a draft.';

do $$
declare
  fn text;
begin
  foreach fn in array array['public.client_contracts_list()', 'public.client_contract_versions(text)',
                            'public.client_contract_detail(text)'] loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. #48 — share links: revoked for good at the 20th wrong passcode; views
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.document_shares
  add column if not exists wrong_total    int not null default 0,
  add column if not exists revoked_at     timestamptz,
  add column if not exists view_count     int not null default 0,
  add column if not exists last_viewed_at timestamptz;

alter table public.document_shares drop constraint if exists document_shares_counters_check;
alter table public.document_shares add constraint document_shares_counters_check
  check (wrong_total >= 0 and view_count >= 0);

comment on column public.document_shares.wrong_total is
  'Owner #48 (20261129_20): every wrong passcode since the share was made — never reset. The 20th sets revoked_at.';
comment on column public.document_shares.revoked_at is
  'Owner #48 (20261129_20): the share is dead for good (20 wrong passcodes). Once set it is never cleared (trg_01_document_shares_counters_guard).';
comment on column public.document_shares.view_count is
  'Owner #48 (20261129_20): successful opens (a signed file handed out), counted by public.share_count_view.';

-- Copied from 20261109_11 (its latest and only definition); changes: the
-- 'revoked' answer first, wrong_total + 1 on every counted wrong passcode,
-- the 20th revokes.
create or replace function public.share_passcode_check(p_token_hash text, p_passcode_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v       record;
  v_key   text;
  v_match boolean;
  v_total int;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('result', 'none');
  end if;

  select s.id, s.passcode_hash, s.failed_attempts, s.locked_until, s.wrong_total, s.revoked_at
    into v
    from public.document_shares s
   where s.token_hash = p_token_hash
     for update;
  if not found then
    return pg_catalog.jsonb_build_object('result', 'none');
  end if;
  if v.revoked_at is not null then
    return pg_catalog.jsonb_build_object('result', 'revoked');
  end if;
  if v.passcode_hash is null then
    return pg_catalog.jsonb_build_object('result', 'ok');
  end if;
  if v.locked_until is not null and v.locked_until > pg_catalog.now() then
    return pg_catalog.jsonb_build_object('result', 'locked');
  end if;

  -- keyed second hash: equal digests iff equal inputs, and the comparison
  -- time does not depend on a shared prefix of the stored hash
  v_key := pg_catalog.gen_random_uuid()::text;
  v_match := p_passcode_hash is not null
             and p_passcode_hash ~ '^[0-9a-f]{64}$'
             and pg_catalog.sha256(pg_catalog.convert_to(v.passcode_hash || v_key, 'UTF8'))
               = pg_catalog.sha256(pg_catalog.convert_to(p_passcode_hash || v_key, 'UTF8'));

  if v_match then
    if v.failed_attempts <> 0 or v.locked_until is not null then
      update public.document_shares set failed_attempts = 0, locked_until = null where id = v.id;
    end if;
    return pg_catalog.jsonb_build_object('result', 'ok');
  end if;

  v_total := coalesce(v.wrong_total, 0) + 1;

  if v_total >= 20 then
    update public.document_shares
       set wrong_total = v_total, failed_attempts = 0, locked_until = null, revoked_at = pg_catalog.now()
     where id = v.id;
    return pg_catalog.jsonb_build_object('result', 'revoked');
  end if;

  if v.failed_attempts + 1 >= 5 then
    update public.document_shares
       set wrong_total = v_total, failed_attempts = 0, locked_until = pg_catalog.now() + interval '15 minutes'
     where id = v.id;
    return pg_catalog.jsonb_build_object('result', 'locked');
  end if;

  update public.document_shares set wrong_total = v_total, failed_attempts = v.failed_attempts + 1 where id = v.id;
  return pg_catalog.jsonb_build_object('result', 'denied');
end $$;

comment on function public.share_passcode_check(text, text) is
  'SAST-04 (20261109_11) + owner #48 (20261129_20): checks a share passcode (sha256 hex of both) under a row lock: 5 wrong in a row lock the share for 15 minutes (attempts during a lock are not counted); the 20th wrong passcode overall revokes it for good. Answers {result: ok | denied | locked | revoked | none}. Service role only.';

revoke all on function public.share_passcode_check(text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.share_passcode_check(text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.share_passcode_check(text, text) from authenticated;
  end if;
end $$;
grant execute on function public.share_passcode_check(text, text) to service_role;

create or replace function public.share_count_view(p_token_hash text)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  update public.document_shares s
     set view_count = s.view_count + 1, last_viewed_at = pg_catalog.now()
   where p_token_hash ~ '^[0-9a-f]{64}$'
     and s.token_hash = p_token_hash
     and s.revoked_at is null
  returning s.view_count;
$$;

comment on function public.share_count_view(text) is
  'Owner #48 (20261129_20): one successful open of a share (POST /api/v1/share/[token]/verify, after the signed URL is made). Returns the new count, null for an unknown or revoked share. Service role only.';

revoke all on function public.share_count_view(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.share_count_view(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.share_count_view(text) from authenticated;
  end if;
end $$;
grant execute on function public.share_count_view(text) to service_role;

-- A revoked share stays revoked whoever writes; a session never lowers the
-- counters (the owner may update his own row — 20261026_66).
create or replace function public.document_share_counters_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;
  end if;
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if new.wrong_total < old.wrong_total then
    new.wrong_total := old.wrong_total;
  end if;
  if new.view_count < old.view_count then
    new.view_count := old.view_count;
  end if;
  new.last_viewed_at := old.last_viewed_at;
  return new;
end $$;

comment on function public.document_share_counters_guard() is
  'Owner #48 (20261129_20): BEFORE UPDATE on document_shares — revoked_at once set is kept for every writer; a session (not postgres / service_role / supabase_admin) never lowers wrong_total or view_count and never sets last_viewed_at.';

revoke all on function public.document_share_counters_guard() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.document_share_counters_guard() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.document_share_counters_guard() from authenticated;
  end if;
end $$;

drop trigger if exists trg_01_document_shares_counters_guard on public.document_shares;
create trigger trg_01_document_shares_counters_guard
  before update on public.document_shares
  for each row execute function public.document_share_counters_guard();

comment on trigger trg_01_document_shares_counters_guard on public.document_shares is
  'OWNER #48 since 20261129_20 — read by _verify.sql.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. File 19 §1ب.2 — a 1448-LAW- licence is never verified
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.is_fake_test_licence(p text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.upper(pg_catalog.regexp_replace(
           pg_catalog.translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
           '[^0-9A-Za-z]+', '', 'g')) like '1448LAW%';
$$;

comment on function public.is_fake_test_licence(text) is
  'File 19 §1ب.2 (20261129_20): true for the fake test licence pattern 1448-LAW-… after removing every non-alphanumeric character, folding case and Arabic-Indic digits. Mirrored by src/lib/lawyerSignup/fakeLicence.ts.';

grant execute on function public.is_fake_test_licence(text) to public;

create or replace function public.refuse_fake_test_licence_verification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.verification_status = 'verified' and public.is_fake_test_licence(new.license_number) then
    raise exception using errcode = '23514',
      message = 'fake_test_licence: a 1448-LAW- licence number is a test number and is never verified',
      hint = 'File 19 §1ب.2 (20261129_20).';
  end if;
  return new;
end $$;

comment on function public.refuse_fake_test_licence_verification() is
  'File 19 §1ب.2 (20261129_20): BEFORE INSERT/UPDATE on lawyer_profiles / provider_profiles — refuses verification_status = ''verified'' with a 1448-LAW- licence (23514 fake_test_licence), for every writer.';

revoke all on function public.refuse_fake_test_licence_verification() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.refuse_fake_test_licence_verification() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.refuse_fake_test_licence_verification() from authenticated;
  end if;
end $$;

do $$
declare
  t text;
  n int;
begin
  foreach t in array array['lawyer_profiles', 'provider_profiles'] loop
    if to_regclass('public.' || t) is null then
      raise notice '20261129_20: public.% is missing — no fake-licence trigger on it', t;
      continue;
    end if;
    -- the rows already verified with a fake number: un-verified, never deleted
    execute format('update public.%I set verification_status = %L
                     where verification_status = %L and public.is_fake_test_licence(license_number)',
                   t, 'rejected', 'verified');
    get diagnostics n = row_count;
    raise notice '20261129_20: % row(s) of public.% verified with a 1448-LAW- licence moved to rejected', n, t;
    execute format('drop trigger if exists trg_%s_no_fake_licence on public.%I', t, t);
    execute format('create trigger trg_%s_no_fake_licence before insert or update on public.%I '
                   'for each row execute function public.refuse_fake_test_licence_verification()', t, t);
  end loop;
end $$;


-- ── 4. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  fn  text;
  q   text;
  r   text;
begin
  -- #4: no client arm left on the tables
  select pg_catalog.pg_get_expr(p.polqual, p.polrelid) into q
    from pg_catalog.pg_policy p
   where p.polrelid = 'public.contracts'::regclass and p.polname = 'contracts select';
  if q is null or q ~ 'client_user_id' then
    raise exception 'l9_secleak verify: "contracts select" is missing or still has the client arm: %', q;
  end if;
  if exists (select 1 from pg_catalog.pg_policy p
              where p.polrelid = 'public.contracts'::regclass and p.polcmd in ('r', '*')
                and pg_catalog.pg_get_expr(p.polqual, p.polrelid) ~ 'client_user_id') then
    raise exception 'l9_secleak verify: another SELECT policy on public.contracts still reads client_user_id';
  end if;
  if (select p.prosrc from pg_catalog.pg_proc p where p.oid = 'public.can_access_contract(text)'::regprocedure) ~ 'client_user_id' then
    raise exception 'l9_secleak verify: can_access_contract still lets the client read the contract tables (20260905_phase3 re-run?)';
  end if;
  foreach fn in array array['public.client_contracts_list()', 'public.client_contract_versions(text)',
                            'public.client_contract_detail(text)'] loop
    if not exists (select 1 from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)
                    and p.prosecdef and p.proconfig @> array['search_path=""']) then
      raise exception 'l9_secleak verify: % is missing or not SECURITY DEFINER with search_path ''''', fn;
    end if;
    if (select p.prosrc from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)) ~ '(notes|metadata)' then
      raise exception 'l9_secleak verify: % names notes or metadata', fn;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
       and has_function_privilege('anon', fn, 'EXECUTE') then
      raise exception 'l9_secleak verify: anon can EXECUTE %', fn;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and not has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'l9_secleak verify: authenticated cannot EXECUTE %', fn;
    end if;
  end loop;

  -- #48
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'document_shares'
         and column_name in ('wrong_total', 'revoked_at', 'view_count', 'last_viewed_at')) <> 4 then
    raise exception 'l9_secleak verify: document_shares lacks wrong_total / revoked_at / view_count / last_viewed_at';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.share_passcode_check(text, text)'::regprocedure), 'revoked') = 0 then
    raise exception 'l9_secleak verify: share_passcode_check has no 20-wrong revoke (20261109_11 re-run after this file?)';
  end if;
  foreach fn in array array['public.share_passcode_check(text, text)', 'public.share_count_view(text)'] loop
    if not exists (select 1 from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)
                    and p.prosecdef and p.proconfig @> array['search_path=""']) then
      raise exception 'l9_secleak verify: % is missing or not SECURITY DEFINER with search_path ''''', fn;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r) and has_function_privilege(r, fn, 'EXECUTE') then
        raise exception 'l9_secleak verify: % can EXECUTE %', r, fn;
      end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_catalog.pg_trigger t
                  where t.tgrelid = 'public.document_shares'::regclass
                    and t.tgname = 'trg_01_document_shares_counters_guard' and t.tgenabled <> 'D') then
    raise exception 'l9_secleak verify: trg_01_document_shares_counters_guard is missing or disabled';
  end if;

  -- licences
  if not public.is_fake_test_licence('1448-LAW-001') or not public.is_fake_test_licence(' ١٤٤٨ law ٠٠٧ ')
     or public.is_fake_test_licence('45/1448') or public.is_fake_test_licence(null) then
    raise exception 'l9_secleak verify: is_fake_test_licence answers wrongly';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
                  where t.tgrelid = 'public.lawyer_profiles'::regclass
                    and t.tgname = 'trg_lawyer_profiles_no_fake_licence' and t.tgenabled <> 'D') then
    raise exception 'l9_secleak verify: trg_lawyer_profiles_no_fake_licence is missing or disabled';
  end if;
  if exists (select 1 from public.lawyer_profiles lp
              where lp.verification_status = 'verified' and public.is_fake_test_licence(lp.license_number)) then
    raise exception 'l9_secleak verify: a lawyer is still verified with a 1448-LAW- licence';
  end if;


  raise notice 'l9_secleak verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261129_20 secleak: contracts without client arm + client functions, share revoke at 20 + view_count, no 1448-LAW- verified' as step,
       (to_regprocedure('public.client_contract_detail(text)') is not null
        and (select p.prosrc from pg_catalog.pg_proc p where p.oid = 'public.can_access_contract(text)'::regprocedure) !~ 'client_user_id'
        and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.share_passcode_check(text, text)'::regprocedure), 'revoked') > 0
        and to_regprocedure('public.share_count_view(text)') is not null
        and not exists (select 1 from public.lawyer_profiles lp
                         where lp.verification_status = 'verified' and public.is_fake_test_licence(lp.license_number))) as ok;
