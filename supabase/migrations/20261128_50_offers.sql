-- =============================================================================
-- Migration: 20261128_50_offers.sql
-- =============================================================================
-- PURPOSE (owner message of 18 Nov 2026, item 5 «نظام العروض الديناميكي»;
--          batch l8, builder offers)
--
--   1. public.offers — one row per offer the admin creates, edits, previews
--      and stops from /dashboard/admin/offers, with no code deploy:
--        title, body, optional media (image / video URL), CTA label + link;
--        audience: account types (lawyer = advocate lawyer, consultant,
--          firm, individual, corporate), verification state (any / verified
--          / unverified), exclude_buyers (whoever already paid for plan_ref);
--        window starts_at / ends_at (compared with the SERVER's clock);
--        seats_total / seats_used for a limited offer;
--        priority, status draft | active | paused;
--        dismiss_return_minutes — how long a closed popup stays away
--          (default 4320 = 3 days; the admin may set 1 minute to test);
--        requires_invite_code — an EMPTY optional column only. Nothing reads
--          it, no screen shows it, no invite system exists (owner item 5).
--      campaign_id 'founder-2026' links a row to the founder campaign: its
--      window and seats are READ from the existing campaign (the
--      founder_campaign setting + founder_seat_summary()), never copied. A
--      linked row is held to the owner's audience by a CHECK: verified
--      advocate lawyers only (account type 'lawyer'; 'consultant' is a
--      separate key and is outside it), and it carries no seats of its own.
--   2. public.offer_dismissals — (offer, user) → when the popup was last
--      closed and how many times. The popup returns once
--      dismissed_at + dismiss_return_minutes has passed.
--   3. public.offer_events — impressions, dismissals and clicks (the admin's
--      stats; purchases are counted from payment_orders by the server).
--   4. public.offer_event_counts() — the stats per offer (service role only).
--   5. Seed: the founder offer is the first row (slug 'founder-2026').
--
--   RLS is ON for all three tables with NO policy and NO session privilege:
--   the signed-in user reads the offers that match him through the server
--   route GET /api/v1/offers (service role, filtered per user), and the admin
--   writes through /api/v1/admin/offers (service role, requireStaff +
--   audited). Seats, reservations and payments are NOT touched: no founder
--   function, no payment table, no trigger on either.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261128_50_offers.sql
--   Expect: NOTICE  20261128_50 verify: OK  and a row with `t`.
--
-- RUN ORDER: any time — before or after the l8-offers deploy.
--   Before it runs, the new code degrades honestly: GET /api/v1/offers
--   answers no offers (no popup, no «العروض» item, no pricing strip), the
--   admin page says the migration has not run, and the founder banner /
--   dashboard card keep their built-in copy. Needs nothing but auth.users
--   (20261022_10 payment_orders is read by the server, not by this file).
--   This file is idempotent (safe to run any number of times); the seed row
--   is inserted only when missing, so the admin's edits survive a re-run.
--
-- ROLLBACK (one transaction):
--   drop function if exists public.offer_event_counts();
--   drop table if exists public.offer_events, public.offer_dismissals, public.offers;
--   (the new code then answers «no offers» again; nothing else depends on them)
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('auth.users') is null then
    raise exception '20261128_50: auth.users is missing';
  end if;
end
$pre$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. public.offers
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.offers (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text,
  title                  text not null,
  body                   text not null default '',
  media_url              text,
  media_kind             text,
  cta_label              text not null,
  cta_href               text not null,
  audience_account_types text[] not null default '{}',
  audience_verification  text not null default 'any',
  exclude_buyers         boolean not null default true,
  plan_ref               text,
  campaign_id            text,
  starts_at              timestamptz,
  ends_at                timestamptz,
  seats_total            int,
  seats_used             int not null default 0,
  priority               int not null default 0,
  status                 text not null default 'draft',
  dismiss_return_minutes int not null default 4320,
  requires_invite_code   text,
  created_by             uuid references auth.users(id) on delete set null,
  updated_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Constraints by name, so a re-run adds only the missing ones.
do $c$
declare
  r record;
begin
  for r in
    select * from (values
      ('offers_slug_key',            'unique (slug)'),
      ('offers_title_check',         'check (char_length(btrim(title)) between 1 and 120)'),
      ('offers_body_check',          'check (char_length(body) <= 1000)'),
      ('offers_cta_label_check',     'check (char_length(btrim(cta_label)) between 1 and 40)'),
      -- same-site path only ("//host" and "/\host" are another host)
      ('offers_cta_href_check',      'check (cta_href ~ ''^/([^/\\]|$)'' and char_length(cta_href) <= 300)'),
      ('offers_media_check',         'check ((media_url is null and media_kind is null) or (media_kind in (''image'', ''video'') and char_length(media_url) <= 500 and (media_url ~ ''^https://[^/\s]+/'' or media_url ~ ''^/([^/\\]|$)'')))'),
      ('offers_audience_check',      'check (audience_account_types <@ array[''lawyer'', ''consultant'', ''firm'', ''individual'', ''corporate'']::text[] and cardinality(audience_account_types) >= 1)'),
      ('offers_verification_check',  'check (audience_verification in (''any'', ''verified'', ''unverified''))'),
      ('offers_plan_ref_check',      'check (plan_ref is null or plan_ref ~ ''^[a-z0-9][a-z0-9-]{0,63}$'')'),
      ('offers_campaign_check',      'check (campaign_id is null or campaign_id = ''founder-2026'')'),
      ('offers_window_check',        'check (starts_at is null or ends_at is null or ends_at > starts_at)'),
      ('offers_seats_check',         'check ((seats_total is null or seats_total >= 1) and seats_used >= 0)'),
      ('offers_status_check',        'check (status in (''draft'', ''active'', ''paused''))'),
      ('offers_priority_check',      'check (priority between -1000 and 1000)'),
      ('offers_return_check',        'check (dismiss_return_minutes between 1 and 525600)'),
      -- the founder offer (owner item 5): verified advocate lawyers only, the
      -- consultant outside; its seats are the campaign's, never its own.
      ('offers_founder_audience_check', 'check (campaign_id is null or (audience_account_types = array[''lawyer'']::text[] and audience_verification = ''verified'' and seats_total is null and seats_used = 0))')
    ) v(name, def)
  loop
    if not exists (select 1 from pg_catalog.pg_constraint
                    where conrelid = 'public.offers'::regclass and conname = r.name) then
      execute pg_catalog.format('alter table public.offers add constraint %I %s', r.name, r.def);
    end if;
  end loop;
end
$c$;

create index if not exists offers_status_priority_idx on public.offers (status, priority desc);

comment on table public.offers is
  'Owner item 5 (20261128_50): admin-managed offers. Read per user by GET /api/v1/offers (service role); written by /api/v1/admin/offers (service role, staff + audited). No session privilege.';
comment on column public.offers.audience_account_types is
  'lawyer = advocate lawyer (practice_kind advocate), consultant = legal consultant (a lawyer account with practice_kind consultant), firm, individual, corporate.';
comment on column public.offers.campaign_id is
  'founder-2026 links the row to the founder campaign: its window and seats are read from founder_campaign + founder_seat_summary(), never stored here.';
comment on column public.offers.seats_used is
  'Seats the admin recorded as taken outside online checkout; the server adds the paid orders of plan_ref since the offer opened.';
comment on column public.offers.dismiss_return_minutes is
  'How long a closed popup stays away (default 4320 = 3 days). It never returns in the same session.';
comment on column public.offers.requires_invite_code is
  'Owner item 5: reserved, EMPTY. No logic reads it and no screen shows it.';

drop trigger if exists set_offers_updated_at on public.offers;
create or replace function public.offers_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$fn$;
create trigger set_offers_updated_at
  before update on public.offers
  for each row execute function public.offers_touch_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. public.offer_dismissals
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.offer_dismissals (
  offer_id      uuid not null references public.offers(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  dismissed_at  timestamptz not null default now(),
  dismiss_count int not null default 1 check (dismiss_count >= 1),
  primary key (offer_id, user_id)
);

create index if not exists offer_dismissals_user_idx on public.offer_dismissals (user_id);

comment on table public.offer_dismissals is
  'Owner item 5 (20261128_50): the last time a user closed an offer popup. Service role only.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. public.offer_events
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.offer_events (
  id         bigint generated always as identity primary key,
  offer_id   uuid not null references public.offers(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  kind       text not null check (kind in ('impression', 'dismiss', 'click')),
  created_at timestamptz not null default now()
);

create index if not exists offer_events_offer_kind_idx on public.offer_events (offer_id, kind);

comment on table public.offer_events is
  'Owner item 5 (20261128_50): popup impressions, dismissals and CTA clicks for the admin stats. Service role only.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. RLS on, no policy, no session privilege
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.offers enable row level security;
alter table public.offer_dismissals enable row level security;
alter table public.offer_events enable row level security;

do $g$
declare
  t text;
  p record;
begin
  foreach t in array array['offers', 'offer_dismissals', 'offer_events'] loop
    for p in select polname from pg_catalog.pg_policy where polrelid = ('public.' || t)::regclass loop
      execute pg_catalog.format('drop policy %I on public.%I', p.polname, t);
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on public.%I from authenticated', t);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant select, insert, update, delete on public.%I to service_role', t);
    end if;
  end loop;
  execute 'revoke all on function public.offers_touch_updated_at() from public';
end
$g$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. The stats per offer (service role only)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.offer_event_counts()
returns table (offer_id uuid, impressions bigint, dismissals bigint, clicks bigint, reached_users bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  select e.offer_id,
         pg_catalog.count(*) filter (where e.kind = 'impression'),
         pg_catalog.count(*) filter (where e.kind = 'dismiss'),
         pg_catalog.count(*) filter (where e.kind = 'click'),
         pg_catalog.count(distinct e.user_id) filter (where e.kind = 'impression')
    from public.offer_events e
   group by e.offer_id;
$fn$;

comment on function public.offer_event_counts() is
  'Owner item 5 (20261128_50): impressions / dismissals / clicks / distinct users shown, per offer. Service role only.';

revoke all on function public.offer_event_counts() from public;
do $fg$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.offer_event_counts() from anon';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.offer_event_counts() from authenticated';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.offer_event_counts() to service_role';
  end if;
end
$fg$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Seed: the founder offer is the first row (only when missing)
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.offers (
  slug, title, body, cta_label, cta_href,
  audience_account_types, audience_verification, exclude_buyers,
  plan_ref, campaign_id, priority, status, dismiss_return_minutes
) values (
  'founder-2026',
  'باقة المحامي المؤسس',
  'عضوية المحامي المؤسس السنوية — مقاعد محدودة لمن يوثّق رخصته ويُتم السداد',
  'اعرف التفاصيل',
  '/founder',
  array['lawyer']::text[], 'verified', true,
  'lawyer-founder-2026', 'founder-2026', 100, 'active', 4320
)
on conflict (slug) do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- verify
-- ═════════════════════════════════════════════════════════════════════════════
do $verify$
declare
  t text;
begin
  foreach t in array array['public.offers', 'public.offer_dismissals', 'public.offer_events'] loop
    if not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = t::regclass), false) then
      raise exception '20261128_50 verify: RLS is off on %', t;
    end if;
    if exists (select 1 from pg_catalog.pg_policy where polrelid = t::regclass) then
      raise exception '20261128_50 verify: % has a policy (sessions must not read it)', t;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and (has_table_privilege('authenticated', t, 'SELECT') or has_table_privilege('authenticated', t, 'INSERT')
            or has_table_privilege('authenticated', t, 'UPDATE')) then
      raise exception '20261128_50 verify: a session holds a privilege on %', t;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
       and has_table_privilege('anon', t, 'SELECT') then
      raise exception '20261128_50 verify: anon may read %', t;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'offers' and column_name = 'requires_invite_code') then
    raise exception '20261128_50 verify: offers.requires_invite_code is missing';
  end if;
  if not exists (select 1 from public.offers
                  where slug = 'founder-2026' and campaign_id = 'founder-2026'
                    and audience_account_types = array['lawyer']::text[] and audience_verification = 'verified') then
    raise exception '20261128_50 verify: the founder offer row is missing';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.offers'::regclass and conname = 'offers_founder_audience_check') then
    raise exception '20261128_50 verify: the founder audience check is missing';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and has_function_privilege('authenticated', 'public.offer_event_counts()', 'EXECUTE') then
    raise exception '20261128_50 verify: a session may execute offer_event_counts()';
  end if;
  raise notice '20261128_50 verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261128_50 offers (offers + offer_dismissals + offer_events, RLS server-only, founder row seeded)' as step,
       (to_regclass('public.offers') is not null
        and to_regclass('public.offer_dismissals') is not null
        and to_regclass('public.offer_events') is not null
        and exists (select 1 from public.offers where slug = 'founder-2026')
        and coalesce((select relrowsecurity from pg_catalog.pg_class where oid = 'public.offers'::regclass), false)) as ok;
