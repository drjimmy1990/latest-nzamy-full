-- =============================================================================
-- Migration: 20261201_30_library_scrape_guard.sql   (verify id: l11_scrape)
-- =============================================================================
-- PURPOSE (batch l11, owner-free; owner register 14 items 48(4), 52, 53, 56,
-- 60, 64, 67; spec 16.13; gap ids O18 / A16 and O19 / R67)
--
--   O18 — the NON-SUBSCRIBER DAILY VIEW CAP, shipped OFF.
--     public.library_monitor_settings gains (the one admin-edited row; no cap
--     is hard-coded anywhere):
--       non_subscriber_view_limit_enabled   false  (the owner's switch; the
--                                                   admin page refuses ON
--                                                   without the evidence
--                                                   confirmation, G45)
--       non_subscriber_daily_view_limit     5      (register 52)
--       non_subscriber_address_daily_limit  20     (chosen here: one address
--                                                   is shared by an office or
--                                                   a mobile network)
--       crawler_view_limits   jsonb  per verified crawler {on, daily}
--                                    (Amazonbot off: on probation, register 64)
--       agent_view_limits     jsonb  per visitor agent (ChatGPT-User,
--                                    Claude-User, Perplexity-User) a daily number
--     public.library_public_views   (subject, Riyadh day, document): the
--       distinct documents each subject opened — subjects are 'u:<user id>',
--       's:<session hash>', 'a:<address hash>', 'c:<crawler>', 'p:<agent>'
--       (addresses and sessions arrive already HMAC-hashed by the app). Kept
--       8 days (the admin page's week).
--     public.library_crawler_daily  per day and claimed crawler: proven /
--       not proven / refused counts (the admin page).
--     public.library_public_view_hit(doc, subjects, crawler, verified)
--       'off' while the switch is off (writes nothing); else counts the
--       document for every subject, or answers 'over' when ANY subject is at
--       its number (the numbers come from the row, never from the caller).
--       Re-opening a document already opened today is free.
--     public.library_public_view_stats(days)  the admin page's figures.
--
--   O19 — SEQUENTIAL and PARALLEL reading alerts (R67: for every account,
--     admins and test accounts included).
--     library_monitor_settings gains rule_sequence_on / _docs / _gap_seconds,
--       rule_parallel_on / _sessions / _minutes and alert_emails (staff
--       addresses; empty by default — this repository is public).
--     public.library_read_sessions  (user, session hash): last seen; the app
--       writes it after an allowed full-text open (library_read_session_seen).
--     library_review_flags.rule accepts 'sequential' and 'parallel';
--       library_review_flags gains emailed_at, and
--       public.library_review_flags_claim_email(max_age_hours, limit) claims
--       the flags not yet e-mailed (one claim per flag across processes).
--     public.library_monitor_evaluate — RE-CREATED from its latest body
--       (20261103_10 §3) with three changes: no admin exemption (R67), the
--       'sequential' rule (N distinct full-text documents in a row, each
--       opened within S seconds of the previous one; full_text_reads), and the
--       'parallel' rule (N library sessions of one account seen within M
--       minutes; library_read_sessions).
--
-- ORDER: after 20261129_40 (full_text_reads). Before or after the deploy:
--   the code reads every new column / function fail-open (the cap stays off,
--   no alert e-mail) until this file runs. Safe to re-run. A re-run of
--   20261103_10 after this file would bring back the admin exemption and drop
--   the two rules: the verify block below detects it (marker «l11_scrape»).
-- GRANTS: service role only. No anon / authenticated privilege anywhere.
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.library_monitor_settings') is null
     or to_regclass('public.library_review_flags') is null
     or to_regclass('public.library_activity_hourly') is null
     or to_regclass('public.library_read_quota_docs') is null
     or to_regprocedure('public.library_monitor_evaluate(uuid)') is null
     or to_regprocedure('public.library_quota_limits(uuid,int,int,int,int)') is null
     or to_regprocedure('public.library_monitor_notify_admins(text,text,text)') is null then
    raise exception '20261201_30: run 20261031_10 and 20261103_10 first';
  end if;
  if to_regclass('public.full_text_reads') is null then
    raise exception '20261201_30: run 20261129_40_library_read_log.sql first';
  end if;
end $$;

-- ── 1. the settings (one row) ────────────────────────────────────────────────
alter table public.library_monitor_settings add column if not exists non_subscriber_view_limit_enabled boolean not null default false;
alter table public.library_monitor_settings add column if not exists non_subscriber_daily_view_limit int not null default 5;
alter table public.library_monitor_settings add column if not exists non_subscriber_address_daily_limit int not null default 20;
alter table public.library_monitor_settings add column if not exists crawler_view_limits jsonb not null default
  '{"googlebot":{"on":true,"daily":5000},"bingbot":{"on":true,"daily":5000},"applebot":{"on":true,"daily":2000},"oai-searchbot":{"on":true,"daily":2000},"claude-searchbot":{"on":true,"daily":2000},"perplexitybot":{"on":true,"daily":2000},"amazonbot":{"on":false,"daily":200}}'::jsonb;
alter table public.library_monitor_settings add column if not exists agent_view_limits jsonb not null default
  '{"chatgpt-user":100,"claude-user":100,"perplexity-user":100}'::jsonb;
alter table public.library_monitor_settings add column if not exists rule_sequence_on boolean not null default true;
alter table public.library_monitor_settings add column if not exists rule_sequence_docs int not null default 20;
alter table public.library_monitor_settings add column if not exists rule_sequence_gap_seconds int not null default 20;
alter table public.library_monitor_settings add column if not exists rule_parallel_on boolean not null default true;
alter table public.library_monitor_settings add column if not exists rule_parallel_sessions int not null default 3;
alter table public.library_monitor_settings add column if not exists rule_parallel_minutes int not null default 10;
alter table public.library_monitor_settings add column if not exists alert_emails text[] not null default '{}';

alter table public.library_monitor_settings drop constraint if exists library_monitor_settings_l11_scrape_check;
alter table public.library_monitor_settings add constraint library_monitor_settings_l11_scrape_check check (
      non_subscriber_daily_view_limit between 1 and 1000
  and non_subscriber_address_daily_limit between 1 and 100000
  and jsonb_typeof(crawler_view_limits) = 'object'
  and jsonb_typeof(agent_view_limits) = 'object'
  and rule_sequence_docs between 3 and 100000
  and rule_sequence_gap_seconds between 1 and 3600
  and rule_parallel_sessions between 2 and 1000
  and rule_parallel_minutes between 1 and 1440
  and cardinality(alert_emails) <= 10);

comment on column public.library_monitor_settings.non_subscriber_view_limit_enabled is
  'Owner register 14 items 52/53 (20261201_30): the non-subscriber daily view cap. OFF until the owner approves the evidence that it does not hurt search visibility.';
comment on column public.library_monitor_settings.non_subscriber_daily_view_limit is
  'Register 52: distinct documents a non-subscriber (signed-in account or guest session) may open through the document routes per Riyadh day (5).';
comment on column public.library_monitor_settings.non_subscriber_address_daily_limit is
  'Distinct documents per Riyadh day from one guest address (hashed); larger than the per-viewer number because an address can be shared (20261201_30).';
comment on column public.library_monitor_settings.crawler_view_limits is
  'Per verified crawler of the closed list (register 60/64): {"on": exempt from the visitor number when proven by reverse DNS or published ranges, "daily": its own distinct-document number}.';
comment on column public.library_monitor_settings.agent_view_limits is
  'Register 60: ChatGPT-User / Claude-User / Perplexity-User are visitors; on top of the visitor numbers each provider shares this daily distinct-document number.';
comment on column public.library_monitor_settings.alert_emails is
  'Staff addresses that receive the e-mail for an account put under review (R67, 20261201_30). Empty = in-site bell only.';

-- ── 2. the per-subject document log ──────────────────────────────────────────
create table if not exists public.library_public_views (
  subject  text not null constraint library_public_views_subject_check check (subject ~ '^[usacp]:[A-Za-z0-9_-]{1,120}$'),
  day      date not null,
  doc_key  text not null constraint library_public_views_doc_key_check check (length(doc_key) between 1 and 300),
  allowed  boolean not null,
  first_at timestamptz not null default now(),
  constraint library_public_views_pkey primary key (subject, day, doc_key)
);
create index if not exists library_public_views_day on public.library_public_views (day);

comment on table public.library_public_views is
  'Non-subscriber daily view cap (20261201_30): one row per subject, Riyadh day and document (allowed or refused). Subjects are hashed by the app except the user id. Kept 8 days. Service role only.';

alter table public.library_public_views enable row level security;
revoke all on public.library_public_views from public, anon, authenticated;
grant all on public.library_public_views to service_role;

create table if not exists public.library_crawler_daily (
  day          date not null,
  provider     text not null constraint library_crawler_daily_provider_check check (provider ~ '^[a-z0-9-]{1,40}$'),
  verified     int not null default 0,
  not_verified int not null default 0,
  refused      int not null default 0,
  constraint library_crawler_daily_pkey primary key (day, provider)
);

comment on table public.library_crawler_daily is
  'Document opens per day by requests claiming a crawler of the closed list while the cap is on: proven (reverse DNS / published ranges), not proven, refused (20261201_30). Service role only.';

alter table public.library_crawler_daily enable row level security;
revoke all on public.library_crawler_daily from public, anon, authenticated;
grant all on public.library_crawler_daily to service_role;

-- ── 3. library_public_view_hit ───────────────────────────────────────────────
create or replace function public.library_public_view_hit(
  p_doc_key          text,
  p_subjects         text[],
  p_crawler          text default null,
  p_crawler_verified boolean default null)
returns table (status text, used int, day_limit int, subject text, resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s         public.library_monitor_settings;
  v_day     date := (now() at time zone 'Asia/Riyadh')::date;
  v_resets  timestamptz := (((now() at time zone 'Asia/Riyadh')::date + 1)::timestamp at time zone 'Asia/Riyadh');
  v_subj    text;
  v_kind    text;
  v_name    text;
  v_limit   int;
  v_used    int;
  v_first   text;
  v_first_used  int := 0;
  v_first_limit int := 0;
  v_crawler text := case when p_crawler ~ '^[a-z0-9-]{1,40}$' then p_crawler end;
begin
  if p_doc_key is null or length(p_doc_key) not between 1 and 300
     or p_subjects is null or cardinality(p_subjects) not between 1 and 4 then
    raise exception 'library_public_view_hit: invalid arguments' using errcode = '22023';
  end if;
  foreach v_subj in array p_subjects loop
    if v_subj is null or v_subj !~ '^[usacp]:[A-Za-z0-9_-]{1,120}$' then
      raise exception 'library_public_view_hit: invalid subject' using errcode = '22023';
    end if;
  end loop;

  select * into s from public.library_monitor_settings ms where ms.id;
  if not found or not s.non_subscriber_view_limit_enabled then
    return query select 'off'::text, 0, 0, null::text, null::timestamptz;
    return;
  end if;

  -- Every subject's lock, in a fixed order (two opens sharing an address
  -- never wait on each other the other way round).
  for v_subj in select distinct x from unnest(p_subjects) x order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('library_public_view:' || v_subj, 0));
  end loop;

  if v_crawler is not null then
    insert into public.library_crawler_daily as c (day, provider, verified, not_verified)
      values (v_day, v_crawler, case when p_crawler_verified then 1 else 0 end,
              case when coalesce(p_crawler_verified, false) then 0 else 1 end)
      on conflict (day, provider) do update
        set verified = c.verified + excluded.verified, not_verified = c.not_verified + excluded.not_verified;
  end if;

  -- Housekeeping: days past the admin page's week (bounded, never waits).
  delete from public.library_public_views v
   using (select o.subject, o.day, o.doc_key from public.library_public_views o
           where o.day < v_day - 7 limit 2000 for update skip locked) old
   where v.subject = old.subject and v.day = old.day and v.doc_key = old.doc_key;
  delete from public.library_crawler_daily c where c.day < v_day - 30;

  v_first := p_subjects[1];

  -- A document already opened today is free to re-open.
  if exists (select 1 from public.library_public_views v
              where v.subject = v_first and v.day = v_day and v.doc_key = p_doc_key and v.allowed) then
    select count(*)::int into v_used from public.library_public_views v
     where v.subject = v_first and v.day = v_day and v.allowed;
    return query select 'ok'::text, v_used, 0, v_first, v_resets;
    return;
  end if;

  foreach v_subj in array p_subjects loop
    v_kind := split_part(v_subj, ':', 1);
    v_name := split_part(v_subj, ':', 2);
    v_limit := case v_kind
      when 'a' then s.non_subscriber_address_daily_limit
      when 'c' then case when jsonb_typeof(s.crawler_view_limits -> v_name -> 'daily') = 'number'
                         then least(greatest((s.crawler_view_limits -> v_name ->> 'daily')::numeric, 1), 1000000)::int
                         else s.non_subscriber_daily_view_limit end
      when 'p' then case when jsonb_typeof(s.agent_view_limits -> v_name) = 'number'
                         then least(greatest((s.agent_view_limits ->> v_name)::numeric, 1), 1000000)::int
                         else s.non_subscriber_daily_view_limit end
      else s.non_subscriber_daily_view_limit
    end;
    select count(*)::int into v_used from public.library_public_views v
     where v.subject = v_subj and v.day = v_day and v.allowed;
    if v_subj = v_first then
      v_first_used := v_used;
      v_first_limit := v_limit;
    end if;
    if v_used >= v_limit and not exists (
         select 1 from public.library_public_views v
          where v.subject = v_subj and v.day = v_day and v.doc_key = p_doc_key and v.allowed) then
      insert into public.library_public_views (subject, day, doc_key, allowed)
        values (v_first, v_day, p_doc_key, false)
        on conflict (subject, day, doc_key) do nothing;
      if v_crawler is not null then
        update public.library_crawler_daily c set refused = c.refused + 1
         where c.day = v_day and c.provider = v_crawler;
      end if;
      return query select 'over'::text, v_used, v_limit, v_subj, v_resets;
      return;
    end if;
  end loop;

  insert into public.library_public_views (subject, day, doc_key, allowed)
  select x, v_day, p_doc_key, true from unnest(p_subjects) x
  on conflict (subject, day, doc_key) do update set allowed = true, first_at = now();

  return query select 'ok'::text, v_first_used + 1, v_first_limit, v_first, v_resets;
end;
$$;

comment on function public.library_public_view_hit(text, text[], text, boolean) is
  'Owner register 14 items 52/53/56/60 (20261201_30): the non-subscriber daily view cap. off = the switch is off (nothing written); ok = counted (or a free re-open); over = the subject that is at its number. Numbers from library_monitor_settings only. Service role only.';

revoke all on function public.library_public_view_hit(text, text[], text, boolean) from public, anon, authenticated;
grant execute on function public.library_public_view_hit(text, text[], text, boolean) to service_role;

-- ── 4. library_public_view_stats (the admin page) ────────────────────────────
create or replace function public.library_public_view_stats(p_days int)
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
          'accounts', count(distinct v.subject) filter (where split_part(v.subject, ':', 1) = 'u'),
          'opens', count(*) filter (where v.allowed and split_part(v.subject, ':', 1) in ('u', 's', 'c')),
          'refusals', count(*) filter (where not v.allowed),
          'capped', count(distinct v.subject) filter (where not v.allowed)) as stats
          from public.library_public_views v
         where v.day > v_day - v_days
         group by v.day) d), '[]'::jsonb),
    'crawlers', coalesce((
      select jsonb_agg(jsonb_build_object('day', c.day, 'provider', c.provider, 'verified', c.verified,
                                          'notVerified', c.not_verified, 'refused', c.refused)
                       order by c.day desc, c.provider)
        from public.library_crawler_daily c where c.day > v_day - v_days), '[]'::jsonb));
end;
$$;

revoke all on function public.library_public_view_stats(int) from public, anon, authenticated;
grant execute on function public.library_public_view_stats(int) to service_role;

-- ── 5. library_read_sessions + library_read_session_seen ─────────────────────
create table if not exists public.library_read_sessions (
  user_id     uuid not null,
  session_key text not null constraint library_read_sessions_session_check check (session_key ~ '^[sa]:[A-Za-z0-9_-]{8,64}$'),
  address_key text constraint library_read_sessions_address_check check (address_key is null or address_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  constraint library_read_sessions_pkey primary key (user_id, session_key)
);
create index if not exists library_read_sessions_last_at on public.library_read_sessions (last_at);

comment on table public.library_read_sessions is
  'O19 / R67 (20261201_30): the library sessions (hashed nz_lib_sid, else hashed address) each account read full texts from, with the last time. Feeds the «parallel» review rule. Kept 2 days. Service role only.';

alter table public.library_read_sessions enable row level security;
revoke all on public.library_read_sessions from public, anon, authenticated;
grant all on public.library_read_sessions to service_role;

-- ── 6. review flags: the two rules, e-mail claim ─────────────────────────────
alter table public.library_review_flags drop constraint if exists library_review_flags_rule_check;
alter table public.library_review_flags add constraint library_review_flags_rule_check
  check (rule in ('hour_requests', 'hour_searches', 'week_docs', 'sustained', 'night', 'near_cap', 'sequential', 'parallel'));

do $$
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.library_review_flags'::regclass and attname = 'emailed_at' and not attisdropped) then
    alter table public.library_review_flags add column emailed_at timestamptz;
    -- Flags raised before this file are not e-mailed (they are in the bell).
    update public.library_review_flags set emailed_at = now() where emailed_at is null;
  end if;
end $$;
create index if not exists library_review_flags_not_emailed
  on public.library_review_flags (created_at) where emailed_at is null;

create or replace function public.library_review_flags_claim_email(p_max_age_hours int, p_limit int)
returns table (reference text, rule text, rules text[], details jsonb, action_taken text, created_at timestamptz, user_type text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with c as (
    select f.id from public.library_review_flags f
     where f.emailed_at is null
       and f.created_at > now() - make_interval(hours => least(greatest(coalesce(p_max_age_hours, 24), 1), 168))
     order by f.created_at
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update skip locked),
  u as (
    update public.library_review_flags f set emailed_at = now()
      from c where f.id = c.id
    returning f.user_id, f.reference, f.rule, f.rules, f.details, f.action_taken, f.created_at)
  select u.reference, u.rule, u.rules, u.details, u.action_taken, u.created_at,
         (select p.user_type::text from public.profiles p where p.id = u.user_id)
    from u order by u.created_at;
end;
$$;

comment on function public.library_review_flags_claim_email(int, int) is
  'O19 / R67 (20261201_30): marks and returns the review flags of the last N hours not yet e-mailed (one claim per flag, skip locked). The app sends them to library_monitor_settings.alert_emails. Never the reader''s name or address. Service role only.';

revoke all on function public.library_review_flags_claim_email(int, int) from public, anon, authenticated;
grant execute on function public.library_review_flags_claim_email(int, int) to service_role;

-- ── 7. library_monitor_evaluate, re-created (same signature) ────────────────
-- From 20261103_10 §3 (its latest body). Changes, marked l11_scrape:
--   (a) no admin exemption (R67: admins and test accounts are watched too);
--   (b) the 'sequential' rule; (c) the 'parallel' rule.
create or replace function public.library_monitor_evaluate(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s          public.library_monitor_settings;
  v_hour     timestamptz := date_trunc('hour', now());
  v_day      date := (now() at time zone 'Asia/Riyadh')::date;
  v_req      int;
  v_srch     int;
  v_week     int;
  v_busy     int;
  v_night    int;
  v_today    int;
  v_limit    int;
  v_seq      int := 0;
  v_par      int := 0;
  v_rules    text[] := '{}';
  v_flag     public.library_review_flags;
  v_action   text;
  v_details  jsonb;
  v_rule_ar  text;
begin
  select * into s from public.library_monitor_settings ms where ms.id;
  if not found then
    return null;
  end if;

  -- l11_scrape (a): R67 — no admin exemption any more.

  if exists (select 1 from public.library_review_flags f where f.user_id = p_user and f.cleared_at is null) then
    return null;
  end if;
  if s.reflag_quiet_hours > 0 and exists (
       select 1 from public.library_review_flags f
        where f.user_id = p_user and f.cleared_at > now() - make_interval(hours => s.reflag_quiet_hours)) then
    return null;
  end if;

  select coalesce(sum(a.requests) filter (where a.hour = v_hour), 0),
         coalesce(sum(a.searches) filter (where a.hour = v_hour), 0),
         coalesce(sum(a.docs) filter (where a.hour > now() - interval '7 days'), 0),
         count(*) filter (where a.hour > now() - interval '24 hours' and a.docs >= s.rule_sustained_min_docs),
         coalesce(sum(a.docs) filter (where a.hour > now() - interval '24 hours'
                                       and extract(hour from a.hour at time zone 'Asia/Riyadh') < 5), 0)
    into v_req, v_srch, v_week, v_busy, v_night
    from public.library_activity_hourly a
   where a.user_id = p_user and a.hour > now() - interval '7 days';

  select count(*) into v_today from public.library_read_quota_docs d
   where d.user_id = p_user and d.day = v_day and d.allowed;
  select l.day_limit into v_limit
    from public.library_quota_limits(p_user, s.daily_docs, s.member_daily_docs, s.hourly_docs, s.lock_after_refused) l;

  -- l11_scrape (b): the longest run of distinct full-text documents, each
  -- opened within rule_sequence_gap_seconds of the previous one (last 6 hours).
  if s.rule_sequence_on then
    select coalesce(max(g.n), 0)::int into v_seq
      from (select count(*) as n
              from (select sum(b.brk) over (order by b.opened_at, b.doc_key rows unbounded preceding) as grp
                      from (select r.opened_at, r.doc_key,
                                   case when r.opened_at - lag(r.opened_at) over (order by r.opened_at, r.doc_key)
                                             <= make_interval(secs => s.rule_sequence_gap_seconds)
                                        then 0 else 1 end as brk
                              from public.full_text_reads r
                             where r.user_id = p_user and r.day >= v_day - 1
                               and r.opened_at > now() - interval '6 hours') b) runs
             group by runs.grp) g;
  end if;

  -- l11_scrape (c): library sessions of this account seen in the last M minutes.
  if s.rule_parallel_on then
    select count(*)::int into v_par from public.library_read_sessions rs
     where rs.user_id = p_user and rs.last_at > now() - make_interval(mins => s.rule_parallel_minutes);
  end if;

  if s.rule_hour_requests_on and v_req >= s.rule_hour_requests then v_rules := v_rules || 'hour_requests'::text; end if;
  if s.rule_hour_searches_on and v_srch >= s.rule_hour_searches then v_rules := v_rules || 'hour_searches'::text; end if;
  if s.rule_week_docs_on and v_week >= s.rule_week_docs then v_rules := v_rules || 'week_docs'::text; end if;
  if s.rule_sustained_on and v_busy >= s.rule_sustained_hours then v_rules := v_rules || 'sustained'::text; end if;
  if s.rule_night_on and v_night >= s.rule_night_docs then v_rules := v_rules || 'night'::text; end if;
  if s.rule_near_cap_on and coalesce(v_limit, 0) > 0
     and v_today * 100 >= v_limit * s.rule_near_cap_pct then v_rules := v_rules || 'near_cap'::text; end if;
  if s.rule_sequence_on and v_seq >= s.rule_sequence_docs then v_rules := v_rules || 'sequential'::text; end if;
  if s.rule_parallel_on and v_par >= s.rule_parallel_sessions then v_rules := v_rules || 'parallel'::text; end if;

  if cardinality(v_rules) = 0 then
    return null;
  end if;

  v_details := jsonb_build_object(
    'hour_requests', v_req, 'hour_searches', v_srch, 'week_docs', v_week,
    'busy_hours_24h', v_busy, 'night_docs_24h', v_night,
    'docs_today', v_today, 'day_limit', v_limit,
    'sequence_docs', v_seq, 'parallel_sessions', v_par,
    'thresholds', jsonb_build_object(
      'hour_requests', s.rule_hour_requests, 'hour_searches', s.rule_hour_searches,
      'week_docs', s.rule_week_docs, 'sustained_hours', s.rule_sustained_hours,
      'sustained_min_docs', s.rule_sustained_min_docs, 'night_docs', s.rule_night_docs,
      'near_cap_pct', s.rule_near_cap_pct,
      'sequence_docs', s.rule_sequence_docs, 'sequence_gap_seconds', s.rule_sequence_gap_seconds,
      'parallel_sessions', s.rule_parallel_sessions, 'parallel_minutes', s.rule_parallel_minutes));

  insert into public.library_review_flags (user_id, rule, rules, details, action_taken)
    values (p_user, v_rules[1], v_rules, v_details, s.flag_action)
    on conflict (user_id) where cleared_at is null do nothing
    returning * into v_flag;
  if v_flag.id is null then
    return null;
  end if;

  v_action := s.flag_action;
  if v_action = 'slow' then
    -- An admin's own override is never replaced by the automatic one.
    insert into public.library_user_limits as ul (user_id, daily_docs, hourly_docs, until, source, note)
      values (p_user, s.slow_daily_docs, s.slow_hourly_docs, now() + make_interval(hours => s.slow_hours),
              'auto_slow', 'إبطاء تلقائي — ' || v_flag.reference)
      on conflict (user_id) do update
        set daily_docs = excluded.daily_docs, hourly_docs = excluded.hourly_docs, until = excluded.until,
            source = 'auto_slow', note = excluded.note, set_by = null, set_at = now()
        where ul.source = 'auto_slow' or (ul.until is not null and ul.until <= now());
  elsif v_action = 'lock' then
    insert into public.library_security_locks (user_id, reason, details, locked_until)
      values (p_user, 'activity_flag', jsonb_build_object('flag_reference', v_flag.reference, 'rules', v_rules) || v_details,
              case when s.auto_lock_hours > 0 then now() + make_interval(hours => s.auto_lock_hours) end)
      on conflict (user_id) where lifted_at is null do nothing;
  end if;

  if s.notify_admins then
    v_rule_ar := case v_rules[1]
      when 'hour_requests' then format('%s طلباً (فتح وثائق وبحث ومساعد) في ساعة واحدة', v_req)
      when 'hour_searches' then format('%s بحثاً في ساعة واحدة', v_srch)
      when 'week_docs'     then format('%s وثيقة خلال ٧ أيام', v_week)
      when 'sustained'     then format('%s ساعة نشطة خلال ٢٤ ساعة بوتيرة %s وثيقة أو أكثر في الساعة', v_busy, s.rule_sustained_min_docs)
      when 'night'         then format('%s وثيقة بين منتصف الليل والخامسة فجراً', v_night)
      when 'near_cap'      then format('%s وثيقة اليوم من حد %s', v_today, v_limit)
      when 'sequential'    then format('%s وثيقة فُتحت تباعاً بفاصل لا يزيد على %s ثانية', v_seq, s.rule_sequence_gap_seconds)
      when 'parallel'      then format('القراءة من %s جلسات خلال %s دقيقة', v_par, s.rule_parallel_minutes)
    end;
    perform public.library_monitor_notify_admins(
      'حساب قيد المراجعة — نشاط غير معتاد في المكتبة',
      format('%s. المرجع %s. %s', v_rule_ar, v_flag.reference,
             case v_action when 'slow' then 'أُبطئت قراءته تلقائياً.'
                           when 'lock' then 'أُوقفت قراءته للمكتبة تلقائياً.'
                           else 'القراءة مستمرة حتى تقرر.' end),
      '/dashboard/admin/security?tab=library_activity');
  end if;

  return v_flag.reference;
end;
$$;

comment on function public.library_monitor_evaluate(uuid) is
  'Library review rules for one account (20261031_10 → 20261103_10 → 20261201_30 l11_scrape): hour requests / searches, week docs, sustained, night, near cap, sequential, parallel. No admin exemption (R67). Opens one review flag and applies the flag action. Service role only.';

revoke all on function public.library_monitor_evaluate(uuid) from public, anon, authenticated;
grant execute on function public.library_monitor_evaluate(uuid) to service_role;

create or replace function public.library_read_session_seen(p_user uuid, p_session text, p_address text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_session is null or p_session !~ '^[sa]:[A-Za-z0-9_-]{8,64}$'
     or (p_address is not null and p_address !~ '^[A-Za-z0-9_-]{8,64}$') then
    raise exception 'library_read_session_seen: invalid arguments' using errcode = '22023';
  end if;

  -- The same per-user lock as library_read_quota_hit / library_activity_bump.
  perform pg_advisory_xact_lock(hashtextextended('library_read_quota:' || p_user::text, 0));

  insert into public.library_read_sessions as rs (user_id, session_key, address_key)
    values (p_user, p_session, p_address)
    on conflict (user_id, session_key) do update
      set last_at = now(), address_key = coalesce(excluded.address_key, rs.address_key);

  delete from public.library_read_sessions rs where rs.user_id = p_user and rs.last_at < now() - interval '2 days';
  delete from public.library_read_sessions rs
   using (select o.user_id, o.session_key from public.library_read_sessions o
           where o.last_at < now() - interval '2 days' limit 1000 for update skip locked) old
   where rs.user_id = old.user_id and rs.session_key = old.session_key;

  return public.library_monitor_evaluate(p_user);
end;
$$;

comment on function public.library_read_session_seen(uuid, text, text) is
  'O19 / R67 (20261201_30): records the library session an account read a full text from, then evaluates the review rules; returns the new flag reference or null. Service role only.';

revoke all on function public.library_read_session_seen(uuid, text, text) from public, anon, authenticated;
grant execute on function public.library_read_session_seen(uuid, text, text) to service_role;

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  t text;
  f text;
  r text;
begin
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.library_monitor_evaluate(uuid)'::regprocedure), 'l11_scrape') = 0 then
    raise exception 'l11_scrape verify: library_monitor_evaluate is not the 20261201_30 version (an older file re-run after it?)';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.library_monitor_evaluate(uuid)'::regprocedure), '''admin'' then') > 0 then
    raise exception 'l11_scrape verify: library_monitor_evaluate still exempts admins';
  end if;
  foreach t in array array['public.library_public_views', 'public.library_crawler_daily', 'public.library_read_sessions'] loop
    if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = t::regclass) then
      raise exception 'l11_scrape verify: RLS is off on %', t;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, t, 'SELECT') or has_table_privilege(r, t, 'INSERT')
         or has_table_privilege(r, t, 'UPDATE') or has_table_privilege(r, t, 'DELETE') then
        raise exception 'l11_scrape verify: % holds a privilege on %', r, t;
      end if;
    end loop;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.library_monitor_settings', 'SELECT') then
      raise exception 'l11_scrape verify: % can read library_monitor_settings', r;
    end if;
  end loop;
  foreach f in array array['public.library_public_view_hit(text,text[],text,boolean)', 'public.library_public_view_stats(int)',
                           'public.library_review_flags_claim_email(int,int)', 'public.library_read_session_seen(uuid,text,text)',
                           'public.library_monitor_evaluate(uuid)'] loop
    if not (select p.prosecdef and p.proconfig @> array['search_path=""']
              from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
      raise exception 'l11_scrape verify: % is not security definer with an empty search_path', f;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'EXECUTE') then
        raise exception 'l11_scrape verify: % can EXECUTE %', r, f;
      end if;
    end loop;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'l11_scrape verify: service_role cannot EXECUTE %', f;
    end if;
  end loop;
  raise notice 'l11_scrape verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261201_30 library scrape guard (non-subscriber view cap OFF + verified crawlers + sequential/parallel alerts + staff e-mail claim; service_role only)' as migration,
       to_regprocedure('public.library_public_view_hit(text,text[],text,boolean)') is not null
       and to_regprocedure('public.library_read_session_seen(uuid,text,text)') is not null
       and to_regclass('public.library_public_views') is not null
       and not has_function_privilege('anon', 'public.library_public_view_hit(text,text[],text,boolean)', 'EXECUTE')
       as ok;
