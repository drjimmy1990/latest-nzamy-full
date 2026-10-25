-- prelude_search_relevance_fixture.sql — fixture for library_search_relevance.test.sql.
-- Runs BEFORE 20261026_52. Per section:
--   * hand-made rows whose order by relevance is known: a word three times in
--     a short text above the same word once in a long one, and two identical
--     texts (a tie the primary key must break);
--   * a bulk of filler rows (a 2,000-word vocabulary, 30 words each) holding
--     «متوسطة» 1–5 times in a few dozen rows (ranked paging), «نادرة» in 3
--     rows (a rare word), and «شائعة» in more rows than the 5,000-row ranking
--     cap (a common word: the id order).
-- Then ANALYZE, without 20261017_21's larger statistics target — the worst
-- case for the planner's word estimates.

create or replace function pg_temp.filler(seed int, n int) returns text language sql immutable as $$
  select string_agg('كلمة' || translate(((seed * 7919 + s * 104729) % 2000)::text, '0123456789', 'ابتثجحخدذر'), ' ')
    from generate_series(1, n) s
$$;

create or replace function pg_temp.marks(g int) returns text language sql immutable as $$
  select concat_ws(' ',
    pg_temp.filler(g, 30),
    case when g % 4 = 0 then 'شائعة' end,
    case when g % 250 = 7 then repeat('متوسطة ', 1 + (g / 250) % 5) end,
    case when g in (11, 22222, 29999) then 'نادرة' end)
$$;

-- ── laws ────────────────────────────────────────────────────────────────────
insert into library.laws (slug, title, type, section_code) values
  ('rel-a',    'نظام التحكيم',                     'نظام',          '05'),
  ('rel-b',    'اللائحة التنفيذية لنظام التحكيم', 'لائحة تنفيذية', '06'),
  ('rel-bulk', 'نظام اختباري',                     'نظام',          '07');

insert into library.articles (id, law_slug, number, text, original_text, status) values
  ('rel-a__art-1', 'rel-a', '1', 'تحكيم تحكيم تحكيم في المنازعات', null, 'active'),
  ('rel-a__art-2', 'rel-a', '2', 'تحكيم ' || pg_temp.filler(1, 60), null, 'active'),
  ('rel-b__art-1', 'rel-b', '1', 'شرط تحكيم بين الطرفين', null, 'active'),
  ('rel-b__art-2', 'rel-b', '2', 'شرط تحكيم بين الطرفين', null, 'active'),
  ('rel-b__art-3', 'rel-b', '3', '', 'تحكيم تحكيم ملغى', 'repealed');

insert into library.articles (id, law_slug, number, text, status)
  select 'rel-bulk__art-' || lpad(g::text, 5, '0'), 'rel-bulk', g::text, pg_temp.marks(g), 'active'
    from generate_series(1, 30000) g;

-- ── precedents ──────────────────────────────────────────────────────────────
insert into library.judicial_collections (id, title, court, track, source_id) values
  ('rel-col-1', 'مجموعة الأحكام التجارية', 'المحكمة التجارية', 'commercial', 'src-1'),
  ('rel-col-2', 'مجموعة المبادئ الإدارية', 'ديوان المظالم',    'administrative', 'src-2');

insert into library.principles (id, collection_id, principle_number, issuing_body, text, year_hijri) values
  ('rel-p-1', 'rel-col-1', '1', 'المحكمة التجارية', 'تعويض تعويض تعويض عن الضرر', 1442),
  ('rel-p-2', 'rel-col-2', '2', 'ديوان المظالم',    'تعويض ' || pg_temp.filler(2, 60), 1443),
  ('rel-p-3', 'rel-col-1', '3', 'المحكمة التجارية', 'التزام تعويض الطرف', 1442),
  ('rel-p-4', 'rel-col-1', '4', 'المحكمة التجارية', 'التزام تعويض الطرف', 1444);

-- 300 more collections, as on the live library (hundreds): the generic plan
-- of a join to them is what 20261026_52 must not loop over.
insert into library.judicial_collections (id, title, court, track, source_id)
  select 'rel-col-bulk-' || lpad(c::text, 3, '0'), 'مجموعة ' || c, 'محكمة ' || (c % 9), 'general', 'src-bulk'
    from generate_series(1, 300) c;

insert into library.principles (id, collection_id, principle_number, issuing_body, text, year_hijri)
  select 'rel-p-bulk-' || lpad(g::text, 5, '0'), 'rel-col-bulk-' || lpad((1 + g % 300)::text, 3, '0'),
         g::text, 'جهة', pg_temp.marks(g), 1440 + g % 5
    from generate_series(1, 22000) g;

-- ── fiqh ────────────────────────────────────────────────────────────────────
insert into library.feqh_books (id, title, author, school, type) values ('rel-book', 'المغني', 'ابن قدامة', 'حنبلي', 'sharia');
insert into library.feqh_chapters (id, book_id, title, order_index)
  values ('00000000-0000-0000-0000-00000000c052', 'rel-book', 'كتاب البيوع', 1);
insert into library.feqh_sections (id, chapter_id, title, order_index)
  values ('00000000-0000-0000-0000-00000000a052', '00000000-0000-0000-0000-00000000c052', 'باب الخيار', 1);

insert into library.feqh_blocks (id, section_id, book_id, topic, page_number, matn, sharh, order_index) values
  ('rel-f-1', '00000000-0000-0000-0000-00000000a052', 'rel-book', 'الخيار', 1, 'خيار خيار خيار المجلس', null, 1),
  ('rel-f-2', '00000000-0000-0000-0000-00000000a052', 'rel-book', 'الشرط',  2, 'خيار ' || pg_temp.filler(3, 60), null, 2),
  ('rel-f-3', '00000000-0000-0000-0000-00000000a052', 'rel-book', 'العيب',  3, 'رد خيار العيب', null, 3),
  ('rel-f-4', '00000000-0000-0000-0000-00000000a052', 'rel-book', 'العيب',  4, 'رد خيار العيب', null, 4);

insert into library.feqh_blocks (id, section_id, book_id, topic, page_number, matn, order_index)
  select 'rel-f-bulk-' || lpad(g::text, 5, '0'), '00000000-0000-0000-0000-00000000a052', 'rel-book',
         'باب', g, pg_temp.marks(g), 10 + g
    from generate_series(1, 22000) g;

-- ── orders ──────────────────────────────────────────────────────────────────
insert into library.decrees_circulars (id, title, type, issuer, ref, date, summary_brief, category) values
  ('00000000-0000-0000-0000-0000000d0001', 'تعميم ترخيص ترخيص ترخيص', 'circular', 'وزارة التجارة', 'ت/1', '1445/01/01', 'موجز', '08'),
  ('00000000-0000-0000-0000-0000000d0002', 'قرار ترخيص', 'cabinet', 'مجلس الوزراء', 'ق/2', '1445/02/01', pg_temp.filler(4, 60), '8'),
  ('00000000-0000-0000-0000-0000000d0003', 'أمر ترخيص المنشآت', 'royal', 'الديوان الملكي', 'أ/3', '1445/03/01', null, '05'),
  ('00000000-0000-0000-0000-0000000d0004', 'أمر ترخيص المنشآت', 'royal', 'الديوان الملكي', 'أ/4', '1445/04/01', null, '05');

insert into library.decrees_circulars (title, type, issuer, ref, summary_brief, category)
  select 'وثيقة ' || g, (array['royal', 'cabinet', 'circular'])[1 + g % 3], 'جهة ' || (g % 7), 'م/' || g,
         pg_temp.marks(g), lpad((g % 30)::text, 2, '0')
    from generate_series(1, 22000) g;

analyze library.laws;
analyze library.articles;
analyze library.judicial_collections;
analyze library.principles;
analyze library.feqh_blocks;
analyze library.decrees_circulars;
