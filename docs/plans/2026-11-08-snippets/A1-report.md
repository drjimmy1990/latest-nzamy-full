# A1 — close the anon-key read of tier-masked library columns (batch 2026-11-08)

Branch `t/sec`, worktree `D:\nzwt\b1108-sec`. Migration `supabase/migrations/20261108_10_library_decree_tier_columns_lock.sql`.

## Result in one paragraph

The only library columns that a route masks per viewer tier AND that the public anon key could still read are on
`library.decrees_circulars`: `ref`, `date`, `official_url` (masked by `maskDecreeOfficialFields`), `summary` and
`summary_brief` (put through `summaryForViewer` for non-subscribers), plus `fts`. `fts` is the generated tsvector over
title + summary + summary_brief, so it holds the masked numbers and dates as positioned lexemes and `select=fts` rebuilds
them. This is the same reason 20261016_01 locked `principles.fts`. 20261019_40 had granted all six to anon/authenticated.
Every request-client read of them now goes through the service role, with the per-tier masking left exactly as it was.
Migration 20261108_10 narrows the decree allow-list to 9 catalogue columns. Every other masked field was already locked
(table below). One borderline column, `laws.description`, is left as an open ruling.

## 1. Inventory — masked field → column → anon state

| Masked / stripped by | table.column | anon / authenticated before | after 20261108_10 |
|---|---|---|---|
| `maskDecreeOfficialFields` (decree route, init, search) | `decrees_circulars.ref`, `.date`, `.official_url` | **granted** (20261019_40 allow-list) | **locked** |
| `summaryForViewer` (decree route, init, search snippet) | `decrees_circulars.summary`, `.summary_brief` | **granted** (20261019_40) | **locked** |
| derived from the above | `decrees_circulars.fts` = `to_tsvector(title ‖ summary ‖ summary_brief)` (20260626:215; 20260823 would add `ref` but is unapplied; 20261103_14 does not touch it) | **granted** | **locked** |
| `maskOfficialDates` (monitor, orders feed) | `decrees_circulars.date` | granted (read + filtered via request client) | locked; read via service role |
| preamble lock (decree route) | `decrees_circulars.preamble` | locked 20261019_40 | locked |
| `freeDecreePages` | `decree_pages.content` | locked 20261018_02 | unchanged |
| `maskListOfficialFields`, `lawOfficialMeta`, `lawOfficialLinks` | `laws.issuing_instrument`, `issue_date_hijri`, `boe_source_url`, `official_source_url`, `gazette_*`, `preamble`, `law_guid`, `publication_date_*` | locked 20261004_01 (allow-list) | unchanged |
| `summaryForViewer` (init laws), `cardForViewer` / `lawReaderExtras` (lawSummaryVisibility) | `laws.summary_brief` (20261025_20), source `laws.preamble` | no grant (added after the column lock → locked by default) | unchanged |
| `latestLegislativeEvent` (JSON-path alias) | `laws.latest_update`, `catalogue_recency_key`, `catalogue_is_repealed` | locked | unchanged |
| `mergedNamesForViewer` | `laws.merged_regulation_names` (20261107_10) | no grant (20261107_10 grants nothing to API roles) | unchanged |
| `regulationRefForViewer`, `regulationHeadingForViewer` | `article_regulations.ref`, `articles.executive_reg_ref`, article text | tables server-only since 20260929_01; no later migration grants them | unchanged |
| precedents paywall (`stripFields(["text"])`) | `principles.text/ruling_basis/facts/reasons/ruling/fts`, `principle_paragraphs` | locked 20261016_01 | unchanged |
| books paywall | `feqh_blocks.matn/sharh/hashiyah/fts` | locked 20261018_02 | unchanged |
| internal notes | `judicial_collections.metadata`, `principles.metadata` | locked 20261004_01 | unchanged |
| views / matview | `v_laws_enactment_status`, `cross_section_search` | closed (20261004_01, 20260922_04/20260929_01) | unchanged |
| RPCs | `search_*_relevance`, `search_scoped_page`, `search_title_suggestions`, `search_feqh_page` | EXECUTE service_role only. `refresh_cross_section_search` is SECURITY DEFINER but returns void | unchanged |
| **open ruling**: `summaryForViewer` on the search snippet; `stripFields(["description"])` on locked init cards | `laws.description` (+ `laws.fts` = title + description) | **granted** (20261004_01 allow-list) | **not changed** (see Open rulings) |
| not masked by any route | `decrees_circulars.title`, `.hashtags` | granted | granted. The title is public by owner decision (the decree route says "The title is unchanged"), even though a title can name the instrument number |

`libraryMetadata.ts` and `seo.ts` call `summaryForViewer(…, false)` on reads that `libraryDocumentSeo` makes with the
service role, so they already behave correctly. Other library tables that still have table-level grants (`chapters`,
`feqh_books`, `feqh_chapters`, `feqh_sections`, `smart_folders*`, `issue_reports`) have no per-tier masking, so they are
out of scope.

## 2. Readers of the newly locked columns

| Reader | Client before | Now |
|---|---|---|
| `src/app/api/library/decrees/[id]/route.ts`, `DECREE_COLUMNS` header read | request | **service** (`serverOnly` hoisted; `supabase` kept for `auth.getUser()`) |
| `src/app/api/library/init/route.ts`, decrees `fetchSection(DECREE_LIST_COLUMNS)` (ref, date, summary, summary_brief) | request | **service** (`serverOnly` passed) |
| `src/app/api/library/search/route.ts`, `orderQuery` (the fallback when `search_decrees_relevance` is missing, plus its head count) | request | **service** (the relevance window was already service) |
| `src/app/api/library/autocomplete/route.ts`, `count('decrees_circulars')` and the top-decrees query (fts) | request | **service**; the unused `ref` dropped from the select |
| `src/app/api/library/monitor/route.ts`, orders feed (`date` select + `.or(date.like…)`) | request | **service** |
| `src/lib/library/libraryStats.ts` (counts `id`), `src/app/api/library/folders/titles/route.ts` (`id, title`) | request | unchanged (allowed columns) |
| admin library route, `library-sitemaps/sitemap.ts`, `libraryDocumentSeo.ts` | service | unchanged |
| `src/lib/supabaseLibrary.ts:841` | (dead code; selects columns that don't exist) | unchanged; excluded from the scanners, as before |
| browser side: `folderLibrarySearch.ts`, `library-item-access.ts`, `LegalLibraryBanner.tsx` | go through `/api/library/*`; no direct `@/lib/supabase/client` library reads | unchanged |
| n8n in-repo (`n8n/ai/*.json`, `n8n/ai/workflows.mjs`, `n8n/workflows/*.json`) | none REST-read the library; the app retrieves and sends the texts | — |
| scripts: `verify-library.ts` (anon key, counts `id`); `check-counts.mjs`, `library-rows-diff.mjs`, loader (service key) | — | unaffected |

**Not checked (outside the repo):** the live n8n instance (n8n.asra3.com) and the owner's library agent or ad-hoc
scripts. Anything there that reads `decrees_circulars` with the anon key and names ref, date, official_url, summary,
summary_brief or fts (or `select=*`, or a filter or search on them) will get 42501 after the SQL. The migration header
says so.

Behaviour: identical for subscribers and guests. The same rows come back, because the read policy is `using (true)`, and
the same masking runs after the read. One difference: the service role has no `statement_timeout`. The decree table is
about 3.3k rows, and every moved read carries the route's `abortSignal` (search and autocomplete) or is a primary-key or
bounded read (decree page `eq id`, init `range`, monitor `limit 1000`).

## 3. Files

- `src/app/api/library/decrees/[id]/route.ts`, `init/route.ts`, `search/route.ts`, `autocomplete/route.ts`, `monitor/route.ts`: client switch plus comments (byte-level CRLF edits; the diff shows only real lines).
- `supabase/migrations/20261108_10_library_decree_tier_columns_lock.sql`: new.
- `supabase/migrations/20261019_40_library_decree_preamble_lock.sql`: **header comment only**. Adds a "NOT AFTER 20261108_10" note, because re-running it re-grants ref, date and the rest.
- `supabase/tests/rls/library_tier_columns_1108.test.sql`: new RLS harness test.
- `src/app/api/library/library-decree-tier-lock.test.ts`: new source-contract test.
- `src/app/api/library/library-column-lock.test.ts`: decree allow-list in force now parsed from 20261108_10; `ALLOWED_1019` kept for 20261019_40's own `_verify`/harness parity; pins moved to the service client; scanner fixture updated.
- `src/app/api/library/search/articles-server-only.test.ts`, `src/app/api/library/init/catalogue-order-277.test.ts`: pins updated to the service client.
- `docs/plans/2026-11-08-snippets/A1-verify.sql`: verify block.

## 4. Tests

- `npm run -s test:unit`: 6306 tests, 6300 pass, **6 fail = the known baseline 6** (grantPurchase, review 2026-10-26 v1 fallback, volume series T28-24, end read ends_at, insert/revoke maker rule, lawyer dashboard consultant). None are new.
- `npx tsc --noEmit -p .`: clean (exit 0, no output).
- RLS harness, Docker postgres:16, run from the repo root with the exact command in the header of `supabase/tests/rls/library_tier_columns_1108.test.sql`. The chain is the library chain → 20261018_02 → 20261019_40 → 1108 ×2 → 20261019_40 (re-open) → 1108 → 20260922_01 (re-open) → 20261018_02 → 1108. Result: **T1–T5 PASS**, and every run of the migration printed `20261108_10 verify: OK`.
- Negative control (same chain without the four 1108 files): `T1 FAIL: anon can read locked column decrees_circulars.ref` (exit 3).
- Verify snippet, run in the harness before and after the migration. Before: NOTICE "not applied yet", and the SELECT shows ok = f for the six new columns. After: all 18 rows ok = t, plus NOTICE OK.

## 5. Impact analysis (GitNexus)

`impact` on `latest-nzamy-full` returned "Target not found" for the route `GET` handlers and for the route file paths, so
the index does not resolve these Next route files. **Risk assessed by hand: LOW.** The handlers are entry points with no
in-code callers; the change only swaps the client a query runs on; response shapes and masking are unchanged. The tests
above pin both.

## 6. SQL run order (for the controller / user)

1. **Deploy this commit first.** The new code works the same before and after the SQL.
2. Then apply `supabase/migrations/20261108_10_library_decree_tier_columns_lock.sql` as postgres (SQL Editor or `docker exec supabase-db psql`). The last statement returns 32 rows; every row must say `ok = t`.
3. Then `_verify.sql`, but **only after the controller applies the patch below**.

### REQUIRED controller edit to `supabase/migrations/_verify.sql` (I may not edit it)

The existing `2026-10-19 — 20261019_40` block still holds the old 15-column list. After 20261108_10 it will
`RAISE EXCEPTION '_verify: the decree preamble lock is broken — anon cannot read public column … ref …'`. In that block,
right after the existing `IF … NOT ILIKE '%preamble server-only since 20261019_40%' THEN … RETURN; END IF;`, insert:

```sql
  IF coalesce(obj_description('library.decrees_circulars'::regclass, 'pg_class'), '')
       ILIKE '%tier columns server-only since 20261108_10%' THEN
    RAISE NOTICE '_verify: 20261019_40 — superseded by 20261108_10 (narrower decree allow-list); checked in verify:library_tier_columns_1108';
    RETURN;
  END IF;
```

Then append `docs/plans/2026-11-08-snippets/A1-verify.sql` (block `verify:library_tier_columns_1108`). The parity checks
in `library-column-lock.test.ts` for the 19_40 block still pass with this insert (they match the list, the marker
`ILIKE`, and the "not applied yet" NOTICE). Re-run that test after the edit. The historical copy of the same block in
`SQL_batch_2026-10-22_payments_b1/07_AFTER_ALL_verify.sql` would also raise if anyone re-runs that old batch file.

## 7. Prod grant state, before and after (read-only)

```
docker exec supabase-db psql -U postgres -d postgres -c "select 'table' as level, table_name, null::text as column_name, grantee, privilege_type from information_schema.table_privileges where table_schema = 'library' and grantee in ('anon','authenticated') and privilege_type = 'SELECT' union all select 'column', table_name, column_name, grantee, privilege_type from information_schema.column_privileges where table_schema = 'library' and grantee in ('anon','authenticated') and privilege_type = 'SELECT' order by 2, 1 desc, 3, 4;"
```

(`column_privileges` also lists the columns of tables that have a table-level grant; the `table` rows tell the two apart.)
After 20261108_10, the `decrees_circulars` rows must be exactly the 9 columns id, title, type, issuer, category, hashtags,
created_at, updated_at, instrument_ar, for each of anon and authenticated, and there must be no `table` row for
`decrees_circulars`.

## 8. Open rulings / questions

1. **`laws.description` (+ `laws.fts`)**: still anon-readable. The search snippet runs it through `summaryForViewer`, and
   init nulls it on locked cards. But the law page sends it unmasked to every viewer as `notice` when the law has no
   articles, and its content is the parser's "official text unpublished" notice or the law's title. Locking it forces
   locking `laws.fts`, which would move every public law search (`lawTitleHits`, autocomplete, search fallbacks) onto
   the service role. That reverses 20261004_01's deliberate statement_timeout choice. I recommend leaving it public, but
   the controller or owner should decide.
2. **Decree `title` / `hashtags`** can contain an instrument number. No route masks them (owner: the title is
   unchanged), so they stay public.
3. The live n8n workflows and the owner's agent were not inspected (no access). Ask the user to confirm that none of them
   reads `decrees_circulars` with the anon key.

## 9. For the owner report (Arabic, plain)

رقم القرار أو التعميم وتاريخه ورابطه الرسمي وملخصه الكامل صارت للمشتركين فقط، ليس على الشاشة وحدها بل في قاعدة البيانات نفسها كذلك.
قبل هذا التعديل كان بإمكان من يعرف الطريق التقني أن يقرأ هذه البيانات مباشرةً دون اشتراك، وقد أُغلق هذا الباب الآن.
لن يلاحظ الزائر أو المشترك أي اختلاف في الصفحات، فما كان يظهر لكلٍّ منهما ما زال يظهر كما هو.
