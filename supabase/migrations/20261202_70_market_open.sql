-- =============================================================================
-- Migration: 20261202_70_market_open.sql
-- =============================================================================
-- PURPOSE (owner answers of 20 Nov 2026 — batch l12, builder «market»)
--
--   Q130a «يُفتح السوق الآن: الطلبات تظهر لكل المحامين المؤهلين بلا اسم العميل،
--   والإدارة تُسند متى شاءت، وقبول المحامي ينتظر اعتمادها بمهلة 30 دقيقة ثم
--   تنبيه بلا قبول تلقائي» (F01#130, RAW[22][38][66]; Q151 open: instant is a
--   setting). Payment through the platform stays OFF: nothing here collects,
--   holds or moves money.
--
--   Q131a community questions are reviewed before publishing by an AI agent
--   (F01#131, RAW[13]): this file only adds the switch and the decision log;
--   the review itself runs in the app (n8n workflow community-review).
--
--   1. platform_settings rows (inserted only when missing — an admin's later
--      choice is never overwritten by a re-run):
--        marketplace_market         {"open": true, "opened_at": <now>,
--                                    "accept_mode": "admin_approval",
--                                    "approval_minutes": 30}
--          open        — every new CLIENT request is listed to verified
--                        lawyers without a staff publish step. Rows created
--                        before opened_at are not flooded in: staff can still
--                        publish an older one (20261127_70 action).
--          accept_mode — admin_approval (RAW[66], default) | instant (Q151).
--          approval_minutes — the admin's window; when it passes the admin is
--                        alerted, the lawyer is NEVER accepted automatically.
--        marketplace_commission_pct {"founderOrEnterprise": 5, "subscriber": 7, "free": 15}
--          (owner ٤٢١ rates, now editable; nothing charges a commission today)
--        community_ai_review        {"enabled": false}
--          switched on by an admin once the n8n workflow is imported.
--
--   2. service_requests.marketplace_hidden_at (timestamptz null): staff hide a
--      request from the market. The publish guard (trg_02, 20261127_70) is
--      re-created from its latest definition and now keeps this column too —
--      only postgres / service_role / supabase_admin write it.
--
--   3. public.marketplace_acceptances — one row per (request, lawyer) ask:
--        pending → approved | rejected | withdrawn | superseded
--      mode admin_approval | instant | admin_assign. RLS: a lawyer reads his
--      own rows; nobody writes the table directly (all writes go through the
--      definer functions below or the service role). anon has nothing.
--
--   4. Functions (SECURITY DEFINER, search_path ''):
--        marketplace_request_listable(text)        internal predicate (service_role)
--        marketplace_open_requests(int, int)       RE-CREATED from 20261127_70:
--             same arguments and columns; lists staff-published rows (as
--             before) PLUS, while the market is open, every client request
--             created since opened_at; never a hidden, assigned, paid, test or
--             demo account's row. Verified lawyers only.
--        marketplace_request_accept(text)          the lawyer's «اطلب القبول» (authenticated)
--        marketplace_acceptance_withdraw(uuid)     the lawyer withdraws his pending ask (authenticated)
--        marketplace_acceptance_decide(uuid, uuid, boolean, text)  admin approve/reject (service_role)
--        marketplace_assign_lawyer(text, uuid, uuid)               admin assigns a verified lawyer (service_role)
--        marketplace_overdue_acceptances(boolean)  pending asks past their window; with true
--             marks alerted_at once and returns only the newly alerted (service_role)
--        marketplace_open_requests_admin(int, int) the admin's view of the market (service_role)
--      Assigning NEVER changes status: resolvePath() keys the client's
--      WhatsApp webhook off status (see admin/service-orders/[id] route).
--
--   5. public.community_ai_reviews — one row per automatic decision (post or
--      answer): approve | reject | hold, the category, the model. Service role
--      only (no anon / authenticated privilege at all).
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261202_70_market_open.sql
--   Expect: NOTICE  l12_market verify: OK   and a final row with `t`.
--   Idempotent: safe to run twice.
--
-- RUN ORDER: AFTER the deploy of batch l12 (recommended), any time is safe:
--   * SQL first, old code: the open list starts showing new client requests
--     (read-only cards, no accept button) — harmless.
--   * Code first, no SQL: «اطلب القبول» and the admin market page answer
--     honestly that this file has not run (503); the open list keeps the
--     staff-published rows only.
--   Needs 20261127_70 (the function it replaces), 20260627_platform_settings,
--   20261125_50 (profiles.is_demo), 20261017_44 (test_accounts).
--   RE-RUN HAZARD: re-running 20261127_70 after this file puts back the
--   publish-only function — re-run this file after it.
--
-- ROLLBACK
--   drop function if exists public.marketplace_open_requests_admin(integer, integer);
--   drop function if exists public.marketplace_overdue_acceptances(boolean);
--   drop function if exists public.marketplace_assign_lawyer(text, uuid, uuid);
--   drop function if exists public.marketplace_acceptance_decide(uuid, uuid, boolean, text);
--   drop function if exists public.marketplace_acceptance_withdraw(uuid);
--   drop function if exists public.marketplace_request_accept(text);
--   then re-run 20261127_70_open_requests_publish.sql (function + guard);
--   drop function if exists public.marketplace_request_listable(text);
--   drop table if exists public.marketplace_acceptances;
--   drop table if exists public.community_ai_reviews;
--   alter table public.service_requests drop column if exists marketplace_hidden_at;
--   delete from public.platform_settings where key in ('marketplace_market','marketplace_commission_pct','community_ai_review');
--
-- Docker: supabase/tests/rls/l12_market.test.sql
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $pre$
begin
  if to_regclass('public.service_requests') is null then
    raise exception '20261202_70: public.service_requests is missing';
  end if;
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261202_70: public.lawyer_profiles is missing';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261202_70: run 20260627_platform_settings.sql first';
  end if;
  if to_regprocedure('public.guard_service_request_marketplace_publish()') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.service_requests'::regclass and attname = 'marketplace_published_at' and not attisdropped) then
    raise exception '20261202_70: run 20261127_70_open_requests_publish.sql first';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.profiles'::regclass and attname = 'is_demo' and not attisdropped) then
    raise exception '20261202_70: run 20261125_50_demo_accounts.sql first (no profiles.is_demo)';
  end if;
  if to_regclass('public.test_accounts') is null then
    raise exception '20261202_70: run 20261017_44_test_accounts_never_listed.sql first (no public.test_accounts)';
  end if;
end
$pre$;

-- 1. settings (only when missing)
insert into public.platform_settings (key, value)
values ('marketplace_market',
        pg_catalog.jsonb_build_object('open', true, 'opened_at', pg_catalog.to_jsonb(pg_catalog.now()),
                                      'accept_mode', 'admin_approval', 'approval_minutes', 30))
on conflict (key) do nothing;
insert into public.platform_settings (key, value)
values ('marketplace_commission_pct', '{"founderOrEnterprise": 5, "subscriber": 7, "free": 15}'::jsonb)
on conflict (key) do nothing;
insert into public.platform_settings (key, value)
values ('community_ai_review', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

do $desc$
begin
  if exists (select 1 from pg_catalog.pg_attribute
              where attrelid = 'public.platform_settings'::regclass and attname = 'description' and not attisdropped) then
    update public.platform_settings set description = case key
      when 'marketplace_market' then 'l12 Q130a: السوق مفتوح للمحامين الموثّقين؛ طريقة قبول الطلب (اعتماد الإدارة / فوري) ومهلة الاعتماد بالدقائق'
      when 'marketplace_commission_pct' then 'l12 Q130a: نسب عمولة السوق (للعرض؛ لا تحصيل عبر المنصة الآن)'
      when 'community_ai_review' then 'l12 Q131a: مراجعة أسئلة المجتمع وإجاباته قبل النشر بوكيل ذكاء اصطناعي'
      else description end
     where key in ('marketplace_market', 'marketplace_commission_pct', 'community_ai_review')
       and description is null;
  end if;
end
$desc$;

-- 2. the hide column + the guard (re-created from 20261127_70, one column more)
alter table public.service_requests add column if not exists marketplace_hidden_at timestamptz;
comment on column public.service_requests.marketplace_hidden_at is
  '20261202_70 (l12 Q130a): staff hid the request from the lawyers'' market. Server-written only (trg_02).';

create or replace function public.guard_service_request_marketplace_publish()
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
    new.marketplace_published_at := null;
    new.marketplace_published_by := null;
    new.marketplace_category := null;
    new.marketplace_hidden_at := null;
  else
    new.marketplace_published_at := old.marketplace_published_at;
    new.marketplace_published_by := old.marketplace_published_by;
    new.marketplace_category := old.marketplace_category;
    new.marketplace_hidden_at := old.marketplace_hidden_at;
  end if;
  return new;
end $$;

comment on function public.guard_service_request_marketplace_publish() is
  '20261127_70 + 20261202_70: a session (any role but postgres / service_role / supabase_admin) cannot publish, re-type or hide a service request in the market.';

revoke all on function public.guard_service_request_marketplace_publish() from public;
do $rv$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.guard_service_request_marketplace_publish() from %I', r);
    end if;
  end loop;
end
$rv$;

drop trigger if exists trg_02_service_requests_marketplace_guard on public.service_requests;
create trigger trg_02_service_requests_marketplace_guard
  before insert or update on public.service_requests
  for each row execute function public.guard_service_request_marketplace_publish();

-- 3. the acceptance table
create table if not exists public.marketplace_acceptances (
  id             uuid        primary key default gen_random_uuid(),
  request_id     text        not null references public.service_requests(id) on delete cascade,
  lawyer_user_id uuid        not null references auth.users(id) on delete cascade,
  mode           text        not null,
  status         text        not null default 'pending',
  due_at         timestamptz,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid        references auth.users(id) on delete set null,
  decision_note  text,
  alerted_at     timestamptz
);

do $chk$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.marketplace_acceptances'::regclass and conname = 'marketplace_acceptances_mode_check') then
    alter table public.marketplace_acceptances add constraint marketplace_acceptances_mode_check
      check (mode in ('admin_approval', 'instant', 'admin_assign'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.marketplace_acceptances'::regclass and conname = 'marketplace_acceptances_status_check') then
    alter table public.marketplace_acceptances add constraint marketplace_acceptances_status_check
      check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'superseded'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.marketplace_acceptances'::regclass and conname = 'marketplace_acceptances_note_check') then
    alter table public.marketplace_acceptances add constraint marketplace_acceptances_note_check
      check (decision_note is null or pg_catalog.char_length(decision_note) <= 500);
  end if;
end
$chk$;

-- one live ask per (request, lawyer); one approved row per request
create unique index if not exists marketplace_acceptances_live_uidx
  on public.marketplace_acceptances (request_id, lawyer_user_id) where status in ('pending', 'approved');
create unique index if not exists marketplace_acceptances_approved_uidx
  on public.marketplace_acceptances (request_id) where status = 'approved';
create index if not exists marketplace_acceptances_pending_idx
  on public.marketplace_acceptances (due_at) where status = 'pending';
create index if not exists marketplace_acceptances_lawyer_idx
  on public.marketplace_acceptances (lawyer_user_id, created_at desc);

comment on table public.marketplace_acceptances is
  '20261202_70 (l12 Q130a): a verified lawyer''s ask to take a market request, and the admin''s decision. Written only through the marketplace_* definer functions or the service role.';

alter table public.marketplace_acceptances enable row level security;
drop policy if exists "marketplace_acceptances: lawyer reads own" on public.marketplace_acceptances;
create policy "marketplace_acceptances: lawyer reads own"
  on public.marketplace_acceptances for select
  using (lawyer_user_id = auth.uid());

do $tg$
declare r text;
begin
  execute 'revoke all on table public.marketplace_acceptances from public';
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on table public.marketplace_acceptances from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'grant select on table public.marketplace_acceptances to authenticated';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.marketplace_acceptances to service_role';
  end if;
end
$tg$;

-- 4a. the predicate: is this request in the market right now? (no caller check)
create or replace function public.marketplace_request_listable(p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
      from public.service_requests sr
     where sr.id = p_id
       and sr.assigned_to is null
       and sr.status in ('pending', 'pending_assignment')
       and sr.marketplace_hidden_at is null
       and not exists (select 1 from public.profiles p
                        where p.id = sr.requester_user_id and p.is_demo)
       and not exists (select 1 from public.test_accounts t
                        where t.user_id = sr.requester_user_id)
       and (
             (sr.marketplace_published_at is not null
              and sr.marketplace_category in ('consultation', 'case', 'drafting'))
          or exists (
               select 1 from public.platform_settings ps
                where ps.key = 'marketplace_market'
                  and ps.value ->> 'open' = 'true'
                  and sr.receiver = 'ai_workspace'
                  and coalesce(sr.payment ->> 'status', 'not_required') = 'not_required'
                  and sr.created_at >= coalesce(nullif(ps.value ->> 'opened_at', '')::timestamptz, 'infinity'::timestamptz)
                  and exists (select 1 from public.profiles cp
                               where cp.id = sr.requester_user_id
                                 and cp.user_type in ('individual', 'corporate', 'micro', 'ngo', 'government'))
             )
           )
  );
$fn$;

comment on function public.marketplace_request_listable(text) is
  '20261202_70 (l12 Q130a): true while the request is in the lawyers'' market — staff-published, or (market open) a client''s free request created since opened_at; never assigned, hidden, paid, demo or test. No caller check: service_role and the marketplace_* functions only.';

-- 4b. the lawyer's list: same arguments and columns as 20261127_70
drop function if exists public.marketplace_open_requests(integer, integer);
create function public.marketplace_open_requests(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id             text,
  type           text,
  receiver       text,
  city           text,
  public_summary text,
  status         text,
  created_at     timestamptz,
  category       text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select sr.id, sr.type, sr.receiver, sr.city, sr.public_summary, sr.status, sr.created_at,
         coalesce(sr.marketplace_category,
                  case
                    when sr.type = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' in ('contracts', 'legal-filing') then 'drafting'
                    when sr.metadata ->> 'categoryId' in ('case-study', 'arbitration') then 'case'
                    else null
                  end) as category
    from public.service_requests sr
   where exists (
           select 1 from public.lawyer_profiles lp
            where lp.user_id = auth.uid()
              and lp.verification_status = 'verified'
         )
     and sr.assigned_to is null
     and sr.status in ('pending', 'pending_assignment')
     and sr.marketplace_hidden_at is null
     and not exists (select 1 from public.profiles p
                      where p.id = sr.requester_user_id and p.is_demo)
     and not exists (select 1 from public.test_accounts t
                      where t.user_id = sr.requester_user_id)
     and (
           (sr.marketplace_published_at is not null
            and sr.marketplace_category in ('consultation', 'case', 'drafting'))
        or exists (
             select 1 from public.platform_settings ps
              where ps.key = 'marketplace_market'
                and ps.value ->> 'open' = 'true'
                and sr.receiver = 'ai_workspace'
                and coalesce(sr.payment ->> 'status', 'not_required') = 'not_required'
                and sr.created_at >= coalesce(nullif(ps.value ->> 'opened_at', '')::timestamptz, 'infinity'::timestamptz)
                and exists (select 1 from public.profiles cp
                             where cp.id = sr.requester_user_id
                               and cp.user_type in ('individual', 'corporate', 'micro', 'ngo', 'government'))
           )
         )
   order by coalesce(sr.marketplace_published_at, sr.created_at) desc, sr.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

comment on function public.marketplace_open_requests(integer, integer) is
  '20261127_70 + 20261202_70 (owner ٢٣, l12 Q130a): staff-published requests, and while the market is open every client''s free request since opened_at — id, type, receiver, city, public_summary, status, created_at, category. Never title, description, requester or metadata; never test_accounts / is_demo rows. Verified lawyers only.';

-- 4c. the lawyer asks to take a request
create or replace function public.marketplace_request_accept(p_request_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_settings jsonb;
  v_mode     text;
  v_minutes  integer;
  v_row      public.marketplace_acceptances;
  v_taken    text;
  v_open     integer;
begin
  if v_uid is null then
    return pg_catalog.jsonb_build_object('result', 'not_signed_in');
  end if;
  if not exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id = v_uid and lp.verification_status = 'verified') then
    return pg_catalog.jsonb_build_object('result', 'not_verified');
  end if;
  -- a test or demo lawyer never takes a real client's request (owner decision 3)
  if exists (select 1 from public.test_accounts t where t.user_id = v_uid)
     or exists (select 1 from public.profiles p where p.id = v_uid and p.is_demo) then
    return pg_catalog.jsonb_build_object('result', 'test_account');
  end if;

  -- an ask that is already live answers itself (a double click)
  select * into v_row from public.marketplace_acceptances a
   where a.request_id = p_request_id and a.lawyer_user_id = v_uid and a.status in ('pending', 'approved');
  if found then
    return pg_catalog.jsonb_build_object('result', case when v_row.status = 'approved' then 'assigned' else 'already_pending' end,
                                         'id', v_row.id, 'due_at', v_row.due_at);
  end if;

  if not public.marketplace_request_listable(p_request_id) then
    return pg_catalog.jsonb_build_object('result', 'not_open');
  end if;

  select count(*) into v_open from public.marketplace_acceptances a
   where a.lawyer_user_id = v_uid and a.status = 'pending';
  if v_open >= 10 then
    return pg_catalog.jsonb_build_object('result', 'too_many_pending');
  end if;

  select ps.value into v_settings from public.platform_settings ps where ps.key = 'marketplace_market';
  v_mode := case when v_settings ->> 'accept_mode' = 'instant' then 'instant' else 'admin_approval' end;
  v_minutes := case when (v_settings ->> 'approval_minutes') ~ '^[0-9]{1,4}$'
                    then least(greatest((v_settings ->> 'approval_minutes')::integer, 5), 1440)
                    else 30 end;

  if v_mode = 'instant' then
    update public.service_requests sr
       set assigned_to = v_uid, updated_at = pg_catalog.now()
     where sr.id = p_request_id and sr.assigned_to is null and sr.status in ('pending', 'pending_assignment')
    returning sr.id into v_taken;
    if v_taken is null then
      return pg_catalog.jsonb_build_object('result', 'not_open');
    end if;
    insert into public.marketplace_acceptances (request_id, lawyer_user_id, mode, status, decided_at)
    values (p_request_id, v_uid, 'instant', 'approved', pg_catalog.now())
    returning * into v_row;
    update public.marketplace_acceptances a
       set status = 'superseded', decided_at = pg_catalog.now()
     where a.request_id = p_request_id and a.status = 'pending';
    return pg_catalog.jsonb_build_object('result', 'assigned', 'id', v_row.id, 'mode', 'instant');
  end if;

  insert into public.marketplace_acceptances (request_id, lawyer_user_id, mode, status, due_at)
  values (p_request_id, v_uid, 'admin_approval', 'pending', pg_catalog.now() + pg_catalog.make_interval(mins => v_minutes))
  returning * into v_row;
  return pg_catalog.jsonb_build_object('result', 'pending', 'id', v_row.id, 'due_at', v_row.due_at, 'mode', 'admin_approval');
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object('result', 'already_pending');
end
$fn$;

comment on function public.marketplace_request_accept(text) is
  '20261202_70 (l12 Q130a/Q151): a verified lawyer asks to take a market request. admin_approval → a pending row with due_at (never accepted automatically); instant → assigned at once with one atomic UPDATE. Status is never changed.';

-- 4d. the lawyer withdraws his pending ask
create or replace function public.marketplace_acceptance_withdraw(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare v_id uuid;
begin
  update public.marketplace_acceptances a
     set status = 'withdrawn', decided_at = pg_catalog.now()
   where a.id = p_id and a.lawyer_user_id = auth.uid() and a.status = 'pending'
  returning a.id into v_id;
  return pg_catalog.jsonb_build_object('result', case when v_id is null then 'not_pending' else 'withdrawn' end);
end
$fn$;

-- 4e. the admin decides an ask
create or replace function public.marketplace_acceptance_decide(p_id uuid, p_actor uuid, p_approve boolean, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_row   public.marketplace_acceptances;
  v_taken text;
  v_note  text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_note, '')), 500), '');
begin
  select * into v_row from public.marketplace_acceptances a where a.id = p_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('result', 'not_found');
  end if;
  if v_row.status <> 'pending' then
    return pg_catalog.jsonb_build_object('result', 'not_pending', 'status', v_row.status);
  end if;

  if not coalesce(p_approve, false) then
    update public.marketplace_acceptances a
       set status = 'rejected', decided_at = pg_catalog.now(), decided_by = p_actor, decision_note = v_note
     where a.id = p_id;
    return pg_catalog.jsonb_build_object('result', 'rejected', 'request_id', v_row.request_id, 'lawyer_user_id', v_row.lawyer_user_id);
  end if;

  -- the lawyer must still be verified when the admin approves
  if not exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id = v_row.lawyer_user_id and lp.verification_status = 'verified') then
    return pg_catalog.jsonb_build_object('result', 'lawyer_not_verified');
  end if;

  update public.service_requests sr
     set assigned_to = v_row.lawyer_user_id, updated_at = pg_catalog.now()
   where sr.id = v_row.request_id and sr.assigned_to is null and sr.status in ('pending', 'pending_assignment')
  returning sr.id into v_taken;
  if v_taken is null then
    update public.marketplace_acceptances a
       set status = 'superseded', decided_at = pg_catalog.now(), decided_by = p_actor,
           decision_note = coalesce(v_note, 'taken')
     where a.id = p_id;
    return pg_catalog.jsonb_build_object('result', 'taken', 'request_id', v_row.request_id, 'lawyer_user_id', v_row.lawyer_user_id);
  end if;

  update public.marketplace_acceptances a
     set status = 'approved', decided_at = pg_catalog.now(), decided_by = p_actor, decision_note = v_note
   where a.id = p_id;
  update public.marketplace_acceptances a
     set status = 'superseded', decided_at = pg_catalog.now(), decided_by = p_actor
   where a.request_id = v_row.request_id and a.status = 'pending' and a.id <> p_id;
  return pg_catalog.jsonb_build_object('result', 'approved', 'request_id', v_row.request_id, 'lawyer_user_id', v_row.lawyer_user_id);
end
$fn$;

-- 4f. the admin assigns a verified lawyer directly (priority to the admin, RAW[22])
create or replace function public.marketplace_assign_lawyer(p_request_id text, p_lawyer uuid, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_taken text;
  v_row   public.marketplace_acceptances;
begin
  if not exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id = p_lawyer and lp.verification_status = 'verified') then
    return pg_catalog.jsonb_build_object('result', 'lawyer_not_verified');
  end if;
  if exists (select 1 from public.test_accounts t where t.user_id = p_lawyer)
     or exists (select 1 from public.profiles p where p.id = p_lawyer and p.is_demo) then
    return pg_catalog.jsonb_build_object('result', 'lawyer_is_test_account');
  end if;

  -- free, or only routed inside the team (an admin assignee) — never another lawyer's
  update public.service_requests sr
     set assigned_to = p_lawyer, updated_at = pg_catalog.now()
   where sr.id = p_request_id
     and sr.status in ('pending', 'pending_assignment')
     and (sr.assigned_to is null
          or exists (select 1 from public.profiles ap where ap.id = sr.assigned_to and ap.user_type = 'admin'))
  returning sr.id into v_taken;
  if v_taken is null then
    return pg_catalog.jsonb_build_object('result', 'not_assignable');
  end if;

  -- the lawyer's own pending ask (if any) becomes the approved row; else a record row
  update public.marketplace_acceptances a
     set status = 'approved', decided_at = pg_catalog.now(), decided_by = p_actor
   where a.request_id = p_request_id and a.lawyer_user_id = p_lawyer and a.status = 'pending'
  returning * into v_row;
  if not found then
    -- an older approved row for another lawyer on this request is superseded first
    update public.marketplace_acceptances a
       set status = 'superseded', decided_at = pg_catalog.now(), decided_by = p_actor
     where a.request_id = p_request_id and a.status = 'approved';
    insert into public.marketplace_acceptances (request_id, lawyer_user_id, mode, status, decided_at, decided_by)
    values (p_request_id, p_lawyer, 'admin_assign', 'approved', pg_catalog.now(), p_actor)
    returning * into v_row;
  end if;
  update public.marketplace_acceptances a
     set status = 'superseded', decided_at = pg_catalog.now(), decided_by = p_actor
   where a.request_id = p_request_id and a.status = 'pending';
  return pg_catalog.jsonb_build_object('result', 'assigned', 'id', v_row.id);
end
$fn$;

-- 4g. pending asks past their window
create or replace function public.marketplace_overdue_acceptances(p_mark boolean default false)
returns table (id uuid, request_id text, lawyer_user_id uuid, due_at timestamptz, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
begin
  if coalesce(p_mark, false) then
    return query
      update public.marketplace_acceptances a
         set alerted_at = pg_catalog.now()
       where a.status = 'pending' and a.due_at < pg_catalog.now() and a.alerted_at is null
      returning a.id, a.request_id, a.lawyer_user_id, a.due_at, a.created_at;
  else
    return query
      select a.id, a.request_id, a.lawyer_user_id, a.due_at, a.created_at
        from public.marketplace_acceptances a
       where a.status = 'pending' and a.due_at < pg_catalog.now()
       order by a.due_at;
  end if;
end
$fn$;

-- 4h. the admin's view of the market
create or replace function public.marketplace_open_requests_admin(p_limit integer default 100, p_offset integer default 0)
returns table (
  id                 text,
  type               text,
  title              text,
  city               text,
  public_summary     text,
  category           text,
  created_at         timestamptz,
  published          boolean,
  pending_asks       integer
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select sr.id, sr.type, sr.title, sr.city, sr.public_summary,
         coalesce(sr.marketplace_category,
                  case
                    when sr.type = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' in ('contracts', 'legal-filing') then 'drafting'
                    when sr.metadata ->> 'categoryId' in ('case-study', 'arbitration') then 'case'
                    else null
                  end),
         sr.created_at,
         sr.marketplace_published_at is not null,
         (select count(*)::integer from public.marketplace_acceptances a
           where a.request_id = sr.id and a.status = 'pending')
    from public.service_requests sr
   where sr.status in ('pending', 'pending_assignment')
     and sr.assigned_to is null
     and public.marketplace_request_listable(sr.id)
   order by coalesce(sr.marketplace_published_at, sr.created_at) desc, sr.id
   limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

-- 4i. privileges: the lawyer's two calls to authenticated; the rest service_role only
do $gr$
declare
  r text;
  f text;
begin
  foreach f in array array[
    'public.marketplace_request_listable(text)',
    'public.marketplace_open_requests(integer, integer)',
    'public.marketplace_request_accept(text)',
    'public.marketplace_acceptance_withdraw(uuid)',
    'public.marketplace_acceptance_decide(uuid, uuid, boolean, text)',
    'public.marketplace_assign_lawyer(text, uuid, uuid)',
    'public.marketplace_overdue_acceptances(boolean)',
    'public.marketplace_open_requests_admin(integer, integer)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
        execute pg_catalog.format('revoke all on function %s from %I', f, r);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.marketplace_open_requests(integer, integer) to authenticated';
    execute 'grant execute on function public.marketplace_request_accept(text) to authenticated';
    execute 'grant execute on function public.marketplace_acceptance_withdraw(uuid) to authenticated';
  end if;
end
$gr$;

-- 5. the community AI review log
create table if not exists public.community_ai_reviews (
  id          bigint generated by default as identity primary key,
  kind        text        not null,
  target_id   text        not null,
  decision    text        not null,
  category    text,
  model       text,
  detail      text,
  created_at  timestamptz not null default now()
);
do $chk2$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.community_ai_reviews'::regclass and conname = 'community_ai_reviews_kind_check') then
    alter table public.community_ai_reviews add constraint community_ai_reviews_kind_check check (kind in ('post', 'answer'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.community_ai_reviews'::regclass and conname = 'community_ai_reviews_decision_check') then
    alter table public.community_ai_reviews add constraint community_ai_reviews_decision_check
      check (decision in ('approve', 'reject', 'hold', 'error'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.community_ai_reviews'::regclass and conname = 'community_ai_reviews_detail_check') then
    alter table public.community_ai_reviews add constraint community_ai_reviews_detail_check
      check (detail is null or pg_catalog.char_length(detail) <= 300);
  end if;
end
$chk2$;
create index if not exists community_ai_reviews_target_idx on public.community_ai_reviews (kind, target_id, created_at desc);
comment on table public.community_ai_reviews is
  '20261202_70 (l12 Q131a): one row per automatic pre-publish decision on a community question or answer. Service role only.';
alter table public.community_ai_reviews enable row level security;
do $tg2$
declare r text;
begin
  execute 'revoke all on table public.community_ai_reviews from public';
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on table public.community_ai_reviews from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.community_ai_reviews to service_role';
  end if;
end
$tg2$;

-- 6. verify (raises → the whole file rolls back)
do $verify$
declare
  missing text := '';
  cols text;
  def text;
  f text;
begin
  if (select pg_catalog.count(*) from public.platform_settings
       where key in ('marketplace_market', 'marketplace_commission_pct', 'community_ai_review')) <> 3 then
    missing := missing || ' a setting row is missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.service_requests'::regclass and attname = 'marketplace_hidden_at' and not attisdropped) then
    missing := missing || ' marketplace_hidden_at missing;';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.guard_service_request_marketplace_publish()'::regprocedure),
                       'marketplace_hidden_at') = 0 then
    missing := missing || ' the publish guard does not keep marketplace_hidden_at;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.service_requests'::regclass
                    and tgname = 'trg_02_service_requests_marketplace_guard' and not tgisinternal and tgenabled <> 'D') then
    missing := missing || ' publish guard trigger missing;';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.marketplace_acceptances'::regclass) then
    missing := missing || ' marketplace_acceptances has no RLS;';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.community_ai_reviews'::regclass) then
    missing := missing || ' community_ai_reviews has no RLS;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     and (has_table_privilege('anon', 'public.marketplace_acceptances', 'SELECT')
          or has_table_privilege('anon', 'public.community_ai_reviews', 'SELECT')) then
    missing := missing || ' anon can read a new table;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and (has_table_privilege('authenticated', 'public.marketplace_acceptances', 'INSERT')
          or has_table_privilege('authenticated', 'public.marketplace_acceptances', 'UPDATE')
          or has_table_privilege('authenticated', 'public.marketplace_acceptances', 'DELETE')
          or has_table_privilege('authenticated', 'public.community_ai_reviews', 'SELECT')) then
    missing := missing || ' authenticated can write marketplace_acceptances or read community_ai_reviews;';
  end if;

  select string_agg(a.attname, ',' order by a.attnum) into cols
    from pg_catalog.pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum)
   where p.oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure and a.mode = 't';
  if cols is distinct from 'id,type,receiver,city,public_summary,status,created_at,category' then
    missing := missing || pg_catalog.format(' marketplace_open_requests returns %s;', cols);
  end if;
  def := pg_catalog.pg_get_functiondef('public.marketplace_open_requests(integer, integer)'::regprocedure);
  if pg_catalog.strpos(def, 'marketplace_published_at is not null') = 0
     or pg_catalog.strpos(def, 'is_demo') = 0
     or pg_catalog.strpos(def, 'test_accounts') = 0
     or pg_catalog.strpos(def, 'marketplace_hidden_at is null') = 0
     or pg_catalog.strpos(def, 'marketplace_market') = 0 then
    missing := missing || ' marketplace_open_requests lost a filter;';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'marketplace_open_requests') <> 1 then
    missing := missing || ' public.marketplace_open_requests is not exactly one function;';
  end if;

  foreach f in array array[
    'public.marketplace_request_listable(text)',
    'public.marketplace_open_requests(integer, integer)',
    'public.marketplace_request_accept(text)',
    'public.marketplace_acceptance_withdraw(uuid)',
    'public.marketplace_acceptance_decide(uuid, uuid, boolean, text)',
    'public.marketplace_assign_lawyer(text, uuid, uuid)',
    'public.marketplace_overdue_acceptances(boolean)',
    'public.marketplace_open_requests_admin(integer, integer)'
  ] loop
    if to_regprocedure(f) is null then
      missing := missing || pg_catalog.format(' %s missing;', f);
      continue;
    end if;
    if not (select prosecdef from pg_catalog.pg_proc where oid = to_regprocedure(f)) then
      missing := missing || pg_catalog.format(' %s is not security definer;', f);
    end if;
    if not exists (select 1 from pg_catalog.pg_proc where oid = to_regprocedure(f) and proconfig @> array['search_path=""']) then
      missing := missing || pg_catalog.format(' %s has no empty search_path;', f);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
       and has_function_privilege('anon', f, 'EXECUTE') then
      missing := missing || pg_catalog.format(' anon can EXECUTE %s;', f);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    if not has_function_privilege('authenticated', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.marketplace_request_accept(text)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.marketplace_acceptance_withdraw(uuid)', 'EXECUTE') then
      missing := missing || ' authenticated lost a lawyer call;';
    end if;
    if has_function_privilege('authenticated', 'public.marketplace_request_listable(text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.marketplace_acceptance_decide(uuid, uuid, boolean, text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.marketplace_assign_lawyer(text, uuid, uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.marketplace_overdue_acceptances(boolean)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.marketplace_open_requests_admin(integer, integer)', 'EXECUTE') then
      missing := missing || ' authenticated can EXECUTE an admin function;';
    end if;
  end if;

  if missing <> '' then
    raise exception 'l12_market verify:%', missing;
  end if;
  raise notice 'l12_market verify: OK';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261202_70 market open (Q130a/Q151) + community AI review log (Q131a)' as migration,
       to_regclass('public.marketplace_acceptances') is not null
       and to_regclass('public.community_ai_reviews') is not null
       and to_regprocedure('public.marketplace_request_accept(text)') is not null
       and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.marketplace_open_requests(integer, integer)'::regprocedure),
                             'marketplace_hidden_at is null') > 0 as ok;
