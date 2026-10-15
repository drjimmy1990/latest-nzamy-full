# Owner package «حزمة_تسليم_المبرمج_المعتمدة_2026-10-06»: gap analysis against `main`

**Date:** 2026-10-16.
**Baseline:** `main` at 3bb2007.

**Package:** `C:\Users\LOQ\Downloads\حزمة_تسليم_المبرمج_المعتمدة_2026-10-06` (about 80 MB). It holds:
- 7 top-level documents;
- folders 01–09;
- `code_patches/`, a byte-identical copy of folder 02.

The package was revised up to 10-15, despite its name. It is AI-written (a "tripartite council") and was built against `owner-edits@3cc9f10`. Main has contained that commit since 10-09.

**Method:**
- Five read-only reviewers (Opus), one per part of the package. Nothing from the package was run.
- Each item was checked against the repo, the live-schema dump `latest_schema_20261010.sql`, and, where marked **[verified live]**, a read-only request to `auth.nezamy.sa` on 10-16.
- Statuses: **DONE** / **PARTIAL** / **NOT DONE**.
- "Owner" means د. محمد's decisions, mainly `01_…/إجابات_المالك_والمجلس_على_الأسئلة_المفتوحة_للمبرمج_٢٠٢٦-١٠-٠٦.md`.

---

## 0. Security — act first

**Outside the repo: the owner must rotate these. None of them is in our git history; `git log --all -S` was checked.**
1. **Anthropic API key (full, plaintext).** Found in:
   - `README.md` L171
   - the CRM council report L45
   - the backend guide L3963
   - the memo L1143
   - `08_staging_محلي/app/src/lib/services/claudeN8nHybridService.ts`
   - `02/claude_api_and_n8n_automation_engine.patch.ts` L51

   **Rotate it.**
2. **GitHub access token.** The 08 README says it is embedded in the owner's local git remote. **Revoke and reissue it.**
3. **Sard/Najiz third-party login.** Found in the memo L647-652, L703 and 07/01 §6. **Rotate it and scrub the package.**
4. **Moyasar publishable keys and secret-key prefixes**, plus staging and UAT passwords. Found in `ACCOUNTS_STAGING.md` and the test plans. Keep them out of the repo.

**In our system:**

5. **The 10 test-lawyer accounts on live** (`lawyer1..10@nezamy.sa`, created 10-06) use the default password that is still in git history.
   - The script was fixed in 9c85253.
   - **Their passwords still need to be changed on live**, with `SEED_LAWYER_PASSWORD='…' node scripts/seed-test-lawyers.mjs --execute`.
6. **Library text a guest can read straight from the REST API, bypassing the paywall** **[verified live]**:
   - `library.principles.text`: HTTP 200, a single row of about 253k characters.
   - `library.principle_paragraphs`: HTTP 200.
   - `library.feqh_blocks`: HTTP 200.
   - `library.decree_pages.content`: HTTP 200.

   `library.articles.text` is correctly locked (401). The owner decided the precedent reasoning goes behind the wall (Q171), so a column/table lock like 20260929_01 is needed. Fiqh and decrees need an owner answer: free or paid?
7. **Profile self-edit (owner Q29).** `profiles` has `GRANT ALL` to authenticated, and its policy "users update own profile" has no column guard. A user can set their own `verified_at`, `nafath_verified`, `email`, `onboarding_completed` and `metadata`.
   - `user_type` is locked by a trigger, and `is_admin()` reads `user_type`, so there is **no admin escalation**.
   - `verified_at` drives the admin users list's «نشط / بانتظار التحقق».
   - Fix: column-level `UPDATE` grants.
8. **The uncommitted Najiz route** (`src/app/api/v1/najiz/sync/route.ts`, working tree, not committed):
   - L72-77 turns any Bearer string longer than 10 characters into a userId and writes with the service-role client.
   - L90 falls back to a fixed dev user.
   - **Do not commit it as it is.**
9. **Low:**
   - Demo credentials ship in the login bundle (`src/lib/test-credentials.ts` → `login/page.tsx:29`). They are used only when `BACKEND_MODE` ≠ supabase, so they are inert on prod.
   - The 20260921_01 anon revoke on `profiles` is missing on the self-hosted DB. RLS still blocks anon.

---

## 1. Live bugs — confirmed, small fixes

| # | Bug | Evidence | Effort |
|---|---|---|---|
| 1 | **Saving the draft cart fails** | Live: `column law_draft_carts.article_title does not exist` **[verified live]**. The route also deletes the cart before inserting (`api/v1/drafts/cart/route.ts:66-83`) | S |
| 2 | **Community question feed broken** («تعذّرت قراءة الأسئلة») | Live: `PGRST201` ambiguous embed `community_posts → community_answers`, because two FKs exist **[verified live]**. `community/posts/route.ts:41`, `[id]/route.ts:58`. Even when the read succeeds, the page filters on a `tab` the API never returns (`community/page.tsx:205`), and the lawyers tab sends `lawyers` while the DB stores `lawyers_only` | S |
| 3 | **Chat rooms 500**: the RLS policy references itself | Live schema L18510; migration `20260603_phase1_004:719-728`. The package fix `20261012_chat_participants_rls_recursion_fix.sql` is sound, but its L83 lets anyone join any room, so adapt it | S + Docker test |
| 4 | **Government dashboard crashes** for clerk and admin | `dashboard/government/page.tsx:178/190`: `ROLE_META` has 4 keys; the DB allows counsel, clerk and admin | S |
| 5 | **Subscriptions never expire** | `access-control.ts:94-106` `getUserTier` ignores `current_period_end` | S |
| 6 | **A library-only subscription unlocks every pro tool** | Library requests are fulfilled by granting tier `pro` (`src/lib/entitlements.ts:11-13`, admin approve default `pro`). Owner policy: separate library and tool permissions | M |
| 7 | **The public lawyers API returns `hourly_rate` and sorts by it** | `api/v1/lawyers/route.ts:71`. Owner Q168 says hidden unless the lawyer opts in | S |
| 8 | **Navbar** goes mobile on laptops (`xl` breakpoint), bell ×3 / ×2 in the mobile menu; **no logout in the dashboard sidebar** | `Navbar.tsx:362,395,492,493,631`; `SharedSidebar.tsx` | S–M |
| 9 | **45 court emails use Arabic-Indic digits**, so mailto and copy fail; 16 are badged «رسمي معتمد». Only 7 of the 52 owner corrections are applied | `src/data/circuits-directory.json`; `firm/circuits-emails/page.tsx:91,116-124,180` | S |
| 10 | **Hearing times show seconds** (`13:54:00`) | `hearings/page.tsx:549` | S |
| 11 | Hijri widget twice on the lawyer dashboard and activity page; AI operations missing from the activity log | `activity/page.tsx:573`, `SharedSidebar.tsx:147`, `lawyer/page.tsx:623` | S |
| 12 | **301 redirects for documents whose slug changed in the 10-15 reload** (owner Q166, now urgent) | No redirect map; about 3,376 old law URLs | M |

---

## 2. Owner decisions that `main` contradicts

**Q165, prices per page.** Main has PARTIAL / CONTRADICTS. Commit 3a08c49 claims Q165 is done.

| Page | Owner's answer | Main today |
|---|---|---|
| `/pricing` | Free / Pro Lawyer 399 a month (3,990 a year) / Firm from 990 a month | 8 audience tabs. Lawyers get credit packs from 1,000 to 10,000 (`pricing.lawyers.ts`). `/pro` sells 299/799. Firms start at 17,988 a year |
| `/laws` | Library 5,000 a year or 1,500 a quarter, launch offer from 1,000 | 1,500/2,750/5,000 with a false «خصم ٥٠٪» (the real figure is 17–25%). No 1,000 launch offer |
| `/services/individuals` | 39 / 149 / 399; consultant 199 | Matches, plus an extra 699 family plan (Q62 deferred that plan) |

**Other contradictions with his decisions:**
- **Popularity badges are back**, against the 10-03 decision: «الأكثر طلباً» (`pricing.individuals.ts:81,246`, `plans.ts:177`) and «الأكثر اعتماداً» (`pricing.library.ts:91`, `plans.ts:92`, `PricingHero.tsx:218`).
- **False discounts:** «خصم ٥٠٪»; struck-through 600/2,400 (`laws/subscribe/page.tsx:383`); «-15%» (`PricingHero.tsx:103`); «وفر ٥٥٪» (`pricing.individuals.ts:148`).
- **Withdrawn offer still shown:** "first 500 lawyers / free memo" (`PricingCards.tsx:297-300`, `pricing.lawyers.ts`).
- **Extra-seat price rises with plan size** instead of falling (`pricing.firms.ts:18/42/66`). English plan names sit in the Arabic list. The firm library at 4,800 costs less than the individual library at 5,000.
- **Checkout path broken:**
  - the CTA links to `/dashboard/client/draft`, which doesn't exist;
  - `register/client` drops `?plan=`;
  - `requested_ref` carries a display name;
  - the paywall's plan ids differ from `/laws/subscribe`'s.
- **Escrow** is still promised (`plans.ts:220,228`, `provider/profile/page.tsx:355`, `firm/wallet/page.tsx:123`, `admin/escrow`). Owner Q3/Q28 say no Escrow, and a 14-day refund unless AI points were used. The refund page has no such clause.
- **Q27, LegalTech identity:** «شركة نظامي للمحاماة» appears in `Footer.tsx:161`, `terms/page.tsx:130`, `refund-policy/page.tsx:95` and `contact/page.tsx:362,371`.
- **Q33:** Instagram and YouTube are still linked (`contact/page.tsx:197-203`).
- **Q2:** an unqualified «متوافق مع PDPL» badge (`privacy/page.tsx:240`).
- **Q42:** «طلب عام» from 500 is hidden from clients (`clientServiceCatalog.ts:596`).
- **Q18, appeal deadlines:** urgent appeals are seeded at 15 days and the owner says 10. Commercial audit (30) and Supreme Administrative Court (60) are missing. Both sides cite Art. 187, so this needs a legal check.
- **Q167, court fees:** the cassation (7,000) and reconsideration (10,000) caps are missing, and the old «٢٠٠ ألف» is still shown (`ai/procedures/_data.tsx:163`).
- **Branding Q128/Q131:** 117 «نظامي AI», 40 "Nzamy", 121 «﷼» against «ر.س». Q7: 25 «محامٍ معتمد» strings.
- **AI add-on:** the 2,500 SAR add-on is still sold, although points replaced it.

---

## 3. Fake or unbacked content still on main
- **Community:** hard-coded «أكثر المجيبين» with counts 127/89/74 (`community/page.tsx:375`, `communityData.ts:171`); mock posts (`community/lawyers/page.tsx:89-153`). No contact filter on posts.
- **Blog:** raw `sec_*` category codes (`blog/page.tsx:172,270`); invented fallback authors (`:165`); «محامٍ متخصص» shown for a consultant (`ArticleView.tsx:386`).
- **Claims:**
  - `/erp`: «متكامل مع ناجز» and "24 government platforms".
  - Admin dashboard: hard-coded «UPTIME 99.99%» and «Moyasar 99.8%» (`admin/page.tsx:543-555`).
  - direction-support costs 100 points but is a coming-soon page (`lawyerAiCatalog.ts:206-210`).
  - Admin COMPANIES list is mock data (`admin/business/page.tsx:43-49`).
- The «التحديثات التشريعية» fake list was removed again in 3bb2007.

---

## 4. Library and reader gaps

**Not done:**
- Search shows one card per article instead of grouping by law (`api/library/search/route.ts:380`).
- Precedents show raw `**`. Facts, reasons and ruling run as one wall of text (`_principle-block.tsx:145,150,196`). A `stripMd` helper exists but only for copy.
- Author search (e.g. «السنهوري») doesn't work: `bookTitleHits.ts` matches titles only.
- The advanced-search fields are inert («قيد التفعيل», `PaywallModal.tsx:257-269,455-609`).
- Fiqh search cards show a fake 100% progress and «—» (`laws/page.tsx:1209,1212`).
- Empty «الإصدارات السابقة» cards (`_article-components.tsx:960-975`).
- `metadata_card` and `summary` (Identity Card V2): the parser strips the card and never stores it; T03-07.
- `rows-preflight.mjs`: it is in the 10-09 package and was never copied.
- The rest of `00_ALL.patch`: about 3,900 lines, under review.

**Data (owner's files):** OCR garbage, PDF page footers, an internal path shown in «موجز المستند» (the 10-15 reload may have fixed some of these).

---

## 5. Larger features in the package: not built

Each is effort L unless noted.
- **Vault:** the lawyer vault (`/dashboard/lawyer/vault`).
- **Contracts:** categories for the contracts hub (retainer vs drafted).
- **Clients and cases:**
  - 6 client entity types with representative and nationality (codex `20261013_client_entities…`);
  - 22-body court list (S);
  - 14 consultation types;
  - case-facts editor;
  - hearing edit and delete.
- **Roles:** 18-role RBAC (trainee, secretary, accountant); Article-18 consultant 403; firm access-request flow; pro-rata upgrades.
- **Integrations:**
  - Moyasar gateway (only the `payments_gateway` flag exists);
  - direct Claude API with model tiers (AI runs through n8n today);
  - staff CRM;
  - WhatsApp gateway;
  - government-platforms hub;
  - NDC document codes `/d/[code]`.
- **UI:**
  - Nezamy Motion (waiting and motion states; M for the core loading pieces);
  - sticky board;
  - speed-dial;
  - PWA.
- **Public profile** banner and statistics.
- **Disabled-button standard (Q13)** and a Hijri/Gregorian date picker (Q127).
- **Q169:** notepad scoped private / case team / firm.

---

## 6. Package code: do NOT copy as shipped

- **Folder 02 (135 files):**

  | Recommendation | Files |
  |---|---|
  | Apply as-is | 6 |
  | Adapt | 73 |
  | **Reject** | **53** |
  | Already on main | 3 |

  By risk: 54 are marked DANGER and 63 need review. None of the 16 SQL migrations is on main or the live DB.
- **Reject first:**
  - **Both Moyasar patches:** they trust the browser amount, take raw card and CVC inputs, report fake "paid", and have unsigned webhooks.
  - **CRM, Claude/n8n and global-AI code:** it embeds the API key, trusts `user_metadata.role` (which users can edit), and returns canned answers.
  - **Routes with no auth:** `ingest_najiz_route` and the NDC resolver run with the service role and no auth.
  - **SQL that weakens security or needs a decision:**
    - `20261012_server_performance_and_anti_scraping.sql` grants anon the whole library schema, which undoes the column lock;
    - the pricing, delegations, CRM and community SQL use SECURITY DEFINER on any caller;
    - `20261006` rewrites the Public Prosecution law.
  - **The runbook's whole-file "drop-ins":** they would revert main-only fixes.
- **Apply next (adapted):**
  - the chat RLS fix (tighten L83);
  - `filter_test_lawyers`;
  - a minimal draft-cart fix;
  - the government-role fallback;
  - the sidebar logout button;
  - the community split queries;
  - the brief-check skeleton;
  - the F1–F12 checklist in `FIX_plan_param_and_cta.proposal.md`.
- **Staging app (08):** 157 changed files on top of 3cc9f10. About a third is mock or unsafe:
  - a payment verify that accepts any `moy_*` id;
  - CRM self-grant;
  - `lawyers/[id]` beside `[slug]`, which breaks `next build`;
  - unauthenticated in-memory "vault" and "contracts";
  - an elevated-rights activity log that trusts a caller-supplied actor.

  **Never copy staging's `proxy.ts`:** it removes the Bearer auth from 1bc178e. Worth porting piece by piece, in order:
  1. the community fix and real top contributors;
  2. the Navbar;
  3. the client entities, reworked;
  4. the library UI pieces;
  5. the finance charts;
  6. the redirects;
  7. small lawyer UX.
- **Folder 04 tests:** they check strings inside the package, not main. The real runtime results are in 08 and date from 10-12, before the 10-13..15 staging changes.

---

## 7. Contradictions to ask the owner about

1. **Consultant plan:** 199 (Q165), or 399/3,990 as in the 13-Oct policy and services guide?
2. **Lawyer plan:** Pro 399 a month (Q165), `/pro` at 299/799, or credit packs?
3. **Firm plan:** 990 a month (Q165) or 799 (README §4)?
4. **Family plan:** deferred (Q62), a standalone 699, or a 20/30/40% add-on?
5. **Points:** the per-tier cost and the top-up schemes disagree across the documents. Also, the README converts 14,900 SAR to 149,000 halalas; the correct figure is 1,490,000.
6. **Escrow:** dropped in Q3/Q28, but still promised in the README hints and in the code.
7. **Library free preview:** 5 articles (code and decision) or 3 (several documents)?
8. **QR centre:** ⚖️ or the Kufic wordmark? (Two README sections disagree.)
9. **Draft-cart destination:** vault → `/ai/draft`, or `/ai/collector`?
10. **`/ai/secretary`, `/ai/global`, direction-support:** deferred (Q154/Q172) but fully specified elsewhere.
11. **Q105:** the 8-Oct registry entry that made the three company charters public was written by a coordinator agent. Did the owner confirm it?
12. **Win-percentage score:** QadiPro bans it; the CRM report and the Najiz work output one.
13. **Precedent reasoning behind the wall (Q171):** does the same apply to fiqh blocks and decree pages? Today all three can be read freely through the REST API.

---

## 8. Suggested order

1. **Security (§0):**
   - the owner rotates the Anthropic key, GitHub token and Sard login;
   - you change the 10 test-lawyer passwords;
   - lock precedent text, plus fiqh and decrees once he answers;
   - column-lock profile updates.
2. **Live bugs (§1 #1–#5, #7, #9, #10):** all small; one batch.
3. **Pricing and honesty (§2, §3):** remove the fake discounts and badges, the withdrawn offer and the Escrow wording; fix the checkout path; align with Q165 once the owner answers §7 items 1–4.
4. **Library (§4):** Q166 redirects, grouping by law, precedent formatting, author search.
5. **Port the safe pieces of the package (§6 "apply next").**
6. **The large features (§5)**, in the order the owner prioritises.
