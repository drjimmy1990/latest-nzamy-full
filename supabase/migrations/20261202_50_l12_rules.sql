-- =============================================================================
-- Migration: 20261202_50_l12_rules.sql   (verify id: l12_rules)
-- =============================================================================
-- PURPOSE (batch l12, builder «rules»; the owner's answers of 20 Nov 2026)
--
--   Q94a — a per-account library EXCEPTION ends with the subscription.
--     public.library_access_user_overrides gains
--       expires_at              timestamptz NULL  the exception stops at this
--                                                  moment (an admin's date)
--       ends_with_subscription  boolean           the exception holds while the
--                                                  account has an active library
--                                                  grant (a library plan, the
--                                                  founder, a trial…), so it
--                                                  follows renewals and stops
--                                                  when the last one ends
--     An exception with neither is permanent (a team member: unchanged). With
--     either, it is in force while expires_at is ahead OR (when
--     ends_with_subscription) a library grant covers now. Out of force it is
--     ignored: the type's switch answers again. created_by / updated_by /
--     reason stay the log (the admin route audits every change).
--     public.library_access_for(p_user) is RE-CREATED from its latest body
--     (20261128_20 §3) with that one change.
--
--   Q100a — the NON-SUBSCRIBER LIST CAP (owner: «تصفح القوائم … 30 عنصراً
--     يومياً و100 أسبوعياً»), SHIPPED OFF like the l11 view cap (question ١٥٨:
--     the owner sees the search-visibility evidence first).
--     public.library_monitor_settings gains
--       non_subscriber_list_limit_enabled          false
--       non_subscriber_list_daily_limit            30   (the owner's number)
--       non_subscriber_list_weekly_limit           100  (his assistant's default)
--       non_subscriber_list_address_daily_limit    150  (chosen here: an address
--       non_subscriber_list_address_weekly_limit   500   is shared by an office)
--     public.library_public_list_items (subject, Riyadh day, item): the
--       distinct catalogue / search items each subject was served (subjects as
--       in 20261201_30: 'u:<user id>', 's:<session hash>', 'a:<address hash>').
--       Kept 8 days. Only ALLOWED items are stored, so a subject never holds
--       more rows than its weekly number.
--     public.library_public_list_daily (day): refused requests / items.
--     public.library_public_list_hit(subjects, items) → which of the items
--       may be served: an item already served to the subject today is free; a
--       new one counts once a day and once a week; items are allowed in the
--       order given until any subject reaches its daily or weekly number.
--       'off' (writes nothing) while the switch is off.
--     public.library_public_list_stats(days) — the admin page's figures.
--
--   Q121 — which tool carries an account's free questions, as a SETTING:
--     platform_settings 'free_question_tool_by_account_type'
--       {"individual": "quick-answer"}  (today's tool, kept until the owner
--       answers journal question 7; 'assistant' is the other value allowed)
--     every other account type: the library assistant (unchanged).
--     public.ai_free_question_tool(p_user) — that rule, in one place.
--     public.ai_free_question_status / ai_start_free_question RE-CREATED from
--       their latest bodies (20261129_60) reading it; ai_start_free_question
--       also accepts 'assistant'. The library-open rule still applies only
--       when the account's free tool is the library assistant.
--
--   Q96 — only REVIEWED summaries are shown, as a SETTING:
--     platform_settings 'library_summaries_reviewed_only' {"on": true}
--       (the owner's rule «يُخفى كل موجز حالته غير مراجَع»; switch it off to
--       show today's summaries again). The app applies it in the library API
--       (laws reader, /laws cards, decrees, search).
--     library.decrees_circulars gains summary_status ('draft' | 'reviewed' |
--       NULL): the decree tables had no status, so with the setting on a
--       decree summary is shown only once its status is 'reviewed'. No grant
--       to anon / authenticated (the column is server-only).
--
-- WHO CAN DO WHAT
--   Every new function: SECURITY DEFINER, search_path '', EXECUTE for
--   service_role only. New tables: RLS on, no policy, service role only.
--
-- HOW TO RUN (file on the server at its repo path):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261202_50_l12_rules.sql
--   Expect: NOTICE  l12_rules verify: OK  and a row with `t`.
--
-- RUN ORDER: after 20261201_30 (the view cap's settings row) and 20261129_60
--   (free questions). Before or after the deploy:
--   * code first: every new column / function / setting is read fail-open —
--     an exception with an end date is honoured by the app's own rule only
--     when library_access_for is missing (it is not on prod), so until this
--     file runs every exception stays permanent as today; the list cap stays
--     off; the free-question tool is the default (individual: quick-answer);
--     the reviewed-only rule reads its default (ON) from the app.
--   * SQL first with the old code: nothing visible changes (the old code
--     reads none of the new columns or settings; the old free-question code
--     asks only for the default tools, which the new functions still accept).
--   RE-RUN HAZARD: re-running 20261128_20 or 20261129_60 after this file
--   brings back their library_access_for / free-question functions (no
--   expiry, fixed tools). Re-run this file after them; the verify block
--   names the function that went back. This file itself is safe to re-run.
--
-- ROLLBACK (one transaction):
--   1. re-run §3 of 20261128_20 (library_access_for) and §1–2 of 20261129_60;
--   2. drop function if exists public.library_public_list_hit(text[], text[]),
--      public.library_public_list_stats(int), public.ai_free_question_tool(uuid);
--      drop table if exists public.library_public_list_items, public.library_public_list_daily;
--   3. alter table public.library_monitor_settings drop constraint if exists library_monitor_settings_l12_list_check,
--        drop column if exists non_subscriber_list_limit_enabled, … (the five list columns);
--      alter table public.library_access_user_overrides drop column if exists expires_at,
--        drop column if exists ends_with_subscription;
--      alter table library.decrees_circulars drop column if exists summary_status;
--   4. delete from public.platform_settings where key in
--        ('free_question_tool_by_account_type', 'library_summaries_reviewed_only');
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261202_50: public.platform_settings is missing';
  end if;
  if to_regclass('public.library_access_user_overrides') is null
     or to_regprocedure('public.library_access_for(uuid)') is null then
    raise exception '20261202_50: run 20261128_20_library_access_by_account_type.sql first';
  end if;
  if to_regclass('public.library_access_grants') is null then
    raise exception '20261202_50: run 20261019_10_library_access_grants.sql first';
  end if;
  if to_regclass('public.library_monitor_settings') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.library_monitor_settings'::regclass
                       and attname = 'non_subscriber_view_limit_enabled' and not attisdropped) then
    raise exception '20261202_50: run 20261201_30_library_scrape_guard.sql first';
  end if;
  if to_regprocedure('public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)') is null
     or to_regprocedure('public.ai_free_question_status(uuid)') is null then
    raise exception '20261202_50: run 20261129_60_free_questions_general_assistant.sql first';
  end if;
end $$;

-- ── 1. Q94a: an exception that ends ──────────────────────────────────────────
alter table public.library_access_user_overrides add column if not exists expires_at timestamptz;
alter table public.library_access_user_overrides add column if not exists ends_with_subscription boolean not null default false;

comment on column public.library_access_user_overrides.expires_at is
  'Q94a (20261202_50): the exception stops at this moment; NULL = no date. See ends_with_subscription.';
comment on column public.library_access_user_overrides.ends_with_subscription is
  'Q94a (20261202_50): the exception holds while the account has an active library grant (library_access_grants covering now); it ends with the subscription. With neither this nor expires_at the exception is permanent.';

create or replace function public.library_access_for(p_user uuid)
returns table (allowed boolean, account_key text, via text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type     text;
  v_kind     text;
  v_key      text;
  v_override boolean;
  v_expires  timestamptz;
  v_with_sub boolean;
  v_map      jsonb;
begin
  if p_user is null then
    raise exception 'library_access_for: p_user is required' using errcode = '22023';
  end if;

  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type is null then
    return query select false, null::text, 'no_profile'::text;
    return;
  end if;
  if v_type = 'admin' then
    return query select true, 'admin'::text, 'admin'::text;
    return;
  end if;

  if v_type = 'lawyer' then
    select lp.practice_kind into v_kind from public.lawyer_profiles lp where lp.user_id = p_user;
  end if;
  v_key := case
    when v_type = 'lawyer' then case when v_kind = 'consultant' then 'consultant' else 'lawyer' end
    when v_type in ('firm', 'individual', 'provider') then v_type
    when v_type in ('corporate', 'micro', 'government', 'ngo') then 'business'
    else null end;

  select o.allowed, o.expires_at, o.ends_with_subscription
    into v_override, v_expires, v_with_sub
    from public.library_access_user_overrides o where o.user_id = p_user;
  -- l12_rules (Q94a): an exception with an end is in force only while its
  -- date is ahead or, when it ends with the subscription, while a library
  -- grant covers now. Out of force it is ignored (the type's switch answers).
  if v_override is not null and (
       (v_expires is null and not coalesce(v_with_sub, false))
       or (v_expires is not null and v_expires > now())
       or (coalesce(v_with_sub, false) and exists (
             select 1 from public.library_access_grants g
              where g.user_id = p_user and g.starts_at <= now() and g.ends_at > now()))) then
    return query select v_override, v_key, 'override'::text;
    return;
  end if;

  if v_key is null then
    return query select false, null::text, 'type'::text;
    return;
  end if;

  select ps.value into v_map from public.platform_settings ps where ps.key = 'library_access_by_account_type';
  return query select
    case when jsonb_typeof(v_map -> v_key) = 'boolean' then (v_map ->> v_key)::boolean
         else v_key = 'lawyer' end,
    v_key, 'type'::text;
end;
$$;

comment on function public.library_access_for(uuid) is
  'Owner item 9 (20261128_20) + Q94a (20261202_50, l12_rules): may this account use the legal library? admin → open; a library_access_user_overrides row IN FORCE (no end, or expires_at ahead, or ends_with_subscription with a library grant covering now) → its allowed; else platform_settings.library_access_by_account_type by account key; a missing key → open for lawyer only. Service role only.';

revoke all on function public.library_access_for(uuid) from public, anon, authenticated;
grant execute on function public.library_access_for(uuid) to service_role;

-- ── 2. Q100a: the list cap (OFF) ─────────────────────────────────────────────
alter table public.library_monitor_settings add column if not exists non_subscriber_list_limit_enabled boolean not null default false;
alter table public.library_monitor_settings add column if not exists non_subscriber_list_daily_limit int not null default 30;
alter table public.library_monitor_settings add column if not exists non_subscriber_list_weekly_limit int not null default 100;
alter table public.library_monitor_settings add column if not exists non_subscriber_list_address_daily_limit int not null default 150;
alter table public.library_monitor_settings add column if not exists non_subscriber_list_address_weekly_limit int not null default 500;

alter table public.library_monitor_settings drop constraint if exists library_monitor_settings_l12_list_check;
alter table public.library_monitor_settings add constraint library_monitor_settings_l12_list_check check (
      non_subscriber_list_daily_limit between 1 and 100000
  and non_subscriber_list_weekly_limit between 1 and 1000000
  and non_subscriber_list_address_daily_limit between 1 and 1000000
  and non_subscriber_list_address_weekly_limit between 1 and 10000000);

comment on column public.library_monitor_settings.non_subscriber_list_limit_enabled is
  'Q100a (20261202_50): the non-subscriber LIST cap (catalogue and search items). OFF until the owner approves the search-visibility evidence (question ١٥٨).';
comment on column public.library_monitor_settings.non_subscriber_list_daily_limit is
  'Q100a: distinct list items a non-subscriber (account or guest session) is served per Riyadh day (30, the owner''s number).';
comment on column public.library_monitor_settings.non_subscriber_list_weekly_limit is
  'Q100a: distinct list items a non-subscriber is served over the last 7 Riyadh days (100).';
comment on column public.library_monitor_settings.non_subscriber_list_address_daily_limit is
  'Q100a: distinct list items per Riyadh day from one guest address (hashed); larger, an address is shared.';
comment on column public.library_monitor_settings.non_subscriber_list_address_weekly_limit is
  'Q100a: distinct list items over 7 Riyadh days from one guest address (hashed).';

create table if not exists public.library_public_list_items (
  subject  text not null constraint library_public_list_items_subject_check check (subject ~ '^[usa]:[A-Za-z0-9_-]{1,120}$'),
  day      date not null,
  item_key text not null constraint library_public_list_items_item_check check (length(item_key) between 1 and 300),
  first_at timestamptz not null default now(),
  constraint library_public_list_items_pkey primary key (subject, day, item_key)
);
create index if not exists library_public_list_items_day on public.library_public_list_items (day);

comment on table public.library_public_list_items is
  'Q100a (20261202_50): the distinct catalogue / search items served to each non-subscriber subject per Riyadh day (allowed items only). Subjects are hashed by the app except the user id. Kept 8 days. Service role only.';

alter table public.library_public_list_items enable row level security;
revoke all on public.library_public_list_items from public, anon, authenticated;
grant all on public.library_public_list_items to service_role;

create table if not exists public.library_public_list_daily (
  day              date primary key,
  refused_requests int not null default 0,
  refused_items    bigint not null default 0
);

comment on table public.library_public_list_daily is
  'Q100a (20261202_50): per Riyadh day, the list requests that were cut by the list cap and the items held back. Kept 30 days. Service role only.';

alter table public.library_public_list_daily enable row level security;
revoke all on public.library_public_list_daily from public, anon, authenticated;
grant all on public.library_public_list_daily to service_role;

create or replace function public.library_public_list_hit(p_subjects text[], p_items text[])
returns table (status text, allowed text[], used_day int, used_week int, day_limit int, week_limit int,
               subject text, cap_window text, resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s          public.library_monitor_settings;
  v_day      date := (now() at time zone 'Asia/Riyadh')::date;
  v_resets   timestamptz := (((now() at time zone 'Asia/Riyadh')::date + 1)::timestamp at time zone 'Asia/Riyadh');
  v_subjects text[];
  v_n        int;
  v_i        int;
  v_dl       int[] := '{}';
  v_wl       int[] := '{}';
  v_ud       int[] := '{}';
  v_uw       int[] := '{}';
  v_today    text[];   -- '<slot>|<item>' already served today
  v_week     text[];   -- '<slot>|<item>' already served in the last 7 days
  v_item     text;
  v_new_d    boolean;
  v_new_w    boolean;
  v_ok       boolean;
  v_allowed  text[] := '{}';
  v_cut      int := 0;
  v_bind     int;
  v_bind_win text;
  v_subj     text;
begin
  if p_subjects is null or cardinality(p_subjects) not between 1 and 3
     or p_items is null or cardinality(p_items) > 1000 then
    raise exception 'library_public_list_hit: invalid arguments' using errcode = '22023';
  end if;
  foreach v_subj in array p_subjects loop
    if v_subj is null or v_subj !~ '^[usa]:[A-Za-z0-9_-]{1,120}$' then
      raise exception 'library_public_list_hit: invalid subject' using errcode = '22023';
    end if;
  end loop;
  foreach v_item in array p_items loop
    if v_item is null or length(v_item) not between 1 and 300 then
      raise exception 'library_public_list_hit: invalid item' using errcode = '22023';
    end if;
  end loop;

  select * into s from public.library_monitor_settings ms where ms.id;
  if not found or not s.non_subscriber_list_limit_enabled then
    return query select 'off'::text, p_items, 0, 0, 0, 0, null::text, null::text, null::timestamptz;
    return;
  end if;

  select array_agg(x order by x) into v_subjects from (select distinct x from unnest(p_subjects) x) d;
  v_n := cardinality(v_subjects);
  foreach v_subj in array v_subjects loop
    perform pg_advisory_xact_lock(hashtextextended('library_public_list:' || v_subj, 0));
  end loop;

  -- Housekeeping (bounded, never waits).
  delete from public.library_public_list_items v
   using (select o.subject, o.day, o.item_key from public.library_public_list_items o
           where o.day < v_day - 8 limit 5000 for update skip locked) old
   where v.subject = old.subject and v.day = old.day and v.item_key = old.item_key;
  delete from public.library_public_list_daily d where d.day < v_day - 30;

  for v_i in 1 .. v_n loop
    v_dl := v_dl || case when split_part(v_subjects[v_i], ':', 1) = 'a'
                         then s.non_subscriber_list_address_daily_limit else s.non_subscriber_list_daily_limit end;
    v_wl := v_wl || case when split_part(v_subjects[v_i], ':', 1) = 'a'
                         then s.non_subscriber_list_address_weekly_limit else s.non_subscriber_list_weekly_limit end;
    v_ud := v_ud || (select count(*)::int from public.library_public_list_items v
                      where v.subject = v_subjects[v_i] and v.day = v_day);
    v_uw := v_uw || (select count(distinct v.item_key)::int from public.library_public_list_items v
                      where v.subject = v_subjects[v_i] and v.day > v_day - 7);
  end loop;
  select coalesce(array_agg(x.slot || '|' || v.item_key), '{}') into v_today
    from public.library_public_list_items v
    join (select i as slot, v_subjects[i] as subj from generate_series(1, v_n) i) x on x.subj = v.subject
   where v.day = v_day and v.item_key = any(p_items);
  select coalesce(array_agg(distinct x.slot || '|' || v.item_key), '{}') into v_week
    from public.library_public_list_items v
    join (select i as slot, v_subjects[i] as subj from generate_series(1, v_n) i) x on x.subj = v.subject
   where v.day > v_day - 7 and v.item_key = any(p_items);

  -- The items in the order given (a repeat is served with its first copy).
  for v_item in select t.item from unnest(p_items) with ordinality t(item, ord)
                 group by t.item order by min(t.ord) loop
    v_ok := true;
    for v_i in 1 .. v_n loop
      v_new_d := not ((v_i || '|' || v_item) = any(v_today));
      v_new_w := not ((v_i || '|' || v_item) = any(v_week));
      if (v_new_d and v_ud[v_i] + 1 > v_dl[v_i]) then
        v_ok := false;
        if v_bind is null then v_bind := v_i; v_bind_win := 'day'; end if;
      elsif (v_new_w and v_uw[v_i] + 1 > v_wl[v_i]) then
        v_ok := false;
        if v_bind is null then v_bind := v_i; v_bind_win := 'week'; end if;
      end if;
    end loop;
    if v_ok then
      v_allowed := v_allowed || v_item;
      for v_i in 1 .. v_n loop
        if not ((v_i || '|' || v_item) = any(v_today)) then v_ud[v_i] := v_ud[v_i] + 1; end if;
        if not ((v_i || '|' || v_item) = any(v_week)) then v_uw[v_i] := v_uw[v_i] + 1; end if;
      end loop;
    else
      v_cut := v_cut + 1;
    end if;
  end loop;

  if cardinality(v_allowed) > 0 then
    insert into public.library_public_list_items (subject, day, item_key)
    select su, v_day, it from unnest(v_subjects) su cross join unnest(v_allowed) it
    on conflict (subject, day, item_key) do nothing;
  end if;

  if v_cut > 0 then
    insert into public.library_public_list_daily as d (day, refused_requests, refused_items)
      values (v_day, 1, v_cut)
      on conflict (day) do update set refused_requests = d.refused_requests + 1,
                                      refused_items = d.refused_items + excluded.refused_items;
    return query select
      case when cardinality(v_allowed) = 0 then 'over' else 'partial' end,
      v_allowed, v_ud[v_bind], v_uw[v_bind], v_dl[v_bind], v_wl[v_bind], v_subjects[v_bind], v_bind_win,
      case when v_bind_win = 'day' then v_resets else null::timestamptz end;
    return;
  end if;

  return query select 'ok'::text, v_allowed, v_ud[1], v_uw[1], v_dl[1], v_wl[1], v_subjects[1], null::text, v_resets;
end;
$$;

comment on function public.library_public_list_hit(text[], text[]) is
  'Q100a (20261202_50, l12_rules): the non-subscriber list cap. off = the switch is off (nothing written, every item allowed); ok = every item allowed (and counted); partial / over = the items allowed (in the order given) and the subject and window (day / week) that stopped the rest. Numbers from library_monitor_settings only. Service role only.';

revoke all on function public.library_public_list_hit(text[], text[]) from public, anon, authenticated;
grant execute on function public.library_public_list_hit(text[], text[]) to service_role;

create or replace function public.library_public_list_stats(p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day  date := (now() at time zone 'Asia/Riyadh')::date;
  v_days int := least(greatest(coalesce(p_days, 7), 1), 8);
begin
  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(d.stats order by d.day desc) from (
        select v.day, jsonb_build_object(
          'day', v.day,
          'viewers', count(distinct v.subject) filter (where split_part(v.subject, ':', 1) in ('u', 's')),
          'items', count(*) filter (where split_part(v.subject, ':', 1) in ('u', 's')),
          'refusedRequests', coalesce((select r.refused_requests from public.library_public_list_daily r where r.day = v.day), 0),
          'refusedItems', coalesce((select r.refused_items from public.library_public_list_daily r where r.day = v.day), 0)) as stats
          from public.library_public_list_items v
         where v.day > v_day - v_days
         group by v.day) d), '[]'::jsonb));
end;
$$;

revoke all on function public.library_public_list_stats(int) from public, anon, authenticated;
grant execute on function public.library_public_list_stats(int) to service_role;

-- ── 3. Q121: the free-question tool, a setting ───────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('free_question_tool_by_account_type', '{"individual": "quick-answer"}'::jsonb,
   'الأداة التي تُستخدم فيها الأسئلة المجانية للفرد (quick-answer أو assistant)؛ بقية الأنواع على مساعد المكتبة — Q121 (20261202_50)')
on conflict (key) do nothing;

create or replace function public.ai_free_question_tool(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_tool text;
begin
  if p_user is null then
    raise exception 'ai_free_question_tool: p_user is required' using errcode = '22023';
  end if;
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type is distinct from 'individual' then
    return 'library-assistant';
  end if;
  select ps.value ->> 'individual' into v_tool from public.platform_settings ps
   where ps.key = 'free_question_tool_by_account_type' and jsonb_typeof(ps.value) = 'object';
  return case when v_tool in ('quick-answer', 'assistant') then v_tool else 'quick-answer' end;
end;
$$;

comment on function public.ai_free_question_tool(uuid) is
  'Q121 (20261202_50, l12_rules): the tool that carries this account''s free questions — an individual''s from platform_settings.free_question_tool_by_account_type (quick-answer | assistant; anything else: quick-answer), every other type the library assistant. Service role only.';

revoke all on function public.ai_free_question_tool(uuid) from public, anon, authenticated;
grant execute on function public.ai_free_question_tool(uuid) to service_role;

-- Copied from 20261129_60 §1 (its latest body); the library rule now asks
-- ai_free_question_tool instead of naming the individual.
create or replace function public.ai_free_question_status(p_user uuid)
returns table (allowance int, used int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type  text;
  v_set   jsonb;
  v_allow int;
begin
  if p_user is null then
    raise exception 'ai_free_question_status: p_user is required' using errcode = '22023';
  end if;
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  select ps.value into v_set from public.platform_settings ps where ps.key = 'free_questions_by_account_type';
  v_allow := case
    when v_type is null then 0
    when v_set is null then case v_type when 'lawyer' then 10 when 'individual' then 5 else 0 end
    when jsonb_typeof(v_set -> v_type) = 'number' then greatest(0, floor((v_set ->> v_type)::numeric))::int
    else 0 end;
  -- 20261128_20 (٥٨): only an e-mail-verified account. 20261129_60 +
  -- 20261202_50 (Q121): the library must be open for the account only when
  -- its free tool is the library assistant (public.ai_free_question_tool).
  if v_allow > 0 and (
       not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null)
       or (public.ai_free_question_tool(p_user) = 'library-assistant'
           and not coalesce((select a.allowed from public.library_access_for(p_user) a), false))) then
    v_allow := 0;
  end if;
  return query
    select v_allow,
           (select count(*)::int from public.ai_free_question_uses u
              join public.ai_runs r on r.id = u.run_id
             where u.user_id = p_user and r.status <> 'failed');
end;
$$;

comment on function public.ai_free_question_status(uuid) is
  'Owner ٣٠ (20261127_40) + ٥٨ (20261128_20) + register 4/36 (20261129_60) + Q121 (20261202_50): the account''s lifetime free questions — allowance from platform_settings.free_questions_by_account_type by profiles.user_type (no row: lawyer 10, individual 5), 0 unless the e-mail is verified and, when the account''s free tool (ai_free_question_tool) is the library assistant, library_access_for says the library is open; used = its free runs that did not fail. Service role only.';

revoke all on function public.ai_free_question_status(uuid) from public, anon, authenticated;
grant execute on function public.ai_free_question_status(uuid) to service_role;

-- Copied from 20261129_60 §2 (its latest body): 'assistant' accepted, and the
-- account's own tool comes from ai_free_question_tool.
create or replace function public.ai_start_free_question(
  p_user            uuid,
  p_tool            text,
  p_variant         text,
  p_class           text,
  p_price           int,
  p_daily_limit     int,
  p_idempotency_key text,
  p_deadline        timestamptz,
  p_exempt          boolean default false,
  p_input           jsonb default null,
  p_file_ids        text[] default '{}',
  p_pages           int default null,
  p_conversation    uuid default null,
  p_source_ids      jsonb default null)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_allow int;
  v_used  int;
  v_run   record;
begin
  -- 20261127_40: 'library-assistant'; 20261129_60: 'quick-answer';
  -- 20261202_50 (Q121): 'assistant' (an individual's tool when the setting says so).
  if p_user is null or p_tool is null or p_tool not in ('library-assistant', 'quick-answer', 'assistant')
     or p_idempotency_key is null then
    raise exception 'ai_start_free_question: invalid arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_start_run:' || p_user::text || ':' || p_tool, 0));

  -- A retried request: ai_start_run answers it as the duplicate it is.
  if exists (select 1 from public.ai_runs r where r.user_id = p_user and r.idempotency_key = p_idempotency_key) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, 0, p_daily_limit, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  -- Nothing is charged while points_enforcement is off, nor for an exempt
  -- caller: the question starts as a normal run and uses up NONE of the
  -- account's allowance.
  if not coalesce((select ps.value = 'true'::jsonb from public.platform_settings ps
                    where ps.key = 'points_enforcement'), false)
     or coalesce(p_exempt, false) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, p_price, p_daily_limit, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  -- The account's own free tool only (public.ai_free_question_tool). Another
  -- tool: not eligible, and the app charges the normal price.
  if p_tool is distinct from public.ai_free_question_tool(p_user) then
    raise exception 'free_question_not_eligible' using errcode = 'P0001';
  end if;

  -- The allowance and the count, under the start lock.
  select s.allowance, s.used into v_allow, v_used from public.ai_free_question_status(p_user) s;
  if coalesce(v_allow, 0) <= 0 then
    raise exception 'free_question_not_eligible' using errcode = 'P0001';
  end if;
  if v_used >= v_allow then
    raise exception 'free_question_used' using errcode = 'P0001',
      detail = format('used %s of %s', v_used, v_allow);
  end if;

  select * into v_run from public.ai_start_run(
    p_user, p_tool, p_variant, p_class, 0, p_daily_limit, p_idempotency_key, p_deadline,
    p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);

  if v_run.created then
    insert into public.ai_free_question_uses (run_id, user_id, tool)
      values (v_run.run_id, p_user, p_tool)
      on conflict on constraint ai_free_question_uses_pkey do nothing;
  end if;

  return query select v_run.run_id, v_run.created, v_run.status, v_run.charged, v_run.charged_points;
end;
$$;

comment on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) is
  'Owner ٣٠ (20261127_40) + register 4/36 (20261129_60) + Q121 (20261202_50): a free question from the account''s lifetime allowance on the account''s own tool (public.ai_free_question_tool: an individual''s from the setting, quick-answer by default; library-assistant for every other type). Under ai_start_run''s lock: duplicate key → ai_start_run''s duplicate; another tool or allowance 0 → P0001 free_question_not_eligible; allowance used → P0001 free_question_used; else ai_start_run at price 0 and one ai_free_question_uses row. Service role only.';

revoke all on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) to service_role;

-- ── 4. Q96: reviewed summaries only (a setting) ──────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('library_summaries_reviewed_only', '{"on": true}'::jsonb,
   'لا يظهر في المكتبة إلا الموجز الذي حالته «مراجَع» (القارئ والبطاقات والقرارات والبحث) — Q96 (20261202_50)')
on conflict (key) do nothing;

do $$
begin
  if to_regclass('library.decrees_circulars') is not null then
    alter table library.decrees_circulars add column if not exists summary_status text;
    if not exists (select 1 from pg_catalog.pg_constraint
                    where conrelid = 'library.decrees_circulars'::regclass
                      and conname = 'decrees_circulars_summary_status_check') then
      alter table library.decrees_circulars add constraint decrees_circulars_summary_status_check
        check (summary_status is null or summary_status in ('draft', 'reviewed'));
    end if;
    comment on column library.decrees_circulars.summary_status is
      'Q96 (20261202_50): the summary''s review status from the library agent''s frontmatter (draft | reviewed | NULL). With platform_settings.library_summaries_reviewed_only on, a decree summary is shown only when reviewed. Server-only (no session grant).';
  end if;
end $$;

-- ── 5. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  fn text;
  c  text;
begin
  foreach c in array array['expires_at', 'ends_with_subscription'] loop
    if not exists (select 1 from pg_catalog.pg_attribute
                    where attrelid = 'public.library_access_user_overrides'::regclass and attname = c and not attisdropped) then
      raise exception 'l12_rules verify: library_access_user_overrides.% missing', c;
    end if;
  end loop;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.library_access_for(uuid)'::regprocedure), 'ends_with_subscription') = 0 then
    raise exception 'l12_rules verify: library_access_for has no end rule (20261128_20 re-run after this file?)';
  end if;
  foreach c in array array['non_subscriber_list_limit_enabled', 'non_subscriber_list_daily_limit', 'non_subscriber_list_weekly_limit',
                           'non_subscriber_list_address_daily_limit', 'non_subscriber_list_address_weekly_limit'] loop
    if not exists (select 1 from pg_catalog.pg_attribute
                    where attrelid = 'public.library_monitor_settings'::regclass and attname = c and not attisdropped) then
      raise exception 'l12_rules verify: library_monitor_settings.% missing', c;
    end if;
  end loop;
  foreach c in array array['public.library_public_list_items', 'public.library_public_list_daily'] loop
    if not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass(c)), false) then
      raise exception 'l12_rules verify: % is missing or has RLS off', c;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and (has_table_privilege('authenticated', c, 'SELECT') or has_table_privilege('anon', c, 'SELECT')) then
      raise exception 'l12_rules verify: a session role can read %', c;
    end if;
  end loop;
  foreach fn in array array[
    'public.library_access_for(uuid)',
    'public.library_public_list_hit(text[],text[])',
    'public.library_public_list_stats(int)',
    'public.ai_free_question_tool(uuid)',
    'public.ai_free_question_status(uuid)',
    'public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'] loop
    if not exists (select 1 from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)
                    and p.prosecdef and p.proconfig @> array['search_path=""']) then
      raise exception 'l12_rules verify: % is missing or not SECURITY DEFINER with search_path ''''', fn;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and (has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')) then
      raise exception 'l12_rules verify: a session role can EXECUTE %', fn;
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ai_start_free_question') <> 1 then
    raise exception 'l12_rules verify: ai_start_free_question must have exactly one overload';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'::regprocedure), 'ai_free_question_tool') = 0
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_free_question_status(uuid)'::regprocedure), 'ai_free_question_tool') = 0 then
    raise exception 'l12_rules verify: the free-question functions are not the 20261202_50 version (20261129_60 re-run after this file?)';
  end if;
  if not exists (select 1 from public.platform_settings where key = 'free_question_tool_by_account_type')
     or not exists (select 1 from public.platform_settings where key = 'library_summaries_reviewed_only') then
    raise exception 'l12_rules verify: a setting row is missing';
  end if;
  if to_regclass('library.decrees_circulars') is not null
     and not exists (select 1 from pg_catalog.pg_attribute
                      where attrelid = to_regclass('library.decrees_circulars') and attname = 'summary_status' and not attisdropped) then
    raise exception 'l12_rules verify: library.decrees_circulars.summary_status missing';
  end if;
  raise notice 'l12_rules verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261202_50 l12 rules: exception end (Q94a), list cap OFF (Q100a), free-question tool setting (Q121), reviewed summaries only (Q96)' as migration,
       (pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.library_access_for(uuid)'::regprocedure), 'ends_with_subscription') > 0
        and to_regprocedure('public.library_public_list_hit(text[],text[])') is not null
        and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_free_question_status(uuid)'::regprocedure), 'ai_free_question_tool') > 0
        and exists (select 1 from public.platform_settings where key = 'library_summaries_reviewed_only')) as ok;
