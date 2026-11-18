-- =============================================================================
-- Migration: 20261128_10_payref_settings.sql
-- =============================================================================
-- PURPOSE (batch l8 payref — owner 18 Nov 2026 evening, message items 1 and 7,
-- decisions ٥٣ ٥٦ and «مدة خصم المؤسس»). Settings only: no table, no function.
--
--   1. founder_topup_discount_expires — how long the founder's top-up discount
--      runs. Batch l7 made it lifetime; the owner reverted that: the discount
--      runs for the MEMBERSHIP YEAR from activation. Seeded as
--        {"months_after_activation": 12}
--      The admin may set another month count (0 = off) or a fixed last day
--      {"until": "YYYY-MM-DD"} (Riyadh). Read by
--      src/lib/payments/founderDiscount.ts (founderDiscountWindow); a missing
--      or malformed row reads as 12 months — never lifetime.
--
--   2. firm_extra_seat_price_sar — ٥٣: an extra firm seat's price, SAR before
--      VAT. Seeded {"sar": null} (not set). Stored only: no public page reads
--      it and it is not sold online (firm seats stay 5 / 15, extra seats via
--      sales). An object, because platform_settings.value is NOT NULL jsonb.
--
--   3. min_topup_by_account_type — ٥٦: individual 100. 20261127_40 seeded the
--      map without `individual`; this adds {"individual": 100} ONLY when the
--      stored map has no `individual` key (an admin's own value is kept).
--      A missing row is inserted with the full map.
--
--   4. founder_topup_discount_bps — its stored description said the discount
--      was «مدى الحياة» (20261127_10). Rewritten; the value is not touched.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261128_10_payref_settings.sql
--   Expect: NOTICE  l8_payref verify: OK  and a row with `t`.
--   Then run the `-- >>> verify:l8_payref` block of supabase/migrations/_verify.sql.
--
-- RUN ORDER: either order with the deploy. The code reads every key with a
--   default equal to what this file seeds (12 months; {"sar": null};
--   individual 100), so before this file runs the site already behaves as
--   decided; the admin card shows «القيمة الافتراضية — لم تُحفظ بعد» for an
--   absent key. The old code ignores the new keys.
--   Idempotent: inserts are ON CONFLICT DO NOTHING, the merge only adds a
--   missing key, the description update is a fixed text.
--
-- ROLLBACK:
--   delete from public.platform_settings where key in ('founder_topup_discount_expires', 'firm_extra_seat_price_sar');
--   update public.platform_settings set value = value - 'individual' where key = 'min_topup_by_account_type';
--   (the old description of founder_topup_discount_bps is not restored: it was wrong.)
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261128_10: public.platform_settings is missing (run 20260627_platform_settings.sql first)';
  end if;
end
$pre$;

-- ── 1 + 2. new settings ──────────────────────────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('founder_topup_discount_expires', '{"months_after_activation": 12}'::jsonb,
   'مدة خصم العضو المؤسس على شحن النقاط: {"months_after_activation": عدد الأشهر من تفعيل العضوية} (١٢ = سنة العضوية، ٠ = إيقاف) أو {"until": "YYYY-MM-DD"} آخر يوم للخصم بتوقيت الرياض. الخصم على الشحن وحده (20261128_10)'),
  ('firm_extra_seat_price_sar', '{"sar": null}'::jsonb,
   'سعر المقعد الإضافي للمكاتب بالريال قبل الضريبة، أو null حتى يحدده المالك. يُحفظ فقط: لا يُعرض علناً ولا يُباع عبر الموقع (20261128_10)')
on conflict (key) do nothing;

-- ── 3. ٥٦: individual 100 ────────────────────────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('min_topup_by_account_type',
   '{"lawyer": 500, "firm": 500, "corporate": 500, "micro": 500, "government": 500, "ngo": 500, "provider": 500, "individual": 100}'::jsonb,
   'الحد الأدنى للشحن بالريال قبل الخصم والضريبة لكل نوع حساب؛ النوع غير المذكور بلا حد أدنى (20261127_40، الفرد ١٠٠ منذ 20261128_10)')
on conflict (key) do nothing;

update public.platform_settings
   set value = value || '{"individual": 100}'::jsonb,
       updated_at = now()
 where key = 'min_topup_by_account_type'
   and pg_catalog.jsonb_typeof(value) = 'object'
   and not (value ? 'individual');

-- ── 4. the discount rate's description: no «lifetime» ───────────────────────
update public.platform_settings
   set description = 'خصم العضو المؤسس على شحن النقاط وحده بنقاط الأساس (١٥٠٠ = ١٥٪)، طوال المدة التي يحددها founder_topup_discount_expires (سنة العضوية من التفعيل)، ويسقط إن استُرد المقعد أو أُلغي (20261127_10، 20261128_10)'
 where key = 'founder_topup_discount_bps'
   and description is distinct from 'خصم العضو المؤسس على شحن النقاط وحده بنقاط الأساس (١٥٠٠ = ١٥٪)، طوال المدة التي يحددها founder_topup_discount_expires (سنة العضوية من التفعيل)، ويسقط إن استُرد المقعد أو أُلغي (20261127_10، 20261128_10)';

-- ── 5. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  v jsonb;
begin
  select value into v from public.platform_settings where key = 'founder_topup_discount_expires';
  if v is null or pg_catalog.jsonb_typeof(v) <> 'object' then
    raise exception 'l8_payref verify: founder_topup_discount_expires is missing or not an object';
  end if;
  if not (v ? 'months_after_activation' or v ? 'until') then
    raise exception 'l8_payref verify: founder_topup_discount_expires has neither months_after_activation nor until';
  end if;
  select value into v from public.platform_settings where key = 'firm_extra_seat_price_sar';
  if v is null or not (v ? 'sar') then
    raise exception 'l8_payref verify: firm_extra_seat_price_sar is missing or has no "sar" key';
  end if;
  select value into v from public.platform_settings where key = 'min_topup_by_account_type';
  if v is null or not (v ? 'individual') then
    raise exception 'l8_payref verify: min_topup_by_account_type has no individual minimum';
  end if;
  if exists (select 1 from public.platform_settings
              where key like 'founder_topup_discount%' and pg_catalog.strpos(coalesce(description, ''), 'مدى الحياة') > 0) then
    raise exception 'l8_payref verify: a founder discount setting still describes the discount as lifetime';
  end if;
  raise notice 'l8_payref verify: OK — founder discount = the membership year (founder_topup_discount_expires), extra-seat price stored only, individual top-up minimum, no lifetime wording';
end
$verify$;

commit;

select '20261128_10 payref settings: founder discount length, extra-seat price, individual top-up minimum' as step,
       (exists (select 1 from public.platform_settings where key = 'founder_topup_discount_expires')
        and exists (select 1 from public.platform_settings where key = 'firm_extra_seat_price_sar' and value ? 'sar')
        and exists (select 1 from public.platform_settings where key = 'min_topup_by_account_type' and value ? 'individual')
        and not exists (select 1 from public.platform_settings
                         where key like 'founder_topup_discount%' and pg_catalog.strpos(coalesce(description, ''), 'مدى الحياة') > 0)) as ok;
