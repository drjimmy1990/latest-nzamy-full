# Slice B: library (master guide §2, lines 76–119), checked against main 80ea10ad

Code read: `D:\nzwt\founder` (clean main). All paths below are relative to that folder unless they are written in full.
Owner package: `C:\Users\LOQ\Downloads\حزمة_المبرمج_٢٠٢٦-١١-٠١\00_الدليل_الشامل_المنقح_للمبرمج_٢٠٢٦-١١-٠١.md` lines 76–119, plus the decision table rows 299–300.
Context: the library activity monitor is live. Migration `supabase/migrations/20261031_10_library_activity_monitor.sql` added one admin-edited settings row, `library_monitor_settings`, which holds every library cap (owner note `docs/audits/2026-10-31-owner-note-library-monitoring.ar.md`).

## 0. The owner's numbers: settings, code or new model

"SETTINGS" means an admin can type the number into «الأمان والحماية» ← «نشاط المكتبة» ← «الإعدادات» today. No deploy is needed. Every value below is inside both the database CHECK bounds (`20261031_10:60–87`) and the app bounds (`src/lib/library/monitorSettings.ts:56–84`).

| Owner number | Where it lives today | Kind |
|---|---|---|
| §2.1 individual daily surge **90 docs/day** | `daily_docs` (now 220) | **SETTINGS**. Raise `lock_after_refused` first or set it to 0; see Risks R4. |
| §2.1 hourly **"35–120 docs/hour"** | `hourly_docs` (now 120) | SETTINGS, but the owner gave a **range**, not a number. **Owner decision.** |
| §2.1 firm per-seat safety cap **120/day** | `member_daily_docs` (now 400) is per member | SETTINGS as a stop-gap: set it to 120. The real rule is the firm pool (new model). |
| §2.1 weekly pool **200 unique docs / 7 days** | Nothing. `library_read_quota_docs` deletes a user's rows from before yesterday (`20261031_10:338`). | **NEW MODEL** (SQL + code) |
| §2.1 search counter **300/day individual, 600/day firm** | Searches are only tallied approximately, in-process, and flushed every 30 s (`src/lib/library/activityMeterServer.ts:4,15`). They feed review flags and never refuse anything. | **NEW MODEL**: an exact per-day search counter plus a refusal |
| §2.1 firm shared pool **150 × seats / week, 40% daily surge** | No firm pool. No seat count exists for firms (only plan JSON `team_seats`, `20260603_phase1_003_subscriptions_billing.sql:333`). `firm_members` is never written in production (memory). | **NEW MODEL**, blocked on a seat source |
| §2.3-1 **240 requests/hour** | `rule_hour_requests` (now 600) | **SETTINGS** |
| §2.3-1 burst **25 requests/minute** | Not built. The `src/proxy.ts` rate limiter is per IP, not per account. | **CODE** |
| §2.3-2 **60 searches/hour** | `rule_hour_searches` (now 200) | **SETTINGS** (the count is approximate) |
| §2.3-3 **180 unique docs / 7 days**, individual | `rule_week_docs` (now 600) | SETTINGS, but it sums *new-per-day* opens (`library_activity_hourly.docs`, `20261031_10:464`). A law reopened on 3 days counts 3 times. Literal "unique over 7 days" is **CODE**, the same work as the weekly pool. |
| §2.3-3 firm **60% of the library** | Not built | **CODE**, plus an owner decision on what "the library" counts (see C3) |
| §2.3-4 **25 docs/hour for 6 consecutive hours** | `rule_sustained_hours`=6, `rule_sustained_min_docs` (now 30 → 25) | SETTINGS approximates it: the rule counts any 6 busy hours within the last 24 (`20261031_10:465,480`), not consecutive hours. Literal reading = **CODE (S)**. **Unreachable under the new caps** (C1). |
| §2.3-5 **80% of the daily or weekly cap** | `rule_near_cap_pct` = 80, already the default (daily cap only) | Daily part **DONE**. Weekly part waits for the weekly pool. |
| §2.3-6 **night reading off** | `rule_night_on` = false, already the default | **DONE** |
| q393 **auto slow-down + Turnstile** | `flag_action` = 'slow' exists | Slow-down = **SETTINGS**. Turnstile in the library = **CODE + live keys** (Turnstile exists only on auth: `src/components/auth/TurnstileWidget.tsx`). |
| q394 **bell + WhatsApp + e-mail** | Bell built (`library_monitor_notify_admins`, `20261031_10:177`) | WhatsApp/e-mail = **n8n workflow + keys + recipients (owner)** |
| q395 **keep 90 days** | `retention_days` (now 30, max 365) | **SETTINGS**, plus a privacy-policy line (R6) |
| q397 **catalogue-order rule → Turnstile only, no lock** | Not built (owner note says so plainly) | **CODE** (new rule + Turnstile challenge) |
| q362 **24 h automatic lock** | Both automatic lock inserts leave `locked_until` NULL, which means indefinite (`20261031_10:369`, `:518`; column comment `20261030_80:64`) | **CODE + SQL**: a new settings column such as `auto_lock_hours`, read inside `library_read_quota_hit`. Never a new argument or overload. |

## 1. Table

| id | Owner wants | Status | Evidence | Effort | Needs |
|---|---|---|---|---|---|
| §2.1-1 (q365) | Unit = one unique full document per day; reopening is free | DONE | `src/lib/library/readQuota.ts:12–17` (key `law:/book:/precedent:/decree:`); free reopen `20261031_10:355–358`. The window is the Riyadh calendar day, not a rolling 24 h; the owner says «في ذات اليوم», so it matches. | – | none |
| §2.1-2 | Individual: 200/7 d pool, 90/day, 35–120/h, 300 searches/day | PARTIAL | daily/hourly = settings (§0); weekly pool and search cap missing (`20261031_10:338` purges older rows) | L | SQL migration + owner decision (hourly number) |
| §2.1-3 | Firm shared pool 150×seats/wk, 40% daily, 120/seat/day | MISSING | `library_quota_limits` gives each member its own `member_daily_docs` (`20261031_10:241–256`); no seat count | L | SQL migration + owner decision (seat source) |
| §2.2-1 (q390 → ب) | All texts behind the server (incl. principles and the fiqh book), 50 items per batch | PARTIAL | Laws and decrees are server-only. **33 precedent collections (34 MB) are still bundled** as dynamic imports in the fallback at `src/app/precedents/[slug]/page.tsx:316–358` (`src/constants/precedents/*.json`). The book is bundled at `src/app/book/[slug]/page.tsx:636` (`src/constants/sources-of-right-1.json`). Batch sizes: precedents 100 (`precedents/[slug]/page.tsx:60`), search 500 (`:61`), books 80 (`book/[slug]/page.tsx:74`). The law route returns the whole law in one response (`src/app/api/library/laws/[slug]/route.ts:28`, internal 500-row windows). | M (delete the bundles) / L (50-per-scroll for laws) | none (confirm the DB holds all 33 collections + the book first) |
| §2.2-2 (q368–369) | Drop Ed25519/C12; Admin exempt from counters and locks | DONE | No Ed25519 code in `src`; admin exempt at `20261031_10:319–322` and `:449–451` | – | none |
| §2.2-3 (q367) | 1 computer + 1 phone per individual account | MISSING | No device/session code. The Settings security tab says devices cannot be shown (`src/app/settings/components/tabs/SecurityTab.tsx:304`). | L | SQL migration + owner decision (what happens to the 3rd device) |
| §2.2-4 (q375) | Library for micro/NGO/provider only with a documented legal department or a linked licensed lawyer | PARTIAL | All three types are refused today (fail closed): `src/lib/library/libraryPurchaseEligibility.ts:18–21,34–39`. No "documented legal dept" field exists for them. `corporate_profiles.has_legal_dept` exists but is self-declared and user-writable (`20260922_03_lawyer_provider_column_grants.sql:326,366`). | M | SQL migration + owner decision (what proof counts) |
| §2.2-5a (q376) | Free library grant by Admin only | PARTIAL | Direct grant and codes need `entitlements.grant`, super_admin only (`src/lib/auth/staffRoles.ts:140–152`; `src/app/api/v1/admin/library-invitations/route.ts:60`). But **operations** holds `entitlements.decide` and can approve a library request with any 1–3660 days, unpaid (`src/app/api/v1/admin/entitlements/requests/[id]/route.ts:58,220`). | S | owner decision (see C6) |
| §2.2-5b (q378) | Custom duration + custom seats per grant/invite code | PARTIAL | Direct grant takes `durationDays` (`src/app/api/v1/admin/entitlements/grant/route.ts:33`). Codes are fixed at 30 days (`src/app/api/v1/library/invitations/redeem/route.ts:17–24,168`). `max_uses` exists and can stand in for seats (`invitations/_shared.ts:19`). | M | SQL migration (`library.invitations.grant_days`) |
| §2.2-6a (q377) | Free preview 3–5 articles | DONE | `src/lib/library/previewLimit.ts:20–24`: `min(total, max(3, min(5, floor(5%))))`, capped by the admin setting | – | none |
| §2.2-6b (q364, q380) | Hide ALL decree/circular/decision numbers, dates and links from non-subscribers, incl. SSR/JSON-LD | PARTIAL | **Done:** `<head>`/JSON-LD/sitemap built as a guest (`src/lib/library/libraryMetadata.ts:1–24`, `publicDocumentTitle` :187); law catalogue masks `issuing_instrument`/`issue_date_hijri` (`src/app/api/library/laws/[slug]/_official-meta.ts:161–167`); law موجز stripped (`src/app/api/library/init/route.ts:361–363`). **Leaking to guests:** decree reader sends `title`, `ref`, `date`, raw `summary`, `official_url` (`src/app/api/library/decrees/[id]/route.ts:110–139`); catalogue decree rows unmasked (`init/route.ts:83–84,372–378`); search decree hits send `ref`/`date` (`src/app/api/library/search/route.ts:769,812–813`); principles list sends `principle_number`, `decision_number`, `session_date` (`init/route.ts:319`). **Anon key can read `ref`, `date`, `official_url` directly** (`20261019_40_library_decree_preamble_lock.sql:111`). Decree free pages 1–2 carry the number in their text (`src/lib/library/freePages.ts:55–61`). | M | SQL migration (column REVOKE) + owner decision (C4) |
| §2.2-7 (q374, q379) | Library AI (chat + «اشرح لي») = 5 points after a successful answer; keep the anti-bot rate limit | DONE in code / NOT-CODE to switch on | Both call `/api/v1/ai/runs` with tool `library-assistant` (`src/app/laws/[slug]/_library-assistant.ts:1–13,59–66`); price 5 (`src/lib/ai/tools.ts:1199–1212`), `defaultMode: "off"` (`:1209`). | – | ops: switch the tool on in admin |
| §2.2-7 note 21 | Remove the fake fallback at `_ai-components.tsx:294–302` | DONE (owner's line refs are stale) | No `setTimeout(600)`/fake answer left. Both handlers use `askLibrary` (`src/app/laws/[slug]/_ai-components.tsx:113–129,265–282`). «قيد التفعيل» shows only on 423/`not_ready` (`_library-assistant.ts:82`). The «قريباً» at `_ai-components.tsx:394–431` is the community-question feature, not the AI. | – | none |
| §2.2-7 leftover | (implied by "points only") | MISSING | Legacy **free** routes `/api/ai/library-chat` and `/api/ai/explain-article` still exist and charge no points (`src/app/api/ai/library-chat/route.ts:1–60`). They have no UI caller (grep). | S | none |
| §2.2-7 leftover | Library AI obeys the library lock and the activity counter | MISSING | `LOCK_ONLY_POST_PATHS` lists only the two legacy paths (`readQuota.ts:66–70`), not `/api/v1/ai/runs`. A locked reader can still use the library assistant, and `ai_calls` never increments from the live path. | S | none |
| §2.2-8a (q381) | Keep «إظهار الفروق الملونة» | DONE | `src/app/laws/[slug]/_word-diff.tsx:4,58–59`; used at `_article-components.tsx:1012` | – | none |
| §2.2-8b (q383) | «عن هذا الكتاب» folded under the reader | DONE | `src/components/library/LibraryDocumentShell.tsx:18–22` (closed `<details>`) | – | none |
| §2.2-8c (q371) | Print mark: official name + short account id + date/time Asia/Riyadh; no fake phone | PARTIAL | Name + 8-char account ref, no phone: `src/app/laws/components/PrintWatermark.tsx:13–38`. **No print date/time.** | S | none |
| §2.2-8d (q370) | Defer copy traps | DONE (nothing to build) | none in code | – | none |
| §2.2-8e (q362) | Auto lock is temporary, 24 h | MISSING | `locked_until` NULL on auto locks (`20261031_10:369–373,518–520`) | S–M | SQL migration |
| §2.2-8f (q372) | Super admin **and operations** may lift | PARTIAL | Lift needs `settings.write` = super_admin only (`src/app/api/v1/admin/library-security-locks/[id]/lift/route.ts:17`; `staffRoles.ts:143–151`) | S | none |
| §2.2-8g (q373) | Polite lock message as in the report | DONE | `readQuota.ts:184–191`. It should name the end time once locks expire. | S (copy) | none |
| §2.2 "five locks" | "The five server locks" | NOT ENUMERATED | Lines 76–119 never list five. Today's server locks map to: (1) subscription gate + preview, (2) per-day unique-doc cap, (3) hourly cap, (4) security lock after refused attempts, (5) review flags with slow/lock. I did not invent a list; ask the owner if he meant something else. | – | owner decision |
| §2.3 1–6, q392–397 | Six rule numbers and actions | PARTIAL | See §0: 5 SETTINGS, 1 DONE by default, burst/firm/Turnstile/catalogue rule = code | S (settings) / M (code) | n8n workflow + keys (q394), Turnstile keys (q393/397) |
| §2.4-1 | Infinite scroll + virtualization in 50s; successor link next to «ملغى» | PARTIAL | Infinite scroll exists (precedents `:483`, book `:419`), not virtualized, not 50. Laws load whole. Successor shown only in the reader sidebar (`src/app/laws/[slug]/_sidebar.tsx:382–387`, lookup `laws/[slug]/route.ts:105–114`). The catalogue card badge has no link (`src/app/laws/components/LawsTabContent.tsx:356–361`). `supersedes_law_slug` is anon-readable, so the card link is S. The data is mostly empty (memory). | M | none |
| BUG-LIB-01 | No mass `<mark>` / `loadAll()` of 2,323 principles; highlight only the visible window | MISSING | `loadAll` pulls every window on search (`precedents/[slug]/page.tsx:458–478`); string `<mark>` wrapping (`src/app/laws/[slug]/_highlight-html.ts:47`). A server in-document search already exists (`src/app/api/library/scoped-search/route.ts`, `ScopedSearchPanel`), so dropping `loadAll` is mostly rewiring. | M | none |
| BUG-LIB-02 | «لايكون» = «لا يكون» (لا، ما، فيما، مما، ألا) | MISSING | `arabicSpellingVariants` handles alef forms, ة/ه, ى/ي and digits only (`src/utils/normalizeArabic.ts:193–252`) | M | none |
| BUG-LIB-03 | `+` in principles: strip tashkeel in the index, prefixes ال/وال/بال/لل, ignore `(+)`, drop literal `includes(nq)` | MISSING | No prefix expansion and no parenthesis handling (`normalizeArabic.ts:117–127,269+`). FTS is `simple` with no tashkeel folding (memory gotcha). Literal filters on live lists: `src/app/laws/page.tsx:1169,1207,1218,1265,1286` (852 is demo-only). | M–L | SQL migration (tashkeel-folded FTS + reindex) |
| BUG-LIB-04 | One smart search bar with an ⓘ that explains the operators; delete the third in-reader box | MISSING | The reader has `ScopedSearchPanel` (`src/app/laws/[slug]/page.tsx:1091`) **and** the sidebar jump box, which filters text locally with `includes` (`_sidebar.tsx:759–770`; `page.tsx:640–660`). No ⓘ help anywhere. | M | none |
| BUG-LIB-05 | No false «سابق» badge on never-amended laws | MISSING | Every `<details>` in the text becomes `AmendedToggleDetails` (`src/app/laws/[slug]/_article-components.tsx:130–137,295–305`), whose summary prints «سابق» (`:88`) | S | none |
| BUG-LIB-06 | Loader keeps `official_links` + `merged_regulation_details` | MISSING | No such columns on `library.laws` (no migration mentions them). The loader copies the owner's JSONL as-is (`src/lib/library/ownerLoaderTables.ts:56`), so an unknown key would fail the row. Code note: `_official-meta.ts:142` says "(the seeder drops it)". **The seeder must never be run by us**; the owner loads. | M | SQL migration (official_links column-locked from anon per ٣١٨) + the owner's re-export and load |
| BUG-LIB-07 (q382) | Card: one-word «مدمج» + base title + max 2 named subsidiaries + «+ N أخرى» | PARTIAL | Badge text is «📚 ملف مدمج · شامل …» (`src/app/laws/catalogueCardLabels.ts:27–34`). The name helper exists but is unused and waits on data (`:36–57`). | S (badge) + depends on BUG-LIB-06 | BUG-LIB-06 data |

**Counts:** DONE 10 · PARTIAL 12 · MISSING 12 · NOT-CODE 1 (switch on L5) · not enumerated 1. The library-AI row counts as DONE; its switch-on is the NOT-CODE item.

## 2. Conflicts

**C1. The new caps make two review rules dead or noisy.**
- Guide §2.3-4: «25 وثيقة / ساعة لمدة 6 ساعات» = 150 docs. Guide §2.1-2: «سقف الاندفاع اليومي 90». The firm seat cap is 120/day.
- With a 90 (or 120) daily cap, 150 docs in 6 hours cannot happen, so the sustained rule never fires. Also, §2.3-3 (180/7 d) sits between the near-cap alert (80% of 200 = 160) and the pool (200), so three alerts overlap.

**C2. The hourly cap is a range.** «سقف السرعة بالساعة 35–120 مستنداً / ساعة» (§2.1-2). The setting `hourly_docs` takes one number (`monitorSettings.ts:58`). Owner decision.

**C3. The firm's numbers fight each other.**
- §2.1-3 gives a pool of «150 مستنداً × عدد المقاعد». §2.3-3 flags a firm at «60% من المكتبة».
- The library has 386 laws (memory, production facts), so 60% is about 232 docs. A firm with 2 or more seats (pool 300+) is flagged before it uses its own pool. What "the library" counts (laws only? plus decrees, collections and books?) is not defined.
- For a 1-seat firm the 40% surge is 60/day, below its own 120/seat cap, so that cap only matters from 3 seats.

**C4. q380 "hide everything" against earlier owner answers that are now in the code.**
- ٣١٨: «آخر تحديث تشريعي» is the one public date, for everyone (`src/lib/library/lawCardFields.ts:9–14`; `init/route.ts:350–366`; JSON-LD `dateModified`, `libraryMetadata.ts:14–16`). q380 forbids «تاريخ إصدار تفصيلي». Is the public "last legislative update" date still allowed?
- ٢٦٣: the decree موجز for everyone (`init/route.ts:375–377`, «the موجز is for everyone»). Decree summaries carry numbers and are sent unstripped.
- ١٨٣: the first two pages of a decree are free (`freePages.ts:1–8`). Page 1 of a decree is the number and date.
- Is a judicial principle's «رقم القرار»/session date a "decision number" under q380 (`init/route.ts:319`)?
- Should the article text of the free 3–5 preview have embedded «المرسوم الملكي رقم …» references masked? q380 lists title, card, summary and page code, not article text.

**C5. 24 h lock vs the current lock.** q362 asks for «قفل مؤقت (24 ساعة)». The code has `locked_until timestamptz, -- null: until an admin lifts it` (`20261030_80:64`), and both automatic inserts leave it null.

**C6. Admin-only grants vs ٢١٠.** q376: «المنح المجاني للمكتبة محصور بالمدير العام فقط». Owner ٢١٠ gave operations `entitlements.decide` (`staffRoles.ts:143–150`), which approves library requests with free-form days (`entitlements/requests/[id]/route.ts:58,220`). Either drop library requests from operations' queue, or accept that operations can approve an unpaid «طلب».

**C7. Who may lift a lock.** q372: «يحق للمشرف الأعلى وفريق العمليات رفعه». The code requires `settings.write`, which is super_admin only (`library-security-locks/[id]/lift/route.ts:17`).

**C8. Invite-code length.** ٢٠١–٢٠٣ (code always 30 days, `redeem/route.ts:17–24`) vs q378 (custom duration per code). The newer answer wins, but the old one is still the code comment and behaviour.

**C9. Note 21 is stale.** The guide quotes `_ai-components.tsx` lines 294–302 (`setTimeout 600` + «قريباً سيتوفر»). Those lines were removed in 037ddd38. The «قيد التفعيل» he saw live was the tool mode being off (`docs/audits/2026-10-30-owner-package-ai.md:21`, LIVE-F04).

**C10. Batch size.** «التحميل بدفعات 50 عنصراً» vs precedents 100, search 500, books 80, laws whole. The owner also wants infinite scroll *with* virtualization. That conflicts with the in-reader features that need the whole law (jump box, TOC, local filter).

## 3. Risks

- **R1 Money: free AI bypass.** `/api/ai/library-chat` and `/api/ai/explain-article` answer without charging points if `N8N_LIBRARY_CHAT_WEBHOOK_URL` is set on the server. I did not read env values. Delete both routes (q374/379: points only).
- **R2 Security: library AI ignores the library lock.** A locked or flagged account can keep pulling cited library text through `/api/v1/ai/runs` (`readQuota.ts:66–70` misses it). The monitor's AI counter is dead too.
- **R3 Legal/IP: 34 MB of principles plus the fiqh book are downloadable without an account** from public JS chunks (`precedents/[slug]/page.tsx:316–358`, `book/[slug]/page.tsx:636`). Gating does not help; the files and the fallback must be deleted. Before deleting, confirm the database holds all 33 collections and the book, or those pages turn into "not found".
- **R4 Ops: indefinite locks on real readers.** Lowering `daily_docs` to 90 before locks expire, while `lock_after_refused` stays 60, means a reader who keeps clicking after the cap gets a lock that never ends until an admin lifts it. Ship the 24 h expiry first, or set `lock_after_refused` to 0 while changing caps.
- **R5 Deploy order: fail-open.** `parseQuotaRow` returns null for an unknown status (`readQuota.ts:163–168`), and null lets the reader through. If the weekly pool adds a status such as `over_weekly`, deploy the app that knows it **before** the SQL. Adding result columns needs DROP + CREATE of `library_read_quota_hit` (CREATE OR REPLACE cannot change a return type). The `20261031_10` verify step requires exactly one overload (`:676–679`). Keep the same argument list and put new limits in `library_monitor_settings` read by `library_quota_limits`.
- **R6 Privacy (PDPL).** Retention 90 days (q395), plus keeping per-document keys for 7 days instead of 2 (needed for the weekly pool and the "unique in 7 days" rule), is personal usage data. The privacy page needs a line. The guide's §1.2 replaces the privacy page wholesale, so check that his text covers it.
- **R7 Legal: q380 leak via the anon key.** Even with the API masked, `ref`, `date` and `official_url` of every decree are readable with the public anon key (`20261019_40:111`). Masking needs a column REVOKE, then routes reading those columns with the service role, as was done for laws in T28-22.
- **R8 Fake data.** Nothing in this slice asks to restore a mock UI. The «مدمج + 2 names» card must stay data-driven (`mergedFileName` refuses to invent). Do not hard-code subsidiary names until BUG-LIB-06 data lands.
- **R9 Seeder ban.** BUG-LIB-06 asks to change `scripts/seed-library-from-owner.mjs`. Editing is fine; running it is banned (it writes to production via `.env.local`). The owner runs his own load.

## 4. Suggested batches (dependency order)

1. **Settings only (no deploy), after an owner reply on C1/C2/C3:** `daily_docs` 90, `member_daily_docs` 120, `hourly_docs` (his number), `rule_hour_requests` 240, `rule_hour_searches` 60, `rule_week_docs` 180, sustained 6 h × 25, `flag_action` slow, `retention_days` 90. **Set `lock_after_refused` to 0 until batch 3 ships** (R4).
2. **Small code, no SQL (S each):** delete the two legacy AI routes; add `/api/v1/ai/runs` (library tools) to the lock check and the AI counter; print date/time Asia/Riyadh (compute at `beforeprint`, not SSR, because of the SSR cached-date trap); BUG-LIB-05; «مدمج» one-word badge; successor link on the catalogue card; give operations a `library.lock_lift` action (C7); remove library requests from operations if the owner confirms C6.
3. **SQL + code:** `auto_lock_hours` settings column (24) read inside `library_read_quota_hit` (same signature); lock message names the end time. q380 masking: REVOKE `ref/date/official_url` from anon, service-role reads, mask in the decree route, init and search, strip the decree موجز. Do this after the owner rules on C4.
4. **Server-only principles + book (q390-ب) together with BUG-LIB-01:** delete the `src/constants/precedents/*.json` + `sources-of-right-1.json` imports and fallbacks; in-reader search goes to `scoped-search` instead of `loadAll`; windows of 50. Verify DB coverage first.
5. **Search fixes BUG-LIB-02/03/04:** query-side negation and prefix variants, `(+)` parsing, remove literal `includes` filters, one search bar + ⓘ help. Tashkeel folding in the FTS index needs SQL + reindex.
6. **Weekly pool + exact search cap (new model):** keep doc keys 7 days, weekly limit, `rule_week_docs` on unique keys, consecutive-hours sustained rule, 25/min per-account burst. Deploy the app before the SQL (R5).
7. **Firm shared pool:** needs a seat source first (no firm seat data today), then 150×seats, 40% surge, 120/seat, the 60% review rule.
8. **Codes with custom days and seats (q378) + q375 eligibility** (a verified legal-department / linked-lawyer flag for micro/NGO/provider).
9. **Device policy (q367):** a new model on self-hosted GoTrue sessions (1 desktop + 1 mobile, what happens to the 3rd).
10. **BUG-LIB-06 → BUG-LIB-07:** columns (official_links column-locked), loader passes them through, the owner re-exports and loads; then the card shows the names.

Side tracks: q394 WhatsApp/e-mail = n8n workflow + recipient + keys. q393/q397 Turnstile in the library = code + the live Turnstile keys from guide §1.3. Switching on L5 (`library-assistant` mode) is an admin action.
