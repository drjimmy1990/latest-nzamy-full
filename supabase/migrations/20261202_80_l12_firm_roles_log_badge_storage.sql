-- =============================================================================
-- Migration: 20261202_80_l12_firm_roles_log_badge_storage.sql   (verify id: l12_firm)
-- =============================================================================
-- PURPOSE (batch l12, builder «firm» — the owner's answers of 20 Nov 2026)
--
--   A. Q112 + file 05 #28 — firm roles and cases, the database and the screens
--      agree. Owner default (F01 #112): «يُقصر الإداري والموارد البشرية والامتثال
--      على ما يُسند إليهم، والمالي يرى المالية دون تفاصيل القضايا». Built as an
--      ADMIN SETTING (his assistant's default, reversible):
--        platform_settings.firm_case_scope =
--          {"assigned_only_roles": ["office_admin","hr_manager","compliance_manager"],
--           "finance_manager_no_cases": true}
--      1. public.firm_case_scope_roles() — the roles narrowed to their assigned
--         cases: ALWAYS trainee + legal_secretary (owner file 15 row 2), plus
--         the setting's assigned_only_roles kept to the three office roles
--         above. A missing or malformed setting reads as the default (all
--         three); an explicit [] switches the narrowing off.
--      2. public.firm_case_scoped_member(p_firm) — same name, same signature,
--         same grants as 20261129_10; its role list now comes from (1). Every
--         policy that calls it (case_visible, service_requests, client cards,
--         contracts, consultations, the no-case rows of 20261201_10) follows.
--      3. The finance manager: «المالية دون تفاصيل القضايا». He is NOT put in
--         (1): that would hide the time / expense / trust-ledger rows and the
--         client cards his finance screens read (they go through case_visible
--         and client_card_visible). Instead ONE new RESTRICTIVE SELECT policy
--         on the case row itself:
--           «firm case: finance manager sees no case files»
--           using (firm_id is null or not firm_case_finance_member(firm_id)
--                  or firm_case_assigned(id))
--         firm_case_finance_member = an ACTIVE finance_manager of the firm who
--         is not its owner, while the setting's finance_manager_no_cases is
--         true (default true). firm_case_assigned = filer, lead, active
--         case-team member, or the assignee of one of its hearings / tasks.
--
--   B. Q113 (أ) — the company seat numbers on /pricing start at 5, the built
--      default (business_profiles.max_seats default 5). business_plan_seat_cap
--      re-created: biz-sm-basic 3 → 5, dept-sm-basic 2 → 5; every other plan
--      unchanged. (cap = greatest(plan, max_seats), so no company loses a seat.)
--
--   C. Q114 — firm_extra_seat_price_sar: {"sar": 250} (SAR a year before VAT)
--      ONLY while it is still {"sar": null}; an admin's own value is kept. Not
--      shown publicly and not sold online until payment is switched on.
--
--   D. N16 — restricted case: every open by someone who sees it only by office
--      (the firm owner, an active managing partner, a platform admin — not its
--      filer, lead or case team) is logged, and the case's filer / lead reads
--      the log.
--        public.restricted_case_open_log   append-only (UPDATE/DELETE refused
--          by trigger), RLS forced, no policy, nothing granted to sessions.
--        public.log_restricted_case_open(p_request) → text, definer,
--          authenticated: 'logged' | 'recent' (same viewer within 10 minutes)
--          | 'own' | 'not_restricted' | 'not_privileged'.
--        public.restricted_case_open_log_read(p_request) → rows, definer,
--          authenticated: only the case's filer or lead (or an admin); 42501
--          otherwise.
--
--   E. N18 — the community badge «مكتب معتمد» (replaces «موثّق»; owner RAW
--      [39]: «مكتب محاماة مسجّل في نظامي ومشترك في باقة مكتب سارية», default
--      «any paid office plan»). public.community_verified_office_users(uuid[])
--      re-created (same name, signature and grants — service_role only): the
--      owner of a firm whose registration is verified (kept as the floor that
--      «مسجّل» names) AND that holds an ACTIVE, unexpired, non-trial
--      subscription to an office plan (firm-basic or firm-enterprise) — the
--      owner's own or the firm entity's. The licensed-lawyer arm of 20261127_60
--      is dropped (the owner's definition replaces it).
--      community_is_verified_office() and community_lawyers_space_ok() call
--      it, so the lawyers-only community follows the same rule.
--
--   F. N21 — founder storage fair use (owner RAW [33], default): no gigabyte
--      is promised anywhere; internally 25 GB per founder with an alert at
--      80 %, never a block without an alert.
--        platform_settings.founder_storage_fair_use = {"gb": 25, "alert_pct": 80}
--        public.founder_storage_usage() → (user_id, used_bytes) for every
--          active founder seat, summed from storage.objects (owner_id or
--          owner, whichever this storage schema has). Service role only.
--        public.founder_storage_alerts — one marker per founder and month, so
--          the daily job alerts once (cron route /api/v1/cron/founder-storage).
--      Skipped with a NOTICE where founder_seats or storage.objects is missing.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261202_80_l12_firm_roles_log_badge_storage.sql
--   Expect: NOTICE  l12_firm verify: OK  and a final row with `t`.
--   Then run the `-- >>> verify:l12_firm` block of supabase/migrations/_verify.sql.
--
-- RUN ORDER: after 20261129_10, 20261201_10, 20261201_50 and 20261128_10.
--   Either order with the code deploy:
--   - A: the old code reads cases through RLS; the narrower rule only shows
--     fewer rows. The new /firm/cases rule (trainee allowed) shows him his own.
--   - D: before this file the code's log call answers 42883 and is skipped.
--   - F: before this file the cron route answers {skipped:"schema_missing"}.
-- RE-RUN HAZARD: re-running 20261129_10 puts back the fixed trainee/secretary
--   list and the old seat mapping; re-running 20261127_60 or 20261201_50
--   puts back the old badge rule — re-run THIS file after any of them.
-- Idempotent: every object is create-or-replace / if-not-exists, settings are
--   ON CONFLICT DO NOTHING, the seat price is set only while null.
--
-- ROLLBACK:
--   begin;
--     drop policy if exists "firm case: finance manager sees no case files" on public.service_requests;
--     delete from public.platform_settings where key in ('firm_case_scope', 'founder_storage_fair_use');
--     -- then re-run 20261129_10 (fixed role list + seat mapping) and 20261201_50 + 20261127_60 part A5 (badge)
--     drop function if exists public.firm_case_finance_member(uuid), public.firm_case_assigned(text),
--       public.firm_case_scope_roles(), public.log_restricted_case_open(text),
--       public.restricted_case_open_log_read(text), public.founder_storage_usage();
--     -- the two tables are records — keep them (or drop them last):
--     -- drop table if exists public.restricted_case_open_log, public.founder_storage_alerts;
--   commit;
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261202_80: public.platform_settings is missing (run 20260627_platform_settings.sql first)';
  end if;
  if to_regprocedure('public.firm_case_scoped_member(uuid)') is null
     or to_regprocedure('public.case_visible(text)') is null then
    raise exception '20261202_80: run 20261129_10_firm_company_roles_seats.sql first (firm_case_scoped_member, case_visible)';
  end if;
end
$pre$;

-- ═════════════════════════════════════════════════════════════════════════════
-- A. Q112 + file 05 #28 — firm roles narrowed to their assigned cases
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.platform_settings (key, value, description) values
  ('firm_case_scope',
   '{"assigned_only_roles": ["office_admin", "hr_manager", "compliance_manager"], "finance_manager_no_cases": true}'::jsonb,
   'أدوار المكتب التي ترى القضايا المسندة إليها وحدها (س١١٢): المتدرب والسكرتير دائماً، ويضاف إليهما ما في assigned_only_roles من: office_admin (الإداري)، hr_manager (الموارد البشرية)، compliance_manager (الامتثال). و finance_manager_no_cases=true: المدير المالي يرى المالية والأتعاب ولا يرى ملفات القضايا إلا ما أُسند إليه (20261202_80)')
on conflict (key) do nothing;

create or replace function public.firm_case_scope_roles()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_value jsonb;
  v_extra text[];
begin
  select s.value into v_value from public.platform_settings s where s.key = 'firm_case_scope';
  if v_value is not null and pg_catalog.jsonb_typeof(v_value -> 'assigned_only_roles') = 'array' then
    select coalesce(pg_catalog.array_agg(distinct r.role), '{}'::text[]) into v_extra
      from pg_catalog.jsonb_array_elements_text(v_value -> 'assigned_only_roles') as r(role)
     where r.role in ('office_admin', 'hr_manager', 'compliance_manager');
  else
    v_extra := array['office_admin', 'hr_manager', 'compliance_manager'];
  end if;
  return array['trainee', 'legal_secretary'] || v_extra;
end
$fn$;

comment on function public.firm_case_scope_roles() is
  'Q112 (20261202_80): the firm roles that see only the cases and clients assigned to them — trainee and legal_secretary always, plus platform_settings.firm_case_scope.assigned_only_roles kept to office_admin / hr_manager / compliance_manager (default all three; [] = none).';

create or replace function public.firm_case_scoped_member(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_firm is not null
     and exists (select 1 from public.firm_members m
                  where m.firm_id = p_firm and m.user_id = auth.uid()
                    and m.status = 'active' and m.role = any (public.firm_case_scope_roles()))
     and not exists (select 1 from public.firm_profiles fp
                      where fp.id = p_firm and fp.owner_user_id = auth.uid());
$$;

comment on function public.firm_case_scoped_member(uuid) is
  'Owner file 15 row 2 (20261129_10) + Q112 (20261202_80): the caller is an ACTIVE member of p_firm in a role of firm_case_scope_roles() (trainee, legal_secretary and, by the admin setting, office_admin / hr_manager / compliance_manager) and not its owner — he sees only the firm cases and clients assigned to him.';

create or replace function public.firm_case_finance_member(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_firm is not null
     and coalesce((select case when pg_catalog.jsonb_typeof(s.value -> 'finance_manager_no_cases') = 'boolean'
                               then (s.value ->> 'finance_manager_no_cases')::boolean else true end
                     from public.platform_settings s where s.key = 'firm_case_scope'), true)
     and exists (select 1 from public.firm_members m
                  where m.firm_id = p_firm and m.user_id = auth.uid()
                    and m.status = 'active' and m.role = 'finance_manager')
     and not exists (select 1 from public.firm_profiles fp
                      where fp.id = p_firm and fp.owner_user_id = auth.uid());
$$;

comment on function public.firm_case_finance_member(uuid) is
  'Q112 (20261202_80): the caller is an ACTIVE finance_manager of p_firm (not its owner) and platform_settings.firm_case_scope.finance_manager_no_cases is on (default) — he reads no case file unless it is assigned to him.';

-- assigned = filer, lead, active case-team member, or (when the columns exist)
-- the assignee of one of the case's hearings or tasks.
do $asg$
declare
  v_assignee text := '';
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'hearings' and column_name = 'assignee_user_id')
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hearings' and column_name = 'case_request_id') then
    v_assignee := v_assignee || '
       or exists (select 1 from public.hearings h where h.case_request_id = sr.id and h.assignee_user_id = auth.uid())';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_user_id')
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tasks' and column_name = 'case_request_id') then
    v_assignee := v_assignee || '
       or exists (select 1 from public.tasks tk where tk.case_request_id = sr.id and tk.assignee_user_id = auth.uid())';
  end if;

  execute '
create or replace function public.firm_case_assigned(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''''
as $body$
  select coalesce((
    select sr.requester_user_id = auth.uid()
        or sr.assigned_to = auth.uid()
        or exists (select 1
                     from public.case_team_members t
                     join public.firm_members tm
                       on tm.firm_id = t.firm_id and tm.user_id = t.user_id and tm.status = ''active''
                    where t.request_id = sr.id and t.firm_id = sr.firm_id and t.user_id = auth.uid())' || v_assignee || '
      from public.service_requests sr
     where sr.id = p_request
  ), false);
$body$';
end
$asg$;

comment on function public.firm_case_assigned(text) is
  'Q112 (20261202_80): the caller is the case''s filer or lead, an active case-team member, or the assignee of one of its hearings / tasks.';

drop policy if exists "firm case: finance manager sees no case files" on public.service_requests;
create policy "firm case: finance manager sees no case files" on public.service_requests
  as restrictive
  for select
  to authenticated
  using (firm_id is null or not public.firm_case_finance_member(firm_id) or public.firm_case_assigned(id));

revoke all on function public.firm_case_scope_roles() from public, anon, authenticated;
grant execute on function public.firm_case_scope_roles() to service_role;
do $g$
declare
  f text;
begin
  foreach f in array array['public.firm_case_finance_member(uuid)', 'public.firm_case_assigned(text)'] loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    execute pg_catalog.format('revoke all on function %s from anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$g$;

-- ═════════════════════════════════════════════════════════════════════════════
-- B. Q113 (أ) — company plan seats: the smallest tiers start at 5
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.business_plan_seat_cap(p_plan text)
returns int
language sql
immutable
set search_path = ''
as $body$
  select case p_plan
           when 'biz-sm-basic'  then 5
           when 'biz-sm-pro'    then 5
           when 'biz-sm-full'   then 10
           when 'biz-md-basic'  then 5
           when 'biz-md-pro'    then 15
           when 'biz-md-full'   then 25
           when 'biz-lg-basic'  then 10
           when 'biz-lg-pro'    then 30
           when 'dept-sm-basic' then 5
           when 'dept-sm-pro'   then 5
           when 'dept-sm-full'  then 10
           when 'dept-md-basic' then 5
           when 'dept-md-pro'   then 10
           when 'dept-md-full'  then 20
           when 'dept-lg-basic' then 10
           when 'dept-lg-pro'   then 25
           when 'dept-lg-full'  then 50
           else null
         end;
$body$;

comment on function public.business_plan_seat_cap(text) is
  'Company seats per plan = the «المستخدمون» row of /pricing (20261129_10; Q113 20261202_80: the smallest company and legal-department tiers start at 5, like a company with no plan). null = by contract.';

-- ═════════════════════════════════════════════════════════════════════════════
-- C. Q114 — the extra firm seat: 250 SAR a year before VAT (stored, not shown)
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.platform_settings (key, value, description) values
  ('firm_extra_seat_price_sar', '{"sar": 250}'::jsonb,
   'سعر المقعد الإضافي للمكاتب بالريال سنوياً قبل الضريبة (س١١٤: ٢٥٠). يُحفظ فقط: لا يُعرض علناً ولا يُباع عبر الموقع حتى يُفعَّل الدفع ويعتمده المالك (20261128_10، 20261202_80)')
on conflict (key) do nothing;

update public.platform_settings
   set value = '{"sar": 250}'::jsonb,
       description = 'سعر المقعد الإضافي للمكاتب بالريال سنوياً قبل الضريبة (س١١٤: ٢٥٠). يُحفظ فقط: لا يُعرض علناً ولا يُباع عبر الموقع حتى يُفعَّل الدفع ويعتمده المالك (20261128_10، 20261202_80)',
       updated_at = now()
 where key = 'firm_extra_seat_price_sar'
   and (value -> 'sar' is null or pg_catalog.jsonb_typeof(value -> 'sar') = 'null');

-- ═════════════════════════════════════════════════════════════════════════════
-- D. N16 — restricted case: the open log
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.restricted_case_open_log (
  id             bigint generated always as identity primary key,
  request_id     text        not null,
  firm_id        uuid,
  viewer_user_id uuid        not null,
  viewer_kind    text        not null
                 constraint restricted_case_open_log_kind_check
                 check (viewer_kind in ('firm_owner', 'managing_partner', 'platform_admin')),
  opened_at      timestamptz not null default now()
);

comment on table public.restricted_case_open_log is
  'N16 (20261202_80): every open of a RESTRICTED firm case by someone who sees it only by office (firm owner, managing partner, platform admin). Append-only; read by the case''s filer / lead through restricted_case_open_log_read(). No FK: the record outlives the case.';

create index if not exists restricted_case_open_log_request_idx
  on public.restricted_case_open_log (request_id, opened_at desc);
create index if not exists restricted_case_open_log_viewer_idx
  on public.restricted_case_open_log (viewer_user_id, request_id, opened_at desc);

alter table public.restricted_case_open_log enable row level security;
alter table public.restricted_case_open_log force row level security;
revoke all on table public.restricted_case_open_log from public, anon, authenticated;
grant select, insert on table public.restricted_case_open_log to service_role;

create or replace function public.restricted_case_open_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  raise exception 'restricted_case_open_log is append-only' using errcode = '42501';
end
$fn$;

drop trigger if exists trg_restricted_case_open_log_append_only on public.restricted_case_open_log;
create trigger trg_restricted_case_open_log_append_only
  before update or delete on public.restricted_case_open_log
  for each row execute function public.restricted_case_open_log_append_only();

create or replace function public.log_restricted_case_open(p_request text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_case record;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'log_restricted_case_open: sign in' using errcode = '42501';
  end if;
  select sr.id, sr.firm_id, sr.is_restricted, sr.requester_user_id, sr.assigned_to
    into v_case
    from public.service_requests sr
   where sr.id = p_request;
  if not found or v_case.firm_id is null or not coalesce(v_case.is_restricted, false) then
    return 'not_restricted';
  end if;
  if v_case.requester_user_id = v_uid or v_case.assigned_to = v_uid
     or exists (select 1
                  from public.case_team_members t
                  join public.firm_members tm
                    on tm.firm_id = t.firm_id and tm.user_id = t.user_id and tm.status = 'active'
                 where t.request_id = v_case.id and t.firm_id = v_case.firm_id and t.user_id = v_uid) then
    return 'own';
  end if;
  if exists (select 1 from public.firm_profiles fp where fp.id = v_case.firm_id and fp.owner_user_id = v_uid) then
    v_kind := 'firm_owner';
  elsif exists (select 1 from public.firm_members m
                 where m.firm_id = v_case.firm_id and m.user_id = v_uid
                   and m.status = 'active' and m.role = 'managing_partner') then
    v_kind := 'managing_partner';
  elsif public.is_admin() then
    v_kind := 'platform_admin';
  else
    return 'not_privileged';
  end if;
  if exists (select 1 from public.restricted_case_open_log l
              where l.request_id = v_case.id and l.viewer_user_id = v_uid
                and l.opened_at > pg_catalog.now() - interval '10 minutes') then
    return 'recent';
  end if;
  insert into public.restricted_case_open_log (request_id, firm_id, viewer_user_id, viewer_kind)
  values (v_case.id, v_case.firm_id, v_uid, v_kind);
  return 'logged';
end
$fn$;

comment on function public.log_restricted_case_open(text) is
  'N16 (20261202_80): records that the caller opened a RESTRICTED firm case he sees only by office (firm owner / managing partner / platform admin). Once per viewer per 10 minutes. Returns logged | recent | own | not_restricted | not_privileged.';

create or replace function public.restricted_case_open_log_read(p_request text)
returns table (opened_at timestamptz, viewer_name text, viewer_kind text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'restricted_case_open_log_read: sign in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.service_requests sr
                  where sr.id = p_request and (sr.requester_user_id = v_uid or sr.assigned_to = v_uid))
     and not public.is_admin() then
    raise exception 'restricted_case_open_log_read: only the case''s filer or lead reads its open log' using errcode = '42501';
  end if;
  return query
    select l.opened_at,
           case when l.viewer_kind = 'platform_admin' then null::text
                else nullif(pg_catalog.btrim(p.display_name), '') end,
           l.viewer_kind
      from public.restricted_case_open_log l
      left join public.profiles p on p.id = l.viewer_user_id
     where l.request_id = p_request
     order by l.opened_at desc
     limit 200;
end
$fn$;

comment on function public.restricted_case_open_log_read(text) is
  'N16 (20261202_80): the open log of a restricted case, newest first (200), for its filer or lead (or a platform admin). A platform admin''s name is not returned.';

do $g$
declare
  f text;
begin
  foreach f in array array['public.log_restricted_case_open(text)', 'public.restricted_case_open_log_read(text)'] loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    execute pg_catalog.format('revoke all on function %s from anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$g$;
revoke all on function public.restricted_case_open_log_append_only() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- E. N18 — «مكتب معتمد»: a registered law firm with an active office plan
-- ═════════════════════════════════════════════════════════════════════════════
do $badge$
begin
  if to_regprocedure('public.community_verified_office_users(uuid[])') is null then
    raise notice '20261202_80: community_verified_office_users is not here (20261127_60) — part E skipped';
    return;
  end if;
  if to_regclass('public.subscriptions') is null then
    raise notice '20261202_80: public.subscriptions is not here — part E skipped';
    return;
  end if;

  execute $fn$
create or replace function public.community_verified_office_users(p_ids uuid[])
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $body$
begin
  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    return;
  end if;
  if pg_catalog.cardinality(p_ids) > 200 then
    raise exception 'community_verified_office_users: at most 200 ids' using errcode = '22023';
  end if;
  return query
    select distinct f.owner_user_id
      from public.firm_profiles f
     where f.owner_user_id = any (p_ids)
       and f.verification_status = 'verified'
       and exists (select 1 from public.subscriptions s
                    where (s.user_id = f.owner_user_id or (s.entity_type = 'firm' and s.entity_id = f.id))
                      and s.plan_id in ('firm-basic', 'firm-enterprise')
                      and s.status = 'active'
                      and (s.current_period_end is null or s.current_period_end > pg_catalog.now()));
end
$body$
$fn$;

  execute $c$ comment on function public.community_verified_office_users(uuid[]) is
  'N18 (20261202_80; owner RAW [39]): «مكتب معتمد» — which of p_ids own a law firm registered on the platform (firm_profiles.verification_status = ''verified'') that holds an ACTIVE, unexpired office plan (firm-basic / firm-enterprise; trialing does not count), the owner''s own subscription or the firm entity''s. Service role only.' $c$;

  execute 'revoke all on function public.community_verified_office_users(uuid[]) from public, anon, authenticated';
  execute 'grant execute on function public.community_verified_office_users(uuid[]) to service_role';

  if to_regprocedure('public.community_is_verified_office()') is not null then
    execute $c$ comment on function public.community_is_verified_office() is
    'N05-C2 (20261201_50) + N18 (20261202_80): the caller owns a «مكتب معتمد» — community_verified_office_users() (a registered law firm with an active office plan). Called by community_lawyers_space_ok(); service_role only.' $c$;
  end if;
end
$badge$;

-- ═════════════════════════════════════════════════════════════════════════════
-- F. N21 — founder storage fair use (25 GB, alert at 80 %)
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.platform_settings (key, value, description) values
  ('founder_storage_fair_use', '{"gb": 25, "alert_pct": 80}'::jsonb,
   'سقف الاستعمال العادل الداخلي لتخزين العضو المؤسس (بند ٣٣): gb بالجيجابايت، وalert_pct نسبة التنبيه. لا يُعرض في أي صفحة تسويقية ولا يُحجب أحد دون تنبيه (20261202_80)')
on conflict (key) do nothing;

create table if not exists public.founder_storage_alerts (
  user_id    uuid        not null,
  period     text        not null constraint founder_storage_alerts_period_check check (period ~ '^\d{4}-\d{2}$'),
  used_bytes bigint      not null,
  cap_bytes  bigint      not null,
  created_at timestamptz not null default now(),
  primary key (user_id, period)
);

comment on table public.founder_storage_alerts is
  'N21 (20261202_80): one row per founder and Riyadh month once his stored files pass founder_storage_fair_use.alert_pct — the daily job alerts once. Server only.';

alter table public.founder_storage_alerts enable row level security;
alter table public.founder_storage_alerts force row level security;
revoke all on table public.founder_storage_alerts from public, anon, authenticated;
grant select, insert on table public.founder_storage_alerts to service_role;

do $st$
declare
  v_owner_expr text;
begin
  if to_regclass('public.founder_seats') is null then
    raise notice '20261202_80: public.founder_seats is not here — founder_storage_usage skipped';
    return;
  end if;
  if to_regclass('storage.objects') is null then
    raise notice '20261202_80: storage.objects is not here — founder_storage_usage skipped';
    return;
  end if;
  -- newer storage schemas carry owner_id (text); older ones owner (uuid)
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id') then
    v_owner_expr := 'o.owner_id = fs.user_id::text';
  elsif exists (select 1 from information_schema.columns
                 where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner') then
    v_owner_expr := 'o.owner = fs.user_id';
  else
    raise notice '20261202_80: storage.objects has no owner column — founder_storage_usage skipped';
    return;
  end if;

  execute pg_catalog.format($fn$
create or replace function public.founder_storage_usage()
returns table (user_id uuid, used_bytes bigint)
language sql
stable
security definer
set search_path = ''
as $body$
  select fs.user_id,
         coalesce((select pg_catalog.sum(case when (o.metadata ->> 'size') ~ '^\d+$'
                                              then (o.metadata ->> 'size')::bigint else 0 end)
                     from storage.objects o
                    where %s), 0)::bigint
    from (select distinct s.user_id from public.founder_seats s where s.status = 'active') fs;
$body$
$fn$, v_owner_expr);

  execute $c$ comment on function public.founder_storage_usage() is
  'N21 (20261202_80): bytes stored (storage.objects metadata size, by owner) per active founder seat. Service role only; read by /api/v1/cron/founder-storage.' $c$;
  execute 'revoke all on function public.founder_storage_usage() from public, anon, authenticated';
  execute 'grant execute on function public.founder_storage_usage() to service_role';
end
$st$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Verify
-- ═════════════════════════════════════════════════════════════════════════════
do $verify$
declare
  v_roles text[];
  v jsonb;
begin
  v_roles := public.firm_case_scope_roles();
  if not (v_roles @> array['trainee', 'legal_secretary']) then
    raise exception 'l12_firm verify: firm_case_scope_roles() lost trainee / legal_secretary';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure('public.firm_case_scoped_member(uuid)')), 'firm_case_scope_roles') = 0 then
    raise exception 'l12_firm verify: firm_case_scoped_member does not read firm_case_scope_roles()';
  end if;
  if has_function_privilege('anon', 'public.firm_case_scoped_member(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.firm_case_scope_roles()', 'EXECUTE')
     or has_function_privilege('anon', 'public.firm_case_finance_member(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.firm_case_finance_member(uuid)', 'EXECUTE') then
    raise exception 'l12_firm verify: function privileges are wrong (part A)';
  end if;
  if not exists (select 1 from pg_catalog.pg_policy
                  where polname = 'firm case: finance manager sees no case files' and not polpermissive
                    and polrelid = 'public.service_requests'::regclass) then
    raise exception 'l12_firm verify: the finance manager policy is missing on service_requests';
  end if;
  if public.business_plan_seat_cap('biz-sm-basic') <> 5 or public.business_plan_seat_cap('dept-sm-basic') <> 5 then
    raise exception 'l12_firm verify: the smallest company tiers do not start at 5';
  end if;
  select value into v from public.platform_settings where key = 'firm_extra_seat_price_sar';
  if v is null or pg_catalog.jsonb_typeof(v -> 'sar') <> 'number' then
    raise exception 'l12_firm verify: firm_extra_seat_price_sar has no price';
  end if;
  if has_table_privilege('authenticated', 'public.restricted_case_open_log', 'SELECT')
     or has_table_privilege('anon', 'public.restricted_case_open_log', 'SELECT')
     or not has_function_privilege('authenticated', 'public.log_restricted_case_open(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.restricted_case_open_log_read(text)', 'EXECUTE') then
    raise exception 'l12_firm verify: the restricted-case open log is open to sessions, or its functions are not callable';
  end if;
  if to_regprocedure('public.community_verified_office_users(uuid[])') is not null
     and to_regclass('public.subscriptions') is not null
     and (pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure('public.community_verified_office_users(uuid[])')), 'firm-enterprise') = 0
          or has_function_privilege('authenticated', 'public.community_verified_office_users(uuid[])', 'EXECUTE')) then
    raise exception 'l12_firm verify: the «مكتب معتمد» rule is not the office-plan rule, or sessions can call it';
  end if;
  select value into v from public.platform_settings where key = 'founder_storage_fair_use';
  if v is null or pg_catalog.jsonb_typeof(v -> 'gb') <> 'number' then
    raise exception 'l12_firm verify: founder_storage_fair_use is missing';
  end if;
  if has_table_privilege('authenticated', 'public.founder_storage_alerts', 'SELECT') then
    raise exception 'l12_firm verify: founder_storage_alerts is open to sessions';
  end if;
  raise notice 'l12_firm verify: OK — firm role scope from the setting (%), finance manager without case files, company tiers from 5, extra seat priced, restricted-case open log, «مكتب معتمد» = office plan, founder storage fair use',
    pg_catalog.array_to_string(v_roles, ', ');
end
$verify$;

commit;

select '20261202_80 l12 firm: role scope setting, finance manager, company seats, extra-seat price, restricted-case log, office badge, founder storage' as migration,
       (to_regprocedure('public.firm_case_scope_roles()') is not null
        and to_regprocedure('public.log_restricted_case_open(text)') is not null
        and exists (select 1 from public.platform_settings where key = 'firm_case_scope')
        and exists (select 1 from public.platform_settings where key = 'founder_storage_fair_use')) as ok;
