-- =============================================================================
-- Legal Library · Full Schema Migration
-- =============================================================================
-- Created:  2026-06-26
-- Schema:   library
-- Tables:   17  (laws, chapters, articles, article_amendments,
--                decrees_circulars, decree_pages,
--                judicial_collections, principles, principle_paragraphs,
--                feqh_books, feqh_chapters, feqh_sections, feqh_blocks,
--                smart_folders, smart_folder_items, invitations, issue_reports)
-- Features: Arabic full-text search, GIN indexes, B-tree indexes,
--           RLS policies, cross-section search materialized view
-- =============================================================================

begin;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  0. SCHEMA                                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create schema if not exists library;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  1. ARABIC FULL-TEXT SEARCH CONFIGURATION                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Arabic text search config — uses simple dictionary (no stemmer) which works
-- better for Arabic than the default English config. The simple dictionary
-- lower-cases and strips diacritics, giving us workable Arabic FTS.

do $$
begin
  if not exists (
    select 1 from pg_ts_config where cfgname = 'arabic'
      and cfgnamespace = (select oid from pg_namespace where nspname = 'library')
  ) then
    execute 'create text search configuration library.arabic (copy = simple)';
    comment on text search configuration library.arabic
      is 'Arabic full-text search configuration based on simple dictionary — strips diacritics and tokenizes Arabic text.';
  end if;
end;
$$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2. TRIGGER FUNCTION: auto-set updated_at                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create or replace function library.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function library.handle_updated_at()
  is 'Sets updated_at = now() before every UPDATE. Attached to all library tables.';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION A: LAWS & REGULATIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  A1. library.laws                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.laws (
  slug                   varchar(200)  primary key,
  title                  text          not null,
  title_en               text,
  type                   varchar(50)   not null default 'law',
  description            text,
  section_code           varchar(20),
  section_name           varchar(200),
  issuing_body           varchar(200),
  issuing_instrument     varchar(200),
  issue_date_hijri       varchar(20),
  publication_date_hijri varchar(20),
  effective_date_hijri   varchar(20),
  boe_source_url         text,
  official_source_url    text,
  total_articles         int           default 0,
  status                 varchar(30)   not null default 'active',
  preamble               text,
  article_status_summary jsonb         default '{}'::jsonb,
  latest_update          jsonb,
  has_merged_regulation  boolean       not null default false,

  -- FTS column — auto-populated by trigger
  fts                    tsvector      generated always as (
                           to_tsvector('library.arabic', coalesce(title, '') || ' ' || coalesce(description, ''))
                         ) stored,

  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now()
);

create trigger trg_laws_updated_at
  before update on library.laws
  for each row execute function library.handle_updated_at();

comment on table library.laws is 'Saudi laws and regulations master table.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  A2. library.chapters                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.chapters (
  id          uuid          primary key default gen_random_uuid(),
  law_slug    varchar(200)  not null references library.laws(slug) on delete cascade,
  number      int           not null,
  title       text          not null,
  order_index int           not null default 0,

  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create trigger trg_chapters_updated_at
  before update on library.chapters
  for each row execute function library.handle_updated_at();

comment on table library.chapters is 'Chapters within a law, used to group articles.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  A3. library.articles                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.articles (
  id                  varchar(150)  primary key,  -- e.g. 'art-1'
  law_slug            varchar(200)  not null references library.laws(slug) on delete cascade,
  chapter_id          uuid          references library.chapters(id) on delete set null,
  number              varchar(20),
  number_text         varchar(50),
  title               text,
  status              varchar(30)   not null default 'active',
  text                text,
  executive_reg_text  text,
  executive_reg_ref   text,
  instrument          varchar(200),
  free                boolean       not null default true,
  order_index         int           not null default 0,

  -- FTS column — indexes article body + executive regulation text
  fts                 tsvector      generated always as (
                        to_tsvector('library.arabic',
                          coalesce(title, '') || ' ' ||
                          coalesce(text, '')  || ' ' ||
                          coalesce(executive_reg_text, '')
                        )
                      ) stored,

  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

create trigger trg_articles_updated_at
  before update on library.articles
  for each row execute function library.handle_updated_at();

comment on table library.articles is 'Individual articles within a law.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  A4. library.article_amendments                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.article_amendments (
  id          uuid          primary key default gen_random_uuid(),
  article_id  varchar(150)  not null references library.articles(id) on delete cascade,
  date        text,
  source      text,
  type        text,
  summary     text,
  full_text   text,

  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create trigger trg_article_amendments_updated_at
  before update on library.article_amendments
  for each row execute function library.handle_updated_at();

comment on table library.article_amendments is 'Amendment history for individual articles.';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION B: DECREES & CIRCULARS
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  B1. library.decrees_circulars                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.decrees_circulars (
  id            uuid          primary key default gen_random_uuid(),
  title         text          not null,
  type          varchar(30)   not null check (type in ('royal', 'cabinet', 'circular')),
  issuer        text,
  ref           text,
  date          text,
  summary       text,
  summary_brief text,
  category      varchar(100),
  preamble      text,
  hashtags      text[]        default '{}',
  official_url  text,

  -- FTS column
  fts           tsvector      generated always as (
                  to_tsvector('library.arabic',
                    coalesce(title, '') || ' ' ||
                    coalesce(summary, '') || ' ' ||
                    coalesce(summary_brief, '')
                  )
                ) stored,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_decrees_circulars_updated_at
  before update on library.decrees_circulars
  for each row execute function library.handle_updated_at();

comment on table library.decrees_circulars is 'Royal decrees, cabinet decisions, and ministerial circulars.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  B2. library.decree_pages                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.decree_pages (
  id            uuid          primary key default gen_random_uuid(),
  decree_id     uuid          not null references library.decrees_circulars(id) on delete cascade,
  page_number   int           not null,
  content       text,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_decree_pages_updated_at
  before update on library.decree_pages
  for each row execute function library.handle_updated_at();

comment on table library.decree_pages is 'Paginated content of decrees and circulars.';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION C: JUDICIAL PRINCIPLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  C1. library.judicial_collections                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.judicial_collections (
  id            varchar(100)  primary key,
  title         text          not null,
  court         text,
  year_hijri    int,
  part          int,
  source_id     varchar(100),
  track         varchar(100),
  description   text,
  ruling_count  int           default 0,
  free          boolean       not null default false,
  progress      int           default 0,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_judicial_collections_updated_at
  before update on library.judicial_collections
  for each row execute function library.handle_updated_at();

comment on table library.judicial_collections is 'Collections of judicial principles organized by court, year, and track.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  C2. library.principles                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.principles (
  id              varchar(150)  primary key,
  collection_id   varchar(100)  not null references library.judicial_collections(id) on delete cascade,
  principle_number varchar(50),
  issuing_body    text,
  session_date    text,
  decision_number text,
  reference       text,
  text            text,
  ruling_basis    text,
  facts           text,
  reasons         text,
  ruling          text,
  year_hijri      int,
  order_index     int           not null default 0,

  -- FTS column
  fts             tsvector      generated always as (
                    to_tsvector('library.arabic',
                      coalesce(text, '')         || ' ' ||
                      coalesce(ruling_basis, '') || ' ' ||
                      coalesce(facts, '')        || ' ' ||
                      coalesce(reasons, '')      || ' ' ||
                      coalesce(ruling, '')
                    )
                  ) stored,

  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create trigger trg_principles_updated_at
  before update on library.principles
  for each row execute function library.handle_updated_at();

comment on table library.principles is 'Individual judicial principles within a collection.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  C3. library.principle_paragraphs                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.principle_paragraphs (
  id            uuid          primary key default gen_random_uuid(),
  principle_id  varchar(150)  not null references library.principles(id) on delete cascade,
  letter        varchar(10),
  text          text,
  keywords      text[]        default '{}',
  order_index   int           not null default 0,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_principle_paragraphs_updated_at
  before update on library.principle_paragraphs
  for each row execute function library.handle_updated_at();

comment on table library.principle_paragraphs is 'Lettered paragraphs within a judicial principle, with keyword tags.';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION D: FIQH / JURISPRUDENCE BOOKS
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  D1. library.feqh_books                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.feqh_books (
  id            varchar(100)  primary key,
  title         text          not null,
  author        text,
  school        text,
  type          varchar(30)   check (type in ('sharia', 'comparative', 'wadi')),
  category      varchar(100),
  description   text,
  investigator  text,
  total_volumes int           default 0,
  total_pages   int           default 0,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_feqh_books_updated_at
  before update on library.feqh_books
  for each row execute function library.handle_updated_at();

comment on table library.feqh_books is 'Islamic jurisprudence (fiqh) book catalogue.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  D2. library.feqh_chapters                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.feqh_chapters (
  id            uuid          primary key default gen_random_uuid(),
  book_id       varchar(100)  not null references library.feqh_books(id) on delete cascade,
  title         text          not null,
  volume_number int,
  order_index   int           not null default 0,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_feqh_chapters_updated_at
  before update on library.feqh_chapters
  for each row execute function library.handle_updated_at();

comment on table library.feqh_chapters is 'Chapter divisions within a fiqh book.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  D3. library.feqh_sections                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.feqh_sections (
  id            uuid          primary key default gen_random_uuid(),
  chapter_id    uuid          not null references library.feqh_chapters(id) on delete cascade,
  title         text          not null,
  order_index   int           not null default 0,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_feqh_sections_updated_at
  before update on library.feqh_sections
  for each row execute function library.handle_updated_at();

comment on table library.feqh_sections is 'Sections within a fiqh chapter.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  D4. library.feqh_blocks                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.feqh_blocks (
  id            varchar(150)  primary key,
  section_id    uuid          not null references library.feqh_sections(id) on delete cascade,
  topic         text,
  volume_number int,
  page_number   int,
  matn          text,
  sharh         text,
  hashiyah      jsonb,
  order_index   int           not null default 0,

  -- FTS column — indexes topic, matn (core text), and sharh (commentary)
  fts           tsvector      generated always as (
                  to_tsvector('library.arabic',
                    coalesce(topic, '') || ' ' ||
                    coalesce(matn, '')  || ' ' ||
                    coalesce(sharh, '')
                  )
                ) stored,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_feqh_blocks_updated_at
  before update on library.feqh_blocks
  for each row execute function library.handle_updated_at();

comment on table library.feqh_blocks is 'Content blocks within a fiqh section: matn (core text), sharh (commentary), hashiyah (marginal notes).';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION E: USER FEATURES
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  E1. library.smart_folders                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.smart_folders (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references auth.users(id) on delete cascade,
  name        text          not null,
  color       varchar(30),
  icon        varchar(50),

  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create trigger trg_smart_folders_updated_at
  before update on library.smart_folders
  for each row execute function library.handle_updated_at();

comment on table library.smart_folders is 'User-created folders for organizing saved library items.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  E2. library.smart_folder_items                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.smart_folder_items (
  id          uuid          primary key default gen_random_uuid(),
  folder_id   uuid          not null references library.smart_folders(id) on delete cascade,
  entity_type varchar(50)   not null,  -- 'article', 'principle', 'decree', 'feqh_block'
  entity_id   text          not null,

  created_at  timestamptz   not null default now()
);

comment on table library.smart_folder_items is 'Polymorphic items saved into a smart folder.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  E3. library.invitations                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.invitations (
  id           uuid          primary key default gen_random_uuid(),
  code         varchar(50)   not null unique,
  max_uses     int           not null default 1,
  current_uses int           not null default 0,
  expires_at   timestamptz,
  created_by   uuid          references auth.users(id) on delete set null,

  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);

create trigger trg_invitations_updated_at
  before update on library.invitations
  for each row execute function library.handle_updated_at();

comment on table library.invitations is 'Invitation codes for gated access to premium library content.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  E4. library.issue_reports                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.issue_reports (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          references auth.users(id) on delete set null,
  entity_type  varchar(50)   not null,
  entity_id    text          not null,
  report_type  varchar(50)   not null,
  description  text,
  status       varchar(30)   not null default 'pending',

  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);

create trigger trg_issue_reports_updated_at
  before update on library.issue_reports
  for each row execute function library.handle_updated_at();

comment on table library.issue_reports is 'User-submitted issue reports for library content.';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  3. INDEXES — GIN (full-text + arrays)                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- FTS GIN indexes
create index if not exists idx_laws_fts
  on library.laws using gin (fts);

create index if not exists idx_articles_fts
  on library.articles using gin (fts);

create index if not exists idx_decrees_circulars_fts
  on library.decrees_circulars using gin (fts);

create index if not exists idx_principles_fts
  on library.principles using gin (fts);

create index if not exists idx_feqh_blocks_fts
  on library.feqh_blocks using gin (fts);

-- Array GIN indexes (hashtags, keywords)
create index if not exists idx_decrees_circulars_hashtags
  on library.decrees_circulars using gin (hashtags);

create index if not exists idx_principle_paragraphs_keywords
  on library.principle_paragraphs using gin (keywords);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  4. INDEXES — B-tree (filter columns)                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- laws
create index if not exists idx_laws_status
  on library.laws (status);
create index if not exists idx_laws_type
  on library.laws (type);
create index if not exists idx_laws_section_code
  on library.laws (section_code);

-- articles
create index if not exists idx_articles_law_slug
  on library.articles (law_slug);
create index if not exists idx_articles_status
  on library.articles (status);
create index if not exists idx_articles_chapter_id
  on library.articles (chapter_id);

-- chapters
create index if not exists idx_chapters_law_slug
  on library.chapters (law_slug);

-- article_amendments
create index if not exists idx_article_amendments_article_id
  on library.article_amendments (article_id);

-- decrees_circulars
create index if not exists idx_decrees_circulars_type
  on library.decrees_circulars (type);
create index if not exists idx_decrees_circulars_issuer
  on library.decrees_circulars (issuer);
create index if not exists idx_decrees_circulars_category
  on library.decrees_circulars (category);

-- judicial_collections
create index if not exists idx_judicial_collections_year_hijri
  on library.judicial_collections (year_hijri);
create index if not exists idx_judicial_collections_track
  on library.judicial_collections (track);
create index if not exists idx_judicial_collections_source_id
  on library.judicial_collections (source_id);

-- principles
create index if not exists idx_principles_collection_id
  on library.principles (collection_id);
create index if not exists idx_principles_year_hijri
  on library.principles (year_hijri);

-- principle_paragraphs
create index if not exists idx_principle_paragraphs_principle_id
  on library.principle_paragraphs (principle_id);

-- feqh_books
create index if not exists idx_feqh_books_type
  on library.feqh_books (type);
create index if not exists idx_feqh_books_category
  on library.feqh_books (category);
create index if not exists idx_feqh_books_school
  on library.feqh_books (school);

-- feqh_chapters
create index if not exists idx_feqh_chapters_book_id
  on library.feqh_chapters (book_id);

-- feqh_sections
create index if not exists idx_feqh_sections_chapter_id
  on library.feqh_sections (chapter_id);

-- feqh_blocks
create index if not exists idx_feqh_blocks_section_id
  on library.feqh_blocks (section_id);

-- decree_pages
create index if not exists idx_decree_pages_decree_id
  on library.decree_pages (decree_id);

-- smart_folders
create index if not exists idx_smart_folders_user_id
  on library.smart_folders (user_id);

-- smart_folder_items
create index if not exists idx_smart_folder_items_folder_id
  on library.smart_folder_items (folder_id);
create index if not exists idx_smart_folder_items_entity
  on library.smart_folder_items (entity_type, entity_id);

-- invitations
create index if not exists idx_invitations_code
  on library.invitations (code);

-- issue_reports
create index if not exists idx_issue_reports_status
  on library.issue_reports (status);
create index if not exists idx_issue_reports_entity
  on library.issue_reports (entity_type, entity_id);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  5. CROSS-SECTION SEARCH — Materialized View                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Unified view across all searchable content for the global search bar.
-- Refresh periodically via cron or after bulk data loads:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY library.cross_section_search;

create materialized view if not exists library.cross_section_search as
select
  'article'::text       as entity_type,
  a.id::text            as entity_id,
  l.title               as parent_title,
  coalesce(a.title, 'مادة ' || a.number) as title,
  left(a.text, 500)     as snippet,
  a.fts                 as fts,
  a.created_at          as created_at
from library.articles a
join library.laws l on l.slug = a.law_slug

union all

select
  'principle'::text     as entity_type,
  p.id::text            as entity_id,
  jc.title              as parent_title,
  'مبدأ رقم ' || coalesce(p.principle_number, '') as title,
  left(p.text, 500)     as snippet,
  p.fts                 as fts,
  p.created_at          as created_at
from library.principles p
join library.judicial_collections jc on jc.id = p.collection_id

union all

select
  'decree'::text        as entity_type,
  dc.id::text           as entity_id,
  null                  as parent_title,
  dc.title              as title,
  left(dc.summary, 500) as snippet,
  dc.fts                as fts,
  dc.created_at         as created_at
from library.decrees_circulars dc

union all

select
  'feqh_block'::text    as entity_type,
  fb.id::text           as entity_id,
  bk.title              as parent_title,
  fb.topic              as title,
  left(fb.matn, 500)    as snippet,
  fb.fts                as fts,
  fb.created_at         as created_at
from library.feqh_blocks fb
join library.feqh_sections fs on fs.id = fb.section_id
join library.feqh_chapters fc on fc.id = fs.chapter_id
join library.feqh_books bk   on bk.id = fc.book_id
with no data;  -- populate on first refresh

-- Unique index required for CONCURRENTLY refresh
create unique index if not exists idx_cross_section_search_pk
  on library.cross_section_search (entity_type, entity_id);

create index if not exists idx_cross_section_search_fts
  on library.cross_section_search using gin (fts);

comment on materialized view library.cross_section_search
  is 'Unified search index across articles, principles, decrees, and fiqh blocks. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY library.cross_section_search;';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  6. ROW LEVEL SECURITY                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ---------------------------------------------------------------------------
-- 6a. Enable RLS on ALL tables
-- ---------------------------------------------------------------------------
alter table library.laws                  enable row level security;
alter table library.chapters              enable row level security;
alter table library.articles              enable row level security;
alter table library.article_amendments    enable row level security;
alter table library.decrees_circulars     enable row level security;
alter table library.decree_pages          enable row level security;
alter table library.judicial_collections  enable row level security;
alter table library.principles            enable row level security;
alter table library.principle_paragraphs  enable row level security;
alter table library.feqh_books            enable row level security;
alter table library.feqh_chapters         enable row level security;
alter table library.feqh_sections         enable row level security;
alter table library.feqh_blocks           enable row level security;
alter table library.smart_folders         enable row level security;
alter table library.smart_folder_items    enable row level security;
alter table library.invitations           enable row level security;
alter table library.issue_reports         enable row level security;

-- ---------------------------------------------------------------------------
-- 6b. PUBLIC READ — content tables (anon + authenticated can SELECT)
-- ---------------------------------------------------------------------------
-- Macro: create read policies for all content tables

do $$
declare
  _tbl text;
begin
  foreach _tbl in array array[
    'library.laws',
    'library.chapters',
    'library.articles',
    'library.article_amendments',
    'library.decrees_circulars',
    'library.decree_pages',
    'library.judicial_collections',
    'library.principles',
    'library.principle_paragraphs',
    'library.feqh_books',
    'library.feqh_chapters',
    'library.feqh_sections',
    'library.feqh_blocks',
    'library.invitations'
  ]
  loop
    execute format(
      'create policy "Allow public read on %1$s" on %1$s for select to anon, authenticated using (true)',
      _tbl
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6c. SMART FOLDERS — owner-only CRUD
-- ---------------------------------------------------------------------------

-- Select: users see only their own folders
create policy "Users can view own folders"
  on library.smart_folders for select
  to authenticated
  using (user_id = auth.uid());

-- Insert: users can create folders for themselves
create policy "Users can create own folders"
  on library.smart_folders for insert
  to authenticated
  with check (user_id = auth.uid());

-- Update: users can update their own folders
create policy "Users can update own folders"
  on library.smart_folders for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Delete: users can delete their own folders
create policy "Users can delete own folders"
  on library.smart_folders for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6d. SMART FOLDER ITEMS — access via folder ownership
-- ---------------------------------------------------------------------------

create policy "Users can view own folder items"
  on library.smart_folder_items for select
  to authenticated
  using (
    folder_id in (
      select id from library.smart_folders where user_id = auth.uid()
    )
  );

create policy "Users can add to own folders"
  on library.smart_folder_items for insert
  to authenticated
  with check (
    folder_id in (
      select id from library.smart_folders where user_id = auth.uid()
    )
  );

create policy "Users can remove from own folders"
  on library.smart_folder_items for delete
  to authenticated
  using (
    folder_id in (
      select id from library.smart_folders where user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6e. ISSUE REPORTS — authenticated users can create and view own
-- ---------------------------------------------------------------------------

create policy "Users can view own issue reports"
  on library.issue_reports for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create issue reports"
  on library.issue_reports for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own issue reports"
  on library.issue_reports for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  7. GRANT USAGE ON SCHEMA                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

grant usage on schema library to anon, authenticated, service_role;
grant select on all tables in schema library to anon, authenticated;
grant all on all tables in schema library to service_role;
grant all on all sequences in schema library to service_role;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  8. HELPER FUNCTION: Refresh cross-section search                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create or replace function library.refresh_cross_section_search()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently library.cross_section_search;
end;
$$;

comment on function library.refresh_cross_section_search()
  is 'Refreshes the cross-section search materialized view. Call after bulk data loads or on a scheduled cron.';

-- Grant execute to service_role for cron jobs
grant execute on function library.refresh_cross_section_search() to service_role;


commit;
