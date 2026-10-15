-- library_principles_text_lock.test.sql — proves 20261016_01 (owner decision ١٧١).
-- Chain (run.sh, postgres:16) — the column lock chain, then this migration TWICE
-- (idempotent), then 20261004_01 + 20261016_01 again (the documented re-open and
-- its repair):
-- Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql \
--     $M/20261016_01_library_principles_text_lock.sql $M/20261016_01_library_principles_text_lock.sql \
--     $M/20261004_01_library_column_lock.sql $M/20261016_01_library_principles_text_lock.sql \
--     supabase/tests/rls/library_principles_text_lock.test.sql
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

insert into library.judicial_collections (id, title, court, track)
  values ('coll-1', 'مبادئ المحكمة العليا', 'المحكمة العليا', 'general');
insert into library.principles (id, collection_id, principle_number, issuing_body, session_date,
                                decision_number, text, facts, reasons, ruling, order_index,
                                classification_keywords)
  values ('coll-1__p-1', 'coll-1', '1', 'المحكمة العليا', '1440/01/01', '123',
          'العقد شريعة المتعاقدين', 'وقائع الدعوى', 'أسباب الحكم', 'منطوق الحكم', 1,
          array['عقود']);
insert into library.principle_paragraphs (principle_id, letter, text, order_index)
  values ('coll-1__p-1', 'أ', 'الفقرة الأولى من المبدأ', 1);

-- T1 privileges: the catalogue columns only on principles; nothing on paragraphs; no writes
do $$
declare
  r   text;
  col text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user']
  loop
    foreach col in array array['id', 'collection_id', 'principle_number', 'issuing_body', 'session_date',
                               'decision_number', 'reference', 'year_hijri', 'order_index',
                               'classification_keywords', 'hashtags', 'is_redacted', 'created_at', 'updated_at']
    loop
      if not has_column_privilege(r, 'library.principles', col, 'SELECT') then
        raise exception 'T1 FAIL: % cannot read public column principles.%', r, col;
      end if;
    end loop;
    foreach col in array array['text', 'ruling_basis', 'facts', 'reasons', 'ruling', 'fts', 'metadata']
    loop
      if has_column_privilege(r, 'library.principles', col, 'SELECT') then
        raise exception 'T1 FAIL: % can read locked column principles.%', r, col;
      end if;
    end loop;
    if has_any_column_privilege(r, 'library.principle_paragraphs', 'SELECT') then
      raise exception 'T1 FAIL: % can SELECT principle_paragraphs', r;
    end if;
    if has_any_column_privilege(r, 'library.principles', 'UPDATE')
       or has_any_column_privilege(r, 'library.principles', 'INSERT')
       or has_table_privilege(r, 'library.principles', 'DELETE')
       or has_table_privilege(r, 'library.principle_paragraphs', 'INSERT') then
      raise exception 'T1 FAIL: % can write a principles table', r;
    end if;
  end loop;
  raise notice 'T1 PASS: anon / authenticated / app_user read the 14 catalogue columns only; no paragraphs; no writes';
end $$;

-- T2 a guest reads the catalogue card (the read policy survived) but not the text
set role anon;
do $$
declare
  n   int;
  num text;
begin
  select principle_number into num from library.principles where id = 'coll-1__p-1';
  if num is distinct from '1' then
    raise exception 'T2 FAIL: anon could not read the catalogue row (got %)', num;
  end if;
  begin
    select count(*) into n from library.principles where text is not null;
    raise exception 'T2 FAIL: anon filtered on principles.text (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.principles where fts @@ plainto_tsquery('simple', 'العقد');
    raise exception 'T2 FAIL: anon searched principles.fts (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.principles where facts is not null or ruling is not null;
    raise exception 'T2 FAIL: anon read facts / ruling (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.principle_paragraphs;
    raise exception 'T2 FAIL: anon read principle_paragraphs (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: anon reads the catalogue row; text / fts / facts / ruling / paragraphs raise insufficient_privilege';
end $$;
reset role;

-- T3 the same for a signed-in request (app_user is a member of authenticated)
set role app_user;
do $$
declare n int;
begin
  begin
    select count(*) into n from library.principles where reasons is not null;
    raise exception 'T3 FAIL: app_user read principles.reasons (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n
      from library.principles p join library.principle_paragraphs pp on pp.principle_id = p.id;
    raise exception 'T3 FAIL: app_user read the principles/paragraphs join (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from library.principles where collection_id = 'coll-1';
  if n <> 1 then
    raise exception 'T3 FAIL: app_user lost the catalogue row (% rows)', n;
  end if;
  raise notice 'T3 PASS: a signed-in request reads the catalogue, never the text or the paragraphs';
end $$;
reset role;

-- T4 service_role reads everything the precedent route needs
set role service_role;
do $$
declare
  body  text;
  rul   text;
  para  text;
  hits  int;
begin
  select p.text, p.ruling into body, rul from library.principles p where p.id = 'coll-1__p-1';
  select pp.text into para from library.principle_paragraphs pp where pp.principle_id = 'coll-1__p-1';
  select count(*) into hits from library.principles where fts @@ plainto_tsquery('simple', 'العقد');
  if body is distinct from 'العقد شريعة المتعاقدين' or rul is distinct from 'منطوق الحكم'
     or para is distinct from 'الفقرة الأولى من المبدأ' then
    raise exception 'T4 FAIL: service_role read text=% ruling=% paragraph=%', body, rul, para;
  end if;
  raise notice 'T4 PASS: service_role reads text, ruling and paragraphs (fts hits: %)', hits;
end $$;
reset role;

-- T5 the marker, the paragraphs policy gone, RLS on both, and the earlier locks intact
do $$
begin
  if coalesce(obj_description('library.principles'::regclass, 'pg_class'), '') not ilike '%text server-only since 20261016_01%' then
    raise exception 'T5 FAIL: marker missing on library.principles';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'library' and tablename = 'principle_paragraphs'
                and cmd in ('SELECT', 'ALL') and roles && array['anon', 'authenticated', 'public']::name[]) then
    raise exception 'T5 FAIL: a public read policy survives on principle_paragraphs';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'library.principle_paragraphs'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'library.principles'::regclass) then
    raise exception 'T5 FAIL: RLS is off on a principles table';
  end if;
  if has_any_column_privilege('anon', 'library.articles', 'SELECT')
     or has_column_privilege('anon', 'library.laws', 'preamble', 'SELECT')
     or has_column_privilege('anon', 'library.judicial_collections', 'metadata', 'SELECT') then
    raise exception 'T5 FAIL: an earlier library lock was undone';
  end if;
  raise notice 'T5 PASS: marker present; paragraphs policy gone; RLS on; the article and laws locks still hold';
end $$;
