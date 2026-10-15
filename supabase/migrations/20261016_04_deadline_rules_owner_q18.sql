-- =============================================================================
-- Migration: 20261016_04_deadline_rules_owner_q18.sql
-- =============================================================================
-- PURPOSE
--   Owner decision ١٨ (answers of 2026-10-06, section د): the appeal deadlines
--   are adopted «نظامياً وفق نظام المرافعات الشرعية ونظام الإجراءات الجزائية ونظام
--   ديوان المظالم»:
--     الاستئناف العام ٣٠ يوماً · الاستئناف المستعجل ١٠ أيام · التدقيق ٣٠ يوماً ·
--     النقض أمام المحكمة العليا ٣٠ يوماً · المحكمة الإدارية العليا ٦٠ يوماً.
--   20260904_phase5_deadline_radar.sql seeded the platform rules as UNVERIFIED
--   defaults (every screen says «قاعدة افتراضية — تحتاج مراجعتك»), and one of
--   them is wrong: `appeal_urgent` counts FIFTEEN days. نظام المرافعات الشرعية,
--   المادة (١٨٧): «مدة الاعتراض بطلب الاستئناف أو التدقيق ثلاثون يومًا، ويستثنى
--   من ذلك الأحكام الصادرة في المسائل المستعجلة فتكون عشرة أيام» — ten, as the
--   owner says. A lawyer trusting the 15-day rule would file five days late.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. appeal_urgent: 15 → 10 days, its description reworded; verified.
--   2. appeal_general (30) and cassation (30): unchanged periods; verified.
--   3. review_tadqiq — «الاعتراض بطلب التدقيق», 30 days, المادة (١٨٧) — added
--      as a platform rule, verified (the owner's «التدقيق ٣٠ يوماً»). It is a
--      preset only: the stage-close hook (case-stages route,
--      DEGREE_TO_AUTO_RULE_CODE) still auto-creates appeal_general / cassation.
--   4. «verified» = verified_by_owner true + verified_at now() (kept if already
--      set), so the «قاعدة افتراضية» label goes away for these four only.
--
-- WHAT IT DOES NOT DO — ON PURPOSE
--   * The Supreme Administrative Court rule (owner: 60 days) is NOT added.
--     نظام المرافعات أمام ديوان المظالم, المادة (٣٣/١), in the owner's own library
--     export of 2026-10-03: «تكون المهلة المحددة للاعتراض على الأحكام ثلاثين
--     يوماً من تاريخ تسلم صورة نسخة الحكم» (and ١٠ أيام in urgent requests,
--     اللائحة ٢/٣٣). A 60-day rule would put a lawyer 30 days late. The owner is
--     asked again with the citation (owner questions of 2026-10-16); the rule is
--     added once he confirms the period and its source article.
--   * reconsideration and criminal_objection are not in the owner's list: they
--     stay unverified.
--   * Existing deadlines are NOT recomputed. A due date already computed with
--     the 15-day rule stays as it was (moving a lawyer's due date silently is
--     worse than flagging it); the notice below counts open ones so the user
--     can tell the lawyers concerned. Recheck query at the end of this file.
--
-- DEPLOY ORDER — INDEPENDENT (data only; no code depends on it)
--
-- ROLLBACK
--   update public.deadline_rules set period_days = 15, verified_by_owner = false, verified_at = null
--    where code = 'appeal_urgent' and owner_user_id is null;
--   update public.deadline_rules set verified_by_owner = false, verified_at = null
--    where code in ('appeal_general', 'cassation') and owner_user_id is null;
--   delete from public.deadline_rules where code = 'review_tadqiq' and owner_user_id is null;
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.deadline_rules') is null then
    raise exception '20261016_04: public.deadline_rules does not exist — apply 20260904_phase5_deadline_radar.sql first';
  end if;
end $$;

-- ── 1. Urgent appeal: ten days ───────────────────────────────────────────────
update public.deadline_rules
   set period_days       = 10,
       description_ar    = 'عشرة أيام من اليوم التالي لتسلّم صورة الحكم في المسائل المستعجلة.',
       source_ar         = 'نظام المرافعات الشرعية — المادة (١٨٧)',
       verified_by_owner = true,
       verified_at       = coalesce(verified_at, now()),
       updated_at        = now()
 where code = 'appeal_urgent' and owner_user_id is null;

-- ── 2. General appeal and cassation: thirty days, verified ──────────────────
update public.deadline_rules
   set verified_by_owner = true,
       verified_at       = coalesce(verified_at, now()),
       updated_at        = now()
 where code in ('appeal_general', 'cassation')
   and owner_user_id is null
   and period_days = 30;

-- ── 3. Review (التدقيق): thirty days ─────────────────────────────────────────
insert into public.deadline_rules
  (code, title_ar, description_ar, source_ar, trigger_kind, period_days,
   applies_to_degrees, is_platform_default, verified_by_owner, verified_at)
values
  ('review_tadqiq',
   'الاعتراض بطلب التدقيق',
   'ثلاثون يوماً من اليوم التالي لتسلّم صورة الحكم، في الأحكام التي تُنظر تدقيقاً دون مرافعة.',
   'نظام المرافعات الشرعية — المادة (١٨٧)',
   'judgment', 30, '{first_instance}', true, true, now())
on conflict (code) where owner_user_id is null do update
   set period_days       = excluded.period_days,
       title_ar          = excluded.title_ar,
       description_ar    = excluded.description_ar,
       source_ar         = excluded.source_ar,
       verified_by_owner = true,
       verified_at       = coalesce(public.deadline_rules.verified_at, now()),
       updated_at        = now();

-- ── 4. Verify, and count deadlines computed with the old 15 days ─────────────
do $$
declare
  missing text := '';
  stale   int;
begin
  if not exists (select 1 from public.deadline_rules
                  where code = 'appeal_urgent' and owner_user_id is null
                    and period_days = 10 and verified_by_owner) then
    missing := missing || ' appeal_urgent is not 10 days / verified;';
  end if;
  if (select count(*) from public.deadline_rules
       where code in ('appeal_general', 'cassation', 'review_tadqiq') and owner_user_id is null
         and period_days = 30 and verified_by_owner) <> 3 then
    missing := missing || ' appeal_general / cassation / review_tadqiq are not all 30 days and verified;';
  end if;
  if exists (select 1 from public.deadline_rules
              where code in ('reconsideration', 'criminal_objection') and owner_user_id is null
                and verified_by_owner) then
    missing := missing || ' a rule outside the owner''s list was marked verified;';
  end if;
  if missing <> '' then
    raise exception '20261016_04 verify:%', missing;
  end if;

  if to_regclass('public.deadlines') is not null then
    select count(*) into stale
      from public.deadlines d
      join public.deadline_rules r on r.id = d.rule_id
     where r.code = 'appeal_urgent' and r.owner_user_id is null
       and d.status = 'open' and d.days_count = 15;
    raise notice '20261016_04: % open deadline(s) were computed with the old 15-day urgent-appeal rule — their due dates are 5 days late; list them with the query at the end of this file', stale;
  end if;

  raise notice '20261016_04 verify: OK — urgent appeal 10 days; general appeal, review and cassation 30 days; the four verified; the Supreme Administrative Court rule waits for the owner';
end $$;

commit;

-- Open deadlines computed with the old urgent-appeal period (read-only):
--   select d.id, d.owner_user_id, d.case_request_id, d.trigger_date, d.due_date
--     from public.deadlines d
--     join public.deadline_rules r on r.id = d.rule_id
--    where r.code = 'appeal_urgent' and r.owner_user_id is null
--      and d.status = 'open' and d.days_count = 15
--    order by d.due_date;
