# S1: Library and protected content (owner-free wave, 2026-11-03)

> Section of the owner-free plan. It binds to `00-planner-rules.md` in this folder. Worktree `D:\nzwt\ownerfree`, branch `batch/2026-11-03-owner-free`, base main `1103812d`.
> Spec: `docs/audits/2026-11-02-owner-package/B-library.md` and `00-gap-analysis-and-plan.md` Waves 2 and 6. Every file:line below was re-read at HEAD `1103812d` on 2026-11-03.

**Goal**
- Take the principles and the book «مصادر الحق» out of public JavaScript (q390, BUG-LIB-01). They are read only from the database, and the in-reader search runs on the server.
- Fix the three search bugs: BUG-LIB-02, BUG-LIB-03 and BUG-LIB-04.
- Add the code side of BUG-LIB-06.
- Invite codes with custom days and seats (q378).
- A staff-verified library eligibility flag for micro, NGO and provider accounts (q375).
- `auto_lock_hours`: automatic library locks end after 24 h by default.

**Migrations (range 20261103_10…19)**

| File | Runs | Survives the other order because |
|---|---|---|
| `20261103_10_library_auto_lock_hours.sql` | BEFORE deploy | The settings route retries without the new column on 42703 (Task 15) |
| `20261103_11_library_invitation_grant_days.sql` | BEFORE deploy | Redeem and the admin list retry without `grant_days`, so a code gives 30 days (Task 17) |
| `20261103_12_library_eligibility_verifications.sql` | BEFORE deploy | A missing table means "not verified", which is today's behaviour (Task 19) |
| `20261103_13_library_laws_official_links.sql` | BEFORE deploy, and BEFORE the owner's next load | The app does not read the columns. The loader's preflight fails closed without them (Task 22) |
| `20261103_14_library_fts_tashkeel_fold.sql` | AFTER deploy, **STOP-POINT** | The query sends both the stripped and the as-typed form (Task 9) |

**Shared files in this section** (the controller sequences them):
- `supabase/migrations/_verify.sql`
- `src/app/api/library/library-column-lock.test.ts`
- `src/utils/normalizeArabic.ts` (also read by `src/lib/ai/retrieval.ts`)
- `src/app/laws/page.tsx`
- `src/lib/payments/checkoutCore.ts`
- `src/lib/payments/couponServer.ts`
- `src/app/dashboard/admin/users/[id]/page.tsx`

None of them is `proxy.ts`, `routeAccess.ts`, `runCore.ts` or `tools.ts`.

**Global conventions for every task**
- GitNexus does not index this worktree. Before editing an exported symbol, grep for its callers and list them in the task report. That list is the impact analysis.
- Report **HIGH risk** to the user before starting Task 19, because it changes the payments audience gate.
- Test commands:
  - one file: `node --test <file>`;
  - all tests: `npm run test:unit`. The baseline has 6 known CRLF failures; nothing new may fail.
  - Also run `npx tsc --noEmit` and `npx eslint <changed files>`.
- Build: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack`.
- `M=supabase/migrations; R=supabase/tests/rls`. Every Docker test runs its migration **twice**, which proves it is idempotent, and ends with `select … as ok` where `ok` is never NULL.
- Commits: one per task, message `<type>(library): …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never run seeders, reseed, wipe or clear. Never touch production. Read the owner package only.

---

## Phase A — protected content off the public bundle (q390, BUG-LIB-01)

**What the code does today, at HEAD:**
- **Precedents fallback.** `src/app/precedents/[slug]/page.tsx:316–387` falls back to 33 `import("@/constants/precedents/*.json")` files, 34 MB in all, whenever `/api/library/precedents/<slug>` is not OK and below 500.
  - The API looks the collection up by `.eq('id', slug)` (`src/app/api/library/precedents/[slug]/route.ts:52–56`).
  - The fallback matches only the 33 legacy English slugs (`tamyeez`, `admin-supreme-1442-part1`, …, plus `insurance-1438`).
  - The JSON files' own `id`s are Arabic, and the database ids may differ again: the route comment names «mabadi-qararat-qanuniya» for the 2,323-principle collection.
  - The fallback also **bypasses the paywall**. It renders every principle in full, with no 150-character cut and no locked flag.
- **Book fallback.** `src/app/book/[slug]/page.tsx:634–641` imports `src/constants/sources-of-right-1.json` for slug `sources-of-right-1`.
  - That file is a 4-block sample (id `مصادر-الحق-في-الفقه-الإسلامي---الجزء-الأول`). It is still protected text.
- **Demo data.** Two demo files ship real text in public JS whatever `isDemoMode` says:
  - `DEMO_RAWD` appears twice: `src/app/book/[slug]/page.tsx:85` and `src/app/laws/demo-data-books.ts:231`;
  - `DEMO_PRECEDENTS` in `src/app/laws/demo-data-precedents.ts:3` holds 7 full judgments with facts, reasons and ruling, 48 KB in all.
- **Reading quota.** The precedents and books APIs already count against the reader's quota (`src/lib/library/readQuota.ts:52–58`, `DOC_ROUTE_RE`), and so does `POST /api/library/scoped-search` (`scopedSearchDocKey`, `readQuota.ts:131–139`). The server path therefore already obeys access, quota and lock rules. Nothing below adds a new reading route.

Bundled counts (from the JSON, total 8,098 principles):

| legacy slug | principles | legacy slug | principles |
|---|---|---|---|
| admin-supreme-1439-1440-1441-part1 | 91 | banking-1408-1427 | 805 |
| admin-supreme-1439-1440-1441-part2 | 68 | banking-1443 | 1022 |
| admin-supreme-1442-part1 | 81 | commercial-papers | 140 |
| admin-supreme-1442-part2 | 91 | customs-2015-2023 | 54 |
| admin-supreme-1442-part3 | 59 | customs-2024 | 74 |
| admin-supreme-1443-part1 | 95 | insurance-principles (also `insurance-1438`) | 93 |
| admin-supreme-1443-part2 | 91 | labor-principles-1431-vol1 | 40 |
| admin-supreme-1443-part3 | 93 | labor-principles-1431-vol2 | 61 |
| admin-supreme-1443-part4 | 82 | labor-principles-1432 | 233 |
| admin-supreme-1443-part5 | 83 | price-adjustment | 17 |
| admin-supreme-1444-part1 | 71 | supreme-judicial-council | 2323 |
| admin-supreme-1444-part2 | 75 | tamyeez | 1541 |
| admin-supreme-1444-part3 | 78 | tax-2024 | 51 |
| admin-supreme-1444-part4 | 76 | zakat-2024 | 64 |
| admin-supreme-1444-part5 | 95 | zakat-tax-2020-2021-j1 | 146 |
| | | zakat-tax-2020-2021-j2 | 63 |
| | | zakat-tax-2022-j3 | 96 |
| | | zakat-tax-2023-j4 | 46 |

### Task 1: Production precheck (read-only), done before the deploy

**Files:** create `SQL_batch_2026-11-03_owner_free/S1_precheck_principles_and_book.READ_ONLY.sql`. This is not a migration and writes nothing.

**Produces:** the user's three result tables. They fill `dbId` in Task 4 and tell the owner which collections still need loading.

- [ ] Write the file with exactly the three queries below. Header comment: «للقراءة فقط — لا يغيّر شيئاً. شغّله على قاعدة الإنتاج قبل النشر وأرسل الجداول الثلاثة.»

```sql
-- 1) The 33 bundled collections: found by id or by title, with the principles each holds.
with expected(legacy_slug, json_id, json_title, json_count) as (values
  ('admin-supreme-1439-1440-1441-part1', 'مبادئ-المحكمة-الإدارية-العليا-1439-1440-1441هـ-ج1_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — للأعوام 1439-1440-1441هـ — الجزء الأول', 91),
  ('admin-supreme-1439-1440-1441-part2', 'مبادئ-المحكمة-الإدارية-العليا-1439-1440-1441هـ-ج2_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — للأعوام 1439-1440-1441هـ — الجزء الثاني', 68),
  ('admin-supreme-1442-part1', 'مبادئ-المحكمة-الإدارية-العليا-1442هـ-ج1_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الأول', 81),
  ('admin-supreme-1442-part2', 'مبادئ-المحكمة-الإدارية-العليا-1442هـ-ج2_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الثاني', 91),
  ('admin-supreme-1442-part3', 'مبادئ-المحكمة-الإدارية-العليا-1442هـ-ج3_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1442هـ — الجزء الثالث', 59),
  ('admin-supreme-1443-part1', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج1_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الأول', 95),
  ('admin-supreme-1443-part2', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج2_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الثاني', 91),
  ('admin-supreme-1443-part3', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج3_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الثالث', 93),
  ('admin-supreme-1443-part4', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج4_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الرابع', 82),
  ('admin-supreme-1443-part5', 'مبادئ-المحكمة-الإدارية-العليا-1443هـ-ج5_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1443هـ — الجزء الخامس', 83),
  ('admin-supreme-1444-part1', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج1_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الأول', 71),
  ('admin-supreme-1444-part2', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج2_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الثاني', 75),
  ('admin-supreme-1444-part3', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج3_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الثالث', 78),
  ('admin-supreme-1444-part4', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج4_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الرابع', 76),
  ('admin-supreme-1444-part5', 'مبادئ-المحكمة-الإدارية-العليا-1444هـ-ج5_ديوان_المظالم', 'مبادئ المحكمة الإدارية العليا — 1444هـ — الجزء الخامس', 95),
  ('banking-1408-1427', 'مبادئ-تسوية-المنازعات-المصرفية-1408-1427_وزارة_العدل', 'مبادئ قضائية', 805),
  ('banking-1443', 'مبادئ-المنازعات-المصرفية-والتمويلية-1443_وزارة_العدل', 'مبادئ قضائية', 1022),
  ('commercial-papers', 'مبادئ-منازعات-الأوراق-التجارية_وزارة_العدل', 'مبادئ قضائية', 140),
  ('customs-2015-2023', 'مبادئ-الاستئناف-الجمركية-2015-2023م_وزارة_العدل', 'مجموعة المبادئ الاستئنافية الجمركية ٢٠١٥-٢٠٢٣م', 54),
  ('customs-2024', 'مبادئ-الاستئناف-الجمركية-2024م_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الجمركية لعام ٢٠٢٤م', 74),
  ('insurance-principles', 'مدونة-المبادئ-القضائية-التأمينية_وزارة_العدل', 'مدونة المبادئ القضائية التأمينية', 93),
  ('labor-principles-1431-vol1', 'مدونة-المبادئ-والقرارات-العمالية-1431هـ-المجلد-الأول_وزارة_العدل', 'مدونة المبادئ والقرارات العمالية لعام 1431هـ - المجلد الأول', 40),
  ('labor-principles-1431-vol2', 'مدونة-المبادئ-والقرارات-العمالية-1431هـ-المجلد-الثاني_وزارة_العدل', 'مدونة المبادئ والقرارات العمالية لعام 1431هـ - المجلد الثاني', 61),
  ('labor-principles-1432', 'مدونة-المبادئ-العمالية-1432هـ_وزارة_العدل', 'مدونة المبادئ العمالية لعام 1432هـ', 233),
  ('price-adjustment', 'مبادئ-لجنة-التظلمات-وتعديل-الأسعار_وزارة_العدل', 'مبادئ لجنة النظر في التظلمات وطلبات تعديل الأسعار', 17),
  ('supreme-judicial-council', 'المبادئ-والقرارات-القانونية-منقحة_وزارة_العدل', 'المبادئ والقرارات القانونية', 2323),
  ('tamyeez', 'تقريرات-محكمة-التمييز_وزارة_العدل', 'تقريرات محكمة التمييز', 1541),
  ('tax-2024', 'مبادئ-الاستئناف-الضريبية-2024م_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الضريبية لعام ٢٠٢٤م', 51),
  ('zakat-2024', 'مبادئ-الاستئناف-الزكوية-2024م_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية لعام ٢٠٢٤م', 64),
  ('zakat-tax-2020-2021-j1', 'مبادئ-الاستئناف-الزكوية-والضريبية-2020-2021م-ج1_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعامي ٢٠٢٠م - ٢٠٢١م - المجلد الأول', 146),
  ('zakat-tax-2020-2021-j2', 'مبادئ-الاستئناف-الزكوية-والضريبية-2020-2021م-ج2_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعامي ٢٠٢٠م - ٢٠٢١م - المجلد الثاني', 63),
  ('zakat-tax-2022-j3', 'مبادئ-الاستئناف-الزكوية-والضريبية-2022م-ج3_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعام ٢٠٢٢م - المجلد الثالث', 96),
  ('zakat-tax-2023-j4', 'مبادئ-الاستئناف-الزكوية-والضريبية-2023م-ج4_وزارة_العدل', 'مجموعة المبادئ المستخرجة من قرارات لجان الاستئناف الزكوية والضريبية لعام ٢٠٢٣م - المجلد الرابع', 46)
), by_id as (
  -- An exact id match wins.
  select e.legacy_slug, e.json_count, 'id'::text as matched_by, jc.id as db_id
    from expected e
    join library.judicial_collections jc on jc.id = e.json_id
), by_title as (
  -- Title only when no id matched. Three rows share the title «مبادئ قضائية»
  -- (banking-1408-1427, banking-1443, commercial-papers), so a title match may be ambiguous.
  select e.legacy_slug, e.json_count, 'title'::text as matched_by, jc.id as db_id
    from expected e
    join library.judicial_collections jc on jc.title = e.json_title
   where not exists (select 1 from by_id b where b.legacy_slug = e.legacy_slug)
), found as (
  select e.legacy_slug, e.json_count, m.matched_by, m.db_id,
         (select count(*) from library.principles p where p.collection_id = m.db_id)::int as db_count
    from expected e
    left join (select * from by_id union all select * from by_title) m on m.legacy_slug = e.legacy_slug
)
select legacy_slug,
       json_count,
       coalesce(max(matched_by), '—') as matched_by,
       count(db_id)::int as match_count,
       coalesce(string_agg(db_id || ' (' || db_count || ')', ' | ' order by db_count desc), '— لا يوجد —') as db_matches,
       coalesce(max(db_count), 0) as best_db_count,
       (count(db_id) = 1 and coalesce(max(db_count), 0) >= json_count) as ok
  from found
 group by legacy_slug, json_count
 order by legacy_slug;

-- 2) Every collection the database holds, to match the "— لا يوجد —" rows by eye.
select jc.id, jc.title, jc.ruling_count,
       (select count(*) from library.principles p where p.collection_id = jc.id)::int as principles
  from library.judicial_collections jc
 order by jc.title, jc.id;

-- 3) The book «مصادر الحق».
select b.id, b.title, b.series_id, b.volume_number,
       (select count(*) from library.feqh_blocks fb where fb.book_id = b.id)::int as blocks,
       (select count(*) from library.feqh_blocks fb where fb.book_id = b.id) > 0 as ok
  from library.feqh_books b
 where b.title like 'مصادر الحق%' or b.id like 'مصادر-الحق%'
union all
select '— لا يوجد كتاب «مصادر الحق» في قاعدة البيانات —', null, null, null, 0, false
 where not exists (select 1 from library.feqh_books b where b.title like 'مصادر الحق%' or b.id like 'مصادر-الحق%');
```

- [ ] Verify locally that the file parses. Pick one:
  - run it against a throwaway container after the library chain: `bash $R/run.sh $M/20260626_legal_library_schema.sql <the file>`. The harness treats the last file as the test. It must exit 0 and print rows with `ok` false;
  - or have a reviewer read it.
- [ ] **STOP-POINT:** hand the file to the user. They run it on production and paste the three tables back.
  - The deletion (Task 8) does **not** wait for the answer: the server path plus the honest notices are safe without it.
  - Task 4's `dbId` values come only from this answer. Without an answer they stay `null`.
- [ ] Commit: `chore(library): read-only precheck for principles and the book before the bundle deletion`.

### Task 2: Precedents API serves 50-row windows and a `?target=` window

**Files:**
- modify `src/app/api/library/precedents/[slug]/_window.ts`:
  - `PRINCIPLES_DEFAULT_LIMIT` (line 13) becomes 50;
  - `PRINCIPLES_MAX_LIMIT` (line 14) becomes 50;
  - add `targetWindowOffset`;
- modify `src/app/api/library/precedents/[slug]/route.ts` (the window block, lines 104–138);
- modify `src/app/api/library/precedents/[slug]/_window.test.ts`.

**Interfaces:**
- **Produces:**
  - `targetWindowOffset(position: number, limit: number): number`, which returns `Math.floor(max(0, position) / limit) * limit`.
  - Response field `targetFound: boolean`. It is false when no `target` was sent, or when the target is not in this collection.
- **Consumes:** query `target=<principle id>`. It only moves the window. The paywall still uses the global index (`isPrincipleLocked(isFree, freeLimit, offset + idx)`).
- Blast radius (grep): callers of the route are `src/app/precedents/[slug]/page.tsx:280,423` only. `PRINCIPLES_MAX_LIMIT` is used in `_window.ts` and its test.

- [ ] Failing tests in `_window.test.ts`:
  - `planPrincipleWindow caps limit at 50`: `planPrincipleWindow(new URLSearchParams("limit=500")).limit === 50` and `planPrincipleWindow(new URLSearchParams("")).limit === 50`.
  - `targetWindowOffset`: `(0,50)→0`, `(49,50)→0`, `(50,50)→50`, `(2322,50)→2300`, `(-3,50)→0`.
  - Route source contract (read the file as text, as the sibling tests do):
    - the target lookup uses `createServiceClient` with `.eq('collection_id', slug)`;
    - the position is two head counts, `.lt('order_index'` and `.eq('order_index'`…`.lt('id'`;
    - the route never uses `.or(` for it (no user text in a filter string).
- [ ] Run `node --test "src/app/api/library/precedents/[slug]/_window.test.ts"` and see it fail.
- [ ] Code:
  - when `target` is present, read `order_index, id` of that principle (service role, same collection);
  - position = count(`order_index < X`) + count(`order_index = X and id < Y`);
  - `offset = targetWindowOffset(position, limit)`;
  - if the target is not found, fall back to the plain `offset`/`page`.
- [ ] Run the test again until it passes, then `npm run test:unit` and `npx tsc --noEmit`.
- [ ] Commit: `feat(library): principles API windows of 50 and a target window (q390-ب)`.

### Task 3: The collection holds a run that may start mid-collection

**Files:**
- modify `src/app/precedents/[slug]/_collection-model.ts`;
- add or extend `src/app/precedents/[slug]/_collection-model.test.ts`.

**Interfaces:**
- **Produces:**
  - `interface CollectionRun { start: number; items: CollectionPrinciple[] }`
  - `runNextOffset(run: CollectionRun): number` returns `start + items.length`.
  - `runPrevWindow(run: CollectionRun, limit: number): { offset: number; limit: number } | null` returns `null` when `start === 0`. Otherwise `offset = max(0, start - limit)` and `limit = start - offset`.
  - `appendRun(run, incoming)` keeps `start` and de-duplicates by id.
  - `prependRun(run, incoming, offset)` sets `start = offset` and de-duplicates by id.
  - `runHasMore(run, total: number | null, lastHasMore: boolean): boolean`.
- Keep `mergePrinciples`, `normalizePrinciple` and `hasMorePrinciples`. Delete `nextOffset` once Task 5 no longer uses it (grep: only `page.tsx:423`).

- [ ] Failing tests, with these exact values:
  - `runNextOffset({start:100, items:[50 items]}) === 150`.
  - `runPrevWindow({start:120,…},50)` deep-equals `{offset:70,limit:50}`.
  - `runPrevWindow({start:30,…},50)` deep-equals `{offset:0,limit:30}`.
  - `runPrevWindow({start:0,…},50) === null`.
  - `prependRun` with an overlapping id keeps one copy, and `start` becomes the new offset.
  - `runHasMore({start:2300, items:23}, 2323, false) === false`.
- [ ] Run `node --test "src/app/precedents/[slug]/_collection-model.test.ts"`. It fails, then it passes once the code is in.
- [ ] Commit: `feat(library): principle runs that start at a target window`.

### Task 4: Legacy slugs and honest reader notices (pure)

**Files:**
- create `src/lib/library/legacyLibrarySlugs.ts` and `legacyLibrarySlugs.test.ts`;
- create `src/lib/library/readerNotice.ts` and `readerNotice.test.ts`.

**Interfaces:**
- `LEGACY_COLLECTION_SLUGS: Readonly<Record<string, { titleAr: string; dbId: string | null }>>`.
  - 34 keys: the 33 slugs in the table above, plus `insurance-1438`, which maps to the same entry as `insurance-principles`.
  - `titleAr` comes from the JSON title. These are catalogue titles, not text.
- `LEGACY_BOOK_SLUGS`: the same shape, with one key, `sources-of-right-1`, and `titleAr` = «مصادر الحق في الفقه الإسلامي».
- `legacyTarget(kind: "collection" | "book", slug: string): { titleAr: string; dbId: string | null } | null`.
  - The slug goes through `normalizeDocSegment` from `readQuota.ts` before the lookup.
- `type ReaderNotice = { kind: "not_found" | "coming_soon" | "text_pending" | "load_error"; titleAr: string; bodyAr: string }`.
- `collectionNotice(i: { status: number | null; slug: string; total: number | null; error: string | null }): ReaderNotice | null`.
- `bookNotice(i: { status: number | null; slug: string; blocks: number | null; error: string | null }): ReaderNotice | null`.

**Filling `dbId`:** use only Task 1's answer.
- A row with `ok = true` (which already implies `match_count = 1`) gets that id.
- A title match (`matched_by = 'title'`) on one of the three «مبادئ قضائية» rows is filled only when the user confirms it by eye against query 2.
- Every other row stays `null`. No guessing.

**Inbound links (grep at HEAD, list the hits in the Task 23 run notes):**
- Run `grep -rn "tamyeez\|insurance-1438\|sources-of-right-1\|admin-supreme-\|banking-14\|labor-principles-\|zakat-tax-\|commercial-papers\|price-adjustment\|supreme-judicial-council" src public --include=*.ts --include=*.tsx --include=*.xml`.
- At 1103812d the hits are:
  - `src/app/laws/law-metadata-map.ts` (+ its test);
  - `src/app/laws/page.tsx`;
  - `src/app/laws/components/ListItems.tsx`;
  - `src/app/laws/components/PaywallModal.tsx`;
  - `src/app/laws/demo-data.ts` and `demo-data-precedents.ts`;
  - `src/constants/lawsLibraryData.ts`;
  - `src/app/laws/principleLink.test.ts`;
  - the two reader pages.
- These links stay as they are. Each one now lands on the redirect (`dbId` set) or on «قريباً» (`dbId` null). The run notes tell the owner which catalogue entry points show «قريباً» until he loads that collection.

**Notices (exact Arabic copy):**

| Case | Notice |
|---|---|
| `status >= 500` | `load_error`, body = `error` ?? «تعذّر تحميل المجموعة، حاول مجدداً» |
| `status === 404` and the slug is legacy | `coming_soon`, title = `titleAr`, body «هذه المجموعة قريباً في المكتبة القانونية.» |
| `status === 404` otherwise | `not_found`, body «المجموعة المطلوبة غير موجودة في المكتبة.» |
| `status === 200` and `total === 0` | `text_pending`, body «نص هذه المجموعة قيد الإضافة — قريباً.» |
| otherwise | `null` |

The book uses the same cases with «الكتاب» wording:
- `not_found` keeps today's «عفواً، الكتاب غير موجود».
- `text_pending` = «نص هذا الكتاب قيد الإضافة — قريباً.»

- [ ] Failing tests:
  - `Object.keys(LEGACY_COLLECTION_SLUGS).length === 34`.
  - `legacyTarget("collection","tamyeez")?.titleAr === "تقريرات محكمة التمييز"`.
  - `legacyTarget("collection","%D8%A3")` returns `null` and does not throw.
  - `legacyTarget("book","sources-of-right-1")?.titleAr === "مصادر الحق في الفقه الإسلامي"`.
  - Each notice row in the table above, with the exact strings.
  - A source scan: no value in `legacyLibrarySlugs.ts` is longer than 200 characters, so no text can hide there.
- [ ] Run `node --test src/lib/library/legacyLibrarySlugs.test.ts src/lib/library/readerNotice.test.ts`. It fails, then it passes.
- [ ] Commit: `feat(library): legacy collection/book slugs and honest reader notices`.

### Task 5: The precedents reader uses only the server path

**Files:** modify `src/app/precedents/[slug]/page.tsx`. Lines at HEAD:
- 60–61: window constants;
- 264–408: load effect and fallback;
- 410–490: `loadMore`, `loadAll`, scroll;
- 498–548: jump loop;
- 579–597: `filteredPrinciples`;
- 702–710: missing collection;
- 943–964: local filter box;
- 988–1014: status.

**Consumes:** Tasks 2, 3 and 4. Shared files: none.

- [ ] Failing test: create `src/app/precedents/[slug]/page-contract.test.ts`, which reads `page.tsx` as text. It asserts:
  - no `@/constants/precedents`;
  - no `loadAll`;
  - no `SEARCH_WINDOW_LIMIT`;
  - no placeholder «تصفية المبادئ المعروضة»;
  - `WINDOW_LIMIT = 50`;
  - it contains `legacyTarget("collection"` and `collectionNotice(`;
  - a `?target=` fetch, with ``&target=${encodeURIComponent(`` in the source.
- [ ] Run `node --test "src/app/precedents/[slug]/page-contract.test.ts"` and see it fail.
- [ ] Code:
  1. **Before the first fetch:** if `legacyTarget("collection", slug)?.dbId` is set, call `router.replace(`/precedents/${apiSlug(dbId)}${location.search}${location.hash}`)` and return. There is no fetch, so the quota is never spent twice.
  2. **Load:** `GET …?offset=0&limit=50`.
     - When the arrival carries a target (`readerArrival(…).target`), request `…?target=<id>&limit=50` instead. The run's `start` = `pagination.offset`.
     - On any non-OK answer, set a `ReaderNotice` from `collectionNotice`, so a legacy slug shows «قريباً».
     - Render the notice with a «العودة إلى المكتبة القانونية» link to `/laws`. Never a blank page.
     - A `200` with `total === 0` renders the `text_pending` notice inside the normal page frame.
  3. **Delete:**
     - the whole static-import fallback;
     - `loadAll` and `SEARCH_WINDOW_LIMIT`, plus the effect that loaded every window on search (lines 472–478);
     - the local filter box and `searchQuery`. `filteredPrinciples` becomes the run's items.
     - In-reader search is `ScopedSearchPanel` only. It is already on the server and already spends the quota.
  4. **Jump (the `#id`, `?target=` and `openScopedHit` paths):**
     - if the id is held, scroll to it;
     - otherwise fetch the target window, replace the run (as in Task 3) and scroll. One request, never a paging loop.
  5. Add «عرض ما قبل هذا الموضع» above the list when `runPrevWindow(run, 50)` is not null. It prepends that window.
  6. `SearchLegendBar partial` = `hasMore || run.start > 0`.
- [ ] Run the contract test, `npm run test:unit`, `npx tsc --noEmit` and `npx eslint "src/app/precedents/[slug]/page.tsx"`.
- [ ] Manual check (dev server, any seeded collection):
  - `/precedents/<db id>` shows 50 principles, and scrolling appends 50 more;
  - `/precedents/<db id>#<id of the 300th principle>` opens at that window with «عرض ما قبل هذا الموضع»;
  - `/precedents/tamyeez` with `dbId: null` shows «قريباً».
- [ ] Commit: `fix(library): principles reader reads the database only — no bundled fallback, no load-all (q390, BUG-LIB-01)`.

### Task 6: The book reader uses only the server path, in batches of 50

**Files:**
- modify `src/app/book/[slug]/page.tsx`:
  - line 74: `STREAM_BATCH` becomes 50;
  - lines 85–200: delete the inline `DEMO_RAWD`;
  - lines 605–643: load and fallback;
  - line 763: not found;
- modify `src/app/api/library/books/[slug]/_shape.ts`: line 7, `BLOCKS_MAX_LIMIT` becomes 50;
- modify `src/app/api/library/books/[slug]/_shape.test.ts`.

**Blast radius:** `/api/library/books` callers are `book/[slug]/page.tsx:268,494,609` and `src/app/laws/feqh-preview/page.tsx:165`.
- At HEAD, 268 and 609 send `limit=${STREAM_BATCH}` (it becomes 50) and 494 sends `limit=1`. No caller asks for more than 50.
- feqh-preview uses the default of 50, so it is unaffected.

- [ ] Failing tests:
  - `planBlocksPage(new URLSearchParams("limit=80")).limit === 50`.
  - A contract test `src/app/book/[slug]/page-contract.test.ts` asserts:
    - no `sources-of-right-1.json`;
    - no `const DEMO_RAWD`;
    - `STREAM_BATCH = 50`;
    - `legacyTarget("book"` and `bookNotice(`.
- [ ] Run `node --test "src/app/api/library/books/[slug]/_shape.test.ts" "src/app/book/[slug]/page-contract.test.ts"` and see it fail.
- [ ] Code:
  - redirect a legacy slug that has a `dbId`, as in Task 5;
  - on 404 or 5xx, render `bookNotice`;
  - delete the JSON import branch;
  - delete the demo branch and the inline `DEMO_RAWD`. Demo mode no longer has a book fallback, so a missing book shows the notice.
  - The STREAM_MAX_BLOCKS 800 cap stays.
- [ ] Run the tests until they pass, then `npm run test:unit` and `npx tsc --noEmit`.
- [ ] Commit: `fix(library): book reader reads the database only, batches of 50 (q390)`.

### Task 7: Colour principles only near the viewport (BUG-LIB-01)

**Files:**
- modify `src/components/search/MultiColorHighlight.tsx`:
  - `Hl` (lines 76–95);
  - `SearchLegendBar` (lines 112–228);
- create `src/hooks/useNearViewport.ts`;
- modify `src/app/precedents/[slug]/_principle-block.tsx`;
- modify `src/app/precedents/[slug]/page.tsx`;
- add `src/components/search/highlightScope.test.ts` (pure parts).

**Interfaces:**
- `HighlightScope({ active, children }: { active: boolean; children: ReactNode })` is a context. When `active === false`, `Hl` renders plain text (no `<mark>`).
- `useNearViewport(ref: RefObject<Element | null>, rootMargin = "800px 0px"): boolean` returns true when `IntersectionObserver` is missing.
- `SearchLegendBar` gets two optional props:
  - `counts?: readonly number[]`, which overrides the DOM recount;
  - `onStep?: (dir: 1 | -1, term: number | null) => boolean`, which handles ↑/↓ when it returns true.
- Pure helper `stepPrincipleIndex(matchIndexes: readonly number[], current: number, dir: 1 | -1): number | null`. It wraps at the ends and returns null for an empty list.

**Blast radius:** `Hl` and `SearchLegendBar` are also used in the law reader, the book reader and `ScopedSearchPanel`. With no `HighlightScope` and no new props, their behaviour is unchanged. Pin that in the test.

- [ ] Failing tests:
  - `stepPrincipleIndex([2,5,9], 5, 1) === 9`, `([2,5,9], 9, 1) === 2`, `([2,5,9], 2, -1) === 9`, `([], 0, 1) === null`.
  - A source contract: `Hl` returns plain text when the scope context is `false`, and `SearchLegendBar` uses `counts` when it is given.
- [ ] Run `node --test src/components/search/highlightScope.test.ts`. It fails, then it passes.
- [ ] Code:
  - `PrincipleBlock` wraps its body in `<HighlightScope active={useNearViewport(cardRef)}>`;
  - the page computes `counts` with `countTermMatches` (`src/lib/search/multiColorSearch.ts:251`) over the loaded principles' texts, using the deferred query;
  - `onStep` scrolls to the next principle id that matches, through `stepPrincipleIndex`. Its marks render once it is near.
- [ ] Manual check: a collection with 50 loaded principles and `?q=` shows the legend counts for all 50. ↓ walks principle by principle. Marks exist only in the blocks near the screen (check in DevTools).
- [ ] Commit: `perf(library): colour principles only near the viewport (BUG-LIB-01)`.

### Task 8: Delete the bundles and prove they are not served

**Files:**
- delete `src/constants/precedents/` (33 files);
- delete `src/constants/sources-of-right-1.json`;
- modify `src/app/laws/demo-data-precedents.ts` and `src/app/laws/demo-data-books.ts`;
- create `src/constants/no-protected-bundles.test.ts`.

**Depends on:** Tasks 5 and 6 merged. The server path must be in place first.

- [ ] **Positive control, before deleting anything:**
  - run the build command;
  - run `grep -rl "الإجارة عقد لازم لا تتغير بتغير الأجور" .next/static`. It must print at least one chunk, which proves the check can see the leak;
  - write the chunk name in the task report.
  - **If the Arabic grep finds 0 chunks**, webpack may have written the Arabic as `\uXXXX` escapes. Use these fallbacks, and use the same fingerprint again after the deletion:
    - grep the escaped form of the fingerprint's first three words (generate it with `node -e 'console.log(JSON.stringify("الإجارة عقد لازم").slice(1,-1).replace(/[\u0080-￿]/g,c=>"\\\\u"+c.charCodeAt(0).toString(16).padStart(4,"0")))'`);
    - or grep the Arabic JSON id `تقريرات-محكمة-التمييز_وزارة_العدل` in both raw and escaped forms.
  - A positive control that finds nothing in any form blocks the task. Report it; don't skip it.
- [ ] Failing test `no-protected-bundles.test.ts`:
  - `existsSync("src/constants/precedents") === false`;
  - `existsSync("src/constants/sources-of-right-1.json") === false`;
  - a recursive scan of `src/**/*.{ts,tsx}` finds 0 files containing `constants/precedents` or `sources-of-right-1.json`;
  - every string field longer than 150 characters in `DEMO_PRECEDENTS` and `DEMO_RAWD` (`demo-data-books.ts`) counts as a failure. The expected count is 0.
- [ ] Run `node --test src/constants/no-protected-bundles.test.ts` and see it fail.
- [ ] Code:
  - `git rm` the 34 files;
  - cut the long demo fields (`facts`, `reasons`, `ruling`, `matn`, `sharh`, each `hashiyah` item) to the first 150 characters plus «…». Cutting is not inventing; the demo only shows in demo mode.
- [ ] Verify:
  - the test passes;
  - rebuild, then `grep -rl "الإجارة عقد لازم لا تتغير بتغير الأجور" .next/static` and `grep -rl "مصادر الحق هي الأسباب التي تنشيء الحق" .next/static` both print nothing;
  - `npm run test:unit` and `npx tsc --noEmit` pass.
- [ ] Add an ops step to the run notes (Task 23). Commit: `fix(library): delete the bundled principles and book (q390, BUG-LIB-01) — server-only`.

---

## Phase B — search (BUG-LIB-02, BUG-LIB-03, BUG-LIB-04)

**What the code does today, at HEAD:**
- **FTS config.** It is `simple` (`LIBRARY_FTS_CONFIG`, `src/utils/normalizeArabic.ts:618`): no folding and no prefix stripping. The query side expands alef forms, final ة/ه and ى/ي, and digits (`arabicSpellingVariants`, lines 193–254).
- **«لايكون».** «لايكون» is one lexeme, and «لا يكون» is two.
- **Prefixes and parentheses.** «قرار» does not match «القرار», «بالقرار» or «للقرار». `(` becomes part of a term.
- **Client grammar.** `parseHighlightQuery` / `termPatternSource` (`src/lib/search/multiColorSearch.ts:84–186`) already ignore harakat and match substrings. They do not join «لا يكون» to «لايكون», and they keep `(` in a word.
- **Blast radius of `parseSearchQuery`:**
  - `src/app/api/library/search/route.ts:241`;
  - `src/app/api/library/scoped-search/route.ts:207`;
  - **`src/lib/ai/retrieval.ts:105,305`**, the AI tools' library retrieval.
  - 18 exact-tsquery assertions live in `src/utils/normalizeArabic.test.ts`, `src/app/api/library/scoped-search/scopedSearch.test.ts` and `src/app/api/library/autocomplete/route-tsquery.test.ts`.

### Task 9: Server query grammar: particles, prefixes, parentheses and tashkeel

**Shared files:** `src/utils/normalizeArabic.ts` (AI retrieval reads it).

**Files:** modify `src/utils/normalizeArabic.ts` (`parseSearchQuery` lines 269–476, `wordTsquery` lines 291–298) and `src/utils/normalizeArabic.test.ts`.

**Interfaces (produces):**
- `NEGATION_PARTICLES = ["فيما", "مما", "ألا", "لا", "ما"] as const`, longest first. This is the owner's list (لا، ما، فيما، مما، ألا).
  - Bare «الا» (no hamza) is **not** a particle. It would split «الاداري», «الاثبات» and «الالكتروني», which are ال + alef words.
  - A typed «الا» standing alone is just a word.
- `ARTICLE_PREFIXES = ["وال", "بال", "لل", "ال"] as const`.
- `stripTashkeel(text: string): string` removes U+064B–U+065F, U+0670 and U+0640.
- `splitFusedParticle(word: string): { particle: string; rest: string } | null`. It returns non-null only when the word starts with a particle and `rest` has 3 or more letters:
  - «لايكون» gives {لا, يكون};
  - «مادة» gives null;
  - «لازم» gives null.
- `prefixForms(word: string): string[]`. The word as given comes first. Words of fewer than 3 letters, words with digits, and particles get `[]` extra.
  - A bare word w gets `[w, "ال"+w, "وال"+w, "بال"+w, "لل"+w]`.
  - A word with a leading prefix (base b) gets `[typed, "ال"+b, "وال"+b, "بال"+b, "لل"+b]`, without the bare b.
- `parseSearchQuery(query)` keeps its signature and return shape.

**Rules (pinned):**
1. `(` and `)` outside a quoted phrase read as whitespace, so `(+)` is `+`. Inside quotes they stay literal.
2. **Lexeme order and budget.** For each word:
   - lexeme order = as typed → `stripTashkeel` form (if it differs) → prefix forms of the stripped form → alef and final spelling variants of the stripped form;
   - all extras draw from the existing `MAX_QUERY_SPELLING_VARIANTS = 48` per-query budget, and the end of the list is cut first;
   - a word keeps at most 12 lexemes.
3. **Particles:**
   - A fused word «لايكون» becomes `('لايكون' | ('لا' <-> 'يكون'))`.
   - A standalone particle followed by a plain term, unquoted «لا يكون», becomes **one operand** `(('لا' <-> 'يكون') | 'لايكون')`, not `'لا' & 'يكون'`.
   - A phrase `"لا يكون"` also gains `| 'لايكون'`.
   - Particles get no prefix forms.
   - A fused split is only ever an extra OR alternative. A false split, such as «لائحة» into لا + ئحة, can cost budget but never removes a hit.
   - The fused-split alternative is the **last** extra in a word's budget order, so it is cut first.
4. Negation (`-`), `*` and `/` keep today's semantics. A prefix query (`قرار*`) puts `:*` on every form.

**Tests:**
- [ ] Failing tests (`assert.ok(tsquery.includes(…))` unless the assertion says otherwise):
  - `parseSearchQuery("لايكون")` includes `'لايكون'` and `'لا' <-> 'يكون'`.
  - `parseSearchQuery("لا يكون")` includes the same two. Its top level has no ` & 'لا'` (`assert.doesNotMatch(tsquery, /& 'لا'\)/)`).
  - `parseSearchQuery("فيما يخص")` includes `'فيما' <-> 'يخص'` and `'فيمايخص'`.
  - `parseSearchQuery("قرار")` includes each of `'قرار'`, `'القرار'`, `'والقرار'`, `'بالقرار'`, `'للقرار'`.
  - `parseSearchQuery("القرار")` includes `'القرار'`, `'بالقرار'` and `'للقرار'`, and does **not** include `'قرار'`.
  - `parseSearchQuery("عدم نفاذ (+) قرار")` and `parseSearchQuery("(عدم نفاذ) + قرار")` do not throw, and both include `'القرار'` and ` & `.
  - `parseSearchQuery('"(تحكيم)"').plainTerms[0] === "(تحكيم)"`, so parentheses inside quotes stay.
  - `parseSearchQuery("القَرَار")` includes `'القرار'`.
  - **Budget:** `parseSearchQuery("الاثبات الالكتروني القرار الاداري النظام العقوبة")`:
    - the number of lexemes (`match(/'(?:[^'\\]|\\.)*'/g).length`) is at most 6 + 48;
    - `tsquery.length` is at most 4000.
  - The same budget query still includes `'بالاثبات'` and `'للاداري'`. This proves the cut drops fused splits first, not the real prefix forms.
  - **Negative fixtures:** `parseSearchQuery("الاداري")`, `parseSearchQuery("الاثبات")`, `parseSearchQuery("الالكتروني")` and `parseSearchQuery("مادة")` each give a tsquery with no `<->` (`assert.doesNotMatch(tsquery, /<->/)`).
  - `splitFusedParticle("الاداري") === null`, and `splitFusedParticle("ألايكون")` deep-equals `{particle:"ألا", rest:"يكون"}`.
  - `parseSearchQuery("المادة 12")` still includes `'12'` and `'١٢'`.
  - **AI retrieval:** add to `src/lib/ai/retrieval.test.ts` (or create it) that for each of «قرار», «لا يكون» and «عدم نفاذ + قرار» the tsquery that `retrieval.ts:305` builds is non-empty and at most 4000 characters.
- [ ] Run `node --test src/utils/normalizeArabic.test.ts` and see it fail.
- [ ] Code: implement the rules above. Update the 18 exact-string fixtures.
  - Each update may only **add** OR-alternatives to an existing group.
  - The report lists each changed fixture, before and after.
- [ ] Verify:
  - `node --test src/utils/normalizeArabic.test.ts src/app/api/library/scoped-search/scopedSearch.test.ts src/app/api/library/autocomplete/route-tsquery.test.ts`;
  - `npm run test:unit`;
  - the Docker search tests, which must still pass: `library_search_scoped_page.test.sql`, `library_search_relevance.test.sql`, `library_search_principles_page.test.sql`, each with the chain in its own header.
- [ ] Commit: `fix(library): search joins لا/ما particles, expands ال/وال/بال/لل, ignores (+) and tashkeel (BUG-LIB-02/03)`.

### Task 10: The colours agree with the results

**Files:** modify `src/lib/search/multiColorSearch.ts` (`parseHighlightQuery` lines 84–158, `termPatternSource` lines 178–186) and its test file `src/lib/search/multiColorSearch.test.ts`.

- [ ] Failing tests:
  - `parseHighlightQuery("(عدم نفاذ) + قرار").terms.map(t=>t.label)` deep-equals `["عدم","نفاذ","قرار"]`.
  - A term «لا يكون» (unquoted particle plus word) becomes **one** phrase term. Its regex matches both «لايكون» and «لا يكون»:
    - `new RegExp(termPatternSource({label:"لا يكون",kind:"phrase"}),"u").test("وهذا لايكون")` is true;
    - the same pattern on «وهذا لا يكون» is true.
  - `termPatternSource({label:"لايكون",kind:"word"})` matches «لا يكون».
  - `parseHighlightQuery("الاداري").terms` has exactly one word term, «الاداري». Its pattern does not match «الا داري».
  - `compileQueryMatcher(parseHighlightQuery("قرار"))(["بالقرار"])` is true. Substring matching already does this; pin it.
- [ ] Run `node --test src/lib/search/multiColorSearch.test.ts`. It fails, then it passes once the code below is in.
- [ ] Code: import `NEGATION_PARTICLES` and `splitFusedParticle` from `@/utils/normalizeArabic` so both sides share one list. In the regex, a particle boundary becomes `\s*`.
- [ ] Verify with `npm run test:unit`, then commit: `fix(library): highlight grammar mirrors the server (BUG-LIB-02/03)`.

### Task 11: One search bar per reader; no literal `includes` filters

**Shared files:** `src/app/laws/page.tsx`.

**Files:**
- `src/app/laws/[slug]/page.tsx`: lines 160, 182 and 639–664;
- `src/app/laws/[slug]/_sidebar.tsx`: lines 751–775;
- `src/app/book/[slug]/page.tsx`: lines 202, 211 and 241–244;
- `src/app/book/[slug]/_sidebar.tsx`: lines 16–112;
- `src/app/laws/page.tsx`: lines 852, 1175, 1213, 1224, 1271, 1292 and 1347–1356;
- create `src/app/laws/[slug]/articleJump.ts` and `articleJump.test.ts`;
- create `src/app/laws/catalogueMatch.ts` and `catalogueMatch.test.ts`.

**Interfaces:**
- `matchArticleJump(query: string, articles: readonly Pick<LawArticle,"id"|"num"|"number"|"numberText"|"title">[]): string[]` returns article ids in order.
  - It matches the number: Western digits after `toWesternDigits`, equal to `String(number)`.
  - Or it matches `num` / `numberText` / `title` through `compileQueryMatcher(parseHighlightQuery(q))`.
  - **Never body text.**
- `catalogueMatches(q: string, fields: ReadonlyArray<string | null | undefined>): boolean` returns `compileQueryMatcher(parseHighlightQuery(q))(fields)`. It is memoized per `q`.

**Decisions (BUG-LIB-04):**
- In every reader, the one search bar is `ScopedSearchPanel`. It is server-side, already spends the quota and gets the ⓘ in Task 12.
- **Law reader:** the sidebar box becomes «انتقل إلى مادة» (navigation, not search) through `matchArticleJump`. `highlightQuery` = `arrivalQuery` only (line 182).
- **Book reader:** the TOC text filter (`searchQuery`, `filterToc`) is deleted. The page-number jump («انتقال للصفحة») stays. `highlightQuery` = `urlQuery`.
- **Precedents:** the filter box was deleted in Task 5.

**Tests:**
- [ ] Failing tests:
  - `matchArticleJump("١٢", arts)` returns the id whose `number` is 12.
  - `matchArticleJump("الثامنة", arts)` returns the id whose `numberText` is «الثامنة».
  - `matchArticleJump("غرامة", [{…, text:"غرامة"}])` returns `[]`. Text is never searched; `text` isn't even in the input type, so pass the object via a cast.
  - `catalogueMatches("الاثبات", ["نظام الإثبات"]) === true`.
  - `catalogueMatches("نظام -الإثبات", ["نظام الإثبات"]) === false`.
  - A source contract on the four files: no `.includes(nq)` and no `normalize(...).includes(` remain.
- [ ] Run `node --test "src/app/laws/[slug]/articleJump.test.ts" src/app/laws/catalogueMatch.test.ts` and see it fail.
- [ ] Code as decided. In `laws/page.tsx`, the `nq` branches run only while `isSearchActive` is false (`page.tsx:727`, 0–1 characters typed), so keep the change mechanical.
- [ ] Verify with `npm run test:unit`, `npx tsc --noEmit` and eslint on the six files. Then commit: `fix(library): one search bar per reader, jump boxes navigate only, no literal includes filters (BUG-LIB-03/04)`.

### Task 12: The ⓘ that explains the operators

**Files:**
- create `src/components/library/SearchSyntaxHelp.tsx`;
- create `src/components/library/searchSyntaxExamples.ts` and its test;
- modify `src/components/library/ScopedSearchPanel.tsx` (operators row, lines 260–274);
- modify `src/app/laws/page.tsx` (main bar, lines 1543–1560).

**Interfaces:**
- `SEARCH_SYNTAX_EXAMPLES: ReadonlyArray<{ query: string; explainAr: string }>` has exactly 7 rows:

| query | explainAr |
|---|---|
| `"غرامة تأخير"` | عبارة مطابقة بالترتيب نفسه |
| `عدم نفاذ + قرار` | يجب أن تجتمع الكلمات كلها |
| `فسخ / إنهاء` | إحداهما تكفي |
| `تحكيم -دولي` | استبعاد ما فيه «دولي» |
| `اختصاص*` | الكلمة وما يتفرع منها |
| `لايكون` | يجد «لا يكون» و«لايكون» معاً |
| `قرار` | يجد «القرار» و«بالقرار» و«للقرار» |

- `SearchSyntaxHelp({ onPick }: { onPick?: (query: string) => void })`:
  - a button with `aria-label="شرح معادلات البحث"` showing «ⓘ»;
  - a popover listing the examples, where clicking an example calls `onPick(query)`;
  - `Escape` closes it, and focus returns to the button.

**Steps:**
- [ ] Failing test: `SEARCH_SYNTAX_EXAMPLES.length === 7`. Every `query` must parse with `parseSearchQuery` without throwing, which keeps the help honest to the engine.
- [ ] Run `node --test src/components/library/searchSyntaxExamples.test.ts`. It fails, then it passes.
- [ ] Code:
  - mount the ⓘ in `ScopedSearchPanel` next to «المعاملات:» with `onPick={setQuery}`, and in the `/laws` main bar with `onPick={setSearch}`;
  - dark-mode text is zinc-300 or lighter; never `text-gray-100/200`.
- [ ] Verify with `npm run test:unit` and a manual keyboard check (Tab, Enter, Escape). Commit: `feat(library): ⓘ search operators help in every library search bar (BUG-LIB-04)`.

### Task 13: Fold tashkeel in the index (20261103_14, AFTER deploy) — STOP-POINT

**Files:**
- create `supabase/migrations/20261103_14_library_fts_tashkeel_fold.sql`;
- create `supabase/tests/rls/library_fts_tashkeel_fold.test.sql`;
- modify `supabase/migrations/_verify.sql`: new block `-- >>> verify:library_fts_tashkeel_fold`.

**Shared files:** `_verify.sql`.

**Scope:** only the three `fts` columns that are already server-only:
- `library.articles` (table server-only since 20260929_01);
- `library.principles.fts` (20261016_01);
- `library.feqh_blocks.fts` (20261018_02).

`library.laws.fts` and `library.decrees_circulars.fts` hold anon column grants and index titles, so they are **not touched**. No grant changes.

**Migration steps:**
- `begin; set local lock_timeout = '5s';`
- Create `library.fold_tashkeel(text) returns text language sql immutable parallel safe` as `select translate($1, E'\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0653\u0654\u0655\u0656\u0657\u0658\u0659\u065A\u065B\u065C\u065D\u065E\u065F\u0670\u0640', '')`. Then revoke execute from public, anon and authenticated, and **`grant execute on function library.fold_tashkeel(text) to service_role`**.
  - Postgres checks EXECUTE on a function inside a generated-column expression at INSERT/UPDATE time.
  - The owner's loader writes articles, principles and feqh_blocks as service_role. Without the grant, his next load fails with 42501.
- **Precondition.** Look in `pg_depend` for objects that depend on the three `fts` columns, apart from `library.cross_section_search`. If there are any, `raise exception '20261103_14: unexpected dependents …'`.
- Drop the matview `library.cross_section_search` (as `20260729_article_history_columns.sql:65` did).
- For each table:
  - `drop index`, `drop column fts`;
  - `add column fts tsvector generated always as (to_tsvector('library.arabic', library.fold_tashkeel(<same concatenation as today>))) stored`;
  - recreate the gin index.
  - Take the concatenations from `20260729_article_history_columns.sql:70–78` (articles), `20260823_fts_number_search.sql:88–99` (principles) and `20260626_legal_library_schema.sql:436–442` (feqh_blocks). Re-check each at HEAD for later redefinitions.
- Recreate `cross_section_search` with the definition at `20260729:87–138` (`with no data`) and its two indexes. Re-apply the revoke from anon and authenticated, as `20260922_04` / `20260929_01` do.
- `commit;` then the final SELECT. `ok` = all of:
  - three `fts` columns exist;
  - each one's `pg_get_expr` contains `fold_tashkeel`;
  - the matview exists;
  - `not has_table_privilege('anon','library.cross_section_search','SELECT')`.

**Tests:**
- [ ] Failing Docker test, using the chain from `library_search_scoped_page.test.sql`'s header plus `$M/20261103_14_library_fts_tashkeel_fold.sql` twice. It asserts:
  - a principle with text «القَرَارُ نافذ» matches `to_tsquery('library.arabic', '''القرار''')`;
  - `library.search_scoped_page` still returns that principle for the query `'القرار'`;
  - anon has no column privilege on `library.principles.fts`;
  - **the loader can still write.** After _14, run `set role service_role;` and insert one row each into `library.principles`, `library.feqh_blocks` and `library.articles` (with their parent rows), with tashkeel in the text. Each insert succeeds, and each row's `fts` contains the folded lexeme (`fts @@ to_tsquery('library.arabic','''القرار''')`).
    - Negative control: the same inserts with the service_role grant line removed fail with 42501.
  - `has_function_privilege('service_role','library.fold_tashkeel(text)','EXECUTE')` is true, and the same check for anon is false;
  - the matview is absent from the API roles;
  - running the file twice leaves one `fold_tashkeel(text)` function.
  - The negative control (the chain without _14) must fail on the first assertion.
- [ ] Run it, then re-run `library_search_scoped_page`, `library_search_relevance`, `library_search_principles_page`, `library_principles_text_lock`, `library_feqh_decree_text_lock` and `library_view_security_invoker` with _14 appended. All must pass.
- [ ] **STOP-POINT:** this rewrites three large tables under an ACCESS EXCLUSIVE lock, and it changes privileges on the matview. The user chooses the window.
  - Run notes: run it AFTER the deploy, at a quiet hour.
  - Before running, take the counts `select count(*) from library.articles` / `principles` / `feqh_blocks`, and keep them to compare after.
- [ ] Commit: `feat(library): tashkeel-folded FTS for articles, principles and fiqh blocks (BUG-LIB-03) — run after deploy`.

---

## Phase C — automatic locks end after `auto_lock_hours` (q362)

**What the code does today, at HEAD:**
- **Indefinite locks.** Both automatic lock inserts leave `locked_until` NULL, which means indefinite:
  - `library_read_quota_hit`, `supabase/migrations/20261031_10_library_activity_monitor.sql:369–374`, reason `quota_breach`;
  - `library_monitor_evaluate`, `:518–520`, reason `activity_flag`.
- **Expiry already works.** `:325–328` closes an expired lock (`lift_note 'expired'`).
- **The settings form** renders from `MONITOR_SETTINGS_FIELDS` (`src/lib/library/monitorSettings.ts:55–89`). `MONITOR_SETTINGS_SELECT` is built from it (`:105`).
- **Deploy-order cliff.** A 42703 is not in `isMigrationMissing` (`src/lib/library/securityLockAdmin.ts:134–136`).
- **The lock notice** already prints the end time on the client (`src/components/library/LibrarySecurityLockNotice.tsx:24,47`).

### Task 14: Migration 20261103_10, `auto_lock_hours`, BEFORE deploy

**Files:**
- create `supabase/migrations/20261103_10_library_auto_lock_hours.sql`;
- create `supabase/tests/rls/library_auto_lock_hours.test.sql`;
- add `-- >>> verify:library_auto_lock_hours` to `_verify.sql`.

**Shared files:** `_verify.sql`.

**Migration:**
- Precondition: `to_regprocedure('public.library_read_quota_hit(uuid,text,int,int,int,int)')` and `to_regprocedure('public.library_monitor_evaluate(uuid)')` are not null. Otherwise `raise exception 'run 20261031_10 first'`.
- `alter table public.library_monitor_settings add column if not exists auto_lock_hours int not null default 24 check (auto_lock_hours between 0 and 720);`
  - The check is named `library_monitor_settings_auto_lock_hours_check`. Drop it and re-add it, so a re-run works.
  - Comment: «0 = until an admin lifts it».
- `create or replace function public.library_read_quota_hit(uuid, text, int, int, int, int)`:
  - **copy the body verbatim from the last migration at HEAD that defines the function**, with the same arguments and return table.
    - Find it with `grep -ln "function public.library_read_quota_hit\|function public.library_monitor_evaluate" supabase/migrations/*.sql`.
    - At 1103812d only `20261030_80_library_read_quota.sql` and `20261031_10_library_activity_monitor.sql` define them, so the source is 20261031_10 §8 and §9.
    - If a later file appears before this task runs, copy from it instead and add it to the Docker chain before `_10`. Copying an older body would silently revert that file's change.
  - add `v_auto_hours int;` and `select coalesce((select ms.auto_lock_hours from public.library_monitor_settings ms where ms.id), 24) into v_auto_hours;` just before the lock insert;
  - the insert gains `locked_until = case when v_auto_hours > 0 then now() + make_interval(hours => v_auto_hours) end`.
  - Re-apply the revoke and grant lines (`:413–414`).
- `create or replace function public.library_monitor_evaluate(uuid)`:
  - copy §9 verbatim, from the same latest-at-HEAD source;
  - the `activity_flag` insert gains `locked_until` from `s.auto_lock_hours` (s is the settings row, so it has the new column), with the same `case`.
- Admin locks (`reason = 'admin'`) are not touched. No trigger.
- Existing open locks are **not** backfilled. That is a production data choice, so it goes in the run notes as an optional statement.
- Final SELECT `ok`:
  - the column exists with default 24;
  - a diff of `pg_get_functiondef` between before and after `_10` differs only in the `auto_lock_hours` lines. The task report pastes this diff;
  - one overload of each function (`select count(*) from pg_proc where proname = 'library_read_quota_hit'` = 1, and the same for `library_monitor_evaluate`);
  - `pg_get_functiondef` of each contains `auto_lock_hours`.

**Tests:**
- [ ] Failing Docker test. Chain: `$M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql $M/20261103_10_library_auto_lock_hours.sql $M/20261103_10_library_auto_lock_hours.sql $R/library_auto_lock_hours.test.sql`.
  - **Negative control:** without _10, it fails at T0, where the column is missing.
  - **Assertions:**
    - A1 the settings row has `auto_lock_hours = 24`.
    - A2 set `daily_docs=1`, `lock_after_refused=2`. Open documents d1 (ok), d2 (over_daily), d3 (locked). The lock row has `reason='quota_breach'` and `locked_until between now()+interval '23 hours 59 minutes' and now()+interval '24 hours 1 minute'`. The function's `locked_until` output equals the row's.
    - A3 lift it, set `auto_lock_hours=0` and repeat. The new lock has `locked_until is null`.
    - A4 set `flag_action='lock'` and push a rule over its threshold. The `activity_flag` lock has `locked_until ≈ now()+24h`.
    - A5 a row inserted directly with `reason='admin'` and a null end stays null after both functions run.
    - A6 an automatic lock with `locked_until = now() - interval '1 minute'`: the next hit returns `ok`, and the lock has `lifted_at is not null and lift_note = 'expired'`.
    - A7 with `prelude_library_monitor_no_settings.sql` before the test, an automatic lock gets about 24 h (the coalesce).
    - A8 `update … set auto_lock_hours = 721` raises `23514`.
    - A9 one overload of each function.
- [ ] Run it until it passes. Then re-run `library_activity_monitor.test.sql` and `library_read_quota.test.sql` with _10 appended; both must pass.
- [ ] Commit: `feat(library): automatic library locks end after auto_lock_hours (24h) — q362; run BEFORE deploy`.

### Task 15: Admin setting, a tolerant read, and the lock end in the refusal

**Files:**
- modify `src/lib/library/monitorSettings.ts` (fields lines 55–89, defaults 94–103) and `monitorSettings.test.ts`;
- modify `src/app/api/v1/admin/library-monitor/settings/route.ts` (GET 29–70, PUT 72–120);
- modify `src/lib/library/readQuota.ts` (`libraryLockMessageAr` 205–212, `quotaRefusal` 254–266) and `readQuota.test.ts`.

**Interfaces:**
- New field `int("autoLockHours", "auto_lock_hours", 0, 720, "مدة الإيقاف التلقائي بالساعات (٠ = حتى يرفعه المسؤول)", "caps")`. The default `autoLockHours: 24` goes in `MONITOR_SETTINGS_DEFAULTS`.
- `MONITOR_SETTINGS_SELECT_V1: string` is today's select, without `auto_lock_hours`.
- **GET:** on `isMissingColumnError(error, "auto_lock_hours")` (`src/lib/library/optionalColumn.ts:31`), retry with `_V1`. Return `settings` with `autoLockHours: 24` and `autoLockMigrationMissing: true`.
- **PUT:**
  - a patch that contains `autoLockHours` and gets that error answers 503, «شغّل ملف الترحيل 20261103_10_library_auto_lock_hours.sql أولاً»;
  - a patch without it, sent before the SQL, uses `_V1` for its select and returning.
- `libraryLockMessageAr(reference: string | null, lockedUntil: string | null = null): string`. With `lockedUntil`, it adds «ويُرفع الإيقاف تلقائياً عند انتهاء مدته.» and no date text (dates are formatted on the client).
- The 423 body of `quotaRefusal` gains `lockedUntil?: string` when it is set.
- **Blast radius:** grep `libraryLockMessageAr` (`readQuota.ts`, `src/app/api/v1/library/status/route.ts`, `src/lib/ai/libraryRunAccess*`). The second parameter is optional, so callers compile unchanged.

**Tests:**
- [ ] Failing tests:
  - `parseSettingsPatch({autoLockHours: 721})` is `ok:false`.
  - `parseSettingsPatch({autoLockHours: 0})` is `ok:true` with `columns.auto_lock_hours === 0`.
  - `settingsFromRow({})` gives `autoLockHours === 24`.
  - `MONITOR_SETTINGS_SELECT_V1` does not include `auto_lock_hours`.
  - `quotaRefusal(row({status:"locked", lock_reference:"SEC-1", locked_until:"2026-11-04T10:00:00Z"}), now).body.lockedUntil === "2026-11-04T10:00:00Z"`, and `.error` includes «يُرفع الإيقاف تلقائياً».
  - The same without `locked_until` has no `lockedUntil` key, and its error is byte-identical to today's.
  - A route source contract: GET references `isMissingColumnError` and `MONITOR_SETTINGS_SELECT_V1`.
- [ ] Run `node --test src/lib/library/monitorSettings.test.ts src/lib/library/readQuota.test.ts`. It fails, then it passes.
- [ ] Verify with `npm run test:unit` and `npx tsc --noEmit`. Manual check: the «نشاط المكتبة» settings show the new number under «الحدود».
- [ ] Commit: `feat(library): auto_lock_hours in the admin settings; lock refusal carries its end (q362)`.

---

## Phase D — invite codes (q378) and library eligibility (q375)

### Task 16: Migration 20261103_11, `library.invitations.grant_days`, BEFORE deploy

**Files:**
- create `supabase/migrations/20261103_11_library_invitation_grant_days.sql`;
- create `supabase/tests/rls/library_invitation_grant_days.test.sql`;
- add the verify block `library_invitation_grant_days` to `_verify.sql`.

**Shared files:** `_verify.sql`.

**Migration:**
- `alter table library.invitations add column if not exists grant_days int;`
- Drop and re-add the check `library_invitations_grant_days_check (grant_days is null or grant_days between 1 and 3660)`. The upper bound matches `grantLibraryAccess`, `src/lib/libraryAccessServer.ts:165`.
- Comment: «null = the default 30 days (owner ٢٠١–٢٠٣); a number = this code's own length (owner q378)».
- No grant changes: the table stays service-role only.
- Final SELECT `ok`:
  - the column exists;
  - the check exists;
  - `not has_column_privilege('anon','library.invitations','grant_days','SELECT')`, and the same for authenticated.

**Tests:**
- [ ] Failing Docker test. Chain: the library chain from `library_column_lock.test.sql`'s header plus _11 twice.
  - An insert with `grant_days 0` raises 23514. An insert with 3661 raises 23514. 90 is accepted, and null is accepted.
  - Anon and authenticated have no privilege on it.
- [ ] Run it until it passes. Commit: `feat(library): per-code grant_days on library invitations (q378) — run BEFORE deploy`.

### Task 17: Codes with their own days and seats

**Files:**
- modify `src/app/api/v1/library/invitations/_shared.ts` (select, row, DTO);
- modify `src/app/api/v1/library/invitations/redeem/route.ts` (lines 42, 81–86, 162–188);
- modify `src/app/api/v1/admin/library-invitations/route.ts` (GET 31–45, POST 63–140);
- modify `src/lib/services/libraryInvitationRules.ts` (add `validateGrantDays`);
- modify `src/app/dashboard/admin/library-invitations/page.tsx` (form and table);
- update the tests: `redeem/route.test.ts` and `libraryInvitationRules` tests.

**Interfaces:**
- `LIBRARY_INVITATION_SELECT_V2 = LIBRARY_INVITATION_SELECT + ", grant_days"`.
- `LibraryInvitationRow.grant_days?: number | null`.
- `LibraryInvitationDto.grantDays: number`, where null becomes 30.
- `DEFAULT_INVITE_GRANT_DAYS = 30`.
- `validateGrantDays(raw: unknown): FieldValidation<number | null>`. Undefined or null gives `{ok:true, value:null}`; otherwise it must be an integer from 1 to 3660, with the Arabic error «مدة المنحة يجب أن تكون عدداً صحيحاً بين ١ و٣٦٦٠ يوماً».
- **Redeem:**
  - select `V2`; on `isMissingColumnError(err, "grant_days")`, re-select without it;
  - `days = row.grant_days ?? 30` is passed to `grantLibraryAccess`;
  - the response `days` = that value.
- **Admin POST:**
  - body `{ code?, maxUses, expiresAt?, grantDays? }`;
  - `grant_days` goes into the insert **only when it is not null**, so a code made before the SQL still works;
  - a non-null value hitting 42703 answers 503 «شغّل ملف الترحيل 20261103_11 أولاً»;
  - the audit `after` includes `grant_days`.
- **Seats = `max_uses`.** The admin form labels it «عدد المقاعد (عدد الحسابات التي تستعمل الكود)». The range stays 1–1000 (`validateMaxUses`).

**Tests:**
- [ ] Failing tests:
  - `validateGrantDays(undefined)` deep-equals `{ok:true,value:null}`.
  - `validateGrantDays(90).value === 90`.
  - `validateGrantDays(0).ok === false`, `validateGrantDays(3661).ok === false`, `validateGrantDays(1.5).ok === false`.
  - A redeem contract: `grantLibraryAccess` receives `days: row.grant_days ?? DEFAULT_INVITE_GRANT_DAYS`. The route source contains `isMissingColumnError(` and `"grant_days"`.
  - `toLibraryInvitationDto({...row, grant_days: null}).grantDays === 30`.
- [ ] Run `node --test "src/app/api/v1/library/invitations/redeem/route.test.ts" src/lib/services/libraryInvitationRules.test.ts`. It fails, then it passes.
- [ ] Code as above. Delete the comment block at `redeem/route.ts:20–27` that says codes are fixed at 30 days, and cite q378 instead.
- [ ] Verify with `npm run test:unit` and `npx tsc --noEmit`. Manually create a code with 90 days and 5 seats, and check that the list shows «٩٠ يوماً · ٥ مقاعد».
- [ ] Commit: `feat(library): invite codes with their own days and seats (q378)`.

### Task 18: Migration 20261103_12, `library_eligibility_verifications`, BEFORE deploy

**Files:**
- create `supabase/migrations/20261103_12_library_eligibility_verifications.sql`;
- create `supabase/tests/rls/library_eligibility_verifications.test.sql`;
- add a verify block to `_verify.sql`.

**Shared files:** `_verify.sql`.

**Migration** (a new table, so no existing RLS changes):

```
public.library_eligibility_verifications (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  basis            text not null check (basis in ('legal_department', 'linked_lawyer')),
  linked_lawyer_id uuid references auth.users(id) on delete set null,
  evidence_note    text not null check (length(btrim(evidence_note)) between 5 and 1000),
  verified_by      uuid not null,
  verified_at      timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_by       uuid,
  revoke_note      text check (revoke_note is null or length(revoke_note) <= 1000),
  constraint library_eligibility_linked_lawyer check (basis <> 'linked_lawyer' or linked_lawyer_id is not null)
)
```

- Enable RLS. `revoke all … from public, anon, authenticated`, then `grant all … to service_role`. There are no policies (service role only).
- A table comment cites q375: staff-verified, so users cannot write it. Unlike `corporate_profiles.has_legal_dept`, which users can write (`20260922_03:326,366`).
- Final SELECT `ok`: the table exists, RLS is on, and `not has_table_privilege('authenticated', …, 'INSERT')`, and the same for SELECT.

**Tests:**
- [ ] Failing Docker test. Chain: stubs, then _12 twice.
  - `basis='linked_lawyer'` without `linked_lawyer_id` raises 23514.
  - An evidence note of 4 characters raises 23514.
  - As the `authenticated` test role, select, insert and update are each refused with 42501.
  - Deleting the `auth.users` row cascades.
- [ ] Run it until it passes. Commit: `feat(library): staff-verified library eligibility table (q375) — run BEFORE deploy`.

### Task 19: The eligibility rule at every library sale gate — HIGH risk (payments)

**Shared files:** `src/lib/payments/checkoutCore.ts`, `src/lib/payments/couponServer.ts`.

**Files:**
- modify `src/lib/library/libraryPurchaseEligibility.ts`;
- create `src/lib/library/libraryEligibilityServer.ts` and its test;
- modify `src/lib/payments/checkoutCore.ts` (step 2, lines 285–288);
- modify `src/lib/payments/couponServer.ts` (line 423);
- modify `src/app/api/v1/entitlement-requests/route.ts:58`;
- modify `src/app/api/v1/admin/entitlements/requests/[id]/route.ts:244`;
- modify `src/app/api/v1/library/my-grant/route.ts:86`;
- modify `src/lib/library/myLibraryGrant.ts` (the type);
- update the tests next to each file.

**Interfaces:**
- `LIBRARY_CONDITIONAL_USER_TYPES = ["micro", "ngo", "provider"] as const`.
- `isConditionalLibraryUserType(t: unknown): boolean`.
- `libraryPurchaseEligibility(userType: unknown, verifiedLegalCapacity = false): LibraryPurchaseEligibility`. A conditional type is eligible only when verified. Otherwise it is refused with the new reason `'needs_verification'` and `LIBRARY_NEEDS_VERIFICATION_MESSAGE_AR`:
  > «اشتراك المكتبة القانونية متاح للمنشآت الصغيرة والجمعيات ومقدمي الخدمات بعد التحقق من وجود إدارة قانونية موثقة أو محامٍ مرخّص مرتبط بالحساب. تواصل معنا لإتمام التحقق.»
- `LIBRARY_ELIGIBLE_USER_TYPES` **does not change**. The price book `buyers` stays professional-only (`src/lib/pricing/priceBook.ts:219`).
- In `libraryEligibilityServer.ts`:
  - `readLibraryEligibilityVerified(admin, userId: string): Promise<{ verified: boolean } | { error: "unavailable" }>`.
    - A row with `revoked_at is null` gives `{verified:true}`.
    - No row, or `42P01`/`PGRST205` (the table is missing), gives `{verified:false}`.
    - Any other error gives `{error:"unavailable"}`.
  - `libraryBuyerGate(admin, item: Pick<PayableItem, "buyers" | "kind">, userId: string, userType: string | null): Promise<"allowed" | "refused" | "unavailable">`.
    - `buyerAllowed` true gives `"allowed"`.
    - Otherwise, only when `item.kind === "library"` and the type is conditional, read the verification.
- **Call sites:**
  - checkout: `refused` → 403 `AUDIENCE_REFUSED_AR`, `unavailable` → 503 `CHECKOUT_FAILED_AR`;
  - coupon preview: `refused` → 400 `COUPON_INVALID_AR`, `unavailable` → 503 `PREVIEW_FAILED_AR`;
  - entitlement request, admin approval and my-grant: pass `verified` into `libraryPurchaseEligibility`. A read error there fails closed and treats the user as not verified.
- **Blast radius:**
  - `libraryPurchaseEligibility` has 3 route callers plus tests;
  - `LibraryPurchaseRefusal` is imported by `myLibraryGrant.ts`; grep the UI switches on `reason` and add the new case;
  - `buyerAllowed` is called by `checkoutCore.ts:288` and `couponServer.ts:423`.
  - Risk: **HIGH**, because the money path changes. The controller warns the user before starting.

**Tests:**
- [ ] Failing tests:
  - `libraryPurchaseEligibility("micro").reason === "needs_verification"`.
  - `libraryPurchaseEligibility("micro", true).eligible === true`.
  - `libraryPurchaseEligibility("individual", true).reason === "individual"`. The flag never opens it for individuals.
  - `libraryPurchaseEligibility("lawyer").eligible === true`.
  - **checkoutCore**, with fake service clients:
    - micro, no row → status 403;
    - micro, with a row → passes the audience gate and reaches the quote (the fake quote returns 200 or the next known step);
    - micro, row with `revoked_at` set → 403;
    - individual, with a row → 403;
    - micro, verification read error `{code:"XX000"}` → 503;
    - micro, `{code:"42P01"}` → 403;
    - lawyer → unchanged, and the verification table is never read (the fake client records no `from("library_eligibility_verifications")`).
  - **couponServer:** the same matrix, with 400 / 503.
- [ ] Run `node --test src/lib/library/libraryPurchaseEligibility.test.ts src/lib/library/libraryEligibilityServer.test.ts src/lib/payments/checkoutCore.test.ts src/lib/payments/couponServer.test.ts`. It fails, then it passes.
- [ ] Verify with `npm run test:unit` and `npx tsc --noEmit`. Re-run `src/app/api/v1/payments/*/route.test.ts` (checkout, status, webhook).
- [ ] Commit: `feat(library): micro/NGO/provider may buy the library once staff verify a legal department or linked lawyer (q375)`.

### Task 20: Staff verify and revoke, with an admin card

**Files:**
- create `src/app/api/v1/admin/library-eligibility/[userId]/route.ts` and its contract test;
- create `src/app/dashboard/admin/users/[id]/LibraryEligibilityCard.tsx`;
- modify `src/app/dashboard/admin/users/[id]/page.tsx`: mount it in the «الاشتراك» tab (tab list at line 895), only for micro, ngo and provider.

**Shared files:** `src/app/dashboard/admin/users/[id]/page.tsx`.

**Interfaces:**
- `GET` returns `{ verification: { basis, linkedLawyerId, evidenceNote, verifiedAt, verifiedBy, revokedAt } | null, migrationMissing: boolean }`.
- `PUT` takes `{ basis: "legal_department" | "linked_lawyer", linkedLawyerId?: string, evidenceNote: string }`. It upserts and sets `revoked_at` to null.
- `DELETE` takes `{ note: string }`. It sets `revoked_at`, `revoked_by` and `revoke_note`.
- Gate: `requireStaff("entitlements.grant")` (super_admin). This leaves the open ٤٢٧ question about operations alone.
- **Refusals (400):**
  - the target `user_type` is not conditional → «هذا التحقق لحسابات المنشآت الصغيرة والجمعيات ومقدمي الخدمات فقط»;
  - `linkedLawyerId` is not a `profiles.user_type = 'lawyer'` → «الحساب المرتبط ليس حساب محامٍ»;
  - a note shorter than 5 characters.
- Missing table (42P01/PGRST205) → 503 «شغّل ملف الترحيل 20261103_12 أولاً».
- Audit with `logAdminAction`, actions `library_eligibility_verified` and `library_eligibility_revoked`, with before and after.

**Steps:**
- [ ] Failing contract test:
  - the route source contains `requireStaff("entitlements.grant")`, `logAdminAction(` twice and `createServiceClient`;
  - it has no `createClient(` used for writes;
  - pure validators (`parseEligibilityBody`) cover the three 400 cases above with their exact Arabic text.
- [ ] Run the test. It fails, then it passes.
- [ ] Code as above. The UI says plainly what the flag does: «يسمح لهذا الحساب بشراء اشتراك المكتبة». There are no fake states.
- [ ] Verify with `npm run test:unit` and `npx tsc --noEmit`. Manually verify and revoke a micro test account, and check the audit log.
- [ ] Commit: `feat(admin): verify or revoke a micro/NGO/provider account's library eligibility (q375)`.

---

## Phase E — BUG-LIB-06 (code side only; the owner re-exports and loads)

**What the code does today, at HEAD:**
- **Columns.** `library.laws` has no `official_links` and no `merged_regulation_details` (no migration names them).
- **Parser.** `scripts/parsers/parse-laws.ts` (`ParsedLaw` around line 340–390) does not emit them.
- **Seeder.** `scripts/seed-library.ts` (`lawRows.push`, lines 699–759) does not write them.
- **Loader.** `OWNER_LOADER_TABLES` (`src/lib/library/ownerLoaderTables.ts:51–57`) passes rows as-is, so a key with no column would fail the batch.
- **Grants.** `library.laws` is column-locked: anon has an allow-list only (`20261004_01`). New columns therefore get no anon grant by default.

### Task 21: Migration 20261103_13, laws `official_links` and `merged_regulation_details`

Runs BEFORE the deploy and before the owner's next load.

**Files:**
- create `supabase/migrations/20261103_13_library_laws_official_links.sql`;
- create `supabase/tests/rls/library_laws_official_links.test.sql`;
- modify `_verify.sql`;
- modify `src/app/api/library/library-column-lock.test.ts`: add both names to `LIVE_COLUMNS.laws`, lines 56–73.

**Shared files:** `_verify.sql`, `library-column-lock.test.ts`.

**Migration:**
- `add column if not exists` for both, as `jsonb`.
- Checks, dropped and re-added: `jsonb_typeof(x) = 'array'` or null, and `pg_column_size(x) <= 65536`.
- **Precondition** (the same guard as `20261030_60_catalogue_repealed_last.sql:89`): if anon or authenticated still holds table-level SELECT on `library.laws`, raise `'20261103_13: … apply 20261004_01 (the column lock) first'`.
  - At HEAD, `20261004_01:218–225` revokes everything from both roles and grants an allow-list.
  - No later migration re-grants the table. So new columns are unreadable by both roles without any grant change on an existing table, and there is no STOP-POINT.
- **No grant to anon or authenticated.** The final SELECT asserts `not has_column_privilege('anon','library.laws','official_links','SELECT')` and the same for `merged_regulation_details`, for both roles. `service_role` has SELECT and UPDATE.
- Comment: «owner BUG-LIB-06; written only by the owner's loader; official_links is subscriber-only (٣١٨) and never read by libraryDocumentSeo».

**Tests:**
- [ ] Failing tests:
  - the Docker test (the column-lock chain from `library_column_lock.test.sql` plus _13 twice):
    - an `'{}'::jsonb` value raises 23514;
    - `'[]'` is accepted;
    - anon `select official_links from library.laws` raises 42501;
    - the existing allow-list select as anon still works;
  - `node --test src/app/api/library/library-column-lock.test.ts` with the two new live columns. It fails until the migration file exists, then it passes.
- [ ] Commit: `feat(library): laws.official_links / merged_regulation_details columns, server-only (BUG-LIB-06) — run BEFORE deploy and before the owner's next load`.

### Task 22: Parser, seeder and loader pass the two fields through

**Files:**
- modify `scripts/parsers/parse-laws.ts` (`ParsedLaw` and the meta read near line 900);
- modify `scripts/seed-library.ts` (`lawRows.push`, after `latest_update` at line 727);
- modify `src/lib/library/ownerLoaderTables.ts` (laws entry, line 51);
- update the tests: `src/lib/library/ownerLoaderTables.test.ts` and a new `scripts/parsers/parse-laws.official-links.test.ts`;
- add a source test that `src/lib/library/libraryDocumentSeo.ts` does not contain `official_links`.

**Interfaces:**
- `ParsedLaw.official_links: unknown[] | null` and `ParsedLaw.merged_regulation_details: unknown[] | null`.
  - Each comes from `meta.<key>` only when `Array.isArray`.
  - Each keeps at most 200 items, and only items that are plain objects or strings. Nothing is invented and no shape is assumed: there is no sample in the package.
- Seeder: `official_links: Array.isArray(law.official_links) ? law.official_links : null`, and the same for the other key, with the `latest_update` idiom.
- Loader: the laws entry gains `requiredColumns: ["official_links", "merged_regulation_details"]`. A load before _13 stops with exit 1 before any write (the existing preflight).

**Tests:**
- [ ] Failing tests:
  - parse a law fixture whose frontmatter has `official_links: [{label: "هيئة الخبراء", url: "https://laws.boe.gov.sa/x"}]` and `merged_regulation_details: [{title: "اللائحة التنفيذية"}]`. Both arrays come through deep-equal.
  - a fixture with `official_links: "x"` gives `null`.
  - `preflightRequiredColumns([lawsEntry], probe)`, with `probe` failing on `official_links`, returns one problem whose `table === "laws"` and `column === "official_links"`.
  - `libraryDocumentSeo.ts` does not contain `official_links`.
- [ ] Run `node --test src/lib/library/ownerLoaderTables.test.ts scripts/parsers/parse-laws.official-links.test.ts`. It fails, then it passes.
- [ ] Verify with `node scripts/verify-seeder-contract.mjs`. It reads repo files only (its header says so), and it must exit 0 with no CRITICAL. Then `npm run test:unit`.
- [ ] **Never run** `seed-library-from-owner.mjs`, `seed-library.ts` or any reseed. The owner re-exports and loads.
- [ ] Commit: `feat(library): parser, seeder and loader keep official_links and merged_regulation_details (BUG-LIB-06)`.

---

## Phase F — run notes

### Task 23: Run order and ops steps for S1

**Files:** create `SQL_batch_2026-11-03_owner_free/S1_RUN_NOTES.md`. The controller may merge it into the batch README. Give every path in full.

**Must say:**
- [ ] **Before the deploy:**
  - Task 1's precheck (read-only) and its three tables;
  - then `20261103_10`, `_11`, `_12` and `_13`;
  - then `_verify.sql` (run by hand through `docker exec … psql`, since `deploy.sh` does not run it). Expect the S1 blocks to pass.
- [ ] **Before the deploy (ops):** on the server, run `grep -rl "الإجارة عقد لازم لا تتغير بتغير الأجور" <app>/.next/static/chunks` and note the chunk URL `https://nezamy.sa/_next/static/chunks/<file>`.
- [ ] **After the deploy (ops):**
  - `curl -sI` that URL must give **404**, not 200;
  - if nginx still serves it from cache, purge the cache and curl again;
  - open `/precedents/tamyeez` and `/book/sources-of-right-1`. Each shows its legacy redirect or «قريباً»; neither is blank.
- [ ] **After the deploy, STOP-POINT:** `20261103_14` at a quiet hour, with the row counts before and after (Task 13).
- [ ] **Optional, the user's choice (not a migration):** existing open automatic locks have no end. To give them 24 h from when they were set:
  - `update public.library_security_locks set locked_until = locked_at + interval '24 hours' where lifted_at is null and locked_until is null and reason in ('quota_breach','activity_flag');`
  - The read-only check before it: `select count(*) from public.library_security_locks where lifted_at is null and locked_until is null and reason in ('quota_breach','activity_flag');`.
  - Locks older than 24 h close at the reader's next request.
- [ ] **Changed entry points:** list the inbound-link hits from Task 4. For each legacy slug whose `dbId` is null, say that its catalogue card now opens «قريباً» until the owner loads that collection.
- [ ] **Owner-facing facts** for the controller's owner report:
  - which collections Task 1 found missing (the owner loads them);
  - BUG-LIB-06 needs his re-export plus load **after** `_13`;
  - codes now carry their own days and seats;
  - micro, NGO and provider can buy after staff verification;
  - the library never ships text in public files.
- [ ] Commit: `docs(library): S1 run notes — SQL order, chunk check, optional lock backfill`.

---

## Estimate

| Phase | Tasks | Days (effort) |
|---|---|---|
| A — protected content (q390, BUG-LIB-01) | 1–8 | 4.0 |
| B — search (BUG-LIB-02/03/04 + tashkeel index) | 9–13 | 3.75 |
| C — auto lock 24 h | 14–15 | 1.0 |
| D — q378 codes, q375 eligibility | 16–20 | 2.5 |
| E — BUG-LIB-06 code side | 21–22 | 0.75 |
| F — run notes | 23 | 0.25 |
| **Total** | **23 tasks** | **≈ 12 days**, plus about 30% for review and testing |

**STOP-POINTs:**
- Task 1: the user runs the production precheck and returns its output.
- Task 13: `20261103_14` rewrites three large tables and re-revokes the matview, AFTER the deploy, at a time the user picks.

No n8n change and no new npm dependency. No migration changes RLS on an existing table: _12 is a new table, and _10, _11 and _13 add columns with no grant.

**Excluded, with the question that blocks each:**

| Item | Blocked by |
|---|---|
| Weekly 200 pool, the exact 300/600 search cap, the hourly number, the sustained rule, the firm 60% rule | ٤٢٥ (excluded by the dispatch) |
| Firm shared pool, and **seats on direct grants** to a firm (no seat source) | ٤٢٥ (4th bullet) |
| Device policy, 1 desktop + 1 mobile | ٤٢٧ (1st bullet; excluded by the dispatch) |
| Whether operations may still approve library requests; whether the free grant is admin-only | ٤٢٧ (2nd bullet) / q376. Task 20 uses `entitlements.grant` to stay neutral |
| The "five locks" | ٤٢٦ (excluded by the dispatch) |
| Visitor masking of decree/principle numbers, dates and links (q380); revoking anon `ref/date/official_url` | ٤٢٤ (excluded by the dispatch) |
| The lock also covering the lawyers' AI tools that quote library text | ٤٣٢ |

**Deferred, with no question blocking them:**
- BUG-LIB-07 subsidiary names on the card, and showing `official_links` in the reader sidebar. Both depend on the owner's re-export and load after `_13`; `mergedFileName` is ready (`src/app/laws/catalogueCardLabels.ts:41`).
- Laws in batches of 50 with virtualisation (§2.4-1). The law reader's TOC, jump box and regulation view need the whole law (B-library C10). Plan it separately.
