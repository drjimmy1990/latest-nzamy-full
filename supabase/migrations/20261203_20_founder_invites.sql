-- =============================================================================
-- Migration: 20261203_20_founder_invites.sql   (verify id: l13_founder)
-- =============================================================================
-- PURPOSE (batch l13, builder «founder» — the owner's replies of 22 Nov 2026)
--
--   A. «تحرير المقعد المتروك بعد ١٥ دقيقة بالضبط» (owner reply ٣ / item ٤).
--      NOTHING is re-created for this: since 20261101_10 every reader already
--      treats a hold as live only while `reserved_until > now()`, so a hold is
--      free at exactly 15 minutes at read time, whatever the sweep does:
--        * founder_reserve_seat (latest body 20261127_10) — the count of taken
--          seats and the user's own live hold;
--        * founder_activate     (latest body 20261127_10) — the oversell count;
--        * founder_seat_summary (latest body 20261127_10) — reserved /
--          seats_left / on_sale (every public counter and the admin page).
--      founder_release_expired (20261101_10, `reserved_until <= now()`) stays a
--      tidy-up only. This file's verify block PINS that strict comparison in
--      the three latest bodies (and refuses `reserved_until >=` or a now()
--      shifted by an interval), so a
--      later re-creation that loosens it fails here and in _verify.sql.
--      Docker: supabase/tests/rls/founder_l13.test.sql proves that a hold
--      15 minutes + 1 second old is not counted and its seat is re-reserved by
--      another lawyer while every other seat is taken.
--
--   B. Owner Q144 (أ): «تجربة مكتبة ٣٠ يومًا مع ٥٠ نقطة صالحة مدة التجربة…
--      ولا تعمل الدعوات إلا بعد تفعيل الدفع». The published founder promise
--      «٣ دعوات تتجدد شهرياً لمحامين مرخصين جدد لم يسبق لهم التسجيل، ولا
--      تتراكم» (founderTerms.ts, /founder) is built here:
--      1. platform_settings.founder_invites (admin setting, inserted only when
--         missing): {"monthly": 3, "trial_days": 30, "points": 50,
--         "points_scope": "library_agent", "valid_days": 30}.
--           monthly      invites a founder may create per Riyadh calendar month
--                        (an unused one does not carry over: the count is of
--                        invites CREATED this month);
--           trial_days   the invitee's library trial (lib-trial grant);
--           points       points given with the trial, expiring with it;
--           points_scope library_agent (the library assistant only — the
--                        trial is a LIBRARY trial; the owner did not say) or
--                        general (any AI tool);
--           valid_days   how long an unused invite code stays usable.
--         public.founder_invite_settings() reads it; a missing or malformed
--         field reads as its default.
--      2. public.founder_invites — one row per invite. Server only: RLS on, no
--         policy, nothing granted to anon / authenticated. code UNIQUE (16
--         upper-case hex characters), redeemed_by UNIQUE (an account takes ONE
--         founder invite ever).
--      3. public.founder_invite_create(p_founder) → jsonb, under a per-founder
--         lock: not_founder (no ACTIVE, unexpired founder seat) | limit (this
--         month's allowance used) | ok {id, code, expires_at, used, monthly}.
--      4. public.founder_invite_redeem(p_user, p_code) → jsonb, the invite row
--         locked FOR UPDATE and a per-invitee lock:
--           invalid | expired | used (another account) | already_redeemed
--           (this account, the grant is not given twice) | self |
--           founder_inactive (the inviter's seat is no longer active) |
--           pending_verification (lawyer licence not checked yet — the code
--           stays usable) | not_lawyer (not a verified advocate: the library
--           is for lawyers, owner item 9) | not_new (the account existed
--           before the invite, already took a founder invite, or already had
--           a library grant) | ok {trial_ends_at, points, grant_id, lot_id}.
--         ok = public.library_grant_access(lib-trial / founder_campaign,
--         trial_days) + public.credit_wallet_points(points, 'gift', expiring
--         at the trial's end, points_scope) + the row marked redeemed — one
--         transaction (no exception handler: a failed grant rolls it all back).
--      THE PAYMENT GATEWAY RULE («لا تعمل الدعوات إلا بعد تفعيل الدفع») is
--      enforced by the app before either call (the gateway's real state needs
--      the server's Moyasar keys, which the database cannot see):
--      src/app/api/v1/membership/founder/invites/route.ts and …/redeem.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261203_20_founder_invites.sql
--   Expect: NOTICE  l13_founder verify: OK …  and a row with `t`.
--
-- RUN ORDER: BEFORE THE DEPLOY. The new code calls the two functions; while
--   they are missing it answers «قيد التفعيل» (the invite routes treat a
--   missing function as not ready) — nothing else depends on this file. The
--   old code never reads the table. Safe to run any number of times.
--
-- PREREQUISITES (the file raises without them): 20261101_10 (founder_seats),
--   20261127_10 (pending_verification), 20261030_65 (library_grant_access),
--   20261127_40 (credit_wallet_points with a wallet), 20261019_20
--   (lawyer_profiles.practice_kind), profiles.created_at.
--
-- ROLLBACK (in one transaction):
--   drop function if exists public.founder_invite_redeem(uuid, text);
--   drop function if exists public.founder_invite_create(uuid);
--   drop function if exists public.founder_invite_settings();
--   drop table if exists public.founder_invites;
--   delete from public.platform_settings where key = 'founder_invites';
--   notify pgrst, 'reload schema';
--   (grants and points already given stay — they are ordinary rows)
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. prerequisites ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.founder_seats') is null
     or to_regprocedure('public.founder_reserve_seat(uuid, uuid)') is null
     or to_regprocedure('public.founder_activate(uuid)') is null
     or to_regprocedure('public.founder_seat_summary()') is null then
    raise exception '20261203_20: run 20261101_10_founder_membership.sql first';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_activate(uuid)'::regprocedure), 'pending_verification') = 0 then
    raise exception '20261203_20: run 20261127_10_founder_pay_before_verification.sql first';
  end if;
  if to_regprocedure('public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)') is null then
    raise exception '20261203_20: run 20261030_65_library_grant_admin.sql first';
  end if;
  if to_regprocedure('public.credit_wallet_points(uuid, integer, text, timestamptz, uuid, text, text)') is null then
    raise exception '20261203_20: run 20261127_40_points_wallets.sql first';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261203_20: public.platform_settings is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'lawyer_profiles' and column_name = 'practice_kind') then
    raise exception '20261203_20: run 20261019_20_lawyer_practice_kind.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at') then
    raise exception '20261203_20: public.profiles.created_at is missing';
  end if;
end
$pre$;

-- ── 1. the setting (admin-edited; inserted only when missing) ───────────────
insert into public.platform_settings (key, value, description) values
  ('founder_invites',
   '{"monthly": 3, "trial_days": 30, "points": 50, "points_scope": "library_agent", "valid_days": 30}'::jsonb,
   'دعوات العضو المؤسس (س١٤٤ أ): عدد الدعوات في الشهر، أيام تجربة المكتبة للمدعو، نقاطه الصالحة مدة التجربة ونطاقها (library_agent = مساعد المكتبة فقط، general = كل الأدوات)، وصلاحية رمز الدعوة بالأيام (20261203_20). لا تعمل الدعوات إلا والدفع الإلكتروني مفعّل.')
on conflict (key) do nothing;

create or replace function public.founder_invite_settings()
returns table (monthly int, trial_days int, points int, points_scope text, valid_days int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with s as (select coalesce((select value from public.platform_settings where key = 'founder_invites'), '{}'::jsonb) as v),
       n as (select case when jsonb_typeof(s.v -> 'monthly')    = 'number' then (s.v ->> 'monthly')::numeric    end as monthly,
                    case when jsonb_typeof(s.v -> 'trial_days') = 'number' then (s.v ->> 'trial_days')::numeric end as trial_days,
                    case when jsonb_typeof(s.v -> 'points')     = 'number' then (s.v ->> 'points')::numeric     end as points,
                    s.v ->> 'points_scope' as points_scope,
                    case when jsonb_typeof(s.v -> 'valid_days') = 'number' then (s.v ->> 'valid_days')::numeric end as valid_days
               from s)
  select case when n.monthly    between 1 and 20    and n.monthly    = trunc(n.monthly)    then n.monthly::int    else 3  end,
         case when n.trial_days between 1 and 365   and n.trial_days = trunc(n.trial_days) then n.trial_days::int else 30 end,
         case when n.points     between 0 and 10000 and n.points     = trunc(n.points)     then n.points::int     else 50 end,
         case when n.points_scope in ('general', 'library_agent') then n.points_scope else 'library_agent' end,
         case when n.valid_days between 1 and 365   and n.valid_days = trunc(n.valid_days) then n.valid_days::int else 30 end
    from n;
$$;

comment on function public.founder_invite_settings() is
  'platform_settings.founder_invites read with defaults (20261203_20, owner Q144 أ): monthly 3 (1..20), trial_days 30 (1..365), points 50 (0..10000), points_scope library_agent | general, valid_days 30 (1..365). Service role only.';

-- ── 2. the invites ───────────────────────────────────────────────────────────
create table if not exists public.founder_invites (
  id               uuid primary key default gen_random_uuid(),
  code             text not null
                   constraint founder_invites_code_key unique
                   constraint founder_invites_code_check check (code ~ '^[0-9A-F]{16}$'),
  founder_user_id  uuid not null references auth.users(id) on delete cascade,
  seat_id          uuid null references public.founder_seats(id) on delete set null,
  month_key        text not null constraint founder_invites_month_key_check check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  redeemed_by      uuid null references auth.users(id) on delete set null
                   constraint founder_invites_redeemed_by_key unique,
  redeemed_at      timestamptz null,
  grant_id         uuid null,
  lot_id           uuid null,
  constraint founder_invites_window_check check (expires_at > created_at),
  constraint founder_invites_redeemed_check check ((redeemed_by is null) = (redeemed_at is null))
);

create index if not exists founder_invites_founder_month_idx
  on public.founder_invites (founder_user_id, month_key);

comment on table public.founder_invites is
  'Founder monthly invites (20261203_20, owner Q144 أ): the invitee of a code gets a library trial and points. Server only: RLS on, no policy. Written by founder_invite_create / founder_invite_redeem.';

alter table public.founder_invites enable row level security;
revoke all on public.founder_invites from public, anon, authenticated;
grant select, insert, update, delete on public.founder_invites to service_role;

-- ── 3. create ────────────────────────────────────────────────────────────────
create or replace function public.founder_invite_create(p_founder uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_set   record;
  v_seat  uuid;
  v_month text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM');
  v_used  int;
  v_code  text;
  v_row   public.founder_invites%rowtype;
begin
  if p_founder is null then
    raise exception 'founder_invite_create: p_founder is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('founder_invites:' || p_founder::text));

  select s.id into v_seat
    from public.founder_seats s
   where s.campaign_id = 'founder-2026' and s.user_id = p_founder
     and s.status = 'active' and coalesce(s.ends_at > now(), false)
   limit 1;
  if v_seat is null then
    return jsonb_build_object('result', 'not_founder');
  end if;

  select * into v_set from public.founder_invite_settings();
  select count(*) into v_used
    from public.founder_invites i
   where i.founder_user_id = p_founder and i.month_key = v_month;
  if v_used >= v_set.monthly then
    return jsonb_build_object('result', 'limit', 'used', v_used, 'monthly', v_set.monthly);
  end if;

  -- 16 hex characters of a random UUID (60 random bits; the version nibble is
  -- fixed); a clash is retried, never surfaced
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    exit when not exists (select 1 from public.founder_invites i where i.code = v_code);
  end loop;

  insert into public.founder_invites (code, founder_user_id, seat_id, month_key, expires_at)
  values (v_code, p_founder, v_seat, v_month, now() + v_set.valid_days * interval '1 day')
  returning * into v_row;

  return jsonb_build_object('result', 'ok', 'id', v_row.id, 'code', v_row.code,
                            'expires_at', v_row.expires_at, 'used', v_used + 1, 'monthly', v_set.monthly);
end $$;

comment on function public.founder_invite_create(uuid) is
  'Creates one founder invite (20261203_20, owner Q144 أ) under a per-founder lock: not_founder (no active, unexpired founder seat) | limit {used, monthly} (invites created this Riyadh month ≥ founder_invites.monthly) | ok {id, code, expires_at, used, monthly}. The payment-gateway rule is the caller''s. Service role only.';

-- ── 4. redeem ────────────────────────────────────────────────────────────────
create or replace function public.founder_invite_redeem(p_user uuid, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code   text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_inv    public.founder_invites%rowtype;
  v_set    record;
  v_lp     record;
  v_since  timestamptz;
  v_grant  jsonb;
  v_ends   timestamptz;
  v_lot    uuid := null;
begin
  if p_user is null then
    raise exception 'founder_invite_redeem: p_user is required' using errcode = '22023';
  end if;
  if v_code !~ '^[0-9A-F]{16}$' then
    return jsonb_build_object('result', 'invalid');
  end if;

  -- one redemption per invitee at a time (two codes at once cannot both pass
  -- the not_new check); then the invite row itself
  perform pg_advisory_xact_lock(hashtext('founder_invite_redeem:' || p_user::text));

  select * into v_inv from public.founder_invites i where i.code = v_code for update;
  if v_inv.id is null then
    return jsonb_build_object('result', 'invalid');
  end if;
  if v_inv.redeemed_by is not null then
    if v_inv.redeemed_by = p_user then
      return jsonb_build_object('result', 'already_redeemed');
    end if;
    return jsonb_build_object('result', 'used');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('result', 'expired');
  end if;
  if v_inv.founder_user_id = p_user then
    return jsonb_build_object('result', 'self');
  end if;
  if not exists (select 1 from public.founder_seats s
                  where s.campaign_id = 'founder-2026' and s.user_id = v_inv.founder_user_id
                    and s.status = 'active' and coalesce(s.ends_at > now(), false)) then
    return jsonb_build_object('result', 'founder_inactive');
  end if;

  select lp.verification_status, lp.practice_kind into v_lp
    from public.lawyer_profiles lp where lp.user_id = p_user;
  if v_lp.verification_status = 'pending' and v_lp.practice_kind is not distinct from 'advocate' then
    return jsonb_build_object('result', 'pending_verification');
  end if;
  if not coalesce(v_lp.verification_status = 'verified' and v_lp.practice_kind = 'advocate', false) then
    return jsonb_build_object('result', 'not_lawyer');
  end if;

  -- «جدد لم يسبق لهم التسجيل»: the account was created at or after the
  -- invite, took no founder invite before and never had a library grant
  select p.created_at into v_since from public.profiles p where p.id = p_user;
  if v_since is null or v_since < v_inv.created_at
     or exists (select 1 from public.founder_invites i where i.redeemed_by = p_user)
     or exists (select 1 from public.library_access_grants g where g.user_id = p_user) then
    return jsonb_build_object('result', 'not_new');
  end if;

  select * into v_set from public.founder_invite_settings();
  v_grant := public.library_grant_access(p_user, 'lib-trial', 'founder_campaign', v_set.trial_days,
                                         null, null, null, 'founder invite ' || v_inv.id::text);
  v_ends := (v_grant ->> 'ends_at')::timestamptz;
  if v_set.points > 0 then
    v_lot := public.credit_wallet_points(p_user, v_set.points, 'gift', v_ends, null,
                                         'founder_invite:' || v_inv.id::text, v_set.points_scope);
  end if;

  update public.founder_invites
     set redeemed_by = p_user, redeemed_at = now(),
         grant_id = (v_grant ->> 'id')::uuid, lot_id = v_lot
   where id = v_inv.id;

  return jsonb_build_object('result', 'ok', 'trial_ends_at', v_ends, 'trial_days', v_set.trial_days,
                            'points', v_set.points, 'points_scope', v_set.points_scope,
                            'grant_id', v_grant ->> 'id', 'lot_id', v_lot);
end $$;

comment on function public.founder_invite_redeem(uuid, text) is
  'Redeems a founder invite (20261203_20, owner Q144 أ): invalid | expired | used | already_redeemed | self | founder_inactive | pending_verification | not_lawyer (not a verified advocate) | not_new (account older than the invite, a founder invite taken before, or any library grant) | ok {trial_ends_at, trial_days, points, points_scope, grant_id, lot_id}. ok = library_grant_access lib-trial / founder_campaign for trial_days + credit_wallet_points gift lot expiring with the trial. The payment-gateway rule is the caller''s. Service role only.';

-- ── 5. privileges: service role only ─────────────────────────────────────────
do $gr$
declare
  fn text;
begin
  foreach fn in array array[
    'public.founder_invite_settings()',
    'public.founder_invite_create(uuid)',
    'public.founder_invite_redeem(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$gr$;

-- ── 6. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  fn  text;
  def text;
  s   record;
begin
  -- A: a hold is live only while reserved_until > now() in every latest body
  foreach fn in array array['public.founder_reserve_seat(uuid, uuid)', 'public.founder_activate(uuid)',
                            'public.founder_seat_summary()'] loop
    def := coalesce(pg_catalog.pg_get_functiondef(to_regprocedure(fn)), '');
    -- the strict test is there, and no loosened one (>=, or now() shifted by an interval)
    if pg_catalog.strpos(def, 'reserved_until > now()') = 0
       or def ~ 'reserved_until\s*>='
       or def ~ 'reserved_until\s*>\s*\(?\s*now\(\)\s*[-+]' then
      raise exception 'l13_founder verify: % does not free a hold at exactly reserved_until', fn;
    end if;
  end loop;
  if pg_catalog.strpos(coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.founder_release_expired()')), ''),
                       'reserved_until <= now()') = 0 then
    raise exception 'l13_founder verify: founder_release_expired does not release at reserved_until';
  end if;

  -- B: setting, table locked to the server, functions service role only
  if not exists (select 1 from public.platform_settings where key = 'founder_invites') then
    raise exception 'l13_founder verify: the founder_invites setting is missing';
  end if;
  select * into s from public.founder_invite_settings();
  if coalesce(s.monthly, 0) < 1 or coalesce(s.trial_days, 0) < 1 or s.points is null
     or coalesce(s.points_scope, '') not in ('general', 'library_agent') or coalesce(s.valid_days, 0) < 1 then
    raise exception 'l13_founder verify: founder_invite_settings() gave no usable row';
  end if;
  if not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = 'public.founder_invites'::regclass), false)
     or has_table_privilege('anon', 'public.founder_invites', 'SELECT')
     or has_table_privilege('authenticated', 'public.founder_invites', 'SELECT')
     or exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'founder_invites') then
    raise exception 'l13_founder verify: public.founder_invites is open to sessions';
  end if;
  foreach fn in array array['public.founder_invite_settings()', 'public.founder_invite_create(uuid)',
                            'public.founder_invite_redeem(uuid, text)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')
       or not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'l13_founder verify: % privileges are wrong', fn;
    end if;
  end loop;
  raise notice 'l13_founder verify: OK — holds free at exactly reserved_until (reserve / activate / summary), founder invites: % a month, % days library trial + % points (%), codes valid % days, server only',
    s.monthly, s.trial_days, s.points, s.points_scope, s.valid_days;
end
$verify$;

commit;

select '20261203_20 l13 founder: 15-minute hold pinned, founder invites (library trial + points)' as migration,
       (to_regprocedure('public.founder_invite_create(uuid)') is not null
        and to_regprocedure('public.founder_invite_redeem(uuid, text)') is not null
        and exists (select 1 from public.platform_settings where key = 'founder_invites')) as ok;
