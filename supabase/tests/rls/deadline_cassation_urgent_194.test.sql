-- deadline_cassation_urgent_194.test.sql — proves 20261107_30 (owner 2026-11-07,
-- نظام المرافعات الشرعية المادة ١٩٤: cassation 30 days, urgent matters 15).
-- Chain (run.sh, postgres:16):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_deadline_rules_seeded.sql \
--     $M/20261016_04_deadline_rules_owner_q18.sql \
--     $M/20261018_01_deadline_rules_admin_objection.sql \
--     $M/20261107_30_deadline_cassation_urgent_194.sql $M/20261107_30_deadline_cassation_urgent_194.sql \
--     $R/deadline_cassation_urgent_194.test.sql
-- Every assertion RAISES on failure.

-- T1: after two runs — the two cassation rules, the citation, one row each.
do $$
declare
  c record;
  u record;
begin
  select * into c from public.deadline_rules where code = 'cassation' and owner_user_id is null;
  select * into u from public.deadline_rules where code = 'cassation_urgent' and owner_user_id is null;
  if c is null or c.period_days <> 30 or c.source_ar <> 'نظام المرافعات الشرعية — المادة (١٩٤)'
     or c.applies_to_degrees <> '{appeal}'::text[] then
    raise exception 'T1 FAIL: cassation is wrong: %', row_to_json(c);
  end if;
  if u is null or u.period_days <> 15 or u.source_ar <> 'نظام المرافعات الشرعية — المادة (١٩٤)'
     or u.title_ar <> 'الاعتراض بطلب النقض — المسائل المستعجلة'
     or u.description_ar not like 'خمسة عشر يوماً%'
     or not u.verified_by_owner or u.verified_at is null or not u.active or not u.is_platform_default
     or u.applies_to_degrees <> '{appeal}'::text[]
     or u.trigger_kind <> c.trigger_kind or u.calendar <> c.calendar
     or u.count_from_next_day <> c.count_from_next_day
     or u.roll_forward_if_holiday <> c.roll_forward_if_holiday then
    raise exception 'T1 FAIL: cassation_urgent is wrong: %', row_to_json(u);
  end if;
  if (select count(*) from public.deadline_rules where owner_user_id is null and code = 'cassation_urgent') <> 1 then
    raise exception 'T1 FAIL: cassation_urgent is not exactly one platform row';
  end if;
  if (select count(*) from public.deadline_rules where owner_user_id is null) <> 9 then
    raise exception 'T1 FAIL: expected 9 platform rules (8 after 20261018_01 + 1), got %',
      (select count(*) from public.deadline_rules where owner_user_id is null);
  end if;
  if exists (select 1 from public.deadline_rules where owner_user_id is null and source_ar like '%(١٩٣)%') then
    raise exception 'T1 FAIL: a platform rule still cites المادة (١٩٣)';
  end if;
  raise notice 'T1 PASS: cassation 30 / urgent 15, both citing (١٩٤), degrees {appeal}; 9 platform rules after two runs';
end $$;

-- T2: a re-run puts a deactivated, hand-edited urgent row back (active, 15 days)
-- instead of failing the verify and rolling the whole file back.
-- (/tmp/mig4.sql is 20261107_30 in the chain above.)
update public.deadline_rules set period_days = 20, active = false, source_ar = 'x'
 where code = 'cassation_urgent' and owner_user_id is null;
update public.deadline_rules set source_ar = 'نظام المرافعات الشرعية — المادة (١٩٣)'
 where code = 'cassation' and owner_user_id is null;
\i /tmp/mig4.sql
do $$
begin
  if not exists (select 1 from public.deadline_rules
                  where code = 'cassation_urgent' and owner_user_id is null
                    and period_days = 15 and active and source_ar like '%(١٩٤)%') then
    raise exception 'T2 FAIL: a re-run did not restore cassation_urgent to 15 days / active / (١٩٤)';
  end if;
  if not exists (select 1 from public.deadline_rules
                  where code = 'cassation' and owner_user_id is null and source_ar like '%(١٩٤)%') then
    raise exception 'T2 FAIL: a re-run did not restore cassation''s citation';
  end if;
  raise notice 'T2 PASS: a re-run restores both rules';
end $$;

-- T3: the earlier rules and the existing deadlines are untouched.
do $$
begin
  if (select period_days from public.deadline_rules where code = 'appeal_urgent' and owner_user_id is null) <> 10
     or (select period_days from public.deadline_rules where code = 'admin_objection_urgent' and owner_user_id is null) <> 10
     or (select count(*) from public.deadlines where days_count = 15) <> 2 then
    raise exception 'T3 FAIL: 20261107_30 changed an earlier rule or an existing deadline';
  end if;
  raise notice 'T3 PASS: earlier rules and existing deadlines unchanged';
end $$;
