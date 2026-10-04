-- library_search_ranked_and_facets.test.sql — proves 20260925_01 + 20260925_04 compile and behave.
-- Chain (run.sh, postgres:16):
--   20260626_legal_library_schema.sql → 20260627_platform_settings.sql →
--   20260729_library_status.sql → 20260730_article_regulations.sql →
--   20260824_laws_effective_date_gregorian_columns.sql →
--   20260911_library_laws_enactment_gazette_schema.sql → 20260922_01_library_grants.sql →
--   20260925_01_library_search_law_articles_ranked.sql → 20260925_04_law_facet_counts.sql → this file
-- Every assertion RAISES on failure.

insert into library.laws (slug, title, type, section_code, has_merged_regulation) values
  ('labor-law',        'نظام العمل',                       'نظام',          '06', false),
  ('labor-exec',       'اللائحة التنفيذية لنظام العمل',     'لائحة تنفيذية', '06', true),
  ('labor-circular',   'تعميم وزارة الموارد البشرية',       'تعميم',         '06', false),
  ('companies-law',    'نظام الشركات',                     'نظام',          '05', false);

insert into library.articles (id, law_slug, number, text, status) values
  ('labor-law__art-1',      'labor-law',      '1', 'يسمى هذا النظام نظام العمل ويطبق على عقود العمل', 'active'),
  ('labor-law__art-2',      'labor-law',      '2', 'صاحب العمل والعامل وعقد العمل',                    'active'),
  ('labor-exec__art-1',     'labor-exec',     '1', 'تنظم هذه اللائحة أحكام العمل',                     'active'),
  ('labor-circular__art-1', 'labor-circular', '1', 'بشأن ساعات العمل في رمضان',                         'active'),
  ('companies-law__art-1',  'companies-law',  '1', 'الشركة عقد يلتزم بمقتضاه شخصان',                    'active');

-- T1 ranked search runs as anon (SECURITY INVOKER, EXECUTE granted) and ranks the نظام العمل articles first
set role anon;
do $$
declare
  first_id text;
  n int;
begin
  select id into first_id from library.search_law_articles_ranked('العمل', null, null, null, 10, 0) limit 1;
  select count(*) into n from library.search_law_articles_ranked('العمل', null, null, null, 10, 0);
  if n <> 4 then raise exception 'T1 FAIL: expected 4 ranked hits for العمل, got %', n; end if;
  if first_id not like 'labor-law__%' then
    raise exception 'T1 FAIL: expected a نظام العمل article first, got %', first_id;
  end if;
  raise notice 'T1 PASS: 4 hits, first = %', first_id;
end $$;

-- T2 filters and clamps: section 05 has no العمل article; limit is clamped to ≥1; offset past the end is empty
do $$
declare n int;
begin
  select count(*) into n from library.search_law_articles_ranked('العمل', '05', null, null, 10, 0);
  if n <> 0 then raise exception 'T2 FAIL: section filter leaked % rows', n; end if;
  select count(*) into n from library.search_law_articles_ranked('العمل', null, null, 'نظام', 10, 0);
  if n <> 2 then raise exception 'T2 FAIL: type filter expected 2, got %', n; end if;
  select count(*) into n from library.search_law_articles_ranked('العمل', null, null, null, 0, 0);
  if n <> 1 then raise exception 'T2 FAIL: limit 0 should clamp to 1, got %', n; end if;
  select count(*) into n from library.search_law_articles_ranked('العمل', null, null, null, 10, 50);
  if n <> 0 then raise exception 'T2 FAIL: offset past the end returned %', n; end if;
  raise notice 'T2 PASS: section/type filters and limit/offset clamps';
end $$;

-- T3 facet counts as anon: one row per (section, type, merged) and the counts sum to every law
do $$
declare total bigint; groups int; merged bigint;
begin
  select sum(n), count(*) into total, groups from library.law_facet_counts();
  if total <> 4 or groups <> 4 then
    raise exception 'T3 FAIL: expected 4 laws in 4 groups, got % in %', total, groups;
  end if;
  select n into merged from library.law_facet_counts()
   where section_code = '06' and type = 'لائحة تنفيذية' and has_merged_regulation;
  if merged is distinct from 1 then raise exception 'T3 FAIL: merged-regulation group = %', merged; end if;
  raise notice 'T3 PASS: facets sum to 4 laws';
end $$;
reset role;

-- T4 neither function is executable by PUBLIC-only roles
do $$
begin
  if has_function_privilege('public', 'library.law_facet_counts()', 'EXECUTE') then
    raise exception 'T4 FAIL: PUBLIC can execute law_facet_counts';
  end if;
  if not has_function_privilege('anon', 'library.search_law_articles_ranked(text,text,text,text,integer,integer)', 'EXECUTE') then
    raise exception 'T4 FAIL: anon lost EXECUTE on search_law_articles_ranked';
  end if;
  raise notice 'T4 PASS: grants are anon/authenticated/service_role only';
end $$;
