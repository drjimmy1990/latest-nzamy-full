# Final review of batch 2026-11-08: the fixes

Branch `batch/2026-11-08-security-table`, worktree `D:\nzwt\b1108`. One commit
per finding, or per group of related findings. Findings 7 and 11 were skipped,
as the brief said. GitNexus was not available: its `impact` tool answered
"Target not found" for these symbols. Blast radius was checked by hand
(grep over callers, plus the source-contract tests).

| # | Commit | Status |
|---|--------|--------|
| 1 | 19fa252f | fixed |
| 2 | 8bf51aae | fixed: migration `20261108_41` |
| 3 | 6c2e8045 | fixed |
| 12 | 03aa0ddc | fixed |
| 4, 6 | 541914ed | fixed |
| 8 | da6337e9 | fixed (one open question, below) |
| 9 | a09b7f0f | fixed |
| 5 | none | checked; no loop and no dead end, so left as is |
| 13 | none | live n8n check, read-only; nothing found |

---

## 1. Firm and lawyer activity pagination (19fa252f)

**Problem.** Both routes merged several streams of up to `PAGE_SIZE` rows each,
then cut the result to `PAGE_SIZE`. They set the cursor only from the first
stream's own length. Two things went wrong:
- Rows from the other streams that fell past the cut were never shown.
- A page could end in the middle of a group of rows with the same timestamp. The next page then skipped or repeated rows.

**Fix.** A new helper, `src/lib/activity/activityPage.ts`
(`mergeActivityPage`), merges the streams in microsecond order.
- It pages when `merged.length > PAGE_SIZE` or when any stream came back full.
- If more rows could share the boundary timestamp, it trims that last group off the page.
- The cursor is the oldest row left on the page.

Both routes use the helper:
- `src/app/api/v1/firm/activity/route.ts` (events and AI runs, including the no-firm path).
- `src/app/api/v1/lawyer/activity/route.ts` (four streams).

**Tests.**
- `src/lib/activity/activityPage.test.ts` pages a fake set of streams to the end. It checks that every row appears exactly once, including ties and microsecond-versus-millisecond timestamps.
- A source contract checks that both routes call the helper and neither still slices to `PAGE_SIZE`.
- The regex in `src/app/api/v1/firm/members/points-usage/route.test.ts` was updated to match.

## 2. Drafter daily limit: section edits do not count; a paid analysis always gets its draft (8bf51aae)

**New migration:** `supabase/migrations/20261108_41_drafter_daily_limit_excludes_sections.sql`.
It re-creates `public.ai_start_run`. The only earlier definition is in
`20261027_10`; the signature, `SECURITY DEFINER`, `search_path = ''` and the
grants are all unchanged. What changes:
- **Section edits are not counted.** The daily count for `legal-drafter` leaves out runs whose `input->>'phase'` is `'section'`. Runs with no phase, or a null phase, are still counted. Other tools are unchanged.
- **The draft after an analysis is never refused for the daily limit.** This applies only when all of the following hold:
  - the request is `phase = 'draft'` with a conversation;
  - that conversation has a succeeded `issues` (analysis) run;
  - it has no draft run yet that did not fail.

  A second draft is counted as before. A retry after a failed draft is allowed.

**Why only the SQL changed.**
- `ai_start_run_with_credit`, `ai_start_section_edit` and `ai_start_free_question` all call `ai_start_run`, so the change reaches all of them.
- The app has no daily check of its own; `runCore` only passes `runtime.dailyLimit` to the SQL.
- The one app change is a comment in `src/lib/ai/tools.ts`.
- The code works the same with or without `_41`. Without it, the old rule still applies.

**Tests.**
- New Docker test `supabase/tests/rls/drafter_daily_limit_1108.test.sql`, with checks T1–T8.
  - It **passes** with `_41`, and also with `_41` applied twice.
  - Without `_41` it **fails at T1**, as it should.
- `drafter_section_edits_1108` and `ai_runs` still pass with `_41`.
- New `_verify.sql` block `drafter_daily_limit_1108`. It shows f/f/t before `_41` and t/t/t after.
- The block is registered in `src/lib/sqlMergeHygiene.test.ts`.

## 3. A read refused for its device spends no quota (6c2e8045)

**Problem.** The proxy (`applyLibraryReadQuota`) spent the read quota for each document. It runs before the route's device check, so a device-refused read still spent quota and could set off the account lock.

**Fix.** The document is now spent in the route, after the device check.
- New helper `src/lib/library/libraryDocQuota.ts` (`spendLibraryDocument`). It keys the document the same way the proxy did (`libraryQuotaTarget`). It answers 423/429 with `Cache-Control: private, no-store`. If anything fails, it lets the read through.
- It is called right after `if (deviceRefusal) return deviceRefusal;` in four routes:
  - `laws/[slug]`
  - `decrees/[id]`
  - `precedents/[slug]`
  - `books/[slug]`
- `scoped-search` gets the same order: tally, then access, then device check, then quota.
- In `src/proxy.ts`, documents still go to the activity tally, then return. The proxy still runs the lock check for searches.

**Rejected alternatives.**
- Skipping the quota when the device cookie is missing: a refused device is given a cookie, and free users get none.
- Calling `library_device_check` from the proxy: that call registers devices and needs the entitlement.

**Remaining effect.** The activity tally (`recordLibraryActivity`) still counts refused reads. It only raises alerts. The automatic lock is in `library_read_quota_hit`, which no longer sees a refused read.

**Test.** `src/lib/library/libraryDocQuota.test.ts`, a source-order contract.

**Gap check.** The proxy used to count every path that `libraryQuotaTarget` maps to
a document: `DOC_ROUTE_RE` is `/api/library/(laws|books|precedents|decrees)/<id>`, and
`canonicalApiPath` only decodes, with no aliases. Those are exactly the four routes
that now spend, so no document read goes uncounted. Every return in those routes
before the spend is an error (400/404/500) that carries no text. A test now
pins `DOC_ROUTE_RE` to the four routes.

## 12. `private, no-store` on every route that can set the device cookie (03aa0ddc)

Every `NextResponse.json` call in the five routes that call `enforceLibraryDevice`
now sends `Cache-Control: TIER_SHAPED_CACHE_CONTROL` (`private, no-store`):
- `laws/[slug]`
- `decrees/[id]`
- `precedents/[slug]`
- `books/[slug]`
- `scoped-search`

The success responses of `books` and `precedents` had no such header before.
`next.config.ts` has no header rule for `/api/library` that could override this.

**Test.** `src/app/api/library/device-cookie-cache.routes.test.ts`:
- It checks that these five routes are exactly the ones that call `enforceLibraryDevice`.
- It reads every JSON response in those routes, error responses included.
- It checks that the device refusal and the quota refusal are also `private, no-store`.

## 4 and 6. Lawyer-only tools (541914ed)

- **4.** In the templates drawer (`src/app/ai/templates/page.tsx`), a non-lawyer whose template points at a lawyer-only tool (`/ai/contracts…`) now sees «اطلب استشارة», which links to `/dashboard/client/consultation/new`. The drawer uses the same rule as `LawyerToolLink`. It shows nothing until the session has loaded.
- **6.** `/ai/consult` (`src/app/ai/consult/page.tsx`) now sends `firm` accounts to `/ai/assistant`, as it already did for `lawyer`. The admin stays on the page.

**Test.** `src/lib/ai/lawyerOnlyScreens.finalReview.test.ts`.

## 5. Protected /ai pages and a null user type: no change

A logged-in account with a null or empty `user_type` is sent to `/onboarding`
before the role check runs (`needsOnboarding`). `/onboarding` has no rule of its
own and is exempt from that gate, so there is no loop. An unknown non-empty type
goes to the fallback `/`. Both behaviours are the same for the protected /ai
pages that already existed (e.g. `/ai/contracts`) and for `/dashboard`. There is
no loop and no dead end, so nothing was changed.

## 8. Sitemap (da6337e9)

`src/app/sitemap.ts` no longer lists the seven lawyer-only pages (the keys of
`LAWYER_ONLY_AI_PAGES`):
- `/ai/analyze-strength`
- `/ai/assistant`
- `/ai/communicate`
- `/ai/contract-drafter`
- `/ai/contracts`
- `/ai/najiz-optimizer`
- `/ai/wargaming`

`src/app/sitemap-tools.test.ts` now asserts that the sitemap lists no lawyer-only page.

**Open question.** Some older pages are still listed even though they send guests to `/login`:
- `/ai/draft`
- `/ai/legal-opinion`
- `/ai/secretary`
- `/ai/fee-calculator`
- `/ai/direction-support`

I left them as they were, because the finding covered only the newly protected pages. `/ai/draft` and `/ai/legal-opinion` are open to every account type and work as public landing pages. Whether the other three should stay listed is a call for the controller or the owner.

## 9. Later reader fetches and the feqh preview (a09b7f0f)

- New helper `deviceRefusalOf(status, body)` in `src/lib/library/readerRefusal.ts`.
- `src/app/book/[slug]/page.tsx`: the block window and the section jump now open the device page when the device is refused.
- `src/app/precedents/[slug]/page.tsx`: "load more", "load before" and the target-window load do the same.
- `src/app/laws/feqh-preview/page.tsx` now shows `LibraryDeviceLimitPage`. Before, it waited forever ("not loaded").
- `laws/[slug]` and `orders` already handled the refusal, since each makes only one fetch.

**Test.** `src/lib/library/readerRefusal.test.ts`: unit tests plus source contracts.

## 13. Live n8n check (read-only, nothing changed)

I listed every workflow on the instance (186) and read the ones that could touch
the NZAMY database. **None reads `decrees_circulars` or any `library` table**,
with the anon key or any other key.

| Workflow (ID) | Active | What it reads |
|---|---|---|
| NZAMY AI tool workflows (legal-drafter read in detail; the others have the same shape) | yes | Webhook, then file download from URLs the app sends, then Gemini, then callback to the app. Retrieval happens in the app; no table reads. |
| NZAMY · AI · schedules (8Skwnqn9WIPOxcml) | yes | Only POSTs to `nezamy.sa/api/v1/cron/ai-sweep`, with the `x-cron-secret` header credential. |
| lib-queries (s8MAOg4WTtt1yIUW) | yes | LLM only. |
| NZAMY · AI Legal Tools (rtj1TC9rd6Ule7am) | no | noOp placeholders. |
| NZAMY · Service Requests (YkvR5SI8ljcSOfuC) | no | Supabase node, credential "nzamy": `profiles` (get by id), `service_requests` (pending_assignment). |
| NZAMY · Admin & Moderation (vOjQdg5CPgO9naa6) | no | Supabase node, credential "nzamy": `service_requests`. |
| NZAMY · Communication (Y8SnEGaXTC3dboGA) | no | Supabase nodes, credential "nzamy": `consultations` (reads `reminder_sent = false`, then updates it), `profiles`. Hearing reminder is a noOp. |
| NZAMY · Onboarding & Verification (5mg451RaFPJXwME4) | no | One Supabase node, credential "nzamy": it **updates** `lawyer_profiles.verification_status` to `verified`. It is reached from a GET webhook `/lawyer-approval`, behind an "If" token check. |
| NZAMY · Billing & Wallet (nLcTncqGZnSKCOoQ) | no | noOp placeholders. |
| RAG SUPABASE LAW -hybrid (GC9ICRKKjwyuAv0V) | no | Postgres credential "dr.j-supabase": its own `documents` table and `hybrid_search()`. |
| RAG SUPABASE LAW copy 2 (QGf0wz2HVO0OIVyk) | no | A Google Drive to vector store template: `documents`, `document_metadata`, `document_rows`. |
| CHAT LAW ebraheem (T1s23SxsQUGp1Knl) | no | Postgres `document_metadata` and `document_rows`, plus an edge function on an old cloud Supabase project (`xfiushrqhituqmcmvozu.supabase.co`), not the self-hosted one. |

**Not checked.** I did not open the "nzamy" Supabase credential, so I cannot
say whether it holds the anon key or the service key. The inactive NZAMY
workflows above that use it read only `profiles` and `service_requests`, never
library tables. No key values were read or printed.

**Side note, outside this finding.** "Onboarding & Verification" is inactive.
If it is ever switched on, its GET webhook can mark a lawyer as verified,
guarded only by the token check in its "If" node (I did not read that node).
It should be reviewed before it is switched on.

---

## SQL run order

| File | When | Check |
|---|---|---|
| `supabase/migrations/20261108_41_drafter_daily_limit_excludes_sections.sql` | **Any time**, before or after the deploy. The code is the same either way. | In `_verify.sql`, block `verify:drafter_daily_limit_1108`: every row must be `ok = t`. |

**Rollback:** re-run section 3 of `20261027_10` (the earlier `ai_start_run`).

No other SQL was added. Findings 1, 3, 4, 6, 8, 9 and 12 change code only and
take effect with the deploy.

## Tests (whole branch at a09b7f0f)

- **Unit tests** (`npm run -s test:unit`): 6461 tests, 6455 pass, **6 fail**. That is the same count as the baseline. The six failures:
  - `grantPurchase keys every grant on the order`
  - `review 2026-10-26: no v1 fallback — the snapshot is read only for an active link with a cookie of its current epoch`
  - `route: the volume series (T28-24) is read only with the TOC, best-effort, and returned as \`series\``
    - This one comes from the checkout, not the code. The global `core.autocrlf=true` checks the file out with CRLF line endings, and the test's `/\n\s*series,\n/` cannot match those. The committed file (LF, at both c2d0ff4b and HEAD) passes the regex.
  - `the end read takes the latest ends_at after now, and any read error means 'start now'`
  - `the insert and revoke policies and the snapshot use the maker rule; the POST route checks it first`
  - `the lawyer dashboard hides the hearings and deadlines cards and the urgent banner from a consultant`
- **Type check:** `npx tsc --noEmit -p .` is clean.
- **Docker tests:**
  - `drafter_daily_limit_1108` passes with `_41`, including `_41` applied twice.
  - The same test fails at T1 without `_41`, as expected.
  - `drafter_section_edits_1108` and `ai_runs` pass with `_41`.

---

## ملخص للمالك

- **سجل النشاط** (للمكتب وللمحامي): كانت بعض الحركات لا تظهر عند الانتقال إلى الصفحة التالية، أو تتكرر. صار السجل يعرض كل حركة مرة واحدة.
- **صائغ المذكرات:**
  - تعديل قسم واحد لم يعد يُحسب من الحد اليومي.
  - من دفع ثمن التحليل يحصل على مذكرته ولو بلغ الحد اليومي.
  - يتطلب هذا ملف SQL واحدًا (`20261108_41`) يُنفَّذ في أي وقت.
- **المكتبة:**
  - القراءة المرفوضة بسبب حد الأجهزة لم تعد تُخصم من حصة القراءة، ولا تؤدي إلى قفل الحساب.
  - صفحات المكتبة التي تتحقق من الجهاز لم تعد تُحفظ في ذاكرة التخزين المشتركة.
  - شاشة "حد الأجهزة" تظهر الآن أيضًا عند تحميل المزيد من النص، وفي معاينة كتب الفقه.
- **أدوات المحامين:**
  - غير المحامي الذي يفتح قالب عقد يرى زر «اطلب استشارة» بدلًا من رابط أداة خاصة بالمحامين.
  - حساب المكتب يُحوَّل من صفحة الاستشارة إلى المساعد، كما يحدث للمحامي.
  - أُزيلت صفحات أدوات المحامين من خريطة الموقع (sitemap).
- **n8n:** فحصنا مسارات العمل دون أي تعديل. لا يوجد مسار يقرأ جداول المكتبة أو التعاميم.
