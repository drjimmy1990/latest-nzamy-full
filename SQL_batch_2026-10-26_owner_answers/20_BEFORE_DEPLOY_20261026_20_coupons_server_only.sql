-- =============================================================================
-- Migration: 20261026_20_coupons_server_only.sql
-- =============================================================================
-- PURPOSE (owner answers of 25 Oct 2026, phase P7 — pricing doc §13أ; answer
-- ٢٧٩: no stacking)
--   Coupons are checked on the server only. Before this file:
--     * public.coupons had the policy «anyone can read active coupons»
--       (20260603_phase1_003:212-213): every visitor could list every live
--       code with its value, and /api/v1/wallet showed the whole list to every
--       signed-in client;
--     * public.coupon_usage let any signed-in user INSERT rows for himself
--       («users create own coupon usage», :221-223);
--     * nothing enforced the owner's rules: NZAMY50 needs a net order of
--       200 SAR, NEWCLIENT 300 SAR (and is for a first single-service order),
--       any coupon is capped at 25 % of the net, once per user, and never
--       applies to point top-ups, government fees or already-discounted items.
--   The code side (src/lib/payments/couponRules.ts, couponServer.ts) applies a
--   coupon INSIDE the checkout order (the stored net / VAT / total already
--   include it; VAT is 15 % of the discounted net) and records coupon_usage
--   only when the order is PAID (fulfilment). This file gives the database the
--   same rules and closes the tables to sessions.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. lock_timeout 5s. On "canceling statement due to lock timeout" nothing
--      changed — run it again a moment later.
--   2. Refuses to run unless coupons and coupon_usage exist (20260603_phase1_003),
--      and STOPS — naming them — when coupon_usage already holds two rows for
--      one (coupon, user) or for one order: the unique guards below could not
--      be built, and which row is the real one is a person's call. Nothing is
--      deleted.
--   3. Drops EVERY policy on coupons and coupon_usage (whatever it is called),
--      keeps RLS on, and revokes every privilege of anon and authenticated on
--      both tables and on the coupon_usage id sequence. Only the service role
--      (the server routes) reads or writes them.
--   4. coupons gains
--        max_discount_pct numeric(5,2) NOT NULL DEFAULT 25, CHECK 0 < x <= 25
--          — the owner's ceiling for any marketing coupon (§13أ.3);
--        excluded_kinds text[] NOT NULL DEFAULT '{topup}', CHECK it holds only
--          plan / library / topup / service and always holds topup
--          (no coupon on a point top-up, ever).
--      Government fees are never part of a platform order, so no coupon can
--      reach them; already-discounted items are refused in code
--      (couponRules.ts: an item with a launch / campaign price).
--   5. coupon_usage gains two unique guards: one row per (coupon, user)
--      (once per user) and one row per order (a fulfilment retry records the
--      same order once).
--   6. A trigger keeps coupons.used_count = the number of coupon_usage rows
--      added since (max_uses is checked against it).
--   7. The two owner codes get his rules (§13أ.1–2): NZAMY50 fixed 50 SAR,
--      min net 200; NEWCLIENT fixed 75 SAR, min net 300, single services only
--      (excluded_kinds plan / library / topup — checkout sells no single
--      service today, so it cannot be used online yet). Both: 25 % cap, once
--      per user. A missing row is created with the old seed's dates; an
--      existing row keeps its active flag and dates (an admin may have
--      switched it off). No other code is created.
--   7b. Every OTHER active code not created on the admin coupons page
--      (metadata.created_by_admin) is SWITCHED OFF, values kept, named in a
--      NOTICE and stamped metadata.switched_off: before P7 nothing redeemed a
--      code, after the deploy checkout honours every active row, and the old
--      seed's LAUNCH2026 (25 % off, 500 uses, no minimum, public until now)
--      is not one of the owner's two. An admin may switch it back on from the
--      coupons page; a re-run skips a stamped row, so it does not undo that.
--   8. Every new column, index and the trigger carry the literal
--      "20261026_20" — the marker _verify.sql reads. Raising verify; then
--      `notify pgrst` after commit.
--
-- DEPLOY ORDER — BEFORE THE DEPLOY OF THIS BATCH (file 20_BEFORE_DEPLOY_…).
--   The code works before AND after it: until max_discount_pct exists, the
--   checkout page hides the coupon field, POST /api/v1/coupons/validate
--   answers «الكوبونات غير متاحة حالياً» and checkout refuses a coupon code
--   (400) rather than charging the full price. /api/v1/wallet no longer reads
--   the coupons at all. NOTHING GATES THE DEPLOY: deploy.sh does not run
--   _verify.sql; its section verify:coupons_server_only is a MANUAL check.
--   Until this file runs, the codes stay readable by anyone through the REST
--   API (the old policy) — run it before or with the deploy.
--
-- ROLLBACK (re-opens the codes to every visitor — only with the owner's yes)
--   drop trigger if exists trg_coupon_usage_count on public.coupon_usage;
--   drop function if exists public.coupon_usage_count();
--   drop index if exists public.coupon_usage_coupon_user_key, public.coupon_usage_order_key;
--   alter table public.coupons drop column max_discount_pct, drop column excluded_kinds;
--   create policy "anyone can read active coupons" on public.coupons for select using (active = true);
--   grant select on public.coupons to anon, authenticated;
--   update public.coupons set active = true where metadata->>'switched_off' like '%20261026_20%';  -- only with the owner's yes
--   and remove the verify:coupons_server_only section from _verify.sql.
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 1. Prerequisites, and no duplicate redemption ──────────────────────────
do $$
declare
  bad text;
begin
  if to_regclass('public.coupons') is null or to_regclass('public.coupon_usage') is null then
    raise exception '20261026_20: public.coupons / public.coupon_usage do not exist — run 20260603_phase1_003_subscriptions_billing.sql first';
  end if;

  select string_agg(format('coupon %s / user %s (%s rows)', coupon_id, user_id, n), '; ') into bad
    from (select coupon_id, user_id, count(*) as n from public.coupon_usage
           group by coupon_id, user_id having count(*) > 1) d;
  if bad is not null then
    raise exception '20261026_20: coupon_usage holds more than one row for: % — nothing changed; look at those rows first (once per user)', bad;
  end if;

  select string_agg(format('order %s (%s rows)', order_id, n), '; ') into bad
    from (select order_id, count(*) as n from public.coupon_usage
           where order_id is not null group by order_id having count(*) > 1) d;
  if bad is not null then
    raise exception '20261026_20: coupon_usage holds more than one row for: % — nothing changed; look at those rows first', bad;
  end if;
end $$;

-- ── 2. No session reads or writes either table ──────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select p.polname, p.polrelid::regclass as tbl
      from pg_policy p
     where p.polrelid in ('public.coupons'::regclass, 'public.coupon_usage'::regclass)
  loop
    execute format('drop policy %I on %s', r.polname, r.tbl);
  end loop;
end $$;

alter table public.coupons      enable row level security;
alter table public.coupon_usage enable row level security;

revoke all on table public.coupons, public.coupon_usage from public, anon, authenticated;
grant  all on table public.coupons, public.coupon_usage to service_role;

do $$
declare
  seq text := pg_get_serial_sequence('public.coupon_usage', 'id');
begin
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
    execute format('grant usage, select on sequence %s to service_role', seq);
  end if;
end $$;

comment on table public.coupons is
  '20261026_20: server only (service role). No policy, no anon / authenticated privilege: codes are never listed to sessions. Rules: src/lib/payments/couponRules.ts.';
comment on table public.coupon_usage is
  '20261026_20: server only (service role). One row per (coupon, user) and per order, written by fulfilment when the order is PAID.';

-- ── 3. The owner's ceiling and exclusions ───────────────────────────────────
alter table public.coupons
  add column if not exists max_discount_pct numeric(5,2) not null default 25,
  add column if not exists excluded_kinds   text[]       not null default '{topup}';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.coupons'::regclass and conname = 'coupons_max_discount_pct_check') then
    alter table public.coupons
      add constraint coupons_max_discount_pct_check check (max_discount_pct > 0 and max_discount_pct <= 25);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.coupons'::regclass and conname = 'coupons_excluded_kinds_check') then
    alter table public.coupons
      add constraint coupons_excluded_kinds_check
      check (excluded_kinds <@ array['plan', 'library', 'topup', 'service']::text[]
             and 'topup' = any (excluded_kinds));
  end if;
end $$;

comment on column public.coupons.max_discount_pct is
  '20261026_20 (pricing doc 25 Oct §13أ.3): the discount never exceeds this percentage of the order net before VAT; at most 25.';
comment on column public.coupons.excluded_kinds is
  '20261026_20 (§13أ.3): payment_orders.kind values the coupon never applies to; always includes topup (no coupon on a point top-up).';

-- ── 4. Once per user, once per order ────────────────────────────────────────
create unique index if not exists coupon_usage_coupon_user_key on public.coupon_usage (coupon_id, user_id);
create unique index if not exists coupon_usage_order_key on public.coupon_usage (order_id) where order_id is not null;
comment on index public.coupon_usage_coupon_user_key is '20261026_20: a coupon is redeemed once per user (owner, pricing doc §13أ.3).';
comment on index public.coupon_usage_order_key is '20261026_20: an order records its coupon once (a fulfilment retry inserts nothing new).';

-- ── 5. used_count follows coupon_usage ──────────────────────────────────────
create or replace function public.coupon_usage_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.coupons set used_count = used_count + 1, updated_at = now() where id = new.coupon_id;
  return new;
end;
$$;
comment on function public.coupon_usage_count() is '20261026_20: bumps coupons.used_count for each coupon_usage row (max_uses is checked against it).';
revoke all on function public.coupon_usage_count() from public, anon, authenticated;

drop trigger if exists trg_coupon_usage_count on public.coupon_usage;
create trigger trg_coupon_usage_count
  after insert on public.coupon_usage
  for each row execute function public.coupon_usage_count();
comment on trigger trg_coupon_usage_count on public.coupon_usage is '20261026_20: keeps coupons.used_count in step with coupon_usage.';

-- ── 6. The owner's two codes ────────────────────────────────────────────────
insert into public.coupons
  (code, discount_type, discount_value, min_order_amount, max_uses, max_uses_per_user,
   valid_until, active, max_discount_pct, excluded_kinds, metadata)
values
  ('NZAMY50',   'fixed', 50, 200, null, 1, '2027-12-31T23:59:59Z', true, 25, '{topup}',
   '{"rules": "20261026_20 — pricing doc 25 Oct §13أ.1: 50 SAR off a net order of 200 SAR or more"}'::jsonb),
  ('NEWCLIENT', 'fixed', 75, 300, null, 1, '2027-12-31T23:59:59Z', true, 25, '{plan,library,topup}',
   '{"rules": "20261026_20 — pricing doc 25 Oct §13أ.2: 75 SAR off a first single-service order of 300 SAR net or more"}'::jsonb)
on conflict (code) do update
   set discount_type     = excluded.discount_type,
       discount_value    = excluded.discount_value,
       min_order_amount  = excluded.min_order_amount,
       max_uses_per_user = 1,
       max_discount_pct  = 25,
       excluded_kinds    = excluded.excluded_kinds,
       metadata          = public.coupons.metadata || excluded.metadata,
       updated_at        = now();

-- ── 6b. Every other seeded code is switched off (values kept) ──────────────
-- Before P7 nothing could redeem a code; from the deploy on, checkout honours
-- every ACTIVE row. The owner approved two codes (§13أ). LAUNCH2026 (old seed:
-- 25 % off, 500 uses, no minimum — and readable by anyone until now) and any
-- other row put in by SQL would go live silently, so they are switched off
-- here: active = false, nothing else changed, the code named in a NOTICE and
-- stamped metadata.switched_off. Coupons an admin created on the coupons page
-- (metadata.created_by_admin) are his deliberate choice and are left alone.
-- An admin may switch any of these back on from the coupons page; a re-run
-- skips a row that carries the stamp, so it does not undo that.
do $$
declare
  off text;
begin
  with switched as (
    update public.coupons
       set active     = false,
           metadata   = metadata || jsonb_build_object('switched_off',
                          '20261026_20 — not one of the owner''s two codes (pricing doc 25 Oct §13أ); values kept; an admin may switch it back on'),
           updated_at = now()
     where active
       and code not in ('NZAMY50', 'NEWCLIENT')
       and not (metadata ? 'created_by_admin')
       and coalesce(metadata->>'switched_off', '') not like '%20261026_20%'
    returning code
  )
  select string_agg(code, ', ' order by code) into off from switched;
  raise notice '20261026_20: switched off (not the owner''s codes; values kept): %', coalesce(off, 'none');
end $$;

-- ── 7. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  missing text := '';
  r       text;
  p       text;
  t       text;
  c       record;
begin
  foreach t in array array['public.coupons', 'public.coupon_usage'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      missing := missing || format(' %s has RLS off;', t);
    end if;
    if exists (select 1 from pg_policy where polrelid = t::regclass) then
      missing := missing || format(' %s still has a policy;', t);
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege(r, t, p) then
          missing := missing || format(' %s holds %s on %s;', r, p, t);
        end if;
      end loop;
    end loop;
  end loop;

  if coalesce(col_description('public.coupons'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.coupons'::regclass and attname = 'max_discount_pct')), '')
     not like '%20261026_20%' then
    missing := missing || ' coupons.max_discount_pct is missing or lacks its comment;';
  end if;
  if coalesce(col_description('public.coupons'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.coupons'::regclass and attname = 'excluded_kinds')), '')
     not like '%20261026_20%' then
    missing := missing || ' coupons.excluded_kinds is missing or lacks its comment;';
  end if;
  if exists (select 1 from public.coupons where max_discount_pct > 25 or not ('topup' = any (excluded_kinds))) then
    missing := missing || ' a coupon exceeds the 25 % cap or applies to top-ups;';
  end if;

  if to_regclass('public.coupon_usage_coupon_user_key') is null
     or pg_get_indexdef('public.coupon_usage_coupon_user_key'::regclass) not like 'CREATE UNIQUE INDEX%(coupon_id, user_id)%' then
    missing := missing || ' the unique (coupon_id, user_id) guard is missing;';
  end if;
  if to_regclass('public.coupon_usage_order_key') is null
     or pg_get_indexdef('public.coupon_usage_order_key'::regclass) not like 'CREATE UNIQUE INDEX%(order_id)%' then
    missing := missing || ' the unique order_id guard is missing;';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.coupon_usage'::regclass and tgname = 'trg_coupon_usage_count' and not tgisinternal) then
    missing := missing || ' trg_coupon_usage_count is missing;';
  end if;

  for c in
    select * from (values ('NZAMY50', 50::numeric, 200::numeric, '{topup}'::text[]),
                          ('NEWCLIENT', 75::numeric, 300::numeric, '{plan,library,topup}'::text[])) v(code, val, mn, ex)
  loop
    if not exists (select 1 from public.coupons k
                    where k.code = c.code and k.discount_type = 'fixed' and k.discount_value = c.val
                      and k.min_order_amount = c.mn and k.max_uses_per_user = 1 and k.max_discount_pct = 25
                      and k.excluded_kinds @> c.ex and c.ex @> k.excluded_kinds) then
      missing := missing || format(' %s does not carry the owner''s rules;', c.code);
    end if;
  end loop;

  if exists (select 1 from public.coupons
              where active and code not in ('NZAMY50', 'NEWCLIENT')
                and not (metadata ? 'created_by_admin')
                and coalesce(metadata->>'switched_off', '') not like '%20261026_20%') then
    missing := missing || ' a seeded code other than the owner''s two is still active;';
  end if;

  if missing <> '' then
    raise exception '20261026_20 verify:%', missing;
  end if;
  raise notice '20261026_20 verify: OK — coupons and coupon_usage are server only (no policy, no anon / authenticated privilege); 25 %% cap and top-up exclusion on every coupon; once per user and once per order guarded; NZAMY50 (50 SAR, min 200) and NEWCLIENT (75 SAR, min 300, single services) carry the owner''s rules; other seeded codes switched off';
end $$;

commit;

notify pgrst, 'reload schema';
