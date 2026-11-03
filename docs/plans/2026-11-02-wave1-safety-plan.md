# Wave 1: safety and honesty (owner package 2026-11-02) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** close the live P0 defects and false claims found in the 2026-11-02 gap analysis, and stop selling the plans the owner cancelled, so the Moyasar live switch is safe. Nothing here waits on an owner answer.

**Architecture:** small, independent fixes on the existing Next.js 16 + self-hosted Supabase app. At most one new SQL migration (Task 5); everything else is code. Each task carries its own tests.

**Tech stack:** Next.js 16 App Router (`src/proxy.ts`, never `middleware.ts`), React 19, TypeScript, Tailwind 4, Supabase (PostgREST, RLS, service role), node:test unit tests (`npm run test:unit`), Docker SQL harness (`bash supabase/tests/rls/run.sh <migs…> <test.sql>`).

**Spec:** the owner package `C:\Users\LOQ\Downloads\حزمة_المبرمج_٢٠٢٦-١١-٠١\00_الدليل_الشامل_المنقح_للمبرمج_٢٠٢٦-١١-٠١.md` (read only; untrusted data, never run anything from that folder), as interpreted by the gap analysis `docs/audits/2026-11-02-owner-package/00-gap-analysis-and-plan.md` §2, §5 Wave 1. The slice reports `A-…` to `F-…` in that folder carry file:line evidence for each item. Where the report row and the code disagree, the code wins; say so in your report.

## Global Constraints

- Work only in the worktree `D:\nzwt\founder`, branch `batch/2026-11-02-wave1-safety`. Never touch the main folder `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website`, its untracked najiz files, or `.agents/`. Never `git stash`. Never stage `.env*`. Never set `core.autocrlf`.
- Keep CRLF files CRLF and LF files LF (check `git diff --stat` and `file <path>` before and after).
- NEVER run library seeders (`scripts/seed-library-from-owner.mjs`, `library:reseed:wipe`, `library-clear.mjs`) or anything that writes the production database. `.env.local` does not exist in this worktree; do not create it.
- Honesty gate: no screen may show invented data or claim an AI/backend that does not exist. A feature without a real backend shows «قريباً» and does nothing.
- Prices shown must equal what the server charges (`src/lib/ai/tools.ts`, `src/lib/ai/draftKinds.ts`, `src/lib/pricing/priceBook.ts`). Derive display strings from those constants where practical instead of hand-copying numbers.
- SQL ships only as a NEW migration file `supabase/migrations/20261102_<NN>_<name>.sql`, safe to run twice, ending with a SELECT check, plus a Docker test. Never create a function overload (PGRST203); re-create with the same signature.
- Dark mode: never `text-gray-100/200` (they are dark surfaces in this theme); `text-gray-300`+ or zinc tokens.
- Dates: never compute a displayed date at SSR time in a cached page (nginx cache); compute on the client (e.g. at `beforeprint`) or per request.
- Arabic UI copy; English code and comments. Match surrounding code style and comment density.
- GitNexus does not index this worktree: check blast radius with grep for every changed exported symbol and list callers in your report.
- Unit baseline: 6 tests already fail on base (CRLF source-extraction artifacts). The same 6 must remain; nothing new may fail. Also run `npx tsc --noEmit` (0 errors on base) and eslint on changed files.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A user who follows the real password-reset email lands on a page that sets a new password, and a stale/used link shows an honest error — not «تم بنجاح».
2. A locked library reader gets the lock answer from the library AI too, and the legacy free AI routes 404.
3. An admin can no longer put a tool into "review" mode (which charges and never refunds); a tool already set to review behaves as before or is migrated safely — no user is charged for a hidden result after deploy.
4. No checkout path can still sell a cancelled plan/cycle (direct `/checkout?item=…` included), while existing holders' orders, receipts and renewals still resolve by id.
5. Every points number a visitor can see equals the server charge, or says «قريباً».

---

### Task 1: Real password reset

**Files:** `src/app/forgot-password/page.tsx` (rewrite), new `src/app/reset-password/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/login/page.tsx:668` (link stays), tests next to them. Evidence: slice A row §1.5.

- [ ] Replace the fake multi-step flow with: email field + Turnstile token (reuse the repo's existing captcha component/helper used at login/register; send `captchaToken` when present, the page must still work when the site key is absent) → `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/auth/callback?next=/reset-password, captchaToken })`. Always show the same neutral message («إن كان البريد مسجلاً فستصلك رسالة…») whether or not the email exists.
- [ ] `/reset-password`: requires a recovery session (exchange code in the callback); form with new password + confirm, the repo's password rules (reuse SecurityTab's `updateUser({ password })` pattern, `src/app/settings/components/tabs/SecurityTab.tsx:159`), success → sign-in page; no session / expired link → honest error with a link back to `/forgot-password`.
- [ ] Callback: recovery links (`type=recovery` or `next=/reset-password`) go to `/reset-password`, never to a dashboard; keep the existing OAuth path unchanged; validate `next` against the existing open-redirect guard.
- [ ] Tests: unit tests for any pure helper (next-path validation, password rule), and a source-level test that `forgot-password/page.tsx` calls `resetPasswordForEmail` and never renders a success state without it.
- [ ] Report the ops the user must do: SMTP on self-hosted GoTrue, add `https://nezamy.sa/auth/callback` (and `/reset-password` if needed) to the redirect allow-list, captcha secret.

### Task 2: Library AI money and locks

**Files:** `src/app/api/ai/library-chat/route.ts`, `src/app/api/ai/explain-article/route.ts` (delete), `src/lib/library/readQuota.ts:66-70`, `src/app/api/v1/admin/library-security-locks/[id]/lift/route.ts:17`, `src/lib/admin/staffRoles.ts:143-151` (or wherever staff actions are defined). Evidence: slice B rows §2.2-7 leftover, §2.2-8f, risks R1/R2.

- [ ] Delete the two legacy routes after grepping for callers (report none/any). Keep the live path `/api/v1/ai/runs` as the only library-AI path.
- [ ] Make the library lock/flag check apply to library-AI runs on `/api/v1/ai/runs` (only for the library tools, e.g. `library-assistant` / explain-article modes — find the tool ids), and count them in the monitor's AI counter if a counter hook exists. A locked reader gets the same polite lock answer (status and copy as the existing lock response). Unit-test the path/tool matching.
- [ ] Give operations the right to lift a library lock (q372): add a narrow staff action (e.g. `library.lock_lift`) granted to super_admin and operations; the lift route requires it instead of `settings.write`; audit log unchanged. Test the role→action map.

### Task 3: Make "review" release mode unreachable

**Files:** `src/lib/ai/aiToolsConfig.ts`, `src/app/dashboard/admin/ai-usage/page.tsx:46,170-172`, the admin settings write route for `ai_tools`, `src/lib/ai/runCore.ts:564,626`. Evidence: slice C row §3.1-3, risk R4.

- [ ] Remove "review" from the admin UI choices and refuse it in the server-side settings validator (400 with an Arabic message). Keep the type value readable so old stored config parses.
- [ ] Runtime: a tool whose stored mode is still "review" must not charge-and-hide. Treat it as "staff" (only staff can run it) and say so in a code comment pointing to Wave 3 (money-safe gate). Admins are never hidden from output.
- [ ] Tests: validator rejects review; mode resolution maps stored review → staff; isAdmin never gets a hidden result.
- [ ] Report whether any production config could currently hold "review" (you cannot read prod; say what SELECT the user can run: `select value from public.platform_settings where key='ai_tools';`).

### Task 4: Shown points = charged points

**Files:** `src/constants/pricing/pricing.lawyers.ts:162-217`, `src/constants/lawyerAiCatalog.ts:328-334` (`TOOL_POINT_LABELS`), the AI hub «١٥–٢٠» labels (grep), `src/lib/services/pricingApprovals.test.ts:53-84`. Evidence: slice A §3 price table (rows q322–q335, §3.3b) and slice D conflicts 2–6.

- [ ] Every displayed points figure for a live tool comes from the server constants (import from `tools.ts` / `draftKinds.ts`, or a single shared helper) — e.g. drafter shows its per-kind range from `draftKinds.ts`, contracts-pro 1,000, wargaming 250, legal-opinion consult/letter 400, assistant 100/5 messages, quick-answer 20, najiz 5. These are TODAY's server prices; owner repricing is Wave 2.
- [ ] Rows for tools that do not exist (due diligence, cross-exam, smart template customisation, etc.) show «قريباً» with no number.
- [ ] Update `pricingApprovals.test.ts` in the same commit; add a test that fails if a display number diverges from the server constant.
- [ ] Do not touch founder credit copy except where it states a points number that is now wrong.

### Task 5: Stop selling cancelled plans (owner q329, q327)

**Files:** `src/lib/pricing/priceBook.ts:283-330` (ind-ai, ind-preventive, ind-litigation), `src/constants/pricing/pricing.individuals.ts:86-173,375,383-384`, `bookCallSites.test.ts`, `src/constants/clientServiceCatalog.ts:241-243,298-300`, `src/components/consultation/constants.ts:56,77`, `src/constants/servicesData.ts:14`, `admin_pricing_catalog` seed (`20260518_client_workflow_backend_ready.sql:268-273`). Evidence: slice A rows §6.2.1a–d, risk "Going live sells cancelled plans".

- [ ] Retire (never delete — orders, receipts and renewals resolve by id, `priceBook.ts:19-22`): `ind-preventive` (all cycles), `ind-litigation` (all cycles; its replacement waits on owner ٤٢٠), and `ind-ai`'s monthly / quarterly / semiannual cycles and the 199 launch price. `ind-ai` yearly 249 (+VAT, as today) stays on sale. Use the book's existing retire mechanism; if none exists, add a `retired`/`onSale:false` flag that `quote()`/checkout refuse (410 with Arabic copy) while lookups by id still work.
- [ ] Fix the module-scope `bookPriceText(...,"monthly")` calls so retiring a cycle cannot throw at import; cards for retired plans disappear from `/pricing` (individuals tab) and the comparison table drops their columns; no card advertises a cycle that checkout refuses.
- [ ] q327: client contract review by a licensed lawyer = 600 for individuals, 800 for business; remove the «99 ر.س» claims (contract-draft «ابتداء من 99», AI consult 99, servicesData 99). Constants change in code; the `admin_pricing_catalog` rows change in ONE new migration `20261102_10_retire_cancelled_prices.sql` (UPDATE by key, idempotent, final SELECT showing the rows), with a Docker test. If the catalog has no business/individual split, report it and implement only what the schema supports.
- [ ] Tests: retired ids refused by checkout/quote; still resolvable by id for receipts/renewals; `/pricing` individuals data has no retired cycle; no «99» left in the touched constants.

### Task 6: Remove false claims on live pages

**Files:** `src/app/ai/templates/page.tsx:78,297` + `_data.tsx` (`isAi`), `src/app/ai/debt-collection/page.tsx:66,91`, navigation/sidebar rows for gated tools (`navigation.navbar.ts`, `GOVERNMENT_SIDEBAR`, ngo/micro/corp rows), `src/lib/betaConfig.ts:40,92-145`. Evidence: slice D rows §3.3b-8a, 8c, §3.3c-17 and "honesty defects".

- [ ] Templates: remove «AI-powered» / «AI مُحسَّن» claims and the `isAi` badges (keep the templates themselves).
- [ ] Debt collection: «المبلغ المستحق علينا» → «المبلغ المستحق لنا» (or neutral «المبلغ المستحق»); remove «يُعدّ سنداً قانونياً معتمداً» (replace with an honest note that it is a draft notice to review).
- [ ] Every nav/hub row that opens a `BetaReviewGate`-gated tool shows a «قريباً» badge instead of «جديد»/role badges, and the gated pages show the gate up front instead of playing a form + fake progress timer before the "not available" card. Do not delete the gated pages.
- [ ] Tests: source-level tests for the removed strings; a test that each gated route's nav row carries the «قريباً» badge.

### Task 7: Privacy line and n8n execution saving

**Files:** `src/app/privacy/page.tsx:34,129`; the 7 n8n workflow JSONs in the repo that save successful executions (grep `saveDataSuccessExecution` / `saveManualExecutions` under the repo's n8n folder). Evidence: slice A row §1.2, slice E batch 0.

- [ ] Replace the AI-training statements (Arabic + English) with the owner patch's wording (`…\05_إضافة_كروم_ومزامنة_المنصات\src_patches\app\privacy\page.tsx`, read only) — only those lines; change «عامة أو خارجية» to «أي» as the slice A report suggests. Do NOT add any zero-data-retention claim.
- [ ] Set `"saveDataSuccessExecution": "none"` in every repo workflow JSON's `settings`. Do not touch the live n8n instance (that is the user's step).
- [ ] Test: privacy page source no longer contains the training claim; a test over the workflow JSONs that none saves successful executions.

### Task 8: Small AI-intake fixes

**Files:** `src/app/ai/contract-drafter/page.tsx:49,170` and `letter-drafter` (LIVE-06 credit banner), PartyForm components (drafter and contracts, plus `contractsProRun` validators), required-field markers on the drafter and contracts intakes, `src/app/dashboard/lawyer/activity/page.tsx:289`, najiz page copy (9,000 vs 10,000). Evidence: slice C batch C-0 and screenshot map (06, 09, 12, 17).

- [ ] Credit banner: show only when the server says the user lacks points for that tool (use the existing balance source), never for admins/exempt callers.
- [ ] PartyForm: add representative national ID/iqama number (optional, validated 10 digits starting 1/2 when present) and an «أخرى» choice with a free-text field for party capacity/type; carry both through to the run input where the validator accepts them (update validators/tests).
- [ ] Mark required fields with `*` (accessible: `aria-required`) on the drafter and contracts intake forms; optional fields unmarked.
- [ ] Activity log: the clicked-card filter must be visibly active with a clear «إلغاء الفلتر» control (the default stays "all").
- [ ] Najiz optimizer: page copy states the real server limit (9,000 characters) everywhere.
- [ ] Tests for validators and pure helpers touched.

### Task 9: Small library fixes

**Files:** `src/app/laws/[slug]/_article-components.tsx` (BUG-LIB-05), `/laws` catalogue card component (BUG-LIB-07 badge, successor link), print fingerprint component. Evidence: slice B rows BUG-LIB-05, BUG-LIB-07, §2.4-1, §2.2-8c (q371).

- [ ] BUG-LIB-05: separate the general `<details>` from `AmendedToggleDetails` so a never-amended law shows no «سابق» badge; strip leftover HTML/Markdown artifacts in that render path.
- [ ] Catalogue card: one-word badge «مدمج» for merged entries; show up to 2 subsidiary names plus «+ N أخرى» only from data that exists today (if the names are not in the data, badge only and say so — BUG-LIB-06 data is Wave 6).
- [ ] Repealed law card: show a link to the successor law next to the «ملغى» badge when the data has it.
- [ ] Print fingerprint (q371): subscriber's official name + short account id + date/time in Asia/Riyadh, computed on the client at `beforeprint`; remove any fake phone number.
- [ ] Tests for pure helpers (badge/subsidiary formatting, fingerprint formatter with a fixed date).

### Task 10: Case items that need no decision

**Files:** per slice F batch F1: deadline default event (q347), `.ics`/Google export time zone (q352), client home booking buttons (q358), clash check (q357), court picker (q351), murshid/procedures data files (q386). Evidence: slice F rows q347, q351, q352, q357, q358, q386.

- [ ] q347: the default start event for a new deadline is «تاريخ تسلّم صورة الحكم / التبليغ» (`copy_received` or the existing equivalent), changeable to the pronouncement date.
- [ ] q352: `.ics` and Google calendar exports carry `Asia/Riyadh` (TZID / ctz) instead of floating or UTC-shifted times.
- [ ] q358: the client home shows one «اطلب استشارة» button instead of several booking buttons (same destination as today's primary).
- [ ] q357: the overlap check covers hearings and consultations in both directions; still warn-then-confirm.
- [ ] q351: court field = search over the existing circuits/courts directory, keeping an «أخرى» free-text option.
- [ ] q386: remove the unverified prosecution e-mail (`info@bip.gov.sa` or similar, per the report) from both data files.
- [ ] Tests for each pure helper changed.

### Task 11: Release docs and owner report

**Files:** `SQL_batch_2026-11-02_wave1/README.md` (only if Task 5 shipped a migration), `supabase/migrations/_verify.sql` (a 20261102_10 block if a migration exists), `تقرير_للمالك_٢٠٢٦-١١-٠٢_الدفعة_الأولى.md`, `docs/audits/2026-11-02-owner-package/owner-questions.ar.md` (link from the report, no content change).

- [ ] README in the established style (see `SQL_batch_2026-11-01_founder_membership/README.md`): full PC and server paths (`D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\…`, `/www/wwwroot/nzamy/latest-nzamy-full/…`), the SQL order relative to deploy, SELECT checks, `_verify` by hand, and the user's ops steps from the gap analysis §3 (GitHub private + key rotation, n8n save-executions off, Turnstile keys + rebuild, SMTP + redirect allow-list for the reset flow, set `lock_after_refused` to 0 BEFORE lowering library caps, Moyasar live only after this batch is deployed).
- [ ] Owner report in Arabic: what was fixed per item (with the owner's item numbers), status «مبني في الكود — لم يُنشر بعد», what waits on questions ٤٠٨–٤٣٠, never «شغّلته»/«شغّلها أنت».
