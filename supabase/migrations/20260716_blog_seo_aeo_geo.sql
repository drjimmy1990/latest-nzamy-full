-- 20260716_blog_seo_aeo_geo.sql
-- Extend the Blog CMS for the new 31-field article frontmatter (SEO/AEO/GEO/E-E-A-T)
-- from test/newblog/blog_final, plus a sections taxonomy and a public cover-image
-- storage bucket.
--
-- All new articles columns are NULLABLE so the admin write endpoints (which use
-- fixed field allowlists in src/app/api/v1/admin/articles/route.ts and [id]/route.ts)
-- keep working without referencing them — the seeder is the write path for the new
-- fields. The admin UI will ignore them until extended.
--
-- Idempotent: every statement uses IF NOT EXISTS / ON CONFLICT DO NOTHING.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. articles: 23 new columns
-- ═══════════════════════════════════════════════════════════════════════════════
alter table public.articles
  add column if not exists schema_type text,              -- Article | FAQPage | HowTo
  add column if not exists author_credentials text,       -- E-E-A-T / Person schema credential string
  add column if not exists author_url text,               -- https://nezamy.sa/team/...
  add column if not exists reviewer text,                 -- reviewer body (e.g. فريق نظامي القانوني)
  add column if not exists date_modified date,            -- last significant revision (YYYY-MM-DD)
  add column if not exists primary_keyword text,
  add column if not exists secondary_keywords text[],     -- YAML list
  add column if not exists long_tail_keywords text[],     -- YAML list
  add column if not exists seo_keywords text,             -- comma-separated meta string
  add column if not exists aeo_pairs jsonb,               -- [{question, answer}, ...] -> FAQPage schema
  add column if not exists geo_coverage text,             -- fixed 20-city list
  add column if not exists geo_tier1 text,                -- fixed 10-city tier-1 list
  add column if not exists geo_tier2 text,                -- fixed 10-city tier-2 list
  add column if not exists related_laws text,             -- Saudi law names + exact article numbers
  add column if not exists original_sources text,         -- issuing authority (MOJ, Najez, Bureau of Experts)
  add column if not exists pillar_page text,              -- category/pillar name
  add column if not exists related_articles text[],       -- slugs -> internal links
  add column if not exists target_persona text,           -- أبو فهد | أ. خالد | أ. عبدالعزيز
  add column if not exists writing_track text,            -- B2C | B2B
  add column if not exists content_scope text,            -- ضيق | قياسي | شامل
  add column if not exists brand text,                    -- 'نظامي'
  add column if not exists canonical_url text,
  add column if not exists category_code text;            -- sec_XX_name (maps to blog_sections.code)

create index if not exists articles_category_code_idx on public.articles (category_code);
create index if not exists articles_status_modified_idx  on public.articles (status, date_modified desc);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. blog_sections: category taxonomy (31 rows)
--    Source of truth for code + Arabic label: scripts/seed-blog.mjs CATEGORY_AR.
--    library_code mirrors the legal-library subject folders (00-29); two sections
--    intentionally share a library source for SEO/persona value:
--      sec_03_execution   -> library 00 (procedural)
--      sec_17_construction-> library 07 (real estate)
-- ═══════════════════════════════════════════════════════════════════════════════
create table if not exists public.blog_sections (
  code            text primary key,        -- sec_04_civil
  ar_label        text not null,           -- القانون المدني
  library_code    text,                    -- 04
  default_track   text,                    -- B2C | B2B  (nullable; set per-article too)
  default_persona text,                    -- nullable
  sort_order      int  not null default 0
);

insert into public.blog_sections (code, ar_label, library_code, sort_order) values
  ('sec_00_procedural',    'الإجراءات والمرافعات',          '00',  0),
  ('sec_01_criminal',      'القانون الجنائي',               '01',  1),
  ('sec_02_admin',         'القضاء الإداري',                '02',  2),
  ('sec_03_execution',     'التنفيذ',                       '00',  3),
  ('sec_04_civil',         'القانون المدني',                '04',  4),
  ('sec_05_commercial',    'القانون التجاري',               '05',  5),
  ('sec_06_ip',            'الملكية الفكرية',               '06',  6),
  ('sec_07_labor',         'قانون العمل',                   '07',  7),
  ('sec_08_real_estate',   'العقار والإيجار',               '08',  8),
  ('sec_09_financial',     'القانون المالي والمصرفي',       '09',  9),
  ('sec_10_tax',           'الضرائب والزكاة',               '10', 10),
  ('sec_11_health',        'القانون الصحي',                 '11', 11),
  ('sec_12_environment',   'البيئة',                        '12', 12),
  ('sec_13_tech',          'التقنية والبيانات',             '13', 13),
  ('sec_14_transport',     'النقل',                         '14', 14),
  ('sec_15_energy',        'الطاقة',                        '15', 15),
  ('sec_16_media',         'الإعلام',                       '16', 16),
  ('sec_17_construction',  'المقاولات والتشييد',            '07', 17),
  ('sec_18_investment',    'الاستثمار',                     '18', 18),
  ('sec_19_education',     'التعليم',                       '19', 19),
  ('sec_20_sports',        'الرياضة',                       '20', 20),
  ('sec_21_hajj',          'الحج والعمرة',                   '21', 21),
  ('sec_22_defense',       'الدفاع والأمن',                 '22', 22),
  ('sec_23_social',        'الأحوال الاجتماعية',            '23', 23),
  ('sec_24_tourism',       'السياحة',                       '24', 24),
  ('sec_25_municipal',     'الشؤون البلدية',                '25', 25),
  ('sec_26_arbitration',   'التحكيم',                       '26', 26),
  ('sec_27_international', 'القانون الدولي',                '27', 27),
  ('sec_28_industry',      'الصناعة',                       '28', 28),
  ('sec_29_constitutional','القانون الدستوري',              '29', 29),
  ('sec_30_culture',       'الثقافة',                       '30', 30)
on conflict (code) do nothing;

alter table public.blog_sections enable row level security;
drop policy if exists "blog_sections_public_read" on public.blog_sections;
create policy "blog_sections_public_read" on public.blog_sections
  for select using (true);
drop policy if exists "blog_sections_admin_write" on public.blog_sections;
create policy "blog_sections_admin_write" on public.blog_sections
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Public storage bucket for blog cover images
--    public = true -> anon reads work via the bucket's public flag.
--    NOTE: storage.objects RLS policies can't always be applied by the migration
--    role (owner is supabase_storage_admin; see 20260628_documents_upload.sql).
--    For a public bucket Supabase auto-grants anon read, so no extra policy is
--    needed here. If public reads 403 after apply, add a SELECT policy via
--    Dashboard -> Storage -> Policies (bucket 'blog-covers').
-- ═══════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-covers', 'blog-covers', true, 10485760,
  array['image/webp','image/avif','image/png','image/jpeg']
)
on conflict (id) do nothing;

commit;

-- ============================================================
-- Execute in Supabase SQL Editor or: npx supabase db execute --file <this>
-- ============================================================