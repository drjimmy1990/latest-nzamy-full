-- =============================================================================
-- Migration: 20261202_10_l12_money.sql
-- =============================================================================
-- PURPOSE (batch l12 money — the owner's answers of 20 Nov 2026). Settings
-- only: no table, no function, no policy, no grant.
--
--   1. min_topup_by_account_type — owner Q87 (RAW[16][50][57]: «الفرد 100 ثم
--      250، وغيره 500 فأكثر؛ والـ50 حد فتح المكتبة فقط»): individual 100,
--      every other account type 500 (batch l9 / 20261129_30 had made it 50
--      for everyone). A key is rewritten only while it still holds the l9
--      value 50 or is missing — an admin's own later number survives a
--      re-run. Unknown keys holding 50 become 500.
--
--   2. topup_bonus_pct (new) — owner Q88a: the campaign bonus table is
--      cancelled; any bonus is this admin setting, {"topup-<sar>": percent},
--      seeded 0 for every pack (question ١٦٢ asks whether 0/0/5/8/12/16/20 %
--      replaces it). Read at checkout, frozen in the order
--      (src/lib/payments/topupBonus.ts).
--
--   3. founder_bonus_rule (new) — question ١٥٢ (his files disagree): the
--      founder discount and a top-up bonus never stack, the higher one wins —
--      {"mode": "higher_only"} (default) or {"mode": "both"}.
--
--   4. ai_draft_prices (new) — owner N6 (RAW[5][60][78]): the legal drafter's
--      price per pleading kind, in points: claim 200 (was 500), reply /
--      rejoinder / supplementary / closing 500, appeal 800, cassation /
--      petition 1,500 (src/lib/ai/draftKinds.ts reads it for every run).
--
--   2–4 are INSERT ONLY: an admin's later value is never overwritten.
--   platform_settings keeps its existing RLS (anyone may SELECT, only admins
--   write — 20260627 / 20261016_09); none of the values is a secret.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261202_10_l12_money.sql
--   Expect: NOTICE  l12_money verify: OK …  and a row with `t`.
--   Then run the `-- >>> verify:l12_money` block of supabase/migrations/_verify.sql.
--   NOTE: the older `verify:l9_terms` check «Minimum top-up 50 for every
--   account type» answers `f` from now on — expected, this file replaces it.
--
-- RUN ORDER: either order is safe; BEFORE the deploy is preferred.
--   - This file first, old code: the old code sells a 50 pack to everyone;
--     checkout refuses it honestly with the new minimum («الحد الأدنى للشحن
--     لحسابك …») and charges nothing. The old code ignores the three new
--     keys (it still grants the old 700 / 1,500 … bonus and charges 500 for a
--     claim until the deploy).
--   - Deploy first, no row: the code defaults are the same numbers
--     (pointsSettings.ts DEFAULT_MIN_TOPUP_SAR, topupBonus.ts → 0 / higher
--     only, draftKinds.ts DRAFT_KINDS), EXCEPT the minimum top-up: the stored
--     l9 map (50 everywhere) is read until this file runs, so a lawyer could
--     buy nothing under 500 anyway (topup-50 is retired) — no gap.
--   Idempotent: safe to run any number of times.
--   Never re-run 20261129_30 after this file: it would set every minimum
--   back to 50.
--
-- ROLLBACK:
--   update public.platform_settings
--      set value = '{"lawyer": 50, "firm": 50, "corporate": 50, "micro": 50, "government": 50, "ngo": 50, "provider": 50, "individual": 50}'::jsonb,
--          updated_at = now()
--    where key = 'min_topup_by_account_type';
--   delete from public.platform_settings where key in ('topup_bonus_pct', 'founder_bonus_rule', 'ai_draft_prices');
--   (the code then reads its defaults: no bonus, higher only, claim 200)
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261202_10: public.platform_settings is missing (run 20260627_platform_settings.sql first)';
  end if;
end
$pre$;

-- ── 1. Q87: individual 100, every other type 500 ────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('min_topup_by_account_type',
   '{"lawyer": 500, "firm": 500, "corporate": 500, "micro": 500, "government": 500, "ngo": 500, "provider": 500, "individual": 100}'::jsonb,
   'الحد الأدنى للشحن بالريال قبل الخصم والضريبة لكل نوع حساب (النقطة = ريال واحد قبل الضريبة): الفرد ١٠٠ وبقية الأنواع ٥٠٠ منذ 20261202_10 (قرار المالك س٨٧، ٢٠ نوفمبر ٢٠٢٦)؛ والـ٥٠ حد فتح المكتبة فقط')
on conflict (key) do nothing;

update public.platform_settings ps
   set value = (
         select pg_catalog.jsonb_object_agg(
                  k.key,
                  case
                    when cur.value is not null and cur.value <> '50'::jsonb then cur.value
                    when k.key = 'individual' then '100'::jsonb
                    else '500'::jsonb
                  end)
           from (
             select pg_catalog.jsonb_object_keys(
                      case when pg_catalog.jsonb_typeof(ps.value) = 'object' then ps.value else '{}'::jsonb end) as key
             union
             select unnest(array['lawyer', 'firm', 'corporate', 'micro', 'government', 'ngo', 'provider', 'individual'])
           ) k
           left join lateral (
             select case when pg_catalog.jsonb_typeof(ps.value) = 'object' then ps.value -> k.key end as value
           ) cur on true
       ),
       description = 'الحد الأدنى للشحن بالريال قبل الخصم والضريبة لكل نوع حساب (النقطة = ريال واحد قبل الضريبة): الفرد ١٠٠ وبقية الأنواع ٥٠٠ منذ 20261202_10 (قرار المالك س٨٧، ٢٠ نوفمبر ٢٠٢٦)؛ والـ٥٠ حد فتح المكتبة فقط',
       updated_at = now()
 where ps.key = 'min_topup_by_account_type'
   and (pg_catalog.jsonb_typeof(ps.value) <> 'object'
        or not (ps.value ?& array['lawyer', 'firm', 'corporate', 'micro', 'government', 'ngo', 'provider', 'individual'])
        or exists (select 1 from pg_catalog.jsonb_each(ps.value) e where e.value = '50'::jsonb));

-- ── 2. Q88a: the top-up bonus, 0 for every pack (insert only) ───────────────
insert into public.platform_settings (key, value, description) values
  ('topup_bonus_pct',
   '{"topup-100": 0, "topup-250": 0, "topup-500": 0, "topup-1000": 0, "topup-2500": 0, "topup-5000": 0, "topup-10000": 0}'::jsonb,
   'النقاط الإضافية على حزم الشحن بنسبة مئوية من نقاط الحزمة (عدد صحيح ٠–١٠٠)؛ صفر لكل الحزم منذ إلغاء الجدول الحملي (قرار المالك س٨٨أ). تُحسب عند الدفع وتُثبَّت في الطلب (20261202_10)')
on conflict (key) do nothing;

-- ── 3. ١٥٢: founder discount vs bonus — the higher only (insert only) ───────
insert into public.platform_settings (key, value, description) values
  ('founder_bonus_rule',
   '{"mode": "higher_only"}'::jsonb,
   'خصم المؤسس مع النقاط الإضافية على الشحنة نفسها: {"mode": "higher_only"} الأعلى قيمةً فقط (النقطة = ريال، وعند التساوي الخصم) أو {"mode": "both"} الاثنان معاً (سؤال ١٥٢، 20261202_10)')
on conflict (key) do nothing;

-- ── 4. N6: the legal drafter's prices (insert only) ─────────────────────────
insert into public.platform_settings (key, value, description) values
  ('ai_draft_prices',
   '{"claim": 200, "reply": 500, "rejoinder": 500, "supplementary": 500, "closing": 500, "appeal": 800, "cassation": 1500, "petition": 1500}'::jsonb,
   'أسعار الصائغ القانوني بالنقاط لكل نوع: لائحة الدعوى ٢٠٠، والرد والتعقيب والإلحاقية والختامية ٥٠٠، والاستئناف ٨٠٠، والنقض والتماس إعادة النظر ١٥٠٠ (قرار المالك، 20261202_10)')
on conflict (key) do nothing;

-- ── 5. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  v jsonb;
  t text;
begin
  select value into v from public.platform_settings where key = 'min_topup_by_account_type';
  if v is null or pg_catalog.jsonb_typeof(v) <> 'object' then
    raise exception 'l12_money verify: min_topup_by_account_type is missing or not an object';
  end if;
  foreach t in array array['lawyer', 'firm', 'corporate', 'micro', 'government', 'ngo', 'provider', 'individual'] loop
    if not (v ? t) or pg_catalog.jsonb_typeof(v -> t) <> 'number' then
      raise exception 'l12_money verify: min_topup_by_account_type.% is missing or not a number', t;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.jsonb_each(v) e where e.value = '50'::jsonb) then
    raise exception 'l12_money verify: min_topup_by_account_type still holds the l9 value 50: %', v;
  end if;
  select value into v from public.platform_settings where key = 'topup_bonus_pct';
  if v is null or pg_catalog.jsonb_typeof(v) <> 'object' then
    raise exception 'l12_money verify: topup_bonus_pct is missing or not an object';
  end if;
  if exists (select 1 from pg_catalog.jsonb_each(v) e
              where pg_catalog.jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric not between 0 and 100) then
    raise exception 'l12_money verify: topup_bonus_pct holds a value outside 0–100: %', v;
  end if;
  select value into v from public.platform_settings where key = 'founder_bonus_rule';
  if v is null or (v ->> 'mode') not in ('higher_only', 'both') then
    raise exception 'l12_money verify: founder_bonus_rule is missing or malformed: %', v;
  end if;
  select value into v from public.platform_settings where key = 'ai_draft_prices';
  if v is null or pg_catalog.jsonb_typeof(v) <> 'object'
     or not (v ?& array['claim', 'reply', 'rejoinder', 'supplementary', 'closing', 'appeal', 'cassation', 'petition']) then
    raise exception 'l12_money verify: ai_draft_prices is missing a kind: %', v;
  end if;
  if exists (select 1 from pg_catalog.jsonb_each(v) e
              where pg_catalog.jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric < 1) then
    raise exception 'l12_money verify: ai_draft_prices holds a price under 1: %', v;
  end if;
  raise notice 'l12_money verify: OK — minimum top-up individual 100 / others 500 (or an admin value), bonus map, founder rule and drafter prices present';
end
$verify$;

commit;

select '20261202_10 l12 money: minimum top-up 100 / 500, topup_bonus_pct, founder_bonus_rule, ai_draft_prices' as migration,
       (exists (select 1 from public.platform_settings
                 where key = 'min_topup_by_account_type'
                   and pg_catalog.jsonb_typeof(value) = 'object'
                   and value ?& array['lawyer', 'firm', 'corporate', 'micro', 'government', 'ngo', 'provider', 'individual']
                   and not exists (select 1 from pg_catalog.jsonb_each(value) e where e.value = '50'::jsonb))
        and exists (select 1 from public.platform_settings where key = 'topup_bonus_pct' and pg_catalog.jsonb_typeof(value) = 'object')
        and exists (select 1 from public.platform_settings where key = 'founder_bonus_rule' and value ->> 'mode' in ('higher_only', 'both'))
        and exists (select 1 from public.platform_settings where key = 'ai_draft_prices'
                     and value ?& array['claim', 'reply', 'rejoinder', 'supplementary', 'closing', 'appeal', 'cassation', 'petition'])) as ok;
