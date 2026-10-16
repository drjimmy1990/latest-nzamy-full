-- prelude_fts_statistics_fixture.sql — fixture for library_fts_statistics.test.sql.
-- Runs BEFORE 20261017_21 so that the migration's ANALYZE sees a corpus shaped
-- like the real one: a head of frequent words longer than the default
-- statistics target can list, then a long tail. 8,000 articles; each holds
--   * 30 of 1,500 "frequent" words (each in 2% of the rows): at the default
--     target (1,000 listed words) the least common LISTED word is still at 2%,
--     so any unlisted word is estimated at the 0.5% cap — 40 rows;
--   * 3 of 3,000 "tail" words (each in 8 rows, 0.1%): only a larger list
--     reaches them, and then an unlisted word is estimated at half of 0.1%;
--   * one word of its own («نادرةN», a single row).
insert into library.laws (slug, title, type, section_code)
  values ('stats-law', 'نظام اختباري للإحصاءات', 'نظام', '00');
insert into library.articles (id, law_slug, number, text, status)
select 'stats-law__art-' || i, 'stats-law', i::text,
       (select string_agg('كلمة' || j, ' ') from generate_series(0, 1499) j where (i + j) % 50 = 0)
         || ' متوسطة' || ((i * 3) % 3000) || ' متوسطة' || ((i * 3 + 1) % 3000) || ' متوسطة' || ((i * 3 + 2) % 3000)
         || ' نادرة' || i,
       'active'
  from generate_series(1, 8000) i;
