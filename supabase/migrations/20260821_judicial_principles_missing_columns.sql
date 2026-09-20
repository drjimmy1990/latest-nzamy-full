-- =============================================================================
-- Judicial collections/principles: restore fields the seeder was dropping
-- =============================================================================
-- Created:  2026-08-21
-- Purpose:  scripts/seed-library.ts already reads these values off the parsed
--           collection/principle/precedent objects (parse-precedents.ts), but
--           had nowhere to write them — no column existed, so the seeder
--           silently discarded coll.metadata, coll.series_id, and every
--           principle's classification_keywords/hashtags/is_redacted/metadata.
--           Documented in 00_عقل_القوانين/06_التدقيق_والجودة/
--           سجل_المشاكل_والأخطاء_التفصيلي.md as a "ب-88 sibling" finding.
--
-- SAFETY
--   Additive only: nullable/defaulted columns, no existing row changes value,
--   no backfill required.
-- =============================================================================

begin;

alter table library.judicial_collections
  add column if not exists series_id varchar(150),
  add column if not exists metadata  jsonb default '{}'::jsonb;

comment on column library.judicial_collections.series_id is
  'Grouping/display label shared by every volume of one multi-part work (e.g. all موج-rulings-1434 volumes) — display only, never the row identity.';
comment on column library.judicial_collections.metadata is
  'Full source frontmatter as parsed (parse-precedents.ts coll.metadata) — was parsed but had no column to land in.';

alter table library.principles
  add column if not exists classification_keywords text[]  default '{}',
  add column if not exists hashtags               text[]  default '{}',
  add column if not exists is_redacted             boolean not null default false,
  add column if not exists metadata                jsonb   default '{}'::jsonb;

comment on column library.principles.classification_keywords is
  'Bracketed classification tags extracted from principle body text (parse-precedents.ts parsePrincipleCollection) — was parsed but had no column to land in.';
comment on column library.principles.hashtags is
  'meta.hashtags or #hashtag patterns in the ruling body (parse-precedents.ts parseCourtPrecedent) — was parsed but had no column to land in.';
comment on column library.principles.is_redacted is
  'meta.is_redacted/isRedacted from source frontmatter — was parsed but had no column to land in. Defaults false: no source file has set this yet.';
comment on column library.principles.metadata is
  'Full source frontmatter as parsed — was parsed but had no column to land in.';

commit;
