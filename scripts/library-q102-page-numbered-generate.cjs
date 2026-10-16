#!/usr/bin/env node
// Owner decision ١٠٢ — builds, from the guest scan of
// scripts/library-q102-page-numbered-scan.mjs, three files that must agree:
//   supabase/one-time/2026-10-17_q102_page_numbered_documents.sql   (the user runs it)
//   docs/plans/2026-10-17-q102-page-numbered-documents.md           (the owner's list)
//   supabase/tests/rls/prelude_q102_fixture.sql                     (Docker fixture)
// Deterministic: sorted by slug. Writes local files only; reads nothing live.
//
//   node scripts/library-q102-page-numbered-generate.cjs <scan.jsonl> [--exclude <slugs.txt>]
//
// --exclude: one slug per line, documents the owner wants kept as they are.
// They leave the list AND the rule the SQL re-checks, so block 2's guard
// still compares like with like.
const fs = require('fs');
const args = process.argv.slice(2);
const scanFile = args[0];
const exIdx = args.indexOf('--exclude');
const excluded = new Set(exIdx > 0
  ? fs.readFileSync(args[exIdx + 1], 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  : []);
const sqlOut = 'supabase/one-time/2026-10-17_q102_page_numbered_documents.sql';
const mdOut = 'docs/plans/2026-10-17-q102-page-numbered-documents.md';
const fixtureOut = 'supabase/tests/rls/prelude_q102_fixture.sql';
if (!scanFile) {
  console.error('usage: node scripts/library-q102-page-numbered-generate.cjs <scan.jsonl> [--exclude <slugs.txt>]');
  process.exit(2);
}
const rows = fs.readFileSync(scanFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const bad = rows.filter((r) => r.http || r.error);
if (bad.length) throw new Error(`${bad.length} laws could not be read: ${bad.slice(0, 5).map((r) => r.slug).join(', ')}`);
const OLD = ['نظام', 'لائحة تنفيذية'];
const LABEL = 'دليل إرشادي / تنظيم إداري';
const pageNumbered = rows.filter((r) => r.n > 0 && r.page === r.n && OLD.includes(r.type)).sort((a, b) => a.slug.localeCompare(b.slug));
const unknownEx = [...excluded].filter((s) => !pageNumbered.some((r) => r.slug === s));
if (unknownEx.length) throw new Error(`--exclude names slugs that are not page-numbered: ${unknownEx.join(', ')}`);
const full = pageNumbered.filter((r) => !excluded.has(r.slug));
const kept = pageNumbered.filter((r) => excluded.has(r.slug));
const circulars = rows.filter((r) => r.n > 0 && r.page === r.n && r.type === 'تعميم').sort((a, b) => a.slug.localeCompare(b.slug));
const mixed = rows.filter((r) => r.page > 0 && r.page < r.n).sort((a, b) => a.slug.localeCompare(b.slug));
const scanned = rows.filter((r) => OLD.includes(r.type)).length;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const cmt = (s) => String(s).replace(/\r?\n/g, ' ');
const byType = (list) => OLD.map((t) => `${t}: ${list.filter((r) => r.type === t).length}`).join(' · ');
const values = full.map((r) => `    (${q(r.slug)}, ${q(r.type)})`).join(',\n');
const listCte = `q102(slug, old_type) as (values\n${values}\n  )`;
// number_text as the reader cleans it (heading marks, spaces) must open with a page noun and a digit.
const BS = String.fromCharCode(92);
const RE = `'^${BS}s*#{0,6}${BS}s*(الصفحة|صفحة|ص${BS}.?)${BS}s*[0-9٠-٩۰-۹]'`;
const ruleCte = `rule as (
    -- every article of the law is a page («الصفحة N»), and the law is typed
    -- as one of the two old kinds, or already carries the new label (re-run).
    select l.slug
      from library.laws l
      join library.articles a on a.law_slug = l.slug
     where l.type in (${OLD.map(q).join(', ')}, ${q(LABEL)})${kept.length ? `
       -- kept as they are at the owner's request (generator --exclude)
       and l.slug not in (${kept.map((r) => q(r.slug)).join(', ')})` : ''}
     group by l.slug
    having bool_and(coalesce(a.number_text, '') ~ ${RE})
  )`;
const N = full.length;
const sql = `-- ════════════════════════════════════════════════════════════════════════════
-- One-time data fix (NOT a migration) — owner decision ١٠٢ (answers of 2026-10-06):
-- «تصنيفها كـ "${LABEL}" مع الحفاظ على ترقيم الصفحات الفريد».
-- Run by the user in the self-hosted SQL Editor (auth.nezamy.sa, as postgres).
-- Run block 1 alone first and read it; then block 2; then block 3.
--
-- WHAT: ${N} documents in library.laws are typed «نظام» or «لائحة تنفيذية» but
--   are numbered by PAGE, not by article: every one of their articles is
--   «الصفحة N» (${byType(full)}). A copied citation then reads
--   «الصفحة (3) من نظام (…)». The owner's decision gives them the label
--   «${LABEL}» (verbatim, one value).
--   The July count of 112 (دليل_المالك_إصلاح_المعرفات.md) was taken on the old
--   corpus; this list is the same rule on the library loaded 2026-10-15/16.
-- HOW THE LIST WAS MADE: a guest-only scan of live on 2026-10-17 — the public
--   law API (/api/library/laws/<slug>) for every one of the ${scanned} laws typed
--   «نظام» or «لائحة تنفيذية», counting articles whose number is a page
--   (the reader's own rule, isPageLocator in src/app/laws/[slug]/_citation.ts).
--   Block 1 (b) recomputes the same rule inside the database, and block 2
--   refuses to run if the two disagree.
-- WHAT CHANGES: library.laws.type on these ${N} rows, nothing else. No article,
--   article id, number_text («الصفحة N»), chapter, anchor or URL changes: the
--   page anchors stay exactly as they are. No user table is touched. The
--   search filter, the /laws type chips and the citation read the label as
--   data (the citation knows it since this branch's _citation.ts change).
-- WHAT IS NOT CHANGED (listed in block 1 for the record):
--   * «تعميم» documents numbered by page (${circulars.length}): a circular is a letter,
--     pages are its natural locator, and the decision names نظام/لائحة only;
--   * documents typed نظام / لائحة تنفيذية mixing pages and articles
--     (${mixed.filter((r) => OLD.includes(r.type)).length}; block 1 (d)).${kept.length ? `
--   * ${kept.length} page-numbered documents the owner asked to keep as they are
--     (excluded from the list and from the rule below).` : ''}
-- REGENERATE (never edit the list by hand — block 2 compares it with the rule):
--   node scripts/library-q102-page-numbered-scan.mjs <scan.jsonl>
--   node scripts/library-q102-page-numbered-generate.cjs <scan.jsonl> [--exclude <slugs.txt>]
-- A RELOAD UNDOES IT: the owner's next library upload writes the type from his
--   files again, and until his files carry the label his live key diff
--   (library:diff) shows these rows as changed. The list is
--   docs/plans/2026-10-17-q102-page-numbered-documents.md. NOT YET for his
--   frontmatter: his parser checks the type against enums.type in
--   scripts/parsers/schema_manifest.json and silently falls back to «نظام»
--   for any other value (parse-laws.ts validateEnum("type", …, "نظام")), so
--   the label must be added there first (a developer change on owner-edits).
-- ROLLBACK: block 4 (each row gets back the type it had).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — read-only. Expect: (a) ${N} rows; (b) 0 rows; (c)/(d) for the record.
-- (a) the list as it is on live now
with ${listCte}
select l.slug, l.type, l.title, l.total_articles,
       (select count(*) from library.articles a where a.law_slug = l.slug) as articles
  from q102 join library.laws l using (slug)
 order by l.slug;

-- (b) DRIFT — the rule recomputed in the database against the list; expect 0 rows
with ${listCte},
  ${ruleCte}
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
                    and coalesce(a.number_text, '') !~ ${RE});

-- (d) documents typed نظام / لائحة تنفيذية that mix pages and articles — NOT changed
select l.slug, l.type, l.title,
       count(*) filter (where coalesce(a.number_text, '') ~ ${RE}) as page_articles,
       count(*) as articles
  from library.laws l join library.articles a on a.law_slug = l.slug
 where l.type in (${OLD.map(q).join(', ')})
 group by l.slug, l.type, l.title
having bool_or(coalesce(a.number_text, '') ~ ${RE})
   and not bool_and(coalesce(a.number_text, '') ~ ${RE})
 order by l.slug;

-- 2) UPDATE — one transaction; library.laws.type only. Aborts if the rule and
--    the list disagree, or if afterwards the ${N} rows do not all carry the label.
--    Safe to run twice (the second run changes 0 rows).
begin;

do $$
declare
  drift    text;
  changed  integer;
  labelled integer;
begin
  with ${listCte},
    ${ruleCte}
  select string_agg(coalesce(r.slug, q.slug), ', ') into drift
    from rule r full join q102 q on q.slug = r.slug
   where r.slug is null or q.slug is null;
  if drift is not null then
    raise exception 'q102: the list and the database disagree on: % — nothing changed (run block 1 (b))', drift;
  end if;

  with ${listCte}
  update library.laws l
     set type = ${q(LABEL)}
    from q102
   where l.slug = q102.slug
     and l.type = q102.old_type;
  get diagnostics changed = row_count;

  with ${listCte}
  select count(*) into labelled
    from library.laws l join q102 using (slug)
   where l.type = ${q(LABEL)};
  if labelled <> ${N} then
    raise exception 'q102: expected ${N} documents labelled, found % — rolling back', labelled;
  end if;
  raise notice 'q102: % documents relabelled now (% already had the label); page anchors untouched', changed, ${N} - changed;
end $$;

commit;

-- 3) VERIFY — expect one row: «${LABEL}» | ${N}
with ${listCte}
select l.type, count(*)
  from library.laws l join q102 using (slug)
 group by l.type;

-- 4) ROLLBACK (only if needed) — each document gets back the type it had.
-- with ${listCte.replace(/\n/g, '\n-- ')}
-- update library.laws l set type = q102.old_type
--   from q102 where l.slug = q102.slug and l.type = ${q(LABEL)};
`;
fs.writeFileSync(sqlOut, sql);
const table = (list) => list.map((r, i) => `| ${i + 1} | \`${r.slug}\` | ${cmt(r.title).replace(/\|/g, '/')} | ${r.type} | ${r.n} |`).join('\n');
const md = `# قرار المالك ١٠٢: الوثائق المرقّمة بالصفحات

**لماذا هذا الملف:** هذه الوثائق مرقّمة بالصفحات لا بالمواد، فكل موادها «الصفحة N». وهي اليوم مسجّلة في المكتبة بنوع «نظام» أو «لائحة تنفيذية». قرار المالك (إجابات ٢٠٢٦-١٠-٠٦، رقم ١٠٢) أن تُصنَّف «${LABEL}» مع بقاء ترقيم الصفحات كما هو.

- **التطبيق على الموقع:** ملف SQL لمرة واحدة: \`supabase/one-time/2026-10-17_q102_page_numbered_documents.sql\`. يغيّر حقل النوع وحده، ولا يمسّ معرّفات المواد ولا أرقام الصفحات ولا الروابط.
- **إعادة رفع المكتبة تُرجع النوع القديم**، لأن الرفع يكتب النوع من ملفات المالك. وإلى أن تحمل ملفاته التصنيف الجديد ستُظهر أداة المقارنة (library:diff) هذه الوثائق مختلفة عن ملفاته.
- **لا تُكتب القيمة في الفرونت ماتر بعدُ.** المحلّل يقبل أنواعاً محددة في \`scripts/parsers/schema_manifest.json\`، ويحوّل أي قيمة أخرى بصمت إلى «نظام». فلو كُتبت اليوم لصارت الوثائق الـ${N} كلها «نظام»، وهذا أسوأ مما هي عليه الآن. يضيف المطوّر القيمة «${LABEL}» إلى تلك القائمة أولاً (في فرع owner-edits)، ثم يكتبها المالك في ملفات هذه القائمة.
- **كيف استُخرجت القائمة:** فحص للموقع الحي بصلاحية زائر في ٢٠٢٦-١٠-١٧ شمل كل الوثائق من نوع «نظام» أو «لائحة تنفيذية» (${scanned} وثيقة). يعيد ملف SQL حساب القائمة نفسها داخل قاعدة البيانات، ويرفض التنفيذ إن اختلفت.
- **رقم ١١٢ في يوليو** كان على نسخة المكتبة القديمة. العدد على المكتبة الحالية **${N}** (${byType(full)}).

## القائمة (${N})

| # | المعرّف (slug) | العنوان | النوع الحالي | عدد الصفحات |
|---|---|---|---|---|
${table(full)}

## لم تُغيَّر (للعلم)

- وثائق «تعميم» مرقّمة بالصفحات (${circulars.length}): التعميم خطاب والصفحة موضعه الطبيعي، والقرار سمّى النظام واللائحة فقط.${circulars.length ? '\n\n| # | المعرّف | العنوان | النوع | الصفحات |\n|---|---|---|---|---|\n' + table(circulars) : ''}
- وثائق تخلط بين الصفحات والمواد (${mixed.length}).${mixed.length ? '\n\n| # | المعرّف | العنوان | النوع | المواد |\n|---|---|---|---|---|\n' + table(mixed) : ''}${kept.length ? `
- وثائق مرقّمة بالصفحات طلب المالك إبقاءها كما هي (${kept.length}).\n\n| # | المعرّف | العنوان | النوع | الصفحات |\n|---|---|---|---|---|\n` + table(kept) : ''}

**لاستبعاد وثيقة من القائمة:** لا يُعدَّل ملف SQL باليد. يعيد المطوّر توليد الملفات الثلاثة بالأمر \`node scripts/library-q102-page-numbered-generate.cjs <scan.jsonl> --exclude <ملف المعرّفات>\`.
`;
fs.writeFileSync(mdOut, md);
// Docker fixture (supabase/tests/rls/prelude_q102_fixture.sql): every listed
// document as a page-numbered law of its current type, plus the three shapes
// the file must leave alone, and a snapshot of what must not change.
{
  // Kept documents go in too: page-numbered, old type, and they must not move.
  const lawRows = [...full, ...kept].sort((a, b) => a.slug.localeCompare(b.slug))
    .map((r) => `  (${q(r.slug)}, ${q(r.title)}, ${q(r.type)}, '00')`).join(',\n');
  const fixture = `-- prelude_q102_fixture.sql — GENERATED with the one-time file
-- supabase/one-time/2026-10-17_q102_page_numbered_documents.sql (same list).
-- Every listed document as a page-numbered law of its current type (two
-- «الصفحة N» articles each), plus what the file must leave alone: a law mixing
-- pages and articles, a page-numbered «تعميم», an ordinary law. Snapshots of
-- the articles and of the laws' types let the test prove nothing else moved.
insert into library.laws (slug, title, type, section_code) values
${lawRows},
  ('q102-mixed', 'نظام مختلط الترقيم', 'نظام', '00'),
  ('q102-circular', 'تعميم مرقم بالصفحات', 'تعميم', '00'),
  ('q102-normal', 'نظام عادي', 'نظام', '00');
insert into library.articles (id, law_slug, number, number_text, text, status)
select l.slug || '__art-' || n, l.slug, n::text,
       case when l.slug = 'q102-normal' or (l.slug = 'q102-mixed' and n = 2) then 'المادة ' || n
            when n = 2 then '## الصفحة ٢:' else 'الصفحة ' || n end,
       'نص الصفحة ' || n, 'status_undeclared'
  from library.laws l cross join generate_series(1, 2) n;
create table public.q102_articles_before as
  select id, law_slug, number, number_text, text, status from library.articles;
create table public.q102_laws_before as select slug, type from library.laws;
-- Page-numbered documents kept as they are (generator --exclude); may be empty.
create table public.q102_kept (slug text primary key);
${kept.length ? `insert into public.q102_kept (slug) values ${kept.map((r) => `(${q(r.slug)})`).join(', ')};\n` : ''}`;
  fs.writeFileSync(fixtureOut, fixture);
}
console.log(JSON.stringify({ N, kept: kept.length, byType: byType(full), circulars: circulars.length, mixed: mixed.length, scanned }));
