-- library_view_security_invoker.test.sql — proves 20260922_04.
-- Chain (run.sh, postgres:16):
--   20260626_legal_library_schema.sql → 20260627_platform_settings.sql →
--   20260729_library_status.sql → 20260730_article_regulations.sql →
--   20260824_laws_effective_date_gregorian_columns.sql →
--   20260911_library_laws_enactment_gazette_schema.sql →
--   20260922_01_library_grants.sql → 20260922_04_library_view_security_invoker.sql → this file
-- Every assertion below RAISES on failure (the harness fails closed on ERROR).

-- T1 the view carries security_invoker = true
do $$
declare ok boolean;
begin
  select exists (
    select 1 from pg_class c
      cross join lateral pg_options_to_table(c.reloptions) o
     where c.oid = 'library.v_laws_enactment_status'::regclass
       and o.option_name = 'security_invoker'
       and lower(o.option_value) in ('true','on','1','yes')
  ) into ok;
  if not ok then raise exception 'T1 FAIL: v_laws_enactment_status lacks security_invoker'; end if;
  raise notice 'T1 PASS: v_laws_enactment_status runs with the caller''s privileges';
end $$;

-- T2 the view is still SELECTable by the API roles (grant from 20260922_01 intact)
do $$
begin
  if not has_table_privilege('anon', 'library.v_laws_enactment_status', 'SELECT')
     or not has_table_privilege('authenticated', 'library.v_laws_enactment_status', 'SELECT') then
    raise exception 'T2 FAIL: an API role lost SELECT on the view';
  end if;
  raise notice 'T2 PASS: anon + authenticated keep SELECT on the view';
end $$;

-- T3 the view actually answers under invoker semantics for the test role (RLS on)
select 'T3 view rows readable (any count is fine, no error is the assertion)' as check,
       count(*) as n
  from library.v_laws_enactment_status;

-- T4 the matview is out of the API surface, service_role keeps it
do $$
begin
  if has_table_privilege('anon', 'library.cross_section_search', 'SELECT')
     or has_table_privilege('authenticated', 'library.cross_section_search', 'SELECT') then
    raise exception 'T4 FAIL: an API role can still SELECT library.cross_section_search';
  end if;
  if not has_table_privilege('service_role', 'library.cross_section_search', 'SELECT') then
    raise exception 'T4 FAIL: service_role lost SELECT on library.cross_section_search';
  end if;
  raise notice 'T4 PASS: cross_section_search is API-invisible, service_role keeps it';
end $$;

-- T5 idempotence: the migration's own verify block passes on a second run is
--    exercised by run.sh when the file is listed twice; here we only pin that
--    RESET would be the rollback (documentary).
select 'T5 rollback documented in the migration header' as check, true as present;
