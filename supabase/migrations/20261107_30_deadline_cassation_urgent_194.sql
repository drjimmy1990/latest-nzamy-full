-- =============================================================================
-- Migration: 20261107_30_deadline_cassation_urgent_194.sql
-- =============================================================================
-- PURPOSE (owner, 2026-11-07 — plan ruling R6)
--   The owner's text, نظام المرافعات الشرعية، المادة (١٩٤):
--     «مدة الاعتراض بطلب النقض ثلاثون يومًا، ويستثنى من ذلك الأحكام الصادرة في
--     المسائل المستعجلة فتكون خمسة عشر يومًا. فإذا لم يودع المعترض اعتراضه خلال
--     هاتين المدتين سقط حقه في طلب النقض.»
--   It applies before the commercial courts by reference (نظام المحاكم التجارية،
--   المادة ٩٣).
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. cassation — period unchanged (30 days); its citation moves from
--      المادة (١٩٣) to المادة (١٩٤). (١٩٣) is the article on the judgments that
--      may be objected to by cassation, not on the period.
--   2. cassation_urgent — «الاعتراض بطلب النقض — المسائل المستعجلة», 15 days,
--      a platform rule, verified. Its trigger, calendar, counting from the
--      next day, holiday roll and applies_to_degrees are COPIED from the
--      platform cassation row (INSERT … SELECT), so they are the same by
--      construction. It is a preset (the legal calculator lists it); nothing
--      picks it automatically — cases carry no «urgent» flag, and the
--      stage-close hook (DEGREE_TO_AUTO_RULE_CODE) keeps creating `cassation`.
--
-- WHAT IT DOES NOT DO
--   * No existing deadline is touched or recomputed.
--   * appeal_urgent (10 days, المادة ١٨٧) is unchanged; it is only listed in
--     the SELECT below for comparison.
--
-- DEPLOY ORDER — INDEPENDENT (data only). The calculator preset that names
--   cassation_urgent falls back to its own 15 days while this row is missing,
--   and code that does not know the code simply lists it with the other rules.
--   Run after 20261016_04 (it relies on the same unique index on code where
--   owner_user_id is null, 20260904_phase5).
--
-- ROLLBACK
--   delete from public.deadline_rules where code = 'cassation_urgent' and owner_user_id is null;
--   update public.deadline_rules set source_ar = 'نظام المرافعات الشرعية — المادة (١٩٣)', updated_at = now()
--    where code = 'cassation' and owner_user_id is null;
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.deadline_rules') is null then
    raise exception '20261107_30: public.deadline_rules does not exist — apply 20260904_phase5_deadline_radar.sql first';
  end if;
  if not exists (select 1 from public.deadline_rules where code = 'cassation' and owner_user_id is null) then
    raise exception '20261107_30: the platform rule cassation is missing — apply 20260904_phase5_deadline_radar.sql (its seed) first';
  end if;
end $$;

-- ── 1. cassation: the right article ─────────────────────────────────────────
update public.deadline_rules
   set source_ar  = 'نظام المرافعات الشرعية — المادة (١٩٤)',
       updated_at = now()
 where code = 'cassation' and owner_user_id is null
   and source_ar is distinct from 'نظام المرافعات الشرعية — المادة (١٩٤)';

-- ── 2. cassation_urgent: fifteen days, settings copied from cassation ───────
insert into public.deadline_rules
  (code, title_ar, description_ar, source_ar, trigger_kind, period_days, calendar,
   count_from_next_day, roll_forward_if_holiday, applies_to_degrees,
   is_platform_default, verified_by_owner, verified_at)
select 'cassation_urgent',
       'الاعتراض بطلب النقض — المسائل المستعجلة',
       'خمسة عشر يوماً من اليوم التالي لتسلّم صورة حكم الاستئناف في المسائل المستعجلة.',
       'نظام المرافعات الشرعية — المادة (١٩٤)',
       c.trigger_kind, 15, c.calendar,
       c.count_from_next_day, c.roll_forward_if_holiday, c.applies_to_degrees,
       true, true, now()
  from public.deadline_rules c
 where c.code = 'cassation' and c.owner_user_id is null
on conflict (code) where owner_user_id is null do update
   set period_days             = excluded.period_days,
       title_ar                = excluded.title_ar,
       description_ar          = excluded.description_ar,
       source_ar               = excluded.source_ar,
       trigger_kind            = excluded.trigger_kind,
       calendar                = excluded.calendar,
       count_from_next_day     = excluded.count_from_next_day,
       roll_forward_if_holiday = excluded.roll_forward_if_holiday,
       applies_to_degrees      = excluded.applies_to_degrees,
       active                  = true,
       verified_by_owner       = true,
       verified_at             = coalesce(public.deadline_rules.verified_at, now()),
       updated_at              = now();

-- ── 3. verify ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1
      from public.deadline_rules u
      join public.deadline_rules c on c.code = 'cassation' and c.owner_user_id is null
     where u.code = 'cassation_urgent' and u.owner_user_id is null
       and u.period_days = 15 and u.verified_by_owner and u.active
       and u.trigger_kind = c.trigger_kind and u.calendar = c.calendar
       and u.count_from_next_day = c.count_from_next_day
       and u.roll_forward_if_holiday = c.roll_forward_if_holiday
       and u.applies_to_degrees = c.applies_to_degrees) then
    raise exception '20261107_30 verify: cassation_urgent is not 15 days / verified / active with cassation''s settings';
  end if;
  if not exists (select 1 from public.deadline_rules
                  where code = 'cassation' and owner_user_id is null and period_days = 30
                    and source_ar = 'نظام المرافعات الشرعية — المادة (١٩٤)') then
    raise exception '20261107_30 verify: cassation is not 30 days citing المادة (١٩٤)';
  end if;
end $$;

commit;

-- ── SELECT check (expect cassation 30 · cassation_urgent 15, both (١٩٤); appeal_urgent 10 (١٨٧)) ──
select code, period_days, source_ar
  from public.deadline_rules
 where owner_user_id is null
   and code in ('cassation', 'cassation_urgent', 'appeal_urgent')
 order by code;
