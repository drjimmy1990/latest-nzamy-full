-- library_decree_preamble_lock.test.sql — proves 20261019_40 (owner answer ٢٢١).
-- Chain (run.sh, postgres:16) — the library chain (with the decree taxonomy
-- that adds instrument_ar, and 20261018_02 before it), then 20261019_40 TWICE
-- (idempotent), then 20260922_01 + 20261019_40 again (the documented re-open
-- and its repair). Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_feqh_locator_labels.sql $M/20260729_decree_instrument_taxonomy.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261018_02_library_feqh_decree_text_lock.sql \
--     $M/20261019_40_library_decree_preamble_lock.sql $M/20261019_40_library_decree_preamble_lock.sql \
--     $M/20260922_01_library_grants.sql $M/20261019_40_library_decree_preamble_lock.sql \
--     supabase/tests/rls/library_decree_preamble_lock.test.sql
-- NEGATIVE CONTROL: the same chain without the three 20261019_40 files → T1
-- fails: «T1 FAIL: anon holds table-level SELECT on decrees_circulars» (run
-- 2026-10-18).
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

insert into library.decrees_circulars (id, title, type, issuer, ref, date, summary, summary_brief, category,
                                       preamble, hashtags, official_url, instrument_ar)
  values ('00000000-0000-0000-0000-0000000000d1', 'تعميم تجريبي بشأن التوثيق', 'circular', 'وزارة العدل', '13/ت/123',
          '1446/01/01', 'ملخص التعميم', 'موجز', '08',
          'بعون الله تعالى، نحن ... بعد الاطلاع على النظام', array['توثيق'], 'https://example.gov.sa/d1', 'تعميم'),
         ('00000000-0000-0000-0000-0000000000d2', 'قرار بلا ديباجة', 'circular', 'وزارة العدل', null,
          null, null, null, '08', null, '{}', null, null);

-- T1 privileges: the metadata columns only; no preamble; no writes
do $$
declare
  r   text;
  col text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user'] loop
    if has_table_privilege(r, 'library.decrees_circulars', 'SELECT') then
      raise exception 'T1 FAIL: % holds table-level SELECT on decrees_circulars', r;
    end if;
    foreach col in array array['id', 'title', 'type', 'issuer', 'ref', 'date', 'summary', 'summary_brief', 'category',
                               'hashtags', 'official_url', 'fts', 'created_at', 'updated_at', 'instrument_ar'] loop
      if not has_column_privilege(r, 'library.decrees_circulars', col, 'SELECT') then
        raise exception 'T1 FAIL: % cannot read public column decrees_circulars.%', r, col;
      end if;
    end loop;
    if has_column_privilege(r, 'library.decrees_circulars', 'preamble', 'SELECT') then
      raise exception 'T1 FAIL: % can read decrees_circulars.preamble', r;
    end if;
    if has_any_column_privilege(r, 'library.decrees_circulars', 'UPDATE')
       or has_any_column_privilege(r, 'library.decrees_circulars', 'INSERT')
       or has_table_privilege(r, 'library.decrees_circulars', 'DELETE')
       or has_table_privilege(r, 'library.decrees_circulars', 'TRUNCATE') then
      raise exception 'T1 FAIL: % can write decrees_circulars', r;
    end if;
  end loop;
  raise notice 'T1 PASS: anon / authenticated / app_user read the 15 metadata columns only; no preamble; no writes';
end $$;

-- T2 a guest reads the metadata and searches fts (the read policy survived); never the preamble, never *
set role anon;
do $$
declare
  n int;
  t text;
begin
  select count(*) into n from library.decrees_circulars;
  if n <> 2 then raise exception 'T2 FAIL: anon read % decrees, expected 2', n; end if;
  select title into t from library.decrees_circulars
   where id = '00000000-0000-0000-0000-0000000000d1' and issuer = 'وزارة العدل' and instrument_ar = 'تعميم';
  if t is distinct from 'تعميم تجريبي بشأن التوثيق' then
    raise exception 'T2 FAIL: anon could not read the metadata columns (got %)', t;
  end if;
  select count(*) into n from library.decrees_circulars where fts @@ to_tsquery('simple', 'التوثيق');
  if n <> 1 then raise exception 'T2 FAIL: anon fts search found % decrees, expected 1', n; end if;
  begin
    select preamble into t from library.decrees_circulars limit 1;
    raise exception 'T2 FAIL: anon read decrees_circulars.preamble (%)', t;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.decrees_circulars where preamble is not null;
    raise exception 'T2 FAIL: anon filtered on decrees_circulars.preamble (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    perform d.* from library.decrees_circulars d limit 1;
    raise exception 'T2 FAIL: anon read decrees_circulars with *';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: anon reads 2 decrees with their metadata and finds 1 by fts; preamble (select / filter) and * raise insufficient_privilege';
end $$;
reset role;

-- T3 the same for a signed-in request (app_user is a member of authenticated)
set role app_user;
do $$
declare n int;
begin
  select count(*) into n from library.decrees_circulars;
  if n <> 2 then raise exception 'T3 FAIL: app_user read % decrees, expected 2', n; end if;
  begin
    select count(*) into n from library.decrees_circulars where preamble is not null;
    raise exception 'T3 FAIL: app_user read decrees_circulars.preamble (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    perform d.* from library.decrees_circulars d limit 1;
    raise exception 'T3 FAIL: app_user read decrees_circulars with *';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: a signed-in request reads the metadata but not the preamble, and not *';
end $$;
reset role;

-- T4 the service role reads the preamble (the decree route, the seeder)
set role service_role;
do $$
declare t text;
begin
  select preamble into t from library.decrees_circulars where id = '00000000-0000-0000-0000-0000000000d1';
  if t is distinct from 'بعون الله تعالى، نحن ... بعد الاطلاع على النظام' then
    raise exception 'T4 FAIL: service_role read preamble %', coalesce(t, 'NULL');
  end if;
  perform d.* from library.decrees_circulars d limit 1;
  raise notice 'T4 PASS: service_role reads the preamble and *';
end $$;
reset role;

-- T5 service_role keeps writes; RLS on; one anon read policy; the marker
do $$
begin
  if not has_table_privilege('service_role', 'library.decrees_circulars', 'INSERT')
     or not has_table_privilege('service_role', 'library.decrees_circulars', 'UPDATE')
     or not has_table_privilege('service_role', 'library.decrees_circulars', 'DELETE') then
    raise exception 'T5 FAIL: service_role lost write privileges on decrees_circulars (the loader needs them)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'library.decrees_circulars'::regclass) then
    raise exception 'T5 FAIL: RLS is off on decrees_circulars';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'library' and tablename = 'decrees_circulars'
                    and cmd in ('SELECT', 'ALL') and roles && array['anon', 'public']::name[]) then
    raise exception 'T5 FAIL: no anon read policy on decrees_circulars';
  end if;
  if coalesce(obj_description('library.decrees_circulars'::regclass, 'pg_class'), '')
       not like '%PREAMBLE SERVER-ONLY since 20261019_40%' then
    raise exception 'T5 FAIL: the 20261019_40 marker is missing';
  end if;
  raise notice 'T5 PASS: service_role keeps INSERT / UPDATE / DELETE; RLS on; read policy kept; marker present';
end $$;
