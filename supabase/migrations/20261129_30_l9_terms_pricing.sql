-- =============================================================================
-- Migration: 20261129_30_l9_terms_pricing.sql
-- =============================================================================
-- PURPOSE (batch l9 terms — owner register 14, 19 Nov 2026: items 7, 29, 32,
-- 48 and 55). Settings only: no table, no function, no policy.
--
--   1. min_topup_by_account_type — register 14 item 7: the minimum top-up is
--      50 points (50 SAR, 1 point = 1 SAR) for EVERY account type, the founder
--      and the individual included (it was 500 for the professional types and
--      100 for individuals, 20261127_40 / 20261128_10). This is an explicit
--      UPDATE: it OVERWRITES the stored value on purpose — the owner's
--      decision replaces every earlier number, an admin's own number
--      included. Every key the stored map holds, plus the eight account types
--      of the code (src/lib/points/pointsSettings.ts DEFAULT_MIN_TOPUP_SAR),
--      becomes 50. A missing row is inserted with the full map.
--      The code sells a 50-point pack (topup-50) to every account type from
--      this batch on; until this file runs, checkout refuses that pack for a
--      professional («الحد الأدنى للشحن لحسابك ٥٠٠ …») — see RUN ORDER.
--
--   2. founder_topup_discount_bps / founder_topup_discount_expires — register
--      14 items 29 / 32 / 55: the founder's 15 % now applies to point top-ups
--      AND to any plan or library subscription he buys (never the founder
--      membership's own first-year price), while his yearly founder
--      subscription is active; lost for good when it lapses; never combined
--      with another discount (the larger wins). The values are NOT touched
--      (rate 1500; the window stays the membership year from activation,
--      {"months_after_activation": 12}, still an admin override). Only the
--      stored descriptions, which said «على شحن النقاط وحده», are rewritten.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261129_30_l9_terms_pricing.sql
--   Expect: NOTICE  l9_terms verify: OK  and a row with `t`.
--   Then run the `-- >>> verify:l9_terms` block of supabase/migrations/_verify.sql.
--
-- RUN ORDER: BEFORE the deploy (preferred), but either order is safe.
--   - This file first: the old code sells no pack under 100 / 500, so a
--     50 minimum changes nothing it sells; the old founder code reads the
--     same values.
--   - The deploy first: the new 50-point pack is listed for everyone, and a
--     professional who tries it is refused honestly with the old minimum
--     (500) until this file runs; an individual can buy it at once (100 →
--     refused too: 50 < 100). Nothing is charged on a refusal.
--   Idempotent: the UPDATE writes the same map on a re-run; the description
--   updates are fixed texts guarded by «is distinct from».
--
-- ROLLBACK (restores the l8 numbers):
--   update public.platform_settings
--      set value = '{"lawyer": 500, "firm": 500, "corporate": 500, "micro": 500, "government": 500, "ngo": 500, "provider": 500, "individual": 100}'::jsonb,
--          updated_at = now()
--    where key = 'min_topup_by_account_type';
--   (the old descriptions of the two founder settings are not restored: they
--   no longer describe what checkout does.)
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261129_30: public.platform_settings is missing (run 20260627_platform_settings.sql first)';
  end if;
end
$pre$;

-- ── 1. register 14 item 7: 50 for every account type ────────────────────────
insert into public.platform_settings (key, value, description) values
  ('min_topup_by_account_type',
   '{"lawyer": 50, "firm": 50, "corporate": 50, "micro": 50, "government": 50, "ngo": 50, "provider": 50, "individual": 50}'::jsonb,
   'الحد الأدنى للشحن بالريال قبل الخصم والضريبة لكل نوع حساب (١ نقطة = ١ ريال)؛ ٥٠ لكل الأنواع منذ 20261129_30 (سجل قرارات المالك ١٤ البند ٧)')
on conflict (key) do nothing;

update public.platform_settings ps
   set value = (
         select pg_catalog.jsonb_object_agg(k.key, 50)
           from (
             select pg_catalog.jsonb_object_keys(
                      case when pg_catalog.jsonb_typeof(ps.value) = 'object' then ps.value else '{}'::jsonb end) as key
             union
             select unnest(array['lawyer', 'firm', 'corporate', 'micro', 'government', 'ngo', 'provider', 'individual'])
           ) k
       ),
       description = 'الحد الأدنى للشحن بالريال قبل الخصم والضريبة لكل نوع حساب (١ نقطة = ١ ريال)؛ ٥٠ لكل الأنواع منذ 20261129_30 (سجل قرارات المالك ١٤ البند ٧)',
       updated_at = now()
 where ps.key = 'min_topup_by_account_type';

-- ── 2. the founder discount's descriptions: top-ups AND any plan ─────────────
update public.platform_settings
   set description = 'خصم العضو المؤسس بنقاط الأساس (١٥٠٠ = ١٥٪) على شحن النقاط وعلى أي باقة أو اشتراك مكتبة يشتريه (لا سعر باقة المؤسس نفسها)، ما دام اشتراكه السنوي سارياً وفي المدة التي يحددها founder_topup_discount_expires؛ ولا يجتمع مع خصم آخر ويُطبَّق الأعلى، ويسقط نهائياً إن انقطع الاشتراك أو استُرد المقعد (20261129_30)'
 where key = 'founder_topup_discount_bps'
   and description is distinct from 'خصم العضو المؤسس بنقاط الأساس (١٥٠٠ = ١٥٪) على شحن النقاط وعلى أي باقة أو اشتراك مكتبة يشتريه (لا سعر باقة المؤسس نفسها)، ما دام اشتراكه السنوي سارياً وفي المدة التي يحددها founder_topup_discount_expires؛ ولا يجتمع مع خصم آخر ويُطبَّق الأعلى، ويسقط نهائياً إن انقطع الاشتراك أو استُرد المقعد (20261129_30)';

update public.platform_settings
   set description = 'مدة خصم العضو المؤسس (على الشحن وعلى أي باقة): {"months_after_activation": عدد الأشهر من تفعيل العضوية} (١٢ = سنة العضوية، ٠ = إيقاف) أو {"until": "YYYY-MM-DD"} آخر يوم للخصم بتوقيت الرياض (20261128_10، 20261129_30)'
 where key = 'founder_topup_discount_expires'
   and description is distinct from 'مدة خصم العضو المؤسس (على الشحن وعلى أي باقة): {"months_after_activation": عدد الأشهر من تفعيل العضوية} (١٢ = سنة العضوية، ٠ = إيقاف) أو {"until": "YYYY-MM-DD"} آخر يوم للخصم بتوقيت الرياض (20261128_10، 20261129_30)';

-- ── 3. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  v jsonb;
  t text;
begin
  select value into v from public.platform_settings where key = 'min_topup_by_account_type';
  if v is null or pg_catalog.jsonb_typeof(v) <> 'object' then
    raise exception 'l9_terms verify: min_topup_by_account_type is missing or not an object';
  end if;
  foreach t in array array['lawyer', 'firm', 'corporate', 'micro', 'government', 'ngo', 'provider', 'individual'] loop
    if (v ->> t) is distinct from '50' then
      raise exception 'l9_terms verify: min_topup_by_account_type.% is %, not 50', t, coalesce(v ->> t, 'missing');
    end if;
  end loop;
  if exists (select 1 from pg_catalog.jsonb_each_text(v) e where e.value <> '50') then
    raise exception 'l9_terms verify: min_topup_by_account_type holds a value other than 50';
  end if;
  if exists (select 1 from public.platform_settings
              where key like 'founder_topup_discount%' and pg_catalog.strpos(coalesce(description, ''), 'الشحن وحده') > 0) then
    raise exception 'l9_terms verify: a founder discount setting still says «top-ups only»';
  end if;
  raise notice 'l9_terms verify: OK — minimum top-up 50 for every account type; founder discount described as top-ups and any plan';
end
$verify$;

commit;

select '20261129_30 l9 terms: minimum top-up 50 for every type, founder discount on any plan' as step,
       (exists (select 1 from public.platform_settings
                 where key = 'min_topup_by_account_type'
                   and pg_catalog.jsonb_typeof(value) = 'object'
                   and value ?& array['lawyer', 'firm', 'corporate', 'micro', 'government', 'ngo', 'provider', 'individual']
                   and not exists (select 1 from pg_catalog.jsonb_each_text(value) e where e.value <> '50'))
        and not exists (select 1 from public.platform_settings
                         where key like 'founder_topup_discount%' and pg_catalog.strpos(coalesce(description, ''), 'الشحن وحده') > 0)) as ok;
