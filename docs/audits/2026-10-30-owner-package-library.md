# Owner package 2026-10-30 — library ledger

- **Branch:** `feat/library-owner-2026-10-30`, built on main `235e1bef`. Not pushed, not merged, not deployed.
- **Owner note (Arabic):** [2026-10-30-owner-note-library.ar.md](2026-10-30-owner-note-library.ar.md).
- **Source:** the owner's handoff `Nezamy-Developer-Handoff-2026-10-30`. It was read only; nothing in it was run, and `REF0034.patch` was not applied.
- **Re-verified against main:** `git diff 0d5273ea 235e1bef` over the library paths was empty, so every review row still stood when work began.
- **Wording rule:** nothing in this ledger is "closed". Each verdict is one of:
  - built (check live)
  - partly built
  - data-dependent
  - already present
  - owner decision
  - not done (follow-up)

## How it was built

The work was split into eight streams. Each stream ran in its own worktree on a `lib/<stream>` branch cut from `ace1f28d`, and was merged `--no-ff`. The coordinator (S0) committed directly.

| Stream | Scope | Merge |
|---|---|---|
| S0 coordinator | shared engines (`multiColorSearch`, `MultiColorHighlight`, `legislativeEvent`), note ١١ loader, integration | direct commits |
| S1a law card | notes ٠١, ١٢-C06/C07/C08, ١٤-C10, answers ٣١٧–٣٢١, SQL 60 | `3dcce419` |
| S1b law reader | ٠٦-C04/C05 (laws), ١٢-C13 coloured diff | `46c7429c` |
| S2 book reader | note ٠٢, ٠٦-C04/C05 (books) | `5426e1f6` |
| S3 readers + directory | ٠٦-C01..C05 (precedents, orders, scoped panel), note ٠٧ | `b21e89e9` |
| S4 catalogue + search | ٠٣-C01/C02/C04, ٠٤-C04, ٠٦-C05 (links), ١٢-C01..C12, SQL 62 | `2de0a727` |
| S5 folders | ٠٣-C03, ٠٤-C01..C03, note ٠٥, LIVE-F23 | `904d685c` |
| S6 SEO | note ١٤ | `3e58a3ee` |
| S7 grants | note ١٨, LIVE-F05, SQL 65/66 | `2c6039b4` |

Integration commits:
- `9d0d9ca6`: the law route passes `unnumbered`.
- `af6dfa77`: the LIB-04b pin.
- `0064ff51`: rate limit on `/api/library/search/suggest`.
- `d89526dc`: the owner note.
- `4c0a5d15`: the owner ٢٦٠ pin.

**Stream follow-ups already handled by the coordinator:**
- S1a-1: the loader `stripKeys` now includes `catalogue_is_repealed` (`ownerLoaderTables.ts`).
- S4-2: the suggest rate limit (`0064ff51`).

## Verdict index

| Id | Verdict | Stream |
|---|---|---|
| ٣١٧ (= ١٢-C08) | built (check live), after SQL 60 | S1a |
| ٣١٨ | built (check live) | S1a, S6 |
| ٣١٩ | built (check live) | S1a |
| ٣٢٠ | data-dependent (`replaced_by` is null everywhere) | S1a |
| ٣٢١ | already present (check live) | S1a |
| NOTE-01-C01..C04, C06 | built (check live); C03 `official_links` data-dependent | S1a |
| NOTE-01-C05 | partly built (seeder drops `merged_regulation_details`) | S1a |
| NOTE-02-C01..C04 | built (check live) | S2 |
| NOTE-03-C01 | partly built (reader volume switcher for untagged series needs the precedents route) | S4 |
| NOTE-03-C02, C03 | built (check live) | S4, S5 |
| NOTE-03-C04 | data-dependent | S4 |
| NOTE-04-C01..C04 | built (check live) | S5, S4 |
| NOTE-05-C01, C02 | built (check live) | S5 |
| NOTE-06-C01..C03 | built (check live) | S3 |
| NOTE-06-C04 | built (check live) across the four readers + scoped panel | S1b, S2, S3 |
| NOTE-06-C05 | partly built: links carry `?q=`, and the readers honour it; fiqh rows link `#<id>` but book anchors are `book-block-<id>` and the API has no block lookup | S4, S1b, S2, S3 |
| NOTE-07-C01, C02, C04 | built (check live), firm + business | S3 |
| NOTE-07-C03 | partly built (the AI-owned `_CircuitsDirectory.tsx` was not touched) | S3 |
| NOTE-07-C05 | partly built (Ctrl+K only) | S3 |
| NOTE-07-C06 | not done (follow-up) | S3 |
| NOTE-11-C01 | already present (check live) | S0 |
| NOTE-11-C02 | data-dependent (external SELECT) | S0 |
| NOTE-11-C03..C05 | built (check live) | S0 |
| NOTE-12-C01..C04, C06, C09..C12 | built (check live); C03 needs SQL 62 | S4, S1a |
| NOTE-12-C05 | data-dependent + owner decision | S4 |
| NOTE-12-C07 | partly built | S1a |
| NOTE-12-C13 | built (check live); owner approval pending | S1b |
| NOTE-14-C01, C04..C08 | built (check live) | S6 |
| NOTE-14-C02, C03 | partly built (books done; laws, orders and collections need LibraryGuard to accept a server status) | S6 |
| NOTE-14-C09 | not done (follow-up) | S6 |
| NOTE-14-C10 | owner decision, settled by ٣١٨ | S1a, S6 |
| NOTE-18-C01..C06 | built (check live); C06 needs the n8n daily schedule | S7 |
| NOTE-18-C07 | not done (follow-up); seats are an owner decision | S7 |
| NOTE-18-C08 | owner decision (AI is out of scope) | S7 |
| LIVE-F05 | partly built (the server checkout gate belongs to the pricing branch) | S7 |
| LIVE-F23 | built (check live) | S5 |

## SQL — run order (the user runs it)

| # | File | When | Check |
|---|---|---|---|
| 1 | `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261030_60_catalogue_repealed_last.sql` | before the deploy (best); either order is safe | last SELECT: ≤ 2 rows; `false` → status_repealed 0, `true` → status_repealed = laws |
| 2 | `...\supabase\migrations\20261030_65_library_grant_admin.sql` | before the deploy (best) | last SELECT: one row, all `t` |
| 3 | `...\supabase\migrations\20261030_66_library_grant_reminders.sql` | after 65; either side of the deploy | last SELECT: one row, all `t` |
| 4 | `...\supabase\migrations\20261030_62_library_title_suggestions.sql` | either side of the deploy | `function_exists = 1`, `show_trgm('نظام العمل')` non-empty (`{}` means LC_CTYPE C) |

- The range `20261030_60..69` was claimed; 61, 63, 64 and 67–69 are unused.
- The proposed `_verify.sql` blocks are in the stream sections below. **`_verify.sql` was not edited.**

## Integration points for the parent

1. **LIVE-F05 server gate.**
   - Change `src/lib/pricing/priceBook.ts` → `library()`: set `buyers: [...LIBRARY_ELIGIBLE_USER_TYPES]`.
   - Update `src/lib/payments/catalog.test.ts:221-235` to match.
   - The pricing branch `batch/2026-10-30-pricing-coupons` owns `checkoutCore.ts`.
   - Until then, an individual can pay through a direct API call.
2. **Library requests from individuals.** `src/app/api/v1/entitlement-requests/route.ts:37` should refuse `kind=library` for an ineligible user type. Today the admin approval refuses it with 409.
3. **Visible decree number and date.** The orders reader h1 and the decree API still send `official_url`, `date` and the decree number to guests. ٣١٨ names laws; this is now owner question 6.
4. **LibraryGuard SSR (14-C02/C03).** Law, order and collection pages give Google a spinner in the first HTML.
5. **n8n.** Create a daily schedule for `POST /api/v1/cron/library-grant-reminders`.

## Incident during the build

Stream S4 ran `docker container prune -f` while cleaning its scratch container.
- This removed **every stopped container on the machine** (260.6 MB).
- Running containers, images and volumes were kept.
- Any stopped container the user still needed must be re-created from its image or compose file.

## Test status on the merged branch

**Final run, `npm run test:unit` on `e2d5f31e`: 4429 tests, 4422 pass, 7 fail, exactly the baseline 7 listed below** (main `235e1bef` has 4166 tests with the same 7 failing).

**The 7 baseline failures, each also failing on main `235e1bef`:**
- books `_shape` volume series (T28-24)
- navigation.consultant
- aiFiles (pdf-lib missing)
- libraryAccess end read (CRLF-only)
- fulfillOrder grantPurchase (CRLF-only)
- two trackingWiring source pins

An earlier run on `0064ff51` had 4420 pass and 9 fail. The 2 extra failures were:

- **owner ٢٦٠ law-route pin** (`lawSummaryVisibility.test.ts`): broken by this branch's `unnumbered` argument and fixed in `4c0a5d15`, now 42/42.
- **`src/lib/ai/runCore.test.ts` «the start call carries the price…»:** passes when run alone (20/20, twice) and this branch does not touch `src/lib/ai`, so it was a load-dependent flake. It passed in the final run.

**`tsc --noEmit`:** only the 2 baseline `pdf-lib` errors in `src/lib/ai/aiFiles*`.

**GitNexus** `detect_changes(compare 235e1bef)`:
- It reported 176 changed files, of which only 5 symbols mapped (FolderCard, its `handleSave` and props, `ALL_LIBRARY_DOCS`, `robots`), and 0 affected processes, with risk "low".
- The index is stale, so the new files are not in it. Treat the "low" as unknown, not as a clearance.

**Not run:** no `next build`, and no browser check. A dev server would read prod Supabase through `.env.local`. Every "check live" step is for the user after the deploy.

---

# Stream sections (verbatim from each stream's ledger; the Arabic owner-note parts are merged into the .ar.md file)


## S0-coordinator

### Note ١١ — loader, series and unnumbered articles (coordinator)

#### NOTE-11-C01 — the 15 tables, with no sixteenth display table
- **Verdict:** already present (check live).
- **What was there on main:** `scripts/seed-library.ts` already wrote all 15 tables. The owner loader `scripts/seed-library-from-owner.mjs:173-197` listed 14.
- **Change:** the loader now lists 15; see C04. No new table was added.
- **Files:** `src/lib/library/ownerLoaderTables.ts`.
- **Tests:** `ownerLoaderTables.test.ts` — "the loader knows all 15 library tables…".
- **Check live:** nothing to click. The proof is the dry-run summary table when the owner next loads: it shows 15 rows.

#### NOTE-11-C02 — migration 20261026_51 applied on prod
- **Verdict:** data-dependent / external check (the code cannot prove prod).
- **What was there on main:** the migration file exists. Whether prod has it is unknown from the repo.
- **Change:** none. The loader now refuses to load without the two columns (C03), so a missing migration can no longer go unnoticed.
- **Check live (SQL editor, prod):**
  ```sql
  select column_name, data_type from information_schema.columns
  where table_schema='library' and table_name='feqh_books' and column_name in ('series_id','volume_number') order by 1;
  ```
  Expected: 2 rows, `series_id character varying` and `volume_number integer`.

#### NOTE-11-C03 — fail closed before loading; never drop the series columns
- **Verdict:** built (check live).
- **What was there on main:** `seed-library-from-owner.mjs:193` (`optionalColumns: ["series_id","volume_number"]`) and `:224-230` (`stripKeys.push(...missing)`). The columns were dropped silently whenever the probe said "missing".
- **Change:**
  - The two columns are now `requiredColumns`.
  - A live run first runs `preflightRequiredColumns`: one probe per column, before the first write.
  - ANY error (missing, permission, timeout, a thrown exception) prints the problem and exits 1, with nothing written. No key is ever stripped because the DB lacks it.
  - A dry run still makes no DB call.
- **Files:** `scripts/seed-library-from-owner.mjs`, `src/lib/library/ownerLoaderTables.ts`. The old source test is removed from `src/lib/library/optionalColumn.test.ts`; `missingOptionalColumns` itself is kept with its unit test.
- **Tests:** `ownerLoaderTables.test.ts`:
  - "series_id / volume_number are REQUIRED…";
  - "preflight: a missing column, a permission error, a timeout or a throw each stop the load";
  - "the loader runs the preflight before any write and exits 1…".
- **Check live:** none until the next owner load. If he loads before running 20261026_51, he gets `❌ Pre-flight check failed — nothing was written` and exit code 1.
- **Never executed:** the loader was syntax-checked only (`node --check`).

#### NOTE-11-C04 — table 15 loaded through the RPC in the direct loader
- **Verdict:** built (check live, at the owner's next load).
- **What was there on main:** `TABLES` had 14 entries, and `private_precedent_details.jsonl` was ignored.
- **Change:**
  - New entry `private_precedent_details`, right after `principle_paragraphs`.
  - It writes through `supabase.schema('public').rpc('store_private_precedent_details', { p_rows })`, 100 rows a call (the RPC refuses more).
  - A batch counts as stored only when the RPC answers exactly the batch size (`rpcBatchStored`). Anything else throws and stops the load: no row-by-row retry, the same rule as `seed-library.ts`.
  - A missing file is normal (`optionalFile`) and does not fail the run.
- **Files:** as C03.
- **Tests:** `ownerLoaderTables.test.ts` — "the private details go through the RPC, all or nothing…".
- **Check live:** after his next load, the summary line `private_precedent_details` shows read = written. Count check in SQL: `select count(*) from library_precedent_private.precedent_unparsed_details;` should equal the line count of his `private_precedent_details.jsonl`.

#### NOTE-11-C05 — no invented «المادة N» for unnumbered text
- **Verdict:** built (check live).
- **What was there on main:** `_article-label.ts:94-109` returned «المادة N» whenever `number_text` was an instrument name or a heading longer than 60 characters.
- **Change:**
  - New `documentIsUnnumbered(rows)`: true when no row names an article or item («المادة/البند/الفقرة», an ordinal, a leading number). The DB has no `source_number` column, so this is the document-level signal.
  - `articleDisplayLabel(text, n, { unnumbered: true })` shows a topical heading as written. A repeated instrument name shows the bare position «(N)», never «المادة N».
  - Numbered documents are unchanged; the repeat guard for an instrument name stays.
  - The law route passes the flag (integration commit).
- **Files:** `src/app/api/library/laws/[slug]/_article-label.ts`, `route.ts`.
- **Tests:** `_article-label.test.ts` — "note ١١: documentIsUnnumbered…" and "note ١١: in an unnumbered document a topical heading is shown as written…".
- **Check live:** open a guide that has no numbered articles in its source (his example: file 0491). The contents list and the article headers show the topical headings, with no «المادة 1، 2…».
- **Limit:** when the owner's export carries `source_number`, a column would make this exact. Today it is inferred per document.

---

## S1a-lawcard — ledger

- Branch: `lib/S1a-lawcard` (from `ace1f28d`). Worktree:
  `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.claude\worktrees\agent-aaff39afa3cd975b1`
- Commits (oldest first):
  - `999e7828` feat(library): law card helpers (note ٠١ / note ١٢)
  - `ddf8ad2b` feat(library): official links subscriber-only, one public date, server موجز sanitizer, repealed last (٣١٧–٣١٩) + migration 20261030_60
  - `e459f0b8` feat(laws): two-layer law card in the sidebar (note ٠١, ١٢-C07, ٣١٨)
- Tests:
  - Nearby suites: 188 + 20 + 47 pass, 0 fail.
  - Full `npm run test:unit`: 4208 tests, 4201 pass, 7 fail. The baseline was 4166 tests with 7 known failures; the same 7 fail now, none in S1a files:
    - books `_shape`
    - navigation.consultant
    - aiFiles (pdf-lib)
    - libraryAccess
    - fulfillOrder
    - 2 × trackingWiring
- `tsc --noEmit`: the only errors are the pre-existing `pdf-lib` ones in `src/lib/ai/aiFiles*`. None in S1a files.
- GitNexus:
  - `impact` was tried before editing. The index is stale: lawCardLayout, lawReaderExtras and parseOfficialMeta were "not found" and the risk is UNKNOWN.
  - Grep found exactly 1 caller for each:
    - lawCardLayout → `_sidebar.tsx`
    - lawReaderExtras → law route
    - parseOfficialMeta → `page.tsx`
    - lawOfficialLink → law route
  - `detect_changes(scope all)` returned 17 files, 0 symbols mapped, risk "low". That reflects the stale index, not a real "low".
- **`page.tsx` was NOT touched.** No prop wiring was needed: every new field reaches the sidebar through `parseOfficialMeta(law)`, which `page.tsx` already passes as `officialMeta`.
- Owned files I did not need to change:
  - `_summary-box.tsx`
  - `src/app/laws/components/OfficialMetaLockedRow.tsx`
- EOL: the mixed-EOL blobs (`_sidebar.tsx`, the law `route.ts`, the init `route.ts`) were restored line by line. The committed diff is 1420+/121−, with no whole-file rewrites.

---

### Owner ٣١٨ — official links subscriber-only + one public date
**Verdict:** built (check live)

**What was there (ace1f28d):**
- `src/app/api/library/laws/[slug]/_official-meta.ts:118`: `lawOfficialLink(law)` was public (owner ٢٩٧).
- The law route `route.ts:355` sent `officialLink: lawOfficialLink(law)` to every viewer.
- `src/app/laws/[slug]/_sidebar.tsx:104` read `officialMeta?.officialLink ?? null`, outside `metaLocked`, and showed the raw host (`urlHostname`, :219, :258).
- Init masked dates; there was no public date.

**Change:**
- **Reverses ٢٩٧ on purpose.**
  - `lawOfficialLink(law, isSubscriber)` returns '' for a guest; otherwise `official_source_url`, falling back to `boe_source_url` (http(s) only).
  - New `lawOfficialLinks(law, isSubscriber)` returns [] for a guest; otherwise boe, official and gazette URLs, deduped, with Arabic names.
  - The route passes `isSubscriber` (`hasFullLibraryAccess`, never the whitelist).
- **The one public date, `latest_legislative_update`:**
  - It is the date alone, e.g. «1448/01/08هـ», and is omitted when null.
  - It is computed by `latestLegislativeEvent` from the UNMASKED service-role row, on the law route and on every init law item.
  - Init reads `latest_update` only as the JSON-path alias `latest_update_date:latest_update->>date_hijri`, so the instrument text never leaves the DB. The alias is destructured out of every row before the response.
  - `issue_date_hijri` and `issuing_instrument` stay masked (`maskListOfficialFields`, unchanged).
- **Client:**
  - `parseOfficialMeta` drops `officialLink`, `officialLinks` and `latestUpdate` on a locked response.
  - It accepts the public date only when it matches `^1[34]\d{2}(/\d{2}){0,2}هـ$`.
  - The sidebar puts the link behind `metaLocked` again.
  - A guest sees one row, «آخر تحديث تشريعي».

**Files:**
- `src/app/api/library/laws/[slug]/_official-meta.ts:124,145`
- the law `route.ts` (`officialLink`/`officialLinks`/`latest_legislative_update`)
- `src/app/api/library/init/route.ts:48,~355-369`
- `src/app/laws/[slug]/_official-meta.ts`
- `src/app/laws/[slug]/_sidebar.tsx:113-114,274-280`

**Tests:**
- Deliberately changed contracts, each commented "REVERSES ٢٩٧" / "CHANGED CONTRACT":
  - api `_official-meta.test.ts` (the two ٢٩٧ tests were rewritten)
  - client `_official-meta.test.ts` (the ٢٩٧ test plus the sidebar regex test)
  - `init-route-contract.test.ts`: the new test "٣١٨: the one public date…" replaces the "dates withheld" contract with "only this one derived field". The alias is removed, nothing after it reads `row`, and the mask is unchanged.
  - `_official-meta.routes.test.ts`
- New tests:
  - `lawOfficialLinks`
  - public-date validation
  - locked drops links

**Check live:**
1. Open a law as a guest: there are no «الرابط الرسمي» or «المصادر الرسمية» rows, and one «آخر تحديث تشريعي» row shows a date only.
2. Open it as a subscriber: the sources appear by Arabic name.
3. Call `/api/library/init` as a guest: law items carry `latest_legislative_update` and no `latest_update_date` or `issue_date_hijri` value.

### Owner ٣١٩ — guest موجز through summaryForViewer on the server
**Verdict:** built (check live)

**What was there:**
- `lawReaderExtras` returned `blocks.summary` raw for guests (`lawSummaryVisibility.ts`).
- Init sent `summary_brief` as stored.

**Change:**
- `lawReaderExtras` applies `summaryForViewer(blocks.summary, isSubscriber)` and omits an empty موجز and its label (`lawSummaryVisibility.ts:659`).
- Init applies `shaped.summary_brief = summaryForViewer(shaped.summary_brief, hasFullAccess) || null` (`init/route.ts:362`).

**Tests:**
- `lawSummaryVisibility.test.ts` fixtures:
  - A decree summary with «(م/14)» and «1447/01/30هـ»: the guest copy has both stripped, «30 يوماً» is kept, and the subscriber copy is whole.
  - A guest موجز that ends up empty is omitted.
- `init-route-contract.test.ts` "٣١٩" pins the init call.

**Check live:** A guest's موجز on a law with a decree number in it shows no instrument number or date.

### Owner ٣٢٠ — «ملغى» alone; the replacing law on its own row
**Verdict:** data-dependent (needs owner's next load)

**What was there:** The status primary row could carry the replacement.

**Change:**
- The status row is the badge alone.
- `replacedBy` gets its own «النظام البديل» row under «المزيد» (`_sidebar.tsx:387`).

**Data:** `replaced_by` is null on every law today, so nothing renders until the owner's load fills it.

**Check live:** After a load with `replaced_by`, a repealed law shows «ملغى» and, under «المزيد», «النظام البديل» linked.

### Owner ٣٢١ — «صدر — لم يُتحقّق من النشر» reads «صدر»
**Verdict:** already present (check live)

**Where:**
- `src/app/laws/law-status.ts:25` maps `issued_publication_unverified` to «صدر».
- `src/lib/library/lawSummaryVisibility.ts:187` and `lawSummaryVisibility.test.ts` (~585) map the card text «صدر — لم يُتحقّق من النشر» to «صدر».

**Badge paths checked:**
- The sidebar uses `lawStatusPresentation` (`_sidebar.tsx:134,365`).
- `monitorFeed.ts:294` uses `lawStatusPresentation`.
- The catalogue (`LawsTabContent.tsx:290`) uses only `isRepealedLawStatus` (the same normaliser) and shows no status text otherwise.
- `page.tsx:816` uses `isRepealedLawStatus`.

**Change:** none.

### Note ٠١ C01 — «آخر تعديل» before «تاريخ الإصدار»
**Verdict:** built (check live)

**What was there:** `lawCardFields.ts:47-56` (ace1f28d) had the order type, issueDate, lastAmendment, status, issuer.

**Change:** `LAW_CARD_PRIMARY_FIELDS` is now type, lastAmendment, issueDate, status, issuer.

**Tests:** `lawCardFields.test.ts` (order).

**Check live:** In the card's primary rows, «آخر تعديل» comes above «تاريخ الإصدار».

### Note ٠١ C02 — «آخر تعديل» falls back to latest_update
**Verdict:** built (check live); the instrument text depends on which `latest_update` keys the owner fills.

**Change:**
- `latestUpdateDetail(latest_update, isSubscriber)` (`lawSummaryVisibility.ts:708`) returns "date (event — instrument)" for subscribers only.
  - Each part is cleaned (`stripPipelineNotes` + `cardRowValue`).
  - Non-Arabic and review-note parts are dropped.
  - For a guest it returns ''.
- `lawCardLayout` fills `lastAmendment` from it when the card row is missing or says «لا يوجد»-style.

**Data:** The `instrument` key leaks review notes in about 220 files. They are stripped, but an instrument made only of a note shows the date alone.

**Tests:** `lawSummaryVisibility.test.ts` (`latestUpdateDetail`) and `lawCardFields.test.ts`.

### Note ٠١ C03 — every official source by Arabic name, never a raw host
**Verdict:** built (check live) for the links the DB and card rows hold. The owner's `official_links` list is data-dependent: it is not a column, and the seeder drops it.

**Change:**
- `officialSourceName` (`lawCardFields.ts:217`) maps:
  - boe → «هيئة الخبراء»
  - uqn → «جريدة أم القرى»
  - moj → «بوابة وزارة العدل»
  - anything else → «موقع الجهة المختصة»
- `collectOfficialLinks` (:271) builds one «المصادر الرسمية» list (server links plus link rows in the card), deduped by normalized URL.
- A link-only «المزيد» row is not repeated.
- `renderValue` names bare links.

**Tests:** `lawCardFields.test.ts`, both `_official-meta.test.ts` files, and `_summary-box.test.ts`.

### Note ٠١ C04 — dedupe; drop «التصنيف» equal to the badge
**Verdict:** built (check live)

**Change:**
- `lawCardLayout` dedupes on trimmed key plus whitespace-normalized value.
- It drops «التصنيف» when that value, minus a leading «القسم», equals the type badge.

**Tests:** `lawCardFields.test.ts`.

### Note ٠١ C05 — split «المزيد» into law / regulation groups
**Verdict:** partly built

**What is built:**
- `REGULATION_ROW_KEY` (`lawCardFields.ts:127`) puts keys naming لائحة / لوائح / التشريعات الفرعية / الأدوات المدمجة into `moreRegulation`.
- The regulation preamble's own card (`regulation_card`, from `regulationReaderExtras`) joins that group.
- The sidebar draws «بيانات النظام» and «بيانات اللائحة التنفيذية / التشريعات الفرعية المدمجة» (`_sidebar.tsx:487-501`).
- The regulation group is hidden when there is none.

**What is missing:**
- The per-regulation details the owner wants come from `merged_regulation_details`, which the seeder drops. That part is data-dependent.
- The split is key-based, so a regulation row with a generic key stays in the law group.

### Note ٠١ C06 — article counts per container, live
**Verdict:** built (check live). The names of the separate regulation `ref`s (singular vs plural) are data-dependent.

**Change:**
- `lawArticleCounts` (`lawCardFields.ts:326`) runs on the server from EVERY loaded article, so guests are not undercounted. It counts:
  - the law (base articles)
  - each regulation (non-secondary `article_regulations` grouped by cleaned `ref`, plus «لائحة مستقلة» articles)
  - annexes
- Each container gets amended / repealed counts by status.
- The sidebar prefers the live counts over the file's count rows.

**Tests:** `lawCardFields.test.ts` and client `_official-meta.test.ts` (parse).

### Note ١٢ C06 (server side)
**Verdict:** built (check live). This is the server half of ٣١٩ / ٣١٨ above: `summaryForViewer` on both routes, and links and dates subscriber-only. The UI half belongs to whoever owns the catalogue UI.

### Note ١٢ C07 — two-layer card, defensive cleanup, «عدد المواد الكلي · X معدّلة · Y ملغاة»
**Verdict:** partly built

**What is built:**
- The law layer and the regulation layer.
- `stripPipelineNotes` (`lawPreambleBlocks.ts:429`) removes `<!-- -->` and `[…]` asides made of pipeline or review words. It is applied to every card row (`rowTidy`) and to the count names.
- `extractLawCard` (:402).
- `articleTallyLabel` gives "245 · 12 معدّلة · 3 ملغاة" (`_sidebar.tsx:491`).

**What is missing:** The regulation layer's own metadata (`merged_regulation_details`) is data-dependent.

### Note ١٢ C08 / owner ٣١٧ — repealed laws last in the catalogue
**Verdict:** built (check live), once the user runs SQL 20261030_60. Until then the code falls back to the 20261025_40 order.

**What was there:** `init/route.ts:270` (ace1f28d) ordered merged → `catalogue_recency_key` → title → slug, with no repealed rule.

**Change:**
- Migration `20261030_60` adds a STORED generated `catalogue_is_repealed = coalesce(btrim(status) = 'repealed', false)`.
  - This is the same rule as `isRepealedLawStatus`.
  - No API grant and no trigger.
  - Index `idx_laws_catalogue_repealed_last` is in the route's exact order.
- Init adds `{ key: "repealedLast" }` as an optional feature and orders by it first (ascending; false before true).
  - If the column is missing, `readWithOptionalFeatures` drops that one order on 42703.
- The column is never selected.

**Tests:**
- `catalogue-order-277.test.ts`: order regex, plus a new test pinning the migration SQL (generated expression, index, no grant, no trigger, the status rule).
- `init-route-contract.test.ts`.

**Docker:** Tested on scratch `postgres:16-alpine` with a minimal `library.laws`, roles, and the 20261004_01-style lock.
- 60 refuses to run before 40.
- 40 then 60 → `verify: OK`. Run again → OK (idempotent).
- Deparsed expression: `COALESCE((btrim((status)::text) = 'repealed'::text), false)`.
- Ordering: 4 in-force laws (merged first) come before 2 repealed (one with `' repealed '` padding).
- The `anon` read is denied.
- The `ORDER BY … LIMIT` uses `Index Only Scan using idx_laws_catalogue_repealed_last`.
- An UPDATE of status recomputes the column.

**Check live:** In `/laws` with no search, no repealed (red) card appears before the last in-force law.

### Note ١٤ C10 — official-link policy
**Verdict:** built (check live). It is settled by ٣١٨: subscriber-only, by Arabic name. See ٣١٨ and C03.

---

### SQL

- **File:** `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261030_60_catalogue_repealed_last.sql` (on the branch; in the worktree at `...\.claude\worktrees\agent-aaff39afa3cd975b1\supabase\migrations\`).
- **Prerequisites:** 20261004_01 (column lock) and 20261025_40 (`catalogue_recency_key`). The file refuses to run without them.
- **Deploy order:** any order works; before the deploy is best. Old code never names the column. New code without the column falls back to the 20261025_40 order.
- **Lock:** one table rewrite under ACCESS EXCLUSIVE with `lock_timeout 5s`. If it times out, re-run it.
- **Range:** 20261030_61 is unused.
- **SELECT check** (it is also the last statement of the file; the SQL editor hides NOTICEs):
  ```sql
  select catalogue_is_repealed,
         count(*) as laws,
         count(*) filter (where btrim(status) = 'repealed') as status_repealed
    from library.laws group by 1 order by 1;
  ```
  Expected: at most 2 rows. `false` → `status_repealed = 0`; `true` → `status_repealed = laws`.
- **Rollback:**
  ```sql
  drop index if exists library.idx_laws_catalogue_repealed_last;
  alter table library.laws drop column if exists catalogue_is_repealed;
  ```

### Proposed `_verify.sql` lines (NOT edited — for the coordinator)
```sql
-- verify:catalogue_repealed_last (20261030_60)
do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'library.laws'::regclass
                  and attname = 'catalogue_is_repealed' and attgenerated = 's' and not attisdropped) then
    raise exception 'verify:catalogue_repealed_last — column missing or not generated';
  end if;
  if has_column_privilege('anon', 'library.laws', 'catalogue_is_repealed', 'SELECT')
     or has_column_privilege('authenticated', 'library.laws', 'catalogue_is_repealed', 'SELECT') then
    raise exception 'verify:catalogue_repealed_last — an API role can read the sort key';
  end if;
  if to_regclass('library.idx_laws_catalogue_repealed_last') is null then
    raise exception 'verify:catalogue_repealed_last — index missing';
  end if;
  if exists (select 1 from library.laws
              where catalogue_is_repealed is distinct from coalesce(btrim(status) = 'repealed', false)) then
    raise exception 'verify:catalogue_repealed_last — a row disagrees with its status';
  end if;
end $$;
select 'catalogue_repealed_last' as check, 'OK' as result;
```

### Follow-ups and risks
1. **Loader `stripKeys`:** `scripts/seed-library-from-owner.mjs:180` strips `catalogue_recency_key` but not `catalogue_is_repealed`. This is not my file. It is harmless while rows come from the owner JSONL, which never carries the key. Any load that writes back rows read from the DB would fail on the generated column. Coordinator: add it.
2. **Article amendments in the key:** an `article_amendments` date in the catalogue key needs either a materialized column filled by the loader or a separate aggregate table. A generated column cannot run a subquery. Not built.
3. **Catalogue UI:** the catalogue UI stream (S4) must render `latest_legislative_update` on the cards. Only the API sends it today.
4. **JSON-LD:** `dateModified` in `ArticleJsonLd.tsx` belongs to the SEO stream (S6). It is unchanged here.
5. **Decree summaries:** these are not passed through `summaryForViewer` (`decree-summary-public.test.ts` pins them as public). They are out of scope for ٣١٩ as briefed.
6. **Old index:** `idx_laws_catalogue_recency` (20261025_40) is kept because `_verify.sql` checks it. It is redundant once 60 is live and could be dropped later.
7. **Data-dependent items:**
   - `official_links` and `merged_regulation_details` (the seeder drops them).
   - `replaced_by` (null everywhere).
   - The names of the regulation `ref`s.
8. **Risk — public data:** the law route now computes counts and the event date from data it already loads with the service role. No new column reaches a guest except the date alone, and the client rejects anything else.
9. **Risk — cleanup scope:** `stripPipelineNotes` removes only bracketed or comment asides that contain review or pipeline words, so a real legal aside like «[انظر المادة 5]» stays. A legal aside that contains «ملاحظة:» would be removed.

---

## S1b-lawreader — ledger fragment

Branch `lib/S1b-lawreader` (base `ace1f28d`). Commits:
- `4386f2e2` feat(library): pure word-level diff for the coloured-diff button (owner note ١٢ §٣)
- `1e5ff19b` feat(laws): search colours in the law reader + coloured word diff (owner notes ٠٦, ١٢ §٣)
- `b76b9fe0` fix(laws): anchors clear the sticky colour bar; diff ignores the [معدّلة] label
  - `READER_SCROLL_MARGIN_TOP` in `_reader-anchors.ts` now adds `var(--reader-legend-h)`. The reader sets that to the bar's live height through a ResizeObserver, and it is 0 when the bar is hidden.
  - `diffSourceText` drops the «[معدّلة]» token and the `#`/`>` line prefixes.

Full suite (`npm run test:unit`) after `1e5ff19b`: 4212 tests, 4205 pass, 7 fail. Those 7 are the 7 known baseline failures:
- grantPurchase
- 2 × trackingWiring
- books volume series
- aiFiles (pdf-lib)
- the libraryAccess end read
- navigation.consultant

No new failure. After `b76b9fe0`:
- the touched test files pass (`[slug]/*.test.ts`: 74 tests; `wordDiff`; `laws/*.test.ts`; `init-route-contract`);
- `tsc` is clean apart from the pre-existing pdf-lib error.

Scope: the LAWS reader `/laws/[slug]` only. The other three readers (precedents, orders, book), the result links on `/laws` and `ScopedSearchPanel` belong to other streams.

GitNexus: `impact` returned "Target not found" for `MD` and `ArticleBlock`, so the risk is UNKNOWN (the index is stale). Callers found by grep:
- `MD`: `page.tsx`, `_summary-box.tsx` and `PreambleBlock`. Outside a provider `MD` behaves exactly as before.
- `ArticleBlock`: 2 renders, both in `page.tsx`.

---

### NOTE-06-C04 — colour highlighting inside the reader (laws reader)
- **Verdict:** built (check live), for `/laws/[slug]`.
- **What was there on main:**
  - Nothing was highlighted.
  - `_article-components.tsx:793` printed `{article.title}` as plain text, and `:979` printed `{amend.fullText}` as plain text.
  - `MD` (`:268–397`) renders text through `markdownBoldToSafeHtml` → `dangerouslySetInnerHTML`, with no `<mark>`.
  - The in-page box (`page.tsx:575`, `jumpQuery`) only filtered.
- **Change:**
  - `page.tsx` wraps everything from the preamble down (preamble → articles → regulation → appendix → flat-regulation view) in one `<HighlightProvider query={highlightQuery}>`, with `<SearchLegendBar>` sticky above it.
  - `highlightQuery` is the in-page box text while it has text, and `?q=` otherwise. So typing in the box re-colours to match its own filter.
  - `ScopedSearchPanel` is deliberately left outside the provider, so its marks are not counted twice.
  - Coloured with `<Hl>`:
    - the article number badge and the article title;
    - the regulation ref;
    - in the amendment history: source, date and summary;
    - the previous-version text.
  - Coloured inside `MD`: article text, the merged executive regulation text, the preamble, the historic regulation text and the folded pre-amendment `<details>`.
    - It goes through the new pure `_highlight-html.ts` → `highlightSafeHtml(sanitisedHtml, terms, focus)`.
    - Only text runs are matched; tags pass through byte for byte, so nothing lands in an `href`.
    - Entities are treated as atomic.
    - The only markup added is the fixed `<mark data-hl-term class=palette>`. No DOM walker and no new unsanitised HTML.
  - A match inside a folded part opens it: the repealed text toggle, «الإصدارات السابقة», «نص لائحي تاريخي», and the folded pre-amendment block.
  - Locked text stays locked: the three blurred two-line previews pass `highlight={false}`, so the legend's ↑ ↓ and the arrival scroll never land on them.
  - The legend says «في المعروض» when the box filter is on, or when some articles are locked for this viewer.
  - Chip focus works in `MD` too: the focus is passed to `highlightSafeHtml`.
- **Files:**
  - `src/app/laws/[slug]/page.tsx`
  - `src/app/laws/[slug]/_article-components.tsx`
  - `src/app/laws/[slug]/_highlight-html.ts` (new)
- **Tests:**
  - `src/app/laws/[slug]/_highlight-html.test.ts`, 9 tests:
    - no terms → unchanged;
    - coloured mark with its index;
    - Arabic and digit folding;
    - tags and `href` untouched, only `mark` added;
    - no match across a tag;
    - entity atomic;
    - focus;
    - prefix;
    - `textHasHighlight`.
  - `src/app/laws/[slug]/_reader-highlight.test.ts`, 9 source-contract tests:
    - one provider, wired to `highlightQuery`;
    - `?q=` never reaches `filteredArticles`;
    - ✕ drops `?q=` with `{ scroll: false }`;
    - the provider covers preamble → both `<ArticleBlock>` renders, and `ScopedSearchPanel` is outside;
    - `MD` has exactly one `markdownBoldToSafeHtml` call, inside `safeHtml`;
    - the 3 locked previews have `highlight={false}`;
    - number, title, regulation ref and history are coloured;
    - the auto-open flags are present;
    - the diff toggle is in place.
- **Check live (any account; also a visitor for the lock check):**
  1. Open `/laws/<a law slug>?q=عزل+المحكمة`, for example the civil procedure law.
     - Each word gets its own colour in titles, article text and the executive regulation box.
     - The bar on top shows chips with counts, plus ↑ ↓ and «✕ مسح الألوان».
  2. Type `الاثبات` or `123` in the sidebar quick search. `الإثبات` and `١٢٣` are coloured.
  3. Click a chip. Only that term stays coloured, and ↑ ↓ walk its matches.
  4. As a visitor on a law past the free limit, the blurred previews show no colour, and the bar shows «في المعروض».
  5. Dark mode: the marks and the bar are readable.

### NOTE-06-C05 — carry `?q=` and the position from search, keeping the whole document
- **Verdict:** partly built.
  - The RECEIVING side of `/laws/[slug]` is built (check live).
  - The SENDING side (adding `?q=` to result links on `/laws`, `LawsTabContent` and the like) belongs to other streams.
- **What was there on main:**
  - `page.tsx:128–138` read only `?viewMode`, and nothing read `?q=`.
  - Nothing handled `#hash` on arrival (grep found none), so an arrival relied on the browser, which fires before the law has loaded.
- **Change:**
  - `const arrivalQuery = searchParams?.get("q")`. It only colours and never feeds `jumpQuery` or `filteredArticles`. Every article stays on the page, matching the owner's «في سياقه الكامل».
  - New `ReaderArrivalScroll`, rendered inside the provider. Once the law has rendered it scrolls once:
    - to the `#hash` element (an article card id) if present;
    - else to the first `<mark>`.
  - «✕ مسح الألوان» empties the box and `router.replace`s the URL without `q`. It keeps `viewMode` and the other params plus the `#hash`, with `{ scroll: false }`.
- **Files:**
  - `src/app/laws/[slug]/page.tsx`
  - `src/app/laws/[slug]/_reader-anchors.ts` (the scroll margin now clears the sticky bar)
- **Tests:** in `_reader-highlight.test.ts`:
  - "?q= only colours: it never reaches the article filter";
  - "✕ drops ?q= without a scroll jump and keeps the hash";
  - "arrival scroll: the #hash target first, else the first mark".
- **Check live (any account):**
  1. Open `/laws/<slug>?q=الوكيل#<an article id from the page, e.g. art-12>`. The page lands on that article. All the other articles are still listed, and «الوكيل» is coloured everywhere.
  2. Open the same link without the `#…`. The page scrolls to the first coloured word.
  3. Press ✕. The colours go, the URL loses `q=` but keeps `viewMode` and the hash, and the page does not jump.
  4. Once the other streams land: search on `/laws`, click a law result, and the same three checks hold.

### NOTE-12-C13 — coloured word diff inside the amendment `<details>`
- **Verdict:** built (check live). It is also an owner decision: note ١٢ §٣ is marked «بانتظار قرار المالك / إن اعتُمد». It was built as briefed and can be removed with one line if he declines.
- **What was there on main:** `_article-components.tsx:979` printed the previous version (`amend.fullText`) as a plain paragraph inside «الإصدارات السابقة» (`:952–983`). There was no diff.
- **Change:**
  - Each previous-version card with a text now shows a toggle, «إظهار الفروق الملونة» / «إخفاء الفروق الملونة».
  - It computes, in the browser, a word diff from that version to the article's CURRENT text:
    - deleted words are red with a strike;
    - added words are green;
    - a line counts «N كلمة محذوفة · M كلمة مضافة».
  - Engine, the pure `src/lib/library/wordDiff.ts`:
    - LCS on word tokens, after trimming the common head and tail;
    - line breaks are tokens;
    - harakat- or tatweel-only changes are not a change;
    - size guard `MAX_DIFF_CELLS = 2.5M` table cells: when the texts are too long it returns null, and the card says «النص أطول من أن تُعرض فروقه هنا؛ يظهر كما هو» and shows plain text.
  - `diffSourceText()` drops the embedded `<details>` history and the markdown marks (`**`, `__`, backticks) from the current text first.
  - Search colours still apply inside the diff runs.
  - Locked content: amendments reach the page only for unlocked articles (`api/library/laws/[slug]/route.ts`, `if (!isLocked)` before `result.amendments`), so the diff exposes nothing new.
  - The strike-through lives in the new `_word-diff.tsx` because `repealed-texts.test.ts` forbids `line-through` in `_article-components`/`page` (for repealed texts). That rule still holds for them.
  - Dark mode uses explicit pairs (`bg-red-500/25 text-red-200` and `bg-emerald-500/25 text-emerald-200`) and no `text-*-50/100`.
- **Files:**
  - `src/lib/library/wordDiff.ts` (new)
  - `src/app/laws/[slug]/_word-diff.tsx` (new)
  - `src/app/laws/[slug]/_article-components.tsx`
- **Tests:**
  - `src/lib/library/wordDiff.test.ts`, 8 tests:
    - identical;
    - replaced word;
    - the runs rebuild both texts;
    - pure insert and delete;
    - harakat;
    - whitespace and line breaks;
    - size guard null (head and tail excluded);
    - `diffSourceText`.
  - The `_reader-highlight.test.ts` test "note ١٢ §٣ …":
    - the toggle sits inside «الإصدارات السابقة»;
    - it compares against `article.text`;
    - the strike appears only on `<del>`;
    - no `text-*-50/100`.
- **Check live (a subscriber, or a free article):**
  1. Open a law with an amended article (amber «معدَّلة» badge) and open «الإصدارات السابقة (n)».
  2. Press «إظهار الفروق الملونة». Removed words show red and struck, added words green, and the counts line appears.
  3. Press again. The plain old text returns.
  4. Check in dark mode.

---

### SQL
None.

`_verify.sql`: no new check needed (UI only).

### Follow-ups and risks
- **Owner approval for NOTE-12-C13:** his note marks it as pending approval. If he declines, remove the `<PreviousVersionText>` use in `_article-components.tsx`; a plain `<Hl text={amend.fullText}/>` restores the old view.
- **Which text the diff compares:**
  - Each version is diffed against the CURRENT text, not against the next newer version.
  - For an article amended several times, older cards show the cumulative change.
  - The order of amendments in the API is not guaranteed chronological, so a version-to-version chain was not attempted.
- **A phrase across bold:** a phrase that spans a bold boundary (e.g. «عزل **الوكيل**») is not coloured as one phrase. This is the price of matching only text runs, which keeps the HTML sanitised.
- **The box overrides `?q=`:** when the in-page quick-search box has text, it overrides `?q=` for colouring, because the box filters too.
- **Legend counts:** a section holding a match opens by itself. If the reader closes it again, its marks still count, and ↑ ↓ can stop on a hidden mark. This is minor.
- **Not verified in a browser:** running the dev server would load laws from Supabase through `.env.local`, which the house rules forbid. Verification is unit and source-contract tests, `tsc` (clean for these files) and `eslint` (no new findings; the remaining warnings are pre-existing).
- **No API changes here:** the `#hash` for precedents and other readers, and `?q=` on `/laws` result links, belong to other streams.
- **Visual check:** `HighlightProvider` wraps its children in `display:contents` (an inner `space-y-4` div restores the gap inside). Check live that the gap between `ScopedSearchPanel` and the preamble still looks right.
- **Merge note for the coordinator:**
  - The `page.tsx` import hunk sits right after the `ScopedSearchPanel` import, and the `ReaderArrivalScroll` helper sits just before `LawSystemPageContent`.
  - The provider open is just before `{/* Preamble */}`, and the close is just before the `{/* LEFT COLUMN … */}` comment.
  - None of it touches the `<SidebarPanel>` renders.
  - `_reader-anchors.ts` changed its `READER_SCROLL_MARGIN_TOP` string only.
- **Tailwind:** v4 (`@import "tailwindcss"`) scans `src/lib`, so the palette classes built at runtime in `_highlight-html.ts` are generated. Dark mode is class-based (`@custom-variant dark`).
- **CRLF:**
  - `_article-components.tsx` is mixed-EOL in the index (1,131 of 1,155 lines CRLF). The restored blob keeps the original line endings, and new lines are CRLF. `git diff --stat` is 98 lines, not a whole-file rewrite.
  - `page.tsx` is LF in the index.

---

## Ledger — stream S2-book (book reader /book/[slug], notes ٠٢ and ٠٦)

Branch `lib/S2-book` on `ace1f28d`. Commits:
- `80b373ec`: API `?at_page=` page jump.
- `4162ff6f`: the continuous stream and the highlight.
- `5967f6dc`: the index renders a bounded slice; a jump to the book's start knows it is the start.

Files edited OUTSIDE my list (expect these as merge points):
- `src/app/api/library/books/[slug]/_shape.ts`, `route.ts` and `_shape.test.ts`: the additive `at_page` param.
- `src/components/library/scopedSearchPanel.test.ts`: one pin moved to `_stream-block.tsx`. The ScopedSearchPanel / note ٠٦ stream may edit the same file.

Full unit suite: 4198 tests, 4191 pass, 7 fail. These are exactly the 7 baseline failures; there are no new failures.

GitNexus: `impact` returned "target not found" (UNKNOWN) for `FeqhBookPage`, `SidebarPanel`, `filterToc` and `planBlocksRequest`. The index is stale. Grep caller counts:
- `filterToc`: 1 caller (book `page.tsx`), plus tests.
- `SidebarPanel` (book `_sidebar.tsx`): 1 caller (book `page.tsx`).
- `IdentityPanel` (book): 1 caller (book `page.tsx`).
- `planBlocksRequest`: 1 caller (books `route.ts`), plus `_shape.test.ts`.
- `FeqhBookPage`: a route page, no importers.

None of these is HIGH or CRITICAL by grep.

---

### NOTE-02-C01: pages stream continuously instead of one block
- **Verdict:** built (check live)
- **What was there on main:** `src/app/book/[slug]/page.tsx:866`. `{activeBlock ? (<div id=book-block-…>)}` showed one block, and `goToNeighbour` drove «الموضع التالي / السابق» (`page.tsx:965–993`).
- **Change:**
  - The centre column renders `stream.blocks.map(<StreamBlock/>)`, one block under another, in book order (`order_index`).
  - The single block, `goToNeighbour`, `ensureRun`, the prefetch and the next/previous buttons are removed.
  - The new pure model in `_reader-model.ts` (`ReaderStream`, `streamFromFirstPage`, `extendStream`, `streamFromRun`, `streamCursor`) merges batches. It dedupes by id, because `from_order` is inclusive and the anchor and any ties come back.
  - Each block is a memoised component in `_stream-block.tsx`, so a scroll step re-renders only the blocks whose props changed.
- **Files:**
  - `src/app/book/[slug]/page.tsx`
  - `src/app/book/[slug]/_stream-block.tsx` (new)
  - `src/app/book/[slug]/_reader-model.ts`
- **Tests:** in `src/app/book/[slug]/_reader-model.test.ts`:
  - «note ٠٢: the opening page is the first stream…»
  - «…batches append in book order; the inclusive anchor is dropped…»
  - «…a 1,000-block book streams to its end in windows, every block once, in order»
  - «note ٠٢: the page renders the stream, with per-block actions, and no single-block navigation». This is a source contract: no `goToNeighbour`, no «الموضع التالي/السابق», no `{activeBlock ? (`.
- **Check live:**
  1. As a Pro subscriber, open `/book/الوسيط_ج1_مصادر_الالتزام`.
  2. Page 1 and the following pages appear one under another as you scroll.
  3. There is no «الموضع التالي» button anywhere.

### NOTE-02-C02: batches load automatically, with a «تحميل المزيد» button
- **Verdict:** built (check live)
- **What was there on main:** `page.tsx:286`. `ensureRun` fetched `from_order` windows only to step one block; nothing was appended to the view.
- **Change:**
  - The opening request asks `?limit=80`, which is the first batch.
  - A bottom sentinel (`sentinelRef` + `IntersectionObserver`, rootMargin 800px) appends the next 80 blocks (`from_order=<last order>`).
  - The sentinel card always shows «تحميل المزيد من الصفحات». It becomes «إعادة المحاولة» after an error.
  - Sharing one in-flight request keeps the sentinel and the button from fetching twice.
  - A batch that adds 0 new blocks while `hasMore` (all `order_index` ties) stops auto-loading and says so. It never skips blocks with `+1`.
  - The DOM is capped at 800 blocks. «متابعة القراءة من هنا» then starts a fresh stream at the last block.
  - «— نهاية الكتاب —» shows at the end.
- **Files:**
  - `page.tsx`
  - `_reader-model.ts`
- **Tests:** «note ٠٢: a window of nothing but order_index ties adds 0 blocks — the caller stops instead of looping». The contract test also asserts `sentinelRef`, `new IntersectionObserver(`, «تحميل المزيد من الصفحات» and `from_order=${`.
- **Check live:**
  1. As a Pro subscriber, open a long book (e.g. `/book/مطالب أولي النهى …الجزء 01`).
  2. Scroll down. New pages append without a click.
  3. Throttle the network in devtools: the «تحميل المزيد من الصفحات» button is visible and loads the next batch.

### NOTE-02-C03: the index follows the scroll; jumping to a place
- **Verdict:** built (check live)
- **What was there on main:**
  - The index highlighted the `activeBlockId` set by clicks only.
  - `handleQuickJump` (`page.tsx:357`) searched loaded blocks only.
  - A section click loaded the whole section (`ensureSection`) and showed one block.
- **Change:**
  - **Following the scroll:** one `IntersectionObserver` over the rendered blocks (band −20% / −60%, as in precedents) sets the block in view. A pure `topmostVisible` picks the first one in stream order.
  - **The index (`_sidebar.tsx`):**
    - It highlights that block and its section.
    - It scrolls its OWN list to it. It never scrolls the window.
    - It renders a bounded slice of 150 chapters centred on the active chapter (`tocWindow`), never thousands of rows. «عرض الأبواب السابقة» and «عرض المزيد» reveal more rows above and below.
  - **Clicking a block row:** `planBlockJump` either scrolls to it, or starts a new stream `from_order=` its order.
  - **Clicking a section title:** it uses the block in the stream, or one `?section_id=…&limit=1` row to find where the section starts. A new stream starts there and continues downward.
  - **«انتقال للصفحة»** (`parseJumpQuery`, Arabic-Indic digits folded):
    - It looks in the stream first, then in loaded blocks.
    - Otherwise it calls the API with `?at_page=P[&at_vol=V]`.
  - **«عرض الصفحات السابقة لهذا الموضع»** prepends with `before_order`. The block on screen stays in place.
  - A guard holds the observer off during programmatic scrolls.
  - **API change (minimal, reported):** `src/app/api/library/books/[slug]/_shape.ts` + `route.ts` gained the `at_page` selection.
    - It resolves the first block with `page_number = P` (and `volume_number = V`), `order_index asc`, `limit 1`.
    - It uses the REQUEST client and public columns only (granted in 20261018_02).
    - It then answers as a `from_order` cursor. The existing paywall mask applies.
    - No such page returns 404 «لا توجد هذه الصفحة في هذا الكتاب»; a failed lookup returns 500.
    - There is no service role and no change to any grant.
- **Files:**
  - `page.tsx`
  - `_sidebar.tsx`
  - `_reader-model.ts`
  - `src/app/api/library/books/[slug]/_shape.ts`
  - `src/app/api/library/books/[slug]/route.ts`
- **Tests:**
  - In `_reader-model.test.ts`:
    - «…a jump scrolls when the stream holds the block, loads from its order when only the index knows it»
    - «…the index highlights the first block, in stream order, that crosses the reading line»
    - «…«انتقال للصفحة» parses page / volume, folds digits, and sends only numbers to the server»
    - «…«عرض ما قبل» prepends the window…»
    - «…a jump back to the book's first block knows it is the start»
    - «…the index renders a bounded slice centred on the chapter being read»
    - The contract test pins `tocWindow(` in `_sidebar.tsx` and asserts there is no `slice(0,` and no `scrollIntoView` there.
  - In `src/app/api/library/books/[slug]/_shape.test.ts`:
    - «note ٠٢: ?at_page= … integers only, alone»
    - «route: at_page resolves on public columns to a from_order cursor…»
- **Check live:**
  1. As a Pro subscriber, open a book on a desktop (the index shows at lg width).
  2. Scroll slowly. The highlighted index row moves with the text.
  3. Click a section far down the index: the text jumps there and keeps scrolling on.
  4. Type `150` (or `٣/٤٧` in a multi-volume row) in «انتقال للصفحة» and press Enter. The stream opens at that page.
  5. A non-existent page turns the box red.

### NOTE-02-C04: «نسخ بالتوثيق» and «إضافة للمسودة» on every block
- **Verdict:** built (check live)
- **What was there on main:** `page.tsx:697–723`. One «نسخ الموضع» and one «إضافة الموضع للمسودة» in the page header, tied to `activeBlock`.
- **Change:**
  - Both actions sit on the head of each stream block (`_stream-block.tsx`).
  - The handlers now take the block: `handleCopyBlock(block)` and `handleAddBlockToDraft(block)`.
  - The copy is the same citation format as before:
    - it copies the selection inside that block, or the whole block;
    - the HTML flavour is now escaped.
  - A locked block:
    - keeps today's lock notice («المعاينة المجانية أول صفحتين…»);
    - offers «نسخ المرجع» (reference only);
    - has NO draft button, as before.
  - The header keeps «طباعة» and «المسودة».
- **Files:**
  - `_stream-block.tsx`
  - `page.tsx`
  - `src/components/library/scopedSearchPanel.test.ts`: one pin moved from `{activeBlock && !activeBlock.locked && (` to `_stream-block.tsx`'s `{!block.locked && (`.
- **Tests:**
  - The contract test (`نسخ بالتوثيق`, `إضافة للمسودة`, `{!block.locked && (` in `_stream-block.tsx`).
  - `scopedSearchPanel.test.ts` «the book reader has the draft cart…».
- **Check live:**
  1. As a Pro subscriber, press «نسخ بالتوثيق» on the third block of a page, then paste into Word. You get the text plus «المرجعية: …، ج x، ص y».
  2. Press «إضافة للمسودة» on two different blocks. The «المسودة» counter becomes 2.
  3. As a guest, blocks past the first two pages show the lock line and no draft button.

### NOTE-06-C04 (book reader only): highlight in the reader's paragraphs and footnotes
- **Verdict:** built (check live)
- **What was there on main:** `page.tsx:902/930/948`. `matn`, `sharh` and `hashiyah` were rendered as plain text, with no `<mark>`.
- **Change:**
  - `<HighlightProvider query={highlightQuery}>` wraps the stream column.
  - `<Hl>` covers the topic, the matn, each sharh paragraph and each footnote. These are plain strings rendered as React nodes, with no `dangerouslySetInnerHTML`.
  - `<SearchLegendBar partial onClear/>` is sticky above the stream. `partial` holds while the whole book is not loaded, since counts are of what is shown.
  - The index search box drives the colours too.
  - `filterToc` now uses the shared grammar (`parseHighlightQuery` / `matchesQuery`: AND, "…", /, *, -, Arabic and digit folding), so the index filter and the colours agree.
- **Files:**
  - `_stream-block.tsx`
  - `page.tsx`
  - `_reader-model.ts`
  - `_sidebar.tsx` (placeholder text)
- **Tests:**
  - The contract test (`<HighlightProvider query={highlightQuery}>`, `<SearchLegendBar … partial`, `<Hl text={…} />` over topic/matn/para/h, no `dangerouslySetInnerHTML`).
  - «note ٠٦: the index filter speaks the search grammar (AND, exclusion) like the highlight».
  - The existing digit and ة/ه filter tests still pass.
- **Check live:**
  1. As a Pro subscriber, type `الماء + الطهارة` in the index box of a fiqh book. Both words are coloured, each in its own colour, in the text and the footnotes.
  2. Clicking a chip walks ↑ ↓ through that word only.

### NOTE-06-C05 (book reader only): carrying `?q=` while keeping the whole document
- **Verdict:** built (check live). This covers the reader side, which is this stream's scope. The `/laws` link side is under Follow-ups.
- **What was there on main:** the reader never read `?q=`.
- **Change:**
  - `?q=` is read on open, from `window.location.search` (no `useSearchParams`, so no Suspense is needed and `layout.tsx` is untouched).
  - It colours the whole stream and hides nothing.
  - On arrival it scrolls once to the first match in the first batch (`useScrollToFirstMark`). It never scrolls after the reader starts loading or jumping.
  - ✕ «مسح الألوان» clears the colours and removes `q` from the URL with `history.replaceState`, keeping any `#hash`.
- **Files:** `page.tsx`
- **Tests:** the contract test (`HighlightProvider` / `SearchLegendBar`).
- **Check live:**
  1. As any account, open `/book/<slug>?q=الوضوء`. The word is coloured and the page scrolls to its first occurrence.
  2. ✕ removes the colours, and the address bar loses `?q=`.

---

### SQL
None.

`_verify.sql`: no new check is needed. The API change reads only columns already granted to anon (`order_index`, `book_id`, `page_number`, `volume_number`).

### Follow-ups and risks
- **Not run live.** Nothing that connects to Supabase may run, so the page was checked by type-check (clean for these files), eslint (0 errors, plus the 2 pre-existing `any` warnings) and unit tests only. Please smoke-test on a deploy.
- **API change outside my file list.** It was strictly needed for «انتقال للصفحة» to reach unloaded pages. It is additive: a new optional query param, and the existing params behave exactly as before.
- **Label-only page tokens.** Tokens such as «مقدمة» or «7-1» can only be found among loaded blocks. The server lookup is numbers only.
- **Guest reading past the free pages.** The stream keeps appending locked blocks (topic, place and lock line, no text). This is honest, but long. A product choice could collapse runs of locked blocks into one card.
- **ResearchWorkspace notes stay keyed per block** (`feqh-<book>-<block>`), so existing notes keep their key. The key follows the block in view only after a 1.5s rest. Owner choice: per-block or per-book notes in a stream reader.
- **Small screens.** Below lg the index is hidden, as before. Jumping there is only through the stream itself and ScopedSearchPanel.
- **Hash links.** A `#book-block-<id>` deep link is not resolved, because the API has no lookup by block id.
- **`?q=` handoff.** Links from `/laws` results to `/book/…` must add `?q=`. That is another stream's file (`withSearchQuery`).

---

## Stream S3-readers-directory — ledger fragment

Branch `lib/S3-readers-directory` (base `ace1f28d`). Commits:
- `bdd7e9ea` feat(search): compileQueryMatcher + circuits directory cross-field filter
- `a42da2eb` feat(directory): one shared CircuitsDirectory for firm + business
- `e55c8462` feat(library): multi-colour highlight in the collection and decree readers + in-document panel
- `e025cdf5` feat(search): Ctrl+K palette on the shared engine
- `13ca119d` fix(search): spacing inside the display:contents highlight provider; deferred highlight in the collection filter

Tests:
- The full `npm run test:unit` ran before the last small commit: 4210 tests, 4203 pass, 7 fail. The 7 failures are exactly the baseline's 7: books series, navigation.consultant, aiFiles/pdf-lib, the libraryAccess end read, grantPurchase, and two trackingWiring tests. There are no new failures.
- The new test files were picked up by the suite's glob.
- After `13ca119d`, these pin files were re-run green: `_reader-highlight.test.ts`, `circuitsDirectory.test.ts` and `scopedSearchPanel.test.ts`.
- `tsc --noEmit`: the only errors are the pre-existing pdf-lib pair in `src/lib/ai/aiFiles*`.

GitNexus: `impact` returned "target not found" (risk UNKNOWN) for `PrincipleBlock`, `highlightSegments`, `GlobalSearch` and `ScopedSearchPanel`, because the index is stale and does not cover this worktree. Grep caller counts instead:
- `PrincipleBlock`: 1 (`precedents/[slug]/page.tsx`).
- `highlightSegments`: 1 (`ScopedSearchPanel.tsx`) plus its test.
- `ScopedSearchPanel`: 3 readers (law, collection, book). Its new `onOpenHit` prop is optional.
- `GlobalSearch`: 1 (`SharedSidebar.tsx`).
- `matchesQuery`: 0 production callers before this stream.

Foundation change (minimal, reported as the brief asks):
- `src/lib/search/multiColorSearch.ts` gains `compileQueryMatcher(parsed)`. It builds the patterns once and returns `(fields) => boolean`.
- `matchesQuery` now delegates to it, so its behaviour is the same and the foundation tests stay green.

---

### NOTE-06-C01 — the multi-colour engine for operators, phrases, exclusion and prefix
- **Verdict:** built (check live)
- **What was there on main:** nothing shared. `src/lib/library/scopedHitActions.ts:227-243` `highlightSegments` was a single-colour literal regex, and `_principle-block.tsx:60` received `searchQuery` and never used it. The foundation engine arrived on the base in `7639992a`.
- **Change:**
  - Checked the engine against each of his examples. All pass:
    - `عزل + المحكمة + 1436` gives three colours;
    - `"عزل الوكيل"` is one colour and beats `عزل`;
    - `اعتزال / عزل` gives two colours and is an OR;
    - `وكيل*` colours the whole word;
    - `-تحكيم` drops the row and is never coloured.
  - Added `compileQueryMatcher` for long lists.
- **Gap (stated, not built):** his note says `وكيل*` should also colour «وكالته». That needs Arabic root analysis, which no prefix match can do. The prefix colours «وكيله» and «الوكيلان» whole.
- **Files:** `src/lib/search/multiColorSearch.ts`
- **Tests:**
  - `src/lib/search/circuitsDirectoryFilter.test.ts`: «note ٠٦ examples: «عزل + المحكمة + 1436», «"عزل الوكيل"», «اعتزال / عزل», «وكيل*», «-تحكيم», 123↔١٢٣, الاثبات↔الإثبات» and «compileQueryMatcher agrees with matchesQuery».
  - `src/lib/search/multiColorSearch.test.ts`: the foundation tests, still green.
- **Check live:** sign in with any Pro account. Open a judicial collection, e.g. `/precedents/<any collection>`. Type `"عزل الوكيل" + المحكمة -تحكيم` in «تصفية المبادئ…»:
  - the phrase is one colour and المحكمة is a second;
  - principles that mention تحكيم disappear from the list;
  - the bar above shows a red, struck-through «🚫 تحكيم» chip.

### NOTE-06-C02 — digits, hamza and harakat equivalence without moving the text
- **Verdict:** built (check live)
- **What was there on main:** `scopedHitActions.ts:233` used a raw `new RegExp(terms…, "gi")`, so `123` did not match `١٢٣` and `الاثبات` did not match `الإثبات`.
- **Change:** `highlightSegments` now runs the shared folded engine (`highlightMultiColorSegments`). It returns `{text, hit, term}`. It still accepts the route's `terms[]`, and also accepts a query string or parsed terms. The panel colours `data.query` parsed by the platform grammar.
- **Files:** `src/lib/library/scopedHitActions.ts`, `src/components/library/ScopedSearchPanel.tsx`
- **Tests:** `src/lib/library/scopedHitActions.test.ts`:
  - «highlightSegments: every occurrence, longest first, prefix to the end of the word, regex-safe». The old assertion expected «تعويض|ات»; it now expects «تعويضات» whole, per the owner's note.
  - «highlightSegments (owner note ٠٦): folded Arabic and digits, one colour per term of the query».
- **Check live:** open any law, e.g. `/laws/<slug>`. In «بحث في نص النظام كاملاً», search `الاثبات`: every «الإثبات» is coloured. Search `1`: Indic digits are coloured too.

### NOTE-06-C03 — a colour bar with counts and navigation per term
- **Verdict:** built (check live)
- **What was there on main:** no bar. `SearchLegendBar` came with the foundation.
- **Change:** the bar is mounted in four places:
  - the collection reader: sticky under the navbar, with `partial` while windows remain;
  - the decree reader: sticky;
  - the in-document panel: its own provider, counts and ↑ ↓;
  - the circuits directory: `partial` while more rows can load.
  
  ✕ «مسح الألوان» clears the local box and also drops `?q=` from the URL with `history.replaceState`; the hash is kept.
- **Files:** `src/app/precedents/[slug]/page.tsx`, `src/app/laws/orders/[slug]/page.tsx`, `src/components/library/ScopedSearchPanel.tsx`, `src/components/directory/CircuitsDirectory.tsx`
- **Tests:** `src/app/precedents/[slug]/_reader-highlight.test.ts` (all 4 tests); `src/components/directory/circuitsDirectory.test.ts`.
- **Check live:** open `/precedents/<collection>?q=عزل` as a Pro account.
  - A bar appears with «عزل (n) في المعروض».
  - Click the chip: ↓ walks only that term's marks. Click it again: all colours return.
  - ✕ removes the colours, and `?q=` disappears from the address bar.

### NOTE-06-C04 — highlight in the readers, the collapsibles and the snippets (my part: `/precedents/[slug]`, `/laws/orders/[slug]`, `ScopedSearchPanel`)
- **Verdict:** partly built. My three surfaces are built (check live). `/laws/[slug]`, `/book/[slug]` and the `/laws` cards belong to other streams.
- **What was there on main:**
  - `_principle-block.tsx:60` had a dead `searchQuery`.
  - `orders/[slug]/page.tsx:654` rendered the pages with `dangerouslySetInnerHTML={{ __html: formatBold(art) }}` and no highlight.
  - `ScopedSearchPanel.tsx:59-73` had a single-colour literal `<mark>`.
- **Change:**
  - **Precedents:**
    - `<Hl>` covers the header (principle number, decision number, court, session date), every paragraph (the memoised `Paragraphs`), the reference, and the facts / reasons / ruling / ruling-basis / grounds collapsible.
    - The collapsible opens on its own when it holds a match. It is set once through a ref with `el.open = true`, not with a controlled `open` prop, so the reader can still close it.
    - The dead prop is removed.
    - The local filter box now uses the same grammar (`compileQueryMatcher`), so the filter and the colours agree.
  - **Orders:**
    - The title, the free preamble and every page are highlighted. The pages use a new `BoldHl` that renders `**…**` as `<strong>` with no `dangerouslySetInnerHTML`. A match that crosses a bold boundary is coloured on each side separately.
    - The summary is highlighted when a search is active. With no search it keeps its `formatBold` path, because `decree-summary-public.test.ts` pins that code.
    - A new box, «ابحث داخل هذا المستند», colours matches and hides nothing.
  - **Panel:** the hits are coloured by the shared engine.
- **Files:** `src/app/precedents/[slug]/_principle-block.tsx`, `src/app/precedents/[slug]/page.tsx`, `src/app/laws/orders/[slug]/page.tsx`, `src/components/library/ScopedSearchPanel.tsx`, `src/lib/library/scopedHitActions.ts`
- **Tests:** `src/app/precedents/[slug]/_reader-highlight.test.ts`, `src/lib/library/scopedHitActions.test.ts`. Existing pins re-run green: `scopedSearchPanel.test.ts`, `decree-summary-public.test.ts`, `library-column-lock.test.ts`, `precedent-series.routes.test.ts`, `_principle-text.test.ts`.
- **Check live:**
  1. As Pro, open a collection and type a word that appears only in «وقائع الدعوى» of some principle. That principle's «🔍 وقائع القضية والتسبيب والمنطوق» opens by itself, with the word coloured. Close it: it stays closed.
  2. Open any decree, `/laws/orders/<slug>?q=<a word from its text>`. The title, preamble and pages are coloured, the page scrolls to the first match, and bold runs stay bold.

### NOTE-06-C05 — pass `?q=` and the position from search, keeping the whole document
- **Verdict:** partly built.
  - Receiving `?q=` is built (check live) on `/precedents/[slug]` and `/laws/orders/[slug]`.
  - Sending `?q=` is built from `ScopedSearchPanel` for principle hits.
  - The `/laws` result cards (`LawsTabContent`, `PrecedentsTabContent`, `OrdersTabContent`, `ListItems`) belong to another stream.
- **What was there on main:** no reader read `?q=`. The collection reader read only `#<principle id>` (`page.tsx:488`). The panel had no jump link.
- **Change:**
  - **`readerArrival(search, hash)`** returns `{query, target}`:
    - the hash wins over `?target=`;
    - `?q=` is capped at 300 characters.
  - **Collection reader:**
    - `?q=` feeds only the `HighlightProvider`. It never reaches `searchQuery`, the filter box, so no principle is hidden (his note ١٢ warning).
    - The target-paging effect now runs on a `jump` request tagged with its slug, from either the hash or `?target=`.
    - With `?q=` and no target, it scrolls to the first match once.
  - **Panel:** «الانتقال للموضع» on a principle hit links to `/precedents/<volume>?q=…#<id>` (`scopedHitHref`).
    - A hit in the open collection is handled in place (`onOpenHit`): colour, page in, scroll, no navigation.
    - Article and fiqh-block hits get NO link, because the law and book readers do not yet scroll to an anchor on load.
- **Files:** `src/lib/search/readerArrival.ts`, `src/app/precedents/[slug]/page.tsx`, `src/app/laws/orders/[slug]/page.tsx`, `src/lib/library/scopedHitActions.ts`, `src/components/library/ScopedSearchPanel.tsx`
- **Tests:**
  - `src/lib/search/readerArrival.test.ts` (4);
  - `scopedHitActions.test.ts` «scopedHitHref: a principle opens in its collection at its id with ?q=; articles and blocks have no link yet»;
  - `_reader-highlight.test.ts` «collection reader: ?q= colours, never filters; the hash or ?target= is the target».
- **Check live:**
  1. As Pro, open a multi-volume collection. In «بحث في كل المجلدات», search a word, then click «الانتقال للموضع» on a hit:
     - in another volume, the page opens at that principle with the word coloured, and the other principles are still there above and below;
     - in the same volume, it scrolls there without reloading.
  2. Paste `/precedents/<collection>?q=عزل&target=<principle id>`: the reader pages in and scrolls to that principle.

### NOTE-07-C01 — cross-field search over name, city and e-mail
- **Verdict:** built (check live)
- **What was there on main:** `dashboard/firm/circuits-emails/page.tsx:221-241` and `dashboard/business/circuits-emails/page.tsx:57-71` tested `field.toLowerCase().includes(wholeQuery)` one field at a time.
- **Change:** `filterCircuits` searches name + category + city + region + e-mail as ONE haystack with folding.
  - On real data, «تنفيذ + الرياض» now returns 213 rows. The old code returned 0.
  - «الدائرة 1» returns exactly the same rows as «الدائرة ١».
  - A digit term has no word boundary: «الدائرة ١» also matches ١٢ and ٣١, the same as the library search.
- **Data fact the owner must know:** the directory has exactly ONE «محكمة تجارية», and it is in Riyadh. So «تجارية جدة» correctly returns 0 on the real data. The tests prove the cross-field logic on synthetic rows. The live check uses «عامة جده».
- **Files:** `src/lib/search/circuitsDirectoryFilter.ts`, `src/components/directory/CircuitsDirectory.tsx`
- **Tests:** `src/lib/search/circuitsDirectoryFilter.test.ts`: «note ٠٧: «تجارية جده»…», «note ٠٧: «تنفيذ + الرياض»…», «note ٠٧: «الدائرة 1» finds «الدائرة ١»; «الاحوال» finds «الأحوال»», and «real data (2,192 rows): …».
- **Check live:** sign in as a firm (or lawyer) account and open `/dashboard/firm/circuits-emails`. Search:
  - `تنفيذ + الرياض`: hundreds of rows;
  - `عامة جده`: the general-court circuits in Jeddah;
  - `الاحوال`: the personal-status courts.

### NOTE-07-C02 — `+`, `/`, `-`, phrases and prefix in the directory
- **Verdict:** built (check live)
- **What was there on main:** none of these operators worked; see the file:line references under C01.
- **Change:** the directory uses the same grammar. A hint line under the box shows examples.
- **Files:** `src/lib/search/circuitsDirectoryFilter.ts`, `src/components/directory/CircuitsDirectory.tsx`
- **Tests:** `circuitsDirectoryFilter.test.ts` «operators in the directory: phrase, OR, prefix, exclusion, e-mail».
- **Check live:** on the firm directory, search `"المحكمة العامة" + جده -الانهائية`, then `الدمام / الخبر`, then `moj.gov` (an e-mail fragment).

### NOTE-07-C03 — unify the three copies of the directory
- **Verdict:** partly built.
  - The firm and business pages now render one shared `CircuitsDirectory`, and each keeps its own header and gating. The business page keeps `<SubscriptionGuard featureKey="business-litigation">`; the firm page had no in-page gate.
  - The third copy, `src/app/ai/procedures/_CircuitsDirectory.tsx`, belongs to the AI session (forbidden to me).
- **What was there on main:** three diverging copies (firm 499 lines, business 317, AI 130).
- **Change:**
  - New `src/components/directory/CircuitsDirectory.tsx`. Its props are `circuits` (rows passed in, so a page can import them statically or lazily), `regions`, `showCategoryFilter`, `showVerificationFilter`, `pageSize` and `searchPlaceholder`.
  - The firm page shows the category and verification chips; the business page shows region only, as before.
- **Files:** `src/components/directory/CircuitsDirectory.tsx`, `src/app/dashboard/firm/circuits-emails/page.tsx`, `src/app/dashboard/business/circuits-emails/page.tsx`
- **Tests:** `src/components/directory/circuitsDirectory.test.ts` «both dashboard pages render the one shared component…» and «the business page keeps its plan gate».
- **Check live:** as a business account with the litigation feature, open `/dashboard/business/circuits-emails`. It has the same search and colours as the firm page.
- **Follow-up for the AI session:** replace the body of `src/app/ai/procedures/_CircuitsDirectory.tsx` with:
  ```tsx
  <CircuitsDirectory circuits={rows} isDark={isDark} />
  ```
  Keep its lazy `import("@/data/circuits-directory.json")`. Its own `CircuitEmail` row would be replaced by the shared card.

### NOTE-07-C04 — multi-colour highlight and continuous loading in the directory
- **Verdict:** built (check live), for firm and business.
- **What was there on main:** no `<mark>` anywhere. Arrow pagination of 30 rows (firm) and 25 (business).
- **Change:**
  - `<Hl>` colours the name, category chip, region, city and e-mail. E-mail matching is case-insensitive.
  - The legend bar sits above the list.
  - An IntersectionObserver sentinel (600px margin) adds a step of rows as the reader scrolls, with «تحميل المزيد (n متبقية)» as the fallback.
  - A new search or filter resets the list to the top.
  - The query is passed through `useDeferredValue` so typing stays smooth over 2,192 rows.
  - One-click copy and `mailto` are kept.
  - `motion.div layout` was dropped from the cards, because it is costly in a growing list.
- **Files:** `src/components/directory/CircuitsDirectory.tsx`
- **Tests:** `circuitsDirectory.test.ts` «cross-field operator search, multi-colour highlight, legend, infinite scroll, copy».
- **Check live:** on `/dashboard/firm/circuits-emails`, type `محكمة + الرياض`:
  - two colours appear in the names and cities;
  - scrolling down keeps loading with no page arrows;
  - the copy button turns into ✓.

### NOTE-07-C05 — the shared engine in the Ctrl+K search, cases, tasks, contracts and clients
- **Verdict:** partly built.
- **What was there on main:** `GlobalSearch.tsx:81-91` used an `indexOf` single-colour highlight and did not pass `?q=`.
- **Change in `GlobalSearch.tsx` (built, check live):**
  - Tools and the account's own rows are filtered with `compileQueryMatcher` (operators and folding).
  - `<Hl>` gives multi-colour highlight.
  - Content rows (documents, service requests) open with `?q=` on both click and Enter.
  - Tool links deliberately do NOT carry `?q=`: the query there is a tool's name, and `/dashboard/client/consultation/new` reads `?q=` as a form prefill.
  - No target page reads `?q=` yet, so the receiving side is a follow-up.
- **Tests:** `src/components/dashboard/globalSearchHighlight.test.ts` (3). Pins re-run green: `navigation.fullOnly.test.ts`, `globalSearchContent.test.ts`, `adminNavByRole.test.ts`.
- **Not done (follow-up).** None of these files is in this stream's ownership, so none were attempted:
  - **cases:** `src/app/dashboard/lawyer/cases/page.tsx`, `src/app/dashboard/firm/cases/page.tsx`, `src/components/dashboard/caseArchive/CaseArchivePanel.tsx`
  - **contracts:** `src/app/dashboard/lawyer/contracts/page.tsx`, `src/app/dashboard/firm/contracts/page.tsx`
  - **clients:** `src/app/dashboard/lawyer/clients/page.tsx`, `src/app/dashboard/firm/clients/page.tsx`
  - **hearings:** `src/app/dashboard/lawyer/hearings/page.tsx`, `src/app/dashboard/firm/hearings/page.tsx`
  - **tasks:** `src/app/dashboard/lawyer/tasks/page.tsx`, `src/app/dashboard/firm/tasks/page.tsx`
  - **activity:** `src/app/dashboard/lawyer/activity/page.tsx`, `src/app/dashboard/firm/activity/page.tsx`
  - **documents vault:** read `?q=` from the palette.
  
  Each is a list filter that can switch to `compileQueryMatcher(parseHighlightQuery(q))` plus `<Hl>`.
- **Check live:** on any dashboard, press Ctrl+K and type `القضايا`, then `عقد + إيجار`. The tool names are coloured per term. Click one of your documents: the URL carries `?q=`.

### NOTE-07-C06 — the shared engine in the blog, community, marketplace, templates and AI search
- **Verdict:** not done (follow-up)
- **What was there on main:** each page has its own substring filter.
- **Files that would change:**
  - `src/app/blog/page.tsx` and `src/app/blog/[slug]/page.tsx`: read `?q=` and add `<Hl>` in the article body;
  - `src/app/community/page.tsx` and the question page;
  - `src/app/marketplace/page.tsx`;
  - `src/app/ai/templates/**`, which is FORBIDDEN here (AI session);
  - `src/components/ResearchWorkspace.tsx`;
  - `src/app/ai/gov/judicial-search/page.tsx`, which is FORBIDDEN here (AI session).
- **Tests:** none.
- **Check live:** nothing to check yet.

---

### SQL
None. Nothing in this stream touches the database. No `_verify.sql` lines are proposed.

---

### Follow-ups and risks
1. **Nested providers double-count.**
   - `SearchLegendBar` counts every `mark[data-hl-term]` under its provider root. If the law or book reader stream wraps `ScopedSearchPanel` inside its own `HighlightProvider`, the reader's chips and ↑ ↓ will also count the panel's marks, whose term indexes belong to a different query.
   - On precedents, the provider wraps the reader column only, below the panel.
   - Possible foundation fix (not done): stamp each mark with a provider `useId` and filter on it.
2. **Article and fiqh hits have no jump link.** «الانتقال للموضع» exists for principle hits only. When the law and book readers scroll to `#<article id>` or `#<block id>` on load, extend `scopedHitHref` in `scopedHitActions.ts` (one `if` each) and its test.
3. **The `/laws` cards do not send `?q=` yet.** That is another stream's work. They should build links with `withSearchQuery(principleHref(col, id), q)`; this reader already handles `?q=` with `#id`, and `?q=` with `&target=`.
4. **AI directory copy (forbidden here).** `src/app/ai/procedures/_CircuitsDirectory.tsx` should switch to `CircuitsDirectory`; see C03.
5. **Decree summary.**
   - With no search active, the summary still renders through `formatBold` + `dangerouslySetInnerHTML`; that is the existing, escaped path, pinned by `decree-summary-public.test.ts`.
   - With a search active it renders `BoldHl`.
   - If that test is relaxed later, the summary can use `BoldHl` always.
6. **Root forms.** `وكيل*` cannot colour «وكالته»; that needs a stemmer.
7. **Digit terms have no word boundary.** «الدائرة ١» also matches ١٢ and ٣١.
8. **Counts cover loaded windows only.** On a collection with more windows to load, `?q=` alone does NOT load the rest; that is deliberate, as it can be up to 2,323 principles. The bar says «في المعروض». Typing in the filter box still loads every window, as before.
9. **Line endings.** The working copies are CRLF (autocrlf) and the repo stores LF. My edits kept each file's endings; `git diff --stat` shows only real line changes.

---

## S4-catalogue — ledger fragment

Branch `lib/S4-catalogue` (base `ace1f28d`). Commits, oldest first:

| SHA | What |
|---|---|
| `2d14f7a9` | Precedent title-fallback series, clean collection excerpts, law card badges and dates (notes ٠٣, ١٢-٤/٥/٦/ب/ج) |
| `b67daaea` | Search route: latest legislative date and guest موجز on law hits; collection meta on principle hits (١٢-١/٦) |
| `95464924` | Search hits grouped under their collection or book, deep-linked and highlighted (١٢-١, ١٢-أ) |
| `6a4952c6` | Every /laws result link carries the search as `?q=` (٠٦, second track) |
| `4a3d210f` | Instant box: opens the document, badges, distinctive law names; principle snippets per viewer (١٢-٢) |
| `ab48936c` | Test: the instant box's two highlight sinks both go through highlightSearchHtml (١٢-٢) |
| `533f8bb8` | The category chip on «الكل» searches laws and orders instead of erroring (١٢-د) |
| `b3fb46bd` | «حفظ في مجلد» on every /laws result card (٠٤, last bullet) |
| `6aaeb3fe` | «هل تقصد …؟» plus the closest 10 titles for a search that finds nothing (١٢-٣) + migration `20261030_62` |
| `d90f9dd4` | Test: pins 12 principles a page and the fiqh counter (١٢-ب, ١٢-ج) |

**Tests.**
- Full unit suite (`node --test "src/**/*.test.ts"`): 4216 tests, 4209 pass, 7 fail.
- The 7 failures are the pre-existing baseline, as named in this run:
  - «route: the volume series (T28-24) …» (books/[slug]);
  - «the lawyer dashboard hides the hearings and deadlines cards … from a consultant»;
  - aiFiles;
  - «the end read takes the latest ends_at after now …»;
  - «grantPurchase keys every grant on the order»;
  - «the insert and revoke policies and the snapshot use the maker rule …»;
  - «review 2026-10-26: no v1 fallback …».
- None touches a file in this stream. After the run, `d90f9dd4` added `src/app/laws/catalogue-pins.test.ts` (2 tests, both pass).
- No new failure.
- `tsc --noEmit`: no error outside the pre-existing `src/lib/ai/aiFiles*` pair.

**GitNexus.** `impact` returned "target not found" for `groupCollectionVolumes`, `PrecedentsTabContent` and the other edited components, because the index is stale. Risk is therefore UNKNOWN. Grep caller counts instead:
- Each tab component (`LawsTabContent`, `PrecedentsTabContent`, `FeqhTabContent`, `OrdersTabContent`) has 1 caller: `app/laws/page.tsx`.
- `CollectionSeriesCard`: 1 caller (PrecedentsTabContent).
- `OrderCard`/`OrderRow`: 2 callers (OrdersTabContent, LawsTabContent).
- `groupCollectionVolumes`: 2 callers (PrecedentsTabContent, `buildCollectionSeries`, the latter used by `api/library/precedents/[slug]`).
- `validateSearchRequest` and `combineSearchOutcomes`: 1 caller each, the search route.
- No HIGH or CRITICAL signal was available.

**No browser check was run.** The dev server reads `.env.local` and would talk to Supabase, which the brief forbids. Everything below is "check live".

**Merge note.** `page.tsx` reads `law.latest_legislative_update` from `/api/library/init`. That field is S1a's change, so the footer date shows only once S1a is merged. `FolderSelectionModal` is used through its props only; S5 changed its inside.

---

### NOTE-03-C01 — multi-volume judicial collections become one card (title fallback)
- **Verdict:** partly built.
- **What was there on main:** `src/lib/library/precedentVolumes.ts:166`. `groupCollectionVolumes` grouped by `series_id` only. Untagged volumes («… — المجلد 2») each got their own card.
- **Change:**
  - Untagged volumes of ONE court whose titles end «المجلد / الجزء N» are now grouped. Accepted suffixes: `— المجلد 2`, `(الجزء 3)`, `: المجلد الأول`.
  - The fallback key is folded court + base title.
  - An untagged volume joins the one tagged series with the same key.
  - `buildCollectionSeries` uses the same grouping, so the reader's volume selector agrees with the catalogue.
- **Why only partly:** the reader's volume switcher for an untagged series still needs `api/library/precedents/[slug]/route.ts` to query siblings by title. That route is not in this stream's files and has a source-pinned `series_id` lookup.
- **Files:** `src/lib/library/precedentVolumes.ts`, `src/app/laws/components/PrecedentsTabContent.tsx` (`court` passed through).
- **Tests:** `src/lib/library/precedentVolumes.test.ts`:
  - «note ٠٣: untagged volumes of one court group by title»;
  - «… suffix forms»;
  - «… different courts / non-volume titles stay apart»;
  - «… an untagged volume joins its tagged series»;
  - «… reader selector».
- **Check live:**
  1. As a guest, open `/laws` → «المبادئ والسوابق».
  2. A collection published in several volumes without a series tag (e.g. «المبادئ والقرارات … — المجلد 1 / 2») shows as ONE card with volume chips.
  3. Each chip opens its volume.

### NOTE-03-C02 — no «## ديباجة» heading or raw Markdown on collection cards
- **Verdict:** built (check live).
- **What was there on main:** `src/app/laws/page.tsx:1180` (`desc: col.description || ""`). The raw description, including «## ديباجة» and `**`, reached the card.
- **Change:**
  - New `collectionCardExcerpt()` drops leading heading and «ديباجة» lines when text follows them, strips the Markdown marks and joins the lines.
  - It is used by the catalogue list, the search collection hits and `CollectionSeriesCard`.
- **Files:** `src/lib/library/precedentVolumes.ts`, `src/app/laws/page.tsx`, `src/app/laws/components/CollectionSeriesCard.tsx`.
- **Tests:** `precedentVolumes.test.ts` «collectionCardExcerpt: no ديباجة heading, no Markdown».
- **Check live:** as a guest, on `/laws` → «المبادئ والسوابق», no card starts with «## ديباجة», «#» or «**».

### NOTE-03-C04 — external data (owner's next load)
- **Verdict:** data-dependent (needs owner's next load).
- **What was there on main:** this is a data item (series tags and volume titles in the owner's export), not code.
- **Change:** none. The code above groups correctly once `series_id`, or the «المجلد N» title convention, is in the data.
- **Check live:** after the next load, as a guest, on `/laws` → «المبادئ والسوابق», the owner's multi-volume sets each show as one card.

### NOTE-12-C01 — principle and fiqh hits under their parent card, deep-linked, highlighted
- **Verdict:** built (check live). The reader side has a gap, listed under Follow-ups.
- **What was there on main:**
  - `src/app/api/library/search/route.ts:670` titled each hit `مبدأ رقم ${principle_number} — …` («مبدأ رقم null» when there was no number).
  - The page then showed orphan principle cards with no collection name, and one card per fiqh passage.
- **Change:**
  - `searchHitGroups.ts` builds one card per collection, with its matching principles as rows. A collection found by its title AND by its principles is one card. It also builds one card per book, with its passages as rows.
  - Rows link to `reader?target=<id>&q=<query>#<id>`. A locked row shows its label and a lock, never text. The card title opens the parent with `?q=`.
  - New `SearchHitGroupCard` renders the card with `<Hl>` highlighting, `+ N أخرى`, and the lock.
  - Wired into the Precedents tab (12 groups a page), the Fiqh tab and the «الكل» view. Browse mode is unchanged.
  - Search route:
    - the principle title uses a real number only;
    - meta gains `collectionTitle`, `track` and `principleNumber`;
    - a fiqh passage gains `topic`.
  - `page.tsx` keeps the server's `locked` on principles and wraps the results in `HighlightProvider`.
  - Highlighting only: nothing in a reader is hidden.
- **Files:**
  - `src/app/laws/searchHitGroups.ts` (new);
  - `src/app/laws/components/SearchHitGroupCard.tsx` (new);
  - `src/app/laws/components/PrecedentsTabContent.tsx`, `FeqhTabContent.tsx`, `LawsTabContent.tsx`;
  - `src/app/laws/page.tsx`;
  - `src/app/api/library/search/route.ts`.
- **Tests:** `src/app/laws/searchHitGroups.test.ts`:
  - «deepHitHref …»;
  - «١٢-١: principles sit under their collection …»;
  - «rows are capped …»;
  - «١٢-١: fiqh passages sit under their book …»;
  - «source: the tabs render grouped search cards …».
- **Check live:**
  1. As a guest, then as Pro, search `/laws` for «عزل» on «المبادئ والسوابق».
  2. Each card is a collection named by its title, listing «مبدأ رقم (N)» rows with the word coloured.
  3. A row opens `/precedents/<collection>` at that principle, coloured, with the other principles still listed.
  4. On «الفقه والمراجع», one card per book lists its passages.
  5. As a guest, a locked principle row shows a lock and no text.

### NOTE-12-C02 — instant box: distinctive names, badges, snippet, open on click; no snippet leak
- **Verdict:** built (check live).
- **What was there on main:**
  - `src/app/api/library/autocomplete/route.ts:201-204` sent every principle's first 120 characters to every viewer, titled «مبدأ رقم null — undefined» when there was no number.
  - `src/app/laws/page.tsx:1543` copied the suggestion's title into the search box instead of opening it.
- **Change:**
  - Route:
    - reads the viewer's access (`getLibraryAccessForUser`) alongside the facets;
    - sends a principle's snippet only when `isFreeLibraryItem` allows it (no access answer → locked);
    - each row carries `kind`, `href`, `locked` and `lawType`;
    - the principle fallback selects `collection_id`;
    - the body is tier-shaped, so it is sent with `TIER_SHAPED_CACHE_CONTROL`.
  - `instantBox.ts`:
    - badges [نظام|لائحة|مبدأ|فقه|أمر];
    - `lawNameCore()`: 2–3 words after the generic head, lengthened while another title shares them, so «المرافعات الشرعية» and «المرافعات أمام» stay two names;
    - the document href gets `?q=`.
  - The page shows the core in bold, the full title and the snippet. A click calls `router.push(href)`. With no link (a principle outside any collection), the click switches to that section's results.
- **Files:**
  - `src/app/api/library/autocomplete/route.ts`, `facets.ts` (TopMatch fields);
  - `src/app/laws/instantBox.ts` (new);
  - `src/app/laws/page.tsx`;
  - `src/app/laws/highlightSearchHtml.test.ts` (updated on purpose: two escaped sinks).
- **Tests:**
  - `src/app/laws/instantBox.test.ts`:
    - «١٢-٢: the name core is short and distinctive»;
    - «… the two مرافعات laws never collapse into one name»;
    - «… badges»;
    - «… a click opens the document with ?q=»;
    - «instantBoxItems: a locked row carries no snippet …»;
    - «source: the box opens the document; the route locks principle snippets per viewer».
  - `highlightSearchHtml.test.ts`: the sink contract.
- **Check live:**
  1. As a guest, type «المرافعات» in the `/laws` box. The two مرافعات laws show two different bold names, each with a [نظام] badge.
  2. Clicking one opens that law with the word coloured.
  3. Type a word from a paid principle. Its row shows a lock and no text.
  4. As Pro, the same row shows the text.

### NOTE-12-C03 — zero results: «هل تقصد …؟» + the closest 10
- **Verdict:** built (check live). It works only once the SQL below is run.
- **What was there on main:** no suggestion. A zero-result search showed only `src/app/laws/components/LawsTabContent.tsx:1169` («لا توجد نتائج تطابق بحثك في: …») or `ListItems.tsx:589`.
- **Change:**
  - Migration `20261030_62`, `library.search_title_suggestions`:
    - pg_trgm `word_similarity` on folded TITLES only (laws, judicial collections, fiqh books);
    - laws in force come before repealed ones;
    - score ≥ 0.4, at most 20 rows;
    - service_role only, 3 s limit.
  - New `GET /api/library/search/suggest`:
    - uses the service role and returns titles plus the public status only;
    - returns `[]` on a missing function or any error.
  - Page: on a settled zero-result search with no degraded section, it shows «هل تقصد: <first>؟». Clicking it re-searches with that title. Up to 10 title links follow.
- **Files:**
  - `supabase/migrations/20261030_62_library_title_suggestions.sql`;
  - `src/app/api/library/search/suggest/route.ts`, `suggestions.ts` (new);
  - `src/app/laws/page.tsx`.
- **Tests:** `src/app/api/library/search/suggest/suggestions.test.ts`:
  - «١٢-٣: rows → «هل تقصد» items …»;
  - «source: the route calls the title function with the service role and degrades to []». This also pins the SQL grants, search_path and timeout, and that only titles are read.
- **Docker** (postgres:16, scratch only; never prod):
  - **C.UTF-8:**
    - «نضام العمل» → نظام العمل (0.636), then the repealed «نظام العمل والعمال»;
    - «المرافعت» → both مرافعات laws (0.778);
    - «الشركه» → نظام الشركات (0.714);
    - «المغنى» → المغني (1.0);
    - «xyzxyz» → 0 rows;
    - limit clamp works;
    - anon is denied;
    - a re-run is idempotent.
  - **LC_CTYPE C:** `show_trgm` of Arabic is `{}` and the function returns 0 rows. The page then stays plain.
  - **pg_trgm already in `public`:** the function binds to `public`.
- **Check live:** after the SQL, as a guest, search `/laws` for «نضام العمل». Above the empty result, «هل تقصد: نظام العمل؟» appears with a list of close titles. Each opens its document.

### NOTE-12-C04 — no «مُحدّث»; prominent merged badge; red repealed frame wins
- **Verdict:** built (check live).
- **What was there on main:** `src/app/laws/components/LawsTabContent.tsx:406` showed a fixed «مُحدّث» on every card. The merged file was a faint 8.5px «لائحة تنفيذية» chip (`LawsTabContent.tsx:439` grid, `:547` list).
- **Change:**
  - «مُحدّث» is removed in both layouts.
  - New `mergedFileBadge()` gives «📚 ملف مدمج · شامل اللائحة التنفيذية», or just «📚 ملف مدمج» when the title already says ولائحته. It is sky-coloured and opens the regulation view.
  - On a repealed law the badge is muted, and the red frame and badge stay first.
- **Files:** `src/app/laws/catalogueCardLabels.ts` (new), `src/app/laws/components/LawsTabContent.tsx`, `src/app/laws/page.tsx` (`hasMerged`).
- **Tests:** `src/app/laws/catalogueCardLabels.test.ts`:
  - «١٢-٤: the merged badge …»;
  - «source: no fixed «مُحدّث» badge …».
- **Check live:** as a guest, on `/laws` → «الأنظمة», no card says «مُحدّث». A law with a merged regulation shows «📚 ملف مدمج …», and clicking it opens the regulation. A repealed law keeps its red frame.

### NOTE-12-C05 — merged file name «الأصل + فرعي + فرعي + N أخرى»
- **Verdict:** data-dependent (needs owner's next load). It is also an owner decision.
- **What was there on main:** no name. `library.laws` has only `has_merged_regulation` (boolean), read in `src/app/laws/page.tsx` as `hasMerged`; the card showed the type chip at `LawsTabContent.tsx:439`.
- **Change:**
  - `mergedFileName()` is built and tested. It drops the base title repeated inside a subsidiary name and skips blanks and duplicates.
  - It is NOT wired: the subsidiary names are not in the database, and note ١٢ §٥ leaves open whether to show the full name or «لوائحه التنفيذية».
- **Files:** `src/app/laws/catalogueCardLabels.ts`.
- **Tests:** `catalogueCardLabels.test.ts` «١٢-٥: الأصل + ≤2 فرعي + «+ N أخرى» …».
- **Check live:** nothing yet.

### NOTE-12-C06 — footer «آخر تحديث تشريعي» (UI side); no «صدر» for guests
- **Verdict:** built (check live). It depends on S1a's init field.
- **What was there on main:** `LawsTabContent.tsx:503` (grid) and `:611` (list) footer showed «صدر: …» only, and a guest saw `—` (the T28-22 lock, `:291`).
- **Change:**
  - `lawCardDates()` gives «آخر تحديث تشريعي: 1448/01/08هـ» to everyone. It reads `latest_legislative_update` from init (S1a) for the catalogue and `meta.latestLegislativeUpdate` for search hits.
  - The search route computes that value with the service role, best-effort, as the date alone.
  - «صدر» is shown only when official metadata is not locked, and only when it is a different date from the update.
  - A law title hit's summary passes `summaryForViewer` for non-subscribers.
- **Files:** `catalogueCardLabels.ts`, `LawsTabContent.tsx`, `page.tsx`, `src/app/api/library/search/route.ts`.
- **Tests:** `catalogueCardLabels.test.ts`:
  - «١٢-٦: «آخر تحديث تشريعي» for everyone …»;
  - the source-contract test.
- **Check live:**
  1. As a guest, every law card footer shows «آخر تحديث تشريعي: …هـ» and no «صدر».
  2. As Pro, «صدر: …» also shows when it is a different date.
  3. Search «نظام العمل»: the card shows the same footer.

### NOTE-12-C09 — law article boxes deep-link with ?q= (١٢-أ)
- **Verdict:** built (check live).
- **What was there on main:** `LawsTabContent.tsx:349`. The matching-article `<li>` was plain text.
- **Change:**
  - Each article label is a link to `/laws/<slug>?target=<article id>&q=<query>#<article id>`.
  - Decision ١٦٠: a locked law still opens, and its page gates the text.
  - The snippet is coloured with `<Hl>`.
- **Files:** `LawsTabContent.tsx`, `searchHitGroups.ts` (`deepHitHref`).
- **Tests:** `searchHitGroups.test.ts` «source: … links carry ?target= and ?q= …».
- **Check live:** search «الوكيل» on «الأنظمة». Under a law, click «المادة N». The law opens at that article, coloured (the law reader is S1b).

### NOTE-12-C10 — principles tab 3 → 12 per page (١٢-ب)
- **Verdict:** built (check live).
- **What was there on main:** `PrecedentsTabContent.tsx:149` (`itemsPerPage = 3`).
- **Change:** `PRINCIPLES_PER_PAGE = 12`. In search mode this applies to grouped cards.
- **Files:** `PrecedentsTabContent.tsx`.
- **Tests:** `src/app/laws/catalogue-pins.test.ts` «١٢-ب: the principles tab lists 12 a page» (`d90f9dd4`).
- **Check live:** as a guest, `/laws` → «المبادئ والسوابق» lists 12 principles a page.

### NOTE-12-C11 — fiqh counter in the instant box (١٢-ج)
- **Verdict:** built (check live).
- **What was there on main:** `src/app/laws/page.tsx:1522-1528`. The box's distribution badges named three sections. Fiqh was missing, though the API counts it.
- **Change:** added the «الفقه والمراجع (N)» badge (API count, «أكثر من ١٬٠٠٠», or degraded).
- **Files:** `src/app/laws/page.tsx`.
- **Tests:** `src/app/laws/catalogue-pins.test.ts` «١٢-ج: the instant box counts the fiqh section beside the other three» (`d90f9dd4`).
- **Check live:** as a guest, type «الطهارة» in the `/laws` box. The header shows four counters, including «الفقه والمراجع».

### NOTE-12-C12 — the category chip on «الكل» must not error (١٢-د)
- **Verdict:** built (check live).
- **What was there on main:**
  - `src/app/laws/page.tsx:294` rejected any category outside laws/orders with «مرشح التصنيف يطبّق على الأنظمة والأوامر فقط؛ لم يُنفذ البحث.».
  - `filters.ts` also rejected every filter on `section=all`.
- **Change:**
  - `filters.ts`: `section=all` accepts a category (only a category). `sectionsToSearch()` returns laws and orders.
  - Route: runs only those two sections. `combineSearchOutcomes(…, ran)` keeps the other two at 0/exact and out of `degraded`. If both run sections fail, it still returns 503.
  - Page:
    - a precedents or fiqh search with a category still fails closed;
    - «الكل» reads laws/orders counts only;
    - a status note says why principles and fiqh are absent.
- **Files:**
  - `src/app/api/library/search/filters.ts`, `route.ts`, `searchPlan.ts`;
  - `src/app/laws/page.tsx`, `searchCounts.ts`.
- **Tests:**
  - `filters.test.ts`:
    - «١٢-د: section=all accepts a category, and then searches laws and orders only»;
    - the old scope cases now use category + track (still rejected).
  - `route-fail-closed.test.ts` «١٢-د: section=all + category — the two sections run …».
  - `search-request-filter-scope.test.ts`: guard updated, plus «١٢-د: «الكل» + category reads laws and orders counts only, with a note».
- **Check live:** as a guest, on `/laws`, «الكل» tab, pick a category chip (e.g. العمل) and search «عقد». Laws and orders appear with the note «التصنيف المختار يُطبَّق على الأنظمة والأوامر…», and there is no red error.

### NOTE-06-C05 — every /laws result link carries ?q= (sending side)
- **Verdict:** built (check live). Reader sides: S1b (laws), S2 (books), S3 (precedents, orders).
- **What was there on main:**
  - `LawsTabContent.tsx:1133/1143` and `OrdersTabContent.tsx:114/124` used `router.push(\`/laws/orders/${o.id}\`)`;
  - collection, book and principle links had no query either.
- **Change:**
  - `resultHref(href, q)` adds `?q=` and keeps the `#hash`. It does nothing for `"#"` or an empty link, or when the query is under 2 characters.
  - Applied to collection cards (both tabs and the series volume chips), principle cards, precedent judgments, orders and fiqh book cards.
  - Law cards already used `withSearchQuery`.
- **Files:**
  - `searchHitGroups.ts`;
  - `PrecedentsTabContent.tsx`, `FeqhTabContent.tsx`, `LawsTabContent.tsx`, `OrdersTabContent.tsx`, `ListItems.tsx`, `CollectionSeriesCard.tsx`.
- **Tests:** `searchHitGroups.test.ts` «٠٦-C05: resultHref adds ?q= and keeps the #hash …».
- **Check live:** as a guest, then as Pro, search any word on each `/laws` tab and open a result. The address bar ends with `?q=<word>` (before any `#`), and the reader colours it.

### NOTE-04-C04 — «حفظ في مجلد» on result cards
- **Verdict:** built (check live).
- **What was there on main:** no save button on the /laws cards. Only readers opened `FolderSelectionModal` (`src/app/laws/[slug]/page.tsx:1675`, `src/app/book/[slug]/page.tsx:1074`, `src/app/laws/orders/[slug]/page.tsx:26`).
- **Change:**
  - `saveToFolder.ts` turns a card into the modal's `currentDoc`. Types: law → "law"; collection → "precedent" (slug = collection id); order → "order"; book → "book". No id or title → no button.
  - `SaveToFolderButton` is a real `<button>` that stops the click. It sits beside the card's `<Link>`, never inside it.
  - It is on:
    - law cards (grid and list);
    - collection cards (both tabs and the series card);
    - grouped principle and fiqh search cards;
    - order cards (grid and row);
    - fiqh book cards (tab and «الكل»).
  - One `FolderSelectionModal` lives in `page.tsx`, used through its props only.
- **Files:**
  - `src/app/laws/saveToFolder.ts` (new);
  - `components/SaveToFolderButton.tsx` (new);
  - the four tabs, `ListItems.tsx`, `CollectionSeriesCard.tsx`, `SearchHitGroupCard.tsx`;
  - `page.tsx`.
- **Tests:** `src/app/laws/saveToFolder.test.ts`:
  - «٠٤: each result card type becomes the folder modal's currentDoc»;
  - «… no id or no title → no button»;
  - «source: the four card types carry the button; one modal …».
- **Check live:**
  1. As a lawyer, on `/laws`, press the bookmark icon on a law, a collection, an order and a fiqh book.
  2. The folder dialog opens for that document. Pick a folder.
  3. Under «مجلداتي», the folder now lists it.
  4. Pressing the icon does not also open the document.

---

### SQL

**File:** `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261030_62_library_title_suggestions.sql`

**Order vs deploy:** either order.
- Before the deploy: nothing calls it yet.
- After the deploy: until it runs, `/api/library/search/suggest` answers `[]` (PGRST202/42883) and the page shows the plain «لا نتائج».
- It creates `pg_trgm` in `extensions` if missing; if pg_trgm is already installed elsewhere, it reuses that schema. It also runs `notify pgrst, 'reload schema'`.

**SELECT check (at the end of the file).** Expected first row:

| function_exists | pg_trgm_schema | anon_can_execute | service_role_can_execute | lc_ctype | typo_suggestions |
|---|---|---|---|---|---|
| 1 | extensions | f | t | C.UTF-8 or en_US.UTF-8 (NOT `C`) | ≥ 1 (2 in Docker) |

Second SELECT: `select extensions.show_trgm('نظام العمل')`.
- Expected: a non-empty array of hashed trigrams, e.g. `{0xb65356,0xdf3048,…}`.
- `{}` means the database's LC_CTYPE is `C`. The feature then stays silent; nothing breaks.
- If `pg_trgm_schema` printed another schema, use that schema in this line.

**Proposed `_verify.sql` lines** (not edited — per the brief):
```sql
-- 20261030_62 — title suggestions («هل تقصد»)
select 'search_title_suggestions exists' as check,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'library' and p.proname = 'search_title_suggestions') as ok;
select 'search_title_suggestions not executable by anon' as check,
       not has_function_privilege('anon', 'library.search_title_suggestions(text, integer)', 'execute') as ok;
```

**Rollback:** `drop function if exists library.search_title_suggestions(text, integer);` then `notify pgrst, 'reload schema';`.

---

### Follow-ups and risks

1. **Readers must consume `?target=` and `#id`:**
   - Precedents: S3's `readerArrival` handles hash or `?target=` (check after the merge).
   - Laws: S1b scrolls to `#<article id>`.
   - Books: my fiqh rows link `/book/<slug>?target=<passage id>&q=…#<passage id>`, but the book reader's DOM id is `book-block-<id>`. The S2 reader (or a later change) should read `?target=` or map the hash, or the row lands at the top of the book with the word coloured.
2. **Rate limit for `GET /api/library/search/suggest`:** `src/lib/rateLimitRoutes.ts` (not this stream's file) should add `{ method: "GET", re: /^\/api\/library\/search\/suggest$/ }` next to autocomplete. It is a service-role RPC: cheap (3 s cap, small tables) but unauthenticated.
3. **Autocomplete latency:** autocomplete now also reads the viewer's library access (auth + access lookup) on each debounced keystroke. It runs in parallel with the facets, but it is one more round trip.
4. **NOTE-03-C01 reader side:** the volume selector for an UNTAGGED series needs `api/library/precedents/[slug]/route.ts` to look up siblings by court + base title (`collectionFallbackKey`). That route is outside this stream.
5. **NOTE-12-C05:** wire `mergedFileName()` once the merged instruments' names exist in the data and the owner picks the wording.
6. **Locale risk for ١٢-٣:** if the production DB's LC_CTYPE is `C`, pg_trgm sees no Arabic letters and «هل تقصد» never appears. The SELECT check shows this.
7. **Grouped search cards** group only the hits loaded so far (the API pages hits, not collections). «+ N أخرى» counts loaded hits, and the section count label stays the API's.
8. **Merge check with S3:** `buildCollectionSeries` now uses the title-fallback grouping, so the `series` that `api/library/precedents/[slug]` returns can change for untagged volumes. That route and its reader are S3's; check both together at the merge.
9. **Docker:** cleaning my scratch container, I ran `docker container prune -f`. That removed ALL stopped containers on this machine (260.6 MB), not only mine. Running containers (cardsuite, cardgate, searxng) were untouched; images and volumes are kept. If the user had a stopped container they needed, it has to be re-created from its image or compose file.

---

## S5-folders — ledger fragment

Branch `lib/S5-folders` (base `ace1f28d`). Commits:
- `f3b052f6` fix(library): «ملاحظاتي وتحديداتي» Arabic titles + type badges (٠٣ §٢.٢)
- `fa53fc95` fix(library): folder «⋮» menu portal + empty-folder button (٠٤ §١)
- `906971b2` feat(library): real-library «إدارة المحتوى»; save dialog finish button (٠٤ §٢, ٠٥, LIVE-F23)

Full suite after the last commit: 4218 tests, 4211 pass, 7 fail — exactly the 7 baseline failures (books/[slug] series, navigation.consultant, aiFiles, libraryAccess end read, fulfillOrder grantPurchase, two trackingWiring). No new failure. `tsc --noEmit`: no error in any touched file (only the pre-existing aiFiles/pdf-lib pair). ESLint: warnings only (existing set-state-in-effect / no-explicit-any patterns), no errors.

GitNexus `impact` (index 675 commits behind): FolderCard → 0 callers, risk UNKNOWN; FolderSelectionModal, SmartFolders, MyNotesSection → "target not found", UNKNOWN. Grep callers instead: FolderSelectionModal is opened by 4 reader pages (laws/[slug], precedents/[slug], book/[slug], laws/orders/[slug]); SmartFolders, MyNotesSection, RecentSessions by app/laws/page.tsx; SmartFolder type re-export by laws/orders/[slug]. No HIGH/CRITICAL signal (none available).

No browser check was run: the dev server reads `.env.local` and would talk to Supabase, which the brief forbids. Everything below is "check live".

---

### NOTE-03-C03 — «ملاحظاتي وتحديداتي»: Arabic title + correct type badge
- **Verdict:** built (check live)
- **What was there on main:** `src/app/laws/components/MyNotesSection.tsx:28-98` — `getCleanDocumentName(pageId)` turned the page key itself into the name (dashes → spaces), and `getCategoryInfo` tested `precedents-`/`judgment-`, prefixes no reader writes; the precedent reader writes `precedent-principles-<slug>` (`precedents/[slug]/page.tsx:976`), so every judicial note was badged «الأنظمة واللوائح» and linked to `/laws/precedent-principles-…`; books (`feqh-<book>-<block>`) linked to `/laws/…` too.
- **Where title/type live (the source):** a note row stores ONLY `page_id` (`public.law_article_notes`, migration 20260906; guests: `sticky_note_text_<key>` localStorage). There is no title or type column. Adding one would need the notes API and ResearchWorkspace (not this stream's files) plus a migration, so the fix is at read time: the key is parsed correctly and the title comes from the library.
- **Change:**
  - `noteDocRef.ts` parses all four reader keys (law slug, `order-<uuid>`, `precedent-principles-<collection>`, `feqh-<book>-<block>`, plus the old `precedents-`/`judgment-`/`orders-`/`book-` guest keys), gives the owner's four badges (الأنظمة واللوائح / المبادئ والسوابق القضائية / الكتب والمراجع / الأوامر والتعاميم), builds the right reader link.
  - Titles: ONE batched call, new `POST /api/library/folders/titles` (≤ 100 ids per table, far under the ~396 `.in()` ceiling; decree ids must be uuids or are dropped). Library-gated, request client only (titles are anon-readable; no locked column touched). Books: the key `feqh-<book>-<block>` is ambiguous (both ids may contain «-»), so every split is sent and the longest book id the library knows wins.
  - Fallback (said which): while the lookup runs a row shows «جارٍ جلب العنوان…» (never a half-English slug); after it, a missing title shows the decoded humanised id; a bare decree uuid shows «أمر أو تعميم».
  - Header count now «N مستند به ملاحظات» (was «نظام»).
  - Same lookup names OLD folder items saved with no title (`smartFolderApiMapper.titleLookupForFolders/applyResolvedTitles`, used by SmartFolders; display only).
- **Files:** `src/app/laws/components/MyNotesSection.tsx`, `src/app/laws/components/noteDocRef.ts` (new), `src/app/api/library/folders/titles/route.ts` (new), `src/app/api/library/folders/validate.ts` (`checkTitleLookup`), `src/app/laws/components/smartFolderApiMapper.ts`, `src/lib/auth/accountFreezeWrites.test.ts` (one ALLOWED line: the titles route is a read — POST for the body — like library/search).
- **Tests:** `noteDocRef.test.ts` (7 tests: key parsing incl. encoded slugs, badges, title wins / longest book id, fallbacks, links, batched lookup + cap, fetch failure → null); `validate.test.ts` «title lookup …», «titles route: gated, validated, request client only»; `smartFolderApiMapper.test.ts` «titleless items … ONE batched title lookup»; `foldersSourceContract.test.ts` «ملاحظاتي وتحديداتي names and badges rows through noteDocRef».
- **Check live:** lawyer account → open a law (e.g. `/laws/labor-law-qadha`), a judicial collection (`/precedents/<any>`), a book and an order; add a sticky note or highlight on each → go to `/laws` → widget «ملاحظاتي وتحديداتي»: each row shows the Arabic title, badges read الأنظمة واللوائح / المبادئ والسوابق القضائية / الكتب والمراجع / الأوامر والتعاميم, «عرض مجمّع» groups them under those four, and the ↗ link opens the right page. Old notes (made before this deploy) should also show Arabic titles.

### NOTE-04-C01 — «⋮» menu via portal, never clipped
- **Verdict:** built (check live)
- **What was there on main:** `src/app/laws/components/FolderCard.tsx:188` — `absolute bottom-full mb-2` inside the card's `overflow-hidden` (:98), the list's `max-h-[420px] overflow-y-auto` and the widget's `overflow-hidden` (`SmartFolders.tsx:611`, `:545`).
- **Change:** menu rendered with `createPortal(…, document.body)`, `position: fixed`, coordinates from the button's `getBoundingClientRect()` via `placeFloatingMenu` (opens down if it fits, else up, else the larger side with a max-height; RTL/LTR edge alignment; clamped 8px inside the viewport). Measured invisibly for one frame, then shown. Closes on outside pointerdown, Escape (focus back to «⋮»), any scroll outside the menu, resize. Keyboard: `aria-haspopup="menu"`/`aria-expanded`, ArrowDown/Up opens, first item focused, arrows/Home/End move, Tab closes. z-index 70.
- **Files:** `src/app/laws/components/FolderCard.tsx`, `src/app/laws/components/folderMenuPlacement.ts` (new).
- **Tests:** `folderMenuPlacement.test.ts` (5: down when it fits, up for the last folder, neither side fits, RTL/LTR alignment, edge clamping); `foldersSourceContract.test.ts` «the «⋮» menu is portalled to <body>, fixed, and closes on …».
- **Check live:** any signed-in account → `/laws` → «مجلداتي» → create a folder → press «⋮» on it (collapsed, and on the LAST folder in a long list): the five options appear fully, below or above the button; Escape, a click outside or scrolling closes it; Tab to «⋮», Enter, arrows walk the options.

### NOTE-04-C02 — empty folder shows «+ إضافة محتوى للمجلد»
- **Verdict:** built (check live)
- **What was there on main:** `src/app/laws/components/FolderCard.tsx:325-329` — only «المجلد فارغ حالياً.».
- **Change:** a button «إضافة محتوى للمجلد» (+ icon) under that line, calling `onManageContent()`.
- **Files:** `src/app/laws/components/FolderCard.tsx`.
- **Tests:** `foldersSourceContract.test.ts` «an empty folder offers «إضافة محتوى للمجلد», wired to onManageContent».
- **Check live:** `/laws` → «مجلداتي» → new empty folder → expand it → the button is there and opens «إدارة محتوى مجلد».

### NOTE-04-C03 — «إدارة المحتوى» searches the whole real library
- **Verdict:** built (check live)
- **What was there on main:** `src/app/laws/components/SmartFolders.tsx:518-530` filtered `ALL_LIBRARY_DOCS` (`SmartFolderTypes.ts:98-125`: 12 laws, 2 books, 0 precedents, 0 orders).
- **Change:** `ALL_LIBRARY_DOCS` deleted (grep: no source file uses it; a contract test enforces that). New shared `FolderContentPicker` + `useFolderLibrarySearch`:
  - before typing: `GET /api/library/init?section=…&limit=20` per tab — laws in the catalogue order (٣١٧: latest legislative event), judicial collections newest Hijri year first (init returns them whole), decrees newest `date` first within the page init returns (init orders decrees by id, so this is approximate — not changed here), books; «الكل» = 5 of each type. Cached per page load.
  - while typing (≥ 2 letters): debounced 350 ms, previous request aborted, `POST /api/library/search {query, section}` on the tab's section; for «المبادئ والأحكام» / «الكل» the full collections list is also filtered by title (Arabic-folded). Hits are saved as DOCUMENTS: an article saves its law, a principle its collection (named from the collections list), a fiqh passage its book.
  - Three distinct states: library closed (503 libraryGate), search failed («هذه ليست نتيجة فارغة»), and no match.
  - Autocomplete was studied and NOT used: it returns at most 2 hits per section (6 total).
  - Entitlement: folders have no paid gate in code (`/api/library/folders*` only require sign-in; guests keep browser folders). The search keeps its own paywall (snippets only; a saved item is a reference and the reader page applies its own paywall). No new gate added.
  - SmartFolders dialog also got role=dialog, Escape, backdrop close, Tab trap, focus return, a per-row in-flight guard, and a «تم ✓» footer.
- **Files:** `src/app/laws/components/FolderContentPicker.tsx` (new), `useFolderLibrarySearch.ts` (new), `folderLibrarySearch.ts` (new), `SmartFolders.tsx`, `SmartFolderTypes.ts`.
- **Tests:** `folderLibrarySearch.test.ts` (7: tab wiring, hit → document mapping, garbage tolerance, init ordering, «الكل» interleave, Arabic title filter, keys/codes/query length); `foldersSourceContract.test.ts` «ALL_LIBRARY_DOCS … is gone», «both «إدارة المحتوى» screens use the real-library picker».
- **Check live:** `/laws` → «مجلداتي» → «⋮» → «إدارة المحتوى»: each tab lists real items without typing (المبادئ والأحكام and الأوامر والتعاميم are no longer empty); type «إيجار» or «تحكيم» → results from the whole library; tick one → it appears in the folder and stays after reload.

### NOTE-05-C01 — green finish footer, save state, toast
- **Verdict:** built (check live)
- **What was there on main:** `src/components/laws/FolderSelectionModal.tsx:699-771` — only a dashed «إنشاء مجلد جديد»; the only exit was the grey «×».
- **Change:** footer with a full-width `bg-[#0B3D2E]` button: «تم ✓» when the document is in ≥ 1 folder, «إغلاق» when in none, disabled «جارٍ الحفظ...» while any POST/DELETE (or folder creation) is in flight. Escape and a press on the dim backdrop close it, never mid-save (the «×» is disabled mid-save too). Toast «تم حفظ المستند في مجلد «…»» (or «أُزيل المستند من مجلد «…»»), portalled to <body>, `role=status`, outlives the dialog, 3.2 s. There is no toast library in the repo, so it is local.
- **Files:** `src/components/laws/FolderSelectionModal.tsx`, `src/components/laws/folderDialogLabels.ts` (new).
- **Tests:** `folderDialogLabels.test.ts` (labels in the three states; toast text); `foldersSourceContract.test.ts` «the save dialog: a finish button with three labels, Escape/backdrop close (not mid-save), focus kept inside».
- **Check live:** lawyer account → `/laws/social-security-law` → «حفظ في مجلداتي» → button reads «إغلاق»; tick a folder → briefly «جارٍ الحفظ...», then «تم ✓», a green toast names the folder; press «تم ✓» → dialog closes, toast stays a moment. Repeat on a judicial collection, an order and a book page.

### NOTE-05-C02 — no silent «+» beside the tick; manage screen on real data
- **Verdict:** built (check live)
- **What was there on main:** `FolderSelectionModal.tsx:665-673` (a bare «+» next to the tick opening `setManagingFolder`) and `:347` (`ALL_LIBRARY_DOCS`).
- **Change:** the «+» is gone. Each row is one `role="checkbox"` button (tick + colour + name + count + «محفوظ هنا ✓»); a small underlined text link «إدارة المجلد» sits at the far end of the row. The managing screen uses the same real-library `FolderContentPicker` (current items, recent sessions, then library results), with a footer «تم — العودة إلى المجلدات». Escape inside it goes back to the folder list.
- **Files:** `src/components/laws/FolderSelectionModal.tsx`.
- **Tests:** `foldersSourceContract.test.ts` «the silent «+» beside the tick is replaced by a named «إدارة المجلد» link», «the dialog's props stay compatible …».
- **Check live:** same dialog → no «+» next to the tick; «إدارة المجلد» opens the folder's content screen; all five tabs show real items.

### LIVE-F23 — explicit finish, save state, focus management, document stays
- **Verdict:** built (check live)
- **What was there on main:** `FolderSelectionModal.tsx:355-775` — autosave with a tick, no finish button, no dialog role, no focus handling (evidence `06-evidence/nezamy-live-test/phase2/LIB03-folder-save-dialog.txt`).
- **Change:** everything under ٠٥-C01 plus: `role="dialog" aria-modal aria-labelledby aria-busy`; on open focus moves into the dialog; Tab/Shift+Tab stay inside; on close focus returns to the button that opened it («حفظ في مجلداتي»); per-row visible state «محفوظ هنا ✓» / «جارٍ الحفظ...». The save itself is unchanged (server row, upsert on folder+type+id), so the document is still in the folder after leaving and returning. Props unchanged (`isOpen`, `onClose`, `currentDoc`) for the catalogue stream's result-card button (NOTE-04-C04).
- **Files:** `src/components/laws/FolderSelectionModal.tsx`.
- **Tests:** as ٠٥-C01 and ٠٥-C02.
- **Check live:** keyboard only: Tab to «حفظ في مجلداتي», Enter → focus is inside the dialog; Tab cycles within it; Space on a folder saves it; Escape closes; focus lands back on «حفظ في مجلداتي». Reload the page, reopen: the folder is still ticked «محفوظ هنا ✓».

---

### SQL
None. No migration was needed (20261030_64 unused). No `_verify.sql` lines proposed.

### Follow-ups and risks
- **Notes still store only a page key.** Titles are looked up at read time. A `doc_title`/`doc_type` column on `law_article_notes`, written by ResearchWorkspace, would remove the lookup — out of this stream's files (notes API + reader pages).
- **Book note keys are ambiguous** (`feqh-<book>-<block>`, both may contain «-»): resolved by sending every split and taking the longest known book id (≤ 12 splits per note). A book deleted from the library falls back to the shortest split, humanised.
- **Decrees default order** in the picker is by `date` within init's first 20 rows (init orders decrees by id); a true «latest decrees» default needs `/api/library/init` to order decrees by date (not this stream's file).
- **Article-level search** collapses to laws: a common word may surface fewer distinct laws than 40 rows of articles; law-title hits come first, so named laws are found.
- **No browser verification was run** (dev server would read `.env.local` → Supabase). The ⋮ portal, focus trap and toast are covered by source-contract and pure tests only — please check live.
- `src/lib/auth/accountFreezeWrites.test.ts` gained one ALLOWED entry (outside my file list), for the read-only titles POST, matching the existing `library/search` entry.
- New helper files outside the exact owned list (all new, no other stream should touch them): `src/app/laws/components/{FolderContentPicker.tsx,useFolderLibrarySearch.ts,folderLibrarySearch.ts,folderMenuPlacement.ts,noteDocRef.ts}`, `src/components/laws/folderDialogLabels.ts`, `src/app/api/library/folders/titles/route.ts` (+ tests).

---

## S6-seo — owner note ١٤ (REF0014), phase 1

Branch `lib/S6-seo`, based on `ace1f28d`.

Commits:
- `707d6e00`: the builders.
- `45e758fb`: the layouts, sitemaps, robots and contract tests.
- `7e982e3b`: review fixes (the fallback canonical, an optional `summary_brief`, no dangling «لعام»).

Policy used everywhere: ٣١٨ (amended 28-Oct) and ٣١٩.
- Everything printed in `<head>`, JSON-LD, the sitemaps and the SSR block is built **as a guest sees the document, whoever asked**. The loader has no cookie client.
- No official link (`official_url`, `official_source_url`, `boe_source_url` and `gazette_url` are never even read).
- No decree number or date. The one date is «آخر تحديث تشريعي», as `latestLegislativeEvent(...).iso`.
- No FAQPage, no sameAs, no datePublished.

Not run: `next dev` and `next build`. They would read prod Supabase through `.env.local`. Everything was verified by unit and source-contract tests plus `tsc` and `eslint` only.

---

### NOTE-14-C01: per-document metadata, no brand duplication
- **Verdict:** built (check live)
- **What was there on main:**
  - `src/app/laws/layout.tsx:4`, `src/app/precedents/layout.tsx:4`: one static `buildMetadata` per section. Every document inherited the section title.
  - `src/lib/seo.ts:3,33`: `BASE_URL` not exported; `buildMetadata` appends «- نظامي | Nezamy» to every title.
  - The root `src/app/layout.tsx:40` title is a plain string, so there is no template. Duplication came only from appended suffixes.
- **Change:**
  - `buildLibraryMetadata()` in `src/lib/seo.ts`:
    - The title is `«<name> | نظامي»`, with the brand appended once after `stripBrandSuffix` removes any brand the source carried.
    - The description is the public موجز. It goes through `summaryForViewer(…, false)`, then markdown links become their text, bare URLs, `www.` and `*.gov.sa` domains are removed, headings and emoji go, and it is cut at a word to 160 characters.
    - A text that still leaks falls back to a generic line.
    - `og-image.png` (1024×1024) is set explicitly in `openGraph` and `twitter`.
    - The canonical is the document's own URL, encoded once.
  - Document names, in `publicDocumentTitle`:
    - **Laws and orders** lose decree numbers and dates. A decree title like «المرسوم الملكي رقم م/44 وتاريخ 1446/02/08هـ» becomes «المرسوم الملكي — <subject from its موجز>».
    - **Collections and books** keep their year («… لعام ١٤٤٣هـ» is the volume's identity, not a decree date).
  - `buildLibraryFallbackMetadata()` handles the cases with no document. It carries no DB value:
    - closed library or not found → noindex;
    - failed read → indexable, so an outage does not de-index a page.
  - `buildMetadata` is unchanged.
- **Files:** `src/lib/seo.ts`, `src/lib/library/libraryMetadata.ts`
- **Tests:**
  - `src/lib/seo.test.ts`:
    - «no decree number, date or link reaches <head>…». Fixtures: «م/14» with U+200F, ١٤٤٢/٩/٢٢, 22 رمضان 1442هـ, www.boe.gov.sa.
    - «the brand once…»
    - «og-image.png is kept…»
    - «canonical is the document's own page…»
    - «the fallback <head>…»
    - «buildMetadata … unchanged».
  - `src/lib/library/libraryMetadata.test.ts`: the description, brand, decree-title and law-title tests.
- **Check live** (guest, logged out): open `https://nezamy.sa/laws/<any law slug>` and view the page source (Ctrl+U).
  - `<title>` reads «<law name> | نظامي». There is no «نظامي | Nezamy» and no repeated brand.
  - `<meta name="description">` is the law's موجز, with no «م/», no Hijri date and no «gov.sa».
  - Repeat on `/laws/orders/<id>`. A decree title with a number shows «المرسوم الملكي — …» in `<title>`.

### NOTE-14-C02: server layout + JSON-LD by document type
- **Verdict:** partly built
- **What was there on main:** no `layout.tsx` under `src/app/laws/[slug]`, `laws/orders/[slug]`, `precedents/[slug]` or `precedents/judgment/[slug]`. `src/app/book/[slug]/layout.tsx:10` was only the guard. No JSON-LD anywhere in the library.
- **Change:**
  - **New server layouts** for the 4 readers. Each has `generateMetadata` plus a `<script type="application/ld+json">`.
  - **The loader** is `loadLibraryDocSeo` in `src/lib/library/libraryDocumentSeo.ts`. It uses React `cache()`, so metadata and body share one read per request. It reads the library switch first, then the service role with named columns, and never throws. Slugs are decoded once (`decodeRouteSlug`) and paths are encoded once (`apiSlug`).
  - **JSON-LD** comes from `buildLibraryJsonLd`, as one `@graph` holding the document and its `BreadcrumbList`:
    - **law:** `Legislation`, `legislationJurisdiction: "SA"`. `dateModified` is set only from the ISO day of `latestLegislativeEvent` and omitted when null. There is no `datePublished`, `legislationDate`, `legislationIdentifier`, `legislationPassedBy` or `sameAs`.
    - **order:** `Legislation` with the instrument label, and NO date. A decree's own date is its issue date, which is a subscriber's (٣١٨).
    - **collection:** `Collection` (with `collectionSize`).
    - **book:** `Book` (with `author`).
  - **Escaping:** `serializeJsonLd` escapes `<`, `>`, `&` and U+2028/2029.
  - **Why only "partly":**
    - `/laws/*` and `/precedents/*` sit inside `LibraryGuard` (`src/app/laws/layout.tsx`, `src/app/precedents/layout.tsx`).
    - On the server, the guard renders only a spinner (`useLibraryStatus` starts with `loading=true`). So for laws, orders and collections the JSON-LD is in the RSC payload and reaches the DOM after the guard resolves (Googlebot renders it), but it is NOT in the first HTML.
    - For books I own the guard's layout, so the JSON-LD is rendered outside the guard and IS in the first HTML.
- **Files:**
  - `src/app/laws/[slug]/layout.tsx`
  - `src/app/laws/orders/[slug]/layout.tsx`
  - `src/app/precedents/[slug]/layout.tsx`
  - `src/app/book/[slug]/layout.tsx`
  - `src/lib/library/libraryDocumentSeo.ts`
  - `src/components/library/LibraryJsonLd.tsx`
  - `src/lib/library/libraryMetadata.ts`
- **Tests:**
  - `libraryMetadata.test.ts`:
    - «Legislation JSON-LD: jurisdiction SA, dateModified only from the ISO day…»
    - «the @type comes from the kind…»
    - «a leaky name or description never reaches the JSON-LD»
    - «serializeJsonLd escapes < > & …»
    - «lawDateModified = latestLegislativeEvent(...).iso…»
  - `src/app/library-seo-contract.test.ts`:
    - «every reader route has a server layout…»
    - «the loader reads as the service role…»
- **Check live:**
  - Paste `https://nezamy.sa/laws/<slug>` and `https://nezamy.sa/book/<book id>` into Google's Rich Results Test (search.google.com/test/rich-results).
    - Expected: one Legislation (or Book) item plus a BreadcrumbList, and no FAQ.
    - For a law, `dateModified` equals the law's «آخر تحديث تشريعي» in Gregorian. It is absent when that date has no day.
  - On a book page, view the source (Ctrl+U) and find `application/ld+json` directly in the HTML.

### NOTE-14-C03: limited SSR shell that respects the content lock
- **Verdict:** partly built
- **What was there on main:**
  - `src/components/library/LibraryGuard.tsx:46-58`: the guard SSRs a spinner only.
  - All five readers are `"use client"` and fetch on mount (`laws/[slug]/page.tsx:185`, `orders/[slug]/page.tsx:144`, `precedents/[slug]/page.tsx:266`, `book/[slug]/page.tsx:424`).
  - The first HTML of every library document held no word of it. For Googlebot it is worse: `/api/` is disallowed, so the reader's own fetch fails too.
- **Decision and justification:**
  - A shell rendered from the nested `[slug]` layouts of laws, orders and precedents would sit INSIDE the section guard and never reach the first HTML. I did not change `LibraryGuard` because it is not my file and it gates every `/laws/*` page.
  - The alternative was to let the guard SSR its children. That would server-render pages that have never been server-rendered, with unknown `window`/`localStorage` use at render time, and that risk cannot be verified without `next build`.
  - **Books** (I own their guard's layout): built. «عن هذا الكتاب» is rendered OUTSIDE the guard, under the reader, as a closed `<details>` visible to everyone (no hidden content).
    - It contains: an h2 with the cleaned name, the author, the cleaned موجز, and up to 60 top-level chapter titles.
    - It never contains block text (server-only, 20261018_02).
    - Nothing is rendered while the library is closed (server-side `getLibraryStatus`).
  - **Laws, orders, collections:** not built (follow-up below).
- **Files:** `src/app/book/[slug]/layout.tsx`, `src/components/library/LibraryDocumentShell.tsx`, `src/lib/library/libraryDocumentSeo.ts`
- **Tests:** `library-seo-contract.test.ts` «the book shell and JSON-LD sit OUTSIDE LibraryGuard…»
- **Follow-up (concrete), for the stream that owns `LibraryGuard` and the law reader:**
  1. Give `LibraryGuard` an `initialOpen` prop. `src/app/laws/layout.tsx` and `src/app/precedents/layout.tsx` would pass it from server-side `getLibraryStatus()`. With it, the guard renders its children at SSR when the library is open, and still polls and flips to the notice. Test SSR of every `/laws/*` and `/precedents/*` page first.
  2. Then render the law shell from `src/app/laws/[slug]/layout.tsx`:
     - the h1 and موجز as here;
     - the chapter titles;
     - the first `min(3, effectiveFreeLimit(checkLibraryAccess(null, slug, 0), total))` articles' `text` only. The admin per-law override can be below 3. Titles capped like `LOCKED_TITLE_CHARS`. No amendments, regulations or preamble.
  3. Alternatively, server-fetch the initial data into the readers.
- **Check live** (guest): open `https://nezamy.sa/book/<book id>`. Under the reader there is a collapsed «عن هذا الكتاب»; open it to see the name, the موجز and the chapter list. The page is normal-flow (`min-h-screen flex-col`, `book/[slug]/page.tsx:598`), so the block is reachable by scrolling. In view-source (Ctrl+U) that text is present before any script runs. The closed-library path is proven by the contract test («the loader … checks the library switch»); do NOT close the library on prod to check it.
- **The soft 404 remains for laws, orders and collections.** `/api/` stays disallowed and Google's renderer obeys robots for fetches, so Googlebot still renders those readers' load-error state, with the per-document `<head>` and JSON-LD. Only the follow-up below (server-rendered data) closes it. Books are the exception.

### NOTE-14-C04: no decree, official link or internal note in `<head>`/JSON-LD/SSR
- **Verdict:** built (check live)
- **What was there on main:** nothing printed per document. The risk was the owner agent's plan to print `datePublished`, `seo_description`, `og_description` and `schema_same_as` (note ١٤ §٢ items ٢ and ٣).
- **Change:**
  - **The loader** never selects `official_url`, `official_source_url`, `boe_source_url`, `gazette_url`, `preamble`, `issuing_instrument`, the article tables or the internal-note fields.
  - **Text cleaning:**
    - Every text goes through `summaryForViewer(…, false)` and `removeLinks`.
    - A final `publicTextLeaks` check (decree number, date, URL, domain) drops anything that still leaks.
    - Decree titles are rebuilt without number or date.
  - **Dates:** `dateModified` comes from the ISO day only.
  - **Defense in depth:** the JSON-LD builder re-checks name, description and type.
- **Files:** `src/lib/library/libraryMetadata.ts`, `src/lib/library/libraryDocumentSeo.ts`, `src/lib/seo.ts`
- **Tests:**
  - `seo.test.ts` «no decree number, date or link reaches <head>…»
  - `libraryMetadata.test.ts`:
    - «the description drops decree numbers, dates and every link…»
    - «guestPlainText strips with the hidden U+200F…»
    - «removeLinks…»
    - «nothing safe left → the generic line…»
    - «a leaky name or description never reaches the JSON-LD»
  - `library-seo-contract.test.ts`:
    - «no FAQPage, sameAs or official link in the library SEO sources»
    - «the loader … never uses the cookie client» (no official column read)
- **Check live:** view the page source of a law whose موجز mentions its decree (e.g. نظام العمل) as a guest. Search the source for «م/», «هـ», «gov.sa» and «boe». None may appear in `<head>` or in the `ld+json` script.
  - Note: the visible page body is the readers' (other streams). On a decree page the visible h1 still prints the decree title with its number (`laws/orders/[slug]/page.tsx:383`). That is not my file; see Follow-ups.

### NOTE-14-C05: no FAQPage and no city padding in the library
- **Verdict:** built (check live)
- **What was there on main:** no library JSON-LD at all. `aeo_pairs`/`geo_tier*` are not DB columns (note ١٤ §٢ item ١), so nothing could print them.
- **Change:**
  - The `@type` comes only from the document's kind. There is no FAQPage path.
  - GEO is `legislationJurisdiction: "SA"` only. There is no `areaServed` or `spatialCoverage`.
- **Files:** `src/lib/library/libraryMetadata.ts`
- **Tests:**
  - `libraryMetadata.test.ts` «Legislation JSON-LD…»: bans FAQPage, sameAs, areaServed, spatialCoverage, HowTo and GovernmentService.
  - `library-seo-contract.test.ts` «no FAQPage, sameAs or official link…»
- **Check live:** Rich Results Test on any law, order or book page shows no FAQ item.

### NOTE-14-C06: segmented sitemaps for the library's documents
- **Verdict:** built (check live)
- **What was there on main:** `src/app/sitemap.ts:166-198` (`getCivilProcedureLawEntry`) listed ONE law (plus `/laws/companies-law` hard-coded). No orders, collections or books.
- **Change:**
  - **New `src/app/library-sitemaps/sitemap.ts`**, using `generateSitemaps` (Next 16.3.3). It serves these, all listed in robots.txt (Next emits no sitemap index):
    - `/library-sitemaps/sitemap/laws.xml`
    - `/library-sitemaps/sitemap/orders.xml`
    - `/library-sitemaps/sitemap/collections.xml`
    - `/library-sitemaps/sitemap/books.xml`
  - **Contents:** documents only, never articles or principles, and never `/precedents/judgment`.
  - **Reads:**
    - `selectAllPages` with the service role, ordered by each table's PK (`laws.slug`; `id` for the others).
    - URLs are encoded once.
    - A law's `lastModified` is its «آخر تحديث تشريعي» ISO day. Other types carry none (not "today", not the reseed date).
  - **Failure:** empty when the library is closed or a read fails.
  - **Refresh:** `revalidate = 21600` (6 h).
  - **Root:** `/sitemap.xml` is unchanged.
- **Files:** `src/app/library-sitemaps/sitemap.ts`, `src/lib/library/libraryMetadata.ts`, `src/app/robots.ts`
- **Tests:**
  - `libraryMetadata.test.ts` «sitemap entries: documents only, URL encoded once, lastModified only from an ISO day», «paths encode the id exactly once…»
  - `library-seo-contract.test.ts` «the library sitemaps: documents only, paged, by primary key, empty when closed»
  - `robots.test.ts` «robots lists the site map and the four library document maps»
- **Check live:**
  1. Open `https://nezamy.sa/library-sitemaps/sitemap/laws.xml`. It holds one `<url>` per law with Arabic slugs percent-encoded once (no `%25`), and `<lastmod>` only on laws with a full legislative date.
  2. Repeat for `orders.xml`, `collections.xml` and `books.xml`. Each count should match the library's counts for that type.
  3. In Google Search Console, submit the four URLs.

### NOTE-14-C07: allow `/_next/static/` while keeping `/api/` blocked
- **Verdict:** built (check live)
- **What was there on main:** `src/app/robots.ts:18` disallowed all of `/_next/`, so Googlebot could not load scripts or CSS.
- **Change:**
  - `allow: ["/", "/_next/static/", "/_next/image"]`. Under longest match these win over `/_next/`, and the other `/_next/` paths stay blocked.
  - Every disallow is kept (`/dashboard/`, `/api/`, `/ai/settings`, `/ai/vault`, `/ai/share-history`, `/track/`, `/_next/`).
  - `/precedents/judgment/` is deliberately NOT disallowed, so its noindex tag can be read.
- **Files:** `src/app/robots.ts`
- **Tests:** `src/app/robots.test.ts`:
  - «Googlebot may load /_next/static/ and /_next/image, not the rest…»
  - «the other disallows are kept»
  - «library pages are crawlable — the judgment page too…»
  - `trackingWiring.test.ts`'s `/track/` check still passes.
- **Check live:** open `https://nezamy.sa/robots.txt`. It shows the `Allow: /_next/static/` and `Allow: /_next/image` lines, the disallows, and five `Sitemap:` lines. In Search Console's URL Inspection, run "Test live URL" on a law and check that scripts and CSS load (no "blocked resources"). The law TEXT still does not render for Googlebot, because its `/api/` fetch stays blocked by design; see C03.

### NOTE-14-C08: noindex for `/precedents/judgment/[slug]`
- **Verdict:** built (check live)
- **What was there on main:** `src/app/precedents/judgment/[slug]/page.tsx:1-21` is a «قريباً» screen. It inherited `index: true` from `src/app/precedents/layout.tsx:4`.
- **Change:** a new server `layout.tsx` with `robots: { index: false, follow: false, googleBot: … }`. It is excluded from the sitemaps and not disallowed in robots.
- **Files:** `src/app/precedents/judgment/[slug]/layout.tsx`
- **Tests:** `library-seo-contract.test.ts` «/precedents/judgment/[slug] (a «قريباً» screen) is noindex»
- **Check live:** view the source of `https://nezamy.sa/precedents/judgment/anything` and find `<meta name="robots" content="noindex, nofollow">`.

### NOTE-14-C09: update parsers, seeders, the metadata contract and merged links
- **Verdict:** not done (follow-up)
- **What was there on main:**
  - `scripts/seed-library.ts:699-759` and `1195-1220`, `scripts/parsers/parse-feqh.ts:330-358` and `scripts/parsers/parse-decrees.ts:315` are as note ١٤ §٢ item ١ describes.
  - There is no `metadata` jsonb or `seo_*` column.
- **Why:** this is note ١٤'s phase 2 (the library agent's migration plus seeder update). Seeders are banned for this work and are outside S6's files.
  - Phase 1 is built so that phase 2 only swaps the SOURCE of name and description: `publicDocumentTitle` and `publicDescription` already take candidates, in order.
  - Whatever phase 2 adds (`seo_title`, `seo_description`, `official_links`, `merged_regulation_details`) must go through the same cleaning. `official_links` must never be read by `libraryDocumentSeo.ts`.
- **Check live:** n/a.

### NOTE-14-C10: policy for the official link and the update date
- **Verdict:** owner decision (settled by ٣١٨, amended 28-Oct)
- **Note:**
  - Official links are subscriber-only, and NEVER in `<head>`, JSON-LD or SSR for anyone. A visitor sees «آخر تحديث تشريعي» alone.
  - S6 obeys this: no official link and no issue date anywhere in its outputs, and `dateModified` comes only from that date (C02, C04 tests).
  - **Outside S6, still open on this base:**
    - `src/app/api/library/laws/[slug]/route.ts:355` still sends `officialLink: lawOfficialLink(law)` to EVERY viewer (the old ٢٩٧ exception).
    - `src/app/api/library/decrees/[id]/route.ts:138` still sends `official_url` and `date` (:122) to everyone.
    - These belong to the stream that owns the library API routes.

---

### SQL
None. No migration, and no `_verify.sql` lines are proposed: nothing here changes the schema or grants. The loader and sitemaps read with the service role. `summary_brief` (20261025_20) is optional: on a missing-column error the law read retries without it, as `/api/library/init` does, and the description falls back to the generic line. `next.config.ts` has no `cacheComponents`, `dynamicIO` or `ppr`, so `export const revalidate` and the async layouts without `<Suspense>` are valid.

### Follow-ups and risks
1. **SSR shell for laws, orders and collections (C03).** This needs `LibraryGuard` to accept a server-resolved initial status. Until then their JSON-LD reaches the DOM only after the guard resolves, which is fine for Googlebot's renderer but means it is not in the first HTML. Concrete plan in C03.
2. **Visible decree titles.** The orders reader's visible h1 (`laws/orders/[slug]/page.tsx:383`) and the decree API still carry the decree number and date in `title`. `<head>` and JSON-LD no longer do. Owner/stream decision: should the visible title get the same treatment for guests (٣١٨)?
3. **Official link and decree date (C10).** `officialLink` in the law route and `official_url`/`date` in the decree route still go to everyone. That is for the API stream.
4. **Decree `dateModified`.** Omitted on purpose: there is no visitor-visible legislative date for decrees yet. If the owner wants one, define it (latest event, not the issue date).
5. **Extra DB read.** Each document layout adds one small service-role read per request. It is shared with `generateMetadata` via `cache()`. The book layout adds a second read (a 61-row TOC).
6. **Sitemap build.** Sitemaps are generated at build and revalidated every 6 h. If the build machine cannot reach Supabase, they are empty until the next revalidation. deploy.sh builds on the server, which has the env.
7. **Bare `/laws/orders`.** It resolves to `/laws/[slug]` with slug "orders", which is pre-existing. Its metadata is now generic noindex (not found).
8. **GitNexus.** `impact(robots)` returned UNKNOWN: 0 callers, index 675 commits behind, since Next calls it as a framework entry. A grep shows 23 importers of `@/lib/seo`. Only additive exports were added and `buildMetadata` is unchanged (pinned by a test). `detect_changes(compare ace1f28d)` reports risk low, 1 symbol touched (`robots`) and 0 affected processes; the index is stale, so the new files are not in it. No HIGH or CRITICAL result.
9. **Book shell is new visible UI.** The owner should confirm the collapsed «عن هذا الكتاب» placement under the reader.
10. **Fallback canonical.** The fallback `<head>` (closed, not found or failed read) sets its own canonical: the document URL on a failed read, `null` otherwise. It never inherits `/laws` or `/precedents`. The judgment layout sets `canonical: null`.
11. **Sitemap rows.** The sitemaps list every row of each table. `/api/library/init` applies no hidden or junk filter (only the user's own filters), so nothing the catalogue hides is advertised.

### Test summary
- New: `src/lib/library/libraryMetadata.test.ts` (16), `src/lib/seo.test.ts` (7), `src/app/robots.test.ts` (4), `src/app/library-seo-contract.test.ts` (6). All pass; with `library-column-lock` and `optionalColumn`, 62/62 after `7e982e3b`.
- Full `npm run test:unit`: 4217 tests, 4210 pass, 7 fail. The 7 failures are exactly the baseline (books series, navigation.consultant, aiFiles pdf-lib, libraryAccess end read, grantPurchase, two trackingWiring). There are no new failures.
- `tsc`: no errors in S6 files (only the pre-existing pdf-lib ones). `eslint` on all S6 files: clean.

---

## S7-grants — owner note ١٨ (REF0017) «مشترك المكتبة فقط» + LIVE-F05

Branch `lib/S7-grants`, based on `ace1f28d`.

Commits:
- `5141af9a`: migration 65, the atomic stacked grant plus the revoke and end-change functions; `grantLibraryAccess` now calls the function; pure helpers.
- `c7fdbdd0`: the admin `library` grant action; the library-grants list, CSV, revoke and end change; the approval refuses an ineligible requester.
- `6dbca58a`: the my-grant API, the «ساري حتى» card, and the eligibility message on /laws/subscribe and in the paywall.
- `921bd6b9`: the admin screens (the grant form and the «اشتراكات المكتبة» page) and the sidebar.
- `8e650b41`: the 7- and 3-day reminders (cron plus migration 66).

Not run: `next dev` and `next build`, because both read prod through `.env.local`. Verified with:
- unit and source-contract tests;
- `tsc --noEmit`, which is clean except for the existing `pdf-lib` errors in `src/lib/ai/*`, a folder that is not mine;
- Docker Postgres scratch (`supabase/tests/rls/run.sh`).

GitNexus:
- `impact` on `grantLibraryAccess` returned "target not found" because the index is stale, so the risk is **UNKNOWN**. Grep finds 4 callers:
  - `admin/entitlements/requests/[id]`
  - `invite/[code]/accept`
  - `library/invitations/redeem`
  - `payments/fulfillOrder` (through `grantPurchase`)

  All four keep their contract: same inputs and the same `{ok, endsAt}` / 23505 / missing-table results.
- Other shared symbols I edited also have UNKNOWN impact (stale index), so here are grep caller counts:
  - `PaywallModal`: 3 renderers I don't own: `src/app/laws/page.tsx`, `src/app/laws/[slug]/page.tsx`, `OfficialMetaLockedRow.tsx`. Props are unchanged and still optional. 4 test files read it (pricing honesty, card price, plan request, mine).
  - `SubscriptionTab`: `src/app/settings/page.tsx`, plus 2 tests (`paymentsTabs`, `paymentsDarkMode`).
  - `NAV` / `adminNavForRole`: `AdminSidebar.tsx`, `dashboard/admin/users/[id]/page.tsx`, `adminNavAccess.ts`.
  - `ADMIN_PAGE_ACTION`: `adminNavByRole.test.ts`.
  - All of their tests pass in the full suite below.
- `detect_changes` (compare `ace1f28d`) mapped 36 files to 0 symbols, which is a stale index, so **UNKNOWN**.

**Tests, full unit suite** (`src/**/*.test.ts`):
- 4239 tests, 4231 pass, 8 fail. No new failure from this stream.
- 6 failures are in areas this branch never touched:
  - `api/library/books/[slug]/_shape`
  - `navigation.consultant`
  - `ai/aiFiles` (pdf-lib missing)
  - `ai/runCore`
  - `tracking/trackingWiring` ×2
- 2 failures are Windows CRLF checkout artefacts, both shown under Follow-ups: `libraryAccess.test.ts` "the end read…" and `fulfillOrder.test.ts` "grantPurchase…".
- The sibling baseline at `235e1bef` was 7 failures; the base here (`ace1f28d`) is different.

**Other checks:**
- `tsc --noEmit` is clean except the pdf-lib errors in `src/lib/ai/*`.
- ESLint on every changed file: 0 errors. The only warning in a new file is the house `useEffect(() => { void load(); }, [load])` idiom, also used on library-invitations. The rest are older: the subscribe page's unused icons, and `AdvancedSearchModal` in `PaywallModal.tsx`, which I did not touch.
- Docker SQL: `library_grant_admin.test.sql` and `library_grant_reminders.test.sql` both ALL PASS, and both negative controls fail at T0.

**Test accounts for every "Check live" step below:** use a lawyer on the **free** tier with no library. Pro and above already opens the full library (`src/lib/libraryAccessDecision.ts:22-34`), so on such an account a grant or revoke shows no difference on /laws.

---

### NOTE-18-C01: grants stack atomically (no overlap when two arrive together)
- **Verdict:** built (check live)
- **What was there on main:** `src/lib/libraryAccessServer.ts:151-157` read the latest end (`latestActiveGrantEnd`) and then inserted, in two requests. Two grants at the same moment both read the same end and overlapped, so the user lost the days of one of them.
- **Change:**
  - New `public.library_grant_access(...)` (migration 65). It is SECURITY DEFINER with `search_path=''` and only service_role may execute it.
  - It takes the per-user `pg_advisory_xact_lock('library_grant:'||user)`, reads the latest live end, and inserts in one transaction.
  - It checks that days are 1–3660, requires a reason for source `admin`, and lets an order_id duplicate raise 23505, which "already granted" relies on.
  - `grantLibraryAccess` calls the function first. If the function is missing (PGRST202/42883, meaning the SQL has not run), it falls back to the old read-then-insert and logs this once. The fallback refuses a grant that carries a reason, rather than dropping the reason.
- **Files:**
  - `supabase/migrations/20261030_65_library_grant_admin.sql`
  - `src/lib/libraryAccessServer.ts`
  - `src/lib/libraryAccess.ts`: `libraryCoverage`, the reminder offset and days-left helpers
- **Tests:**
  - `supabase/tests/rls/library_grant_admin.test.sql`, T0–T10, ALL PASS. It covers stacking, refusals, the order 23505, revoking a running grant and a future grant, the new grant after a revoke, the adjust rules, privileges after the second run, and the side table being hidden from users. The negative control fails at T0.
  - The two-session lock test in Docker (scratch `s7-lock-test.sh`) printed `2|t|t`: session B waited for A and stacked from A's end, contiguous with no overlap.
  - `src/lib/libraryAccessCoverage.test.ts`
- **Check live** (after SQL 65):
  1. As super_admin, open /dashboard/admin/entitlements and grant the same lawyer test account the library twice in a row: 30 days, then 90.
  2. On /dashboard/admin/library-subscriptions, the second grant should start exactly where the first ends.

### NOTE-18-C02: admin grants the library directly, with a mandatory reason
- **Verdict:** built (check live)
- **What was there on main:** `src/app/api/v1/admin/entitlements/grant/route.ts:32` accepted only `action: GrantAction` (plan, credits or wallet). A library-only grant was impossible.
- **Change:**
  - **The route:** `action: "library"`. The plan defaults to `lib-admin`; the allowed plans are lib-admin, lib-q1, lib-q2, lib-annual, lib-invite and lib-trial.
    - Days run 1–3660. The reason is MANDATORY (3–1000 characters) and notes are optional.
    - The gate is `requireStaff("entitlements.grant")`, as before.
    - The grant is written by `library_grant_access` with source `admin` and `granted_by`.
    - It is logged with `logAdminAction` as `library_grant_created`, and the user gets an in-app notice «ساري حتى …».
    - The reason and notes live in a service-role-only side table (`library_access_grant_admin`), because users can read their own grant rows.
  - **The UI:** a «منح اشتراك المكتبة» panel on /dashboard/admin/entitlements, with a plan select, days, a required reason and optional notes. The grant button stays disabled until a reason is written.
- **Files:**
  - `src/app/api/v1/admin/entitlements/grant/route.ts`
  - `src/lib/libraryAccessAdmin.ts`
  - `src/app/dashboard/admin/entitlements/page.tsx`
- **Tests:**
  - `src/app/api/v1/admin/entitlements/grant/route.test.ts`: 3 library tests.
  - `src/lib/libraryAccessAdmin.test.ts`: body parsing, plus the «entitlements page: … posts action library with the reason» pin.
- **Check live:** as super_admin, open /dashboard/admin/entitlements, search a lawyer test account, and use «منح اشتراك المكتبة».
  1. Try it without a reason: the button is disabled, and the server answers 400 if called anyway.
  2. Grant with the reason «اختبار»: the toast shows «تم منح المكتبة حتى …».
  3. As that lawyer, the bell shows the notice and /laws opens the full texts.
- **Owner question (open):** who may grant? Today it is every staff role holding `entitlements.grant`, which on main is super_admin only (the sidebar test confirms operations does not see it). Should this stay super-admin only?

### NOTE-18-C03: «اشتراكات المكتبة» admin page (search, filters, CSV)
- **Verdict:** built (check live)
- **What was there on main:** no admin view of `library_access_grants`. `src/app/dashboard/admin/` had only `library-invitations`, the code list.
- **Change:**
  - **The API:** `GET /api/v1/admin/library-grants` (gate `entitlements.grant`), 50 rows a page.
    - Search by holder name or email.
    - Filters: status (ساري / ينتهي خلال 30 يوماً / لم يبدأ بعد / منتهٍ / مسحوب), source (شراء / طلب / كود / زميل / أدمن / حملة المؤسسين), plan, granted-by, order id, and an ends-between range.
    - Each row shows the holder, the plan, the source, who granted it, the order, the start and end, the revoke, and the reasons.
    - With `format=csv`, the same filtered list comes back as a server-built CSV of up to 5,000 rows. It carries a UTF-8 BOM so Excel shows Arabic, and formula injection is neutralized.
    - Both answers are private and never cached. A missing SQL file returns 503 with an Arabic message.
  - **The page:** /dashboard/admin/library-subscriptions, which is always dark like the rest of the console. It has filter chips, search, pagination and the «تصدير CSV» link.
  - **The sidebar:** «اشتراكات المكتبة» (`adminNavByRole.ts`), mapped to `entitlements.grant` in `adminNavAccess.ts`.
- **Files:**
  - `src/app/api/v1/admin/library-grants/route.ts`
  - `src/lib/libraryAccessAdmin.ts`
  - `src/app/dashboard/admin/library-subscriptions/page.tsx`
  - `src/components/admin/adminNavByRole.ts`
  - `src/lib/auth/adminNavAccess.ts`
- **Tests:**
  - `src/app/api/v1/admin/library-grants/route.test.ts`
  - `src/lib/libraryAccessAdmin.test.ts`: CSV BOM, quoting, injection, status, query parsing, and the page pin «library-subscriptions page: list + server CSV link…».
  - `src/components/admin/adminNavByRole.test.ts`: the sidebar now has 33 items, and operations does not see the page.
- **Check live:** as super_admin, open /dashboard/admin/library-subscriptions.
  1. Click each status chip.
  2. Search a holder's name.
  3. Click «تصدير CSV» and open the file in Excel: the Arabic headers should read correctly.
  4. Log in as an operations staff account: the item is absent.

### NOTE-18-C04: revoke and extend/shorten, each with a reason, logged
- **Verdict:** built (check live)
- **What was there on main:** no way to revoke or re-date a library grant, other than editing the database by hand.
- **Change:**
  - `PATCH /api/v1/admin/library-grants/[id]` takes `{action:"revoke"|"adjust", reason, newEndsAt?}`.
    - It calls `library_grant_revoke` or `library_grant_adjust_end` (migration 65), both under the same per-user lock.
    - The change is logged with `logAdminAction` (`library_grant_revoked` or `library_grant_adjusted`, with the before and after windows and the reason). The holder gets an in-app notice linking to /settings?tab=subscription; that tab parameter is confirmed in `src/app/settings/page.tsx:85,165`.
  - **The rule, documented in the migration:** revoke and end change touch THIS grant only, and the user's later stacked grants do not move, so a gap can open.
    - A running grant ends now.
    - A future grant is moved wholly into the past.
    - A lengthening that would overlap another live grant is refused.
    - Also refused: a window over 3660 days, an end in the past or before the start, an unchanged end, and a revoked or ended grant.
    - The original window is kept in the side table.
    - Revoke collapses `ends_at`, so every existing reader drops the row with no code change.
  - **The UI:** per-row «تعديل الانتهاء» (a date input, sent as the end of that day in Riyadh) and «سحب», each opening an inline form with a required reason.
- **Files:**
  - `supabase/migrations/20261030_65_library_grant_admin.sql`
  - `src/app/api/v1/admin/library-grants/[id]/route.ts`
  - `src/app/dashboard/admin/library-subscriptions/page.tsx`
- **Tests:**
  - SQL T5–T8 in `library_grant_admin.test.sql`.
  - `src/lib/auth/adminRouteGates.test.ts`, which pins the gate and one audit log on PATCH.
  - `src/lib/libraryAccessAdmin.test.ts`: `parseGrantChangeBody`, `grantRpcError`, `riyadhEndOfDayIso`.
- **Check live:** on /dashboard/admin/library-subscriptions, take the test lawyer's grant.
  1. Use «تعديل الانتهاء» to shorten it to tomorrow, with a reason.
  2. Then «سحب» with a reason: the status becomes «مسحوب», /laws locks for that lawyer, and /dashboard/admin/audit-log shows both actions.

### NOTE-18-C05: «اشتراك المكتبة: ساري حتى …» visible to the subscriber
- **Verdict:** built (check live); more placements are integration points.
- **What was there on main:** no user-facing surface read `library_access_grants`. The end date appeared only once, in the approval notification (`src/app/api/v1/admin/entitlements/requests/[id]/route.ts:208`).
- **Change:**
  - `GET /api/v1/library/my-grant`, never cached.
    - It reads the session user's own rows, selecting only `id, plan_ref, source, starts_at, ends_at`, and never the reason, notes, granted_by or order.
    - It returns the coverage (end of the contiguous chain, days left, plan label, any later start after a gap) plus a `purchase` eligibility answer.
  - `LibraryGrantStatusCard` and the `useMyLibraryGrant()` hook show the card in Settings → الاشتراك (`SubscriptionTab`) and on /laws/subscribe. The card turns amber in the last 7 days.
- **Files:**
  - `src/app/api/v1/library/my-grant/route.ts`
  - `src/lib/library/myLibraryGrant.ts`
  - `src/components/library/LibraryGrantStatusCard.tsx`
  - `src/app/settings/components/tabs/SubscriptionTab.tsx`
  - `src/app/laws/subscribe/page.tsx`
- **Tests:** `src/lib/library/myLibraryGrant.test.ts` (parsing, the headline, the select pin that rules out admin fields, the UI pins) and `src/lib/libraryAccessCoverage.test.ts`.
- **Check live:** as the lawyer test account with a grant, open /settings?tab=subscription and /laws/subscribe. Both should show «اشتراك المكتبة: ساري حتى <date>».
- **Integration points, not edited:** the dashboard home, the account menu and the library header (/laws/page.tsx and the shared nav are not mine). Each would be `<LibraryGrantStatusCard />` with no props.

### NOTE-18-C06: reminders 7 and 3 days before the end
- **Verdict:** built (check live). The n8n schedule and email are follow-ups.
- **What was there on main:** no reminder. `src/app/api/v1/cron/` held account-purge, ai-sweep, deadlines and payments-sweep.
- **Change:**
  - `POST /api/v1/cron/library-grant-reminders`, authenticated by `x-cron-secret` through `cronSecretMatches` and failing closed. It is outside the general rate limiter.
  - **Candidates:** grants not revoked that end within 7 days (at most 500 a run). The route then reads those users' whole live chains, in chunks of 300 ids.
  - `planLibraryReminders` counts down to the END OF THE CHAIN, so an early renewer is not nagged.
  - The 3-day reminder fires at 3 days or less, the 7-day one at more than 3 and up to 7.
  - **Idempotency:** for each due reminder the route first inserts the marker `(grant_id, offset_days)` with ON CONFLICT DO NOTHING, and sends the in-app notice (linking to /laws/subscribe) only when that insert created the row. Migration 66 adds `public.library_grant_reminders`, service role only.
  - Before the SQL runs, the route returns 200 `{skipped:"schema_missing"}` and sends nothing.
- **Files:**
  - `supabase/migrations/20261030_66_library_grant_reminders.sql`
  - `src/app/api/v1/cron/library-grant-reminders/route.ts`
  - `src/lib/libraryAccessReminders.ts`
- **Tests:**
  - `src/lib/libraryAccessReminders.test.ts`, 5 tests: offsets, the chain end, revoked/ended/upcoming, the gap, and the notice text.
  - `src/app/api/v1/cron/library-grant-reminders/route.test.ts`, 5 tests: secret first, bounded reads, marker before notice, schema_missing, and the SQL shape.
  - `supabase/tests/rls/library_grant_reminders.test.sql`, T0–T5, ALL PASS: duplicate is a no-op, 7 and 3 are separate, offset 5 is refused, cascade on delete, privileges, and a signed-in user is refused. The negative control fails at T0.
- **Check live:**
  1. Run SQL 66.
  2. Grant a test lawyer 5 days on /dashboard/admin/entitlements.
  3. On the server, run `curl -X POST https://nezamy.sa/api/v1/cron/library-grant-reminders -H "x-cron-secret: $CRON_SECRET"`. Expect `sent: 1`, and the lawyer's bell shows «اشتراك المكتبة ينتهي قريباً».
  4. Run the same command again. Expect `sent: 0, already: 1`.
  5. Then add the daily n8n schedule.

### NOTE-18-C07: invitation-code duration and seats
- **Verdict:** not done (follow-up). Seats are an owner decision.
- **What was there on main:** `src/app/api/v1/library/invitations/redeem/route.ts:40` has `const REDEEM_LIBRARY_DAYS = 30;`, so every code gives 30 days and there is no per-code duration.
- **Change:** none. A per-code duration needs a column on `library_invitations`, plus the admin create form and the redeem route (`src/app/api/v1/admin/library-invitations/route.ts`, `src/app/dashboard/admin/library-invitations/page.tsx`, `redeem/route.ts:40`). Those are outside this stream's files.
- **Files / Tests:** none.
- **Check live:** none.

### NOTE-18-C08: library assistant (AI) for library-only subscribers
- **Verdict:** owner decision. AI is owned by the parent session, so nothing was edited here.
- **What was there on main:** decision ٢٠٧ says the library assistant is for Pro and above. The 10-30 pricing document charges it 5 points. The two conflict for a library-only subscriber.
- **Change / Files / Tests:** none.
- **Check live:** none.

### LIVE-F05: library sales only to professionals (display AND server); unified preview
- **Verdict:** partly built.
- **What was there on main:**
  - `src/lib/pricing/priceBook.ts:161`: library entries have `buyers: "any"`, so `buyerAllowed` (`src/lib/payments/catalog.ts:165`) lets anyone through to checkout.
  - `src/app/laws/subscribe/page.tsx:290,299`: checkout and «طلب» were open to every account.
  - `src/app/laws/components/PaywallModal.tsx:31`: the fallback `FREE_LIMIT = 5` was printed when no limit was passed.
- **Change:**
  - `src/lib/library/libraryPurchaseEligibility.ts` is the one rule.
    - **Eligible:** lawyer, firm, corporate, government.
    - **Refused:** individual, with «المكتبة القانونية متاحة للمهنيين…». Also refused, pending the owner question: micro, ngo, provider and unknown types.
  - **Server:** the admin approval of a library request now refuses an ineligible requester with 409 `library_not_eligible` (`requests/[id]/route.ts`, in `approveLibraryRequest` before the claim). The my-grant API returns the eligibility answer.
  - **Display:**
    - /laws/subscribe shows the eligibility note, and every paid CTA reads «غير متاح لنوع حسابك».
    - `handleSubscribe` refuses BEFORE checkout or a request.
    - In PaywallModal, plan buttons become non-links (`aria-disabled`) with the note.
  - **Preview:** PaywallModal no longer prints the made-up 5. Without the real limit it says «يُعرض جزء مجاني من كل نص».
- **Files:**
  - `src/lib/library/libraryPurchaseEligibility.ts`
  - `src/app/api/v1/admin/entitlements/requests/[id]/route.ts`
  - `src/app/api/v1/library/my-grant/route.ts`
  - `src/app/laws/subscribe/page.tsx`
  - `src/app/laws/components/PaywallModal.tsx`
- **Tests:**
  - `src/lib/library/libraryPurchaseEligibility.test.ts`
  - the LIVE-F05 test in `src/app/api/v1/admin/entitlements/requests/[id]/route.test.ts`
  - `src/lib/library/myLibraryGrant.test.ts`: subscribe refuses before checkout, the PaywallModal note, no fallback number.
- **INTEGRATION POINT, the server gate on payment.** Without it, an individual can still pay by calling the checkout API directly.
  - Why it is not edited here: the pricing session owns the checkout server file. `src/lib/payments/checkoutCore.ts` is changed on `batch/2026-10-30-pricing-coupons` by `b43af5d0` («owner package 30 Oct — final prices, top-ups by audience…»). The brief's conflict rule therefore applies: the rule stays in `libraryPurchaseEligibility.ts` with tests, and the call site is listed here.
  - The refusal must stay BEFORE payment, never in `grantLibraryAccess` or the SQL, which would take the money and then refuse the grant.
  - Two options. **Option A** is the preferred one, because it is one place:
  - In `src/lib/pricing/priceBook.ts`, function `library()` (`:161` on main; the same `buyers: "any"` is still there on `batch/2026-10-30-pricing-coupons`): set `buyers: [...LIBRARY_ELIGIBLE_USER_TYPES]`, imported from `src/lib/library/libraryPurchaseEligibility.ts` or written as a literal.
  - `src/lib/payments/checkoutCore.ts:193` (`buyerAllowed` → 403) then refuses an individual with no other change.
  - Update the expectations in `src/lib/payments/catalog.test.ts:221-235` for lib-q1, lib-q2 and lib-annual, and that test's title.
  - **Option B:** in `checkoutCore.ts`, right after `buyerAllowed` at `:193`, add `if (known.kind === "library") { const e = libraryPurchaseEligibility(userType); if (!e.eligible) return fail(403, e.messageAr); }`, with a source-pin test.
- **Integration point 2:** `src/app/api/v1/entitlement-requests/route.ts:37` should refuse `kind=library` for an ineligible `profiles.user_type` with a 403. Today the request is created and only the admin approval refuses it.
- **Preview limit: owner decision.** The note says 3 articles; answer ١٨٤ gave a formula. Setting 3 needs no code: the admin setting `library_free_article_limit` (/dashboard/admin/settings) can be set to 3.
- **Check live:**
  1. As an individual (client) test account, open /laws/subscribe. The note «المكتبة القانونية متاحة للمهنيين» appears, the buttons are disabled, and clicking does nothing.
  2. Open a locked law: the paywall shows the note with no buy link.
  3. As a lawyer test account, the same page offers checkout as before.
  4. After integration point 1, `POST /api/v1/checkout` for lib-q1 as an individual answers 403.

---

### SQL

1. `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261030_65_library_grant_admin.sql`
   - **Order:** BEFORE the deploy is best. Either order is safe:
     - the code falls back to the old read-then-insert while the function is missing;
     - the admin list and revoke answer 503 «تحتاج تشغيل ملف 20261030_65» until it runs;
     - an admin grant with a reason fails cleanly instead of dropping the reason.
   - **Prerequisites:** 20261019_10 and 20261022_10, both live.
   - **Check (the last SELECT in the file):** one row, all `t`:

     `revoked_at_column | admin_side_table | side_table_hidden_from_users | grant_fn | revoke_fn | adjust_fn | grant_fn_server_only`
     `t | t | t | t | t | t | t`
2. `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261030_66_library_grant_reminders.sql`
   - **Order:** AFTER 65 (it raises otherwise), and before or after the deploy. Until it runs, the cron sends nothing.
   - **Check:** one row, all `t`:

     `reminders_table | rls_on | hidden_from_users | server_can_write`
     `t | t | t | t`

Proposed `_verify.sql` lines. I have not edited the file.
```sql
-- >>> verify:library_grant_admin (20261030_65 / _66, owner note ١٨)
do $$
declare fn text;
begin
  if to_regprocedure('public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)') is null then
    raise notice '_verify: 20261030_65 is not applied yet — library grants use the old read-then-insert (overlap possible), no admin revoke/end change';
    return;
  end if;
  foreach fn in array array[
    'public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)',
    'public.library_grant_revoke(uuid, uuid, text)',
    'public.library_grant_adjust_end(uuid, uuid, timestamptz, text)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception '_verify: 20261030_65 — a session role can EXECUTE % (re-run 20261030_65)', fn;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.library_access_grant_admin', 'SELECT') then
    raise exception '_verify: 20261030_65 — signed-in users can read the admins'' reasons (re-run 20261030_65)';
  end if;
  if to_regclass('public.library_grant_reminders') is null then
    raise notice '_verify: 20261030_66 is not applied yet — the library reminder job sends nothing';
  elsif has_table_privilege('authenticated', 'public.library_grant_reminders', 'SELECT') then
    raise exception '_verify: 20261030_66 — signed-in users can read library_grant_reminders (re-run 20261030_66)';
  end if;
  raise notice '_verify: 20261030_65/_66 OK — atomic library grants, admin revoke/end change, reminders (server only)';
end $$;
-- <<< verify:library_grant_admin
```

---

### Follow-ups and risks

- **Server gate on payment** (LIVE-F05 integration point 1): until `priceBook.library()` lists the buyers, an individual can still pay through a direct API call. This is the main residual risk. One line plus a test update, in the pricing session's files.
- **entitlement-requests** (integration point 2): an individual can still create a library request through REST. The approval refuses it with 409, so no access is granted, but the request lands in the admin queue.
- **Eligibility of micro, ngo and provider:** refused pending the owner's answer. Flip it in `LIBRARY_ELIGIBLE_USER_TYPES` once he answers.
- **Who may grant:** `entitlements.grant` today. If the owner wants super-admin only, it already is on main's role map, but any future role given that action would also gain library grants.
- **The n8n schedule** for `/api/v1/cron/library-grant-reminders` (daily) is not created. Email reminders are not built; the reminders are in-app only.
- **Renewal link:** the reminder's link goes to /laws/subscribe. An individual who holds an admin-granted library will see the "professionals only" note there. That is consistent with the rule, but worth the owner knowing.
- **Reminder edge cases:** markers are keyed on (chain-end grant, offset).
  - If an admin EXTENDS the chain-end grant after its 7-day reminder went out, the new end gets no fresh 7-day reminder. The 3-day one still comes.
  - `recordNotification` swallows errors, so a send that fails after the marker was inserted is lost for good.
- **Revoke can leave a gap:** a revoke or a shortening leaves a gap before a later stacked grant. This is by design and documented; the admin list shows both rows.
- **C07** (per-code duration) and **C08** (library assistant for library-only subscribers) are open, as above.
- **Local test failures:** 2 failures that exist only in this Windows checkout: «the end read takes the latest ends_at after now…» (`libraryAccess.test.ts`) and «grantPurchase keys every grant on the order» (`fulfillOrder.test.ts`).
  - Cause: `core.autocrlf=true` checks the sources out as CRLF, so the tests' `"\n}\n"` slice never matches.
  - On the LF content CI sees, the helper assertions pass (checked by normalizing the file); `fulfillOrder.ts` is untouched.
  - Not introduced by this stream.
- **Not done here:** no `next build` (it would touch prod env), and no live test with a real professional account. Everything under "Check live" is for the user or the owner.

---
