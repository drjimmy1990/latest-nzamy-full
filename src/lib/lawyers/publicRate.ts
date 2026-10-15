/**
 * Owner decision ١٦٨ (answers of 2026-10-06): a lawyer's hourly / consultation
 * rate stays hidden on the public profile and in the directory unless the
 * lawyer entered it AND turned on «إظهار سعر الاستشارة / الساعة في الملف العام»
 * (lawyer_profiles.show_hourly_rate, migration 20261016_05, default false).
 *
 * Applied to the embedded lawyer_profiles row of GET /api/v1/lawyers and
 * GET /api/v1/lawyers/[id] (both read with the service role). The flag itself
 * is dropped from the public payload — it says nothing a visitor needs.
 * A row read before 20261016_05 has no flag at all and is treated as "hidden".
 */
export function withholdHiddenRate(lp: Record<string, unknown> | null | undefined): void {
  if (!lp) return;
  if (lp.show_hourly_rate !== true) lp.hourly_rate = null;
  delete lp.show_hourly_rate;
}
