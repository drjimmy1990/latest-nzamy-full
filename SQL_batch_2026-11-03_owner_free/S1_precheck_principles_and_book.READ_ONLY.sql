-- للقراءة فقط — لا يغيّر شيئاً. شغّله على قاعدة الإنتاج قبل النشر وأرسل الجداول الثلاثة.
--
-- S1 Task 1 (owner-free wave, 2026-11-03). Not a migration: three SELECTs, no writes.
-- Its answer fills `dbId` in src/lib/library/legacyLibrarySlugs.ts (rows with ok = true
-- only) and tells the owner which collections still need loading.

-- 1) The 33 bundled collections: found by id or by title, with the principles each holds.
with expected(legacy_slug, json_id, json_title, json_count) as (values
  ('admin-supreme-1439-1440-1441-part1', 'مبادئ-المحكمة-الإدارية-العليا-1439-1440-1441هـ-ج1_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — للأعوام 1439-1440-1441هـ — الجزء الأول', 91),
  ('admin-supreme-1439-1440-1441-part2', 'مبادئ-المحكمة-الإدارية-العليا-1439-1440-1441هـ-ج2_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — للأعوام 1439-1440-1441هـ — الجزء الثاني', 68),
  ('admin-supreme-1442-part1', 'مبادئ-المحكمة-الإدارية-العليا-1442هـ-ج1_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الأول', 81),
  ('admin-supreme-1442-part2', 'مبادئ-المحكمة-الإدارية-العليا-1442هـ-ج2_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الثاني', 91),
  ('admin-supreme-1442-part3', 'مبادئ-المحكمة-الإدارية-العليا-1442هـ-ج3_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الثالث', 59),
  ('admin-supreme-1443-part1', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج1_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الأول', 95),
  ('admin-supreme-1443-part2', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج2_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الثاني', 91),
  ('admin-supreme-1443-part3', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج3_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الثالث', 93),
  ('admin-supreme-1443-part4', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج4_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الرابع', 82),
  ('admin-supreme-1443-part5', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج5_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الخامس', 83),
  ('admin-supreme-1444-part1', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج1_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الأول', 71),
  ('admin-supreme-1444-part2', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج2_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الثاني', 75),
  ('admin-supreme-1444-part3', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج3_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الثالث', 78),
  ('admin-supreme-1444-part4', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج4_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الرابع', 76),
  ('admin-supreme-1444-part5', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج5_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الخامس', 95),
  ('banking-1408-1427', 'مبادئ-تسوية-المنازعات-المصرفية-1408-1427_وزارة_العدل', 'مبادئ قضائية', 805),
  ('banking-1443', 'مبادئ-المنازعات-المصرفية-والتمويلية-1443_وزارة_العدل', 'مبادئ قضائية', 1022),
  ('commercial-papers', 'مبادئ-منازعات-الأوراق-التجارية_وزارة_العدل', 'مبادئ قضائية', 140),
  ('customs-2015-2023', 'مبادئ-الاستئناف-الجمركية-2015-2023م_وزارة_العدل', 'مجموعة المبادئ الاستئنافية الجمركية ٢٠١٥-٢٠٢٣م', 54),
  ('customs-2024', 'مبادئ-الاستئناف-الجمركية-2024م_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الجمركية لعام ٢٠٢٤م', 74),
  ('insurance-principles', 'مدونة-المبادئ-القضائية-التأمينية_وزارة_العدل', 'مدونة المبادئ القضائية التأمينية', 93),
  ('labor-principles-1431-vol1', 'مدونة-المبادئ-والقرارات-العمالية-1431هـ-المجلد-الأول_وزارة_العدل', 'مدونة المبادئ والقرارات العمالية لعام 1431هـ - المجلد الأول', 40),
  ('labor-principles-1431-vol2', 'مدونة-المبادئ-والقرارات-العمالية-1431هـ-المجلد-الثاني_وزارة_العدل', 'مدونة المبادئ والقرارات العمالية لعام 1431هـ - المجلد الثاني', 61),
  ('labor-principles-1432', 'مدونة-المبادئ-العمالية-1432هـ_وزارة_العدل', 'مدونة المبادئ العمالية لعام 1432هـ', 233),
  ('price-adjustment', 'مبادئ-لجنة-التظلمات-وتعديل-الأسعار_وزارة_العدل', 'مبادئ لجنة النظر في التظلمات وطلبات تعديل الأسعار', 17),
  ('supreme-judicial-council', 'المبادئ-والقرارات-القانونية-منقحة_وزارة_العدل', 'المبادئ والقرارات القانونية', 2323),
  ('tamyeez', 'تقريرات-محكمة-التمييز_وزارة_العدل', 'تقريرات محكمة التمييز', 1541),
  ('tax-2024', 'مبادئ-الاستئناف-الضريبية-2024م_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الضريبية لعام ٢٠٢٤م', 51),
  ('zakat-2024', 'مبادئ-الاستئناف-الزكوية-2024م_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية لعام ٢٠٢٤م', 64),
  ('zakat-tax-2020-2021-j1', 'مبادئ-الاستئناف-الزكوية-والضريبية-2020-2021م-ج1_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعامي ٢٠٢٠م - ٢٠٢١م - المجلد الأول', 146),
  ('zakat-tax-2020-2021-j2', 'مبادئ-الاستئناف-الزكوية-والضريبية-2020-2021م-ج2_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعامي ٢٠٢٠م - ٢٠٢١م - المجلد الثاني', 63),
  ('zakat-tax-2022-j3', 'مبادئ-الاستئناف-الزكوية-والضريبية-2022م-ج3_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعام ٢٠٢٢م - المجلد الثالث', 96),
  ('zakat-tax-2023-j4', 'مبادئ-الاستئناف-الزكوية-والضريبية-2023م-ج4_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعام ٢٠٢٣م - المجلد الرابع', 46)
), by_id as (
  -- An exact id match wins.
  select e.legacy_slug, e.json_count, 'id'::text as matched_by, jc.id as db_id
    from expected e
    join library.judicial_collections jc on jc.id = e.json_id
), by_title as (
  -- Title only when no id matched. Three rows share the title «مبادئ قضائية»
  -- (banking-1408-1427, banking-1443, commercial-papers), so a title match may be ambiguous.
  select e.legacy_slug, e.json_count, 'title'::text as matched_by, jc.id as db_id
    from expected e
    join library.judicial_collections jc on jc.title = e.json_title
   where not exists (select 1 from by_id b where b.legacy_slug = e.legacy_slug)
), found as (
  select e.legacy_slug, e.json_count, m.matched_by, m.db_id,
         (select count(*) from library.principles p where p.collection_id = m.db_id)::int as db_count
    from expected e
    left join (select * from by_id union all select * from by_title) m on m.legacy_slug = e.legacy_slug
)
select legacy_slug,
       json_count,
       coalesce(max(matched_by), '—') as matched_by,
       count(db_id)::int as match_count,
       coalesce(string_agg(db_id || ' (' || db_count || ')', ' | ' order by db_count desc), '— لا يوجد —') as db_matches,
       coalesce(max(db_count), 0) as best_db_count,
       (count(db_id) = 1 and coalesce(max(db_count), 0) >= json_count) as ok
  from found
 group by legacy_slug, json_count
 order by legacy_slug;

-- 2) Every collection the database holds, to match the "— لا يوجد —" rows by eye.
select jc.id, jc.title, jc.ruling_count,
       (select count(*) from library.principles p where p.collection_id = jc.id)::int as principles
  from library.judicial_collections jc
 order by jc.title, jc.id;

-- 3) The book «مصادر الحق».
select b.id, b.title, b.series_id, b.volume_number,
       (select count(*) from library.feqh_blocks fb where fb.book_id = b.id)::int as blocks,
       (select count(*) from library.feqh_blocks fb where fb.book_id = b.id) > 0 as ok
  from library.feqh_books b
 where b.title like 'مصادر الحق%' or b.id like 'مصادر-الحق%'
union all
select '— لا يوجد كتاب «مصادر الحق» في قاعدة البيانات —', null, null, null, 0, false
 where not exists (select 1 from library.feqh_books b where b.title like 'مصادر الحق%' or b.id like 'مصادر-الحق%');
