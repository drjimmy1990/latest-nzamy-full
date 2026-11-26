-- =============================================================================
-- Migration: 20261208_31_l18_billing_company_identity.sql   (verify id: l18_billing)
-- =============================================================================
-- PURPOSE (batch l18 — owner's urgent package of 26 Nov, annex 03: the
-- company's official data from its commercial register and its ZATCA
-- certificate). Sets THREE keys of the billing_company setting (the issuer
-- printed on every receipt, tax invoice and credit note — billingCore.ts —
-- and the legal name / CR on the home page, footer and Organization data):
--     legal_name_ar = «شركة نيزامي للمحاماة والاستشارات القانونية»
--     address_ar    = «مكة المكرمة، مكة المكرمة، شارع 85 العكيشية الشمالية، 24352»
--     cr_number     = «7049168854»
--   vat_number is NOT touched: it stays exactly as it is (owner question ٢٣٢ —
--   the VAT start date — is still open). The file stops (and changes nothing)
--   if vat_number would change.
--   The update merges the three keys into the stored object (value || …), so
--   no other key is added or removed and the admin settings validator
--   (moyasarConfig.billingCompanySettingIssue: exactly the four keys) keeps
--   accepting the row.
--
-- DATA CHANGE (production): ONE row of public.platform_settings, key
--   'billing_company'. Guarded: only that key; nothing happens when the row is
--   missing (a NOTICE says so) or already holds these values. Prints the
--   three fields before and after, and that vat_number is unchanged.
--   Expected: «l18_billing: 1 row updated» on the first run, «0 rows» after.
--   Note: the identity is read LIVE at every render — past receipts re-render
--   with the new name / address / CR (amounts never change).
-- ALTERNATIVE: the same three fields can be typed in /dashboard/admin/settings
--   (validated and audited there); this file writes no audit row.
-- ORDER: independent of the deploy (any time).
-- SAFE TO RE-RUN: yes.
-- =============================================================================

begin;
set local lock_timeout = '5s';

do $run$
declare
  v_before jsonb;
  v_after  jsonb;
  v_target jsonb := pg_catalog.jsonb_build_object(
    'legal_name_ar', 'شركة نيزامي للمحاماة والاستشارات القانونية',
    'address_ar',    'مكة المكرمة، مكة المكرمة، شارع 85 العكيشية الشمالية، 24352',
    'cr_number',     '7049168854');
  v_n int := 0;
begin
  if to_regclass('public.platform_settings') is null then
    raise notice 'l18_billing: public.platform_settings does not exist — nothing changed';
    return;
  end if;

  select s.value into v_before from public.platform_settings s where s.key = 'billing_company' for update;
  if v_before is null then
    raise notice 'l18_billing: no billing_company row — nothing changed (run 20261022_10, or fill it in /dashboard/admin/settings)';
    return;
  end if;
  if pg_catalog.jsonb_typeof(v_before) <> 'object' then
    raise notice 'l18_billing: billing_company is not a JSON object (%) — nothing changed; fix it in /dashboard/admin/settings', pg_catalog.jsonb_typeof(v_before);
    return;
  end if;

  raise notice 'l18_billing BEFORE: legal_name_ar=% | address_ar=% | cr_number=% | vat_number present=%',
    coalesce(v_before ->> 'legal_name_ar', '—'), coalesce(v_before ->> 'address_ar', '—'),
    coalesce(v_before ->> 'cr_number', '—'), (v_before ? 'vat_number' and v_before ->> 'vat_number' is not null);

  update public.platform_settings s
     set value = s.value || v_target
   where s.key = 'billing_company'
     and (s.value ->> 'legal_name_ar' is distinct from v_target ->> 'legal_name_ar'
          or s.value ->> 'address_ar' is distinct from v_target ->> 'address_ar'
          or s.value ->> 'cr_number' is distinct from v_target ->> 'cr_number');
  get diagnostics v_n = row_count;

  select s.value into v_after from public.platform_settings s where s.key = 'billing_company';
  -- the VAT number must be exactly what it was (owner question ٢٣٢ is open)
  if (v_after -> 'vat_number') is distinct from (v_before -> 'vat_number')
     or (v_after ? 'vat_number') <> (v_before ? 'vat_number') then
    raise exception 'l18_billing: vat_number would change — rolled back, nothing written';
  end if;

  raise notice 'l18_billing AFTER:  legal_name_ar=% | address_ar=% | cr_number=% | vat_number unchanged=true',
    v_after ->> 'legal_name_ar', v_after ->> 'address_ar', v_after ->> 'cr_number';
  raise notice 'l18_billing: % row updated', v_n;
end
$run$;

-- ── verify ─────────────────────────────────────────────────────────────────
do $verify$
declare
  v jsonb;
begin
  select s.value into v from public.platform_settings s where s.key = 'billing_company';
  if v is null then
    raise notice 'l18_billing verify: SKIPPED — no billing_company row';
    return;
  end if;
  if v ->> 'legal_name_ar' is distinct from 'شركة نيزامي للمحاماة والاستشارات القانونية'
     or v ->> 'address_ar' is distinct from 'مكة المكرمة، مكة المكرمة، شارع 85 العكيشية الشمالية، 24352'
     or v ->> 'cr_number' is distinct from '7049168854' then
    raise exception 'l18_billing verify: billing_company does not hold the three official values';
  end if;
  raise notice 'l18_billing verify: OK — billing_company holds the legal name, the Makkah address and CR 7049168854 (vat_number untouched)';
end
$verify$;

commit;

select '20261208_31 l18 billing_company identity (name, address, CR — VAT untouched)' as migration,
       coalesce((select s.value ->> 'cr_number' = '7049168854' from public.platform_settings s where s.key = 'billing_company'), false) as ok,
       true;
