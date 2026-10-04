-- library_column_lock.test.sql — proves 20261004_01 (owner question ١٦٢).
-- Chain (run.sh, postgres:16) — the migration is listed TWICE to prove it is idempotent:
--   20260626_legal_library_schema.sql → 20260627_platform_settings.sql →
--   20260722_laws_add_gregorian_guid.sql → 20260729_library_status.sql →
--   20260730_article_regulations.sql → 20260821_judicial_principles_missing_columns.sql →
--   20260824_laws_effective_date_gregorian_columns.sql →
--   20260911_library_laws_enactment_gazette_schema.sql → 20260919_laws_parent_linkage_columns.sql →
--   20260922_01_library_grants.sql → 20260922_04_library_view_security_invoker.sql →
--   20260925_04_law_facet_counts.sql → 20260929_01_library_text_server_only.sql →
--   20261004_01_library_column_lock.sql → 20261004_01_library_column_lock.sql → this file
-- Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql $M/20261004_01_library_column_lock.sql \
--     supabase/tests/rls/library_column_lock.test.sql
-- (20260823_fts_number_search.sql is left out: on this bare chain its DROP COLUMN fts
-- collides with the 20260626 matview; principles.fts from 20260626 is enough here.)
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- Fixture: one law carrying official metadata, one collection with internal
-- metadata, one principle with internal metadata.
insert into library.laws (slug, title, type, section_code, description, status,
                          issuing_instrument, issue_date_hijri, publication_date_hijri,
                          effective_date_hijri, boe_source_url, official_source_url,
                          preamble, gazette_issue_number, gazette_url, law_guid,
                          enactment_clause_text, supersedes_law_slug, instrument_id)
  values ('labor-law', 'نظام العمل', 'نظام', '06', 'ينظم علاقات العمل', 'active',
          'مرسوم ملكي رقم (م/51)', '1426/08/23', '1426/09/25',
          '1427/03/25', 'https://laws.boe.gov.sa/x', 'https://example.gov.sa/x',
          'أداة إصدار التشريع | مرسوم ملكي رقم (م/51)', '4068', 'https://uqn.gov.sa/x', 'guid-1',
          'يعمل بهذا النظام بعد مضي مئة وثمانين يوماً', 'old-labor-law', 'INS-1');
insert into library.judicial_collections (id, title, court, track, metadata)
  values ('coll-1', 'مبادئ المحكمة العليا', 'المحكمة العليا', 'general',
          '{"editorial_notes": "داخلي", "review_reason": "داخلي", "source": "x"}');
insert into library.principles (id, collection_id, principle_number, issuing_body, text, order_index, metadata)
  values ('coll-1__p-1', 'coll-1', '1', 'المحكمة العليا', 'العقد شريعة المتعاقدين', 1,
          '{"needs_human_review": true}');

-- T1 no table-level and no write privilege; the allow-list is readable; every other column is not
do $$
declare
  spec record;
  r    text;
  col  text;
begin
  for spec in
    select * from (values
      ('library.laws', array[
        'slug', 'title', 'title_en', 'type', 'description', 'section_code', 'section_name',
        'status', 'total_articles', 'has_merged_regulation',
        'effective_date_hijri', 'effective_date_gregorian',
        'supersedes_law_slug', 'instrument_id', 'parent_law_id', 'parent_law', 'enabling_article',
        'fts', 'created_at', 'updated_at']),
      ('library.judicial_collections', array[
        'id', 'title', 'court', 'year_hijri', 'part', 'source_id', 'series_id', 'track', 'description',
        'ruling_count', 'free', 'progress', 'created_at', 'updated_at']),
      ('library.principles', array[
        'id', 'collection_id', 'principle_number', 'issuing_body', 'session_date',
        'decision_number', 'reference', 'text', 'ruling_basis', 'facts', 'reasons', 'ruling',
        'year_hijri', 'order_index', 'classification_keywords', 'hashtags', 'is_redacted',
        'fts', 'created_at', 'updated_at'])
    ) as v(tbl, allowed)
  loop
    foreach r in array array['anon', 'authenticated', 'app_user']
    loop
      if has_table_privilege(r, spec.tbl, 'SELECT') then
        raise exception 'T1 FAIL: % holds table-level SELECT on %', r, spec.tbl;
      end if;
      if has_table_privilege(r, spec.tbl, 'INSERT') or has_table_privilege(r, spec.tbl, 'UPDATE')
         or has_table_privilege(r, spec.tbl, 'DELETE') or has_any_column_privilege(r, spec.tbl, 'UPDATE') then
        raise exception 'T1 FAIL: % can write %', r, spec.tbl;
      end if;
      foreach col in array spec.allowed
      loop
        if not has_column_privilege(r, spec.tbl, col, 'SELECT') then
          raise exception 'T1 FAIL: % cannot read allowed column %.%', r, spec.tbl, col;
        end if;
      end loop;
      for col in
        select att.attname::text from pg_attribute att
         where att.attrelid = spec.tbl::regclass and att.attnum > 0 and not att.attisdropped
      loop
        if not (col = any (spec.allowed)) and has_column_privilege(r, spec.tbl, col, 'SELECT') then
          raise exception 'T1 FAIL: % can read locked column %.%', r, spec.tbl, col;
        end if;
      end loop;
    end loop;
  end loop;
  raise notice 'T1 PASS: anon / authenticated / app_user read the allow-list only (20 laws, 14 collection, 20 principle columns), no table-level or write privilege';
end $$;

-- T2 the named locked columns, spelled out (the sweep above already covers them)
do $$
declare
  col text;
begin
  foreach col in array array[
    'issuing_body', 'issuing_instrument', 'issue_date_hijri', 'issue_date_gregorian',
    'publication_date_hijri', 'publication_date_gregorian', 'boe_source_url', 'official_source_url',
    'law_guid', 'gazette_issue_number', 'gazette_publication_date', 'gazette_url', 'preamble',
    'article_status_summary', 'latest_update', 'effective_date_note', 'enactment_period_days',
    'enactment_clause_text', 'enactment_article_number', 'supersedes_law_ref', 'supersedes_law_title']
  loop
    if has_column_privilege('anon', 'library.laws', col, 'SELECT') then
      raise exception 'T2 FAIL: anon can read library.laws.%', col;
    end if;
  end loop;
  if has_column_privilege('anon', 'library.judicial_collections', 'metadata', 'SELECT')
     or has_column_privilege('anon', 'library.principles', 'metadata', 'SELECT') then
    raise exception 'T2 FAIL: anon can read judicial_collections.metadata / principles.metadata';
  end if;
  -- fts stays readable on purpose: the public searches filter on it under
  -- anon's statement_timeout, and it is built from readable columns only.
  if not has_column_privilege('anon', 'library.laws', 'fts', 'SELECT')
     or not has_column_privilege('anon', 'library.principles', 'fts', 'SELECT') then
    raise exception 'T2 FAIL: anon cannot read laws.fts / principles.fts (public search would need the service role)';
  end if;
  raise notice 'T2 PASS: the 21 locked laws columns, collections.metadata and principles.metadata are unreadable by anon; laws.fts and principles.fts stay readable';
end $$;

-- T3 actual reads as anon: allowed columns and fts searches return rows;
-- locked ones, `*` and a filter/sort on a locked date are refused with 42501
set role anon;
do $$
declare
  n    int;
  t    text;
  stmt text;
begin
  select count(*) into n from library.laws where slug = 'labor-law' and type = 'نظام';
  if n <> 1 then raise exception 'T3 FAIL: anon read % rows of allowed laws columns (expected 1)', n; end if;
  perform slug, title, effective_date_hijri, supersedes_law_slug, instrument_id, parent_law_id
     from library.laws where supersedes_law_slug = 'old-labor-law';
  perform p.id, p.text, c.title from library.principles p
     join library.judicial_collections c on c.id = p.collection_id;
  -- The public full-text searches (law titles, principles) run as anon.
  select count(*) into n from library.laws where fts @@ to_tsquery('simple', 'العمل');
  if n <> 1 then raise exception 'T3 FAIL: anon fts search on laws returned % rows (expected 1)', n; end if;
  select count(*) into n from library.principles p
    join library.judicial_collections c on c.id = p.collection_id
   where p.fts @@ to_tsquery('simple', 'العقد');
  if n <> 1 then raise exception 'T3 FAIL: anon fts search on principles returned % rows (expected 1)', n; end if;

  foreach stmt in array array[
    'select preamble from library.laws',
    'select issuing_instrument, issue_date_hijri from library.laws',
    'select gazette_url from library.laws',
    'select enactment_clause_text from library.laws',
    'select * from library.laws',
    'select slug from library.laws where issue_date_hijri like ''%1426%''',
    'select slug from library.laws order by publication_date_hijri',
    'select metadata from library.judicial_collections',
    'select * from library.judicial_collections',
    'select metadata from library.principles',
    'select * from library.principles'
  ]
  loop
    begin
      execute stmt;
      raise exception 'T3 FAIL: anon ran: %', stmt;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'T3 PASS: anon reads allowed columns, the principles→collections join and fts searches on laws / principles; locked columns, select * and a locked-date filter/sort raise insufficient_privilege';
end $$;
reset role;

-- T4 the same for a signed-in request (app_user runs as a member of authenticated)
set role app_user;
do $$
declare
  n    int;
  stmt text;
begin
  select count(*) into n from library.laws;
  if n <> 1 then raise exception 'T4 FAIL: app_user read % laws rows (expected 1)', n; end if;
  select count(*) into n from library.principles where fts @@ to_tsquery('simple', 'العقد');
  if n <> 1 then raise exception 'T4 FAIL: app_user fts search on principles returned % rows (expected 1)', n; end if;
  foreach stmt in array array[
    'select preamble from library.laws',
    'select * from library.laws',
    'select metadata from library.judicial_collections',
    'select metadata from library.principles'
  ]
  loop
    begin
      execute stmt;
      raise exception 'T4 FAIL: app_user ran: %', stmt;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'T4 PASS: a signed-in (authenticated) request is locked the same way (and searches fts the same way)';
end $$;
reset role;

-- T5 the enactment-status view is closed; the facets RPC (INVOKER, allowed columns) still runs as anon
set role anon;
do $$
declare
  n int;
begin
  begin
    select count(*) into n from library.v_laws_enactment_status;
    raise exception 'T5 FAIL: anon read v_laws_enactment_status (% rows)', n;
  exception when insufficient_privilege then
    null;
  end;
  select count(*) into n from library.law_facet_counts();
  if n <> 1 then raise exception 'T5 FAIL: law_facet_counts() as anon returned % rows (expected 1)', n; end if;
  raise notice 'T5 PASS: v_laws_enactment_status refused to anon; law_facet_counts() still answers anon';
end $$;
reset role;

-- T6 service_role reads the locked columns (the routes mask them) and keeps write privileges
set role service_role;
do $$
declare
  decree text;
  meta   jsonb;
  n      int;
begin
  select issuing_instrument into decree from library.laws
   where slug = 'labor-law' and fts @@ to_tsquery('simple', 'العمل');
  select metadata into meta from library.judicial_collections where id = 'coll-1';
  select count(*) into n from library.principles where fts @@ to_tsquery('simple', 'العقد');
  if decree is distinct from 'مرسوم ملكي رقم (م/51)' or meta is null or n <> 1 then
    raise exception 'T6 FAIL: service_role read decree=% metadata=% principles=%', decree, meta, n;
  end if;
  perform * from library.laws;
  perform * from library.v_laws_enactment_status;
  raise notice 'T6 PASS: service_role reads the decree, metadata, fts filters, select * and the view';
end $$;
reset role;

do $$
begin
  if not has_table_privilege('service_role', 'library.laws', 'INSERT')
     or not has_table_privilege('service_role', 'library.judicial_collections', 'UPDATE')
     or not has_table_privilege('service_role', 'library.principles', 'DELETE') then
    raise exception 'T6b FAIL: service_role lost write privileges (the seeder needs them)';
  end if;
  raise notice 'T6b PASS: service_role keeps write privileges on the three (seeder)';
end $$;

-- T7 the article lock of 20260929_01 still holds, and the rest of the catalogue stays public
do $$
declare
  t text;
begin
  foreach t in array array['library.articles', 'library.article_regulations', 'library.article_amendments']
  loop
    if has_any_column_privilege('anon', t, 'SELECT') then
      raise exception 'T7 FAIL: anon can SELECT %', t;
    end if;
  end loop;
  foreach t in array array['library.chapters', 'library.decrees_circulars', 'library.principle_paragraphs',
                           'library.feqh_books', 'library.feqh_blocks']
  loop
    if not has_table_privilege('anon', t, 'SELECT') then
      raise exception 'T7 FAIL: anon lost SELECT on %', t;
    end if;
  end loop;
  raise notice 'T7 PASS: article tables still server-only; chapters, decrees, paragraphs and feqh still anon-readable';
end $$;

-- T8 a column added later is locked by default (fails closed)
alter table library.laws add column t8_probe text;
do $$
begin
  if has_column_privilege('anon', 'library.laws', 't8_probe', 'SELECT') then
    raise exception 'T8 FAIL: a newly added column is anon-readable';
  end if;
  raise notice 'T8 PASS: a column added after the lock is unreadable by anon until granted';
end $$;
alter table library.laws drop column t8_probe;

-- T9 the marker that _verify.sql keys on is present; RLS and the read policies stay
do $$
declare
  t text;
begin
  if coalesce(obj_description('library.laws'::regclass, 'pg_class'), '') not ilike '%column-locked since 20261004_01%' then
    raise exception 'T9 FAIL: the 20261004_01 marker comment is missing on library.laws';
  end if;
  foreach t in array array['laws', 'judicial_collections', 'principles']
  loop
    if not (select relrowsecurity from pg_class where oid = ('library.' || t)::regclass) then
      raise exception 'T9 FAIL: RLS is off on library.%', t;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'library' and tablename = t
                      and cmd in ('SELECT', 'ALL') and roles && array['anon', 'public']::name[]) then
      raise exception 'T9 FAIL: no anon read policy on library.%', t;
    end if;
  end loop;
  raise notice 'T9 PASS: marker present; RLS on and the public read policies kept on all three';
end $$;
