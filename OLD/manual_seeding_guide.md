# 📚 Manual Data Seeding Guide — One Record at a Time

> This guide shows you how to insert records directly into Supabase using SQL. No JSON files, no scripts. You go to Supabase → SQL Editor and paste these queries.

---

## ⚡ Prerequisites

1. **Migration applied**: Run `npx supabase db push` in the project root (or manually execute `20260626_legal_library_schema.sql` in the SQL Editor).
2. **Supabase SQL Editor**: Open your Supabase Dashboard → SQL Editor.
3. **Schema prefix**: All tables live in the `library` schema. Every query uses `library.table_name`.

---

## 🧹 Step 0: Verify the Schema is Empty

Before seeding, confirm all tables are empty:

```sql
-- Check row counts for all library tables
SELECT 'laws' AS tbl, count(*) FROM library.laws
UNION ALL SELECT 'chapters', count(*) FROM library.chapters
UNION ALL SELECT 'articles', count(*) FROM library.articles
UNION ALL SELECT 'article_amendments', count(*) FROM library.article_amendments
UNION ALL SELECT 'decrees_circulars', count(*) FROM library.decrees_circulars
UNION ALL SELECT 'decree_pages', count(*) FROM library.decree_pages
UNION ALL SELECT 'judicial_collections', count(*) FROM library.judicial_collections
UNION ALL SELECT 'principles', count(*) FROM library.principles
UNION ALL SELECT 'principle_paragraphs', count(*) FROM library.principle_paragraphs
UNION ALL SELECT 'feqh_books', count(*) FROM library.feqh_books
UNION ALL SELECT 'feqh_chapters', count(*) FROM library.feqh_chapters
UNION ALL SELECT 'feqh_sections', count(*) FROM library.feqh_sections
UNION ALL SELECT 'feqh_blocks', count(*) FROM library.feqh_blocks
ORDER BY tbl;
```

If you need to wipe everything and start fresh:

```sql
-- ⚠️ DANGER: Wipes ALL library data
TRUNCATE library.laws CASCADE;
TRUNCATE library.decrees_circulars CASCADE;
TRUNCATE library.judicial_collections CASCADE;
TRUNCATE library.feqh_books CASCADE;
```

---

## 📖 Section 1: Laws & Regulations (الأنظمة واللوائح)

### Step 1.1: Insert a Law

```sql
INSERT INTO library.laws (
  slug,
  title,
  title_en,
  type,
  description,
  section_code,
  section_name,
  issuing_body,
  issuing_instrument,
  issue_date_hijri,
  total_articles,
  status,
  preamble,
  has_merged_regulation
) VALUES (
  'companies-law',                    -- slug (URL-safe, unique)
  'نظام الشركات',                     -- title (Arabic)
  'Companies Law',                    -- title_en (English)
  'law',                              -- type: 'law' | 'regulation' | 'bylaw'
  'نظام الشركات الصادر بالمرسوم الملكي', -- description
  'SA-COM',                           -- section_code
  'الأنظمة التجارية',                 -- section_name
  'هيئة الخبراء',                     -- issuing_body
  'المرسوم الملكي رقم (م/3)',         -- issuing_instrument
  '1443/01/01',                       -- issue_date_hijri
  229,                                -- total_articles
  'active',                           -- status: active | repealed | suspended
  'بسم الله الرحمن الرحيم...',        -- preamble
  true                                -- has_merged_regulation
);
```

### Step 1.2: Insert a Chapter

```sql
INSERT INTO library.chapters (
  law_slug,
  number,
  title,
  order_index
) VALUES (
  'companies-law',                    -- FK → library.laws.slug
  1,                                  -- chapter number
  'الباب الأول: أحكام عامة',          -- chapter title
  1                                   -- sort order
)
RETURNING id;  -- ✅ Save this UUID for inserting articles
```

### Step 1.3: Insert an Article

```sql
INSERT INTO library.articles (
  id,
  law_slug,
  chapter_id,
  number,
  number_text,
  title,
  status,
  text,
  executive_reg_text,
  executive_reg_ref,
  free,
  order_index
) VALUES (
  'companies-law-art-1',              -- unique article ID
  'companies-law',                    -- FK → library.laws.slug
  '<<UUID from step 1.2>>',          -- FK → library.chapters.id (or NULL)
  '1',                                -- article number as string
  'المادة الأولى',                    -- display number text
  'تعريفات',                          -- article title (optional)
  'active',                           -- status: active | amended | repealed | suspended
  'يقصد بالألفاظ والعبارات الآتية...',  -- full article text
  'يراعى في تطبيق أحكام هذه المادة...',  -- executive regulation text (if applicable)
  'المادة الأولى من اللائحة التنفيذية',  -- regulation reference
  true,                               -- free: true = visible to all | false = premium
  1                                   -- sort order
);
```

### Step 1.4: Insert an Amendment (Optional)

```sql
INSERT INTO library.article_amendments (
  article_id,
  date,
  source,
  type,
  summary,
  full_text
) VALUES (
  'companies-law-art-1',              -- FK → library.articles.id
  '1445/06/15',                       -- amendment date
  'المرسوم الملكي رقم (م/20)',       -- source decree
  'تعديل',                            -- type: تعديل | إضافة | حذف
  'تم تعديل الفقرة الثانية من المادة', -- brief summary
  'النص الكامل بعد التعديل...'        -- full amended text (optional)
);
```

---

## 📜 Section 2: Decrees & Circulars (التعاميم والمراسم)

### Step 2.1: Insert a Decree

```sql
INSERT INTO library.decrees_circulars (
  title,
  type,
  issuer,
  ref,
  date,
  summary,
  summary_brief,
  category,
  preamble,
  hashtags,
  official_url
) VALUES (
  'المرسوم الملكي رقم (م/3) بتاريخ 1443/01/01', -- title
  'royal',                            -- type: 'royal' | 'cabinet' | 'circular'
  'خادم الحرمين الشريفين',           -- issuer
  'م/3',                              -- reference number
  '1443/01/01',                       -- date
  'إصدار نظام الشركات الجديد...',     -- full summary
  'نظام الشركات الجديد',             -- brief summary
  'أنظمة تجارية',                    -- category
  'نحن عبدالله بن عبدالعزيز آل سعود...', -- preamble
  ARRAY['شركات', 'تجارة', 'استثمار'],  -- hashtags
  'https://laws.boe.gov.sa/...'       -- official URL
)
RETURNING id;  -- ✅ Save this UUID for decree_pages
```

### Step 2.2: Insert Decree Pages/Articles

```sql
INSERT INTO library.decree_pages (
  decree_id,
  page_number,
  content
) VALUES
  ('<<UUID from step 2.1>>', 1, 'نص الصفحة الأولى من المرسوم الملكي...'),
  ('<<UUID from step 2.1>>', 2, 'نص الصفحة الثانية...');
```

---

## ⚖️ Section 3: Judicial Precedents & Principles (المبادئ والسوابق)

### Step 3.1: Insert a Collection

```sql
INSERT INTO library.judicial_collections (
  id,
  title,
  court,
  year_hijri,
  part,
  source_id,
  track,
  description,
  ruling_count,
  free
) VALUES (
  'admin-supreme-1443-part1',            -- collection ID (used as slug)
  'مبادئ الدائرة الإدارية العليا 1443هـ - الجزء الأول',
  'المحكمة الإدارية العليا',             -- court name
  1443,                                   -- hijri year
  1,                                      -- part number
  'all',                                  -- source identifier
  'إداري',                               -- track: إداري | جزائي | عمالي | تجاري
  'مجموعة المبادئ القضائية الصادرة عن الدائرة الإدارية العليا',
  150,                                    -- estimated ruling count
  true                                    -- free access
);
```

### Step 3.2: Insert a Principle

```sql
INSERT INTO library.principles (
  id,
  collection_id,
  principle_number,
  issuing_body,
  session_date,
  decision_number,
  reference,
  text,
  ruling_basis,
  facts,
  reasons,
  ruling,
  year_hijri,
  order_index
) VALUES (
  'admin-supreme-1443-part1-p1',            -- unique principle ID
  'admin-supreme-1443-part1',               -- FK → judicial_collections.id
  '1',                                       -- principle number
  'الدائرة الإدارية العليا',                -- issuing body
  '1443/02/15',                             -- session date (optional)
  'قرار رقم 342/1443',                      -- decision number
  'المبدأ صادر عن الدائرة الإدارية العليا',  -- reference text
  'إذا صدر القرار الإداري مخالفاً للنظام فإنه يكون باطلاً...',  -- principle main text
  'نظام المرافعات أمام ديوان المظالم المادة 13', -- ruling basis (optional)
  'تتلخص وقائع الدعوى في أن المدعي...',     -- case facts (optional)
  'حيث إن القرار المطعون فيه صدر...',       -- reasons (optional)
  'قررت الدائرة إلغاء القرار المطعون فيه',   -- ruling (optional)
  1443,                                      -- year hijri
  1                                          -- sort order
);
```

### Step 3.3: Insert Principle Paragraphs (Sub-items)

```sql
INSERT INTO library.principle_paragraphs (
  principle_id,
  letter,
  text,
  keywords,
  order_index
) VALUES
  ('admin-supreme-1443-part1-p1', 'أ', 'القرار الإداري المعيب يكون باطلاً...', ARRAY['بطلان', 'قرار إداري'], 1),
  ('admin-supreme-1443-part1-p1', 'ب', 'لا يجوز سحب القرار الإداري بعد مضي...', ARRAY['سحب', 'مدة'], 2);
```

---

## 📚 Section 4: Feqh Books (الفقه)

### Step 4.1: Insert a Book

```sql
INSERT INTO library.feqh_books (
  id,
  title,
  author,
  school,
  type,
  category,
  description,
  investigator,
  total_volumes,
  total_pages
) VALUES (
  'rawd-al-murbi',                   -- book ID
  'الروض المربع شرح زاد المستقنع',   -- title
  'منصور بن يونس البهوتي',          -- author
  'حنبلي',                           -- school: حنبلي | حنفي | شافعي | مالكي
  'sharia',                          -- type: 'sharia' | 'comparative' | 'wadi'
  'فقه العبادات',                    -- category
  'شرح مختصر لزاد المستقنع في الفقه الحنبلي',
  'عبدالرحمن بن محمد القاسم',       -- investigator
  2,                                  -- total volumes
  850                                 -- total pages
);
```

### Step 4.2: Insert a Chapter (كتاب)

```sql
INSERT INTO library.feqh_chapters (
  book_id,
  title,
  volume_number,
  order_index
) VALUES (
  'rawd-al-murbi',                    -- FK → feqh_books.id
  'كتاب الطهارة',                    -- chapter title
  1,                                   -- volume
  1                                    -- sort order
)
RETURNING id;  -- ✅ Save this UUID
```

### Step 4.3: Insert a Section (باب / فصل)

```sql
INSERT INTO library.feqh_sections (
  chapter_id,
  title,
  order_index
) VALUES (
  '<<UUID from step 4.2>>',           -- FK → feqh_chapters.id
  'باب المياه',                       -- section title
  1                                    -- sort order
)
RETURNING id;  -- ✅ Save this UUID
```

### Step 4.4: Insert a Content Block

```sql
INSERT INTO library.feqh_blocks (
  id,
  section_id,
  topic,
  volume_number,
  page_number,
  matn,
  sharh,
  order_index
) VALUES (
  'rawd-al-murbi-v1-p10',             -- unique block ID
  '<<UUID from step 4.3>>',           -- FK → feqh_sections.id
  'أقسام المياه',                     -- topic label
  1,                                    -- volume number
  10,                                   -- page number
  'الطَّهور: هو الماء الطاهر في نفسه المطهِّر لغيره...', -- matn (core text)
  'أي الماء الذي بقي على خلقته التي خلقه الله عليها...',  -- sharh (commentary)
  1                                    -- sort order
);
```

---

## ✅ Verification Queries

After inserting data, verify everything is linked correctly:

```sql
-- 1. Check law with its articles count
SELECT l.slug, l.title, count(a.id) AS article_count
FROM library.laws l
LEFT JOIN library.articles a ON a.law_slug = l.slug
GROUP BY l.slug, l.title;

-- 2. Check collections with principles count
SELECT jc.id, jc.title, jc.court, count(p.id) AS principle_count
FROM library.judicial_collections jc
LEFT JOIN library.principles p ON p.collection_id = jc.id
GROUP BY jc.id, jc.title, jc.court;

-- 3. Check feqh books hierarchy
SELECT fb.title AS book, fc.title AS chapter, fs.title AS section, count(b.id) AS blocks
FROM library.feqh_books fb
LEFT JOIN library.feqh_chapters fc ON fc.book_id = fb.id
LEFT JOIN library.feqh_sections fs ON fs.chapter_id = fc.id
LEFT JOIN library.feqh_blocks b ON b.section_id = fs.id
GROUP BY fb.title, fc.title, fs.title;

-- 4. Test Arabic full-text search
SELECT slug, title, ts_rank(fts, to_tsquery('library.arabic', 'شركات')) AS rank
FROM library.laws
WHERE fts @@ to_tsquery('library.arabic', 'شركات')
ORDER BY rank DESC;

-- 5. Test article search
SELECT id, law_slug, number, substring(text, 1, 100) AS preview
FROM library.articles
WHERE fts @@ to_tsquery('library.arabic', 'شركة')
LIMIT 5;
```

---

## 📋 FK Dependency Order (Important!)

When inserting data, **always respect this order** to avoid foreign key violations:

```
Section A (Laws):
  1. library.laws              ← INSERT FIRST (no dependencies)
  2. library.chapters          ← needs laws.slug
  3. library.articles          ← needs laws.slug + chapters.id
  4. library.article_amendments ← needs articles.id

Section B (Decrees):
  1. library.decrees_circulars ← INSERT FIRST (no dependencies)
  2. library.decree_pages      ← needs decrees_circulars.id

Section C (Precedents):
  1. library.judicial_collections ← INSERT FIRST (no dependencies)
  2. library.principles          ← needs judicial_collections.id
  3. library.principle_paragraphs ← needs principles.id

Section D (Feqh):
  1. library.feqh_books       ← INSERT FIRST (no dependencies)
  2. library.feqh_chapters    ← needs feqh_books.id
  3. library.feqh_sections    ← needs feqh_chapters.id
  4. library.feqh_blocks      ← needs feqh_sections.id
```

---

## 🗑️ Deleting Single Records

To remove a specific record and all its children (thanks to `ON DELETE CASCADE`):

```sql
-- Delete a single law and all its chapters/articles/amendments
DELETE FROM library.laws WHERE slug = 'companies-law';

-- Delete a single collection and all its principles/paragraphs
DELETE FROM library.judicial_collections WHERE id = 'admin-supreme-1443-part1';

-- Delete a single book and all its chapters/sections/blocks
DELETE FROM library.feqh_books WHERE id = 'rawd-al-murbi';

-- Delete a specific decree
DELETE FROM library.decrees_circulars WHERE id = '<<UUID>>';
```

---

## 🔄 Updating Records

```sql
-- Update a law's status
UPDATE library.laws SET status = 'repealed' WHERE slug = 'old-companies-law';

-- Update an article's text
UPDATE library.articles
SET text = 'النص المعدل للمادة...',
    status = 'amended'
WHERE id = 'companies-law-art-1';

-- Add a new keyword to principle paragraphs
UPDATE library.principle_paragraphs
SET keywords = array_append(keywords, 'كلمة جديدة')
WHERE principle_id = 'admin-supreme-1443-part1-p1';
```
