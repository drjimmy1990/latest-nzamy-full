-- =============================================================================
-- Migration: 20261107_50_owner_answers_prices.sql
-- Owner answers of 3 Nov 2026 (Task F): the plan name ٤٢٠, the consultation
-- default prices ٤٣٣ and the NZAMY50 rule ٤٣٦, in the three tables the code
-- reads them from.
-- Safe to re-run. INSERT … ON CONFLICT and UPDATE only: no DROP, no DELETE, no
-- function, no policy. Each row it changes is stamped, and a re-run skips a
-- stamped row, so a later edit on an admin page is never overwritten.
-- =============================================================================
--
-- WHAT IT CHANGES
--   1. subscription_plans 'ind-litigation' (owner ٤٢٠): name_ar
--      «التأمين القانوني» → «عضوية الحماية القانونية», name_en "Legal
--      Insurance" → "Legal Protection Membership". Prices, tier and audience
--      are kept. Checkout does not read this table (it charges the TS price
--      book, src/lib/pricing/priceBook.ts, which has the same name); the row
--      only has to say the same thing on the admin screens. A receipt of an
--      order bought before the rename still says «التأمين القانوني» — that
--      label lives on the price book entry (receiptLabelAr), not here.
--      NOTE: 20261022_10 upserts the old name on a hand re-run; run this file
--      again after any such re-run.
--
--   2. admin_pricing_catalog (owner ٤٣٣ — the flat 500 is gone). The row WINS
--      over src/constants/clientServiceCatalog.ts (pricingRepository.ts,
--      mergeAdminPricingCatalogRows), so the code change alone would not show
--      in production:
--        written-opinion  250 → 79                    lawyer band 49–199
--        voice-call       NEW, 129, «(20 دقيقة)»     lawyer band 89–249
--        video-short      500 → 199, «(30 دقيقة)»    lawyer band 149–399
--        in-person        700 → 349, «(45 دقيقة)»    lawyer band 249–750
--        video-full       RETIRED: enabled = false + metadata.adminHidden =
--                         true. The loader still fetches a row hidden on
--                         purpose (src/lib/pricing/clientPricingServer.ts), so
--                         an old request recorded as video-full keeps its
--                         label; no card offers it. Its price is left as is.
--      The band is metadata.lawyerPriceRange {min, max} — DISPLAY ONLY (the
--      lawyer's profile edit screen, «قريباً»); no per-lawyer price is stored.
--      Stamp: metadata.owner_433. enabled is never touched on the four offered
--      rows (an admin's hide stays). Every other metadata key is kept.
--
--   3. coupons 'NZAMY50' (owner ٤٣٦): excluded_kinds {topup} →
--      {topup, plan, library} — single services only (allowed by
--      coupons_excluded_kinds_check, 20261026_20). min_order_amount stays 200
--      (owner question ٤٥٢ on ≥ / > is open). metadata.rules (the rule's
--      record, written by 20261026_20; no screen shows it) is rewritten to
--      the new rule. Stamp: metadata.owner_436.
--      NOTE: no service is sold online yet, so NZAMY50 has no online use until
--      single services are; the code already refused it on a top-up and the
--      founder membership.
--
-- RUN ORDER: AFTER the deploy of the same change (right after it).
--   New code before this file: works — voice-call has no row, so the code
--   entry (129) serves it; the old rows (500 / 700 / 250, video-full enabled)
--   still win until this file runs.
--   This file before the deploy: old code would show a stray «استشارة صوتية»
--   card whose ?type=voice-call its wizard does not read (it would open the
--   wizard on the default mode). Parts 1 and 3 are safe in either order.
--
-- ROLLBACK (by hand, only if the owner reverses ٤٢٠ / ٤٣٣ / ٤٣٦):
--   update public.subscription_plans set name_ar = 'التأمين القانوني', name_en = 'Legal Insurance' where id = 'ind-litigation';
--   update public.admin_pricing_catalog set enabled = true, metadata = metadata - 'adminHidden' - 'owner_433' where service_id = 'video-full';
--   update public.admin_pricing_catalog set enabled = false, metadata = metadata || '{"adminHidden":true}' where service_id = 'voice-call';
--   (prices: 20260518's values — written-opinion 250, video-short 500, in-person 700)
--   update public.coupons set excluded_kinds = '{topup}', metadata = metadata - 'owner_436' where code = 'NZAMY50';
-- =============================================================================

begin;

-- Prerequisites: 20260518 (admin_pricing_catalog), 20261022_10
-- (subscription_plans rows), 20261026_20 (coupons.excluded_kinds).
do $$
begin
  if to_regclass('public.admin_pricing_catalog') is null then
    raise exception '20261107_50: public.admin_pricing_catalog is missing — run 20260518_client_workflow_backend_ready.sql first';
  end if;
  if to_regclass('public.subscription_plans') is null then
    raise exception '20261107_50: public.subscription_plans is missing — run 20261022_10_payments_core.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'coupons' and column_name = 'excluded_kinds') then
    raise exception '20261107_50: coupons.excluded_kinds is missing — run 20261026_20_coupons_server_only.sql first';
  end if;
end $$;

-- ── 1. owner ٤٢٠: the plan's new name ────────────────────────────────────────
update public.subscription_plans
   set name_ar    = 'عضوية الحماية القانونية',
       name_en    = 'Legal Protection Membership',
       updated_at = now()
 where id = 'ind-litigation'
   and (name_ar is distinct from 'عضوية الحماية القانونية'
        or name_en is distinct from 'Legal Protection Membership');

-- ── 2. owner ٤٣٣: consultation default prices ───────────────────────────────
insert into public.admin_pricing_catalog
  (service_id, audience, category_id, label_ar, base_price, price_mode, receiver_type, beta_visibility, requires_payment, enabled, metadata)
values
  ('written-opinion', 'individual', 'consultation', 'رأي قانوني مكتوب', 79, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=written-opinion","icon":"FileText","requestType":"consultation","priceNote":"يسلم خلال 2-3 أيام عمل","humanService":true,"lawyerPriceRange":{"min":49,"max":199},"owner_433":"20261107_50"}'::jsonb),
  ('voice-call', 'individual', 'consultation', 'استشارة صوتية (20 دقيقة)', 129, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=voice-call","icon":"Phone","requestType":"consultation","priceNote":"صوتية أونلاين - 20 دقيقة","humanService":true,"lawyerPriceRange":{"min":89,"max":249},"owner_433":"20261107_50"}'::jsonb),
  ('video-short', 'individual', 'consultation', 'استشارة مرئية (30 دقيقة)', 199, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=video-short","icon":"VideoCamera","requestType":"consultation","priceNote":"مرئية أونلاين - 30 دقيقة","humanService":true,"lawyerPriceRange":{"min":149,"max":399},"owner_433":"20261107_50"}'::jsonb),
  ('in-person', 'individual', 'consultation', 'استشارة حضورية (45 دقيقة)', 349, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=in-person","icon":"Users","requestType":"consultation","priceNote":"حضوري في مكتب المحامي - 45 دقيقة","humanService":true,"lawyerPriceRange":{"min":249,"max":750},"owner_433":"20261107_50"}'::jsonb)
on conflict (service_id) do update set
  label_ar   = excluded.label_ar,
  base_price = excluded.base_price,
  price_mode = excluded.price_mode,
  metadata   = admin_pricing_catalog.metadata || excluded.metadata,
  updated_at = now()
where coalesce(admin_pricing_catalog.metadata->>'owner_433', '') = '';

update public.admin_pricing_catalog
   set enabled    = false,
       metadata   = metadata || jsonb_build_object('adminHidden', true, 'owner_433', '20261107_50 — retired, not offered'),
       updated_at = now()
 where service_id = 'video-full'
   and coalesce(metadata->>'owner_433', '') = '';

-- ── 3. owner ٤٣٦: NZAMY50 is for single services only ───────────────────────
update public.coupons
   set excluded_kinds = '{topup,plan,library}'::text[],
       metadata       = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'rules', '20261107_50 — owner ٤٣٦: 50 SAR off a single-service order of 200 SAR net or more; never a plan, the library, a top-up or the founder membership',
                             'owner_436', '20261107_50 — single services only (plan, library and top-up excluded)'),
       updated_at     = now()
 where code = 'NZAMY50'
   and coalesce(metadata->>'owner_436', '') = '';

commit;

-- ── SELECT check (the SQL editor shows only the last result — this one) ──────
-- Expected: 7 rows, ok = true on each. ok is never NULL.
--   ind-litigation   the new name.
--   5 consultation rows: the four offered at 79 / 129 / 199 / 349 and
--                    enabled, video-full hidden (enabled = false, adminHidden).
--                    in_table = false is ok too: the code catalogue then serves
--                    the same value. ok = false on an offered row after a later
--                    admin price edit just names that edit.
--   NZAMY50          excluded {plan,library,topup}, min 200.
select x.check_name, x.key, x.in_table, x.value, x.ok
  from (
    select 1 as ord, 'plan name (٤٢٠)' as check_name, e.id as key,
           sp.id is not null as in_table,
           coalesce(sp.name_ar || ' / ' || sp.name_en, '(no row)') as value,
           coalesce(sp.name_ar = 'عضوية الحماية القانونية' and sp.name_en = 'Legal Protection Membership', false) as ok
      from (values ('ind-litigation')) as e(id)
      left join public.subscription_plans sp on sp.id = e.id
    union all
    select 2, 'consultation (٤٣٣)', e.service_id,
           c.service_id is not null,
           coalesce(c.base_price::text || ' · ' || c.label_ar || ' · enabled=' || c.enabled::text
                    || ' · band=' || coalesce(c.metadata->>'lawyerPriceRange', '-')
                    || ' · hidden=' || coalesce(c.metadata->>'adminHidden', '-'), '(no row — code catalogue)'),
           coalesce(
             c.service_id is null
             or (e.price is null and c.enabled = false and c.metadata->>'adminHidden' = 'true')
             or (e.price is not null and c.base_price = e.price and c.enabled
                 and c.metadata->'lawyerPriceRange' is not null),
             false)
      from (values ('written-opinion', 79::numeric), ('voice-call', 129::numeric), ('video-short', 199::numeric),
                   ('in-person', 349::numeric), ('video-full', null::numeric)) as e(service_id, price)
      left join public.admin_pricing_catalog c on c.service_id = e.service_id
    union all
    select 3, 'NZAMY50 (٤٣٦)', e.code,
           k.code is not null,
           coalesce(k.excluded_kinds::text || ' · min ' || k.min_order_amount::text, '(no row)'),
           coalesce(k.excluded_kinds @> '{plan,library,topup}'::text[] and '{plan,library,topup}'::text[] @> k.excluded_kinds
                    and k.min_order_amount = 200, false)
      from (values ('NZAMY50')) as e(code)
      left join public.coupons k on k.code = e.code
  ) x
 order by x.ord, x.key;
