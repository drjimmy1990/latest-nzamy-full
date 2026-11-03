# Slice F: firms, cases, letterhead, firm invoices and the murshid bundle (guide §7, lines 258–273)

- **What was checked:** `D:\nzwt\founder` (main 80ea10ad) and the package `حزمة_المبرمج_٢٠٢٦-١١-٠١`. Everything was read only.
- **owner-edits branch:** it is behind main for every path in this slice (`git diff --stat main owner-edits -- src/app/ai/procedures src/data supabase/migrations` shows deletions only). It adds nothing here.
- **The owner's wording:** the question text for q338–q360 and q384–q389 comes from our own report, which the owner returned with his answers: `04_تقارير_المبرمج_المردود_عليها_للمرجعية/تقرير_للمالك_ودليل_الاختبار_٢٠٢٦-١٠-٣١_حزمة_٣٠_أكتوبر.md` lines 697–847.
- **How the code paths are written:** all code paths are relative to `D:\nzwt\founder`. A migration is cited by its filename prefix, for example `20261030_12:36` means `supabase/migrations/20261030_12_accounts_firms_owner_answers.sql` line 36.

## 1. Item table

| id | What the owner wants | Status | Evidence | Effort | Needs |
|---|---|---|---|---|---|
| **q338** | After login, a firm member lands on the firm dashboard, showing his firm and the cases assigned to him. | MISSING | **Where users land:** chosen by `user_type` only.<br>• `src/app/login/page.tsx:194-198` (already logged in);<br>• `src/app/login/page.tsx:308-310` (after sign-in);<br>• the type map is `src/lib/auth/userTypes.ts:200-210`.<br>**Why a member misses it:** a firm member is a `lawyer` account, so he lands on `/dashboard/lawyer`. His membership only *allows* him into `/dashboard/firm` (`src/lib/auth/entityMembership.ts:35-40`).<br>**Dependency:** "his assigned cases" needs q350 first. | M | none (after q350) |
| **q339** | An explicit entity type «مكتب استشارات قانونية مرخص (م١٨)», set when the office is founded or taken from the owner's licence type. | PARTIAL | **Done:** the licence-type route exists. An office counts as consulting when the owner's `lawyer_profiles.practice_kind = 'consultant'` (`20261030_12:36-39`), and a consultant can sign up (`src/app/register/provider/data.ts:15`, `signupMetadata.ts:38`).<br>**Missing:** an office created through the «شركة محاماة» card (`data.ts:8`) is owned by a `firm` account, which has no `lawyer_profiles` row, so it can never be consulting. The migration itself says "No signup path creates such a firm today" (`20261030_12:38`).<br>**To build:** an explicit `firm_profiles` field, plus the signup choice and an admin edit. | S–M | SQL migration |
| **q340** | Store the note author's name as text when he leaves or is deleted, so the screen can show «كتبها: فلان». | PARTIAL | **Done:** the author's account id is kept for ever (`original_author_id`, NOT NULL, set by a trigger, `20261030_12:13-23`).<br>**Missing:** the name. It is looked up live from `profiles` each time (`src/app/api/v1/cases/[id]/notes/_shared.ts:77-84`, `timeline/route.ts:80`, `consultations/[id]/notes/route.ts:32-57`). Once the account is purged, the screen falls back to «محامٍ» or «زميل».<br>**To build:** an `original_author_name` text snapshot, written by the same trigger on the four note tables. | S | SQL migration |
| **q341** | Block deletion of inherited hearings (the consulting-office "view and keep" rows), as editing them is already blocked. | MISSING | The migration states "DELETE is not guarded: a consultant may still delete his own old court rows" (`20261019_21:83-88`). | S | SQL migration |
| **q342** | Never take an automatic renewal charge from a frozen account. | DONE (nothing to build yet) | **Today:** no automatic renewal exists. A grant writes `auto_renew = false` (`src/lib/payments/refundPolicy.test.ts:162`), and the policy text says nothing renews (`refundPolicy.ts:148`).<br>**Already recorded for B2:** "B2 (renewals) must … skip a frozen account" (`20261026_70:83-85`). Keep it on the B2 checklist. | — | none |
| **q343** | The letterhead barcode of a verified but unpublished lawyer opens a short professional verification card. A privacy setting lets him send it to the home page instead. | MISSING | **Today:** a verified but unpublished lawyer's QR goes to the platform home page (`src/lib/branding/letterheadIdentity.ts:9-13`, `116-118`, reason `"unpublished"`).<br>**Missing:** there is no verification-card route and no privacy toggle. `20261025_50:111-113` has a `show_*` column pattern the toggle can follow. | M | SQL migration |
| **q344** | Printing is allowed by default for the three leadership roles, and can be granted to or withdrawn from a single member. | PARTIAL | **Done:** the three roles: owner, `managing_partner` and `office_admin` (`src/lib/branding/firmLetterheadPermissions.ts:38-41`). The database gate `can_manage_branding_vault` (20261026_63) names the same roles.<br>**Missing:** per-member grants. They need a stored permission, a check in the TS gate and in the SQL function, and a toggle on the team page. | M | SQL migration |
| **q345** | Legal Drafter, Contract Pro and «الرأي الفصل» export Word (.docx) and PDF on the office's official letterhead. | MISSING | **Legal Drafter:** its "Word" file is HTML saved as `.doc`, and the code says "No letterhead … (not built here)" (`src/components/draft/legalDraft.ts:148-151`).<br>**The other two tools:** they have plain «Word» buttons with no letterhead (`src/app/ai/legal-opinion/_components/LetterWorkflow.tsx:951`, `ResultView.tsx:235`, `src/components/contracts/steps/draft/StepApproval.tsx:107`).<br>**Libraries:** no docx library is installed (`package.json` has jspdf, pdf-lib and qrcode only).<br>**To build:** a new dependency and a template merge into the uploaded `letterhead-docx`. PDF goes through the print pipeline, because jsPDF cannot shape Arabic (`src/lib/services/letterExport.ts:24-31`). | L | none (new npm dependency) |
| **q346** | Accept an SVG logo as well as PNG, JPEG and WebP. | MISSING | **Types allowed today:** png, jpg and webp in three places:<br>• `src/lib/branding/brandingVault.ts:108-152`;<br>• the SQL path check, `20261026_63:99`;<br>• the bucket's `allowed_mime_types`, `20261026_63:244-249`. | M | SQL migration |
| **q347** | Default the deadline start event to «تسلّم صورة الحكم / التبليغ», with one click to switch to «النطق بالحكم». | MISSING | The start event begins empty, with no default: `useState(stage.triggerEvent ?? "")` (`src/app/dashboard/lawyer/_components/RecordStageOutcomeModal.tsx:69`). | S | none |
| **q348** | A cassation appeal has 30 days for normal judgments and 10 for urgent ones (Art. 194 of نظام المرافعات الشرعية), and the wrong 60 goes. | CONFLICT (30 done, 10 unverified) | **Done:** cassation is already 30 days and verified (`20261016_04:71-76`). No 60 exists in the rules.<br>**Missing:** an urgent-cassation rule.<br>**Why we hold it:** see Conflict C5; the 10-day figure needs the article text first.<br>**Extra work:** the stage-close hook picks the rule by degree only (`20261016_04:21-23`, DEGREE_TO_AUTO_RULE_CODE). An urgent rule also needs an urgency flag on the stage. | S (once cited) | owner decision (citation) + SQL migration |
| **q349** | Four client types (individual, commercial establishment, government body, non-profit/waqf), with fields for the legal representative and his authority. | MISSING | **Database:** it accepts two types, `check (client_type in ('individual','company'))` (`20260903_phase2:140`). The invoice function checks the same two (`20261030_20:123`).<br>**To build:** widen the CHECK, add the representative columns, and update the client modal and the invoice RPC. | M | SQL migration |
| **q350** | Assign a case to a team member. | MISSING | **What exists:** `cases.assigned_user_id` (`20260518:70`), but it only names the case's own lawyer.<br>**What is missing:** a route or screen to reassign. `src/app/api/v1/firm/` holds only `activity`, `members` and `reviews-visibility`. Firm-wide permissions are explicitly absent (`20261030_20:47-48`).<br>**To build:** an RPC that checks both people are members of the same firm, records the reassignment in history, and has RLS plus a UI. | M | SQL migration |
| **q351** | Instant search over the full court tree, plus «أخرى» with free text. | PARTIAL | **Done:** «أخرى» with a typed name, and 14 fixed choices (`src/app/dashboard/lawyer/_components/courtTypes.ts:16-50`).<br>**Missing:** search over the whole court tree. `src/data/circuits-directory.json` (2,192 rows) could feed a searchable list. | S–M | none |
| **q352** | Fix the time zone to `Asia/Riyadh` in the Google Calendar and `.ics` exports. | MISSING | **Today:** both exports carry a time with no zone ("floating"):<br>• `.ics`: "DTSTART/DTEND carry no `Z` and no TZID" (`src/lib/calendar/hearingIcs.ts:10-15`);<br>• Google link: `src/app/dashboard/lawyer/hearings/page.tsx:443` has no `ctz`.<br>**To build:** `TZID=Asia/Riyadh` with a VTIMEZONE block, and `ctz=Asia/Riyadh` on the Google link. | S | none |
| **q353** | The «تنتهي خلال ٣٠ يوماً» indicator keeps excluding cancelled and terminated contracts. | DONE | `src/lib/services/contractDates.ts:38`, used at `src/app/dashboard/lawyer/contracts/page.tsx:94`. | — | none |
| **q354** | The office invoice to its client gets an optional 15% VAT and an optional VAT number. | MISSING | **Today:** an invoice is one amount with no VAT field (`20261030_20`, signature lines 16-19).<br>**Past promise:** our 10-31 report deferred it (`…حزمة_30_أكتوبر.md:364`, CODE-F27). | M | SQL migration |
| **q355** | A wrong payment is corrected by a reversal entry with a stated reason. The record is never deleted. | MISSING | **Today:** collections are recorded atomically (`20261030_10`), with no reversal function. Our 10-31 report says a payment can be neither edited nor deleted (q355 text). | M | SQL migration |
| **q356** | The managing partner or finance role can invoice at firm level. | MISSING | **Today:** cards shared by other members are refused, because there is "no firm-wide finance permission model yet" (`20261030_20:47-48`). The request and case must belong to the caller himself (CODE-F01, same file lines 31-36). | M–L | SQL migration |
| **q357** | The schedule-conflict check covers hearings and consultations together. Saving is still allowed after an explicit confirmation. | PARTIAL | **Done:** the consultations side, with 409 and `confirmOverlap` (`src/app/api/v1/lawyer/consultations/_scheduleGuard.ts:6-14`, `43-50`).<br>**Missing:** hearings are neither read by this guard nor checked when a hearing is saved. `src/app/api/v1/lawyer/hearings` has no overlap code.<br>**Catch:** a hearing stores a wall-clock date and time with no zone (`hearingIcs.ts:11`), so comparing it with consultations needs an Asia/Riyadh conversion. | S–M | none |
| **q358** | One booking button on the client home, named «اطلب استشارة». | MISSING | There are three «احجز استشارة» buttons with two different targets:<br>• `src/app/dashboard/client/page.tsx:507-508` goes to `/consultation/new`;<br>• lines 664-673 go to `/services`;<br>• lines 815-822 go to `/services`. | S | none |
| **q360** | Finish the dashboards in this order: lawyers and law firms, then individuals, then companies, then associations and government. | NOT-CODE | A sequencing decision, which shapes the batch order (§4). | — | none |
| **§7.4 cards** | Import the «424 atomic procedure cards in 32 sectors». | MISSING (61 of 424 present) | **What the JSON holds:** `stats`, `files_manifest`, `unified_channels` (15), `sectors_summary` (32) and `specialized_problem_cards` (61). The 363 per-agency cards exist only as a count (`stats.agency_specific_cards`).<br>**Where the rest is:** `files_manifest` points to `D:\Data\Data\نظامي\تغذية_المرشد_القضائي\…` on the owner's own machine.<br>**What the live page shows instead:** the court-step guides behind `BetaReviewGate` (`src/app/ai/procedures/page.tsx:12,30-37`). | M (the 61) | owner file (the 363 cards) |
| **q384** | 862 circuits corrected by region, and personal-status circuits as their own category. | MISSING (data absent again) | **The file:** `circuits_directory_cleaned.json` is not in this package either. The bundle MD only names it (`murshid_atomic_master_bundle_2026-10-28.md:780`).<br>**The live file:** `src/data/circuits-directory.json` still puts 1,469 of 2,192 circuits in منطقة الرياض and has 8 categories, none of them «أحوال شخصية».<br>**Rule kept:** we did not infer regions ourselves (`docs/audits/2026-10-30-owner-package-procedures-guide.md`, NOTE-20-C01). | S once received | owner file |
| **q385** | Use 920000553 for the ديوان المظالم call centre. | DONE (live) / CONFLICT with the bundle | **Live:** `src/data/gov-agencies-directory.json`, agency 17486 «ديوان المظالم», shows phone `920000553`.<br>**Bundle:** UC-04 publishes `920000529` (C1). | — | none (override on import) |
| **q386** | Publish no unverified e-mail for النيابة العامة. | PARTIAL | **Done:** `info@pp.gov.sa` appears nowhere (`public-prosecution-channels.json` and `_ProsecutionChannels.tsx`: 0 hits).<br>**Still shown:** the my.gov.sa address `info@bip.gov.sa` (its domain has no mail record), with a warning (`src/app/ai/procedures/_ProsecutionChannels.tsx:91-93`). It is also in `gov-agencies-directory.json` (1 hit).<br>**Fix:** under q386 read plainly, drop it from both. The bundle also re-adds `info@pp.gov.sa` (C2). | S | none |
| **q387** | Import the corrected Najiz guide, 243 classifications with corrections 1–10. | MISSING | **Not imported:** there is no najiz tab; `page.tsx:22` has Mode = circuits, agencies and procedures.<br>**The guide itself** (`…/01_دليل_ناجز_الشامل…md`):<br>• 243 numbered rows;<br>• a data contract (`NajizClaimType`, lines 706-747);<br>• a corrections table with **6** rows, not 10 (lines 86-94);<br>• `version: "2.0.0"` (line 11), while our 10-30 ledger recorded REF0039 as v2.1.0 (C4). | M | owner decision (clarify 1–10 and the version) |
| **q388 agencies** | 363 government agencies. | DONE | `src/data/gov-agencies-directory.json` holds 361 agencies: 363 from the source minus the 2 test records (`metadata.excludedTestRecords`). The tab is `_GovAgenciesDirectory.tsx:55`. | — | none |
| **q388 channels** | The 15 national channels. | MISSING (data arrived, not imported) | **Arrived:** `unified_channels[15]` is in the bundle.<br>**Imported:** nothing on the live side. Only the prosecution channels exist (`src/data/public-prosecution-channels.json`, 5 rows).<br>**Before import:** 3 of the 15 carry wrong my.gov.sa ids (C3), and UC-04 and UC-05 conflict with q385 and q386. | S–M | none |
| **q389** | The owner reviews the prosecution card's wording on screen after the deploy. | NOT-CODE | The card exists: `src/app/ai/procedures/_ProsecutionChannels.tsx`. The owner's exact text is kept in `ownerText` in the JSON. | — | owner review |

**Counts:** 4 DONE, 6 PARTIAL, 17 MISSING, 1 CONFLICT, 2 NOT-CODE. That is 30 rows. q385 is also listed as a conflict.

### How the murshid data is stored today, and what an import takes
- **Storage:** there are no database tables. The murshid data is static JSON in `src/data/`, loaded lazily per tab:
  - `circuits-directory.json`, 2,192 rows, about 1 MB, loaded at `_CircuitsDirectory.tsx:65`;
  - `gov-agencies-directory.json`, 361 rows, loaded at `_GovAgenciesDirectory.tsx:55`;
  - `public-prosecution-channels.json`, imported statically;
  - the court steps in `_data.tsx`.
- **How it was built:** offline parsers (`scripts/parsers/parse-gov-agencies-directory.mjs` and `parse-circuits-directory.mjs`), with tests in `src/data/*.test.ts`. The only data in the database is the private favourites in `user_settings.preferences.circuitFavorites`.
- **What an import takes:** the same pattern. No SQL is needed unless the owner wants to edit the data from the admin panel.
  1. **Parsers:**
     - `parse-murshid-bundle.mjs`, which writes `src/data/murshid-problem-cards.json` (61) and `murshid-unified-channels.json` (15). It must re-key agencies by name rather than by the bundle's `my_gov_id`, and apply the q385 and q386 overrides;
     - `parse-najiz-guide.mjs`, which turns the MD into `najiz-classifications.json` (243) following the guide's own `NajizClaimType` contract.
  2. **Tabs:** two new tabs, «بطاقات التظلم» and «تصنيفات ناجز». They reuse `_circuitsSearch.ts` and `<Hl>`. The cards carry deadlines and statute quotes, so they sit behind the same `BetaReviewGate reviewScope="legal-data"` as the court steps.
  3. **Effort and gaps:** about 2–3 days for both tabs with tests. The 363 agency cards and the 862-row circuits fix cannot be built, because their files are still absent.

## 2. Conflicts

**C1. Board of Grievances phone (q385).**
- **Guide:** «اعتماد الرقم الرسمي الموحد لمركز اتصال ديوان المظالم `920000553`» (guide line 273).
- **Live code:** 920000553 (`gov-agencies-directory.json`, agency 17486).
- **The bundle the same line orders imported:** `unified_channels[3]` (UC-04) has `"value": "920000529"`, with source `bog.gov.sa/ContactUs`. The bundle MD §3 table shows the same number.
- **Result:** a blind import overwrites the owner's decision.

**C2. Prosecution e-mail (q386).**
- **Guide:** «الإبقاء على عدم نشر بريد غير موثق للنيابة العامة» (line 273).
- **Bundle:** UC-05 `emails: [{"value":"info@pp.gov.sa","mx_ok":true}]`. The bundle MD §3 lists the prosecution under «قنوات… موثقة».
- **Earlier owner note:** note ١٩ said «لا يُفترض شكل العنوان» (quoted in our q386).
- **Why MX is not enough:** a mail record on the domain does not prove the mailbox exists.

**C3. Wrong agency ids in the bundle (it contradicts the live data from the same my.gov.sa source).**

| Bundle entry | Bundle `my_gov_id` | That id in live `gov-agencies-directory.json` |
|---|---|---|
| UC-04 ديوان المظالم | 17366 | «المديرية العامة لحرس الحدود». ديوان المظالم is 17486. |
| UC-01 هيئة الحكومة الرقمية | 17789 | «مجمع خادم الحرمين الشريفين … للحديث النبوي» |
| UC-02 الديوان الملكي | 17360 | «الهيئة العامة للموانئ» |

- Cards **S01-BOG-001, S01-BOG-004 and S02-BOG-003** (Board of Grievances lawsuits) carry `agency: المديرية العامة لحرس الحدود / 17366 / fg.gov.sa`.
- The other 58 cards match the live names exactly.

**C4. «التصحيحات ١–١٠» against the file (q387).**
- **Guide:** «٢٤٣ تصنيف ناجز بالتصحيحات ١–١٠» (line 273, and table line 301).
- **The Najiz MD:** its corrections log (§3, lines 86-94) has 6 rows. No numbered list 7–10 exists in it or in the bundle MD.
- **The version:** the file says `version: "2.0.0-nzamy-verified"`, but our 10-30 ledger recorded REF0039 as `v2.1.0`. The owner may have sent an older copy.

**C5. Urgent cassation period (q348).**
- **Guide:** «`30 يوماً` للأحكام العادية و`10 أيام` للأحكام المستعجلة (م ١٩٤ مرافعات شرعية)».
- **Code:** the 10-day urgent figure we already apply comes from Art. **187** (appeal and review): «…المسائل المستعجلة فتكون عشرة أيام» (`20261016_04:12-14`).
- **What we could and could not check:** نظام المرافعات الشرعية is not in the repo's local `output/laws.json` (45 laws), so Art. 194 cannot be read here.
- **Why we hold it:** the developer's recollection is that Art. 194's urgent figure differs from Art. 187's. Treat "10" as unconfirmed until the article text is quoted. A wrong short period makes a lawyer file early; a wrong long one makes him miss the deadline.
- **Note:** the guide's "cancel the wrong 60" is already true. There is no 60-day cassation rule; the 60 was only in reference REF0035.

**C6. "Import 424 cards, 862 circuits, 243 classifications, 363 agencies" against what the JSON contains.**
- **The guide** (line 273, and the tree at line 36): «٤٢٤ بطاقة + ٨٦٢ دائرة + ٣٦٣ جهة» are in `murshid_atomic_master_bundle_2026-10-28.json`.
- **The JSON:** it holds 61 cards, 0 circuits, 0 Najiz rows and 0 agency rows. Its `files_manifest` lists the real files on the owner's `D:\Data\…`.
- **History:** this is the third package without `circuits_directory_cleaned.json`. It was first asked for in the 10-30 ledger, then in our q388.

**C7. Firm invoices (q354–q356) against our recorded design.**
- **Our design:** the 10-31 report said firm finance needs «نموذج صلاحيات مالية للمكتب» (`…حزمة_30_أكتوبر.md:365`).
- **What the guide does:** it orders the three features without that model. The model is the real prerequisite, and it is shared with q344 and q350 (§4).

## 3. Risks

- **Fake data (honesty gate):** the package's golden `/ai/procedures` (`01_…/مرجع_الواجهات_الأصلية_المعتمدة_2026-11-01/src/app/ai/procedures/page.tsx:22-51`):
  - it imports `_ai.ts` `getSmartAnswer`, which waits on `setTimeout(r, 1400)` and gives canned answers;
  - it uses the 14-row `CIRCUITS` sample with `najizCode`.
  - That is exactly what T28-33 removed (the comment at live `page.tsx:44-50`). Do not restore it. The murshid import should feed the current tabs.
- **Unreviewed legal content:**
  - **Deadlines and quotes:** the 61 cards carry deadlines (60 days, 10 years, 30 days) and statute quotes, and all claim `confidence: "high"` and zero unverified items.
  - **Wrong agencies:** C3 shows three of them name the wrong agency.
  - **A quote to check:** S01-BOG-001 step 1 cites Art. 8 for a 60-day grievance, but its LB1 quote opens with Art. 8(1), the 10-year text for civil-service claims.
  - **What to do:** keep the cards behind `BetaReviewGate legal-data` until the owner reviews them on screen.
- **Data loss (q341):** a BEFORE DELETE guard on hearings, case stages and deadlines must exempt foreign-key cascades, as the update guard does (`20261019_21:40-51`). Those rows are `owner_user_id … ON DELETE CASCADE` (`20261019_21:61`). Without that, the guard blocks the account purge and the firm-asset transfer.
- **Security (q346):** an SVG logo is a stored-XSS risk on any page that renders it inline, and a route to external fetches when a server renders it. Sanitise it with an allow-list or rasterise it on upload. A DOCX also needs a PNG fallback, because Word's SVG support needs one.
- **Privacy and legal (q343):** a verification card for a lawyer who hid himself from search overrides his own choice. Our q343 said so. Use a non-guessable token per letterhead, never the user id, so the card cannot be used to list lawyers. Show only name, licence number and verification state, and make the opt-out toggle work from day one.
- **Money and legal (q354):** a document showing 15% VAT and a VAT number reads as a tax invoice. Under ZATCA rules, a tax invoice needs Fatoora phase-2 compliance (QR code, UUID, hash chain). Label it «فاتورة خدمات (غير ضريبية)» or «بيان أتعاب», and say the office issues the tax invoice from its own e-invoicing system, unless the owner commits to Fatoora integration.
- **Money (q355):** the reversal must be append-only:
  - a negative collection row with a reason and the actor;
  - the invoice's remaining amount recomputed;
  - never an UPDATE or DELETE of the original row.
  - Gate it with the same firm-finance permission as q356.
- **Data (q349):** widening `client_type` also touches `create_lawyer_invoice` (`20261030_20:123`) and its fingerprint. Rows typed `company` have to be mapped to «منشأة تجارية» or left as they are, and the owner must say which.
- **Deploy order:** a route or screen that sends the new `client_type` values or note-author fields before the SQL runs will fail on the CHECK. Use the usual "send only when non-null, SQL first" rule.

## 4. Suggested batches (dependency order)

1. **F1: code only, no SQL** (about 1.5 days):
   - **q347** default event `copy_received`;
   - **q352** Asia/Riyadh in `.ics` and Google;
   - **q358** one «اطلب استشارة» button;
   - **q357** hearings added to the overlap check, in both directions, still warn-then-confirm;
   - **q351** court search over the circuits directory, keeping «أخرى»;
   - **q386** drop `info@bip.gov.sa` from both data files.
2. **F2: small SQL guards** (about 1 day, one migration):
   - **q340** `original_author_name` snapshot in the existing trigger;
   - **q341** BEFORE DELETE guard on inherited court rows, exempting cascades;
   - **q339** `firm_profiles.office_kind` (`law_firm` or `consulting_m18`), read by `firm_court_rows_stay_with_member` instead of the owner's `practice_kind`, plus the signup choice and an admin edit.
3. **F3: firm permission model** (about 3–4 days, the shared base):
   - **The model:** one `firm_member_permissions` table (or a `firm_members.permissions` column) with named permissions: `letterhead.print`, `finance.bill`, `finance.reverse` and `case.assign`, and role defaults matching today's three roles.
   - **On top of it:** **q344** per-member print grants (TS gate and `can_manage_branding_vault`), **q350** the case-assign RPC and UI, **q356** firm-level billing, then **q338** member landing on `/dashboard/firm` with "my assigned cases".
4. **F4: firm finance** (about 2–3 days, after F3):
   - **q355** reversal entry;
   - **q354** optional VAT and VAT number, worded as non-tax unless Fatoora is decided;
   - **q349** four client types and representative fields. It goes with F4 because it changes the invoice RPC too.
5. **F5: letterhead** (about 4–6 days):
   - **q346** SVG, sanitised, with the bucket and path checks;
   - **q343** verification card with a token and a privacy toggle;
   - **q345** real `.docx` and print-PDF on letterhead in the three tools. This needs a docx dependency and its own review. It is the largest item in the slice.
6. **F6: murshid import** (about 2–3 days for what arrived):
   - **What to build:**
     - parse the 15 channels, with the C3 ids re-keyed and C1 and C2 overridden;
     - parse the 61 problem cards behind the legal-data gate;
     - parse the 243 Najiz classifications into a «تصنيفات ناجز» tab, once the owner clarifies C4.
   - **Held back:** the 363 agency cards and **q384** (862 circuits) until he sends the files. **q348** waits for the Art. 194 text (C5), then it is a one-row seed plus a stage urgency flag.
7. **NOT-CODE:** **q360** sets the order above (lawyer and firm first). **q389** is the owner's on-screen review after F6 is deployed.

**Questions to send back to the owner:**
- the Art. 194 text for urgent cassation;
- the missing files: `circuits_directory_cleaned.json`, the 363 agency cards (`sector_01..32`), `gov_contacts_consolidated.json`;
- which «تصحيحات ١–١٠» he means, given the file has 6, and which Najiz guide version is current (2.0.0 or 2.1.0);
- confirmation that the bundle's 920000529 and `info@pp.gov.sa` are superseded by q385 and q386;
- whether firm invoices may show VAT without e-invoicing (Fatoora).
