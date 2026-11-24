-- =============================================================================
-- Migration: 20261204_60_l14_paygate.sql   (verify id: l14_paygate)
-- =============================================================================
-- PURPOSE (batch l14 — owner package of 23 Nov, 00 §٤ / §٢-٣ and 11 §٦:
-- «قبل تفعيل الدفع»)
--
--   1. Discount codes up to 100 % with a mandatory purpose «الغرض»:
--        coupons.purpose text — CHECK coupons_purpose_check: null (a code
--          saved before this file) or 3–500 characters after trimming;
--        coupons_max_discount_pct_check (20261026_20: 0 < x <= 25) is
--          replaced by 0 < x <= 100. The column's DEFAULT stays 25 (owner
--          ١٥٥: the general rule is unchanged);
--        coupons_high_discount_purpose_check: a cap above 25 needs a purpose
--          (max_discount_pct <= 25 or purpose is not null).
--      The admin routes require the purpose on every NEW code
--      (couponAdminRules.couponPurpose). A code that covers the whole price
--      is refused at checkout without a saved card and is not activated yet
--      (src/lib/payments/fullDiscount.ts) — nothing here changes
--      payment_orders (its total stays > 0).
--   2. The library device limit is one device or two (owner ٢٠٧: «جهاز واحد
--      أو جهازان»): library_monitor_settings_device_limit_check (20261108_20:
--      1–10) becomes 1–2. A stored number above 2 is set to 2 first (named in
--      a NOTICE). device_limit_enabled is NOT touched — it stays as the admin
--      left it (OFF by default).
--   Every new or replaced object carries the literal "20261204_60" in its
--   comment — the marker the verify blocks read. No privilege changes: coupons
--   stays server-only (no anon / authenticated grant, 20261026_20).
--
-- ORDER: after 20261026_20 and 20261108_20 (stops with a clear message before
--        them); order-free against the other l14 files. BEFORE the deploy of
--        batch l14 (the admin coupon routes write coupons.purpose; before this
--        file they answer 503 «حقل الغرض غير متاح…» and save nothing; the
--        device-limit route already refuses anything but 1 or 2).
-- SAFE TO RE-RUN: yes. 20261108_20 and 20261026_20 were made re-run safe
--        against this file in the same batch (the device CHECK is added only
--        when missing; the old verify accepts a cap up to 100).
-- ROLLBACK (only with the owner's yes; a code above 25 % must be lowered first):
--   alter table public.coupons drop constraint if exists coupons_high_discount_purpose_check;
--   alter table public.coupons drop constraint if exists coupons_max_discount_pct_check;
--   alter table public.coupons add constraint coupons_max_discount_pct_check
--     check (max_discount_pct > 0 and max_discount_pct <= 25);
--   alter table public.coupons drop constraint if exists coupons_purpose_check;
--   alter table public.coupons drop column if exists purpose;
--   alter table public.library_monitor_settings drop constraint if exists library_monitor_settings_device_limit_check;
--   alter table public.library_monitor_settings add constraint library_monitor_settings_device_limit_check
--     check (device_limit between 1 and 10);
-- =============================================================================

begin;
set local lock_timeout = '5s';

do $pre$
begin
  if to_regclass('public.coupons') is null then
    raise exception '20261204_60: public.coupons is missing (run 20260603_phase1_003_subscriptions_billing.sql first)';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'coupons' and column_name = 'max_discount_pct') then
    raise exception '20261204_60: coupons.max_discount_pct is missing (run 20261026_20_coupons_server_only.sql first)';
  end if;
  if to_regclass('public.library_monitor_settings') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'library_monitor_settings' and column_name = 'device_limit') then
    raise exception '20261204_60: library_monitor_settings.device_limit is missing (run 20261108_20_library_device_limit.sql first)';
  end if;
end
$pre$;

-- ── 1. coupons: the purpose, and the 100 % ceiling ──────────────────────────
alter table public.coupons add column if not exists purpose text;

alter table public.coupons drop constraint if exists coupons_purpose_check;
alter table public.coupons add constraint coupons_purpose_check
  check (purpose is null or char_length(btrim(purpose)) between 3 and 500);

alter table public.coupons drop constraint if exists coupons_max_discount_pct_check;
alter table public.coupons add constraint coupons_max_discount_pct_check
  check (max_discount_pct > 0 and max_discount_pct <= 100);

alter table public.coupons drop constraint if exists coupons_high_discount_purpose_check;
alter table public.coupons add constraint coupons_high_discount_purpose_check
  check (max_discount_pct <= 25 or purpose is not null);

comment on column public.coupons.purpose is
  '20261204_60 (batch l14, owner item 67أ): why the code exists «الغرض» — required for every code created from the admin page; null only on codes saved before. A cap above 25 needs it (coupons_high_discount_purpose_check).';
comment on constraint coupons_max_discount_pct_check on public.coupons is
  '20261204_60: 0 < max_discount_pct <= 100 (was <= 25, 20261026_20). The default stays 25 (owner ١٥٥).';
comment on constraint coupons_high_discount_purpose_check on public.coupons is
  '20261204_60: a cap above 25 % needs a purpose.';
comment on constraint coupons_purpose_check on public.coupons is
  '20261204_60: the purpose is 3–500 characters after trimming, or null (a code saved before).';

-- ── 2. the library device limit: one device or two ──────────────────────────
do $dev$
declare
  n int;
begin
  update public.library_monitor_settings set device_limit = 2 where device_limit > 2;
  get diagnostics n = row_count;
  if n > 0 then
    raise notice '20261204_60: % library settings row(s) had a device limit above 2 — set to 2 (device_limit_enabled untouched)', n;
  end if;
  update public.library_monitor_settings set device_limit = 1 where device_limit < 1;
end
$dev$;

alter table public.library_monitor_settings drop constraint if exists library_monitor_settings_device_limit_check;
alter table public.library_monitor_settings add constraint library_monitor_settings_device_limit_check
  check (device_limit between 1 and 2);
comment on constraint library_monitor_settings_device_limit_check on public.library_monitor_settings is
  '20261204_60 (owner ٢٠٧): one device or two (was 1–10, 20261108_20).';

-- ── 3. verify ───────────────────────────────────────────────────────────────
do $v$
declare
  def text;
  missing text := '';
  r text;
  p text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'coupons' and column_name = 'purpose') then
    missing := missing || ' coupons.purpose is missing;';
  end if;
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.coupons'::regclass and conname = 'coupons_max_discount_pct_check';
  if coalesce(def, '') not like '%max_discount_pct > %0%max_discount_pct <= %100%' then
    missing := missing || format(' coupons_max_discount_pct_check is not 0 < x <= 100 (%s);', coalesce(def, 'missing'));
  end if;
  if coalesce(obj_description((select oid from pg_constraint where conrelid = 'public.coupons'::regclass
                                 and conname = 'coupons_high_discount_purpose_check'), 'pg_constraint'), '') not like '%20261204_60%' then
    missing := missing || ' coupons_high_discount_purpose_check is missing;';
  end if;
  if coalesce(obj_description((select oid from pg_constraint where conrelid = 'public.coupons'::regclass
                                 and conname = 'coupons_purpose_check'), 'pg_constraint'), '') not like '%20261204_60%' then
    missing := missing || ' coupons_purpose_check is missing;';
  end if;
  if exists (select 1 from public.coupons where max_discount_pct > 25 and purpose is null) then
    missing := missing || ' a coupon above 25 % has no purpose;';
  end if;
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.library_monitor_settings'::regclass and conname = 'library_monitor_settings_device_limit_check';
  if coalesce(def, '') not like '%device_limit >= 1%device_limit <= 2%' then
    missing := missing || format(' the device limit is not 1–2 (%s);', coalesce(def, 'missing'));
  end if;
  if exists (select 1 from public.library_monitor_settings where device_limit not between 1 and 2) then
    missing := missing || ' a library settings row holds a device limit outside 1–2;';
  end if;
  -- coupons stays server-only (20261026_20): no session privilege came back
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(r, 'public.coupons', p) then
        missing := missing || format(' %s holds %s on public.coupons;', r, p);
      end if;
    end loop;
  end loop;
  if missing <> '' then
    raise exception '20261204_60 verify:%', missing;
  end if;
  raise notice 'l14_paygate verify: OK — coupons carry a purpose, the cap goes up to 100 %% (above 25 only with a purpose), the library device limit is one or two (switch untouched)';
end
$v$;

commit;

notify pgrst, 'reload schema';

select '20261204_60 coupons purpose + 100 % ceiling; library device limit 1–2' as migration, true as ok;
