# Owner package 2026-10-30 — «المرشد القضائي» (`/ai/procedures`) ledger

- **Branch:** `fix/owner-30oct-procedures-guide` (from `main` 235e1bef). Not merged, pushed or deployed.
- **Source:** `Nezamy-Developer-Handoff-2026-10-30`, read only. Nothing in the package was run.
  - The backlog rows are LIVE-F12 and LIVE-F13.
  - The review rows are NOTE-15, NOTE-19 and NOTE-20.
  - The notes are `REF0015` (note ١٥), `REF0018` (note ١٩) and `REF0019` (note ٢٠).
  - The live-test evidence is files `22-*` to `25-*`.
- **Commits**, in order:

| # | Commit | What |
|---|---|---|
| 1 | `31834314` | Cherry-pick of `7639992a`: the shared search engine `multiColorSearch.ts`, `MultiColorHighlight.tsx` and their test. Not modified. |
| 2 | `16c1e2ea` | The `circuitFavorites` preference key (NOTE-15-C03). |
| 3 | `9278ebfb` | Circuits search with operators, «هل تقصد», the prosecution category, and favourites in the UI. |
| 4 | `91cb5c5b` | The «الجهات الحكومية» tab (361 agencies with sources), and the court cards saying «غير متاح» before the click. |
| 5 | (this file) | This ledger and the Arabic owner note. |

## Identifying the package's data files

The «large JSON» candidates were identified by content and by `05-traceability/source-inventory.csv`.

| REF | What it is | Use |
|---|---|---|
| `REF0038.md` | `دليل_الجهات_وبوصلة_التظلم_المنقح_2026-10-28.md` (state `current-reference`). It is item ٦ of note ٢٠. It has 5 parts: the 32-sector matrix, the 24 ministries, **363 agencies in 14 categories**, and a gap analysis. | Part 4 is imported (see NOTE-20-C02). |
| `REF0039.md` | `دليل_ناجز_المنقح_2026-10-28.md` (v2.1.0, 243 categories). | **Not imported** (see NOTE-15-C01 and C05). |
| `REF0299.json` | `emails_all_2192_verified.json` from the archived 06-Oct package (`historical`). | Already in the repo. All 2,192 `corrected` addresses equal `circuits-directory.json`'s addresses, row for row. |
| `REF0326.json` | `pixel_scan_all_digits_in_email_cells.json`: 1,796 digit-OCR checks (`historical`). | Evidence for the 52 corrections already applied. Nothing to import. |
| `REF0181`, `0585`, `0889`, `0896`, `0897`, `0043` | A route inventory, the library metadata contract, `package-lock`, two library DB catalogs, and a lawyer-audit inventory. | Not about this page. |

**Not in the package.** All 204 JSON files in `07-references` were searched by content and by the expected counts (424, 363, 361, 2,192, 32, 15, 243). These files are absent:
- `murshid_atomic_master_bundle_2026-10-28.json` / `.md`;
- `02_إجراءات_التظلم_الذرية/sector_01_*.json` to `sector_32_*.json`;
- `coverage_map.json`;
- `01_جهات_واتصالات/gov_contacts_consolidated.json` (the per-address MX check of 743 domains);
- `unified_channels.json` (15 national channels);
- `circuits_directory_cleaned.json` (the 862-row region fix and the 177 personal-status rows), and `circuits_fix_report.md`;
- `scratch/mygov_email_mx_check.csv` from note ١٩;
- `my_gov_sa_363.json` and `preview_judicial_guide_ux.html` from note ١٥.

The notes only refer to these files at `D:\Data\Data\نظامي\تغذية_المرشد_القضائي\…`.

## Data counts found

| Data | Notes say | Found | Verdict |
|---|---|---|---|
| Atomic cards | 424 (61 problem cards + 363 per-agency cards, 32 sectors) | **0** | Missing. Nothing imported. |
| Agency directory | 363, of which 361 are real | **363** rows in REF0038 Part 4, 363 unique ids. All 14 category counts equal the declared counts. The 2 test records (319731, 18143) are present and marked «سجل تجريبي». **361 kept.** Of those, 339 have an e-mail, 344 a phone, 316 a website and 329 a description. | Imported. |
| MX check per address | 743 domains, 446 live, 170 old | **0** | Missing, so every contact is shown «غير مُتحقَّق». |
| Corrected circuits | 2,192 (862 region fixes, 177 personal status) | 2,192 rows exist only as the 06-Oct e-mail file, which the repo already applies. **The region-corrected file is absent.** | Not applied. See NOTE-20-C01. |
| National channels | 15 | 0 as data. They exist only as prose in note ٢٠. | Only the prosecution's channels were built, from note ١٩ (see NOTE-19-C03). |
| Najiz guide | 243 | REF0039 is present. | Not imported (see NOTE-15-C01 and C05). |

**Discrepancies to send back to the owner:**
1. Misfiled circuits: note ١٥ says **551** circuits are under the wrong region; note ٢٠ says **862**.
2. ديوان المظالم's phone: note ٢٠ says **920000529**; REF0038's my.gov.sa row says **920000553**.
3. The prosecution's e-mail: note ٢٠ cites **`info@pp.gov.sa`**. Note ١٩ says the site shows no e-mail, and «لا يُفترض شكل العنوان». It is **not published**.
4. Two source anomalies:
   - one malformed address, `info@@pep.gov.sa`, is kept exactly as published;
   - one address had a trailing zero-width space, which was stripped.
   - Several phones look like placeholders (`9661111111111`). They are shown as published and marked unverified.

**The current circuits file:**
- 1,469 rows are in منطقة الرياض;
- 55 الدمام rows sit under الرياض;
- 553 rows have city = region;
- there are 8 categories, with no «أحوال شخصية» category (186 names contain احوال) and only 1 «محكمة تجارية».

## Per-id ledger

| Id | Verdict | Change | Files | Commit | Tests | Check live |
|---|---|---|---|---|---|---|
| **LIVE-F13** | **Fixed in code** | The search split on spaces, so `+` became a search word and every operator query returned 0 (confirmed: `_CircuitsDirectory.tsx`, old line 59). It now uses `matchesQuery` over name, category, city, region and e-mail, with `<Hl>` colours and a syntax line under the box. | `_circuitsSearch.ts`, `_CircuitsDirectory.tsx` | `9278ebfb` | `_circuitsSearch.test.ts` (8), run against the real 2,192 rows. «التجارية + الرياض», «الرياض + التجارية», `/`, `-`, a phrase, `*` and folding all pass. | Search «التجارية + الرياض»: المحكمة التجارية بالرياض appears, with both words coloured. Also try «التجارية / الاستئناف», «التجارية -الرياض», «"المحكمة التجارية"» and «تجار*». |
| **NOTE-19-C01** | **Fixed in code** | Same as LIVE-F13: the operators, the highlighting of positive words only, and the guidance line. | as above | `9278ebfb` | as above | The guidance line appears under both search boxes. |
| **NOTE-19-C02** | **Partly fixed** | Done:<br>• «لم نجد أي جهة تحوي: «…»» lists the words no row holds;<br>• «هل تقصد؟» shows the 10 closest rows, ranked by words matched, with exclusions honoured;<br>• when words exist but not together, «لا توجد جهة واحدة تجمع…» appears;<br>• prosecution keywords bring up the prosecution card.<br>**Not done:** «اقترح إضافة هذه الجهة». It has no storage for suggestions and no review queue, and a button that saves nothing is not acceptable. | `_circuitsSearch.ts`, `_CircuitsDirectory.tsx`, `_GovAgenciesDirectory.tsx` | `9278ebfb`, `91cb5c5b` | 3 tests (unmatched words, ranking, exclusions) | Search «الشرقية + اموال»:<br>• 0 results;<br>• «لم نجد أي جهة تحوي: «اموال»»;<br>• up to 10 Eastern-Province rows under «هل تقصد؟»;<br>• the prosecution card. |
| **NOTE-19-C03** | **Fixed in code** | «النيابة العامة (جهة مستقلة)» is a category of its own in the filter, and the card also opens when the query contains نيابة, تحقيق, ادعاء or أموال. It has its own data file and is not mixed into the MoJ list. Every channel carries a source, a source URL and a check date (2026-10-28), plus the owner's text verbatim in `ownerText`. The channels are:<br>• the esportal «التواصل مع القطاعات النيابية» form;<br>• pp.gov.sa;<br>• «منصة المحامين», marked unverified;<br>• the my.gov.sa phone, marked unverified;<br>• the my.gov.sa e-mail `info@bip.gov.sa`, as text only with no copy or mailto, and the owner's no-MX warning.<br>No address is guessed, and the card says no investigation-circuit e-mail is published. | `src/data/public-prosecution-channels.json`, `_ProsecutionChannels.tsx` | `9278ebfb` | Covered by the prosecution-keyword test | Choose «النيابة العامة» in the category filter, then search «النيابة العامة». Check the links open and that `info@bip.gov.sa` has no mail button. |
| **NOTE-19-C04** | **Verified clean in scope; the rest is out of scope** | `grep` over `src/app/ai/procedures/**` finds no prompt name, R1…R7, «ضابط», version or constant name in the UI. `BetaReviewGate` renders `toolName` and a reason sentence, never `toolId`. The CSV's finding («واجهة ناجز ما زالت تعرض R1…R5») is in `/ai/najiz-optimizer`, which is off limits for this branch. **Not done there.** | — | — | — | In /ai/procedures, no internal names. Najiz optimizer: separate task. |
| **NOTE-19-C05** | **Not done (operational)** | The MX and mail check of addresses needs real mail or DNS work outside code. All contacts are therefore shown «غير مُتحقَّق». | — | — | — | — |
| **LIVE-F12** | **Fixed in code: the card says it is unavailable** | No approved procedural content is in the package. The 424 cards are missing, and REF0038's 32-sector matrix is about appeals against agencies, not the five courts' steps; note ١٥ also says the approval is still «بانتظار قرار المالك». So the cards now use the gate's own condition (`BETA_REVIEW_MODE && !isDemoBypass`):<br>• they show «غير متاح خلال البيتا»;<br>• no step count and no «عرض الخطوات»;<br>• they do not open;<br>• a notice above them links to the drafter.<br>Demo-bypass reviewers still see the steps, unchanged. | `page.tsx` | `91cb5c5b` | tsc + lint (a UI condition, no pure logic) | Normal account → الإجراءات: the cards read «غير متاح خلال البيتا» and the «(9 خطوات)» badge is gone. |
| **NOTE-20-C01** | **Not done: data missing** | `circuits_directory_cleaned.json` is not in the package. Regions were **not** inferred from court names, because that would be our correction, not the owner's 862-row file. `circuits-directory.json` is untouched; it is also shared with the firm and business `circuits-emails` pages. | — | — | — | — |
| **NOTE-20-C02** | **Partly fixed: 363 done, 424 missing** | The agency directory is imported:<br>• REF0038 Part 4 → `scripts/parsers/parse-gov-agencies-directory.mjs` → `src/data/gov-agencies-directory.json`;<br>• 361 rows, with the text as published;<br>• «المسؤول الأول» (a person's name) is left out;<br>• it is a new tab, «الجهات الحكومية», with the same operator search and «هل تقصد».<br>**The 424 cards are not in the package.** Nothing was made up for them. | parser, JSON, `_GovAgenciesDirectory.tsx`, `page.tsx` | `91cb5c5b` | `gov-agencies-directory.test.ts` (6): counts per category, required fields, a source on every row, no test record, nothing marked verified, contact formats | Tab «الجهات الحكومية»: «361 جهة في 14 فئة», each row has «المصدر: my.gov.sa · سُحب في ٢٨ أكتوبر ٢٠٢٦». Search «ديوان المظالم» and «BOG». |
| **NOTE-20-C03** | **Partly fixed** | Every agency row links to its my.gov.sa page with the pull date. The prosecution channels carry a source and a check date. The 15 national channels in `unified_channels.json` are **missing** and were not rebuilt from note ٢٠'s prose (see the BOG phone discrepancy). | as above | `9278ebfb`, `91cb5c5b` | as above | — |
| **NOTE-20-C04** | **Fixed in code** | The operator search runs on both tabs. Searching النيابة, تحقيق, ادعاء or أموال brings up the prosecution card. **Not done:** the committees GSTC/BFC/IDC/CRSD have no data file, so there is no committee card. The card ids (`S23-PP-001`) are never shown. | as LIVE-F13 | `9278ebfb` | as LIVE-F13 | «دائرة الأموال» shows the prosecution card. |
| **NOTE-15-C01** | **Partly fixed** | The agency directory now has sources and dates. The Najiz guide (REF0039, 243 categories) is in the package but **not imported**. It is a legal tree whose approval note ١٥ leaves «بانتظار قرار المالك», and it was not in this batch's list. | as NOTE-20-C02 | `91cb5c5b` | as NOTE-20-C02 | — |
| **NOTE-15-C03** | **Fixed in code** | «المفضلة» is private per user:<br>• a star on each circuit;<br>• a favourites filter;<br>• a private note per favourite (≤300 chars).<br>It is stored in `user_settings.preferences.circuitFavorites` through the existing PATCH route. A new validated key was added in `preferencesMerge.ts` and mirrored in `preferencesService.ts`. **No SQL or migration is needed.** The feature is hidden where preferences can't be read. | `preferencesMerge.ts`, `preferencesService.ts`, `_CircuitsDirectory.tsx` | `16c1e2ea`, `9278ebfb` | `preferencesMerge.test.ts` +3: accepted shape; bad ids, duplicates, long notes and over-cap lists rejected; PUT cannot overwrite it | Signed in:<br>• star a circuit;<br>• open «المفضلة»;<br>• type a note and click away;<br>• reload: the star and the note persist;<br>• with another account they are not visible. |
| **NOTE-15-C04** | **Not done: data missing** | Same as NOTE-20-C01. | — | — | — | — |
| **NOTE-15-C05** | **Not done** | The corrections ١–١٠ and the execution-tree warning belong to the Najiz guide, which was not imported (see C01). | — | — | — | — |
| **NOTE-15-C06** | **Fixed in code for what was imported** | Every imported contact is marked «غير مُتحقَّق», and unverified addresses are text only. No deadline was added or changed. The existing five courts' steps stay behind the gate and are unchanged. No address is guessed. | all of the above | — | the agencies test asserts nothing is verified | — |

## Project rules and checks

- **GitNexus.** The index for `latest-nzamy-full` is **675 commits behind**:
  - `impact` did not find `CircuitsDirectory` or `CircuitEmail`;
  - for `validatePreferencesPatch` it returned no callers, risk UNKNOWN.
  - Callers were checked by `grep` instead:
    - `CircuitsDirectory` and `CircuitEmail` are used only in `src/app/ai/procedures/`;
    - `validatePreferencesPatch` and `PREFERENCE_KEYS` are used in the preferences route, the settings PUT merge and their test.
  - `detect_changes` before each commit reported risk **low** and no affected processes.
  - **Re-index before trusting it:** `node .gitnexus/run.cjs analyze`.
- **Unit tests** (`npm run test:unit`):

| Run | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| Before (after the cherry-pick) | 4,180 | 4,173 | 7 | Pre-existing: `aiFiles` needs `pdf-lib`, plus 6 others in unrelated areas. |
| After | 4,197 | 4,189 | 8 | The 7 above, plus a timing flake in `src/lib/ai/runCore.test.ts` (`49999 !== 50000`). Re-run alone it passes 20/20. |

  The 17 new tests are all green: 8 search, 3 preferences, 6 agencies.
- **`npx tsc --noEmit`:** clean apart from the pre-existing `pdf-lib` module errors in `src/lib/ai/aiFiles*`, which are off limits.
- **ESLint:** 0 errors. One pre-existing warning (`courtInfo` unused in `page.tsx`).
- **Line endings:** working-tree files are CRLF (`core.autocrlf=true`).
- **Not done:**
  - No visual browser check of this branch. The preview server ran from the main checkout, not this worktree.
  - The engine's `SearchLegendBar` is not used: its chips set `dark:text-slate-800` on a dark background, and it is a library-branch file this branch may not change.

## For the owner and the next batch

1. Send the missing files:
   - the master bundle;
   - `sector_01..32`;
   - `coverage_map.json`;
   - `gov_contacts_consolidated.json`;
   - `unified_channels.json`;
   - `circuits_directory_cleaned.json`.
2. Settle the discrepancies: 551 vs 862 misfiled circuits, and the BOG phone, 920000529 vs 920000553.
3. Decide on the Najiz guide (REF0039): approve it for import, with the corrections ١–١٠.
4. «اقترح إضافة جهة» needs a review queue (a table plus an admin page) before it can be built.
