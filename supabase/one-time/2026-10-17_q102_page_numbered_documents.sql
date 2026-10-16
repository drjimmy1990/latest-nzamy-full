-- ════════════════════════════════════════════════════════════════════════════
-- One-time data fix (NOT a migration) — owner decision ١٠٢ (answers of 2026-10-06):
-- «تصنيفها كـ "دليل إرشادي / تنظيم إداري" مع الحفاظ على ترقيم الصفحات الفريد».
-- Run by the user in the self-hosted SQL Editor (auth.nezamy.sa, as postgres).
-- Run block 1 alone first and read it; then block 2; then block 3.
--
-- WHAT: 81 documents in library.laws are typed «نظام» or «لائحة تنفيذية» but
--   are numbered by PAGE, not by article: every one of their articles is
--   «الصفحة N» (نظام: 5 · لائحة تنفيذية: 76). A copied citation then reads
--   «الصفحة (3) من نظام (…)». The owner's decision gives them the label
--   «دليل إرشادي / تنظيم إداري» (verbatim, one value).
--   The July count of 112 (دليل_المالك_إصلاح_المعرفات.md) was taken on the old
--   corpus; this list is the same rule on the library loaded 2026-10-15/16.
-- HOW THE LIST WAS MADE: a guest-only scan of live on 2026-10-17 — the public
--   law API (/api/library/laws/<slug>) for every one of the 2475 laws typed
--   «نظام» or «لائحة تنفيذية», counting articles whose number is a page
--   (the reader's own rule, isPageLocator in src/app/laws/[slug]/_citation.ts).
--   Block 1 (b) recomputes the same rule inside the database, and block 2
--   refuses to run if the two disagree.
-- WHAT CHANGES: library.laws.type on these 81 rows, nothing else. No article,
--   article id, number_text («الصفحة N»), chapter, anchor or URL changes: the
--   page anchors stay exactly as they are. No user table is touched. The
--   search filter, the /laws type chips and the citation read the label as
--   data (the citation knows it since this branch's _citation.ts change).
-- WHAT IS NOT CHANGED (listed in block 1 for the record):
--   * «تعميم» documents numbered by page (0): a circular is a letter,
--     pages are its natural locator, and the decision names نظام/لائحة only;
--   * documents typed نظام / لائحة تنفيذية mixing pages and articles
--     (2; block 1 (d)).
-- REGENERATE (never edit the list by hand — block 2 compares it with the rule):
--   node scripts/library-q102-page-numbered-scan.mjs <scan.jsonl>
--   node scripts/library-q102-page-numbered-generate.cjs <scan.jsonl> [--exclude <slugs.txt>]
-- A RELOAD UNDOES IT: the owner's next library upload writes the type from his
--   files again. The same list, for his frontmatter, is
--   docs/plans/2026-10-17-q102-page-numbered-documents.md.
-- ROLLBACK: block 4 (each row gets back the type it had).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — read-only. Expect: (a) 81 rows; (b) 0 rows; (c)/(d) for the record.
-- (a) the list as it is on live now
with q102(slug, old_type) as (values
    ('alula-royal-commission-founding-order-1438', 'لائحة تنفيذية'),
    ('arabian-shield-farm-wells-drilling-license-mechanism', 'لائحة تنفيذية'),
    ('authority-decision-1399-1441-08-02', 'لائحة تنفيذية'),
    ('camel-club-founding-order-1438', 'لائحة تنفيذية'),
    ('cloud-computing-electricity-tariff-rules', 'لائحة تنفيذية'),
    ('collective-housing-health-safety-requirements', 'لائحة تنفيذية'),
    ('controls-206-1390-05-03', 'لائحة تنفيذية'),
    ('controls-35406-1439-07-18', 'لائحة تنفيذية'),
    ('controls-48000135-1448-02-08', 'لائحة تنفيذية'),
    ('controls-7-b-8213-1425-02-13', 'لائحة تنفيذية'),
    ('controls-73-1398-09-16', 'لائحة تنفيذية'),
    ('controls-8-127-2016-1438-01-16', 'لائحة تنفيذية'),
    ('controls-80-1448-01-15', 'لائحة تنفيذية'),
    ('deadline-extension-light-goods-transport-establishment-status', 'لائحة تنفيذية'),
    ('dec-developing-intermediate-technical-college', 'لائحة تنفيذية'),
    ('dentistry-services-regulatory-bylaw', 'لائحة تنفيذية'),
    ('dga-e-participation-controls', 'لائحة تنفيذية'),
    ('driver-card-permitted-professions-light-goods-transport', 'لائحة تنفيذية'),
    ('electricity-backup-power-sources-rules', 'لائحة تنفيذية'),
    ('electricity-incident-reporting-rules', 'لائحة تنفيذية'),
    ('enrichment-programs-regulatory-framework-1436', 'لائحة تنفيذية'),
    ('environmental-inspection-audit-regulation-copy', 'لائحة تنفيذية'),
    ('export-houses-licensing-regulation', 'لائحة تنفيذية'),
    ('falcon-club-basic-organization', 'لائحة تنفيذية'),
    ('framework-exams-center-education-general', 'لائحة تنفيذية'),
    ('framework-law-20-0251', 'لائحة تنفيذية'),
    ('hr-executive-regulation-frameworks', 'لائحة تنفيذية'),
    ('implementation-mechanism-light-goods-transport', 'لائحة تنفيذية'),
    ('implementation-mechanism-postal-law-regulation', 'لائحة تنفيذية'),
    ('instructions-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('instructions-18070-1425-04-08', 'لائحة تنفيذية'),
    ('instructions-2-115-2018-1440-02-13-law-08-12322', 'لائحة تنفيذية'),
    ('instructions-2-66-2018-1439-09-22-law-08-12325', 'لائحة تنفيذية'),
    ('instructions-4-8-2017-1438-04-26', 'لائحة تنفيذية'),
    ('instructions-6-130-2016-1438-01-23', 'لائحة تنفيذية'),
    ('instructions-moe-20-0250-1446', 'لائحة تنفيذية'),
    ('intensive-electricity-consumption-tariff-rules', 'لائحة تنفيذية'),
    ('law-school-safety-part-2-planning', 'نظام'),
    ('law-school-safety-part-3-support', 'نظام'),
    ('law-school-safety-part-4-operations', 'نظام'),
    ('law-school-safety-part-5-performance-evaluation', 'نظام'),
    ('law-school-safety-part-6-improvement', 'نظام'),
    ('learning-neighborhood-centers-framework-2018-2019', 'لائحة تنفيذية'),
    ('liquidators-assignment-controls', 'لائحة تنفيذية'),
    ('movables-vehicles-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('organizational-statute-757-3-49-1405-03-24', 'لائحة تنفيذية'),
    ('real-estate-sale-agents-assignment-controls', 'لائحة تنفيذية'),
    ('real-estate-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('regulation-1-11-2004-1425-08-20', 'لائحة تنفيذية'),
    ('regulation-1-193-2006-1427-06-20', 'لائحة تنفيذية'),
    ('regulation-1-219-2006-1427-12-03', 'لائحة تنفيذية'),
    ('regulation-1-28-2008-1429-08-17', 'لائحة تنفيذية'),
    ('regulation-1-61-2016-1437-08-16', 'لائحة تنفيذية'),
    ('regulation-2-83-2005-1426-05-21-law-08-12328', 'لائحة تنفيذية'),
    ('regulation-education', 'لائحة تنفيذية'),
    ('rules-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('rules-1-3-2018-1439-04-22', 'لائحة تنفيذية'),
    ('rules-1-38-2016-1437-06-22', 'لائحة تنفيذية'),
    ('rules-1-4-2012-1433-02-28', 'لائحة تنفيذية'),
    ('rules-1-42-2015-1436-07-15', 'لائحة تنفيذية'),
    ('rules-1-450-1443-01-17', 'لائحة تنفيذية'),
    ('rules-3-104-2016-1437-11-05-law-08-12331', 'لائحة تنفيذية'),
    ('rules-3-123-2017-1439-04-09-law-08-12333', 'لائحة تنفيذية'),
    ('rules-372-1403-1403-07-26-law-07-12264', 'لائحة تنفيذية'),
    ('scholarship-study-duration-extension-rules', 'لائحة تنفيذية'),
    ('service-extension-retirement-contracting-rules', 'لائحة تنفيذية'),
    ('special-circumstances-teacher-transfer-1442', 'لائحة تنفيذية'),
    ('state-owned-companies-local-content-controls', 'لائحة تنفيذية'),
    ('student-evaluation-executive-procedures-2025', 'لائحة تنفيذية'),
    ('student-trips-visits-controls-moe', 'لائحة تنفيذية'),
    ('supreme-anti-corruption-committee-basic-organization-1439h', 'لائحة تنفيذية'),
    ('surplus-energy-financial-consideration-guidance-rules', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-card-permitted-professions', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-trip-data-registration', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-adjustment-mechanism', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-deadline-extension', 'لائحة تنفيذية'),
    ('tga-heavy-freight-truck-age-extension-22-years', 'لائحة تنفيذية'),
    ('tga-heavy-freight-vehicle-ownership-establishment', 'لائحة تنفيذية'),
    ('tourism-development-fund-establishment-order-1441h', 'لائحة تنفيذية'),
    ('vehicle-ownership-light-goods-transport-commercial-establishment', 'لائحة تنفيذية'),
    ('violations-schedule-postal-law-regulation', 'لائحة تنفيذية')
  )
select l.slug, l.type, l.title, l.total_articles,
       (select count(*) from library.articles a where a.law_slug = l.slug) as articles
  from q102 join library.laws l using (slug)
 order by l.slug;

-- (b) DRIFT — the rule recomputed in the database against the list; expect 0 rows
with q102(slug, old_type) as (values
    ('alula-royal-commission-founding-order-1438', 'لائحة تنفيذية'),
    ('arabian-shield-farm-wells-drilling-license-mechanism', 'لائحة تنفيذية'),
    ('authority-decision-1399-1441-08-02', 'لائحة تنفيذية'),
    ('camel-club-founding-order-1438', 'لائحة تنفيذية'),
    ('cloud-computing-electricity-tariff-rules', 'لائحة تنفيذية'),
    ('collective-housing-health-safety-requirements', 'لائحة تنفيذية'),
    ('controls-206-1390-05-03', 'لائحة تنفيذية'),
    ('controls-35406-1439-07-18', 'لائحة تنفيذية'),
    ('controls-48000135-1448-02-08', 'لائحة تنفيذية'),
    ('controls-7-b-8213-1425-02-13', 'لائحة تنفيذية'),
    ('controls-73-1398-09-16', 'لائحة تنفيذية'),
    ('controls-8-127-2016-1438-01-16', 'لائحة تنفيذية'),
    ('controls-80-1448-01-15', 'لائحة تنفيذية'),
    ('deadline-extension-light-goods-transport-establishment-status', 'لائحة تنفيذية'),
    ('dec-developing-intermediate-technical-college', 'لائحة تنفيذية'),
    ('dentistry-services-regulatory-bylaw', 'لائحة تنفيذية'),
    ('dga-e-participation-controls', 'لائحة تنفيذية'),
    ('driver-card-permitted-professions-light-goods-transport', 'لائحة تنفيذية'),
    ('electricity-backup-power-sources-rules', 'لائحة تنفيذية'),
    ('electricity-incident-reporting-rules', 'لائحة تنفيذية'),
    ('enrichment-programs-regulatory-framework-1436', 'لائحة تنفيذية'),
    ('environmental-inspection-audit-regulation-copy', 'لائحة تنفيذية'),
    ('export-houses-licensing-regulation', 'لائحة تنفيذية'),
    ('falcon-club-basic-organization', 'لائحة تنفيذية'),
    ('framework-exams-center-education-general', 'لائحة تنفيذية'),
    ('framework-law-20-0251', 'لائحة تنفيذية'),
    ('hr-executive-regulation-frameworks', 'لائحة تنفيذية'),
    ('implementation-mechanism-light-goods-transport', 'لائحة تنفيذية'),
    ('implementation-mechanism-postal-law-regulation', 'لائحة تنفيذية'),
    ('instructions-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('instructions-18070-1425-04-08', 'لائحة تنفيذية'),
    ('instructions-2-115-2018-1440-02-13-law-08-12322', 'لائحة تنفيذية'),
    ('instructions-2-66-2018-1439-09-22-law-08-12325', 'لائحة تنفيذية'),
    ('instructions-4-8-2017-1438-04-26', 'لائحة تنفيذية'),
    ('instructions-6-130-2016-1438-01-23', 'لائحة تنفيذية'),
    ('instructions-moe-20-0250-1446', 'لائحة تنفيذية'),
    ('intensive-electricity-consumption-tariff-rules', 'لائحة تنفيذية'),
    ('law-school-safety-part-2-planning', 'نظام'),
    ('law-school-safety-part-3-support', 'نظام'),
    ('law-school-safety-part-4-operations', 'نظام'),
    ('law-school-safety-part-5-performance-evaluation', 'نظام'),
    ('law-school-safety-part-6-improvement', 'نظام'),
    ('learning-neighborhood-centers-framework-2018-2019', 'لائحة تنفيذية'),
    ('liquidators-assignment-controls', 'لائحة تنفيذية'),
    ('movables-vehicles-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('organizational-statute-757-3-49-1405-03-24', 'لائحة تنفيذية'),
    ('real-estate-sale-agents-assignment-controls', 'لائحة تنفيذية'),
    ('real-estate-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('regulation-1-11-2004-1425-08-20', 'لائحة تنفيذية'),
    ('regulation-1-193-2006-1427-06-20', 'لائحة تنفيذية'),
    ('regulation-1-219-2006-1427-12-03', 'لائحة تنفيذية'),
    ('regulation-1-28-2008-1429-08-17', 'لائحة تنفيذية'),
    ('regulation-1-61-2016-1437-08-16', 'لائحة تنفيذية'),
    ('regulation-2-83-2005-1426-05-21-law-08-12328', 'لائحة تنفيذية'),
    ('regulation-education', 'لائحة تنفيذية'),
    ('rules-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('rules-1-3-2018-1439-04-22', 'لائحة تنفيذية'),
    ('rules-1-38-2016-1437-06-22', 'لائحة تنفيذية'),
    ('rules-1-4-2012-1433-02-28', 'لائحة تنفيذية'),
    ('rules-1-42-2015-1436-07-15', 'لائحة تنفيذية'),
    ('rules-1-450-1443-01-17', 'لائحة تنفيذية'),
    ('rules-3-104-2016-1437-11-05-law-08-12331', 'لائحة تنفيذية'),
    ('rules-3-123-2017-1439-04-09-law-08-12333', 'لائحة تنفيذية'),
    ('rules-372-1403-1403-07-26-law-07-12264', 'لائحة تنفيذية'),
    ('scholarship-study-duration-extension-rules', 'لائحة تنفيذية'),
    ('service-extension-retirement-contracting-rules', 'لائحة تنفيذية'),
    ('special-circumstances-teacher-transfer-1442', 'لائحة تنفيذية'),
    ('state-owned-companies-local-content-controls', 'لائحة تنفيذية'),
    ('student-evaluation-executive-procedures-2025', 'لائحة تنفيذية'),
    ('student-trips-visits-controls-moe', 'لائحة تنفيذية'),
    ('supreme-anti-corruption-committee-basic-organization-1439h', 'لائحة تنفيذية'),
    ('surplus-energy-financial-consideration-guidance-rules', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-card-permitted-professions', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-trip-data-registration', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-adjustment-mechanism', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-deadline-extension', 'لائحة تنفيذية'),
    ('tga-heavy-freight-truck-age-extension-22-years', 'لائحة تنفيذية'),
    ('tga-heavy-freight-vehicle-ownership-establishment', 'لائحة تنفيذية'),
    ('tourism-development-fund-establishment-order-1441h', 'لائحة تنفيذية'),
    ('vehicle-ownership-light-goods-transport-commercial-establishment', 'لائحة تنفيذية'),
    ('violations-schedule-postal-law-regulation', 'لائحة تنفيذية')
  ),
  rule as (
    -- every article of the law is a page («الصفحة N»), and the law is typed
    -- as one of the two old kinds, or already carries the new label (re-run).
    select l.slug
      from library.laws l
      join library.articles a on a.law_slug = l.slug
     where l.type in ('نظام', 'لائحة تنفيذية', 'دليل إرشادي / تنظيم إداري')
     group by l.slug
    having bool_and(coalesce(a.number_text, '') ~ '^\s*#{0,6}\s*(الصفحة|صفحة|ص\.?)\s*[0-9٠-٩۰-۹]')
  )
select coalesce(r.slug, q.slug) as slug,
       case when r.slug is null then 'listed, but the rule no longer matches (reloaded? renamed?)'
            else 'the rule matches, but it is not listed' end as problem
  from rule r full join q102 q on q.slug = r.slug
 where r.slug is null or q.slug is null;

-- (c) page-numbered «تعميم» documents — NOT changed
select l.slug, l.type, l.title
  from library.laws l
 where l.type = 'تعميم'
   and exists (select 1 from library.articles a where a.law_slug = l.slug)
   and not exists (select 1 from library.articles a where a.law_slug = l.slug
                    and coalesce(a.number_text, '') !~ '^\s*#{0,6}\s*(الصفحة|صفحة|ص\.?)\s*[0-9٠-٩۰-۹]');

-- (d) documents typed نظام / لائحة تنفيذية that mix pages and articles — NOT changed
select l.slug, l.type, l.title,
       count(*) filter (where coalesce(a.number_text, '') ~ '^\s*#{0,6}\s*(الصفحة|صفحة|ص\.?)\s*[0-9٠-٩۰-۹]') as page_articles,
       count(*) as articles
  from library.laws l join library.articles a on a.law_slug = l.slug
 where l.type in ('نظام', 'لائحة تنفيذية')
 group by l.slug, l.type, l.title
having bool_or(coalesce(a.number_text, '') ~ '^\s*#{0,6}\s*(الصفحة|صفحة|ص\.?)\s*[0-9٠-٩۰-۹]')
   and not bool_and(coalesce(a.number_text, '') ~ '^\s*#{0,6}\s*(الصفحة|صفحة|ص\.?)\s*[0-9٠-٩۰-۹]')
 order by l.slug;

-- 2) UPDATE — one transaction; library.laws.type only. Aborts if the rule and
--    the list disagree, or if afterwards the 81 rows do not all carry the label.
--    Safe to run twice (the second run changes 0 rows).
begin;

do $$
declare
  drift    text;
  changed  integer;
  labelled integer;
begin
  with q102(slug, old_type) as (values
    ('alula-royal-commission-founding-order-1438', 'لائحة تنفيذية'),
    ('arabian-shield-farm-wells-drilling-license-mechanism', 'لائحة تنفيذية'),
    ('authority-decision-1399-1441-08-02', 'لائحة تنفيذية'),
    ('camel-club-founding-order-1438', 'لائحة تنفيذية'),
    ('cloud-computing-electricity-tariff-rules', 'لائحة تنفيذية'),
    ('collective-housing-health-safety-requirements', 'لائحة تنفيذية'),
    ('controls-206-1390-05-03', 'لائحة تنفيذية'),
    ('controls-35406-1439-07-18', 'لائحة تنفيذية'),
    ('controls-48000135-1448-02-08', 'لائحة تنفيذية'),
    ('controls-7-b-8213-1425-02-13', 'لائحة تنفيذية'),
    ('controls-73-1398-09-16', 'لائحة تنفيذية'),
    ('controls-8-127-2016-1438-01-16', 'لائحة تنفيذية'),
    ('controls-80-1448-01-15', 'لائحة تنفيذية'),
    ('deadline-extension-light-goods-transport-establishment-status', 'لائحة تنفيذية'),
    ('dec-developing-intermediate-technical-college', 'لائحة تنفيذية'),
    ('dentistry-services-regulatory-bylaw', 'لائحة تنفيذية'),
    ('dga-e-participation-controls', 'لائحة تنفيذية'),
    ('driver-card-permitted-professions-light-goods-transport', 'لائحة تنفيذية'),
    ('electricity-backup-power-sources-rules', 'لائحة تنفيذية'),
    ('electricity-incident-reporting-rules', 'لائحة تنفيذية'),
    ('enrichment-programs-regulatory-framework-1436', 'لائحة تنفيذية'),
    ('environmental-inspection-audit-regulation-copy', 'لائحة تنفيذية'),
    ('export-houses-licensing-regulation', 'لائحة تنفيذية'),
    ('falcon-club-basic-organization', 'لائحة تنفيذية'),
    ('framework-exams-center-education-general', 'لائحة تنفيذية'),
    ('framework-law-20-0251', 'لائحة تنفيذية'),
    ('hr-executive-regulation-frameworks', 'لائحة تنفيذية'),
    ('implementation-mechanism-light-goods-transport', 'لائحة تنفيذية'),
    ('implementation-mechanism-postal-law-regulation', 'لائحة تنفيذية'),
    ('instructions-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('instructions-18070-1425-04-08', 'لائحة تنفيذية'),
    ('instructions-2-115-2018-1440-02-13-law-08-12322', 'لائحة تنفيذية'),
    ('instructions-2-66-2018-1439-09-22-law-08-12325', 'لائحة تنفيذية'),
    ('instructions-4-8-2017-1438-04-26', 'لائحة تنفيذية'),
    ('instructions-6-130-2016-1438-01-23', 'لائحة تنفيذية'),
    ('instructions-moe-20-0250-1446', 'لائحة تنفيذية'),
    ('intensive-electricity-consumption-tariff-rules', 'لائحة تنفيذية'),
    ('law-school-safety-part-2-planning', 'نظام'),
    ('law-school-safety-part-3-support', 'نظام'),
    ('law-school-safety-part-4-operations', 'نظام'),
    ('law-school-safety-part-5-performance-evaluation', 'نظام'),
    ('law-school-safety-part-6-improvement', 'نظام'),
    ('learning-neighborhood-centers-framework-2018-2019', 'لائحة تنفيذية'),
    ('liquidators-assignment-controls', 'لائحة تنفيذية'),
    ('movables-vehicles-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('organizational-statute-757-3-49-1405-03-24', 'لائحة تنفيذية'),
    ('real-estate-sale-agents-assignment-controls', 'لائحة تنفيذية'),
    ('real-estate-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('regulation-1-11-2004-1425-08-20', 'لائحة تنفيذية'),
    ('regulation-1-193-2006-1427-06-20', 'لائحة تنفيذية'),
    ('regulation-1-219-2006-1427-12-03', 'لائحة تنفيذية'),
    ('regulation-1-28-2008-1429-08-17', 'لائحة تنفيذية'),
    ('regulation-1-61-2016-1437-08-16', 'لائحة تنفيذية'),
    ('regulation-2-83-2005-1426-05-21-law-08-12328', 'لائحة تنفيذية'),
    ('regulation-education', 'لائحة تنفيذية'),
    ('rules-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('rules-1-3-2018-1439-04-22', 'لائحة تنفيذية'),
    ('rules-1-38-2016-1437-06-22', 'لائحة تنفيذية'),
    ('rules-1-4-2012-1433-02-28', 'لائحة تنفيذية'),
    ('rules-1-42-2015-1436-07-15', 'لائحة تنفيذية'),
    ('rules-1-450-1443-01-17', 'لائحة تنفيذية'),
    ('rules-3-104-2016-1437-11-05-law-08-12331', 'لائحة تنفيذية'),
    ('rules-3-123-2017-1439-04-09-law-08-12333', 'لائحة تنفيذية'),
    ('rules-372-1403-1403-07-26-law-07-12264', 'لائحة تنفيذية'),
    ('scholarship-study-duration-extension-rules', 'لائحة تنفيذية'),
    ('service-extension-retirement-contracting-rules', 'لائحة تنفيذية'),
    ('special-circumstances-teacher-transfer-1442', 'لائحة تنفيذية'),
    ('state-owned-companies-local-content-controls', 'لائحة تنفيذية'),
    ('student-evaluation-executive-procedures-2025', 'لائحة تنفيذية'),
    ('student-trips-visits-controls-moe', 'لائحة تنفيذية'),
    ('supreme-anti-corruption-committee-basic-organization-1439h', 'لائحة تنفيذية'),
    ('surplus-energy-financial-consideration-guidance-rules', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-card-permitted-professions', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-trip-data-registration', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-adjustment-mechanism', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-deadline-extension', 'لائحة تنفيذية'),
    ('tga-heavy-freight-truck-age-extension-22-years', 'لائحة تنفيذية'),
    ('tga-heavy-freight-vehicle-ownership-establishment', 'لائحة تنفيذية'),
    ('tourism-development-fund-establishment-order-1441h', 'لائحة تنفيذية'),
    ('vehicle-ownership-light-goods-transport-commercial-establishment', 'لائحة تنفيذية'),
    ('violations-schedule-postal-law-regulation', 'لائحة تنفيذية')
  ),
    rule as (
    -- every article of the law is a page («الصفحة N»), and the law is typed
    -- as one of the two old kinds, or already carries the new label (re-run).
    select l.slug
      from library.laws l
      join library.articles a on a.law_slug = l.slug
     where l.type in ('نظام', 'لائحة تنفيذية', 'دليل إرشادي / تنظيم إداري')
     group by l.slug
    having bool_and(coalesce(a.number_text, '') ~ '^\s*#{0,6}\s*(الصفحة|صفحة|ص\.?)\s*[0-9٠-٩۰-۹]')
  )
  select string_agg(coalesce(r.slug, q.slug), ', ') into drift
    from rule r full join q102 q on q.slug = r.slug
   where r.slug is null or q.slug is null;
  if drift is not null then
    raise exception 'q102: the list and the database disagree on: % — nothing changed (run block 1 (b))', drift;
  end if;

  with q102(slug, old_type) as (values
    ('alula-royal-commission-founding-order-1438', 'لائحة تنفيذية'),
    ('arabian-shield-farm-wells-drilling-license-mechanism', 'لائحة تنفيذية'),
    ('authority-decision-1399-1441-08-02', 'لائحة تنفيذية'),
    ('camel-club-founding-order-1438', 'لائحة تنفيذية'),
    ('cloud-computing-electricity-tariff-rules', 'لائحة تنفيذية'),
    ('collective-housing-health-safety-requirements', 'لائحة تنفيذية'),
    ('controls-206-1390-05-03', 'لائحة تنفيذية'),
    ('controls-35406-1439-07-18', 'لائحة تنفيذية'),
    ('controls-48000135-1448-02-08', 'لائحة تنفيذية'),
    ('controls-7-b-8213-1425-02-13', 'لائحة تنفيذية'),
    ('controls-73-1398-09-16', 'لائحة تنفيذية'),
    ('controls-8-127-2016-1438-01-16', 'لائحة تنفيذية'),
    ('controls-80-1448-01-15', 'لائحة تنفيذية'),
    ('deadline-extension-light-goods-transport-establishment-status', 'لائحة تنفيذية'),
    ('dec-developing-intermediate-technical-college', 'لائحة تنفيذية'),
    ('dentistry-services-regulatory-bylaw', 'لائحة تنفيذية'),
    ('dga-e-participation-controls', 'لائحة تنفيذية'),
    ('driver-card-permitted-professions-light-goods-transport', 'لائحة تنفيذية'),
    ('electricity-backup-power-sources-rules', 'لائحة تنفيذية'),
    ('electricity-incident-reporting-rules', 'لائحة تنفيذية'),
    ('enrichment-programs-regulatory-framework-1436', 'لائحة تنفيذية'),
    ('environmental-inspection-audit-regulation-copy', 'لائحة تنفيذية'),
    ('export-houses-licensing-regulation', 'لائحة تنفيذية'),
    ('falcon-club-basic-organization', 'لائحة تنفيذية'),
    ('framework-exams-center-education-general', 'لائحة تنفيذية'),
    ('framework-law-20-0251', 'لائحة تنفيذية'),
    ('hr-executive-regulation-frameworks', 'لائحة تنفيذية'),
    ('implementation-mechanism-light-goods-transport', 'لائحة تنفيذية'),
    ('implementation-mechanism-postal-law-regulation', 'لائحة تنفيذية'),
    ('instructions-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('instructions-18070-1425-04-08', 'لائحة تنفيذية'),
    ('instructions-2-115-2018-1440-02-13-law-08-12322', 'لائحة تنفيذية'),
    ('instructions-2-66-2018-1439-09-22-law-08-12325', 'لائحة تنفيذية'),
    ('instructions-4-8-2017-1438-04-26', 'لائحة تنفيذية'),
    ('instructions-6-130-2016-1438-01-23', 'لائحة تنفيذية'),
    ('instructions-moe-20-0250-1446', 'لائحة تنفيذية'),
    ('intensive-electricity-consumption-tariff-rules', 'لائحة تنفيذية'),
    ('law-school-safety-part-2-planning', 'نظام'),
    ('law-school-safety-part-3-support', 'نظام'),
    ('law-school-safety-part-4-operations', 'نظام'),
    ('law-school-safety-part-5-performance-evaluation', 'نظام'),
    ('law-school-safety-part-6-improvement', 'نظام'),
    ('learning-neighborhood-centers-framework-2018-2019', 'لائحة تنفيذية'),
    ('liquidators-assignment-controls', 'لائحة تنفيذية'),
    ('movables-vehicles-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('organizational-statute-757-3-49-1405-03-24', 'لائحة تنفيذية'),
    ('real-estate-sale-agents-assignment-controls', 'لائحة تنفيذية'),
    ('real-estate-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('regulation-1-11-2004-1425-08-20', 'لائحة تنفيذية'),
    ('regulation-1-193-2006-1427-06-20', 'لائحة تنفيذية'),
    ('regulation-1-219-2006-1427-12-03', 'لائحة تنفيذية'),
    ('regulation-1-28-2008-1429-08-17', 'لائحة تنفيذية'),
    ('regulation-1-61-2016-1437-08-16', 'لائحة تنفيذية'),
    ('regulation-2-83-2005-1426-05-21-law-08-12328', 'لائحة تنفيذية'),
    ('regulation-education', 'لائحة تنفيذية'),
    ('rules-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('rules-1-3-2018-1439-04-22', 'لائحة تنفيذية'),
    ('rules-1-38-2016-1437-06-22', 'لائحة تنفيذية'),
    ('rules-1-4-2012-1433-02-28', 'لائحة تنفيذية'),
    ('rules-1-42-2015-1436-07-15', 'لائحة تنفيذية'),
    ('rules-1-450-1443-01-17', 'لائحة تنفيذية'),
    ('rules-3-104-2016-1437-11-05-law-08-12331', 'لائحة تنفيذية'),
    ('rules-3-123-2017-1439-04-09-law-08-12333', 'لائحة تنفيذية'),
    ('rules-372-1403-1403-07-26-law-07-12264', 'لائحة تنفيذية'),
    ('scholarship-study-duration-extension-rules', 'لائحة تنفيذية'),
    ('service-extension-retirement-contracting-rules', 'لائحة تنفيذية'),
    ('special-circumstances-teacher-transfer-1442', 'لائحة تنفيذية'),
    ('state-owned-companies-local-content-controls', 'لائحة تنفيذية'),
    ('student-evaluation-executive-procedures-2025', 'لائحة تنفيذية'),
    ('student-trips-visits-controls-moe', 'لائحة تنفيذية'),
    ('supreme-anti-corruption-committee-basic-organization-1439h', 'لائحة تنفيذية'),
    ('surplus-energy-financial-consideration-guidance-rules', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-card-permitted-professions', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-trip-data-registration', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-adjustment-mechanism', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-deadline-extension', 'لائحة تنفيذية'),
    ('tga-heavy-freight-truck-age-extension-22-years', 'لائحة تنفيذية'),
    ('tga-heavy-freight-vehicle-ownership-establishment', 'لائحة تنفيذية'),
    ('tourism-development-fund-establishment-order-1441h', 'لائحة تنفيذية'),
    ('vehicle-ownership-light-goods-transport-commercial-establishment', 'لائحة تنفيذية'),
    ('violations-schedule-postal-law-regulation', 'لائحة تنفيذية')
  )
  update library.laws l
     set type = 'دليل إرشادي / تنظيم إداري'
    from q102
   where l.slug = q102.slug
     and l.type = q102.old_type;
  get diagnostics changed = row_count;

  with q102(slug, old_type) as (values
    ('alula-royal-commission-founding-order-1438', 'لائحة تنفيذية'),
    ('arabian-shield-farm-wells-drilling-license-mechanism', 'لائحة تنفيذية'),
    ('authority-decision-1399-1441-08-02', 'لائحة تنفيذية'),
    ('camel-club-founding-order-1438', 'لائحة تنفيذية'),
    ('cloud-computing-electricity-tariff-rules', 'لائحة تنفيذية'),
    ('collective-housing-health-safety-requirements', 'لائحة تنفيذية'),
    ('controls-206-1390-05-03', 'لائحة تنفيذية'),
    ('controls-35406-1439-07-18', 'لائحة تنفيذية'),
    ('controls-48000135-1448-02-08', 'لائحة تنفيذية'),
    ('controls-7-b-8213-1425-02-13', 'لائحة تنفيذية'),
    ('controls-73-1398-09-16', 'لائحة تنفيذية'),
    ('controls-8-127-2016-1438-01-16', 'لائحة تنفيذية'),
    ('controls-80-1448-01-15', 'لائحة تنفيذية'),
    ('deadline-extension-light-goods-transport-establishment-status', 'لائحة تنفيذية'),
    ('dec-developing-intermediate-technical-college', 'لائحة تنفيذية'),
    ('dentistry-services-regulatory-bylaw', 'لائحة تنفيذية'),
    ('dga-e-participation-controls', 'لائحة تنفيذية'),
    ('driver-card-permitted-professions-light-goods-transport', 'لائحة تنفيذية'),
    ('electricity-backup-power-sources-rules', 'لائحة تنفيذية'),
    ('electricity-incident-reporting-rules', 'لائحة تنفيذية'),
    ('enrichment-programs-regulatory-framework-1436', 'لائحة تنفيذية'),
    ('environmental-inspection-audit-regulation-copy', 'لائحة تنفيذية'),
    ('export-houses-licensing-regulation', 'لائحة تنفيذية'),
    ('falcon-club-basic-organization', 'لائحة تنفيذية'),
    ('framework-exams-center-education-general', 'لائحة تنفيذية'),
    ('framework-law-20-0251', 'لائحة تنفيذية'),
    ('hr-executive-regulation-frameworks', 'لائحة تنفيذية'),
    ('implementation-mechanism-light-goods-transport', 'لائحة تنفيذية'),
    ('implementation-mechanism-postal-law-regulation', 'لائحة تنفيذية'),
    ('instructions-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('instructions-18070-1425-04-08', 'لائحة تنفيذية'),
    ('instructions-2-115-2018-1440-02-13-law-08-12322', 'لائحة تنفيذية'),
    ('instructions-2-66-2018-1439-09-22-law-08-12325', 'لائحة تنفيذية'),
    ('instructions-4-8-2017-1438-04-26', 'لائحة تنفيذية'),
    ('instructions-6-130-2016-1438-01-23', 'لائحة تنفيذية'),
    ('instructions-moe-20-0250-1446', 'لائحة تنفيذية'),
    ('intensive-electricity-consumption-tariff-rules', 'لائحة تنفيذية'),
    ('law-school-safety-part-2-planning', 'نظام'),
    ('law-school-safety-part-3-support', 'نظام'),
    ('law-school-safety-part-4-operations', 'نظام'),
    ('law-school-safety-part-5-performance-evaluation', 'نظام'),
    ('law-school-safety-part-6-improvement', 'نظام'),
    ('learning-neighborhood-centers-framework-2018-2019', 'لائحة تنفيذية'),
    ('liquidators-assignment-controls', 'لائحة تنفيذية'),
    ('movables-vehicles-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('organizational-statute-757-3-49-1405-03-24', 'لائحة تنفيذية'),
    ('real-estate-sale-agents-assignment-controls', 'لائحة تنفيذية'),
    ('real-estate-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('regulation-1-11-2004-1425-08-20', 'لائحة تنفيذية'),
    ('regulation-1-193-2006-1427-06-20', 'لائحة تنفيذية'),
    ('regulation-1-219-2006-1427-12-03', 'لائحة تنفيذية'),
    ('regulation-1-28-2008-1429-08-17', 'لائحة تنفيذية'),
    ('regulation-1-61-2016-1437-08-16', 'لائحة تنفيذية'),
    ('regulation-2-83-2005-1426-05-21-law-08-12328', 'لائحة تنفيذية'),
    ('regulation-education', 'لائحة تنفيذية'),
    ('rules-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('rules-1-3-2018-1439-04-22', 'لائحة تنفيذية'),
    ('rules-1-38-2016-1437-06-22', 'لائحة تنفيذية'),
    ('rules-1-4-2012-1433-02-28', 'لائحة تنفيذية'),
    ('rules-1-42-2015-1436-07-15', 'لائحة تنفيذية'),
    ('rules-1-450-1443-01-17', 'لائحة تنفيذية'),
    ('rules-3-104-2016-1437-11-05-law-08-12331', 'لائحة تنفيذية'),
    ('rules-3-123-2017-1439-04-09-law-08-12333', 'لائحة تنفيذية'),
    ('rules-372-1403-1403-07-26-law-07-12264', 'لائحة تنفيذية'),
    ('scholarship-study-duration-extension-rules', 'لائحة تنفيذية'),
    ('service-extension-retirement-contracting-rules', 'لائحة تنفيذية'),
    ('special-circumstances-teacher-transfer-1442', 'لائحة تنفيذية'),
    ('state-owned-companies-local-content-controls', 'لائحة تنفيذية'),
    ('student-evaluation-executive-procedures-2025', 'لائحة تنفيذية'),
    ('student-trips-visits-controls-moe', 'لائحة تنفيذية'),
    ('supreme-anti-corruption-committee-basic-organization-1439h', 'لائحة تنفيذية'),
    ('surplus-energy-financial-consideration-guidance-rules', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-card-permitted-professions', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-trip-data-registration', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-adjustment-mechanism', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-deadline-extension', 'لائحة تنفيذية'),
    ('tga-heavy-freight-truck-age-extension-22-years', 'لائحة تنفيذية'),
    ('tga-heavy-freight-vehicle-ownership-establishment', 'لائحة تنفيذية'),
    ('tourism-development-fund-establishment-order-1441h', 'لائحة تنفيذية'),
    ('vehicle-ownership-light-goods-transport-commercial-establishment', 'لائحة تنفيذية'),
    ('violations-schedule-postal-law-regulation', 'لائحة تنفيذية')
  )
  select count(*) into labelled
    from library.laws l join q102 using (slug)
   where l.type = 'دليل إرشادي / تنظيم إداري';
  if labelled <> 81 then
    raise exception 'q102: expected 81 documents labelled, found % — rolling back', labelled;
  end if;
  raise notice 'q102: % documents relabelled now (% already had the label); page anchors untouched', changed, 81 - changed;
end $$;

commit;

-- 3) VERIFY — expect one row: «دليل إرشادي / تنظيم إداري» | 81
with q102(slug, old_type) as (values
    ('alula-royal-commission-founding-order-1438', 'لائحة تنفيذية'),
    ('arabian-shield-farm-wells-drilling-license-mechanism', 'لائحة تنفيذية'),
    ('authority-decision-1399-1441-08-02', 'لائحة تنفيذية'),
    ('camel-club-founding-order-1438', 'لائحة تنفيذية'),
    ('cloud-computing-electricity-tariff-rules', 'لائحة تنفيذية'),
    ('collective-housing-health-safety-requirements', 'لائحة تنفيذية'),
    ('controls-206-1390-05-03', 'لائحة تنفيذية'),
    ('controls-35406-1439-07-18', 'لائحة تنفيذية'),
    ('controls-48000135-1448-02-08', 'لائحة تنفيذية'),
    ('controls-7-b-8213-1425-02-13', 'لائحة تنفيذية'),
    ('controls-73-1398-09-16', 'لائحة تنفيذية'),
    ('controls-8-127-2016-1438-01-16', 'لائحة تنفيذية'),
    ('controls-80-1448-01-15', 'لائحة تنفيذية'),
    ('deadline-extension-light-goods-transport-establishment-status', 'لائحة تنفيذية'),
    ('dec-developing-intermediate-technical-college', 'لائحة تنفيذية'),
    ('dentistry-services-regulatory-bylaw', 'لائحة تنفيذية'),
    ('dga-e-participation-controls', 'لائحة تنفيذية'),
    ('driver-card-permitted-professions-light-goods-transport', 'لائحة تنفيذية'),
    ('electricity-backup-power-sources-rules', 'لائحة تنفيذية'),
    ('electricity-incident-reporting-rules', 'لائحة تنفيذية'),
    ('enrichment-programs-regulatory-framework-1436', 'لائحة تنفيذية'),
    ('environmental-inspection-audit-regulation-copy', 'لائحة تنفيذية'),
    ('export-houses-licensing-regulation', 'لائحة تنفيذية'),
    ('falcon-club-basic-organization', 'لائحة تنفيذية'),
    ('framework-exams-center-education-general', 'لائحة تنفيذية'),
    ('framework-law-20-0251', 'لائحة تنفيذية'),
    ('hr-executive-regulation-frameworks', 'لائحة تنفيذية'),
    ('implementation-mechanism-light-goods-transport', 'لائحة تنفيذية'),
    ('implementation-mechanism-postal-law-regulation', 'لائحة تنفيذية'),
    ('instructions-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('instructions-18070-1425-04-08', 'لائحة تنفيذية'),
    ('instructions-2-115-2018-1440-02-13-law-08-12322', 'لائحة تنفيذية'),
    ('instructions-2-66-2018-1439-09-22-law-08-12325', 'لائحة تنفيذية'),
    ('instructions-4-8-2017-1438-04-26', 'لائحة تنفيذية'),
    ('instructions-6-130-2016-1438-01-23', 'لائحة تنفيذية'),
    ('instructions-moe-20-0250-1446', 'لائحة تنفيذية'),
    ('intensive-electricity-consumption-tariff-rules', 'لائحة تنفيذية'),
    ('law-school-safety-part-2-planning', 'نظام'),
    ('law-school-safety-part-3-support', 'نظام'),
    ('law-school-safety-part-4-operations', 'نظام'),
    ('law-school-safety-part-5-performance-evaluation', 'نظام'),
    ('law-school-safety-part-6-improvement', 'نظام'),
    ('learning-neighborhood-centers-framework-2018-2019', 'لائحة تنفيذية'),
    ('liquidators-assignment-controls', 'لائحة تنفيذية'),
    ('movables-vehicles-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('organizational-statute-757-3-49-1405-03-24', 'لائحة تنفيذية'),
    ('real-estate-sale-agents-assignment-controls', 'لائحة تنفيذية'),
    ('real-estate-valuation-assignment-controls', 'لائحة تنفيذية'),
    ('regulation-1-11-2004-1425-08-20', 'لائحة تنفيذية'),
    ('regulation-1-193-2006-1427-06-20', 'لائحة تنفيذية'),
    ('regulation-1-219-2006-1427-12-03', 'لائحة تنفيذية'),
    ('regulation-1-28-2008-1429-08-17', 'لائحة تنفيذية'),
    ('regulation-1-61-2016-1437-08-16', 'لائحة تنفيذية'),
    ('regulation-2-83-2005-1426-05-21-law-08-12328', 'لائحة تنفيذية'),
    ('regulation-education', 'لائحة تنفيذية'),
    ('rules-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
    ('rules-1-3-2018-1439-04-22', 'لائحة تنفيذية'),
    ('rules-1-38-2016-1437-06-22', 'لائحة تنفيذية'),
    ('rules-1-4-2012-1433-02-28', 'لائحة تنفيذية'),
    ('rules-1-42-2015-1436-07-15', 'لائحة تنفيذية'),
    ('rules-1-450-1443-01-17', 'لائحة تنفيذية'),
    ('rules-3-104-2016-1437-11-05-law-08-12331', 'لائحة تنفيذية'),
    ('rules-3-123-2017-1439-04-09-law-08-12333', 'لائحة تنفيذية'),
    ('rules-372-1403-1403-07-26-law-07-12264', 'لائحة تنفيذية'),
    ('scholarship-study-duration-extension-rules', 'لائحة تنفيذية'),
    ('service-extension-retirement-contracting-rules', 'لائحة تنفيذية'),
    ('special-circumstances-teacher-transfer-1442', 'لائحة تنفيذية'),
    ('state-owned-companies-local-content-controls', 'لائحة تنفيذية'),
    ('student-evaluation-executive-procedures-2025', 'لائحة تنفيذية'),
    ('student-trips-visits-controls-moe', 'لائحة تنفيذية'),
    ('supreme-anti-corruption-committee-basic-organization-1439h', 'لائحة تنفيذية'),
    ('surplus-energy-financial-consideration-guidance-rules', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-card-permitted-professions', 'لائحة تنفيذية'),
    ('tga-heavy-freight-driver-trip-data-registration', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-adjustment-mechanism', 'لائحة تنفيذية'),
    ('tga-heavy-freight-establishment-status-deadline-extension', 'لائحة تنفيذية'),
    ('tga-heavy-freight-truck-age-extension-22-years', 'لائحة تنفيذية'),
    ('tga-heavy-freight-vehicle-ownership-establishment', 'لائحة تنفيذية'),
    ('tourism-development-fund-establishment-order-1441h', 'لائحة تنفيذية'),
    ('vehicle-ownership-light-goods-transport-commercial-establishment', 'لائحة تنفيذية'),
    ('violations-schedule-postal-law-regulation', 'لائحة تنفيذية')
  )
select l.type, count(*)
  from library.laws l join q102 using (slug)
 group by l.type;

-- 4) ROLLBACK (only if needed) — each document gets back the type it had.
-- with q102(slug, old_type) as (values
--     ('alula-royal-commission-founding-order-1438', 'لائحة تنفيذية'),
--     ('arabian-shield-farm-wells-drilling-license-mechanism', 'لائحة تنفيذية'),
--     ('authority-decision-1399-1441-08-02', 'لائحة تنفيذية'),
--     ('camel-club-founding-order-1438', 'لائحة تنفيذية'),
--     ('cloud-computing-electricity-tariff-rules', 'لائحة تنفيذية'),
--     ('collective-housing-health-safety-requirements', 'لائحة تنفيذية'),
--     ('controls-206-1390-05-03', 'لائحة تنفيذية'),
--     ('controls-35406-1439-07-18', 'لائحة تنفيذية'),
--     ('controls-48000135-1448-02-08', 'لائحة تنفيذية'),
--     ('controls-7-b-8213-1425-02-13', 'لائحة تنفيذية'),
--     ('controls-73-1398-09-16', 'لائحة تنفيذية'),
--     ('controls-8-127-2016-1438-01-16', 'لائحة تنفيذية'),
--     ('controls-80-1448-01-15', 'لائحة تنفيذية'),
--     ('deadline-extension-light-goods-transport-establishment-status', 'لائحة تنفيذية'),
--     ('dec-developing-intermediate-technical-college', 'لائحة تنفيذية'),
--     ('dentistry-services-regulatory-bylaw', 'لائحة تنفيذية'),
--     ('dga-e-participation-controls', 'لائحة تنفيذية'),
--     ('driver-card-permitted-professions-light-goods-transport', 'لائحة تنفيذية'),
--     ('electricity-backup-power-sources-rules', 'لائحة تنفيذية'),
--     ('electricity-incident-reporting-rules', 'لائحة تنفيذية'),
--     ('enrichment-programs-regulatory-framework-1436', 'لائحة تنفيذية'),
--     ('environmental-inspection-audit-regulation-copy', 'لائحة تنفيذية'),
--     ('export-houses-licensing-regulation', 'لائحة تنفيذية'),
--     ('falcon-club-basic-organization', 'لائحة تنفيذية'),
--     ('framework-exams-center-education-general', 'لائحة تنفيذية'),
--     ('framework-law-20-0251', 'لائحة تنفيذية'),
--     ('hr-executive-regulation-frameworks', 'لائحة تنفيذية'),
--     ('implementation-mechanism-light-goods-transport', 'لائحة تنفيذية'),
--     ('implementation-mechanism-postal-law-regulation', 'لائحة تنفيذية'),
--     ('instructions-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
--     ('instructions-18070-1425-04-08', 'لائحة تنفيذية'),
--     ('instructions-2-115-2018-1440-02-13-law-08-12322', 'لائحة تنفيذية'),
--     ('instructions-2-66-2018-1439-09-22-law-08-12325', 'لائحة تنفيذية'),
--     ('instructions-4-8-2017-1438-04-26', 'لائحة تنفيذية'),
--     ('instructions-6-130-2016-1438-01-23', 'لائحة تنفيذية'),
--     ('instructions-moe-20-0250-1446', 'لائحة تنفيذية'),
--     ('intensive-electricity-consumption-tariff-rules', 'لائحة تنفيذية'),
--     ('law-school-safety-part-2-planning', 'نظام'),
--     ('law-school-safety-part-3-support', 'نظام'),
--     ('law-school-safety-part-4-operations', 'نظام'),
--     ('law-school-safety-part-5-performance-evaluation', 'نظام'),
--     ('law-school-safety-part-6-improvement', 'نظام'),
--     ('learning-neighborhood-centers-framework-2018-2019', 'لائحة تنفيذية'),
--     ('liquidators-assignment-controls', 'لائحة تنفيذية'),
--     ('movables-vehicles-valuation-assignment-controls', 'لائحة تنفيذية'),
--     ('organizational-statute-757-3-49-1405-03-24', 'لائحة تنفيذية'),
--     ('real-estate-sale-agents-assignment-controls', 'لائحة تنفيذية'),
--     ('real-estate-valuation-assignment-controls', 'لائحة تنفيذية'),
--     ('regulation-1-11-2004-1425-08-20', 'لائحة تنفيذية'),
--     ('regulation-1-193-2006-1427-06-20', 'لائحة تنفيذية'),
--     ('regulation-1-219-2006-1427-12-03', 'لائحة تنفيذية'),
--     ('regulation-1-28-2008-1429-08-17', 'لائحة تنفيذية'),
--     ('regulation-1-61-2016-1437-08-16', 'لائحة تنفيذية'),
--     ('regulation-2-83-2005-1426-05-21-law-08-12328', 'لائحة تنفيذية'),
--     ('regulation-education', 'لائحة تنفيذية'),
--     ('rules-1-104-2019-1441-02-01', 'لائحة تنفيذية'),
--     ('rules-1-3-2018-1439-04-22', 'لائحة تنفيذية'),
--     ('rules-1-38-2016-1437-06-22', 'لائحة تنفيذية'),
--     ('rules-1-4-2012-1433-02-28', 'لائحة تنفيذية'),
--     ('rules-1-42-2015-1436-07-15', 'لائحة تنفيذية'),
--     ('rules-1-450-1443-01-17', 'لائحة تنفيذية'),
--     ('rules-3-104-2016-1437-11-05-law-08-12331', 'لائحة تنفيذية'),
--     ('rules-3-123-2017-1439-04-09-law-08-12333', 'لائحة تنفيذية'),
--     ('rules-372-1403-1403-07-26-law-07-12264', 'لائحة تنفيذية'),
--     ('scholarship-study-duration-extension-rules', 'لائحة تنفيذية'),
--     ('service-extension-retirement-contracting-rules', 'لائحة تنفيذية'),
--     ('special-circumstances-teacher-transfer-1442', 'لائحة تنفيذية'),
--     ('state-owned-companies-local-content-controls', 'لائحة تنفيذية'),
--     ('student-evaluation-executive-procedures-2025', 'لائحة تنفيذية'),
--     ('student-trips-visits-controls-moe', 'لائحة تنفيذية'),
--     ('supreme-anti-corruption-committee-basic-organization-1439h', 'لائحة تنفيذية'),
--     ('surplus-energy-financial-consideration-guidance-rules', 'لائحة تنفيذية'),
--     ('tga-heavy-freight-driver-card-permitted-professions', 'لائحة تنفيذية'),
--     ('tga-heavy-freight-driver-trip-data-registration', 'لائحة تنفيذية'),
--     ('tga-heavy-freight-establishment-status-adjustment-mechanism', 'لائحة تنفيذية'),
--     ('tga-heavy-freight-establishment-status-deadline-extension', 'لائحة تنفيذية'),
--     ('tga-heavy-freight-truck-age-extension-22-years', 'لائحة تنفيذية'),
--     ('tga-heavy-freight-vehicle-ownership-establishment', 'لائحة تنفيذية'),
--     ('tourism-development-fund-establishment-order-1441h', 'لائحة تنفيذية'),
--     ('vehicle-ownership-light-goods-transport-commercial-establishment', 'لائحة تنفيذية'),
--     ('violations-schedule-postal-law-regulation', 'لائحة تنفيذية')
--   )
-- update library.laws l set type = q102.old_type
--   from q102 where l.slug = q102.slug and l.type = 'دليل إرشادي / تنظيم إداري';
