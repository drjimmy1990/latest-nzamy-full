-- library_tier_columns_1108.test.sql — proves 20261108_10 (owner ٤٢٤ / ٣٨٠ / ٣١٩).
-- Chain (run.sh, postgres:16) — the library chain of
-- library_decree_preamble_lock.test.sql (with 20261018_02 and 20261019_40),
-- then 20261108_10 TWICE (idempotent), then the documented re-opens and their
-- repairs: 20261019_40 + 20261108_10, and 20260922_01 + 20261018_02 +
-- 20261108_10. Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_feqh_locator_labels.sql $M/20260729_decree_instrument_taxonomy.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261018_02_library_feqh_decree_text_lock.sql $M/20261019_40_library_decree_preamble_lock.sql \
--     $M/20261108_10_library_decree_tier_columns_lock.sql $M/20261108_10_library_decree_tier_columns_lock.sql \
--     $M/20261019_40_library_decree_preamble_lock.sql $M/20261108_10_library_decree_tier_columns_lock.sql \
--     $M/20260922_01_library_grants.sql $M/20261018_02_library_feqh_decree_text_lock.sql \
--     $M/20261108_10_library_decree_tier_columns_lock.sql \
--     supabase/tests/rls/library_tier_columns_1108.test.sql
-- NEGATIVE CONTROL: the same chain without the four 20261108_10 files → T1
-- fails: «T1 FAIL: anon can read locked column decrees_circulars.ref».
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

insert into library.decrees_circulars (id, title, type, issuer, ref, date, summary, summary_brief, category,
                                       preamble, hashtags, official_url, instrument_ar)
  values ('00000000-0000-0000-0000-0000000000e1', 'تعميم تجريبي بشأن التوثيق', 'circular', 'وزارة العدل', '13/ت/123',
          '1446/01/01', 'صدر بالقرار رقم 135 وتاريخ 1446/01/01', 'موجز القرار 135', '08',
          'بعون الله تعالى', array['توثيق'], 'https://example.gov.sa/e1', 'تعميم'),
         ('00000000-0000-0000-0000-0000000000e2', 'قرار بلا رقم', 'circular', 'وزارة العدل', null,
          null, null, null, '08', null, '{}', null, null);

-- T1 privileges: the 9 catalogue columns only; every tier column locked; no writes
do $$
declare
  r   text;
  col text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user'] loop
    if has_table_privilege(r, 'library.decrees_circulars', 'SELECT') then
      raise exception 'T1 FAIL: % holds table-level SELECT on decrees_circulars', r;
    end if;
    foreach col in array array['id', 'title', 'type', 'issuer', 'category', 'hashtags', 'created_at', 'updated_at', 'instrument_ar'] loop
      if not has_column_privilege(r, 'library.decrees_circulars', col, 'SELECT') then
        raise exception 'T1 FAIL: % cannot read public column decrees_circulars.%', r, col;
      end if;
    end loop;
    foreach col in array array['ref', 'date', 'official_url', 'summary', 'summary_brief', 'fts', 'preamble'] loop
      if has_column_privilege(r, 'library.decrees_circulars', col, 'SELECT') then
        raise exception 'T1 FAIL: % can read locked column decrees_circulars.%', r, col;
      end if;
    end loop;
    if has_any_column_privilege(r, 'library.decrees_circulars', 'UPDATE')
       or has_any_column_privilege(r, 'library.decrees_circulars', 'INSERT')
       or has_table_privilege(r, 'library.decrees_circulars', 'DELETE')
       or has_table_privilege(r, 'library.decrees_circulars', 'TRUNCATE') then
      raise exception 'T1 FAIL: % can write decrees_circulars', r;
    end if;
  end loop;
  raise notice 'T1 PASS: anon / authenticated / app_user read the 9 catalogue columns only; ref, date, official_url, summary, summary_brief, fts, preamble locked; no writes';
end $$;

-- T2 a guest still reads the catalogue (the read policy survived), never a tier column, never *
set role anon;
do $$
declare
  n int;
  t text;
begin
  select count(*) into n from library.decrees_circulars;
  if n <> 2 then raise exception 'T2 FAIL: anon read % decrees, expected 2', n; end if;
  select title into t from library.decrees_circulars
   where id = '00000000-0000-0000-0000-0000000000e1' and issuer = 'وزارة العدل' and instrument_ar = 'تعميم'
     and category = '08' and type = 'circular';
  if t is distinct from 'تعميم تجريبي بشأن التوثيق' then
    raise exception 'T2 FAIL: anon could not read the catalogue columns (got %)', t;
  end if;
  begin
    select ref into t from library.decrees_circulars limit 1;
    raise exception 'T2 FAIL: anon read decrees_circulars.ref (%)', t;
  exception when insufficient_privilege then null;
  end;
  begin
    select date into t from library.decrees_circulars limit 1;
    raise exception 'T2 FAIL: anon read decrees_circulars.date (%)', t;
  exception when insufficient_privilege then null;
  end;
  begin
    select official_url into t from library.decrees_circulars limit 1;
    raise exception 'T2 FAIL: anon read decrees_circulars.official_url (%)', t;
  exception when insufficient_privilege then null;
  end;
  begin
    select summary into t from library.decrees_circulars limit 1;
    raise exception 'T2 FAIL: anon read decrees_circulars.summary (%)', t;
  exception when insufficient_privilege then null;
  end;
  begin
    select summary_brief into t from library.decrees_circulars limit 1;
    raise exception 'T2 FAIL: anon read decrees_circulars.summary_brief (%)', t;
  exception when insufficient_privilege then null;
  end;
  begin
    select fts::text into t from library.decrees_circulars limit 1;
    raise exception 'T2 FAIL: anon read decrees_circulars.fts (%)', t;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.decrees_circulars where fts @@ to_tsquery('simple', '135');
    raise exception 'T2 FAIL: anon searched decrees_circulars.fts (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.decrees_circulars where date like '%1446%';
    raise exception 'T2 FAIL: anon filtered on decrees_circulars.date (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.decrees_circulars where ref is not null;
    raise exception 'T2 FAIL: anon filtered on decrees_circulars.ref (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    perform d.* from library.decrees_circulars d limit 1;
    raise exception 'T2 FAIL: anon read decrees_circulars with *';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: anon reads 2 decrees with their catalogue columns; ref / date / official_url / summary / summary_brief / fts (select, filter, search) and * raise insufficient_privilege';
end $$;
reset role;

-- T3 the same for a signed-in request (app_user is a member of authenticated)
set role app_user;
do $$
declare
  n int;
  t text;
begin
  select count(*) into n from library.decrees_circulars where category = '08';
  if n <> 2 then raise exception 'T3 FAIL: app_user read % decrees, expected 2', n; end if;
  begin
    select ref into t from library.decrees_circulars limit 1;
    raise exception 'T3 FAIL: app_user read decrees_circulars.ref (%)', t;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.decrees_circulars where fts @@ to_tsquery('simple', '135');
    raise exception 'T3 FAIL: app_user searched decrees_circulars.fts (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    select summary_brief into t from library.decrees_circulars limit 1;
    raise exception 'T3 FAIL: app_user read decrees_circulars.summary_brief (%)', t;
  exception when insufficient_privilege then null;
  end;
  begin
    perform d.* from library.decrees_circulars d limit 1;
    raise exception 'T3 FAIL: app_user read decrees_circulars with *';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: a signed-in request reads the catalogue but not ref / fts / summary_brief, and not *';
end $$;
reset role;

-- T4 the service role reads every column and searches fts (the routes, the loader)
set role service_role;
do $$
declare
  n int;
  rec record;
begin
  select ref, date, official_url, summary, summary_brief, preamble into rec
    from library.decrees_circulars where id = '00000000-0000-0000-0000-0000000000e1';
  if rec.ref is distinct from '13/ت/123' or rec.date is distinct from '1446/01/01'
     or rec.official_url is distinct from 'https://example.gov.sa/e1'
     or rec.summary_brief is distinct from 'موجز القرار 135' or rec.preamble is distinct from 'بعون الله تعالى' then
    raise exception 'T4 FAIL: service_role read %', row_to_json(rec);
  end if;
  select count(*) into n from library.decrees_circulars where fts @@ to_tsquery('simple', '135') and date like '%1446%';
  if n <> 1 then raise exception 'T4 FAIL: service_role fts + date search found % decrees, expected 1', n; end if;
  perform d.* from library.decrees_circulars d limit 1;
  raise notice 'T4 PASS: service_role reads ref / date / official_url / summaries / preamble, searches fts, and reads *';
end $$;
reset role;

-- T5 service_role keeps writes; RLS on; read policy; both markers
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
       not like '%TIER COLUMNS SERVER-ONLY since 20261108_10%'
     or coalesce(obj_description('library.decrees_circulars'::regclass, 'pg_class'), '')
       not like '%PREAMBLE SERVER-ONLY since 20261019_40%' then
    raise exception 'T5 FAIL: a marker is missing';
  end if;
  raise notice 'T5 PASS: service_role keeps INSERT / UPDATE / DELETE; RLS on; read policy kept; both markers present';
end $$;
