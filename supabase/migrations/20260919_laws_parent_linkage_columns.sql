-- Legal-library parent linkage. Source of truth: Markdown frontmatter and
-- INSTRUMENTS_REGISTRY.json. This migration changes no legal content.
BEGIN;

ALTER TABLE library.laws
  ADD COLUMN IF NOT EXISTS instrument_id   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS parent_law_id   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS parent_law      TEXT,
  ADD COLUMN IF NOT EXISTS enabling_article TEXT;

COMMENT ON COLUMN library.laws.instrument_id IS
  'Stable INSTRUMENTS_REGISTRY instrument_id. Distinct from the official BOE law_guid.';
COMMENT ON COLUMN library.laws.parent_law_id IS
  'Registry instrument_id of the system/decision implemented by this independent secondary instrument.';
COMMENT ON COLUMN library.laws.parent_law IS
  'Verbatim parent instrument name as stated by the child instrument; display text and non-link fallback.';
COMMENT ON COLUMN library.laws.enabling_article IS
  'Verbatim enabling article/clause stated by the child instrument; NULL when not expressly stated.';

-- A registry identity must resolve to at most one seeded law. NULL remains
-- valid for source files that have no verified registry identity.
CREATE UNIQUE INDEX IF NOT EXISTS laws_instrument_id_unique_idx
  ON library.laws (instrument_id)
  WHERE instrument_id IS NOT NULL AND btrim(instrument_id) <> '';

CREATE INDEX IF NOT EXISTS laws_parent_law_id_idx
  ON library.laws (parent_law_id)
  WHERE parent_law_id IS NOT NULL AND btrim(parent_law_id) <> '';

COMMIT;
