-- =============================================================================
-- Migration: 20261127_60_community_review_devices_freeze.sql   (batch l7, l7_community)
-- =============================================================================
-- PURPOSE (owner decisions of 18 Nov 2026 on questions ٢٥, ٤٠, ٤٢; batch l7
-- decisions 13, 14, 15). Three independent parts, one file:
--
--   A. ٤٢ COMMUNITY — REVIEW BEFORE PUBLISHING (decision 13)
--      1. community_posts.status and community_answers.status may also be
--         'pending_review' and 'rejected' (the CHECKs are replaced; the old
--         values stay). New columns on both: review_note (the reason the
--         author reads on a rejection), reviewed_at.
--      2. platform_settings row 'community_prepublish_review' = true (ON),
--         inserted only when missing; the admin moderation page switches it.
--         A missing row reads as ON.
--      3. BEFORE INSERT trigger on both tables: while the setting is on, a row
--         written by a signed-in member (auth.uid() not null, not staff) is
--         stored as 'pending_review'. The service role and staff publish at
--         once. BEFORE UPDATE OF title/body/tags (posts) and body (answers):
--         while the setting is on, a member's edit of a published or rejected
--         row sends it back to 'pending_review' (no edit-after-approval
--         loophole).
--      4. RLS: the two read policies (LATEST definitions: 20261016_06) gain
--         ONE arm — the author reads his own 'pending_review' / 'rejected'
--         rows. Nobody else does. community_post_readable() is NOT changed,
--         so nobody can answer, vote on or save a post still under review.
--      5. public.community_verified_office_users(uuid[]) — «مكتب موثّق»:
--         which of the given users OWN a firm whose commercial registration
--         is verified (firm_profiles.verification_status = 'verified') and
--         that has at least one lawyer — the owner or an ACTIVE member with a
--         practising role — whose lawyer_profiles row is verified and whose
--         licence is valid today in Riyadh (the lawyers' registry expiry
--         when the licence is found there, else lawyer_profiles.license_expiry).
--         Service role only.
--
--   B. ٢٥ SUSPENSION FREEZES, IT DOES NOT CANCEL (decision 15)
--      public.account_suspension_freezes — one row per suspension, holding a
--      SNAPSHOT of what was live at frozen_at: subscriptions
--      (current_period_end), library_access_grants (ends_at, not revoked),
--      founder_seats (active, ends_at), membership_credits (ends_at, credit
--      left) and points_lots (expires_at, points left). Nothing is cancelled.
--        account_freeze_open(user, actor, reason)  → jsonb
--          opens the freeze (idempotent: an open one is returned as it is).
--        account_freeze_lift(user, actor)          → jsonb
--          closes it and adds (lifted_at − frozen_at) to EXACTLY the rows in
--          the snapshot that are still live (a revoked grant, a cancelled
--          subscription, a released seat are not extended). A second lift is
--          'not_frozen' — never a second extension.
--      Both SECURITY DEFINER, search_path '', service role only.
--
--   C. ٤٠ LIBRARY DEVICES (decision 14), still behind
--      library_monitor_settings.device_limit_enabled (ships OFF, unchanged):
--      1. user_devices gains verified_at, opened_at, session_id, and the
--         e-mail code columns (code_hash = HMAC computed by the server, never
--         the code; code_expires_at, code_attempts, code_sent_at). Rows that
--         exist when this file first adds verified_at are grandfathered as
--         verified (verified_at = first_seen): switching the limit on locks
--         nobody out.
--      2. library_device_gate(user, hash, label, session, code_required) — the
--         new check (library_device_check stays for the code of the previous
--         deploy):
--           disabled / exempt                          as before
--           ok          a verified device; when it opens with a session that
--                       is not the one it last opened with (a new login here,
--                       or coming back from the other device), every OTHER
--                       session of the account is ended (sessions_ended)
--           needs_code  a never-verified device and room left: a pending row
--                       (does not count toward the limit) waits for the code
--           registered  as needs_code, but p_code_required false (the server
--                       cannot send e-mail): registered at once, as before
--           refused     a known (once verified, signed-out) device, no room
--           suspend     a NEVER-verified device while the verified devices
--                       already fill the limit: the third device. The server
--                       then suspends the account (ban + freeze, part B).
--      3. library_device_code_issue(user, hash, code_hash) — stores the code
--         of a pending device (10 minutes, 60-second resend cooldown).
--      4. library_device_code_verify(user, hash, code_hash, session) — 5
--         attempts; on success the device is verified, opened, and every
--         other session of the account is ended.
--      All service role only.
--
-- HOW TO RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261127_60_community_review_devices_freeze.sql
--   Expect: NOTICE  l7_community verify: OK  and a row with `t`.
--
-- RUN ORDER — before or after the deploy, either way:
--   * code first, SQL later: posts publish at once as today (no pending
--     status exists); a suspension no longer cancels anything and records
--     «freeze: migration_missing» (nothing is extended on lift); the device
--     gate falls back to library_device_check (the 20261108_20 behaviour).
--   * SQL first, old code: new posts wait for review but the old feed does
--     not show the author his pending post (it filters deleted/moderated
--     only — RLS still hides it from everyone else); the old suspension path
--     still cancels; the old device check ignores the new columns.
--   Deploy soon after either way.
-- Requires: 20261016_06 (community), 20261124_60 (suspension), 20261108_20
--   (user_devices), 20261019_10 / 20261030_65 (library grants), 20261101_10
--   (founder seats), 20261022_20 (points lots), 20260627 (platform_settings).
--
-- ROLLBACK (by hand; restores the old CHECKs only once no row uses the new
--   statuses):
--   begin;
--     drop function if exists public.library_device_code_verify(uuid, text, text, uuid);
--     drop function if exists public.library_device_code_issue(uuid, text, text);
--     drop function if exists public.library_device_gate(uuid, text, text, uuid, boolean);
--     alter table public.user_devices drop column if exists verified_at, drop column if exists opened_at,
--       drop column if exists session_id, drop column if exists code_hash, drop column if exists code_expires_at,
--       drop column if exists code_attempts, drop column if exists code_sent_at;
--     drop function if exists public.account_freeze_lift(uuid, uuid);
--     drop function if exists public.account_freeze_open(uuid, uuid, text);
--     drop table if exists public.account_suspension_freezes;
--     drop function if exists public.community_verified_office_users(uuid[]);
--     drop trigger if exists trg_community_posts_review on public.community_posts;
--     drop trigger if exists trg_community_answers_review on public.community_answers;
--     drop function if exists public.community_review_on_write();
--     drop function if exists public.community_prepublish_review_on();
--     -- then re-run 20261016_06 to restore its two read policies.
--   commit;
-- Safe to re-run.
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.community_post_readable(uuid)') is null then
    raise exception '20261127_60: run 20261016_06_community_access_and_counters.sql first';
  end if;
  if to_regclass('public.user_devices') is null or to_regclass('public.library_monitor_settings') is null then
    raise exception '20261127_60: run 20261108_20_library_device_limit.sql first';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261127_60: public.platform_settings is missing';
  end if;
  if to_regclass('auth.sessions') is null or to_regclass('auth.refresh_tokens') is null then
    raise exception '20261127_60: auth.sessions / auth.refresh_tokens not found (is this the Supabase database?)';
  end if;
  if to_regclass('public.subscriptions') is null or to_regclass('public.library_access_grants') is null
     or to_regclass('public.founder_seats') is null or to_regclass('public.membership_credits') is null
     or to_regclass('public.points_lots') is null then
    raise exception '20261127_60: subscriptions / library_access_grants / founder_seats / membership_credits / points_lots must all exist';
  end if;
end
$pre$;

-- ═════════════════════════════════════════════════════════════════════════════
-- A. ٤٢ COMMUNITY — review before publishing
-- ═════════════════════════════════════════════════════════════════════════════

-- ── A1. statuses + review columns ───────────────────────────────────────────
do $chk$
declare
  r record;
begin
  -- Drop every CHECK on status (whatever its name on this database), then add
  -- the named one. The old values all stay allowed.
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
      from pg_catalog.pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.community_posts'::regclass, 'public.community_answers'::regclass)
       and pg_catalog.pg_get_constraintdef(c.oid) ilike '%status%'
       and pg_catalog.pg_get_constraintdef(c.oid) not ilike '%visibility%'
       and pg_catalog.pg_get_constraintdef(c.oid) not ilike '%category%'
  loop
    execute pg_catalog.format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end
$chk$;

alter table public.community_posts
  add constraint community_posts_status_check
  check (status in ('active', 'closed', 'moderated', 'deleted', 'pending_review', 'rejected'));
alter table public.community_answers
  add constraint community_answers_status_check
  check (status in ('active', 'moderated', 'deleted', 'pending_review', 'rejected'));

alter table public.community_posts
  add column if not exists review_note text check (review_note is null or length(review_note) <= 500),
  add column if not exists reviewed_at timestamptz;
alter table public.community_answers
  add column if not exists review_note text check (review_note is null or length(review_note) <= 500),
  add column if not exists reviewed_at timestamptz;

comment on column public.community_posts.review_note is
  'Owner ٤٢ (20261127_60): the reviewer''s reason on a rejection — read by the author only (RLS). Written by the service role.';
comment on column public.community_answers.review_note is
  'Owner ٤٢ (20261127_60): the reviewer''s reason on a rejection — read by the author only (RLS). Written by the service role.';

create index if not exists idx_community_answers_pending
  on public.community_answers (created_at) where status = 'pending_review';
create index if not exists idx_community_posts_pending
  on public.community_posts (created_at) where status = 'pending_review';

-- ── A2. the setting (ON unless an admin switched it off) ────────────────────
insert into public.platform_settings (key, value, description)
values ('community_prepublish_review', 'true'::jsonb,
        'المراجعة قبل النشر في المجتمع (قرار المالك ٤٢): الأسئلة والإجابات لا تظهر قبل موافقة المراجع ما دام الإعداد مفعّلاً')
on conflict (key) do nothing;

create or replace function public.community_prepublish_review_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case pg_catalog.jsonb_typeof(s.value)
              when 'boolean' then (s.value)::text::boolean
              when 'object' then case pg_catalog.jsonb_typeof(s.value -> 'enabled')
                                   when 'boolean' then (s.value ->> 'enabled')::boolean end
            end
       from public.platform_settings s
      where s.key = 'community_prepublish_review'),
    true);
$$;

comment on function public.community_prepublish_review_on() is
  'Owner ٤٢ (20261127_60): platform_settings.community_prepublish_review — true unless an admin set it to false. A missing or malformed row reads as ON.';

revoke all on function public.community_prepublish_review_on() from public;
grant execute on function public.community_prepublish_review_on() to anon, authenticated, service_role;

-- ── A3. the review trigger (insert + edit) ──────────────────────────────────
create or replace function public.community_review_on_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- The service role (no JWT subject) and staff publish at once.
  if v_uid is null then
    return new;
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.user_type = 'admin') then
    return new;
  end if;
  if not public.community_prepublish_review_on() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'active' then
      new.status := 'pending_review';
      new.review_note := null;
      new.reviewed_at := null;
    end if;
  elsif tg_op = 'UPDATE' then
    -- A member's edit of a published or rejected text goes back to review.
    if old.status in ('active', 'closed', 'rejected') and new.status = old.status then
      new.status := 'pending_review';
      new.review_note := null;
      new.reviewed_at := null;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.community_review_on_write() is
  'Owner ٤٢ (20261127_60): while community_prepublish_review is on, a member''s new post/answer is stored pending_review, and an edit of a published or rejected one goes back to pending_review. Service role and staff are not held.';

revoke all on function public.community_review_on_write() from public, anon, authenticated;

drop trigger if exists trg_community_posts_review on public.community_posts;
create trigger trg_community_posts_review
  before insert or update of title, body, tags on public.community_posts
  for each row execute function public.community_review_on_write();

drop trigger if exists trg_community_answers_review on public.community_answers;
create trigger trg_community_answers_review
  before insert or update of body on public.community_answers
  for each row execute function public.community_review_on_write();

-- ── A4. read policies: + the author's own rows under review ─────────────────
-- Copied from their LATEST definitions (20261016_06); only the last arm is new.
drop policy if exists "anyone reads public community posts" on public.community_posts;
create policy "anyone reads public community posts" on public.community_posts
  for select
  using (
    (status in ('active', 'closed')
     and (visibility = 'public'
          or author_id = auth.uid()
          or (visibility = 'lawyers_only' and public.community_is_verified_lawyer())))
    or (author_id = auth.uid() and status in ('pending_review', 'rejected'))
  );

drop policy if exists "anyone reads active community answers" on public.community_answers;
create policy "anyone reads active community answers" on public.community_answers
  for select
  using (
    (status = 'active' and public.community_post_readable(post_id))
    or (author_id = auth.uid() and status in ('pending_review', 'rejected'))
  );

-- ── A5. «مكتب موثّق» ─────────────────────────────────────────────────────────
create or replace function public.community_verified_office_users(p_ids uuid[])
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today    date := (pg_catalog.now() at time zone 'Asia/Riyadh')::date;
  v_registry boolean := to_regclass('public.lawyer_registry') is not null
                        and to_regprocedure('public.lawyer_registry_norm_licence(text)') is not null;
begin
  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    return;
  end if;
  if pg_catalog.cardinality(p_ids) > 200 then
    raise exception 'community_verified_office_users: at most 200 ids' using errcode = '22023';
  end if;

  -- The registry decides when it knows the licence; else the expiry on the
  -- lawyer's own verified file. Two statements, so a database without the
  -- registry never plans a query that names it.
  if v_registry then
    return query
      select distinct f.owner_user_id
        from public.firm_profiles f
       where f.owner_user_id = any (p_ids)
         and f.verification_status = 'verified'
         and exists (
           select 1
             from public.lawyer_profiles lp
             left join public.lawyer_registry r
               on lp.license_number is not null
              and r.licence_no = public.lawyer_registry_norm_licence(lp.license_number)
            where lp.verification_status = 'verified'
              and (lp.user_id = f.owner_user_id
                   or exists (select 1 from public.firm_members m
                               where m.firm_id = f.id and m.user_id = lp.user_id and m.status = 'active'
                                 and m.role in ('managing_partner', 'partner', 'senior_lawyer', 'lawyer',
                                                'external_of_counsel', 'legal_consultant')))
              and case
                    when r.licence_no is not null
                      then not r.archived and r.expiry_date is not null and r.expiry_date >= v_today
                    else lp.license_expiry is not null and lp.license_expiry >= v_today
                  end);
  else
    return query
      select distinct f.owner_user_id
        from public.firm_profiles f
       where f.owner_user_id = any (p_ids)
         and f.verification_status = 'verified'
         and exists (
           select 1
             from public.lawyer_profiles lp
            where lp.verification_status = 'verified'
              and (lp.user_id = f.owner_user_id
                   or exists (select 1 from public.firm_members m
                               where m.firm_id = f.id and m.user_id = lp.user_id and m.status = 'active'
                                 and m.role in ('managing_partner', 'partner', 'senior_lawyer', 'lawyer',
                                                'external_of_counsel', 'legal_consultant')))
              and lp.license_expiry is not null
              and lp.license_expiry >= v_today);
  end if;
end;
$$;

comment on function public.community_verified_office_users(uuid[]) is
  'Owner ٤٢ (20261127_60): «مكتب موثّق» — which of (at most 200) user ids own a firm with a verified CR and at least one verified lawyer (owner or active practising member) whose licence is valid today (registry expiry, else lawyer_profiles.license_expiry). Service role only.';

revoke all on function public.community_verified_office_users(uuid[]) from public, anon, authenticated;
grant execute on function public.community_verified_office_users(uuid[]) to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- B. ٢٥ SUSPENSION FREEZES
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.account_suspension_freezes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  reason      text not null check (reason in ('admin', 'device_limit')),
  frozen_at   timestamptz not null default now(),
  frozen_by   uuid,
  snapshot    jsonb not null default '{}'::jsonb,
  lifted_at   timestamptz,
  lifted_by   uuid,
  extended_by interval,
  extended    jsonb,
  constraint account_suspension_freezes_lift_check check (lifted_at is null or lifted_at >= frozen_at)
);

create unique index if not exists account_suspension_freezes_one_open
  on public.account_suspension_freezes (user_id) where lifted_at is null;
create index if not exists account_suspension_freezes_user_idx
  on public.account_suspension_freezes (user_id, frozen_at desc);

comment on table public.account_suspension_freezes is
  'Owner ٢٥ (20261127_60): a suspension freezes, it does not cancel. snapshot = the subscriptions / grants / seats / credits / points lots live at frozen_at; on lift exactly those still live are extended by lifted_at - frozen_at. Service role only.';

alter table public.account_suspension_freezes enable row level security;
revoke all on public.account_suspension_freezes from public, anon, authenticated;
grant all on public.account_suspension_freezes to service_role;

create or replace function public.account_freeze_open(p_user uuid, p_actor uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_open public.account_suspension_freezes;
  v_snap jsonb;
  v_id   uuid;
begin
  if p_user is null or p_reason is null or p_reason not in ('admin', 'device_limit') then
    raise exception 'account_freeze_open: invalid arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account_freeze:' || p_user::text, 0));

  select f.* into v_open from public.account_suspension_freezes f
   where f.user_id = p_user and f.lifted_at is null;
  if found then
    return jsonb_build_object('state', 'already_frozen', 'id', v_open.id, 'frozen_at', v_open.frozen_at);
  end if;

  v_snap := jsonb_build_object(
    'subscriptions', coalesce((select jsonb_agg(s.id) from public.subscriptions s
                                where s.user_id = p_user
                                  and s.status in ('active', 'trialing', 'past_due')
                                  and s.current_period_end is not null
                                  and s.current_period_end > pg_catalog.now()), '[]'::jsonb),
    'library_access_grants', coalesce((select jsonb_agg(g.id) from public.library_access_grants g
                                        where g.user_id = p_user
                                          and g.revoked_at is null
                                          and g.ends_at > pg_catalog.now()), '[]'::jsonb),
    'founder_seats', coalesce((select jsonb_agg(fs.id) from public.founder_seats fs
                                where fs.user_id = p_user
                                  and fs.status = 'active'
                                  and fs.ends_at is not null
                                  and fs.ends_at > pg_catalog.now()), '[]'::jsonb),
    'membership_credits', coalesce((select jsonb_agg(c.id) from public.membership_credits c
                                     where c.user_id = p_user
                                       and c.remaining > 0
                                       and c.ends_at > pg_catalog.now()), '[]'::jsonb),
    'points_lots', coalesce((select jsonb_agg(l.id) from public.points_lots l
                              where l.user_id = p_user
                                and l.points_left > 0
                                and l.expires_at > pg_catalog.now()), '[]'::jsonb));

  insert into public.account_suspension_freezes (user_id, reason, frozen_by, snapshot)
  values (p_user, p_reason, p_actor, v_snap)
  returning id into v_id;

  return jsonb_build_object(
    'state', 'frozen', 'id', v_id, 'frozen_at', pg_catalog.now(),
    'counts', jsonb_build_object(
      'subscriptions', jsonb_array_length(v_snap -> 'subscriptions'),
      'library_access_grants', jsonb_array_length(v_snap -> 'library_access_grants'),
      'founder_seats', jsonb_array_length(v_snap -> 'founder_seats'),
      'membership_credits', jsonb_array_length(v_snap -> 'membership_credits'),
      'points_lots', jsonb_array_length(v_snap -> 'points_lots')));
end;
$$;

comment on function public.account_freeze_open(uuid, uuid, text) is
  'Owner ٢٥ (20261127_60): opens the suspension freeze of one account and snapshots what is live (idempotent). Service role only.';

create or replace function public.account_freeze_lift(p_user uuid, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_open  public.account_suspension_freezes;
  v_now   timestamptz := pg_catalog.now();
  v_delta interval;
  v_subs  int;
  v_grant int;
  v_seat  int;
  v_cred  int;
  v_lots  int;
  v_ext   jsonb;
begin
  if p_user is null then
    raise exception 'account_freeze_lift: p_user is required' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account_freeze:' || p_user::text, 0));

  select f.* into v_open from public.account_suspension_freezes f
   where f.user_id = p_user and f.lifted_at is null
   for update;
  if not found then
    return jsonb_build_object('state', 'not_frozen');
  end if;

  v_delta := v_now - v_open.frozen_at;

  update public.subscriptions s
     set current_period_end = s.current_period_end + v_delta,
         updated_at = v_now
   where s.user_id = p_user
     and s.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_open.snapshot -> 'subscriptions') x)
     and s.status in ('active', 'trialing', 'past_due')
     and s.current_period_end is not null;
  get diagnostics v_subs = row_count;

  update public.library_access_grants g
     set ends_at = g.ends_at + v_delta
   where g.user_id = p_user
     and g.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_open.snapshot -> 'library_access_grants') x)
     and g.revoked_at is null;
  get diagnostics v_grant = row_count;

  update public.founder_seats fs
     set ends_at = fs.ends_at + v_delta
   where fs.user_id = p_user
     and fs.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_open.snapshot -> 'founder_seats') x)
     and fs.status = 'active'
     and fs.ends_at is not null;
  get diagnostics v_seat = row_count;

  update public.membership_credits c
     set ends_at = c.ends_at + v_delta
   where c.user_id = p_user
     and c.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_open.snapshot -> 'membership_credits') x);
  get diagnostics v_cred = row_count;

  update public.points_lots l
     set expires_at = l.expires_at + v_delta
   where l.user_id = p_user
     and l.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_open.snapshot -> 'points_lots') x)
     and l.points_left > 0;
  get diagnostics v_lots = row_count;

  v_ext := jsonb_build_object('subscriptions', v_subs, 'library_access_grants', v_grant,
                              'founder_seats', v_seat, 'membership_credits', v_cred, 'points_lots', v_lots);

  update public.account_suspension_freezes f
     set lifted_at = v_now, lifted_by = p_actor, extended_by = v_delta, extended = v_ext
   where f.id = v_open.id;

  return jsonb_build_object(
    'state', 'lifted', 'id', v_open.id, 'reason', v_open.reason,
    'frozen_at', v_open.frozen_at, 'lifted_at', v_now,
    'extended_days', round((extract(epoch from v_delta) / 86400.0)::numeric, 2),
    'extended', v_ext);
end;
$$;

comment on function public.account_freeze_lift(uuid, uuid) is
  'Owner ٢٥ (20261127_60): closes the open freeze and extends the snapshot rows still live by lifted_at - frozen_at. A second call answers not_frozen. Service role only.';

revoke all on function public.account_freeze_open(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.account_freeze_lift(uuid, uuid) from public, anon, authenticated;
grant execute on function public.account_freeze_open(uuid, uuid, text) to service_role;
grant execute on function public.account_freeze_lift(uuid, uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- C. ٤٠ LIBRARY DEVICES
-- ═════════════════════════════════════════════════════════════════════════════

-- ── C1. columns (+ the one-time grandfathering) ─────────────────────────────
do $cols$
declare
  v_new boolean := not exists (select 1 from pg_catalog.pg_attribute
                                where attrelid = 'public.user_devices'::regclass
                                  and attname = 'verified_at' and not attisdropped);
begin
  alter table public.user_devices
    add column if not exists verified_at     timestamptz,
    add column if not exists opened_at       timestamptz,
    add column if not exists session_id      uuid,
    add column if not exists code_hash       text,
    add column if not exists code_expires_at timestamptz,
    add column if not exists code_attempts   int not null default 0,
    add column if not exists code_sent_at    timestamptz;
  if v_new then
    -- Every device registered under 20261108_20 counts as verified.
    update public.user_devices d set verified_at = d.first_seen where d.verified_at is null;
    raise notice '20261127_60: existing library devices grandfathered as verified';
  end if;
end
$cols$;

alter table public.user_devices drop constraint if exists user_devices_code_hash_check;
alter table public.user_devices
  add constraint user_devices_code_hash_check check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$');

comment on column public.user_devices.verified_at is
  'Owner ٤٠ (20261127_60): when the e-mail code verified this device (grandfathered rows: first_seen). NULL = pending, not counted toward the limit.';
comment on column public.user_devices.session_id is
  'Owner ٤٠ (20261127_60): the auth session this device last opened the library with; another session opening it ends the others.';

-- The owner still reads only his own rows, without the hash or the code.
grant select (id, user_id, label, first_seen, last_seen, revoked_at, verified_at) on public.user_devices to authenticated;

-- ── C2. the gate ────────────────────────────────────────────────────────────
create or replace function public.library_device_gate(
  p_user          uuid,
  p_device_hash   text,
  p_label         text,
  p_session       uuid,
  p_code_required boolean)
returns table (
  status         text,
  device_limit   int,
  device_id      uuid,
  devices        jsonb,
  sessions_ended int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enabled  boolean;
  v_limit    int;
  v_type     text;
  v_label    text;
  v_row      public.user_devices;
  v_verified int;
  v_id       uuid;
  v_ended    int := 0;
  v_list     jsonb;
  v_found    boolean;
begin
  if p_user is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'library_device_gate: invalid arguments' using errcode = '22023';
  end if;
  v_label := left(coalesce(nullif(btrim(p_label), ''), 'جهاز'), 120);

  select s.device_limit_enabled, s.device_limit into v_enabled, v_limit
    from public.library_monitor_settings s where s.id;
  v_limit := coalesce(v_limit, 2);
  if not coalesce(v_enabled, false) then
    return query select 'disabled'::text, v_limit, null::uuid, '[]'::jsonb, 0;
    return;
  end if;

  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type = 'admin' then
    return query select 'exempt'::text, v_limit, null::uuid, '[]'::jsonb, 0;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_device:' || p_user::text, 0));

  select d.* into v_row from public.user_devices d
   where d.user_id = p_user and d.device_hash = p_device_hash;
  v_found := found;  -- the next SELECT INTO resets FOUND

  select pg_catalog.count(*)::int into v_verified from public.user_devices d
   where d.user_id = p_user and d.revoked_at is null and d.verified_at is not null;

  v_list := coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label,
                                                           'first_seen', d.first_seen, 'last_seen', d.last_seen)
                                        order by d.last_seen desc)
                        from public.user_devices d
                       where d.user_id = p_user and d.revoked_at is null and d.verified_at is not null), '[]'::jsonb);

  -- 1. A verified, active device.
  if v_found and v_row.revoked_at is null and v_row.verified_at is not null then
    if p_session is not null and v_row.session_id is distinct from p_session then
      -- Opened with another session (a login here, or back from the other
      -- device): no two open at once — every other session of the account ends.
      delete from auth.sessions s where s.user_id = p_user and s.id <> p_session;
      get diagnostics v_ended = row_count;
      delete from auth.refresh_tokens t where t.user_id = p_user::text and t.session_id is null;
      update public.user_devices d
         set session_id = p_session, opened_at = now(), last_seen = now(), label = v_label
       where d.id = v_row.id;
    elsif v_row.last_seen < now() - interval '5 minutes' or v_row.label is distinct from v_label then
      update public.user_devices d set last_seen = now(), label = v_label where d.id = v_row.id;
    end if;
    return query select 'ok'::text, v_limit, v_row.id, '[]'::jsonb, v_ended;
    return;
  end if;

  -- 2. A known device (verified once) that signed out: back in if there is room.
  if v_found and v_row.verified_at is not null then
    if v_verified >= v_limit then
      return query select 'refused'::text, v_limit, null::uuid, v_list, 0;
      return;
    end if;
    if p_session is not null then
      delete from auth.sessions s where s.user_id = p_user and s.id <> p_session;
      get diagnostics v_ended = row_count;
      delete from auth.refresh_tokens t where t.user_id = p_user::text and t.session_id is null;
    end if;
    update public.user_devices d
       set revoked_at = null, revoked_by = null, revoke_reason = null, label = v_label,
           last_seen = now(), opened_at = now(), session_id = p_session
     where d.id = v_row.id;
    return query select 'ok'::text, v_limit, v_row.id, '[]'::jsonb, v_ended;
    return;
  end if;

  -- 3. A device never verified. The verified devices already fill the limit:
  --    this is the third device — the server suspends the account.
  if v_verified >= v_limit then
    return query select 'suspend'::text, v_limit, null::uuid, v_list, 0;
    return;
  end if;

  -- 4. Room left, and the server cannot send the code: registered at once.
  if not coalesce(p_code_required, true) then
    insert into public.user_devices as d (user_id, device_hash, label, verified_at, opened_at, session_id)
    values (p_user, p_device_hash, v_label, now(), now(), p_session)
    on conflict on constraint user_devices_user_hash_key do update
       set revoked_at = null, revoked_by = null, revoke_reason = null, label = excluded.label,
           first_seen = now(), last_seen = now(), verified_at = now(), opened_at = now(),
           session_id = excluded.session_id, code_hash = null, code_expires_at = null, code_attempts = 0
    returning d.id into v_id;
    if p_session is not null then
      delete from auth.sessions s where s.user_id = p_user and s.id <> p_session;
      get diagnostics v_ended = row_count;
      delete from auth.refresh_tokens t where t.user_id = p_user::text and t.session_id is null;
    end if;
    return query select 'registered'::text, v_limit, v_id, '[]'::jsonb, v_ended;
    return;
  end if;

  -- 5. Room left: a pending row waits for the e-mail code.
  insert into public.user_devices as d (user_id, device_hash, label)
  values (p_user, p_device_hash, v_label)
  on conflict on constraint user_devices_user_hash_key do update
     set revoked_at = null, revoked_by = null, revoke_reason = null,
         label = excluded.label, last_seen = now()
  returning d.id into v_id;
  return query select 'needs_code'::text, v_limit, v_id, '[]'::jsonb, 0;
end;
$$;

comment on function public.library_device_gate(uuid, text, text, uuid, boolean) is
  'Owner ٤٠ (20261127_60): the library device gate — disabled / exempt / ok / needs_code / registered / refused / suspend; a device opening with a new session ends every other session of the account. Service role only.';

revoke all on function public.library_device_gate(uuid, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.library_device_gate(uuid, text, text, uuid, boolean) to service_role;

-- ── C3. issue a code for a pending device ───────────────────────────────────
create or replace function public.library_device_code_issue(p_user uuid, p_device_hash text, p_code_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.user_devices;
begin
  if p_user is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'library_device_code_issue: invalid arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_device:' || p_user::text, 0));

  select d.* into v_row from public.user_devices d
   where d.user_id = p_user and d.device_hash = p_device_hash;
  if not found or v_row.revoked_at is not null or v_row.verified_at is not null then
    return jsonb_build_object('state', 'not_pending');
  end if;
  if v_row.code_sent_at is not null and v_row.code_sent_at > now() - interval '60 seconds' then
    return jsonb_build_object('state', 'cooldown',
      'retry_after', ceil(extract(epoch from (v_row.code_sent_at + interval '60 seconds' - now())))::int);
  end if;

  update public.user_devices d
     set code_hash = p_code_hash, code_expires_at = now() + interval '10 minutes',
         code_attempts = 0, code_sent_at = now()
   where d.id = v_row.id;
  return jsonb_build_object('state', 'issued', 'device_id', v_row.id);
end;
$$;

comment on function public.library_device_code_issue(uuid, text, text) is
  'Owner ٤٠ (20261127_60): stores the HMAC of a new e-mail code for a pending library device (10 minutes, 60 s cooldown). Service role only.';

-- ── C4. verify the code ─────────────────────────────────────────────────────
create or replace function public.library_device_code_verify(p_user uuid, p_device_hash text, p_code_hash text, p_session uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row      public.user_devices;
  v_limit    int;
  v_verified int;
  v_ended    int := 0;
begin
  if p_user is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'library_device_code_verify: invalid arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_device:' || p_user::text, 0));

  select d.* into v_row from public.user_devices d
   where d.user_id = p_user and d.device_hash = p_device_hash
   for update;
  if not found or v_row.revoked_at is not null or v_row.verified_at is not null then
    return jsonb_build_object('state', 'not_pending');
  end if;
  if v_row.code_hash is null then
    return jsonb_build_object('state', 'no_code');
  end if;
  if v_row.code_attempts >= 5 then
    return jsonb_build_object('state', 'too_many');
  end if;
  if v_row.code_expires_at is null or v_row.code_expires_at < now() then
    return jsonb_build_object('state', 'expired');
  end if;
  if v_row.code_hash <> p_code_hash then
    update public.user_devices d set code_attempts = d.code_attempts + 1 where d.id = v_row.id;
    return jsonb_build_object('state', case when v_row.code_attempts + 1 >= 5 then 'too_many' else 'wrong' end,
                              'attempts_left', greatest(0, 5 - (v_row.code_attempts + 1)));
  end if;

  -- The right code. Room is checked again: another device may have been
  -- verified meanwhile.
  select coalesce(s.device_limit, 2) into v_limit from public.library_monitor_settings s where s.id;
  v_limit := coalesce(v_limit, 2);
  select pg_catalog.count(*)::int into v_verified from public.user_devices d
   where d.user_id = p_user and d.revoked_at is null and d.verified_at is not null;
  if v_verified >= v_limit then
    return jsonb_build_object('state', 'full');
  end if;

  if p_session is not null then
    delete from auth.sessions s where s.user_id = p_user and s.id <> p_session;
    get diagnostics v_ended = row_count;
    delete from auth.refresh_tokens t where t.user_id = p_user::text and t.session_id is null;
  end if;
  update public.user_devices d
     set verified_at = now(), opened_at = now(), last_seen = now(), session_id = p_session,
         code_hash = null, code_expires_at = null, code_attempts = 0
   where d.id = v_row.id;
  return jsonb_build_object('state', 'verified', 'device_id', v_row.id, 'sessions_ended', v_ended);
end;
$$;

comment on function public.library_device_code_verify(uuid, text, text, uuid) is
  'Owner ٤٠ (20261127_60): checks the e-mail code of a pending library device (5 attempts); on success verifies and opens it and ends every other session of the account. Service role only.';

revoke all on function public.library_device_code_issue(uuid, text, text) from public, anon, authenticated;
revoke all on function public.library_device_code_verify(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.library_device_code_issue(uuid, text, text) to service_role;
grant execute on function public.library_device_code_verify(uuid, text, text, uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- verify
-- ═════════════════════════════════════════════════════════════════════════════
do $verify$
declare
  f text;
begin
  foreach f in array array[
    'public.community_verified_office_users(uuid[])',
    'public.account_freeze_open(uuid,uuid,text)',
    'public.account_freeze_lift(uuid,uuid)',
    'public.library_device_gate(uuid,text,text,uuid,boolean)',
    'public.library_device_code_issue(uuid,text,text)',
    'public.library_device_code_verify(uuid,text,text,uuid)'] loop
    if to_regprocedure(f) is null then
      raise exception 'l7_community verify: % is missing', f;
    end if;
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""']
                       from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)), false) then
      raise exception 'l7_community verify: % is not SECURITY DEFINER with an empty search_path', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'l7_community verify: anon / authenticated can execute %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'l7_community verify: service_role cannot execute %', f;
    end if;
  end loop;

  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.community_posts'::regclass and tgname = 'trg_community_posts_review' and not tgisinternal)
     or not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.community_answers'::regclass and tgname = 'trg_community_answers_review' and not tgisinternal) then
    raise exception 'l7_community verify: a community review trigger is missing';
  end if;
  if pg_catalog.pg_get_constraintdef((select c.oid from pg_catalog.pg_constraint c
        where c.conrelid = 'public.community_posts'::regclass and c.conname = 'community_posts_status_check')) not like '%pending_review%'
     or pg_catalog.pg_get_constraintdef((select c.oid from pg_catalog.pg_constraint c
        where c.conrelid = 'public.community_answers'::regclass and c.conname = 'community_answers_status_check')) not like '%pending_review%' then
    raise exception 'l7_community verify: a status CHECK does not allow pending_review';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_posts'
                  and policyname = 'anyone reads public community posts' and qual ilike '%pending_review%'
                  and qual ilike '%community_is_verified_lawyer%')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_answers'
                  and policyname = 'anyone reads active community answers' and qual ilike '%pending_review%'
                  and qual ilike '%community_post_readable%') then
    raise exception 'l7_community verify: a community read policy lacks the author''s review arm';
  end if;
  if pg_catalog.pg_get_functiondef('public.community_post_readable(uuid)'::regprocedure) ilike '%pending_review%' then
    raise exception 'l7_community verify: community_post_readable must not open posts under review';
  end if;
  if not exists (select 1 from public.platform_settings where key = 'community_prepublish_review') then
    raise exception 'l7_community verify: the community_prepublish_review setting row is missing';
  end if;
  if not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = 'public.account_suspension_freezes'::regclass), false)
     or has_table_privilege('authenticated', 'public.account_suspension_freezes', 'SELECT')
     or has_table_privilege('anon', 'public.account_suspension_freezes', 'SELECT') then
    raise exception 'l7_community verify: account_suspension_freezes is readable by a user role';
  end if;
  if has_column_privilege('authenticated', 'public.user_devices', 'code_hash', 'SELECT')
     or has_column_privilege('authenticated', 'public.user_devices', 'device_hash', 'SELECT')
     or has_column_privilege('authenticated', 'public.user_devices', 'session_id', 'SELECT') then
    raise exception 'l7_community verify: a user can read a device hash, code hash or session id';
  end if;
  raise notice 'l7_community verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select 'l7_community 20261127_60: community review before publishing + freeze-not-cancel + library device codes' as step,
       to_regprocedure('public.library_device_gate(uuid,text,text,uuid,boolean)') is not null
       and to_regprocedure('public.account_freeze_lift(uuid,uuid)') is not null
       and to_regprocedure('public.community_verified_office_users(uuid[])') is not null
       and exists (select 1 from pg_catalog.pg_trigger where tgname = 'trg_community_posts_review' and not tgisinternal)
       and exists (select 1 from public.platform_settings where key = 'community_prepublish_review')
       and not has_function_privilege('authenticated', 'public.account_freeze_open(uuid,uuid,text)', 'EXECUTE')
       as ok;
