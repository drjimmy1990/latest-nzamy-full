-- deadline_rules_owner_q18.test.sql — proves 20261016_04 (owner decision ١٨).
-- Chain (run.sh, postgres:16):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_deadline_rules_seeded.sql \
--     $M/20261016_04_deadline_rules_owner_q18.sql $M/20261016_04_deadline_rules_owner_q18.sql \
--     $R/deadline_rules_owner_q18.test.sql
-- Every assertion RAISES on failure.
do $$
declare
  r record;
begin
  for r in
    select code, period_days, verified_by_owner, verified_at
      from public.deadline_rules where owner_user_id is null order by code
  loop
    if r.code = 'appeal_urgent' and (r.period_days <> 10 or not r.verified_by_owner or r.verified_at is null) then
      raise exception 'T1 FAIL: appeal_urgent = % days, verified %', r.period_days, r.verified_by_owner;
    elsif r.code in ('appeal_general', 'cassation', 'review_tadqiq') and (r.period_days <> 30 or not r.verified_by_owner) then
      raise exception 'T1 FAIL: % = % days, verified %', r.code, r.period_days, r.verified_by_owner;
    elsif r.code in ('reconsideration', 'criminal_objection') and r.verified_by_owner then
      raise exception 'T1 FAIL: % was marked verified although the owner did not list it', r.code;
    end if;
  end loop;
  if (select count(*) from public.deadline_rules where owner_user_id is null) <> 6 then
    raise exception 'T1 FAIL: expected 6 platform rules (5 seeded + review_tadqiq), got %',
      (select count(*) from public.deadline_rules where owner_user_id is null);
  end if;
  if exists (select 1 from public.deadline_rules where code ilike '%admin%' or title_ar like '%الإدارية العليا%') then
    raise exception 'T1 FAIL: a Supreme Administrative Court rule was added before the owner confirmed its period';
  end if;
  if (select description_ar from public.deadline_rules where code = 'appeal_urgent' and owner_user_id is null) not like 'عشرة أيام%' then
    raise exception 'T1 FAIL: appeal_urgent still describes the old period';
  end if;
  raise notice 'T1 PASS: urgent 10 / general, review, cassation 30 — the four verified; reconsideration and criminal objection unverified; no Supreme Administrative rule; 6 platform rules after two runs';
end $$;

do $$
begin
  if (select count(*) from public.deadlines where days_count = 15) <> 2
     or (select due_date from public.deadlines where days_count = 30) is null then
    raise exception 'T2 FAIL: existing deadlines were changed';
  end if;
  raise notice 'T2 PASS: existing deadlines are left as they were (only counted)';
end $$;
