# Slice D — master guide §3.3 / §3.4 ("restore ~40 genius AI tools") vs main 80ea10ad

Read-only check. Golden = `C:\Users\LOQ\Downloads\حزمة_المبرمج_٢٠٢٦-١١-٠١\01_الذكاء_الاصطناعي_والواجهات_الأصلية\مرجع_الواجهات_الأصلية_المعتمدة_2026-11-01\src\…` (189 files). Live = `D:\nzwt\founder\src\…`. Guide lines read: 146–192.

## 0. Headline findings (read these first)

1. **None of the golden files calls a backend.** Across all of `src/app/ai/**` in the golden package, `grep` finds no `fetch(`, no `/api/`, no Supabase or n8n call, no `useAiRun`. The only exception in the whole package is `src/app/laws/[slug]/_ai-components.tsx`, which is outside this slice. Every golden "result" comes from a `setTimeout` followed by a module constant: `MOCK_RESULT`, `MOCK_REPORT`, `MOCK_VERBATIM`, `INITIAL_ITEMS`, `MOCK_TEXTS`/`MOCK_PRECEDENTS`, `getSmartAnswer()` and similar. Restoring a golden file as it stands puts invented legal output back on the screen.
2. **The golden files are our own pre-honesty-gate files from git, not a separate design.** A diff that ignores CR line endings shows:
   - `compare/page.tsx` matches `a92743a0^` exactly (0 differing lines);
   - `secretary/page.tsx` matches `5230d878^` exactly (0);
   - `monitor/page.tsx` matches `73c3ec35^` exactly (0);
   - `corp/corpmind` differs from `a92743a0^` by 2 lines, `transcriber` by 6, `global` (vs `5173d974^`) by 9, and `analyze-strength` (vs `892c2d1d^`) by 11.

   The owner is asking us to revert the honesty commits.
3. **The owner's own approved documents say these tools stay «قريباً».**
   - The canonical pricing document in this same package (`04_…/وثيقة_التسعير_الكنوني_الشامل_المعتمدة_منصة_نظامي_2026-10-25.md`, line 303), item 40: the 6 tools still being wired (عصارة المرفقات للمحامي، داعم الاتجاه، المترجم، المفرغ الصوتي، المقارن، السكرتير) «تبقى موسومة «قريباً» … حتى اكتمال واجهتها الخلفية الحية» (decision ٢١٦).
   - Owner answer ١١٥ («وضع demo مستحيل في production») is the basis of commits `a92743a0` and `70955f8b`.
4. **The "cut to 1–8 KB" claim is true for only 15 routes.** These were cut deliberately, each with a comment in the file explaining why: direction-support, compare, global, transcriber, legal-translate, secretary, mail-advisor, vault, quick-answer (rewritten, not cut), the lawyer half of analyze, and corp corpmind, clm, compliance, hr and monitor. The guide's other "restore" targets are a different case:
   - **Already the same size as golden:** the 19 gov pages, 4 NGO pages, micro, 6 of the corp pages, templates, smart-inspector, debt-collection and report-generator. Their fake results are hidden at runtime behind `BetaReviewGate` with `reviewScope="legal-data"` (`src/lib/betaConfig.ts:40,92-145`). Production users never bypass it: `isDemoBypass` is always false in Supabase mode (`src/hooks/useUser.ts:524-525`).
   - **Larger than golden, because they were rebuilt as real tools:** wargaming (75 KB vs 45 KB), legal-opinion (310 KB vs 211 KB), procedures (68 KB vs 53 KB) and najiz-optimizer.
5. **Live AI backends today**, with an n8n file in `D:\nzwt\founder\n8n\ai\*.json` and an entry in `src/lib/ai/tools.ts:1128-1385`: communicate, najiz-optimizer, quick-answer, library-assistant, assistant, canvas-card, case-brief, brief-check, wargaming, analyze-strength, contract-drafter, legal-opinion-consult, legal-opinion-letter, contracts-pro and legal-drafter. Every one has `defaultMode: "off"` and is switched on at runtime through `platform_settings.ai_tools` (`src/lib/ai/aiToolsConfig.ts`). No other tool in this slice has a backend.

## 1. Item table

**Bucket key:**
- **A**: needs only UI or routing work and a price constant; the backend already exists.
- **B**: needs a new n8n workflow, prompt, input/output validators, a `tools.ts` entry and a points entry. The golden screen can serve as the input form, but its result view must be rebuilt to read real JSON.
- **C**: the golden screen is pure mock, and a non-AI backend or data store (a table, storage, a mail service or a speech-to-text service) is needed before any honest version can exist.
- **D**: done, or live already matches or exceeds golden.

**Size notes:** sizes are folder totals in KB, golden → live. Live folders still hold the dead fixture siblings on disk (owner decision ٤), so the page file is the real measure. Every golden file the guide names is present in the package; none is absent. The guide says "17 gov tools", but the golden package has 19 gov folders (it adds `contract-reviewer` and `procedure-guide` to the guide's list); live has the same 19.

**Effort:** S = under half a day, M = 1–2 days, L = 3+ days.

### §3.3-أ Strategic tools

| id | Owner wants | Golden → live KB | Live backend? | Status | Evidence (file:line) | Bucket | Effort | Needs |
|---|---|---|---|---|---|---|---|---|
| §3.3a-1 wargaming (unified) | One studio for court/opponent simulation + strength + memo critique; absorb analyze-strength + ScoreGauge; price 150 (or 75) | 44.2 → 82.6 | **Yes**: `wargaming` job, 250 pts | PARTIAL | Real run `src/app/ai/wargaming/page.tsx:926-950`, `tools.ts:1277-1291`, `WAVE4_PRICE=250` `tools.ts:440`. Dead fixtures remain: `MOCK_MEMO_BASE` :99/:285/:313, `runSim()` setTimeout :973-978. Hub label still «١٥–٢٠» `lawyerAiCatalog.ts:332` (owner orders it deleted). No merge with analyze-strength. | A | M | owner decision (price; gauge) |
| §3.3a-1b analyze-strength → into wargaming | Close the standalone route and fold it in | 42.6 → 23.0 | **Yes**: `analyze-strength` job, 250 pts | PARTIAL | `analyze-strength/page.tsx:59-95`, `tools.ts:1293-1306`. Golden `ScoreGauge.tsx` + `data.ts:8-13` show fixed % scores; golden wargaming shows `probability:85` and invents «قرار المحكمة العليا رقم ٣٤١/ق» (golden `wargaming/page.tsx:81-94`). | A | S–M | owner decision (no-% rule ١٩٣) |
| §3.3a-2 direction-support | Full card UI that gathers statutes, regulations, precedents and fiqh supporting the lawyer, on live library RAG; 75 pts | 68.6 → 31.1 (page 41.7 → 2.9) | No | MISSING | ComingSoon `direction-support/page.tsx:36-45`. Cut in `3e2f5db6` (UAT-LIVE-AI-001). Golden page has 7 setTimeouts and renders `MOCK_TEXTS`/`MOCK_PRECEDENTS`/`MOCK_CASES` from `.data.ts`. `.cards.tsx` is still on disk and reusable. Retrieval engine exists (`retrieval.ts`, `retrieval:{laws,principles}` in tools.ts). Nav «قريباً» `navigation.sidebars.legal.ts:103,303`. | B | M (laws + principles) / L (if foreign or "سوابق" beyond the library) | n8n workflow + prompt; points entry |
| §3.3a-3 analyze (+ case-brief) | Single «عصارة المرفقات»: OCR, client audio, interactive text/voice Q&A, hand-off to other tools; 30 / 150 (+5/page) | 105.5 → 80.1 (AttachmentSqueezer 31.5 → 2.5) | **Yes, as `case-brief`** (30/150, files ≤5, ≤30 pages, PDF + images) | PARTIAL | Lawyer half ComingSoon `analyze/_components/AttachmentSqueezer.tsx:32-40`, cut `a92743a0`/`70955f8b`. Live case-brief real: `case-brief/page.tsx:143`, `tools.ts:324-326,1245-1259`; prices match the owner. Golden squeezer = fixed report after setTimeout. No audio: `aiFiles.ts:57-61` accepts PDF and images only. Client half (SmartAnalyzer) is gated `betaConfig.ts:136`. | A (merge) + B/C (audio, interactive Q&A, +5/page over 30) | M (merge) / L (audio) | none for the merge; speech-to-text provider for audio |
| §3.3a-4 compare | Compare two contract/memo versions, legal impact per change, auto-fix; 50 | 49.0 → 44.4 (page 6.2 → 1.4) | No | MISSING | ComingSoon `compare/page.tsx:17-24`, cut `a92743a0`. Siblings `_result-view.tsx`, `_auto-fix-panel.tsx`, `_compare-components.tsx` are still on disk but unimported (`cannedOutputGate.test.ts`). Golden diffs are constants in `_compare-types.tsx`. | B (the text diff can be real and deterministic; AI for impact/fix) | M | n8n workflow + prompt; points entry |
| §3.3a-5 global | Comparative research across foreign/Arab law, treaties, arbitration vs Saudi law; 100 | 77.3 → 4.5 | No | MISSING (by owner's Q154 «قيد الإعداد والربط الدولي») | `global/page.tsx:1-20,27-40`; `globalResearchHelper.ts` deleted in `5173d974`. The golden helper built answers, "official sources" and a confidence % from a local template; the golden UI itself said «لا بحث إنترنت فعلي بعد». Nav «قريباً» (`navigation.sidebars.ts:406,424,444`). No foreign-law corpus exists. | C | L | owner decision (sources); n8n + web-search/corpus; maybe keys |
| §3.3a-6 legal-opinion studio | 6 types: study 750, memo 350, written consult 100, due diligence 2,000 (9 sections), cross-exam 60, letter 50; 3–4-column letter cards, clear prices (Q325) | 211.1 → 310.1 | **Partly**: consult + letter only, **400 pts each** | PARTIAL | `_components/aiOpinion.ts:8-13`, `tools.ts:630-638` (`LEGAL_OPINION_PRICE=400`), `tools.ts:1323-1350`. Study/memo/research/DD/cross-exam go to a human team order (`legal-opinion/page.tsx:435` createServiceOrder). Cross-exam result gated (`page.tsx:731`, `betaConfig.ts:144`). Letter cards already `grid-cols-2 sm:grid-cols-4` (`LetterWorkflow.tsx:317`); price shown is 400 (`LetterWorkflow.tsx:773`); no "4k/5k" string found. | B (4 new workflows) + A (reprice consult/letter) | L | 4 n8n workflows + prompts; points entries; owner decision (consult 400→100, letter 400→50) |

### §3.3-ب Daily assistants

| id | Owner wants | Golden → live KB | Live backend? | Status | Evidence | Bucket | Effort | Needs |
|---|---|---|---|---|---|---|---|---|
| §3.3b-1 transcriber | Session/meeting audio transcription, speaker labels, claims/defences, minutes; 10 pts / 15 min | 33.8 → 1.7 | No | MISSING | ComingSoon `transcriber/page.tsx:24-31`, cut `a92743a0`. Golden shows `MOCK_VERBATIM`/`MOCK_LEGAL` after a timed bar, never reading the file. No audio upload path (`aiFiles.ts:57-61`); no duration-metered price. `SendToDrafterButton` is ready but deliberately unmounted (`transcriber/page.tsx:17-20`). | C | L | speech-to-text provider (keys); n8n; points entry by duration; storage for audio |
| §3.3b-2 legal-translate | Parallel legal translation with Saudi glossary; 50 up to 2,000 words (+10/1,000) | 44.1 → 31.6 (page 14.7 → 1.5) | No | MISSING | ComingSoon `legal-translate/page.tsx:17-26`, cut `a92743a0`. Golden output = constants in `translationData.ts`; live still has `src/constants/translationData.ts` + `src/components/translation/` on disk (glossary reusable). | B | M | n8n workflow + prompt; word-count price fn |
| §3.3b-3 secretary | Daily tasks scheduling, hearing/deadline reminders, priorities, mail/WhatsApp alerts; 5 | 35.9 → 5.9 | No | MISSING | «قريباً» card `secretary/page.tsx:8-27`. Golden `INITIAL_RULES/DECISIONS/ACTIVITY/CHAT` fixtures; its chat promised reminders that never happened. A real deadline radar already exists (Phase 5) and can be a data source. | C | L | SQL migration (tasks/rules); n8n (notify + AI); owner decision on scope |
| §3.3b-4 mail-advisor | Analyse incoming legal/commercial mail, detect traps/implied admissions, draft reply; 15 (client quick message 5) | 24.7 → 1.2 | No | MISSING | ComingSoon `mail-advisor/page.tsx:15-23`. Golden = two invented e-mails + a fake company mailbox address it told users to forward to. Only nav link is `CORPORATE_NAV` (`navigation.navbar.ts:155`, «قريباً»). | B (paste-an-email analyser) / C (real inbox) | M / L | n8n + prompt; points entry; mail infra if inbox |
| §3.3b-5 monitor | Umm al-Qura updates feed (free) + AI impact on subscriber's cases/contracts (15) | 37.3 → 18.5 | **Feed yes** (`GET /api/library/monitor`); AI impact no | PARTIAL | Live feed `monitor/page.tsx:8-15` + `_components/LegislativeMonitorFeed.tsx`, built `73c3ec35` to replace golden `MOCK_UPDATES` (golden = `73c3ec35^`, 0-line diff). Free, as the owner asks. | D (feed) + B (impact) | M | n8n + prompt; points entry |
| §3.3b-6 vault | ONLY letterhead/seal/office identity + the office's own templates feeding drafter/contracts; save free, AI identity 20 (Q328) | 21.6 → 2.0 | No | MISSING | ComingSoon `vault/page.tsx:26-35`. Golden `INITIAL_ITEMS` (six docs nobody uploaded) + `MOCK_LAWYER`. No nav row links it (only `shellContext.ts:165`, `proxy.ts` PROTECTED). The live description also lists company docs (CR, VAT, bylaws). | C | M–L | SQL migration + storage bucket; n8n for AI identity; owner decision (scope) |
| §3.3b-7a quick-answer | Full golden UI; 15 pts, 1 free question/day per individual | 26.3 → 8.2 | **Yes**: `quick-answer`, **20 pts**, lawyer/firm only | PARTIAL | `quick-answer/page.tsx:15-35`, `tools.ts:1185-1197`. Golden = `MOCK_RESULT` + setTimeout (golden :74,:128). No free-per-day mechanism anywhere in `src/lib/ai`. Lawyer sidebar's «سؤال قانوني سريع» points to `/ai/assistant`, the firm sidebar's to `/ai/quick-answer` (`navigation.sidebars.legal.ts:33,263`). | A (UI) + small backend (free quota, price, role for individuals) | M | owner decision (price, roles); maybe SQL for the daily quota |
| §3.3b-7b remove `ungrounded` block for procedural Qs | Answer procedural questions even when no library article is cited | — | — | CONFLICT | `runCore.ts:110,224,582-583` refunds any answer that cites none of the texts sent; `runCore.ts:501-502` (`no_sources`). This is the honesty guarantee itself. | A (narrowly: add المرشد القضائي data as a retrieval source so procedural answers are grounded) | M | owner decision |
| §3.3b-7c assistant | Wire to the lawyer's cases, contracts, documents + library with a Smart Intent Router; 40 pts per session up to 15 messages | 28.5 → 27.3 | **Yes**: `assistant`, library-only, **100 pts / 5 messages** | PARTIAL | `assistant/_assistant-client.ts:1-40`, `tools.ts:255-261,1214-1228` (contexts are labels only: general/case/contract/research). Nothing reads the user's cases or contracts. | A (price) + B (router + private-data retrieval) | L | owner decision (price 100/5 vs 40/15); n8n prompt change; RLS-safe server reads |
| §3.3b-7d consult (individual) | Restore full consult | 23.6 → 25.6 | No: canned «لم يُفعَّل» reply | PARTIAL (UI present, engine missing) | `consult/page.tsx:59-63,211-231`, honest since `4eef59d0`; result gated `:321`. Lawyers are redirected away. Fastest honest path: open the `assistant` tool to `individual`/`micro`/`ngo` with a lay-person prompt. | A/B | M | prompt; roles; points entry |
| §3.3b-8a templates + SmartTemplateModal | Template library + AI customisation; 50 | 53.3 → 53.1; modal 10.0 → absent | No | PARTIAL | Catalog same as golden. It claims «AI-powered» (`templates/page.tsx:78`) and «AI مُحسَّن» on 40 templates (`:297`, `_data.tsx` `isAi: true`) with no AI behind it: a live honesty defect. Golden `SmartTemplateModal.tsx:21-23` = setTimeout(1600) fake; not in live `dashboard/lawyer/documents/`. Only link: `FIRM_NAV` (`navigation.navbar.ts:105`, «جديد»). | B | M | n8n + prompt; points entry |
| §3.3b-8b smart-inspector | "Diagnostic inspector" | 28.4 → 29.2 | No | MISSING (mock, gated) | Mock generator `smart-inspector/page.tsx:50`, setTimeout :122, gate :431. No nav link (sitemap only). Overlaps analyze-strength. | B (or redirect into wargaming/analyze-strength) | M | owner decision (merge vs build) |
| §3.3b-8c debt-collection | Stage advisor for collection and payment orders | 29.0 → 29.5 | No AI. Deterministic notice composer (not fake AI) | PARTIAL | `debt-collection/page.tsx:44-130`. Wording bug: friendly notice says «المبلغ المستحق **علينا**» (we owe them) `:66`. Unsupported claim «يُعدّ سنداً قانونياً معتمداً» `:91`. No nav link. | A (fix copy) + B (AI advisor) | S + M | owner decision (price: «templates» 50?) |
| §3.3b-8d report-generator | Client reports | 13.7 → 14.2 | No | MISSING (mock, gated) | `MOCK_REPORT` `report-generator/page.tsx:57-90`, setTimeout :109, gate :253. Firm sidebar badges it «جديد» (`navigation.sidebars.legal.ts:281`) for a page that never produces a report. | B (reads Phase-1 case tables) | M–L | n8n + prompt; points entry |
| §3.3b-8e procedures (+ `_ai.ts`) | Full page + `_ai.ts`, bound to the المرشد القضائي data package; free | 52.8 → 67.8 | Directory data real; no AI | PARTIAL | Live has courts/circuits/gov-agency/prosecution directories (`procedures/_CircuitsDirectory.tsx` etc.). Golden `_ai.ts` (`getSmartAnswer`) = keyword canned replies with an invented e-mail `c.court.r1@moj.gov.sa`, invented "community votes" and a 97% confidence; removed in `73c3ec35` (`procedures/page.tsx:46-52`). Binding to folder 02 data = another slice. | A (data) / B (AI Q&A at 0 pts) | M | owner decision (a 0-pt AI tool has real model cost) |
| §3.3b-8f najiz-optimizer v5.2 | Rule optimiser free + AI condensation 5–15; upgrade to v5.2 | 21.5 → 23.7 | **Yes**: rules free + `najiz-optimizer` AI at 5 pts | PARTIAL | `najiz-optimizer/page.tsx:18,144,166,220,235` (rules "v5"); `tools.ts:1170-1183`. v5.2 prompt is in the package (`01_…/برومبت_فلتر_ناجز_ومعين_v5.2.md`), not yet applied to `n8n/ai/najiz-optimizer.json`. | A | S–M | n8n prompt update; owner decision (5 vs 15) |

### §3.3-ج Sector suites

| id | Owner wants | Golden → live KB | Live backend? | Status | Evidence | Bucket | Effort | Needs |
|---|---|---|---|---|---|---|---|---|
| §3.3c-1 corp/corpmind | Corporate legal mind | 29.5 → 1.0 | No | MISSING | ComingSoon `corp/corpmind/page.tsx:13-21`, cut `a92743a0` (2-line diff to golden). Golden = 4 invented contracts + same score/risks for any file. `/ai/tracker` redirects here. | C (needs a company contract store) + B | L | SQL; n8n; prompt |
| §3.3c-2 corp/clm | Contract lifecycle | 8.9 → 1.0 | No | MISSING | ComingSoon `corp/clm/page.tsx:12-20`. Golden = 5 invented contracts; buttons had no handler. | C | L | SQL migration (company contracts) |
| §3.3c-3 corp/compliance | Regulatory + zakat compliance | 8.6 → 0.9 | No | MISSING | ComingSoon `corp/compliance/page.tsx:12-20`. Golden = 6 fixed statuses after a timer. | B | M | n8n + prompt |
| §3.3c-4 corp/hr | HR / labour investigations | 9.1 → 1.0 | No | MISSING | ComingSoon `corp/hr/page.tsx:12-20`. Golden answer typed out letter by letter, always the same. | B (reuse quick-answer/assistant engine with an HR prompt) | M | prompt; roles (`corporate`) |
| §3.3c-5 corp/monitor | Sector legislative monitor | 9.1 → 1.7 | **Yes**: same live library feed | PARTIAL (sector filter missing) | `corp/monitor/page.tsx:7-12`. The owner's "cut to 1 KB" is wrong: it is a thin wrapper over the 16.8 KB live feed. | A | S–M | none |
| §3.3c-6 corp/deal-intel | M&A / deal analyser | 54.7 → 55.4 | No | MISSING (mock, gated) | `MOCK_REPORT` `corp/deal-intel/page.tsx:19,32-40,335+`, timers :71,:88, gate :288-523. No nav link. | B | L | n8n + prompt; price (DD 2,000?) |
| §3.3c-7 corp/compliance-monitor | Companies Law compliance | 22.1 → 22.5 | No | MISSING (gated) | gate count 3, no fetch; `betaConfig.ts:120`. Linked unbadged from `FIRM_SIDEBAR:292` and `CORPORATE_NAV:150`. | B | M | n8n + prompt |
| §3.3c-8 corp/risk-assessment | Counterparty risk | 19.4 → 19.8 | No | MISSING (gated) | `betaConfig.ts:125`; no nav link. | B | M | n8n + prompt |
| §3.3c-9 corp/advisor | Deal advisor | 10.4 → 10.6 | No | MISSING (gated) | 2 timers, gate; `FIRM_SIDEBAR:290` and `CORPORATE_NAV:151` unbadged. | B (assistant engine) | M | prompt; roles |
| §3.3c-10 corp/contracts | Corporate contracts | 12.6 → 12.9 | No (but `contracts-pro` is live and allows `corporate`) | MISSING (gated) | 2 timers, gate; `tools.ts:1359` roles include corporate. | A (route to contracts-pro) | S–M | none |
| §3.3c-11 corp/privacy | PDPL checker as its own tool | 7.6 → 7.6 | No | CONFLICT | Page exists, but `proxy.ts:344` redirects `/ai/corp/privacy` → `/ai/corp/compliance` (itself ComingSoon). | B | M | owner decision; n8n |
| §3.3c-12 micro | Small-shop contracts + labour/municipal compliance | 26.0 → 26.6 | No (`contract-drafter` allows `micro`) | MISSING (mock, gated) | `micro/page.tsx:20,107-125` output builder, setTimeout :154, gate :394; `MICRO_SIDEBAR:166` unbadged. | A/B (reuse contract-drafter for contracts; new prompt for compliance) | M | prompt |
| §3.3c-13 ngo/donation-analyzer | Restricted donations, waqf conditions | 12.1 → 12.2 | No | MISSING (gated) | gate; `NGO_SIDEBAR:317` unbadged. | B | M | n8n + prompt |
| §3.3c-14 ngo/governance-checker | NCNP governance checker saved in DB per association (Q337) | 14.0 → 15.4 | No (self-assessment, not AI) | PARTIAL | Honest "nothing saved" notice `ngo/governance-checker/page.tsx:129-131`; fixed checklist `INITIAL_CHECKS` :22-38 (requirements, not fake results). | C-light (table + API) | M | SQL migration |
| §3.3c-15 ngo/report-generator | Transparency/impact reports | 16.5 → 16.8 | No | MISSING (gated) | 2 timers, gate; `NGO_SIDEBAR:318`. | B | M | n8n + prompt |
| §3.3c-16 ngo/volunteer-contract | Volunteer agreements | 22.8 → 24.3 | No (`contracts-pro` allows `ngo`) | MISSING (gated) | 2 timers, gate; `NGO_SIDEBAR:315`. | A/B | M | prompt / roles |
| §3.3c-17 gov/* (19 pages) | 17 tools for judges/prosecution/police/gov counsel | each golden ≈ live (e.g. judgment-weigher 13.6 → 13.8; verdict-drafter 21.8 → 22.2) | No, except `deadline-calculator`, which is real (DB rules + `deadlineEngine`) | MISSING (all gated) | All 19 have `BetaReviewGate` legal-data (`betaConfig.ts:100-118`); timers in 15 of them. `gov/deadline-calculator/page.tsx:9,18-29` is real but still gated. Linked from `GOVERNMENT_SIDEBAR:247-268+` with role badges, not «قريباً». | B (12+ AI workflows); the forms (arrest/detention/investigation/incident) can be honest non-AI composers | L (+ legal review) | owner decision (audience; legal liability); many n8n workflows |

### §3.4 Redirect rules

| id | Owner wants | Live state | Status | Evidence | Effort | Needs |
|---|---|---|---|---|---|---|
| §3.4-1 letter-drafter + communicate → legal-opinion (301) | Both merge into the letters path of legal-opinion | No redirect for either (`proxy.ts:341-347` REDIRECTS; `next.config.ts` redirects block). `communicate` is a **live AI tool** (5 pts, lawyer/firm, `tools.ts:1156-1169`, `n8n/ai/communicate.json`) linked from the AI hub. `letter-drafter` is the **client template composer** (no AI) also hosted at `/dashboard/client/letters` (`letter-drafter/page.tsx:39-46`); no inbound links. | MISSING / CONFLICT | as listed | S (after merge) | owner decision: keep communicate at 5 pts as canonical item 33 says, or fold it into the 400-pt (target 50) letter |
| §3.4-2 analyze-strength + memo-studio → wargaming | Merge both into wargaming | memo-studio already re-exports wargaming (`memo-studio/page.tsx:10`, not a 301). analyze-strength is a separate live job with inbound links from `dashboard/lawyer/cases/[id]/page.tsx`, `services/labor`, `services/lawyers`, `sitemap.ts`. | PARTIAL | as listed | S–M | none (after the wargaming merge) |
| §3.4-3 case-brief → analyze | Unify | No redirect; case-brief is the only working half; analyze's lawyer half is ComingSoon. | MISSING | see §3.3a-3 | S after merge | none |
| §3.4-4 research → legal-opinion | Redirect | Client-side `setTimeout(… 2200)` + `router.replace` (`research/page.tsx:18-21`), not a 301. | PARTIAL | as listed | S | none |

**Status counts (44 rows):** DONE 0, PARTIAL 16, MISSING 25, CONFLICT 3, NOT-CODE 0. The gov/* row covers 19 pages. Some PARTIAL rows contain parts that are already done: the monitor feed, the corp/monitor feed, the case-brief prices and the najiz rules.

## 2. Conflicts

1. **"Restore the golden UI" vs the owner's own approved «قريباً» rule.**
   - Guide line 147: «الأمر التنفيذي الملزم هو استعادة واجهاتها الكاملة من المرجع المرفق … وربطها بمحرك الذكاء الاصطناعي الفعلي».
   - Canonical pricing doc (same package, `04_…/وثيقة_التسعير_الكنوني…2026-10-25.md:303`), item 40: the 6 tools stay «قريباً» … «حتى اكتمال واجهتها الخلفية الحية» (decision ٢١٦).
   - Owner answer ١١٥ (`أسئلة_المالك_المجمّعة_٢٠٢٦-٠٩-٢٥.md:284-287`): demo mode is impossible in production.
   - **Resolution:** restore each screen only together with its backend, never ahead of it.
2. **Wargaming price: four different numbers.**
   - Guide line 152: «150 نقطة للمحاكي الموحد (أو 75 نقطة للتحليل المنفرد) — مع حذف 15–20 القديمة فوراً».
   - Canonical doc item 18: wargaming **75**; item 19: analyze-strength **75**.
   - Live: `WAVE4_PRICE = 250` for both (`tools.ts:440`).
   - Hub badge: «١٥–٢٠» (`lawyerAiCatalog.ts:332`).
3. **Legal-opinion prices.**
   - Guide line 157: consult 100, letter 50, study 750, memo 350, DD 2,000, cross-exam 60.
   - Live: consult **400**, letter **400** (`tools.ts:630-638`, "D4"); the hub label «١٥–٢٠» (`lawyerAiCatalog.ts:333`).
4. **Quick-answer price.** Guide line 168 and canonical item 27: **15** + 1 free/day. Live: **20** (`tools.ts:1192`), no free quota.
5. **Assistant price.** Guide line 168 and canonical item 24: **40 pts / 15 messages**. Live: **100 pts / 5 messages** (`tools.ts:260-261`, "D3").
6. **Najiz price.**
   - Guide line 169: «منقح ناجز القواعدي 0 / التكثيف الذكي 5–15».
   - Canonical item 28: **15**.
   - Live: rules free + AI **5** (`tools.ts:1179`, citing owner ٢١٦: «٥–٨»).
7. **analyze-strength "نسب الكسب" vs owner ١٩٣ (no chance of winning).**
   - Canonical item 19 title «محلل قوة الموقف القضائي ونسب الكسب والمخاطر».
   - Golden `ScoreGauge` and `data.ts` show 0–100 scores; golden wargaming shows `probability` % and «السوابق تدعم الحكم لصالحك بنسبة ٦٨٪».
   - Live deliberately has "no number anywhere" (`tools.ts:434-438`, commit `0c8ba0b8`).
8. **Remove `ungrounded` (guide lines 168 and 319) vs the refund-on-uncited rule** (`runCore.ts:224`). Removing it lets the model answer procedural questions with no source, which is exactly the class of output the platform removed.
9. **communicate → legal-opinion redirect vs canonical item 33**, which keeps `communicate` as its own 5-pt tool. The guide also says «المراسلة السريعة للموكل 5 نقاط» under mail-advisor (line 165).
10. **corp/privacy.** The guide lists it as one of 6 standalone corp tools (line 179); live redirects it to corp/compliance (`proxy.ts:344`).
11. **Vault scope.** Guide line 167 says «حصراً» letterhead + office templates. The live honest copy promises company documents too (CR, VAT, bylaws, `vault/page.tsx:12-14,31`).
12. **"Cut to 1 KB" claims that are wrong:**
    - corp/monitor (a wrapper over the live 16.8 KB feed);
    - wargaming (live 82.6 KB, larger than golden);
    - legal-opinion (live 310 KB vs golden 211 KB);
    - procedures (live larger than golden);
    - gov/ngo/micro/most corp pages (same size as golden).
13. **gov count.** The guide says 17; the golden package and live both have 19.

## 3. Risks

- **Fake legal output, the main risk.** Copying any golden page back as it stands re-introduces invented statutes, precedents, decree numbers, court e-mails («c.court.r1@moj.gov.sa»), a fabricated Supreme Court decision («٣٤١/ق»), win percentages and fake inboxes. It would also fail the existing guards `cannedOutputGate.test.ts`, `navComingSoon.test.ts` and `ngo/honesty.test.ts`.
- **Live honesty defects found during this check (not caused by the owner's list):**
  - templates claims «AI-powered» / «AI مُحسَّن» with no AI (`templates/page.tsx:78,297`);
  - report-generator and quick-answer rows badged «جديد», and gov/ngo/micro/corp-advisor/compliance-monitor rows have no «قريباً» badge, although these pages end at a "not available during beta" card after a fake progress timer (the form and the timer still play);
  - debt-collection says «المستحق علينا» and calls its notice «سنداً قانونياً معتمداً» (`debt-collection/page.tsx:66,91`).
- **Money.**
  - Prices in code contradict the canonical doc in 6 places (Conflicts 2–6).
  - Opening a 0-pt AI tool (procedures Q&A, monitor feed) has an uncapped model cost.
  - Transcription billed per 15 minutes needs duration metering that does not exist.
  - Re-pricing legal-opinion consult 400 → 100 and letter 400 → 50 is a revenue cut that needs the owner to confirm in writing.
- **Security / privacy.** The assistant's "Smart Intent Router" over the lawyer's own cases, contracts and documents must read through the user's own RLS session server-side, never with the service role. Otherwise it becomes a cross-tenant leak.
- **Legal liability.** gov tools draft judgments, verdicts and indictments for judges and prosecutors. Shipping them without a legal-review gate is high risk. The current `BetaReviewGate` legal-data teardown notes (`betaConfig.ts:100-118`) say "after … source validation is live".
- **Broken links if redirects come first.** Redirecting `/ai/case-brief`, `/ai/analyze-strength` or `/ai/communicate` before their live flows are merged would kill three working, paid tools.

## 4. Suggested batches (dependency order)

1. **Batch D0, honesty and price sync (S–M, no SQL).**
   - Remove the false «AI» claims in templates.
   - Fix the debt-collection wording.
   - Badge «قريباً» on gated gov/ngo/micro/corp rows, or suppress their fake timers.
   - Delete the hub «١٥–٢٠» labels.
   - Apply whichever prices the owner confirms (wargaming/analyze-strength, legal-opinion consult/letter, quick-answer, assistant, najiz).
   - Ask the owner to settle Conflicts 2–11 in one message first.
2. **Batch D1, UI on existing backends (bucket A).**
   - Mount the live case-brief flow as the lawyer half of `/ai/analyze`, then 301 `/ai/case-brief` → `/ai/analyze`.
   - Fold the analyze-strength UI into wargaming as a tab (no % gauge), then 301 analyze-strength and memo-studio.
   - Real 301 for `/ai/research`.
   - Route corp/contracts and ngo/volunteer-contract to contracts-pro, and micro contracts to contract-drafter.
   - Enrich the quick-answer UI.
   - Najiz v5.2 prompt and rules.
   - Corp/monitor sector filter.
3. **Batch D2, new n8n tools on library retrieval (bucket B, uses the existing `retrieval.ts` + `runCore` pattern).**
   - direction-support (75), compare (50), legal-translate (50), monitor impact (15), mail-advisor paste-analyser (15).
   - corp hr/compliance/advisor/privacy; consult for individuals (open `assistant` with a lay prompt).
   - templates smart customisation (50).
   - Each needs a workflow JSON, a prompt, validators, a `tools.ts` entry, a points entry and an admin `ai_tools` switch (staff → live).
4. **Batch D3, legal-opinion completion.** Study (750), memo (350), cross-exam (60), due diligence (2,000) as jobs. Due diligence and deal-intel can share one workflow.
5. **Batch D4, tools needing data stores (bucket C, SQL migrations).**
   - vault (storage + table);
   - NGO governance results table (Q337);
   - secretary tasks/rules + notifications;
   - CLM/corpmind company contract store;
   - report-generator over the case tables.
6. **Batch D5, external services.**
   - transcriber (speech-to-text provider + audio upload + duration metering);
   - client audio in analyze;
   - global comparative research (needs the owner's chosen sources, maybe web-search keys);
   - gov suite (needs the owner's audience/liability decision; forms first as non-AI composers, then AI drafters behind lawyer/legal review).
