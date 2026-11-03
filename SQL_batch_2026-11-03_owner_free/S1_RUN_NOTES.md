# S1 (library) run notes

<!-- >>> S1 Task 13: 20261103_14 (STOP-POINT) -->

## AFTER the deploy, at a quiet hour: `20261103_14_library_fts_tashkeel_fold.sql` (STOP-POINT)

**What it does:** a text stored with tashkeel (for example «القَرَارُ») could not be found by a search typed without it («القرار»). This file rebuilds the search index of three tables without tashkeel:
- `library.articles`
- `library.principles`
- `library.feqh_blocks`

No row is added, changed or deleted, and no grant changes.

**Why AFTER the deploy:** the new search code, already in this deploy, sends every word twice, once as typed and once without tashkeel. It works before this file and after it. The old code sends only the typed form. If this file ran first, a search typed with tashkeel would find nothing until the deploy.

**Why at a quiet hour:** it rewrites the three tables under an ACCESS EXCLUSIVE lock, held until the end of the file. While it runs, every library search, law reader, principle reader and fiqh reader waits. The search functions stop after 4 s, so a search made in that window shows an error; a reload after the file finishes works. Do not run it while the owner's loader is running.

**Expected lock duration:**
- Measured on local Docker (postgres 16): **47 seconds** from `begin` to `commit`.
  - The test data was 93,494 articles (122 MB), 25,000 principles (57 MB) and 40,000 fiqh blocks (57 MB), all with tashkeel.
  - The `analyze` after the commit took under 0.2 s and does not block.
- The time grows with the table sizes that Step 1 prints, roughly 47 s per 240 MB in total.
- Plan for **1–2 minutes** of library downtime on the server.

The file is in two places:
- On your PC, after `git pull` on main: `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_14_library_fts_tashkeel_fold.sql`
- On the server: `/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_14_library_fts_tashkeel_fold.sql`

### Step 1: counts BEFORE (SQL Editor as postgres, or the server's psql)

Copy the numbers somewhere. The result appears on the screen; it is not a file.

```sql
select (select count(*) from library.articles)    as articles,
       (select count(*) from library.principles)  as principles,
       (select count(*) from library.feqh_blocks) as feqh_blocks,
       pg_size_pretty(pg_total_relation_size('library.articles'))    as articles_size,
       pg_size_pretty(pg_total_relation_size('library.principles'))  as principles_size,
       pg_size_pretty(pg_total_relation_size('library.feqh_blocks')) as feqh_size,
       (select count(*) from library.articles   where fts @@ to_tsquery('simple', '''القرار''')) as articles_alqarar,
       (select count(*) from library.principles where fts @@ to_tsquery('simple', '''القرار''')) as principles_alqarar,
       (select pg_get_userbyid(relowner) from pg_class where oid = 'library.articles'::regclass) as tables_owner,
       (select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('library.cross_section_search')) as matview_owner;
```

- Expect `tables_owner = postgres` and `matview_owner = postgres`.
  - If `matview_owner` is another role (for example `supabase_admin`), leave `-c "set role postgres"` out of the Step 2 command. The file gives the matview its old owner back either way.
  - If `tables_owner` is not `postgres`, stop and send us the row.
- The two `_alqarar` columns count the rows that the stripped word «القرار» finds today.

### Step 2: run the file (server terminal, recommended)

It prints its NOTICEs and has no editor timeout:

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "set role postgres" -f - < supabase/migrations/20261103_14_library_fts_tashkeel_fold.sql
```

`set role postgres` makes the new function and the recreated matview belong to `postgres`, like the tables.

**Expected output on the screen:**
- three lines `NOTICE:  20261103_14: library.<table>.fts rebuilt with fold_tashkeel (statistics target 1000)`;
- `COMMIT`, three `ANALYZE`, `NOTIFY`;
- a last result `ok = t`.

A second run prints `already folds tashkeel — skipped` three times and rewrites nothing.

**The other way:** in the Supabase dashboard, open SQL Editor as postgres and paste the whole file. The editor hides the NOTICEs and shows only the last result, `ok = t`. If the editor reports a timeout, use the terminal command above. The file runs in one transaction, so a timeout changes nothing.

**If it stops:**
- `canceling statement due to lock timeout`: a long query held one of the tables for more than 5 s, and **nothing changed**. Wait a minute and run it again.
- `unexpected dependents on the fts columns`: something new reads those columns, and nothing changed. Stop and send us the whole message.
- Any other `ERROR`: nothing changed. Stop and send us the message.

### Step 3: counts AFTER

Run the Step 1 SELECT again and compare the two sets of numbers.
- `articles`, `principles` and `feqh_blocks` must be **exactly the same** as before.
- `articles_alqarar` and `principles_alqarar` must be **the same or higher**. The difference is the rows stored with tashkeel, which the plain word now finds.
- `matview_owner` must be the same as before.

### Step 4: `_verify.sql` by hand (server; deploy.sh does not run it)

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261103_14|ERROR"
```

- Expect `_verify: 20261103_14 OK — articles, principles and fiqh blocks index text without tashkeel; …` on the screen, and no `ERROR`.
- Before this file runs, the same line reads `_verify: 20261103_14 not applied yet …`. That is a NOTICE, not an error.

### Step 5 (optional): refill the cross-section matview

The file recreates `library.cross_section_search` empty, because it selects the rebuilt columns. Nothing in the app reads it. If you want it filled:

```sql
refresh materialized view library.cross_section_search;
```

- Use the plain form, not `CONCURRENTLY`: the concurrent form cannot run on an empty matview, and `library.refresh_cross_section_search()` uses it.
- It locks only the matview.

### Rollback (only if needed)

The query side needs no change in either direction. To undo:
1. Re-run the `fts` blocks of:
   - `20260729_article_history_columns.sql` (articles and the matview);
   - `20260823_fts_number_search.sql` (principles);
   - the `feqh_blocks` fts of `20260626_legal_library_schema.sql`.
2. Run `20261017_21_library_fts_statistics.sql`.
3. Run `drop function library.fold_tashkeel(text);`.

Rolling back takes the same lock for the same time.

<!-- <<< S1 Task 13: 20261103_14 -->
