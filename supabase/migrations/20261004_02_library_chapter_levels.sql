-- =============================================================================
-- Migration: 20261004_02_library_chapter_levels.sql
-- =============================================================================
-- PURPOSE
--   Two-level chapters (owner decision 2026-10-04, «الفصول بمستويين معتمد»).
--   A law's chapters were one flat list, so «الباب الأول» › «الفصل الأول» or
--   «الفصل» › «الفرع» could not be represented (the library holds 244 headings
--   waiting on this). The library marks the level on the CHAPTER_START marker;
--   scripts/parsers/parse-laws.ts reads it and links each level-2 chapter to
--   the level-1 chapter before it; scripts/seed-library.ts writes the two
--   columns below.
--
-- WHAT IT DOES (additive and idempotent — safe to run any number of times)
--   1. library.chapters.level smallint NOT NULL DEFAULT 1, with
--      CHECK (level in (1, 2)) — constraint chapters_level_check.
--   2. library.chapters.parent_chapter_id uuid NULL, FOREIGN KEY → chapters(id)
--      ON DELETE SET NULL (chapters_parent_chapter_id_fkey; id is uuid in
--      20260626_legal_library_schema.sql and in the self-hosted dump).
--      Deleting a level-1 chapter leaves its level-2 chapters in place, as
--      roots — never deletes text.
--   3. CHECK chapters_parent_shape_check: only a level-2 chapter may have a
--      parent, and never itself. (Same-law parentage is the seeder's job:
--      it only ever links inside one law.)
--   4. Indexes, if missing: (law_slug, order_index) and
--      (parent_chapter_id, order_index).
--   5. Grants kept as chapters is granted today: anon/authenticated read it
--      through a TABLE-level SELECT (01-schema.sql, 20260922_01 §3), which
--      covers new columns by itself. The two columns are also granted
--      explicitly at column level, so they stay readable if a later migration
--      moves chapters to column-level grants (as 20261004_01 did for laws).
--      service_role keeps ALL (the seeders write with it).
--   6. Verify block — RAISES (the transaction rolls back) unless every item
--      above holds; success prints «20261004_02 verify: OK».
--   7. notify pgrst to reload its schema cache.
--
-- OLD READERS KEEP WORKING
--   Every existing row reads level = 1 and parent_chapter_id = NULL — exactly
--   today's flat list. The law-detail route selects chapters with `*` and maps
--   only the fields it knows, so it is unaffected; the reader treats a chapter
--   without level / parent as flat (src/app/laws/[slug]/_chapter-tree.ts).
--
-- RUN ORDER
--   1. This migration — BEFORE any seed that writes `level` /
--      `parent_chapter_id`. scripts/seed-library.ts now always sends both, and
--      without these columns every chapter upsert fails (unknown column);
--      scripts/seed-library-from-owner.mjs passes them through when the
--      owner's JSONL carries them.
--   2. Then the code deploy and/or the re-seed, in any order: the code reads
--      the columns only when present.
--
-- PREREQUISITES
--   20260626_legal_library_schema.sql (library.chapters), applied everywhere.
--
-- ROLLBACK (drops the hierarchy; chapters and articles stay)
--   begin;
--     alter table library.chapters drop constraint if exists chapters_parent_shape_check;
--     alter table library.chapters drop column if exists parent_chapter_id;
--     alter table library.chapters drop constraint if exists chapters_level_check;
--     alter table library.chapters drop column if exists level;
--     drop index if exists library.idx_chapters_law_slug_order_index;
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 1. level ─────────────────────────────────────────────────────────────────
alter table library.chapters
  add column if not exists level smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'library.chapters'::regclass
       and conname = 'chapters_level_check'
  ) then
    alter table library.chapters
      add constraint chapters_level_check check (level in (1, 2));
  end if;
end $$;

comment on column library.chapters.level is
  'Heading depth: 1 = top-level chapter («الباب» / «الفصل»), 2 = a chapter under the level-1 chapter before it («الفصل» / «الفرع»). Default 1 = the flat list every reader already knows. Added by 20261004_02.';

-- ── 2. parent_chapter_id ─────────────────────────────────────────────────────
alter table library.chapters
  add column if not exists parent_chapter_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'library.chapters'::regclass
       and conname = 'chapters_parent_chapter_id_fkey'
  ) then
    alter table library.chapters
      add constraint chapters_parent_chapter_id_fkey
      foreign key (parent_chapter_id) references library.chapters(id) on delete set null;
  end if;
end $$;

comment on column library.chapters.parent_chapter_id is
  'For a level-2 chapter: the level-1 chapter of the same law it sits under. NULL for level 1, and for a level-2 chapter whose heading could not be established (shown as a top-level chapter, never guessed). Added by 20261004_02.';

-- ── 3. Shape: only level 2 has a parent, never itself ────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'library.chapters'::regclass
       and conname = 'chapters_parent_shape_check'
  ) then
    alter table library.chapters
      add constraint chapters_parent_shape_check check (
        parent_chapter_id is null
        or (level = 2 and parent_chapter_id <> id)
      );
  end if;
end $$;

-- ── 4. Indexes ───────────────────────────────────────────────────────────────
create index if not exists idx_chapters_law_slug_order_index
  on library.chapters (law_slug, order_index);
create index if not exists idx_chapters_parent_order_index
  on library.chapters (parent_chapter_id, order_index);

-- ── 5. Grants (consistent with today's public chapters) ──────────────────────
grant select (level, parent_chapter_id) on library.chapters to anon, authenticated;
grant all on library.chapters to service_role;

-- ── 6. Verify ────────────────────────────────────────────────────────────────
do $$
declare
  missing text := '';
  r       text;
  col     record;
begin
  select a.attnotnull, format_type(a.atttypid, a.atttypmod) as typ,
         pg_get_expr(d.adbin, d.adrelid) as def
    into col
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'library.chapters'::regclass and a.attname = 'level' and not a.attisdropped;
  if not found then
    missing := missing || ' column level is missing;';
  elsif col.typ <> 'smallint' or not col.attnotnull or coalesce(col.def, '') <> '1' then
    missing := missing || format(' column level is %s not-null=%s default=%s (want smallint not null default 1);',
                                 col.typ, col.attnotnull, coalesce(col.def, 'none'));
  end if;

  select a.attnotnull, format_type(a.atttypid, a.atttypmod) as typ, null::text as def
    into col
    from pg_attribute a
   where a.attrelid = 'library.chapters'::regclass and a.attname = 'parent_chapter_id' and not a.attisdropped;
  if not found then
    missing := missing || ' column parent_chapter_id is missing;';
  elsif col.typ <> 'uuid' or col.attnotnull then
    missing := missing || format(' column parent_chapter_id is %s not-null=%s (want nullable uuid);', col.typ, col.attnotnull);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'library.chapters'::regclass and conname = 'chapters_level_check' and contype = 'c'
  ) then
    missing := missing || ' chapters_level_check is missing;';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'library.chapters'::regclass and conname = 'chapters_parent_shape_check' and contype = 'c'
  ) then
    missing := missing || ' chapters_parent_shape_check is missing;';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'library.chapters'::regclass
       and conname = 'chapters_parent_chapter_id_fkey'
       and contype = 'f'
       and confrelid = 'library.chapters'::regclass
       and confdeltype = 'n'   -- ON DELETE SET NULL
  ) then
    missing := missing || ' chapters_parent_chapter_id_fkey (→ chapters.id on delete set null) is missing;';
  end if;

  if to_regclass('library.idx_chapters_law_slug_order_index') is null then
    missing := missing || ' index idx_chapters_law_slug_order_index is missing;';
  end if;
  if to_regclass('library.idx_chapters_parent_order_index') is null then
    missing := missing || ' index idx_chapters_parent_order_index is missing;';
  end if;

  foreach r in array array['anon', 'authenticated']
  loop
    if not has_column_privilege(r, 'library.chapters', 'level', 'SELECT')
       or not has_column_privilege(r, 'library.chapters', 'parent_chapter_id', 'SELECT') then
      missing := missing || format(' %s cannot SELECT the new columns;', r);
    end if;
    if not has_column_privilege(r, 'library.chapters', 'title', 'SELECT') then
      missing := missing || format(' %s lost SELECT on chapters.title;', r);
    end if;
    if has_table_privilege(r, 'library.chapters', 'INSERT') or has_table_privilege(r, 'library.chapters', 'UPDATE')
       or has_table_privilege(r, 'library.chapters', 'DELETE') then
      missing := missing || format(' %s can write library.chapters;', r);
    end if;
  end loop;

  if not has_table_privilege('service_role', 'library.chapters', 'SELECT')
     or not has_table_privilege('service_role', 'library.chapters', 'INSERT')
     or not has_table_privilege('service_role', 'library.chapters', 'UPDATE') then
    missing := missing || ' service_role lacks read/write on library.chapters;';
  end if;

  if exists (select 1 from library.chapters where level not in (1, 2)) then
    missing := missing || ' a chapter row has a level outside 1..2;';
  end if;

  if missing <> '' then
    raise exception '20261004_02 verify:%', missing;
  end if;

  raise notice '20261004_02 verify: OK — library.chapters has level (smallint, default 1, 1..2) and parent_chapter_id (uuid → chapters.id on delete set null), both indexes, and anon/authenticated can read both columns';
end $$;

commit;

-- ── 7. PostgREST schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- Read-only re-check after applying (SQL Editor):
--   select level, count(*), count(parent_chapter_id) as with_parent
--     from library.chapters group by level order by level;
