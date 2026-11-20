-- =============================================================================
-- Migration: 20261201_20_pay_guest_offers_founder_renewal.sql   (verify id: l11_pay)
-- =============================================================================
-- PURPOSE (batch l11, builder "pay"; owner register 14 items 20 and 55,
--          founder terms clause ٤)
--
--   1. OFFERS FOR VISITORS (l11 O17, register 20). public.offers (20261128_50)
--      may now name the audience key 'guest' — a visitor who is not signed in.
--      GET /api/v1/offers answers him the active offers that name it, and the
--      /pricing strip shows them.
--        offers_audience_check            widened: ... 'corporate', 'guest'
--        offers_guest_verification_check  NEW: a guest offer has
--                                         audience_verification = 'any'
--      The founder offer stays advocate-lawyer only
--      (offers_founder_audience_check is untouched). Both constraints keep the
--      names 20261128_50 uses, so a re-run of 20261128_50 skips them. When
--      public.offers does not exist yet, this part does nothing (NOTICE).
--
--   2. FOUNDER RENEWAL — SETTING (register 55, clause ٤). platform_settings
--      row 'founder_renewal' = {"enabled": false, "price_sar": null}: OFF and
--      no price. The admin sets the renewal price (SAR before VAT) and the
--      switch from /dashboard/admin/settings (validated by
--      founderRenewalIssue in src/lib/membership/founderRenewal.ts). Inserted
--      only when absent: a value the admin saved is never overwritten.
--
--   3. FOUNDER RENEWAL — NOTICE MARKERS. public.founder_renewal_notices: one
--      row per (seat, membership end) — the 60-day renewal notice
--      (POST /api/v1/cron/founder-renewal-notice) is sent once per seat and
--      year whatever the schedule. Server-only: RLS on, no policy, no session
--      privilege; service_role reads and writes. user_id cascades with the
--      account; seat_id carries no foreign key (founder_seats may be created
--      after this file; a marker of a deleted seat is inert).
--
--   No price is invented: with the setting OFF (or no price) the cron sends
--   nothing. No existing row is changed.
--
-- HOW TO RUN (any order relative to the code deploy; safe to re-run):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261201_20_pay_guest_offers_founder_renewal.sql
--   Expect: NOTICE  l11_pay verify: OK  and a row with `t`.
--
-- ROLLBACK:
--   alter table public.offers drop constraint if exists offers_guest_verification_check;
--   -- (no offer may name 'guest' before the next line)
--   alter table public.offers drop constraint if exists offers_audience_check;
--   alter table public.offers add constraint offers_audience_check check (audience_account_types <@ array['lawyer', 'consultant', 'firm', 'individual', 'corporate']::text[] and cardinality(audience_account_types) >= 1);
--   drop table if exists public.founder_renewal_notices;
--   delete from public.platform_settings where key = 'founder_renewal';
-- =============================================================================

begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261201_20: public.platform_settings missing — run 20260627_platform_settings first';
  end if;
end
$$;

-- ── 1. offers: the 'guest' audience ─────────────────────────────────────────

do $$
begin
  if to_regclass('public.offers') is null then
    raise notice '20261201_20: public.offers missing (20261128_50 not run) — the guest audience is skipped';
    return;
  end if;
  -- widen only when the stored check does not already list 'guest'
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.offers'::regclass and conname = 'offers_audience_check'
                    and pg_get_constraintdef(oid) like '%guest%') then
    alter table public.offers drop constraint if exists offers_audience_check;
    alter table public.offers add constraint offers_audience_check
      check (audience_account_types <@ array['lawyer', 'consultant', 'firm', 'individual', 'corporate', 'guest']::text[]
             and cardinality(audience_account_types) >= 1);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.offers'::regclass and conname = 'offers_guest_verification_check') then
    alter table public.offers add constraint offers_guest_verification_check
      check (not ('guest' = any (audience_account_types)) or audience_verification = 'any');
  end if;
end
$$;

-- ── 2. the founder renewal setting (OFF, no price) ──────────────────────────

insert into public.platform_settings (key, value, description)
values ('founder_renewal', '{"enabled": false, "price_sar": null}'::jsonb,
        'Founder membership renewal (register 55, founder terms clause 4): {"enabled": bool, "price_sar": SAR before VAT | null}. OFF and no price by default; the 60-day notice is sent only when enabled with a price.')
on conflict (key) do nothing;

-- ── 3. the 60-day notice markers ────────────────────────────────────────────

create table if not exists public.founder_renewal_notices (
  seat_id            uuid        not null,
  cycle_end          timestamptz not null,
  user_id            uuid        not null references auth.users(id) on delete cascade,
  price_net_halalas  integer     not null check (price_net_halalas > 0),
  email_status       text        null check (email_status is null or email_status in ('sent', 'unavailable', 'failed', 'sunk', 'no_address')),
  sent_at            timestamptz not null default now(),
  primary key (seat_id, cycle_end)
);

create index if not exists founder_renewal_notices_user_idx on public.founder_renewal_notices (user_id);

alter table public.founder_renewal_notices enable row level security;
revoke all on public.founder_renewal_notices from public, anon, authenticated;
grant select, insert, update, delete on public.founder_renewal_notices to service_role;

comment on table public.founder_renewal_notices is
  'One row per (founder seat, membership end): the 60-day renewal notice was sent (20261201_20, l11 pay). Server-only; written by POST /api/v1/cron/founder-renewal-notice.';

do $verify$
declare
  def text;
begin
  if to_regclass('public.offers') is not null then
    select pg_get_constraintdef(oid) into def from pg_constraint
     where conrelid = 'public.offers'::regclass and conname = 'offers_audience_check';
    if def is null or def not like '%guest%' or def not like '%corporate%' then
      raise exception 'l11_pay verify: offers_audience_check does not list guest';
    end if;
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.offers'::regclass and conname = 'offers_guest_verification_check') then
      raise exception 'l11_pay verify: offers_guest_verification_check missing';
    end if;
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.offers'::regclass and conname = 'offers_founder_audience_check') then
      raise exception 'l11_pay verify: offers_founder_audience_check missing (the founder offer must stay lawyer-only)';
    end if;
  end if;
  if not exists (select 1 from public.platform_settings where key = 'founder_renewal') then
    raise exception 'l11_pay verify: platform_settings founder_renewal missing';
  end if;
  if to_regclass('public.founder_renewal_notices') is null then
    raise exception 'l11_pay verify: public.founder_renewal_notices missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.founder_renewal_notices'::regclass) then
    raise exception 'l11_pay verify: RLS off on founder_renewal_notices';
  end if;
  if has_table_privilege('anon', 'public.founder_renewal_notices', 'SELECT')
     or has_table_privilege('authenticated', 'public.founder_renewal_notices', 'SELECT')
     or has_table_privilege('authenticated', 'public.founder_renewal_notices', 'INSERT') then
    raise exception 'l11_pay verify: a session role holds a privilege on founder_renewal_notices';
  end if;
  raise notice 'l11_pay verify: OK';
end
$verify$;

commit;

select '20261201_20 offers guest audience + founder_renewal setting (off) + founder_renewal_notices' as migration,
       (to_regclass('public.founder_renewal_notices') is not null
        and exists (select 1 from public.platform_settings where key = 'founder_renewal')) as ok;
