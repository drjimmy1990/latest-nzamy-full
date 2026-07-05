# NZAMY — QA Test Review Reconciliation & "What We Need"

> **Date:** 2026-07-05 · **Inputs:** the QA tester's production review (`test/README.md`, 52 test cases run against **live nezamy.sa** = pre-our-fixes code), the tester's 10 proposed code modifications (`test/modifications/`), and ~50 bug screenshots (`test/screenshots/`).
> **Method:** every finding + note was extracted, then classified against our committed fixes (`a5b10c3`), the tester's own modifications, and the **current source code** (a verification pass re-checked every uncertain call). 109 distinct findings total.
> **Key framing (at time of writing):** the tester tested **live production**, which then still ran the **old code** — our fixes were committed but not yet deployed. So "FIXED_BY_US" meant *the code is fixed and will show once deployed*.
> **UPDATE 2026-07-05:** the fixes (round 1 `a5b10c3` + round 2 `c7b0867`/`5e23b6c`) are now **deployed** (PM2 reload 18:43). So "FIXED_BY_US" items should now be re-testable on the live site — **pending the 4 DB migrations after `20260629`** (esp. `20260705_lawyer_show_contact.sql`; see [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md)). Re-run the tester's cases against live to confirm.

---

## 1. Executive summary

The tester's review is thorough and high-quality. Reconciled against our work:

| Status | Count |
| :--- | :---: |
| 🔴 Still open (real work remaining) | **37** |
| 🔶 In tester's modifications only (needs merge) | **3** |
| ✅ Fixed by our commit (deploy-pending) | **11** |
| ✅~ Likely fixed by us (verify on deploy) | **11** |
| 🧩 Product / UX decision (owner call) | **26** |
| ⚪ Non-issue / passing / expected | **21** |
| **Total findings** | **109** |

**The single most important finding — and it's ours to own:**

> 🔴 **CLIENT-2.7 (CRITICAL): the developer role-switcher ("منطقة ديمو التطوير") is live on production `/settings`.** It renders unconditionally in `src/app/settings/components/tabs/ProfileTab.tsx` (no env/prod guard), and `demo-accounts.ts` / `test-credentials.ts` / `/demo-login` all ship in the bundle. Anyone can hop between accounts/roles. **This is exactly the "beta teardown" we explicitly deferred — it is the highest-priority remaining work and a launch blocker.**

**What our session already fixed** (deploy-pending) overlaps the tester's review in the right places: the lawyer profile mock + false-verified badge (LAWYER-6-ish), the client↔lawyer request flow + real find-a-lawyer data (E2E-1), the library paywall, and the fabricated my-group billing. **What it did *not* cover** and the tester caught: the dev switcher, contact-info leakage on the public profile, several broken lawyer buttons, the AI tools that still fake output, book-detail crashes, and library search/normalization (our own deferred §7.2).

**The tester's 10 modifications** are a *separate* library-UX change-set (their "Developer Updates July 2026"), not in our `src/`. Four are safe low-risk merges; four need careful merging; **two conflict** with our edits and should not be blindly applied (the judgment page they *built* vs. our "coming soon" gate, and `laws/page.tsx` where we removed the fake-laws fallback).

---

## 2. 🔴 Top priorities (open CRITICAL + HIGH — do these first)

These are the open findings that actually break behavior, leak data, or are security/trust risks. Full list with evidence in §4.

- 🔴 **CRITICAL** · `CLIENT-2.7` — أداة 'منطقة ديمو التطوير' (Dev role-switcher) ظاهرة في الإنتاج — خطر أمني قصوى
- 🟠 HIGH · `AI-3.2` — ربط بطاقات الاشتراك (مكتبة قانونية مستقلة vs محفظة نقاط AI) بحالة الاشتراك الحقيقية من الـ Backend مع حالات مقفلة/نشطة
- 🟠 HIGH · `KN-4` — البحث المتقدم وتطبيع الأحرف (الإثبات↔الاثبات و ١٤٤٤↔1444) — إن لم يعمل فسجّله (P1 #11)
- 🟠 HIGH · `LAWYER-3.5` — 'استشارة جديدة' يوجه لصفحة 'الاستشارة غير موجودة' (توجيه خاطئ)
- 🟠 HIGH · `LAWYER-4.1` — نصوص عربية مشوهة (Mojibake) في بطاقات المهام
- 🟠 HIGH · `LAWYER-6.1` — تسريب بيانات التواصل (جوال/بريد/موقع) في الملف العام
- 🟠 HIGH · `LAWYER-6.3` — أزرار تالفة: 'تصدير PDF' معطل و'تعديل' يوجه لصفحة بيضاء
- 🟠 HIGH · `LIB-19.1` — 🔴 «عفواً الكتاب غير موجود» لأي كتاب عدا rawd-al-murbi / sources-of-right-1
- 🟠 HIGH · `LIB-19.3` — 🔴 «This page couldn't load» — تعطل رندر/Hydration عند بعض روابط الكتب
- 🟠 HIGH · `LIB-4` — شريط البحث والاقتراحات الفورية — تطبيع الأحرف العربية والأرقام الهندية
- 🟠 HIGH · `LIB-5` — البحث الأساسي عبر الأقسام والفرز والصفحات
- 🟠 HIGH · `LIB-KN-4` — البحث المتقدم وتطبيع الأحرف: الإثبات↔الاثبات و١٤٤٤↔1444 (P1 #11)

---

## 3. Prioritized "What we need" roadmap

Combines the tester's open findings, our own deferred items, and the tester's modifications into one ordered plan.

### P0 — Security (launch blocker)
1. **Beta teardown (CLIENT-2.7).** Remove the dev role-switcher from `ProfileTab.tsx` (or hard-gate it behind a non-prod check), remove `/demo-login`, and delete/exclude `src/lib/demo-accounts.ts` + `src/lib/test-credentials.ts` from the production bundle. This is the biggest prod-readiness gap and was on our deferred list.

### P1 — Real bugs (HIGH — broken/wrong/leaky behavior)
2. **Lawyer public-profile contact leak (LAWYER-6.1)** — phone/email/website render publicly (`profile/page.tsx:326-328`). Gate them behind a privacy/consent toggle. *(Our profile fix made the data real + the seal honest, but did NOT hide contact fields.)*
3. **Lawyer "استشارة جديدة" misroutes to "الاستشارة غير موجودة" (LAWYER-3.5).**
4. **Mojibake Arabic in lawyer task cards (LAWYER-4.1)** — encoding bug.
5. **Broken lawyer-profile buttons (LAWYER-6.3)** — "تصدير PDF" disabled, "تعديل" → blank page. Ties to our deferred profile **edit-form UI** (`/dashboard/lawyer/profile/edit` is a dead route).
6. **Book detail broken (LIB-19.1, LIB-19.3)** — only 2 hardcoded slugs resolve ("الكتاب غير موجود" for the rest; `book/[slug]/page.tsx:223/229`), plus a hydration/render crash ("This page couldn't load") on some books.
7. **AI tools fabricate output (KN-1, LIB-11, LIB-23, LIB-25).** `ai/consult`, `ai/assistant`, `ai/analyze`, `analyze-strength`, `brief-check`, `case-brief`, `communicate`, `compare` still return mock results via `setTimeout` + local generators. Gate each honestly ("قريباً") or wire to real n8n. *(Only `api/ai/library-chat` is genuinely n8n-gated.)*
8. **Subscription cards not real (AI-3.2, AI-3.1)** — the manual view-switcher is gone, but `getPlanData()` returns hardcoded usage; wire cards to real subscription state.

### P2 — Library search (our deferred §7.2)
9. **Advanced search + Arabic normalization (LIB-4, LIB-5, LIB-KN-4 / KN-4).** The coupled FTS migration + query normalization (`الإثبات`↔`الاثبات`, `١٤٤٤`↔`1444`) + wiring search beyond the 200-row cap. Risky live-DB DDL — do in a maintenance window on staging.

### P3 — Merge the tester's library-UX modifications (§5)
10. **Low-risk merges:** `FolderCard.tsx` (add/manage-folder buttons — DEV-5), `MyNotesSection.tsx` (list/grid toggle — DEV-6), `DraftDrawer.tsx` (expand/collapse full article text — DEV-2), `precedents/judgment/[slug]/_helpers.ts` (copy-selection — DEV-3).
11. **Careful merges:** `OrdersTabContent.tsx`, `PaywallModal.tsx`, `LawsTabContent.tsx`, `laws/orders/[slug]/page.tsx`.
12. **Decide, don't blind-merge:** the tester **built** `precedents/judgment/[slug]/page.tsx` (+692 lines) that our code gates as "coming soon" — pick one. And `laws/page.tsx` conflicts with our fake-laws removal — cherry-pick only the tester's non-conflicting parts.

### P4 — Persistence + remaining UX
13. **Move drafts/folders/notes off localStorage → DB (DEV-1, LIB-13, LIB-15)** with per-user RLS. This is also our deferred "full SmartFolders API wiring."
14. **UX dead-ends & misc:** contract/letter success screens need a back path (CLIENT-3.1, CLIENT-3.6); lawyer header dead links "نشر في السوق"/"ترقية" (LAWYER-3.3); board not refreshing after add (LAWYER-3.9); research-hub sidebar disappears (LAWYER-3.14); new-tab session loss (CLIENT-2.1); dashboard question text not carried to chat (CLIENT-2.3); settings sidebar overlap (CLIENT-2.6); "رقم النقابة" → "رقم الترخيص" localization (LAWYER-6.2); library in client sidebar (CLIENT-2.5 — **confirm product intent first**; the tester assumed Pro-only, which may be wrong).

### P5 — Product/UX decisions (owner call, not bugs)
26 UX/feature requests (§6) — consultation-flow shortcuts, contract/letter wizard inputs (party-interest, sender capacity, dynamic recipients), the logo asset, the appeal-deadline calculator idea, calendar quick-add, etc. These need **your** product decisions before building.

---

## 4. Still-open findings (full list, by severity)

Real work remaining. `Ref` = our finding id; the Arabic title is the tester's.

### 🔴 CRITICAL

| Ref | Finding | Area | Why still open |
| :--- | :--- | :--- | :--- |
| `CLIENT-2.7` | أداة 'منطقة ديمو التطوير' (Dev role-switcher) ظاهرة في الإنتاج — خطر أمني قصوى | Client / settings | This is the BETA TEARDOWN we explicitly deferred. The demo console in ProfileTab.tsx renders unconditionally (no isSupabase/prod guard found), and demo-accounts.ts, test-credentials.ts and /demo-login are still in the bundle. Highest-priority remaining work. |

### 🟠 HIGH

| Ref | Finding | Area | Why still open |
| :--- | :--- | :--- | :--- |
| `AI-3.2` | ربط بطاقات الاشتراك (مكتبة قانونية مستقلة vs محفظة نقاط AI) بحالة الاشتراك الحقيقية من الـ Backend مع حالات مقفلة/نشطة | الذكاء الاصطناعي والواتساب — بوابات حظر الاشتراكات في الإعدادات | Real subscription-state binding and the library-vs-AI locked/active card split are not implemented in src/ — usage numbers are still hardcoded mock behind a 'backend ready' notice. Genuine backend + UI work remains. |
| `KN-4` | البحث المتقدم وتطبيع الأحرف (الإثبات↔الاثبات و ١٤٤٤↔1444) — إن لم يعمل فسجّله (P1 #11) | ملاحظات معروفة (متوقعة) | Explicitly deferred by us (§7.2, task #8 pending): library search wiring + Arabic FTS normalization migration not done. Real work remains. |
| `LAWYER-3.5` | 'استشارة جديدة' يوجه لصفحة 'الاستشارة غير موجودة' (توجيه خاطئ) | Lawyer / dashboard | Confirmed broken route in current source (no consultations/new page); our commit did not add it. Real work remains. |
| `LAWYER-4.1` | نصوص عربية مشوهة (Mojibake) في بطاقات المهام | Lawyer / kanban tasks | Arabic task-card mojibake is a data-integrity/charset bug not addressed by our commit. |
| `LAWYER-6.1` | تسريب بيانات التواصل (جوال/بريد/موقع) في الملف العام | Lawyer / profile | (At reconciliation) profile fix made data real but did not hide contact fields. **→ FIXED round 2 §4.2 (`5e23b6c`):** the actual public vector — the `/api/v1/lawyers` directory API — now uses an explicit projection that **never returns `phone`/`email`** and **strips `license_number`** unless the lawyer opted in via `show_contact`. (The lawyer's own dashboard page showing their own contact info to themselves is not a public leak.) Requires migration `20260705_lawyer_show_contact.sql`. |
| `LAWYER-6.3` | أزرار تالفة: 'تصدير PDF' معطل و'تعديل' يوجه لصفحة بيضاء | Lawyer / profile | (At reconciliation) edit-form UI was deferred (dead link) and 'تصدير PDF' never wired. **→ FIXED round 2 §4.2 (`5e23b6c`):** the edit-form page (`dashboard/lawyer/profile/edit`) is now built so 'تعديل' resolves; 'تصدير PDF' is now **honestly gated** (disabled + "قريباً") rather than a dead button. |
| `LIB-19.1` | 🔴 «عفواً الكتاب غير موجود» لأي كتاب عدا rawd-al-murbi / sources-of-right-1 | Feqh book detail /book/[slug] | src/app/book/[slug]/page.tsx:208 tries /api/library/books/{slug} then falls back to hardcoded slugs 223('rawd-al-murbi')/229('sources-of-right-1'); any other slug → not-found block (258-268 'عفواً، الكتاب غير موجود'). Root cause = unseeded books table. |
| `LIB-19.3` | 🔴 «This page couldn't load» — تعطل رندر/Hydration عند بعض روابط الكتب | Feqh book detail — render crash | No error boundary / defensive null-handling added to book/[slug]/page.tsx in commit a5b10c3; intermittent hydration/render crash untouched. |
| `LIB-4` | شريط البحث والاقتراحات الفورية — تطبيع الأحرف العربية والأرقام الهندية | Search & autocomplete | This is exactly the deferred item: '§7.2 library SEARCH wiring + Arabic FTS migration'. The normalization tsvector config/migration was NOT added (only 20260701_smart_folder_items_display_cols.sql exists). Search executes but hamza/Hindi-digit equivalence will fail. Real work remains (task #8 still pending). |
| `LIB-5` | البحث الأساسي عبر الأقسام والفرز والصفحات | Search — POST /api/library/search sections + sort + pagination | search/route.ts:57,75,89 uses fts textSearch config 'library.arabic' + range pagination (more built than 'deferred' note implies) but corpus-coverage/normalization completeness is our deferred §7.2 work; STILL_OPEN stands. |
| `LIB-KN-4` | البحث المتقدم وتطبيع الأحرف: الإثبات↔الاثبات و١٤٤٤↔1444 (P1 #11) | Known deferred — advanced search normalization | Confirmed unimplemented: library.arabic FTS config is copy=simple (migration 20260626) with no normalization migration added; autocomplete route explicitly notes raw query is not normalized. Same root as LIB-4/LIB-5 — the deferred §7.2 FTS normalization work. |

### 🟡 MEDIUM

| Ref | Finding | Area | Why still open |
| :--- | :--- | :--- | :--- |
| `AI-1` | توجيه وتصنيف طلبات الواتساب التلقائي بالـ AI — لم يُفحص | الذكاء الاصطناعي والواتساب — التوجيه التلقائي | WhatsApp+AI routing needs n8n webhook + workflow; dispatch.ts inert until env set. App glue present but off. |
| `AI-2` | ميزة «الصوت الذكي»: دمج المفرّغ + المستمع في واجهة تبويبين، وإضافة التسجيل الحي المباشر من المتصفح | الذكاء الاصطناعي والواتساب — الصوت الذكي (Smart Audio) | src/app/ai/transcriber/page.tsx has zero MediaRecorder/getUserMedia and no tabbed/live-record UI (grep empty). Genuine feature build; tester's logic only in their own tree. |
| `CLIENT-2.1` | فتح /ai/consult في لسان جديد يعيد التوجيه للـ login رغم تسجيل الدخول | Client / dashboard | src/proxy.ts only adds a 401 for API prefixes; no page-nav session hydration fix. New-tab SSR/middleware session restore untouched. |
| `CLIENT-2.3` | صندوق 'لديك سؤال قانوني؟' لا ينقل نص السؤال للشات | Client / dashboard | No query-param/state hand-off added between dashboard 'اسأل' input and /ai chat; commit a5b10c3 did not touch this flow. |
| `CLIENT-2.5` | ظهور 'المكتبة القانونية' في قائمة العميل الجانبية (خطأ عزل الأدوار) | Client / dashboard | src/constants/navigation.sidebars.primary.ts:71 still lists المكتبة القانونية → /laws in client primary sidebar with no role gate. |
| `CLIENT-3.1` | مأزق UX بعد صياغة العقد — لا زر عودة للوحة/طلباتي | Client / draft contract | Contract-draft success screen navigation not addressed by the security/paywall/profile commit. |
| `DEV-1` | المسودات/المجلدات/الملاحظات محفوظة في localStorage — يجب ربطها بقاعدة بيانات سحابية (draft_items / folders) مربوطة بحساب المستخدم | تحديثات وتعديلات المطور — مزامنة الذاكرة والمسودة | folders/items POST endpoint exists but SmartFolders.tsx:45-61 still reads/writes localStorage ('nzamy_smart_folders'); draft_items cloud persistence unimplemented. |
| `DEV-4` | هيكلة law-metadata-map.ts لدعم كل الأنواع ديناميكياً، ثم القراءة من جدول law_metadata بالباك إند | تحديثات وتعديلات المطور — البطاقة التعريفية (ميتاداتا المستندات) | src/app/laws/law-metadata-map.ts is map-driven; no law_metadata table binding in src. Backend integration unbuilt. |
| `E2E-2` | تدفق التذكيرات للاستشارات المجدولة (24 ساعة / ساعة واحدة) — لم يُفحص | الاختبارات المشتركة (Combined E2E) — التذكيرات | Reminders depend on n8n; src/lib/n8n/dispatch.ts:22-23 returns {delivered:false} with no network call until N8N_WEBHOOK_BASE_URL set. Untested + functionally inert. |
| `KN-1` | ردود AI الوهمية (setTimeout) يجب استبدالها بحالة «قريباً» | ملاحظات معروفة (متوقعة) | WRONG as FIXED_BY_US: setTimeout mock AI replies persist in client AI pages NOT covered by the n8n flip — ai/consult/page.tsx:200 getMockResponse, ai/assistant/page.tsx:365-367 setTimeout+getMockResponse, ai/analyze-strength/page.tsx:49. dispatch.ts only gates server-side service_request events. |
| `LAWYER-3.14` | اختفاء القائمة الجانبية في صفحة 'المجمع البحثي' | Lawyer / research collector | Research-collector route DashboardLayout-wrapping bug untouched by commit a5b10c3. |
| `LAWYER-3.3` | أزرار تالفة: 'نشر في السوق' و'ترقية الباقة' (Dead links) | Lawyer / dashboard | Header 'نشر في السوق' and upgrade-banner 'ترقية الباقة' dead buttons not part of our commit scope. |
| `LAWYER-3.4` | إسناد القضية لـ'فريق العمل' يظهر لباقة المحامي الفرد (Solo) | Lawyer / dashboard | Plan-aware gating of the 'فريق العمل' dropdown in add-case form untouched by commit a5b10c3. |
| `LAWYER-3.9` | عدم تحديث اللوحة فوراً بعد الإضافة (مزامنة الحالة) | Lawyer / dashboard | Post-mutation state-sync/revalidation on lawyer dashboard not in our commit scope. |
| `LIB-11` | أدوات AI في الشريط الجانبي (LibraryAI): حجب Free + لا رد وهمي setTimeout | Law detail — sidebar AI tools (paid) | WRONG as LIKELY_FIXED_BY_US for the LibraryAI card: n8n dispatch.ts flip does not touch client AI tool components; residual setTimeout+getMockResponse mocks remain in ai/* pages. LibraryAI card's own no-fake-reply state not confirmed. |
| `LIB-15` | إنشاء/تعديل/حذف الملاحظات مع عزل RLS بين المستخدمين | Notes — MyNotesSection CRUD + RLS isolation | Notes still localStorage per deferred scope; no per-user DB persistence/RLS isolation added in commit. Real open work. |
| `LIB-19.2` | 🔴 عدم التمييز بين الوضعي والشرعي («منتهى الإرادات» يظهر «نوع المرجع: وضعي») | Feqh book detail — classification | Data/classification defect in the books seed or DB rows; not addressed by our commit (which touched laws/page.tsx demo removal, not book categorization). Requires correcting seed metadata / DB reference_type. Real open work. |
| `LIB-23` | المحلل الذكي — رفع مرفقات إلى Draft Inbox + تقرير أو حالة «قيد التفعيل» | AI tools /ai/analyze | WRONG as LIKELY_FIXED_BY_US: ai/analyze/_components/SmartAnalyzer.tsx:212 still setTimeout(2200)+buildEvalReport() → fabricated report; AttachmentSqueezer.tsx:117,126 setTimeout stubs. Not n8n-gated. Fake report survives. |
| `LIB-25` | أدوات AI الإضافية: /ai/compare, case-brief, brief-check, analyze-strength, collector, communicate تفتح دون تعطل | AI tools — additional pages | WRONG as LIKELY_FIXED_BY_US: /ai/compare,_result-view.tsx:170 hardcoded Arabic result; case-brief:177, brief-check:68, communicate:66, analyze-strength:49 all setTimeout→canned output. These client pages are NOT covered by the n8n flip; fabricated replies remain. |
| `LIB-KN-1` | ردود AI الوهمية (setTimeout) يجب استبدالها بحالة «قريباً» | Known deferred — AI mock replies | WRONG as LIKELY_FIXED_BY_US: sweep confirms residual setTimeout mock AI replies survive in ai/consult(200), ai/assistant(365-367), ai/analyze SmartAnalyzer(212), analyze-strength(49), brief-check(68), case-brief(177), communicate(66), compare/_result-view(170). n8n dispatch.ts flip is server-side-events only. |

### 🔵 UX

| Ref | Finding | Area | Why still open |
| :--- | :--- | :--- | :--- |
| `AI-2.1` | المفرغ يقتصر على رفع الملفات ويفتقر للتسجيل الحي المباشر | AI / transcriber | Same file: no live in-browser recording exists in our src. TESTER_MOD_PENDING overstates it — the merge/live-record is unbuilt in our tree; correcting to STILL_OPEN (feature request). |
| `CLIENT-2.6` | تداخل وازدواجية القائمة الجانبية في /settings | Client / settings | No settings-layout change to suppress the dashboard sidebar in commit a5b10c3; layout overlap untouched. |
| `CLIENT-3.6` | شاشة نجاح صياغة الخطاب بلا مسار عودة واضح | Client / letter drafter | Letter-generation success screen return-path not addressed; same dead-end class as CLIENT-3.1. |

### ⚪ LOW

| Ref | Finding | Area | Why still open |
| :--- | :--- | :--- | :--- |
| `LAWYER-6.2` | توطين المصطلح: 'رقم النقابة' (مصري) ← 'ترخيص المحاماة/رقم الترخيص' | Lawyer / profile | Label still hardcoded as 'رقم النقابة' at page.tsx:335; localization not part of our commit. |
| `LIB-KN-6` | ترقيم parse-feqh.ts قد يُرجع volume:1 ثابتاً للكتب الفقهية | Known deferred — parse-feqh volume | parse-feqh.ts constant volume:1 not addressed by commit a5b10c3; parser data-pipeline defect remains. |

---

## 5. The tester's 10 proposed modifications

Their separate "Developer Updates July 2026" library-UX change-set — **not in our `src/`**. Recommendation legend: **MERGE** (safe), **MERGE_CAREFULLY** (review the overlap), **SKIP** (conflicts / superseded — decide manually).

| File | What it adds | Recommendation | Risk | Conflicts our edits |
| :--- | :--- | :--- | :--- | :---: |
| `precedents/judgment/[slug]/page.tsx` | Builds a FULL 697-line judgment/precedent reader (TOC, notes drawer, draft cart, folder-add modal, reading mode, print watermark, AI panel, related docs, copy-selection). Renders from DEMO_PRECEDENTS.find(p => p.id === slug) — pure client-side mock data, no API. Implements README dev-update items 2/3 (draft expand + copy-selection) on this page too. | 🔴 SKIP | HIGH | ⚠️ yes |
| `laws/page.tsx` | Tester's version is OLD prod code: reverts to 100% demo-data rendering (FULL_LAWS_SYSTEMS hardcoded 4 fake laws, DEMO_ORDERS/PRINCIPLES/PRECEDENTS/FEQH direct), adds parseHijriDateToValue + Hijri-date sort for laws & orders, propagates precSort to laws/orders tabs, and INJECTS fabricated autocomplete results for the words بطلان/سقوط with hardcoded fake counts ('١,٤٢٠ نتيجة', badge counts ٤٥/٣٢). | 🔴 SKIP | HIGH | ⚠️ yes |
| `laws/components/LawsTabContent.tsx` | Adds a 'Sort results by' bar (relevance/newest/oldest) driven by new precSort/setPrecSort props. ALSO removes useSubscription()/hasLibraryAccess and reverts free-gating to plain sys.free / col.free / book.free (no entitlement check). | 🟡 MERGE_CAREFULLY | MED | ⚠️ yes |
| `laws/components/OrdersTabContent.tsx` | Adds the same 'Sort results by' bar (precSort/setPrecSort props) for the orders/circulars tab, and REMOVES the client-side pagination (page state, 9-per-page slice, page-number controls) so all filteredOrders render at once (parent now pre-sorts via sortedOrders). | 🟡 MERGE_CAREFULLY | MED | no |
| `laws/components/MyNotesSection.tsx` | Implements README item 6: real List-vs-Grid toggle via new layoutType state (list rows vs post-it grid cards), replacing the old flat/grouped viewMode toggle (removes renderGroupedEntries). Also extends getCleanDocumentName/getCategoryInfo/link-prefix to recognise precedent-judgment- and prec-/order-/ord- id prefixes so notes on judgments/orders resolve names + links. | 🟢 MERGE | LOW | no |
| `components/laws/DraftDrawer.tsx` | Implements README items 2 & 3 in the draft cart: adds per-item Expand/Collapse accordion (isExpanded) to reveal full article + exec-regulation text (was line-clamp-1 preview only), and upgrades copy buttons to copy only the user-highlighted selection within the item (new local getSelectedTextWithin with fallbackText) instead of always copying the whole article. | 🟢 MERGE | LOW | no |
| `laws/orders/[slug]/page.tsx` | Order/circular reader changes: (a) adds copy-selection (getSelectedTextWithin gains fallbackText, handleCopyArt passes the article text) — README item 3; (b) mounts <ResearchWorkspace> on the order page; (c) adds a loading spinner state. BUT it also RIPS OUT the /api/library/decrees/[slug] API fetch and reverts to DEMO_ORDERS.find(...) demo-only loading. | 🟡 MERGE_CAREFULLY | HIGH | ⚠️ yes |
| `precedents/judgment/[slug]/_helpers.ts` | Upgrades getSelectedTextWithin with an optional fallbackText param: if the trimmed selection is a whitespace-insensitive substring of the article text it is accepted even when the DOM range check is ambiguous; also accepts selections whose start/end container is inside the target container (not just commonAncestorContainer). Enables reliable copy-of-highlighted-portion — README item 3. | 🟢 MERGE | LOW | no |
| `laws/components/FolderCard.tsx` | Implements README item 5: adds action buttons inside an opened folder card — 'إضافة محتوى للمجلد / Add Content' when the folder is empty, and 'إدارة محتوى المجلد (إضافة / حذف) / Manage Folder Content' when it has items — both calling the existing onManageContent() prop (stopPropagation to avoid card toggle). | 🟢 MERGE | LOW | no |
| `laws/components/PaywallModal.tsx` | Two things: (1) rewrites the 'full' plan pricing/marketing — ٣٠٠ SAR for 3 months (was ٧٩/month), adds ٦٠٠ SAR strikethrough, '50% off + 3 free colleague licenses' features (a promo/pricing change, not one of the numbered dev-updates). (2) Refactors AdvancedSearchModal: simplifies onApplySearch signature to (query) only (drops the section arg) and REMOVES the handleApply logic that scraped values out of sibling inputs via document.querySelector(placeholder), replacing it with a single searchRef.value apply. Adds an NCNP authority option. | 🟡 MERGE_CAREFULLY | MED | no |

> **Two conflicts to resolve deliberately:** (1) `laws/page.tsx` — we removed the fake-laws fallback; the tester's version predates that, so take only their non-conflicting UI parts. (2) `precedents/judgment/[slug]/page.tsx` — the tester built a full 692-line page; our code intentionally gates it "coming soon". Decide whether the judgment feature is ready to ship before adopting their page.

---

## 6. Already handled by our work (deploy-pending) + product decisions + non-issues

**Fixed / likely-fixed by our commit `a5b10c3`** (will show after deploy):

| Ref | Finding | Status | Evidence |
| :--- | :--- | :--- | :--- |
| `E2E-1.1` | دليل المحامين يعتمد Mock Data ثابتة (8 محامين) ولا يجلب المسجلين حديثاً | ✅ fixed | find-lawyer/page.tsx:22,303 getLawyers() → lawyerService → apiGet('/api/v1/lawyers'); route.ts:23-28 queries Supabase profiles JOIN lawyer_profiles WHERE user_type='lawyer' AND verification_status='verified'; on [] renders empty state (639-676), not mock. Deploy-pending on prod. |
| `E2E-1.1` | دليل البحث عن المحامين يعتمد على بيانات ثابتة (Mock Data) في find-lawyer/data.ts — المحامون المسجلون حديثاً لا يظهرون («لا يوجد محامون متاحون») | ✅ fixed | find-lawyer/page.tsx:22,303 getLawyers() → lawyerService → apiGet('/api/v1/lawyers'); route.ts:23-28 queries Supabase profiles JOIN lawyer_profiles WHERE user_type='lawyer' AND verification_status='verified'; on [] renders empty state (639-676), not mock. Deploy-pending on prod. |
| `E2E-1.2` | مشاركة الطلبات عبر localStorage بين العميل والمحامي (آلية محاكاة) | ✅ fixed | clientWorkflowRepository.ts:123-141 repoints listWorkflowRequests to authed /api/v1/service-requests in supabase mode; localStorage path only when NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND !== 'supabase' (line 16). Server-persisted cross-actor flow exists. |
| `E2E-1.2` | مشاركة الطلبات محلياً عبر localStorage للطلبات الموجهة للمحامين (آلية محاكاة التدفق) | ✅ fixed | clientWorkflowRepository.ts:123-141 repoints listWorkflowRequests to authed /api/v1/service-requests in supabase mode; localStorage path only when NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND !== 'supabase' (line 16). Server-persisted cross-actor flow exists. |
| `LIB-1` | تحميل الصفحة الرئيسية وتبويبات المحتوى (Skeletons + /api/library/init, no demo in prod) | ✅ fixed | Tester already passed it live; our demo-fallback removal in src/app/laws/page.tsx makes the prod empty-state honest, matching the checked criterion 'لا تظهر عناصر تجريبية'. No open work. |
| `LIB-16` | صفحة تفاصيل المبدأ القضائي — تحميل من /api/library/precedents/[slug] | ✅ fixed | Route is real and now paywall-gated per our commit (src/app/api/library/precedents/[slug]/route.ts). Basic load was not a reported bug; the security/paywall hardening is committed. Left as verify-not-needed since the load path is standard. |
| `LIB-17` | صفحة تفاصيل الحكم — كانت تجريبية/غير مربوطة بمسار API (يجب مسار أو «قريباً») | ✅ fixed | Confirmed in current source: the page is gated behind an honest coming-soon state instead of fabricating judgment data, exactly the tester/NEXT_STEPS #16 recommendation. Real judgment backend is a future item but the fake-data risk is closed. |
| `LIB-18` | صفحة تفاصيل المرسوم/التعاميم — /api/library/decrees/[id] + فلترة تبويب التعاميم | ✅ fixed | Route exists and now paywall-gated per commit (src/app/api/library/decrees/[id]/route.ts locks pages when !hasFullAccess). Load/filter were not reported bugs; security hardening committed. |
| `LIB-21` | قيود المستخدم المجاني: PaywallModal بعد تجاوز الحد + whitelist يفتح مجاناً | ✅ fixed | Directly closed: our per-item free-limit gating (books/[slug], decrees/[id], precedents/[slug] routes strip locked content and emit paywall metadata based on freeLimit/whitelist). This is the committed §7.3 paywall fix. Verify the modal UX post-deploy but the bypass is closed. |
| `LIB-KN-2` | مسار /precedents/judgment/[slug] قد يكون تجريبياً — مسار أو «قريباً» | ✅ fixed | Already resolved to the honest coming-soon state in current src (see LIB-17). Duplicate of the judgment finding. |
| `LIB-KN-3` | بيانات demo-data*.ts و law-metadata-map.ts يجب أن تظهر حالة فارغة في الإنتاج | ✅ fixed | Our commit removed the inline fake-laws fallback (laws/page.tsx honest [] at L398) and gated DEMO_FOLDERS to [] in prod (SmartFolders.tsx L45-49) behind NEXT_PUBLIC_LIB_DEMO_FALLBACK/NODE_ENV. Prod now shows empty state as required. |
| `AI-3.1` | شريط تبديل الواجهات اليدوي (activePlanView) في تبويب الاشتراكات غير صالح للإنتاج | ✅~ likely | src/app/settings/components/tabs/SubscriptionTab.tsx has no activePlanView toggle (grep empty); single-plan card via getPlanData(userType) + BackendReadyNotice(120). Note: getPlanData returns HARDCODED usage numbers, not real subscription state, so the 'drive cards from real state' sub-request remains. |
| `AI-3.1` | إزالة شريط التبديل اليدوي للواجهات (activePlanView) الذي يعاين باقة المكتبة/AI — غير صالح للإنتاج | ✅~ likely | src/app/settings/components/tabs/SubscriptionTab.tsx has no activePlanView toggle (grep empty); single-plan card via getPlanData(userType) + BackendReadyNotice(120). Note: getPlanData returns HARDCODED usage numbers, not real subscription state, so the 'drive cards from real state' sub-request remains. |
| `DEV-2` | إضافة لوجيك التمدد/الطي (Expand/Collapse accordion) لإظهار النص الكامل للمواد واللوائح داخل DraftDrawer | ✅~ likely | src/components/laws/DraftDrawer.tsx:32,71,167,190,202-203 implements collapsedLaws + toggleLawCollapse + CaretDown/CaretUp accordion. Matches tester's described fix. |
| `KN-2` | مسار /precedents/judgment/[slug] قد يكون تجريبياً — يجب إضافة مسار أو إظهار «قريباً» | ✅~ likely | src/app/precedents/judgment/[slug]/page.tsx (+_helpers.ts,_related.tsx,_sidebar.tsx) present; route not missing. Real-vs-demo data still needs runtime verification. |
| `KN-3` | بيانات demo-data*.ts و law-metadata-map.ts تظهر فقط في dev-fallback؛ الإنتاج يجب أن يُظهر حالة فارغة | ✅~ likely | laws/page.tsx:398 honest [] in prod + DEMO_* lists gated to dev; but demo-data-*.ts files remain and each call-site's prod-empty gating (e.g. line 413 DEMO_ORDERS still rendered) needs per-site check. |
| `LIB-13` | إنشاء مجلد ذكي وإدارة عناصره (POST /api/library/folders + persistence بعد F5) | ✅~ likely | POST /api/library/folders/items + migration exist server-side, but SmartFolders.tsx:51-61,86,96 still persists to localStorage ('API wiring is a follow-up', L45). Persist-after-F5-across-devices only partially closed. |
| `LIB-14` | حذف المجلد والملكية — فحص الملكية على DELETE (IDOR concern #16) | ✅~ likely | New items POST route documents mirroring the DELETE-item ownership check + adds 403 guard; folder-level DELETE handler not directly re-audited this session — verify user_id ownership on DELETE. |
| `LIB-24` | المساعد القانوني — ردود من n8n (N8N_LIBRARY_CHAT_WEBHOOK_URL) أو «قريباً» | ✅~ likely | Library assistant is the one surface actually wired to real n8n: src/app/api/ai/library-chat/route.ts:19,40 returns 'coming soon' when N8N_LIBRARY_CHAT_WEBHOOK_URL unset, else fetches webhook. If the chat UI uses this route it is honest; verify the component calls it (not a getMockResponse). |
| `LIB-26` | إدارة محتوى المكتبة: توحيد التصنيفات مع /api/v1/admin/library + تبديل «العناصر المجانية» فعّال | ✅~ likely | Paywall routes read library_free_items/whitelist via probe (per commit), closing 'toggle does nothing' server-side; admin category-consistency + payments_gateway settings not re-audited — verify LibraryTab end-to-end. |
| `LIB-3` | البطاقات الجانبية: Smart Folders / My Notes / Gamification / Legislative Updates / Recent Sessions | ✅~ likely | SmartFolders.tsx:47-49 gates DEMO_FOLDERS to [] in prod via NEXT_PUBLIC_LIB_DEMO_FALLBACK/NODE_ENV; My Notes/gamification/other widgets not in commit — needs live check. |
| `LIB-6` | البحث القانوني المتقدم — حجب Free عبر PaywallModal وفتحه لـ AI | ✅~ likely | Advanced-search modal paywall gate predates commit; but AI-tier result path depends on deferred search wiring. Verify Free-block/AI-open on deploy. |

**Product / UX decisions (owner call — 26 items)** — not bugs; listed compactly:

- `CLIENT-2.2` — بنر 'احجز استشارة' يجبر على خطوة اختيار 'استشارة' وسيطة مكررة
- `CLIENT-2.4` — اللوجو يظهر كحرف (ن) تجريبي بدل شعار 'نظامي' الرسمي
- `CLIENT-3.2` — عدم اختصار مسار صياغة/مراجعة العقد
- `CLIENT-3.3` — مراجعة العقد لا تطلب 'لصالح أي طرف' (فجوة منطق عمل)
- `CLIENT-3.4` — خيارات 'الموجه إليه' في الخطاب ثابتة ومحدودة بلا 'أخرى'
- `CLIENT-3.5` — فقدان تحديد 'صفة المُرسِل' في الخطاب
- `CLIENT-3.7` — تداخل مفهوم 'التقييم الأولي' مع 'تحليل مخاطر العقد'
- `CLIENT-4.1` — خطوات حجز الاستشارة مكررة (اختيار 'استشارة' ثم 'النوع')
- `LAWYER-3.1` — غياب 'الإضافة السريعة' من تقويم اليوم
- `LAWYER-3.10` — تكرار وتداخل غير منطقي في فلاتر وتصنيفات القضايا
- `LAWYER-3.11` — طلب زر إخفاء/إظهار كارت 'ملخص الإنتاجية' (Productivity toggle)
- `LAWYER-3.12` — ربط 'اسم الموكل' بقاعدة العملاء + إضافة موكل جديد سريعاً
- `LAWYER-3.13` — بطاقات 'راصد التشريعات' غير مرتبطة بالمكتبة الحقيقية
- `LAWYER-3.15` — ازدحام شبكة أنواع العقود (~30 بطاقة) — محترف العقود
- `LAWYER-3.2` — مقترح حاسبة مواعيد الطعن والسقوط داخل محول التاريخ
- `LAWYER-3.6` — إعادة تسمية وتوحيد خدمات العقود ('الصائغ القانوني'، 'محترف العقود'، 'الرأي الفصل')
- `LAWYER-3.7` — سجل الأنشطة والمهام بلا ربط عضوي بقضية/عميل
- `LAWYER-3.8` — إخفاء الميزات التشاركية (LegalMail) عن المحامي الفرد
- `LAWYER-4.2` — غموض وظيفة 'تتبع الوقت' في المهام
- `LAWYER-4.3` — طلب ميزة 'المستمع الذكي' (Smart Listener)
- `LAWYER-5.1` — ربط 'تتبع الوقت' بالفاتورة فقط عند فوترة بالساعة (Billing gating)
- `LAWYER-5.2` — غياب لوجيك هيكلة الاتفاقيات المالية للقضايا
- `LIB-2.1` — «تصنيفات أخرى» تعرض placeholder «قريباً» دون فرز حقيقي
- `LIB-2.2` — طلب حذف فلاتر الفقه الشرعي الفرعية (متون فقهية/شروح وحواشي/موسوعات) من الواجهة
- `LIB-2.3` — طلب إضافة خيار «أخرى» لفلاتر القانون الوضعي الفرعية
- `LIB-2.4` — طلب حذف تبويب «فقه مقارن» بالكامل من شريط تبديل الفقه

**Out of scope (21)** — passing tests, expected behavior, or known non-bugs the tester recorded. No action.

---

## 7. Important caveats from the verification pass

CRITICAL SYSTEMIC CORRECTION (5 findings flipped to STILL_OPEN): The reconciliation over-credited the n8n dispatch flip. src/lib/n8n/dispatch.ts (dispatchToN8n) ONLY gates SERVER-SIDE service_request.* events (EVENT_PATH map: new-request/request-status/request-completed) and returns {delivered:false} until N8N_WEBHOOK_BASE_URL is set. It does NOT touch the CLIENT-SIDE AI tool pages under src/app/ai/*, which still render fabricated output via setTimeout + local mock generators. Verified fabricated-reply surfaces still live: ai/consult/page.tsx:200 (getMockResponse), ai/assistant/page.tsx:365-367 (setTimeout+getMockResponse), ai/analyze/_components/SmartAnalyzer.tsx:212 (buildEvalReport after setTimeout), ai/analyze-strength/page.tsx:49, ai/brief-check/page.tsx:68, ai/case-brief/page.tsx:177, ai/communicate/page.tsx:66, ai/compare/_result-view.tsx:170 (hardcoded Arabic result string). Only src/app/api/ai/library-chat/route.ts is genuinely n8n-gated (honest 'coming soon' when webhook unset) — that is why LIB-24 remains LIKELY_FIXED_BY_US. Corrected: KN-1, LIB-11, LIB-23, LIB-25, LIB-KN-1 → STILL_OPEN.

AI-2.1 corrected TESTER_MOD_PENDING → STILL_OPEN: transcriber live-record/merge is unbuilt in our src (0 MediaRecorder/getUserMedia); tester's 'logic match' is only in their modifications tree, so there is nothing pending-merge that closes it — it is a genuine feature build.

Confirmed FIXED_BY_US (both accurate, deploy-pending on nezamy.sa): E2E-1.1 (find-lawyer reads real verified lawyers from Supabase, mock render path removed — data.ts is now type/shape only, imported as `type Lawyer`), E2E-1.2 (clientWorkflowRepository repointed to authed /api/v1/service-requests in supabase mode). Both gate on NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND==='supabase'; in demo mode they still use localStorage.

Confirmed STILL_OPEN as claimed (spot-checked): LAWYER-6.1 (profile/page.tsx:326-328 phone/email/website still public — profile fix made data REAL and seal honest [verified:false default L63, verification_status-driven L178] but did NOT hide contact fields), CLIENT-2.5 (nav primary:71 library ungated), LIB-19.1 (book/[slug]/page.tsx:223/229 two-slug hardcode + not-found block 258-268).

Nuance flags (not status changes): AI-3.1 — activePlanView toggle IS gone (fix real) but getPlanData() returns HARDCODED usage numbers, so the tester's secondary ask (cards driven by real subscription state) is NOT met. LIB-5 — search/route.ts is more built out than the deferred note implies (fts 'library.arabic' config + Arabic normalize util + range pagination), but corpus coverage/normalization completeness is genuinely our deferred §7.2 work, so STILL_OPEN stands.

BETA TEARDOWN still shipped (per DEFERRED note, confirmed present): src/lib/demo-accounts.ts, src/lib/test-credentials.ts, src/app/demo-login all still in the bundle (client-only, gated off in supabase mode but present). No finding in this batch tracks it directly, but it is the largest remaining prod-readiness gap.

Beyond the requested list I did not find additional misclassifications; the remaining STILL_OPEN/PRODUCT_UX/TESTER_MOD_PENDING verdicts matched the code state on inspection.

---

## 8. Section summaries (tester's own view)

> **Read with the deploy-update banner at the top of this file (2026-07-05).** The paragraphs below are the *reconciliation-time* snapshot (pre-round-2, pre-deploy) — preserved verbatim for comparison. Since then, round 2 (`c7b0867`/`5e23b6c`) shipped and deployed: **LAWYER-6.1** (public PII leak) and **LAWYER-6.3** (edit-form + PDF gate) are resolved, the dev role-switcher (**CLIENT-2.7**) is gated out of prod, and the AI surfaces are review-gated. Where a paragraph says "deferred" or "still leaks" for those items, treat the banner + the §-table UPDATE clauses as authoritative.

**Section 1.** Extracted every distinct finding from the tester's PRODUCTION review across the Client section (اختبارات طالب الخدمة) and the Lawyer section, plus the immediately-following E2E and AI/subscription notes the Lawyer scope bleeds into. IMPORTANT SOURCE DEFECT: test/README.md is corrupted at line 112 — Client item 4's note is truncated and runs directly into '### 3. لوحة التحكم الرئيسية للمحامي' with NO Lawyer section header and NO Lawyer items #1-#2 (lawyer registration + presumably a second item are missing from the file entirely); the recoverable Lawyer content begins at item 3 (dashboard). Totals: 39 findings. By status — STILL_OPEN: 18 (real remaining work), PRODUCT_UX: 15 (owner/feature decisions), TESTER_MOD_PENDING: 2 (AI transcriber Smart-Audio merge + SubscriptionTab plan-state wiring, done only in tester's modifications/ not our src), OUT_OF_SCOPE: 4 (passing tests, expected payment-gate, promotions placeholder). ZERO findings in this scope are FIXED_BY_US — our commit a5b10c3 focused on library paywall, /laws & SmartFolders fake-content, client-workflow IDOR, and lawyer-profile REAL DATA + honest verified seal, none of which map to the specific bugs the tester recorded here. Highest priority verified-in-current-source STILL_OPEN items: CLIENT-2.7 (CRITICAL — dev role-switcher 'منطقة ديمو التطوير' renders UNGATED in ProfileTab.tsx:381 with demo-accounts.ts/test-credentials.ts/demo-login still shipped = the deferred BETA TEARDOWN); LAWYER-3.5 (HIGH — 'استشارة جديدة' links to non-existent /dashboard/lawyer/consultations/new so it 404s as an [id]); LAWYER-6.1/6.2/6.3 (HIGH/LOW — profile still leaks phone/email/website at page.tsx:326-328, still says 'رقم النقابة' at :335, and 'تصدير PDF' + 'تعديل' edit-form are dead — the edit UI is on our own deferred list); E2E-1.1 (HIGH — find-lawyer/data.ts mock 8-lawyer directory still shipped, though monopoly-mode may reframe it); LAWYER-4.1 (HIGH — Arabic mojibake on task persistence). Key files verified: src/app/settings/components/tabs/ProfileTab.tsx, src/app/dashboard/lawyer/profile/page.tsx, src/app/dashboard/lawyer/page.tsx, src/app/dashboard/lawyer/consultations/, src/app/dashboard/client/find-lawyer/data.ts, src/constants/navigation.sidebars.primary.ts.

**Section 2.** Reconciled 21 distinct findings across the E2E 'الاختبارات المشتركة' (3+1), 'الذكاء الاصطناعي والواتساب' (AI-1, AI-2, AI-3.1/3.2), the 7 'ملاحظات معروفة' known-notes, and the 6 'تحديثات وتعديلات المطور' dev-updates. KEY: the tester tested LIVE prod (nezamy.sa) = OLD pre-a5b10c3 code, so several findings are already addressed in our src but not yet deployed. FIXED_BY_US (deploy-pending): E2E-1.1 lawyer directory now reads real verified lawyers via /api/v1/lawyers+Supabase (src/lib/services/lawyerService.ts, src/app/api/v1/lawyers/route.ts); E2E-1.2 client-workflow IDOR retired, repointed to authed /api/v1/service-requests; KN-1 n8n AI replies made inert. OUT_OF_SCOPE (intended/known caveats): E2E-1.3 & KN-7 payments_gateway disabled; KN-5 seed --clean no-op; KN-6 parse-feqh volume:1. LIKELY_FIXED_BY_US (needs verify): AI-3.1 no activePlanView toggle in src SubscriptionTab; KN-2 judgment route exists; KN-3 demo-data gated (partial); DEV-2 DraftDrawer accordion already in src. STILL_OPEN (real work): E2E-2 & AI-1 reminders/WhatsApp need n8n configured+workflows; AI-2 Smart Audio live-recording+two-tab merge unbuilt; AI-3.2 real subscription-state binding + library/AI locked cards (SubscriptionTab still hardcoded mock usage); KN-4 (our §7.2) library search + Arabic FTS normalization deferred; DEV-1 draft/folder cloud persistence still localStorage; DEV-4 law_metadata DB binding unbuilt. TESTER_MOD_PENDING (in test/modifications/src, not merged): DEV-3 getSelectedTextWithin copy-selection, DEV-5 FolderCard manage-content buttons, DEV-6 MyNotesSection List/Grid Post-it toggle. CRITICAL beta-teardown reminder holds: src/lib/demo-accounts.ts and src/lib/test-credentials.ts are STILL PRESENT (gated off in supabase mode but shipped) — the tester even used demo creds client@nzamy.test / lawyer@nzamy.test in E2E-1.3, so those accounts remain live-usable until torn down.

**Section 3.** Extracted 41 distinct findings from the tester's PRODUCTION library section (فحص المكتبة القانونية وأدوات الذكاء الاصطناعي, cases 1–30 + the 7-row known-deferred table). The tester tested LIVE prod = pre-fix code, so I classified each against commit a5b10c3 and current src. SUMMARY BY STATUS: FIXED_BY_US (6): judgment page now DashboardComingSoon (LIB-17/KN-2 confirmed in src/app/precedents/judgment/[slug]/page.tsx); per-item free-limit paywall on books/[slug], decrees/[id], precedents/[slug] routes (LIB-16/18/21); demo-data/law-metadata prod empty-state via laws/page.tsx L398 honest [] + SmartFolders DEMO_FOLDERS gated to [] in prod (LIB-1, KN-3). LIKELY_FIXED_BY_US / needsVerify (11): the AI-tool surfaces (LIB-11/23/24/25, KN-1) rely on our inert-until-configured n8n dispatch flip but weren't swept for residual setTimeout mocks; smart-folder items backend (POST /api/library/folders/items + migration) is committed but SmartFolders front-end still uses localStorage (LIB-13); DELETE-folder ownership IDOR (LIB-14) is referenced as mirrored but not re-audited; admin free-items toggle now has real server effect (LIB-26); advanced-search paywall + side widgets (LIB-6, LIB-3). STILL_OPEN — real work remains (8): Arabic FTS normalization for search/autocomplete (LIB-4/5, KN-4) — confirmed the library.arabic tsvector config is copy=simple with NO normalization migration (only 20260701_smart_folder_items_display_cols.sql exists), and autocomplete/search route.ts comments admit raw un-normalized queries; the entire §7.2 search wiring is task #8 (pending). The 🔴 book bugs are all open: book/[slug] hardcoded two-slug fallback + 'عفواً الكتاب غير موجود' for non-seeded books (LIB-19.1, cause = empty books DB), وضعي/شرعي misclassification of منتهى الإرادات (LIB-19.2, seed/parse-feqh KN-6), and the 'This page couldn't load' hydration crash (LIB-19.3); Notes cloud persistence + RLS (LIB-15). PRODUCT_UX (4): the four filter modification requests in case 2 (remove feqh sub-filters, add وضعي «أخرى» option, remove فقه مقارن tab, 'Other' coming-soon). OUT_OF_SCOPE (12): expected payments-gateway disabled state, seed-tooling caveat, and reader-feature QA items not touched by our commit. TOP PRIORITIES for a 'what we still need' list: (1) Arabic FTS normalization migration + search corpus wiring (§7.2, blocks LIB-4/5/6/KN-4); (2) the three book-reader bugs LIB-19.1/2/3 (seed real books, fix classification, add error boundary); (3) sweep AI surfaces for residual setTimeout mocks; (4) confirm DELETE-folder ownership guard (LIB-14) and wire SmartFolders/Notes front-end to the DB (LIB-13/15).

---

*Provenance: reconciliation by a 5-agent workflow (3 section extractors + a modifications analyzer + a code-verification pass), ~637K tokens, every uncertain classification re-checked against current source.*
