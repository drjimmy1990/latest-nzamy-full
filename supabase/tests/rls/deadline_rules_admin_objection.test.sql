-- deadline_rules_admin_objection.test.sql — proves 20261018_01 (owner answer ١٨١).
-- Chain (run.sh, postgres:16):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_deadline_rules_seeded.sql \
--     $M/20261016_04_deadline_rules_owner_q18.sql \
--     $M/20261018_01_deadline_rules_admin_objection.sql $M/20261018_01_deadline_rules_admin_objection.sql \
--     $R/deadline_rules_admin_objection.test.sql
-- Every assertion RAISES on failure.
do $$
declare
  r record;
begin
  select * into r from public.deadline_rules where code = 'admin_objection' and owner_user_id is null;
  if not found or r.period_days <> 30 or not r.verified_by_owner or r.verified_at is null
     or r.trigger_kind <> 'judgment' or r.source_ar not like '%ديوان المظالم%(٣٣/١)%'
     or r.applies_to_degrees <> '{first_instance,appeal}'::text[] then
    raise exception 'T1 FAIL: admin_objection is wrong: %', row_to_json(r);
  end if;
  select * into r from public.deadline_rules where code = 'admin_objection_urgent' and owner_user_id is null;
  if not found or r.period_days <> 10 or not r.verified_by_owner or r.verified_at is null
     or r.description_ar not like 'عشرة أيام%'
     or r.source_ar not like 'اللائحة التنفيذية%(٢/٣٣)%' then
    raise exception 'T1 FAIL: admin_objection_urgent is wrong: %', row_to_json(r);
  end if;
  if (select count(*) from public.deadline_rules where owner_user_id is null) <> 8 then
    raise exception 'T1 FAIL: expected 8 platform rules (6 after 04 + 2), got %',
      (select count(*) from public.deadline_rules where owner_user_id is null);
  end if;
  if exists (select 1 from public.deadline_rules where owner_user_id is null and period_days = 60) then
    raise exception 'T1 FAIL: a 60-day rule exists — the grievance period is not an objection rule';
  end if;
  raise notice 'T1 PASS: administrative objection 30 / urgent 10, both verified; 8 platform rules after two runs; no 60-day rule';
end $$;

-- T2: a re-run puts a hand-edited platform row back to the owner's period.
-- (/tmp/mig3.sql is 20261018_01 in the chain above.)
update public.deadline_rules set period_days = 60, active = false
 where code = 'admin_objection' and owner_user_id is null;
\i /tmp/mig3.sql
do $$
begin
  if not exists (select 1 from public.deadline_rules
                  where code = 'admin_objection' and owner_user_id is null and period_days = 30 and active) then
    raise exception 'T2 FAIL: a re-run did not restore admin_objection to 30 days / active';
  end if;
  raise notice 'T2 PASS: a re-run restores the rule';
end $$;

-- T3: the earlier rules and the existing deadlines are untouched.
do $$
begin
  if (select period_days from public.deadline_rules where code = 'appeal_urgent' and owner_user_id is null) <> 10
     or (select count(*) from public.deadlines where days_count = 15) <> 2 then
    raise exception 'T3 FAIL: 20261018_01 changed an earlier rule or an existing deadline';
  end if;
  raise notice 'T3 PASS: earlier rules and existing deadlines unchanged';
end $$;
