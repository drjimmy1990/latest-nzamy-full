-- =============================================================================
-- Migration: 20261018_01_deadline_rules_admin_objection.sql
-- =============================================================================
-- PURPOSE
--   Owner answer ١٨١ (approved answers of 2026-10-16): the objection period
--   against a judgment of the administrative courts — before the Administrative
--   Court of Appeal or the Supreme Administrative Court — is «ثلاثون (٣٠) يوماً
--   للاعتراض العادي، وعشرة (١٠) أيام للمستعجل», per نظام المرافعات أمام ديوان
--   المظالم (م/٣ وتاريخ ٢٢/١/١٤٣٥هـ). The 60 days of his answer ١٨
--   was the grievance against an administrative decision before a cancellation
--   suit, not an objection to a judgment. 20261016_04 held this rule back until
--   he confirmed; he has.
--
--   Sources, read in the owner's library export of 2026-10-03 (نظام_المرافعات_
--   ديوان_المظالم_ولائحته_وتعميماته_ديوان_المظالم.md):
--     * 30 days — the law, المادة (٣٣/١): «تكون المهلة المحددة للاعتراض على
--       الأحكام ثلاثين يوماً من تاريخ تسلم صورة نسخة الحكم».
--     * 10 days — the EXECUTIVE REGULATION, المادة (٢/٣٣), added by قرار مجلس
--       القضاء الإداري رقم 6/1444/سادساً وتاريخ 26/5/1444هـ: «تكون المهلة المحددة
--       للاعتراض على الأحكام الصادرة في الطلبات العاجلة عشرة أيام». (The owner
--       wrote «م ٣٣/٢»; paragraph ٢ of the law itself is about the mandatory
--       review of judgments against a government body, so the source line
--       names the regulation.)
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. admin_objection — «الاعتراض على أحكام المحاكم الإدارية», 30 days from
--      the day after receiving the copy of the judgment; verified.
--   2. admin_objection_urgent — the same for urgent requests, 10 days; verified.
--   Both are platform presets (the deadline calculator and the radar list
--   them). The stage-close hook (case-stages route, DEGREE_TO_AUTO_RULE_CODE)
--   keeps creating appeal_general / cassation: it keys on the degree only, and
--   the ordinary period is 30 days in both court systems.
--
-- WHAT IT DOES NOT DO — ON PURPOSE
--   * No rule for the 60-day grievance / cancellation-suit timeline: the owner
--     explained it but did not ask for it, and it counts from knowledge of the
--     decision, not from a judgment.
--   * No existing deadline is touched.
--
-- DEPLOY ORDER — INDEPENDENT (data only; no code depends on it). Run after
--   20261016_04 (it only adds rows; it reads nothing 04 wrote).
--
-- ROLLBACK
--   delete from public.deadline_rules
--    where code in ('admin_objection', 'admin_objection_urgent') and owner_user_id is null;
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.deadline_rules') is null then
    raise exception '20261018_01: public.deadline_rules does not exist — apply 20260904_phase5_deadline_radar.sql first';
  end if;
end $$;

insert into public.deadline_rules
  (code, title_ar, description_ar, source_ar, trigger_kind, period_days,
   applies_to_degrees, is_platform_default, verified_by_owner, verified_at)
values
  ('admin_objection',
   'الاعتراض على أحكام المحاكم الإدارية',
   'ثلاثون يوماً من اليوم التالي لتسلّم صورة نسخة الحكم، للاعتراض أمام محكمة الاستئناف الإدارية أو المحكمة الإدارية العليا.',
   'نظام المرافعات أمام ديوان المظالم — المادة (٣٣/١)',
   'judgment', 30, '{first_instance,appeal}', true, true, now()),
  ('admin_objection_urgent',
   'الاعتراض على أحكام المحاكم الإدارية — الطلبات العاجلة',
   'عشرة أيام من اليوم التالي لتسلّم صورة نسخة الحكم الصادر في طلب عاجل أمام المحاكم الإدارية.',
   'اللائحة التنفيذية لنظام المرافعات أمام ديوان المظالم — المادة (٢/٣٣)',
   'judgment', 10, '{first_instance,appeal}', true, true, now())
on conflict (code) where owner_user_id is null do update
   set period_days        = excluded.period_days,
       title_ar           = excluded.title_ar,
       description_ar     = excluded.description_ar,
       source_ar          = excluded.source_ar,
       trigger_kind       = excluded.trigger_kind,
       applies_to_degrees = excluded.applies_to_degrees,
       verified_by_owner  = true,
       verified_at        = coalesce(public.deadline_rules.verified_at, now()),
       active             = true,
       updated_at         = now();

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from public.deadline_rules
                  where code = 'admin_objection' and owner_user_id is null
                    and period_days = 30 and verified_by_owner and active) then
    raise exception '20261018_01 verify: admin_objection is not 30 days / verified / active';
  end if;
  if not exists (select 1 from public.deadline_rules
                  where code = 'admin_objection_urgent' and owner_user_id is null
                    and period_days = 10 and verified_by_owner and active) then
    raise exception '20261018_01 verify: admin_objection_urgent is not 10 days / verified / active';
  end if;
  raise notice '20261018_01 verify: OK — administrative-court objection 30 days, urgent 10 days, both verified';
end $$;

commit;
