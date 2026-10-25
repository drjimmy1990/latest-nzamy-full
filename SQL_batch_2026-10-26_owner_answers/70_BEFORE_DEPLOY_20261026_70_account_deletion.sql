-- =============================================================================
-- Migration: 20261026_70_account_deletion.sql
-- Plan: docs/plans/2026-10-26-D6-account-deletion-design.md (D6).
-- Owner decision ٢٩٨ (أجوبة_المالك_٢٧٨-٢٩٨_٢٠٢٦-١٠-٢٦.md, خامساً):
--   1. «حذف حساب مستقل … يدخل الحساب في مهلة استعادة مجمدة (60 يوماً) … بعد
--      مرور الـ 60 يوماً يُحذف نهائياً مع مستنداته وملاحظاته الشخصية، عدا
--      الفواتير الضريبية الإلزامية نظاماً.»
--   2. «حذف أو إخراج حساب عضو يعمل داخل مكتب … ملفات القضايا وملاحظات المكتب
--      ومستندات الموكلين لا تُحذف أبداً مع حساب العضو … وتنتقل مرجعيتها للشريك
--      المدير (Firm Owner).»
-- =============================================================================
--
-- WHAT THIS FILE ADDS (idempotent; one transaction; lock_timeout 5s)
--   1. public.account_deletion_requests — one row per request. user_id has NO
--      foreign key: the row is the record of the purge and outlives the
--      account. status requested → (purging → purged | blocked) | cancelled;
--      purge_after = requested_at + 60 days, always (trigger). At most one
--      active (requested / purging / blocked) row per user. RLS: the user reads
--      his own rows; no API role writes the table — every write is a function.
--   2. public.firm_asset_transfers — append-only trail: every firm row moved
--      to the firm owner (table, row, column, from, to, firm, reason). No FKs.
--      The receiving owner reads the rows addressed to him.
--   3. public.transfer_firm_assets(user, firm, reason) — moves the departing
--      member's firm rows (own firm_id, or the firm of their case) to
--      firm_profiles.owner_user_id. Never deletes. Columns in §3's table.
--   4. Keep rules on EVERY deletion path — BEFORE DELETE trigger on auth.users
--      (deleteUser, the Supabase dashboard, the UAT teardown):
--        a. refuse (42501 ACCOUNT_DELETE_ENTITY_OWNER) the owner of a firm /
--           company / government body / NGO that still has other members —
--           firm_profiles.owner_user_id is ON DELETE CASCADE, the firm would go;
--        b. transfer the firm assets;
--        c. keep the user's documents on a case that has ANOTHER participant
--           (or under legal hold): owner_user_id := null, the row and its file
--           stay for the other party (design note Q3);
--        d. snapshot the buyer (display_name, email, user_type) into
--           payment_orders.metadata.buyer_snapshot on every paid / refunded
--           order — payment_orders.user_id is SET NULL by its FK, and the tax
--           invoice must still say who bought.
--   5. firm_members: AFTER UPDATE, status → 'removed' transfers that member's
--      rows of that firm to its owner and notifies him (a count, no content).
--      A removed member no longer reaches them through can_access_case_row's
--      owner arm (the live leak this closes). Suspension moves nothing.
--   6. The freeze hides the public profile at the source: lawyer_profiles /
--      provider_profiles cannot be marketplace_visible while a request is
--      active (the 20261017_44 test_accounts technique). The value before the
--      freeze is kept on the request and restored by a cancel.
--   7. Functions (SECURITY DEFINER, search_path ''):
--        authenticated: request_account_deletion(reason), cancel_account_deletion()
--                       — no user id parameter: they act on auth.uid() only.
--        service_role:  account_deletion_request_for / account_deletion_cancel_for
--                       (admin freeze / restore), account_purge_claim(limit),
--                       account_purge_claim_user(user, actor) («حذف نهائي الآن»),
--                       account_purge_prepare(user), account_purge_finish(...),
--                       transfer_firm_assets(...).
--   8. entitlement_requests.decided_by → ON DELETE SET NULL (it was the only NO
--      ACTION key to auth.users in the repo; an admin who decided a request
--      could not be deleted). The constraint is found by its column.
--
-- THE PURGE (code: /api/v1/cron/account-purge and «حذف نهائي الآن»)
--   claim → prepare (block check, keep rules, storage paths that NO kept row
--   references — never by folder prefix) → auth.admin.deleteUser (the
--   trigger re-runs the keep rules) → Storage remove (after the delete: a
--   refused delete leaves the account blocked and restorable, with its files)
--   → finish.
--
-- DEPLOY ORDER — THIS FILE FIRST, THEN THE CODE. The code answers «غير متاح»
--   / keeps the old behaviour while these objects are missing.
--
-- NOT AFTER THIS FILE WITHOUT CARE
--   * Re-running 20260706_entitlement_requests does not touch decided_by
--     (create table if not exists) — fine.
--   * A NEW table holding a firm-case row with a user column that CASCADEs
--     must be added to transfer_firm_assets' list, or it is lost with the
--     member. _verify.sql (verify:account_deletion) names CASCADE keys on
--     tables with a firm_id that are not in the list.
--
-- Docker: supabase/tests/rls/account_deletion.test.sql (runs this file twice).
--
-- ROLLBACK (manual):
--   drop trigger if exists trg_auth_users_account_keep_rules on auth.users;
--   drop trigger if exists trg_firm_members_removed_transfer on public.firm_members;
--   drop trigger if exists trg_lawyer_profiles_account_frozen_unlisted on public.lawyer_profiles;
--   drop trigger if exists trg_provider_profiles_account_frozen_unlisted on public.provider_profiles;
--   then the functions; keep the two tables (they are records).
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.firm_profiles') is null
     or to_regclass('public.firm_members') is null then
    raise exception '20261026_70: profiles / firm_profiles / firm_members are missing — apply the phase-1 entity migrations first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'service_requests' and column_name = 'firm_id') then
    raise exception '20261026_70: service_requests.firm_id is missing — apply 20260903_phase2_clients_and_firm_membership.sql first';
  end if;
end $$;


-- ── 1. account_deletion_requests ─────────────────────────────────────────────
create table if not exists public.account_deletion_requests (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  status             text not null default 'requested',
  requested_at       timestamptz not null default now(),
  purge_after        timestamptz not null default (now() + interval '60 days'),
  requested_by       text not null default 'self',
  requested_by_user  uuid,
  reason             text,
  cancelled_at       timestamptz,
  cancelled_by       uuid,
  purge_started_at   timestamptz,
  purged_at          timestamptz,
  purge_report       jsonb not null default '{}'::jsonb,
  last_error         text,
  prior_listing      jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.account_deletion_requests drop constraint if exists account_deletion_requests_status_check;
alter table public.account_deletion_requests add constraint account_deletion_requests_status_check
  check (status in ('requested', 'purging', 'blocked', 'cancelled', 'purged'));
alter table public.account_deletion_requests drop constraint if exists account_deletion_requests_by_check;
alter table public.account_deletion_requests add constraint account_deletion_requests_by_check
  check (requested_by in ('self', 'admin'));
alter table public.account_deletion_requests drop constraint if exists account_deletion_requests_reason_check;
alter table public.account_deletion_requests add constraint account_deletion_requests_reason_check
  check (reason is null or length(reason) <= 500);
alter table public.account_deletion_requests drop constraint if exists account_deletion_requests_dates_check;
alter table public.account_deletion_requests add constraint account_deletion_requests_dates_check
  check (purge_after > requested_at
         and (status <> 'cancelled' or cancelled_at is not null)
         and (status <> 'purged' or purged_at is not null));

create unique index if not exists uq_account_deletion_requests_active
  on public.account_deletion_requests (user_id) where status in ('requested', 'purging', 'blocked');
create index if not exists idx_account_deletion_requests_due
  on public.account_deletion_requests (purge_after) where status = 'requested';

comment on table public.account_deletion_requests is
  'طلبات حذف الحساب (قرار المالك ٢٩٨، 20261026_70): تجميد ٦٠ يوماً ثم حذف نهائي. user_id بلا مفتاح أجنبي — الصف سجلّ الحذف ويبقى بعده. الكتابة عبر الدوال فقط.';

-- purge_after is requested_at + 60 days, whoever writes the row.
create or replace function public.account_deletion_requests_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.purge_after := new.requested_at + interval '60 days';
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_account_deletion_requests_dates on public.account_deletion_requests;
create trigger trg_account_deletion_requests_dates
  before insert or update on public.account_deletion_requests
  for each row execute function public.account_deletion_requests_dates();

alter table public.account_deletion_requests enable row level security;
drop policy if exists "own deletion requests" on public.account_deletion_requests;
create policy "own deletion requests" on public.account_deletion_requests
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.account_deletion_requests from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.account_deletion_requests from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.account_deletion_requests from authenticated;
    grant select on public.account_deletion_requests to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.account_deletion_requests to service_role;
  end if;
end $$;


-- ── 2. firm_asset_transfers (append-only trail) ──────────────────────────────
create table if not exists public.firm_asset_transfers (
  id            bigserial primary key,
  firm_id       uuid not null,
  from_user_id  uuid not null,
  to_user_id    uuid not null,
  table_name    text not null,
  row_id        text not null,
  column_name   text not null,
  reason        text not null,
  created_at    timestamptz not null default now()
);
alter table public.firm_asset_transfers drop constraint if exists firm_asset_transfers_reason_check;
alter table public.firm_asset_transfers add constraint firm_asset_transfers_reason_check
  check (reason in ('member_removed', 'account_deleted'));
create index if not exists idx_firm_asset_transfers_to on public.firm_asset_transfers (to_user_id, created_at desc);
create index if not exists idx_firm_asset_transfers_from on public.firm_asset_transfers (from_user_id);

comment on table public.firm_asset_transfers is
  'أصول المكتب المنقولة لصاحب المكتب (قرار المالك ٢٩٨، 20261026_70): من كتب السجل أصلاً ولمن انتقل ولماذا. بلا مفاتيح أجنبية — لا يمسّه حذف حساب.';

alter table public.firm_asset_transfers enable row level security;
drop policy if exists "firm owner reads transfers to him" on public.firm_asset_transfers;
create policy "firm owner reads transfers to him" on public.firm_asset_transfers
  for select to authenticated
  using (to_user_id = auth.uid());

revoke all on public.firm_asset_transfers from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.firm_asset_transfers from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.firm_asset_transfers from authenticated;
    grant select on public.firm_asset_transfers to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on public.firm_asset_transfers from service_role;
    grant select on public.firm_asset_transfers to service_role;
  end if;
end $$;


-- ── 3. transfer_firm_assets ──────────────────────────────────────────────────
-- The rows a member owns or wrote that belong to a firm — by their own firm_id
-- or by the firm of their case (service_requests.firm_id) — move to that
-- firm's owner. p_firm null = every firm; p_dry = count only (the purge guard).
-- A table or column missing on this database is skipped.
create or replace function public.firm_asset_specs()
returns table (tbl text, pk text, col text, firm_expr text, needs text[], extra text, guarded boolean)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('service_requests', 'id', 'requester_user_id', 't.firm_id', array['service_requests.firm_id'], '', true),
    ('service_requests', 'id', 'assigned_to',       't.firm_id', array['service_requests.firm_id'], '', true),
    ('case_stages',  'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['case_stages.firm_id', 'case_stages.case_request_id'], '', true),
    ('hearings',     'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['hearings.firm_id', 'hearings.case_request_id'], '', true),
    ('deadlines',    'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['deadlines.firm_id', 'deadlines.case_request_id'], '', true),
    ('case_graphs',  'case_request_id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['case_graphs.firm_id', 'case_graphs.case_request_id'], '', true),
    ('case_tracking_links', 'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['case_tracking_links.firm_id', 'case_tracking_links.case_request_id'], '', true),
    ('activity_events', 'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['activity_events.firm_id', 'activity_events.case_request_id'], '', true),
    ('tasks',        'id', 'owner_user_id',    'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['tasks.firm_id', 'tasks.case_request_id'], '', true),
    ('tasks',        'id', 'assignee_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['tasks.firm_id', 'tasks.case_request_id'], '', true),
    -- one rule per (owner, code): a code the owner already has stays with the
    -- member (and goes with him); deadlines that used it keep their dates.
    ('deadline_rules', 'id', 'owner_user_id', 't.firm_id', array['deadline_rules.firm_id', 'deadline_rules.code'],
       'and not exists (select 1 from public.deadline_rules d2 where d2.owner_user_id = fp.owner_user_id and d2.code = t.code)', false),
    ('lawyer_clients',      'id', 'owner_user_id',  't.firm_id', array['lawyer_clients.firm_id'], '', true),
    ('lawyer_client_notes', 'id', 'author_user_id', 't.firm_id', array['lawyer_client_notes.firm_id'], '', true),
    ('consultations', 'id', 'lawyer_user_id',    'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['consultations.firm_id', 'consultations.request_id'], '', true),
    ('consultations', 'id', 'requester_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['consultations.firm_id', 'consultations.request_id'], '', true),
    ('consultation_notes', 'id', 'author_user_id', '(select c.firm_id from public.consultations c where c.id = t.consultation_id)', array['consultation_notes.consultation_id', 'consultations.firm_id'], '', true),
    ('contracts', 'id', 'owner_user_id',    'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['contracts.firm_id', 'contracts.request_id'], '', true),
    ('contracts', 'id', 'assigned_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['contracts.firm_id', 'contracts.request_id'], '', true),
    -- every visibility, private included (design note Q2: kept, still private)
    ('case_notes', 'id', 'author_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['case_notes.firm_id', 'case_notes.request_id'], '', true),
    ('attachments', 'id', 'owner_user_id', '(select sr.firm_id from public.service_requests sr where sr.id = t.request_id)', array['attachments.request_id'], '', true),
    -- a private dashboard note that is not on a firm case is personal
    ('dashboard_notes', 'id', 'author_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['dashboard_notes.firm_id', 'dashboard_notes.case_request_id', 'dashboard_notes.visibility'],
       'and (t.visibility <> ''private'' or (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id) is not null)', true)
  ) as s(tbl, pk, col, firm_expr, needs, extra, guarded);
$$;

comment on function public.firm_asset_specs() is
  '20261026_70: the firm-asset columns transfer_firm_assets moves to the firm owner (table, pk, user column, firm expression over alias t, required columns, extra condition, counted by the purge guard).';

create or replace function public.firm_asset_spec_ready(p_needs text[], p_tbl text, p_col text, p_pk text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  need text;
begin
  if to_regclass('public.' || p_tbl) is null then return false; end if;
  foreach need in array p_needs || array[p_tbl || '.' || p_col, p_tbl || '.' || p_pk] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public'
                      and table_name = split_part(need, '.', 1)
                      and column_name = split_part(need, '.', 2)) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.transfer_firm_assets(p_user uuid, p_firm uuid, p_reason text, p_dry boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  spec   record;
  n      int;
  total  int := 0;
  counts jsonb := '{}'::jsonb;
  o      record;
begin
  if p_user is null then
    return jsonb_build_object('total', 0);
  end if;
  if p_reason not in ('member_removed', 'account_deleted') then
    raise exception 'transfer_firm_assets: unknown reason %', p_reason;
  end if;

  for spec in select * from public.firm_asset_specs() loop
    if not public.firm_asset_spec_ready(spec.needs, spec.tbl, spec.col, spec.pk) then
      continue;
    end if;
    if p_dry then
      if not spec.guarded then continue; end if;
      execute format(
        'select count(*) from public.%1$I t join public.firm_profiles fp on fp.id = %3$s
          where t.%2$I = $1 and fp.owner_user_id is distinct from $1 and ($2::uuid is null or fp.id = $2) %4$s',
        spec.tbl, spec.col, spec.firm_expr, spec.extra)
        into n using p_user, p_firm;
    else
      execute format(
        'with moved as (
           update public.%1$I t set %2$I = fp.owner_user_id
             from public.firm_profiles fp
            where t.%2$I = $1 and fp.id = %3$s
              and fp.owner_user_id is distinct from $1
              and ($2::uuid is null or fp.id = $2) %4$s
           returning t.%5$I::text as row_id, fp.id as firm_id, fp.owner_user_id as to_user)
         insert into public.firm_asset_transfers (firm_id, from_user_id, to_user_id, table_name, row_id, column_name, reason)
         select firm_id, $1, to_user, %6$L, row_id, %7$L, $3 from moved',
        spec.tbl, spec.col, spec.firm_expr, spec.extra, spec.pk, spec.tbl, spec.col)
        using p_user, p_firm, p_reason;
      get diagnostics n = row_count;
    end if;
    if n > 0 then
      counts := counts || jsonb_build_object(spec.tbl || '.' || spec.col, n);
      total := total + n;
    end if;
  end loop;

  -- One notification per receiving owner, with a count and never the content.
  if not p_dry and total > 0 and to_regclass('public.notifications') is not null then
    for o in
      select t.to_user_id, count(*) as n
        from public.firm_asset_transfers t
       where t.from_user_id = p_user and t.reason = p_reason and t.created_at = now()
       group by t.to_user_id
    loop
      if exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'notifications' and column_name = 'href') then
        insert into public.notifications (user_id, title, body, href)
        values (o.to_user_id,
                case when p_reason = 'member_removed' then 'انتقلت إليك ملفات عضو أُخرج من المكتب'
                     else 'انتقلت إليك ملفات عضو حُذف حسابه' end,
                format('انتقل إليك %s سجلاً من قضايا المكتب وملاحظاته ومستنداته، وبقيت محفوظة ضمن أصول المكتب.', o.n),
                '/dashboard/firm/team');
      else
        insert into public.notifications (user_id, title, body)
        values (o.to_user_id,
                case when p_reason = 'member_removed' then 'انتقلت إليك ملفات عضو أُخرج من المكتب'
                     else 'انتقلت إليك ملفات عضو حُذف حسابه' end,
                format('انتقل إليك %s سجلاً من قضايا المكتب وملاحظاته ومستنداته، وبقيت محفوظة ضمن أصول المكتب.', o.n));
      end if;
    end loop;
  end if;

  return jsonb_build_object('total', total, 'by_column', counts);
end;
$$;

comment on function public.transfer_firm_assets(uuid, uuid, text, boolean) is
  '20261026_70 (owner ٢٩٨): moves a departing member''s firm rows to the firm owner, recording each move in firm_asset_transfers. Never deletes. p_dry counts what is still owned (purge guard).';


-- ── 4. Entity owner block, keep rules ────────────────────────────────────────
-- Non-null when deleting p_user would cascade away an entity that other people
-- still belong to.
create or replace function public.account_entity_owner_block(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  spec record;
  hit  boolean;
begin
  for spec in
    select * from (values
      ('firm',       'firm_profiles',       'firm_members',       'firm_id'),
      ('business',   'business_profiles',   'business_members',   'business_id'),
      ('government', 'government_profiles', 'government_members', 'gov_id'),
      ('ngo',        'ngo_profiles',        'ngo_members',        'ngo_id')
    ) as s(kind, profiles, members, fk)
  loop
    if to_regclass('public.' || spec.profiles) is null or to_regclass('public.' || spec.members) is null then
      continue;
    end if;
    execute format(
      'select exists (select 1 from public.%1$I e join public.%2$I m on m.%3$I = e.id
                       where e.owner_user_id = $1 and m.user_id <> $1 and m.status <> ''removed'')',
      spec.profiles, spec.members, spec.fk)
      into hit using p_user;
    if hit then return spec.kind; end if;
  end loop;
  return null;
end;
$$;

create or replace function public.account_keep_rules(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved     jsonb;
  detached  int := 0;
  snapped   int := 0;
  hold_sql  text := '';
  prof      jsonb;
begin
  moved := public.transfer_firm_assets(p_user, null, 'account_deleted');

  -- c. documents on a case someone else is on (or under legal hold) stay
  if to_regclass('public.attachments') is not null then
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'attachments' and column_name = 'legal_hold') then
      hold_sql := ' or a.legal_hold';
    end if;
    execute format(
      'update public.attachments a set owner_user_id = null
        where a.owner_user_id = $1
          and ((a.request_id is not null and exists (
                  select 1 from public.service_requests sr
                   where sr.id = a.request_id
                     and ((sr.requester_user_id is not null and sr.requester_user_id <> $1)
                       or (sr.assigned_to is not null and sr.assigned_to <> $1))))%s)', hold_sql)
      using p_user;
    get diagnostics detached = row_count;
  end if;

  -- d. the buyer on the tax invoices
  if to_regclass('public.payment_orders') is not null then
    select to_jsonb(p) into prof from public.profiles p where p.id = p_user;
    update public.payment_orders po
       set metadata = coalesce(po.metadata, '{}'::jsonb) || jsonb_build_object('buyer_snapshot', jsonb_build_object(
             'user_id',      p_user,
             'display_name', prof->>'display_name',
             'email',        prof->>'email',
             'user_type',    prof->>'user_type',
             'captured_at',  now(),
             'reason',       'account_deleted'))
     where po.user_id = p_user
       and po.status in ('paid', 'refunded')
       and not (coalesce(po.metadata, '{}'::jsonb) ? 'buyer_snapshot');
    get diagnostics snapped = row_count;
  end if;

  return jsonb_build_object('transferred', moved, 'documents_kept_for_others', detached, 'invoices_snapshotted', snapped);
end;
$$;

comment on function public.account_keep_rules(uuid) is
  '20261026_70: what survives an account (owner ٢٩٨) — firm assets to the firm owner, documents on a shared case kept for the other party, the buyer snapshotted onto paid invoices. Idempotent.';

-- Every deletion path: deleteUser, the Supabase dashboard, a teardown script.
create or replace function public.account_delete_keep_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block text;
begin
  v_block := public.account_entity_owner_block(old.id);
  if v_block is not null then
    raise exception using errcode = '42501',
      message = format('ACCOUNT_DELETE_ENTITY_OWNER: account %s owns a %s that still has members — remove them or transfer the %s first (owner ٢٩٨, 20261026_70)', old.id, v_block, v_block);
  end if;
  perform public.account_keep_rules(old.id);
  return old;
end;
$$;

drop trigger if exists trg_auth_users_account_keep_rules on auth.users;
create trigger trg_auth_users_account_keep_rules
  before delete on auth.users
  for each row execute function public.account_delete_keep_rules();


-- ── 5. Member removal moves his firm rows ────────────────────────────────────
create or replace function public.firm_member_removed_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'removed' and old.status is distinct from 'removed' then
    perform public.transfer_firm_assets(new.user_id, new.firm_id, 'member_removed');
  end if;
  return null;
end;
$$;

drop trigger if exists trg_firm_members_removed_transfer on public.firm_members;
create trigger trg_firm_members_removed_transfer
  after update of status on public.firm_members
  for each row execute function public.firm_member_removed_transfer();


-- ── 6. A frozen account is never listed ──────────────────────────────────────
create or replace function public.account_frozen_never_listed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.marketplace_visible is true
     and exists (select 1 from public.account_deletion_requests r
                  where r.user_id = new.user_id and r.status in ('requested', 'purging', 'blocked')) then
    new.marketplace_visible := false;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['lawyer_profiles', 'provider_profiles'] loop
    if to_regclass('public.' || t) is null
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'marketplace_visible')
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      raise notice '20261026_70: public.% has no (user_id, marketplace_visible) here — skipped', t;
      continue;
    end if;
    execute format('drop trigger if exists trg_%s_account_frozen_unlisted on public.%I', t, t);
    execute format(
      'create trigger trg_%s_account_frozen_unlisted before insert or update on public.%I '
      'for each row execute function public.account_frozen_never_listed()', t, t);
  end loop;
end $$;

-- Remember the listing, then unlist (the trigger above does the forcing).
create or replace function public.account_freeze_apply(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t     text;
  v     boolean;
  prior jsonb := '{}'::jsonb;
begin
  foreach t in array array['lawyer_profiles', 'provider_profiles'] loop
    if to_regclass('public.' || t) is null
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'marketplace_visible') then
      continue;
    end if;
    execute format('select marketplace_visible from public.%I where user_id = $1', t) into v using p_user;
    if v is not null then
      prior := prior || jsonb_build_object(t, v);
      execute format('update public.%I set marketplace_visible = false where user_id = $1 and marketplace_visible', t) using p_user;
    end if;
  end loop;
  return prior;
end;
$$;

create or replace function public.account_freeze_lift(p_user uuid, p_prior jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text;
begin
  foreach t in array array['lawyer_profiles', 'provider_profiles'] loop
    if to_regclass('public.' || t) is null or coalesce((p_prior->>t)::boolean, false) is not true then
      continue;
    end if;
    execute format('update public.%I set marketplace_visible = true where user_id = $1', t) using p_user;
  end loop;
end;
$$;


-- ── 7. Request / cancel ──────────────────────────────────────────────────────
create or replace function public.account_deletion_open(p_user uuid, p_by text, p_actor uuid, p_reason text, p_status text default 'requested')
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.account_deletion_requests;
begin
  select * into r from public.account_deletion_requests
   where user_id = p_user and status in ('requested', 'purging', 'blocked');
  if found then return r; end if;

  insert into public.account_deletion_requests (user_id, status, requested_by, requested_by_user, reason, purge_started_at)
  values (p_user, p_status, p_by, p_actor, nullif(left(btrim(coalesce(p_reason, '')), 500), ''),
          case when p_status = 'purging' then now() end)
  returning * into r;

  update public.account_deletion_requests
     set prior_listing = public.account_freeze_apply(p_user)
   where id = r.id
  returning * into r;
  return r;
end;
$$;

create or replace function public.account_deletion_json(r public.account_deletion_requests)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', r.id, 'status', r.status, 'requested_at', r.requested_at,
                            'purge_after', r.purge_after, 'requested_by', r.requested_by);
$$;

create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := auth.uid();
  v_type text;
  v_block text;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_SIGNED_OUT';
  end if;
  select user_type into v_type from public.profiles where id = uid;
  if not found then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_NO_PROFILE';
  end if;
  if v_type = 'admin' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_ADMIN';
  end if;
  v_block := public.account_entity_owner_block(uid);
  if v_block is not null then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_ENTITY_OWNER:' || v_block;
  end if;
  return public.account_deletion_json(public.account_deletion_open(uid, 'self', uid, p_reason));
end;
$$;

create or replace function public.account_deletion_close(p_user uuid, p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prior jsonb;
begin
  if p_user is null then return false; end if;
  update public.account_deletion_requests
     set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor
   where user_id = p_user and status in ('requested', 'blocked')
  returning prior_listing into v_prior;
  if not found then return false; end if;
  perform public.account_freeze_lift(p_user, v_prior);
  return true;
end;
$$;

create or replace function public.cancel_account_deletion()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.account_deletion_close(auth.uid(), auth.uid());
$$;

create or replace function public.account_deletion_request_for(p_user uuid, p_actor uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  select user_type into v_type from public.profiles where id = p_user;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_DELETION_NO_PROFILE';
  end if;
  if v_type = 'admin' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_ADMIN';
  end if;
  return public.account_deletion_json(public.account_deletion_open(p_user, 'admin', p_actor, p_reason));
end;
$$;

create or replace function public.account_deletion_cancel_for(p_user uuid, p_actor uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.account_deletion_close(p_user, p_actor);
$$;


-- ── 8. The purge ─────────────────────────────────────────────────────────────
-- Claims due requests (and ones a dead run left in 'purging' for an hour).
create or replace function public.account_purge_claim(p_limit int default 20)
returns table (request_id uuid, account_id uuid)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select r.id
      from public.account_deletion_requests r
     where (r.status = 'requested' and r.purge_after <= now())
        or (r.status = 'purging' and r.purge_started_at < now() - interval '1 hour')
     order by r.purge_after
     limit greatest(coalesce(p_limit, 20), 1)
     for update skip locked
  )
  update public.account_deletion_requests r
     set status = 'purging', purge_started_at = now(), last_error = null
    from due
   where r.id = due.id
  returning r.id, r.user_id;
$$;

-- «حذف نهائي الآن»: open (or take over) the user's request as 'purging'.
create or replace function public.account_purge_claim_user(p_user uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.account_deletion_requests;
begin
  select * into r from public.account_deletion_requests
   where user_id = p_user and status in ('requested', 'purging', 'blocked')
   for update;
  if found then
    if r.status = 'purging' and r.purge_started_at >= now() - interval '1 hour' then
      raise exception using errcode = '55000', message = 'ACCOUNT_PURGE_IN_PROGRESS';
    end if;
    update public.account_deletion_requests
       set status = 'purging', purge_started_at = now(), last_error = null
     where id = r.id;
    return r.id;
  end if;
  r := public.account_deletion_open(p_user, 'admin', p_actor, 'حذف نهائي فوري من الإدارة', 'purging');
  return r.id;
end;
$$;

-- Block check, keep rules, then the storage objects nothing kept refers to.
create or replace function public.account_purge_prepare(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block  text;
  v_keep   jsonb;
  v_left   jsonb;
  v_paths  text[];
  q        text;
  keepers  text := '';
begin
  v_block := public.account_entity_owner_block(p_user);
  if v_block is not null then
    return jsonb_build_object('ok', false, 'blocked', 'entity_owner', 'kind', v_block);
  end if;

  v_keep := public.account_keep_rules(p_user);

  -- Nothing firm-scoped may still point at the user (a move that silently
  -- matched nothing must not become a deletion).
  v_left := public.transfer_firm_assets(p_user, null, 'account_deleted', true);
  if coalesce((v_left->>'total')::int, 0) > 0 then
    return jsonb_build_object('ok', false, 'blocked', 'firm_assets_left', 'left', v_left);
  end if;

  q := 'select coalesce(array_agg(distinct p order by p), ''{}'') from (';
  q := q || 'select a.storage_path as p from public.attachments a where a.owner_user_id = $1';
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'law_article_notes' and column_name = 'audio_path') then
    q := q || ' union all select n.audio_path from public.law_article_notes n where n.user_id = $1';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'lawyer_profiles' and column_name = 'licence_image_path') then
    q := q || ' union all select lp.licence_image_path from public.lawyer_profiles lp where lp.user_id = $1';
  end if;
  if to_regclass('storage.objects') is not null then
    q := q || ' union all select o.name from storage.objects o where o.bucket_id = ''documents''
                 and (o.name like $1::text || ''/%'' or o.name like ''licences/'' || $1::text || ''/%'')';
  end if;
  if to_regclass('public.contract_versions') is not null then
    keepers := keepers || ' and not exists (select 1 from public.contract_versions cv where cv.storage_path = x.p)';
  end if;
  q := q || ') x where x.p is not null and x.p <> ''''
            and not exists (select 1 from public.attachments a2
                             where a2.storage_path = x.p and a2.owner_user_id is distinct from $1)' || keepers;
  execute q into v_paths using p_user;

  return jsonb_build_object('ok', true, 'keep', v_keep, 'storage_paths', to_jsonb(v_paths));
end;
$$;

create or replace function public.account_purge_finish(p_request uuid, p_outcome text, p_report jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome = 'purged' then
    update public.account_deletion_requests
       set status = 'purged', purged_at = now(), purge_report = coalesce(p_report, '{}'::jsonb), last_error = null
     where id = p_request and status = 'purging';
  elsif p_outcome = 'blocked' then
    update public.account_deletion_requests
       set status = 'blocked', purge_report = coalesce(p_report, '{}'::jsonb), last_error = left(p_error, 2000)
     where id = p_request and status = 'purging';
  elsif p_outcome = 'retry' then
    update public.account_deletion_requests
       set status = 'requested', purge_report = coalesce(p_report, '{}'::jsonb), last_error = left(p_error, 2000)
     where id = p_request and status = 'purging';
  else
    raise exception 'account_purge_finish: unknown outcome %', p_outcome;
  end if;
end;
$$;


-- ── 9. entitlement_requests.decided_by: SET NULL ─────────────────────────────
do $$
declare
  c record;
begin
  if to_regclass('public.entitlement_requests') is null then
    raise notice '20261026_70: public.entitlement_requests is missing here — decided_by skipped';
    return;
  end if;
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
     where con.conrelid = 'public.entitlement_requests'::regclass
       and con.contype = 'f' and a.attname = 'decided_by' and con.confdeltype <> 'n'
  loop
    execute format('alter table public.entitlement_requests drop constraint %I', c.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
     where con.conrelid = 'public.entitlement_requests'::regclass and con.contype = 'f' and a.attname = 'decided_by') then
    alter table public.entitlement_requests
      add constraint entitlement_requests_decided_by_fkey
      foreign key (decided_by) references auth.users(id) on delete set null;
  end if;
end $$;


-- ── 10. Privileges ───────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.firm_asset_specs()',
    'public.firm_asset_spec_ready(text[], text, text, text)',
    'public.transfer_firm_assets(uuid, uuid, text, boolean)',
    'public.account_entity_owner_block(uuid)',
    'public.account_keep_rules(uuid)',
    'public.account_delete_keep_rules()',
    'public.firm_member_removed_transfer()',
    'public.account_frozen_never_listed()',
    'public.account_freeze_apply(uuid)',
    'public.account_freeze_lift(uuid, jsonb)',
    'public.account_deletion_requests_dates()',
    'public.account_deletion_open(uuid, text, uuid, text, text)',
    'public.account_deletion_json(public.account_deletion_requests)',
    'public.account_deletion_close(uuid, uuid)',
    'public.request_account_deletion(text)',
    'public.cancel_account_deletion()',
    'public.account_deletion_request_for(uuid, uuid, text)',
    'public.account_deletion_cancel_for(uuid, uuid)',
    'public.account_purge_claim(int)',
    'public.account_purge_claim_user(uuid, uuid)',
    'public.account_purge_prepare(uuid)',
    'public.account_purge_finish(uuid, text, jsonb, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.request_account_deletion(text) to authenticated;
    grant execute on function public.cancel_account_deletion() to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array[
      'public.transfer_firm_assets(uuid, uuid, text, boolean)',
      'public.account_deletion_request_for(uuid, uuid, text)',
      'public.account_deletion_cancel_for(uuid, uuid)',
      'public.account_purge_claim(int)',
      'public.account_purge_claim_user(uuid, uuid)',
      'public.account_purge_prepare(uuid)',
      'public.account_purge_finish(uuid, text, jsonb, text)'
    ] loop
      execute format('grant execute on function %s to service_role', f);
    end loop;
  end if;
end $$;

comment on function public.request_account_deletion(text) is
  '20261026_70 (owner ٢٩٨): the caller freezes his own account for 60 days. No user id parameter — auth.uid() only. Refuses admins (42501) and owners of an entity with members (55000).';
comment on function public.cancel_account_deletion() is
  '20261026_70 (owner ٢٩٨): the caller restores his own frozen account while the purge has not started.';


-- ── 11. Verify — raises, so a half-applied file cannot look applied ──────────
do $$
declare
  probe  public.account_deletion_requests;
  r      text;
  p      text;
  f      text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.account_deletion_requests'::regclass) then
    raise exception '20261026_70 verify: RLS is off on account_deletion_requests';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.firm_asset_transfers'::regclass) then
    raise exception '20261026_70 verify: RLS is off on firm_asset_transfers';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'account_deletion_requests') <> 1 then
    raise exception '20261026_70 verify: account_deletion_requests must have exactly its one SELECT policy';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = r) then continue; end if;
    foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege(r, 'public.account_deletion_requests', p)
         or has_table_privilege(r, 'public.firm_asset_transfers', p) then
        raise exception '20261026_70 verify: % holds % on a D6 table', r, p;
      end if;
    end loop;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach f in array array['public.transfer_firm_assets(uuid, uuid, text, boolean)', 'public.account_purge_prepare(uuid)',
                             'public.account_deletion_request_for(uuid, uuid, text)', 'public.account_purge_claim(int)'] loop
      if has_function_privilege('authenticated', f, 'EXECUTE') then
        raise exception '20261026_70 verify: authenticated may execute %', f;
      end if;
    end loop;
    if not has_function_privilege('authenticated', 'public.request_account_deletion(text)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.cancel_account_deletion()', 'EXECUTE') then
      raise exception '20261026_70 verify: authenticated cannot request / cancel its own deletion';
    end if;
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
                  and tgname = 'trg_auth_users_account_keep_rules' and not tgisinternal and tgenabled <> 'D') then
    raise exception '20261026_70 verify: the keep-rules trigger on auth.users is missing or disabled';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.firm_members'::regclass
                  and tgname = 'trg_firm_members_removed_transfer' and not tgisinternal and tgenabled <> 'D') then
    raise exception '20261026_70 verify: the member-removal transfer trigger is missing or disabled';
  end if;
  if to_regclass('public.lawyer_profiles') is not null
     and not exists (select 1 from pg_trigger where tgrelid = 'public.lawyer_profiles'::regclass
                      and tgname = 'trg_lawyer_profiles_account_frozen_unlisted' and not tgisinternal) then
    raise exception '20261026_70 verify: lawyer_profiles has no frozen-account unlisting trigger';
  end if;
  if to_regclass('public.entitlement_requests') is not null and exists (
       select 1 from pg_constraint con
         join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
        where con.conrelid = 'public.entitlement_requests'::regclass and con.contype = 'f'
          and a.attname = 'decided_by' and con.confdeltype <> 'n') then
    raise exception '20261026_70 verify: entitlement_requests.decided_by still blocks account deletion';
  end if;

  -- purge_after is requested_at + 60 days even when a writer says otherwise
  begin
    insert into public.account_deletion_requests (user_id, requested_at, purge_after)
    values (gen_random_uuid(), now() - interval '1 day', now())
    returning * into probe;
    if probe.purge_after <> probe.requested_at + interval '60 days' then
      raise exception '20261026_70 verify: purge_after is not requested_at + 60 days';
    end if;
    raise exception using errcode = 'P0001', message = '20261026_70-probe-ok';
  exception when raise_exception then
    if sqlerrm <> '20261026_70-probe-ok' then raise; end if;
  end;

  raise notice '20261026_70 verify: OK — account_deletion_requests (60-day freeze, own-row read, function-only writes), firm_asset_transfers trail, keep rules on auth.users delete, member removal moves firm rows to the owner, frozen accounts unlisted, entitlement_requests.decided_by SET NULL';
end $$;

commit;

notify pgrst, 'reload schema';
