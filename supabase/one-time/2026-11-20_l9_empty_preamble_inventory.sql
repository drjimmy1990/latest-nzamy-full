-- =============================================================================
-- 2026-11-20_l9_empty_preamble_inventory.sql — READ-ONLY (batch l9-reader)
-- -----------------------------------------------------------------------------
-- PURPOSE  Owner file 16 §5 (19 Nov): «جرد بكل الأنظمة التي ديباجتها فارغة وقد
--          ظهر لها القسم، وإرسال القائمة للمالك». The reader now hides such a
--          section (src/app/laws/[slug]/_preamble.ts). This lists the
--          documents whose stored preamble holds no prose: only headings
--          (# …, up to 200 characters), rules (***, ---), <details>/<summary>
--          wrappers, «>» quote marks and the «لم تتوفر ديباجة / لا توجد ديباجة»
--          placeholder — the same rule as lawPreambleBlocks.ts
--          isHollowPreamble, approximated line by line in SQL. The reader's
--          rule (TypeScript) is the authority; this list is for the owner.
--          It changes nothing: one SELECT.
--
-- HOW TO RUN (CSV to the screen; redirect to a file to send it):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres --csv \
--     < supabase/one-time/2026-11-20_l9_empty_preamble_inventory.sql
-- =============================================================================

with lines as (
  select l.slug, l.title, l.type,
         btrim(regexp_replace(x.line, '^\s*(>\s?)+', '')) as line
    from library.laws l
    cross join lateral regexp_split_to_table(
      regexp_replace(coalesce(l.preamble, ''), '(<details[^>]*>|</details\s*>|<summary[^>]*>.*?</summary\s*>)', E'\n\\1\n', 'gi'),
      E'\r?\n'
    ) as x(line)
),
prose as (
  select slug, count(*) filter (
           where line <> ''
             and line !~ '^#{1,6}\s'                                   -- a heading line
             and line !~ '^(\*{3,}|-{3,}|_{3,})$'                      -- a rule
             and line !~* '^</?details[^>]*>$'                         -- a toggle wrapper
             and line !~* '^<summary[^>]*>.*</summary\s*>$'           -- a toggle title
             and line !~ '^(لم تتوفر ديباجة|لا توجد ديباجة)[^،]*$'     -- the placeholder alone
         ) as prose_lines,
         count(*) filter (where line ~ '^#{1,6}\s' and char_length(line) > 200) as long_headings
    from lines
   group by slug
)
select l.slug, l.title, l.type,
       case when coalesce(btrim(l.preamble), '') = '' then 'no preamble stored'
            else 'headings / empty toggles only' end as what
  from library.laws l
  join prose p on p.slug = l.slug
 where p.prose_lines = 0
   and p.long_headings = 0
 order by l.type, l.title;
