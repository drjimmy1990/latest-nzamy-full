# Slice C: AI architecture (§3.1), studios and sharing (§3.2), collector, forms, uploads and telemetry (§3.5)

- **Sources:** master guide lines 122–145 and 194–198, the motion spec, Najiz filter v5.2, the golden README plus 189 golden files, and the 21 live-test screenshots.
- **Code checked:** `D:\nzwt\founder` (main 80ea10ad).
- **Paths:** unless a path says otherwise, it is under `D:\nzwt\founder\`.
- **Golden root:** `…\01_الذكاء_الاصطناعي_والواجهات_الأصلية\مرجع_الواجهات_الأصلية_المعتمدة_2026-11-01\` (called "golden/" below).

---

## 0. The headline finding: where the "golden" files come from

**The golden set is the old mock UI.** 188 of the 189 golden files are byte-identical to the repository's **Initial commit `5a6a7242` (2026-06-03)**, ignoring CR/LF. The only exception is `src/app/laws/[slug]/_ai-components.tsx`. This was checked file by file with `git show 5a6a7242:<path>` and `cmp`.

Taken together, the golden set is the pre-audit mock UI that the honesty passes later removed. It is not a lost, better build:
- **75 of 189 files** contain mock markers (`MOCK_*`, `Math.random`, or `await new Promise(r => setTimeout(...))` used as an "AI" delay).
- **188 of 189 files** make no network call at all: no `fetch`, `/api/`, `supabase` or `useAiRun`.

The files in this slice:

| Golden file | Golden size / lines | Live size / lines | Mock content in golden | Live state and the commit that cut it |
|---|---|---|---|---|
| `src/components/draft/DraftPreStep.tsx` | 28.9 KB / 459 | 9.9 KB / 168 | `MOCK_PARAS` at :21, a 2,800 ms fake scan at :90 | Cut by 60da404b (2026-08-16) and 1e7a17d6. The card now links to the real `/ai/brief-check`, see DraftPreStep.tsx:63-65 and :115-117 |
| `src/components/draft/steps/StepApproval.tsx` | 28.5 KB / 453 | **deleted** | `Math.random` token and passcode at :231-232, a fake "AI explanation" timer at :238, `MOCK_DRAFT` at :445 | Deleted by **a92743a0** (2026-10-18). Its message reads "unimported draft StepApproval panel", and the commit cites **owner answer ١١٥** |
| `src/app/ai/share-history/page.tsx` | 15.8 KB / 261 | 1.4 KB / 28 | `MOCK_DOCS` at :25 | Replaced by ComingSoon in a92743a0. proxy.ts:343 also redirects the route to /settings |
| `src/app/dashboard/lawyer/cases/[id]/sharing/page.tsx` | 24.7 KB / 573 | 1.1 KB / 19 | "Mock data" `SHAREABLE_ITEMS` at :54-56 | Replaced by ComingSoon in 41007a5c (2026-07-06), because the toggles saved nothing |
| `src/app/share/[token]/page.tsx` | 14.6 KB / 247 | 6.9 KB / 137 | Accepts **any** 6 digits on the client (golden :34-41); fake approve and notes actions (:44-51) | Rewritten in c15da9e4 (2026-09-05) to call the real `POST /api/v1/share/[token]/verify` and return a signed URL |
| `src/app/ai/contract-drafter/_components/contractTemplates.ts` | 10.7 KB / 339 | **deleted** | Local string templates behind a fake 1.8–2 s "AI" delay (golden page.tsx:70 and :90-91) | Deleted in b1d5d500 when L11 became a real n8n job |
| `src/components/contracts/steps/draft/StepReview.tsx` | 21.2 KB / 414 | 12.4 KB / 261 | Canned `PROPOSED_FIXES` at :133 and a fake scanning `setInterval` at :184 | Stripped in 2aba0438. The comment is at StepReview.tsx:27-30 |
| `src/components/draft/steps/WargameSection.tsx` | 30.5 KB / 491 | same file still on disk | `MOCK_POINTS` at :36, a timer at :267 | Not imported by the live wizard |
| `src/components/draft/steps/StepAnalysis.tsx`, `StepLaws.tsx`, `StepReview.tsx` | ≈ live sizes | still on disk | `MOCK_ANALYSIS`, `MOCK_LAWS`, `MOCK_EXTRA_LAWS`, `MOCK_WARGAME` | Not visible to users: draftConstants.ts:16-28 |
| `src/components/contracts/steps/draft/StepDrafting.tsx` | 28.5 KB | 30.8 KB, on disk, unreferenced | A hard-coded `TRANSLATIONS` and `DUAL_HEADERS` phrase book (live :29-86), not AI | Not mounted. The live page uses the real `StepGenerate` instead |
| `src/hooks/useDraftState.ts`, `useContractsState.ts` | 8.7 KB / 5.6 KB | 13.9 KB / 17.5 KB | — | Live is larger: it now has the real order and upload wiring |
| collector (3 files) | 50 KB | 75 KB | — | Live is **larger**. The golden copy is older, so there is nothing to restore |

> **Trap:** the draftConstants.ts:17-20 comment calls the reversal "a one-line reversal" back to 8 steps. Flipping it would put `MOCK_ANALYSIS`, `MOCK_LAWS` and `MOCK_WARGAME` in front of users as AI output. **Do not do it.** Every "restore" below means rebuilding the screen on real AI output (n8n, `ai_runs`), not copying the golden file.

---

## 1. Item table

### §3.1: one architecture for live generation

| id | What the owner wants | Status | Evidence (file:line) | Effort | Needs |
|---|---|---|---|---|---|
| §3.1-1 NOTE-22 | No tool may become a forced "the team will write it" ticket. AI generates at once; signed lawyer review is a separate, optional, paid add-on | **PARTIAL** | Done for lawyers and firms on the drafter: src/app/ai/draft/page.tsx:44-47 (`aiOpen` = lawyer/firm/admin), and the team review is optional at :209-220. Still a forced team order:<br>• individuals and corporate on `/ai/draft` (page.tsx:225-236, `StepSubmit variant="order"`)<br>• the specialist modes arbitration, notary, report and minutes (draftKinds.ts:9-11)<br>• contracts **review** mode (src/app/ai/contracts/page.tsx:26-30 and :411-423, copy: "a human order")<br>• full memo revision (src/app/ai/brief-check/page.tsx:4-35; only the 200-point gap report is AI)<br>contract-reviewer and contract-negotiator still hold `MOCK_RESULT` behind BetaReviewGate (contract-reviewer/page.tsx:39 and :143-144; contract-negotiator/page.tsx:36 and :126-127; betaConfig.ts:40 `BETA_REVIEW_MODE = true`) | L | n8n workflows (contract-review, negotiator, specialist modes) + owner decision (roles and prices) |
| §3.1-2 q335 | Every AI tool open to any registered user with enough points. No Pro gate | **PARTIAL** | The Pro gate is applied to every retrieval tool in src/app/api/v1/ai/runs/route.ts:33-44 (`libraryAiAccess`, which src/app/api/ai/_libraryAiAccess.ts:1-34 describes as the **library paywall guard**). That covers quick-answer, library-assistant, assistant, canvas-card, legal-opinion-consult and legal-drafter (tools.ts:1195, 1210, 1225, 1241, 1335, 1384).<br>Roles are limited to `["lawyer","firm"]` on communicate, najiz, quick-answer, assistant, canvas, case-brief, brief-check, wargaming, analyze-strength and legal-drafter (tools.ts:1161, 1175, 1190, 1219, 1236, 1250, 1266, 1282, 1298, 1374).<br>The drafter header shows a "PRO" badge (draft/page.tsx:115) | M | Owner decision (which account types) + a paywall fix first (see Risks R1) |
| §3.1-2b | Atomic `ai_start_run`, then charge, then automatic refund through `ai_fail_run` on any failure | **DONE** | supabase/migrations/20261027_10_ai_runs.sql:94-171 (one transaction: limit, key, insert, debit) and :179-248 (refund to the original lots); runCore.ts:152-158 and :401-417; cron `ai_sweep_runs` at :251-275. The law reader also goes through it now (src/app/laws/[slug]/_library-assistant.ts:4 and :56, tool `library-assistant`). The legacy `/api/ai/library-chat` and `/api/ai/explain-article` routes still answer if called directly, with no charge, but no screen calls them (grep found comments only). Wording difference: the charge happens **at start** and is refunded on failure, not "after success". The net effect for the user is the same | — | none |
| §3.1-3 | Dual-Mode Release Gate plus a per-tool `tool_release_policy` switch. Admins always see output. Clients get "instant" or "background generation + quick approval gate" with a WhatsApp + bell + email alert to admins | **PARTIAL** | The switch exists as `platform_settings.ai_tools` with modes off/staff/review/live (src/lib/ai/aiToolsConfig.ts:1-38), plus an admin UI (src/app/dashboard/admin/ai-usage/page.tsx:46 and :170-172).<br>"review" stores the result and hides it from the user (runCore.ts:226; api/v1/ai/runs/route.ts:129; runs/[id]/route.ts:40). Missing:<br>• no **release or reject action** anywhere: admin/ai-runs/route.ts:26 has only GET and does not select `output` (:55-56)<br>• no admin alert<br>• `ai_sweep_runs` sweeps only `running` (migration :263), so a `review` run is charged and never released or refunded<br>• **admins are blind too:** `review` is set from `runtime.mode` alone with no `isAdmin` check (runCore.ts:564 and :626), and runs/[id]/route.ts:40 nulls the output for any `review` row. That breaks the owner's first rule, «للأدمن: يظهر الناتج 100% دائماً» ("for the admin, the output always shows 100%") | M | SQL migration (release/reject RPC with refund) + n8n or WhatsApp keys for the alert |
| §3.1-4a | Prompts only from the "منقح البرومبتات (السعودية)" repo | **NOT-CODE** | Every live prompt is hand-written inside n8n/ai/workflows.mjs (for example NAJIZ_BUILD at :100-115). That repo is not in the workspace (searched D:\DEV\projects and the repo) | L | Owner must hand over the repo; then port the 16 workflows |
| §3.1-4b | Najiz and Moeen filter v5.2 | **CONFLICT** | See Conflict C4 for the details | M | n8n workflow + owner decision on limits |
| §3.1-4c | A retrieval layer with an interface ready for GraphRAG | **PARTIAL** | Retrieval is already injected: `StartRunDeps.retrieve`/`libraryAccess` (runCore.ts:75-93, used at :471-510). src/lib/ai/retrieval.ts is FTS ranking, with no graph | S (formal interface) / L (real GraphRAG) | none now |

### §3.2: drafting studios and client sharing

| id | What the owner wants | Status | Evidence | Effort | Needs |
|---|---|---|---|---|---|
| §3.2-1a | Restore the 459-line DraftPreStep with the colored 5-dimension memo checker (200 points, `/ai/brief-check`) | **CONFLICT** | Golden DraftPreStep.tsx:12-48 is `MOCK_PARAS` with a fake scan (:90). Live card B links to the real tool (DraftPreStep.tsx:115-117).<br>The live `brief-check` job charges 200 points (tools.ts:392). Its findings carry `severity/location/issue/fix` (tools.ts:415-428), with **no dimension tag and no paragraph quote**, so the 5-axis colored view cannot be fed honestly yet | M | n8n (add `dimension` and `quote` to the brief-check output) + UI |
| §3.2-1b | The full 8-stage drafter wizard (Identify → Approval) | **PARTIAL** | Users see 3 steps (draftConstants.ts:16-28). The real AI is 2 runs:<br>• **issues**: editable issues, defenses and requests in StepAiDraft.tsx:174-215<br>• **draft**: sections and requests in tools.ts:957-1112<br>Steps 3–8 on disk are mock (StepAnalysis.tsx:11, StepLaws.tsx:10 and :26, StepReview.tsx:16-19) | L | n8n (laws list from `source_ids`, per-stage outputs) |
| §3.2-1c | MemoBlock + RevisionPanel: edit, approve and comment by text or voice on every paragraph and defense | **MISSING** | No `MemoBlock` in src. `RevisionPanel` exists only for team orders (src/app/ai/orders/[id]/_components/RevisionPanel.tsx). The draft output is already split into `sections[{heading,body}]` (tools.ts:1094-1104), which is the natural MemoBlock unit | M–L | n8n "revise one section" tool + owner decision on its price |
| §3.2-1d | WargameSection inside the drafter | **PARTIAL** | The component is mock (WargameSection.tsx:36 and :267). A real `wargaming` job exists (250 points, tools.ts:440 and :1278-1290; /ai/wargaming) | M | Owner decision (does the drafter price include it?) |
| §3.2-1e | StepApproval (453 lines): multi-client share, 6-digit passcode, WhatsApp and email, text/voice/AI explanation note, Najiz gate | **MISSING** | Deleted in a92743a0. The golden copy is not restorable as it stands: `Math.random` token and passcode, never stored (golden :231-238). The real backend shares only **uploaded attachments** (src/app/api/v1/share/route.ts:1-24; hashed `document_shares`). Nothing shares an `ai_runs` output, and no table stores client approval or comments | L | SQL migration (share an AI output or saved doc + `share_feedback`) + owner decision (WhatsApp sending) |
| §3.2-1f q324/q333 | Drafter prices: claim **200**, reply 500, appeal 1,000, cassation and petition 1,500. Delete the old "15 points" | **CONFLICT** | The live claim is **500** (src/lib/ai/draftKinds.ts:16), and reply, rejoinder, supplementary and closing are 500 (:17-20). Appeal 1,000 and cassation/petition 1,500 already match (:21-23). The stale line is in src/constants/pricing/pricing.lawyers.ts:33 ("صياغة المذكرات واللوائح: ١٥ نقطة") | S | Owner decision for rejoinder, supplementary and closing (not priced in the guide) |
| §3.2-2a q326 | Individuals' contract drafter restored with contractTemplates.ts: 500 points for everyone, with a plan discount for subscribers | **PARTIAL / CONFLICT** | The real L11 AI job is live at 500 (tools.ts:577 and :1309-1318; contract-drafter/page.tsx:65 `useAiRun`). contractTemplates.ts was a local template behind a fake AI delay, deleted in b1d5d500. Restoring it as AI output would bring back fake output. **No plan discount on points exists**: only founder credits (src/lib/membership/founderPlan.ts:81-90) | S | Owner decision (the discount table) |
| §3.2-2b q323 | Contracts pro: 1,000 points. Delete "10 points" | **PARTIAL** | The price is done (tools.ts:794 `CONTRACTS_PRO_PRICE = 1000`). Stale labels remain at pricing.lawyers.ts:34 and pricing.providers.ts:61 ("١٠ نقاط") | S | none |
| §3.2-2c | Contracts drafting in 8 stages (ParagraphEditor, BilingualParagraphEditor, StepReview with PROPOSED_FIXES, StepApproval) | **PARTIAL** | Users see 6 steps (src/components/contracts/types.ts:9-16, with no best-practices, drafting or approval step). The AI draft is real (StepGenerate; screenshot 11 shows a working bilingual output). StepDrafting, StepBestPractices and StepApproval are on disk and unreferenced; StepDrafting is a phrase book (:29-86); PROPOSED_FIXES was removed (StepReview.tsx:27-30) | L | n8n (revise one clause; real fix suggestions) |
| §3.2-2d | Contract review in 5 stages, with the StepRAnalysis colored risk matrix and per-clause defensive / negotiating / manual edits. 250 points up to 15 pages | **MISSING** | Review is a team order (contracts/page.tsx:26-30 and :411-423; types.ts:25-29). The registry has no contract-review tool (tools.ts:1128-1392) | L | n8n workflow + per-page pricing (`price(pages)` is supported in runCore.ts:384) |
| §3.2-2e | Contract negotiator `/ai/contract-negotiator` at 150 points | **MISSING** | Mock `MOCK_RESULT` behind BetaReviewGate (contract-negotiator/page.tsx:36, :126-127, :286). No tool in the registry | M | n8n workflow |
| §3.2-2f | ClientSharePanel + `share/[token]` client view with comment and approve | **PARTIAL** | The live link is real: a hashed token, a hashed passcode compared in constant time (share/[token]/verify/route.ts:11-61), and a 300 s signed URL (share/[token]/page.tsx:14-25 and :41-70). Missing: the client cannot comment or approve, because no table stores either. ClientSharePanel is mounted only from orphan steps (contracts StepApproval.tsx:315, StepRReport.tsx:82) | M–L | SQL migration (feedback table + notification) |
| §3.2-2g | `ai/share-history` (15.8 KB, not the 1.3 KB stub) | **MISSING** | ComingSoon (share-history/page.tsx:1-28) and redirected (proxy.ts:343). No GET exists on `document_shares` (the page's own comment says so) | M | SQL (status and opened-at columns) + a GET route |
| §3.2-2h | Case-file sharing page (24.6 KB) | **MISSING** | ComingSoon (cases/[id]/sharing/page.tsx:1-19). Golden is mock (`SHAREABLE_ITEMS`) | L | SQL migration (case share scopes and guest tokens) + owner decision (what a client may see) |

### §3.5: collector, forms, uploads, waiting motion

| id | What the owner wants | Status | Evidence | Effort | Needs |
|---|---|---|---|---|---|
| §3.5-1a | A "+ save to collector" button on every article, principle and AI output | **PARTIAL** | Saving works from AiResultActions (src/components/AiResultActions.tsx:30-31 and :72, **lawyer and firm only**; 44 app files mount it) and from the law reader (src/components/laws/DraftDrawer.tsx) | M | none |
| §3.5-1b | A "send with context to ▾" menu that pre-fills the drafter, contracts pro, legal opinion, wargaming, direction-support and canvas | **MISSING** | The collector has only a plain link to /ai/draft (src/app/ai/collector/page.tsx:99-106). The only handoff that exists is transcript → drafter (src/lib/ai/transcriptHandoff.ts; draft/page.tsx:62-86), and `SendToDrafterButton` is **not mounted anywhere** (only comments mention it: transcriber/page.tsx:17-19, AttachmentSqueezer.tsx:27-29) | M–L | none |
| §3.5-2a | Every `ai_runs` row in the unified activity log | **MISSING** | src/app/api/v1/lawyer/activity/route.ts:103-147 reads request_events, admin_audit_events, activity_events and service_requests only. The page comment at activity/page.tsx:107-111 ("AI tool usage isn't recorded anywhere") is stale: `ai_runs` has an owner-select policy (migration :71-72) | S–M | none |
| §3.5-2b | Remove the misleading default filter "طلبات هذا الشهر" | **CONFLICT** | In code the filter defaults to **none**: `useState<StatKey\|null>(null)` (activity/page.tsx:289). Only a click on the stat card sets it (:606), and there is no URL or storage restore. Screenshot 12 shows that card **clicked** (highlighted, with a "clear" chip). The real UX bug is that a card reading "٠" is also a filter | S | none |
| §3.5-3a | No forced manual choice of case specialty (the AI infers it) | **MISSING** | Drafter: src/hooks/useDraftState.ts:202 and the server validator tools.ts:1029 (`DRAFT_COPY.branch`). Wargaming: src/app/ai/wargaming/page.tsx:366 (`areaReady`). Legal opinion: src/app/ai/legal-opinion/page.tsx:213 (`topicArea`) | S–M | n8n prompt change (infer the branch) |
| §3.5-3b | PartyForm: representative's ID number + "other" with a free-text field | **MISSING** | The drafter's DraftPartyForm.tsx:39-49 and contracts' SharedComponents.tsx:59-68 have the representative's name plus a 4-option role select, with no ID and no "other" (screenshot 09). The contracts-pro input builder must carry the new field (src/components/contracts/contractsProRun.ts) | S | none |
| §3.5-3c | Visible `*` on required fields platform-wide | **PARTIAL** | About 43 markers in about 10 files (for example contract-drafter/_components/StepForms.tsx, lawyer AddHearingModal.tsx). There are none in the draft and contracts PartyForms, StepCase or the wargaming intake | M | none |
| §3.5-3d | AI can read .docx, .doc, .txt and .md | **MISSING** | AI reads PDF and images only: src/components/ai/aiReadable.ts:10-11 and src/lib/ai/aiFiles.ts:56-58. StepCase accepts .doc and .docx (StepCase.tsx:197, :297, :330), but `splitAiReadable` skips them (draft/page.tsx:48). Screenshot 15 shows wargaming refusing a .docx | M | none (server-side docx→text; legacy .doc is harder) |
| §3.5-3e | Instant preview of any attachment (Preview Modal) | **MISSING** | No preview component in src (grep for PreviewModal, FilePreview and AttachmentPreview found none) | M | none |
| §3.5-3f | An "or paste the text directly" option | **PARTIAL** | The drafter has the facts textarea (StepCase `caseText`). Brief-check, contract review (StepRUpload) and wargaming files are upload-only | S | none |
| §3.5-4 | Zero-extra-token live waiting telemetry: `progress_events` + `<AiThinkingStage/>` showing the real file names, queries and laws retrieved | **MISSING** | Only a 3-value `progress_step` exists (runCore.ts:132, set at :610-613; migration :51; read at useAiRun.ts:90). No `AiThinkingStage.tsx`. **Structural blocker:** `startRunWith` runs lib-queries and retrieval **before** the POST returns the runId (runCore.ts:440-510 vs the reply path at :546-564). The client cannot poll query and law events until the runId comes back first and retrieval moves to the background. Fast tools also sit behind the 60 s nginx cut (plan :73). The events reuse data the server already has, so they really do cost zero extra tokens | L | SQL migration (`progress_events jsonb`) + n8n (callback `detail` and `kind`) |
| LIVE-06 | The "out of credit" banner shown to an admin on /ai/contract-drafter | **MISSING (bug)** | contract-drafter/page.tsx:49 and :170 show it when `user.credits <= 0`. `credits` = `meta.credit_balance ?? 0` (src/hooks/userSession.ts:342), a user_metadata field that nothing writes: a grep of src and the migrations finds no write, and analyze/page.tsx:17-20 records the same finding. It is always 0, so the banner shows to everyone. analyze/page.tsx already removed this banner. Same code in src/app/ai/letter-drafter/page.tsx:8 | S | none |
| LIVE-03/04/17/21 | "تعذّر الاتصال بالخادم" on the legal-opinion consult, najiz and assistant | **NOT-CODE (investigate on server)** | The string is the **fallback**, shown only when the reply carries no JSON `error` (useAiRun.ts:60, :138 and :174-177; assistant/_assistant-client.ts:23). runCore always returns a JSON error (runCore.ts:96-140), so this means an nginx 502/504 HTML page, a crash, or a network failure. Check the app and nginx logs, whether those n8n workflows are active, and the 50/60 s timeouts. If the logs show 504s, the likely cause is code, not ops: a job POST blocks on lib-queries and retrieval before it replies (runCore.ts:440-510), which is the same structural problem as §3.5-4/C-6 | S (diagnose) | ops by the user |

**Counts (34 rows):**

| Status | Rows |
|---|---|
| DONE | 1 |
| PARTIAL | 13 (§3.2-2a also carries a CONFLICT) |
| MISSING | 14 (including the LIVE-06 bug) |
| CONFLICT | 4 (§3.1-4b, §3.2-1a, §3.2-1f, §3.5-2b) |
| NOT-CODE | 2 |

### Screenshot map (03_الشواهد_البصرية_للاختبار_الحي)

| # | Defect named in the screenshot | Row | Status |
|---|---|---|---|
| 01 | Drafter forces the case classification | §3.5-3a | MISSING |
| 02 | Legal opinion forces the legal area | §3.5-3a (legal-opinion/page.tsx:213) | MISSING |
| 03 | Legal opinion consult: "cannot reach server" | LIVE-03 | NOT-CODE |
| 04 | Legal opinion quick consult: same | LIVE-04 | NOT-CODE |
| 05 | Legal opinion letter-type cards and icons too large | outside slice C (UI) | not checked |
| 06 | Contract drafter shows the credit banner to an admin | LIVE-06 | MISSING (S bug) |
| 07 | Contract drafter has no waiting motion | §3.5-4 | MISSING |
| 08 | Contract drafter: rigid output and article-check error | `[....]` blanks are by design (the prompt bans invented names and amounts: n8n/ai/README.md:118). The error card is the library's citation verdict (citationCheck): the cited article was not found in that law. Not verified whether that is a model miscitation caught correctly or a library gap or false negative | PARTIAL (owner decision on blanks) |
| 09 | Contracts pro: no representative ID, no "other", no required markers | §3.5-3b, §3.5-3c | MISSING / PARTIAL |
| 10 | Contracts pro: silent text wait | §3.5-4 | MISSING |
| 11 | Contracts pro: no paragraph editor or client share for a bilingual contract | §3.2-2c, §3.2-2f | PARTIAL (the AI bilingual output works) |
| 12 | Activity log: no AI rows, plus a misleading filter | §3.5-2a, §3.5-2b | MISSING / CONFLICT |
| 13 | Uploads: no instant preview, no text paste (client service wizard) | §3.5-3e, §3.5-3f | MISSING / PARTIAL |
| 14 | Wargaming forces the case specialty | §3.5-3a (wargaming/page.tsx:366) | MISSING |
| 15 | Wargaming fails with Word .docx | §3.5-3d | MISSING |
| 16 | analyze-strength ghost page outside wargaming | outside slice C | — |
| 17 | Najiz optimizer: "cannot reach server", needs v5.2 | LIVE-17 + §3.1-4b | NOT-CODE + CONFLICT |
| 18 | Case brief: weak UI, duplicates the attachment squeezer | outside slice C | — |
| 19 | Case brief: dead questions, context lost when moving on | outside slice C (the context half relates to §3.5-1b) | — |
| 20 | Quick answer blocked by "ungrounded" | outside slice C. By design: a run with no library match is failed and refunded (runCore.ts:501 `no_sources`, :490 `no_queries`) | — |
| 21 | Assistant: "cannot reach server", not linked to the lawyer's cases | LIVE-21 NOT-CODE; the link to cases is outside slice C | NOT-CODE |

---

## 2. Conflicts

**C1. Owner answer ١١٥ against §3.2's "restore the 189 golden files".**
- **Then:** commit a92743a0 (2026-10-18) is titled "AI tools and admin pages that showed canned output say «قريباً» (owner ١١٥)". It removed share-history and the draft StepApproval for exactly this reason. Earlier passes did the same on owner instruction: 41007a5c "Phase 0 honesty gates", 60da404b "stop advertising capability the manual services do not have".
- **Now:** the README says the files were «جرى حذفها أو بترها أو اختزالها إلى شاشات صماء» ("deleted, cut or reduced to blank screens") and orders full restoration.
- **The golden set:** 188 of 189 files are the 2026-06-03 Initial commit, 75 of them carry mock data, and 188 make no API call.
- **The guide itself:** §3.2 says «تُستعاد كاملةً وتُربط بمخرجات الـ JSON الحية» ("restored in full and wired to the live JSON outputs"). Only the "wired to live JSON" half is honest, and that half is a rebuild, not a restore.

**C2. The claim price.**
- **Earlier:** the 30-Oct owner report q324 (تقرير_للمالك_ودليل_الاختبار_٢٠٢٦-١٠-٣١_حزمة_٣٠_أكتوبر.md:647-650) asked him to confirm 500 for «اللائحة والمذكرات».
- **Now:** the guide (line 139) says «صحيفة دعوى ابتدائية 200 نقطة · مذكرة رد/جوابية 500».
- **Live:** `claim: price 500` (draftKinds.ts:16).
- **Unpriced:** the guide does not price rejoinder, supplementary or closing (500 today, :18-20). The founder credit kind "drafting_work" also keys on these kinds (founderPlan.ts:87).

**C3. Pro gate (q335) against the library paywall (owner ٢٠٦/٢٠٧/٢٠٩).**
- **The guide:** opens the drafter and the legal-opinion consult to all.
- **The live gate:** that gate is what keeps server-only, paywalled article text away from free users (_libraryAiAccess.ts:1-20; runs/route.ts:33-44).
- **Retrieval:** retrieval.ts sends full texts and has no truncation branch. The plan (docs/plans/2026-10-26-ai-services-n8n-plan.md:164) promised a ~200-character excerpt for users without full access, and it was never built.

**C4. Najiz filter v5.2 against the live tool.**

| Point | Live | v5.2 |
|---|---|---|
| Limit | Server enforces **9,000** (tools.ts:160; prompt workflows.mjs:105 «٩٠٠٠ حرف»). The page says 10,000 (najiz-optimizer/page.tsx:20 and :237), so the live tool disagrees with itself | 10,000 is an "unofficial reported" limit. It must never be stated as verified. The text is measured, and R7 builds a field summary while the full text goes as the attachment |
| R3 blanks | Silently deleted (page.tsx:52-62) | Replace with «يحتاج تحقق: …», list them as missing data, and block "ready" status |
| R1/R2 symbols | Strips non-whitelisted symbols | Keep meaningful signs; every conversion goes in a before/after log |
| Local R5 | Deletes «وحيث إن», «ولما كان», … and is commented "mock" (page.tsx:70-80) | R5 applies only past a verified limit and preserves quotations verbatim |
| Output | `{text, kept_refs}` only (tools.ts:180-191) | Two blocks (Channel A field / Channel B attachment), a transformation report, a Target Profile (platform, mode, field, channel, limit status), and one of 4 readiness banners |

**C5. "Deduct after success" against charge-at-start-with-refund.**
- **Guide line 128:** «ثم الخصم الفعلي بعد نجاح التوليد» ("the actual deduction after the generation succeeds").
- **Live:** migration 20261027_10:9-16 debits inside `ai_start_run` and refunds through `ai_fail_run`.
- The balance outcome is the same. A user does see points leave and come back on failure.

**C6. Activity "default filter".** The owner's observed state (guide line 196) contradicts the code (activity/page.tsx:289, default `null`). See §3.5-2b.

**C7. Golden contract drafter against L11.** The golden contract drafter generates text locally from contractTemplates.ts behind a 2 s fake AI delay. The owner's own q326 frames the tool as a real 500-point AI job, and that is what is live.

---

## 3. Risks

- **R1. Paywall bypass (money and legal).** Removing the Pro gate for retrieval tools (q335) without first building source truncation hands paywalled law text to free accounts.
- **R2. Security regression if golden files are restored verbatim.**
  - golden `share/[token]` authenticates any 6 digits on the client (golden page.tsx:34-41);
  - golden draft StepApproval mints its token and passcode with `Math.random` and stores neither (:231-232);
  - the live hashed, constant-time flow (c15da9e4, 20260909, 20261026_66) would be lost.
- **R3. Fake data comes back.** Restoring golden DraftPreStep (MOCK_PARAS), the 8-step wizard (MOCK_ANALYSIS, MOCK_LAWS, MOCK_WARGAME), share-history (MOCK_DOCS), case sharing (SHAREABLE_ITEMS), contractTemplates (fake AI) or contracts PROPOSED_FIXES would present invented output as AI or as real records. That reverses owner answer ١١٥.
- **R4. Users charged for nothing in "review" mode (money).** If an admin switches a tool to "review" (the Dual-Mode gate), users are charged at start, the output is hidden (even from admins: runCore.ts:564 and runs/[id]/route.ts:40), and no admin path releases or refunds it. `ai_sweep_runs` ignores `review`. Do not offer the switch until release/reject exists.
- **R5. Consultants (legal).** Opening every tool to all accounts must keep the Art. 18 consultant blocks (tools.ts `consultantBlocked`, runCore.ts:276-278; draft/page.tsx:49-50).
- **R6. Gemini (legal).** §3.1 names Gemini, and q336 (the disclosure that data is processed by Google outside the Kingdom) is still a precondition before any Gemini tool goes live.
- **R7. Telemetry leaks (data).** `progress_events` must carry titles and article numbers only, never `text`. The library-column-lock test must stay green, and the spec says so too.
- **R8. Pricing honesty.** The pricing cards still show 15 and 10 points (pricing.lawyers.ts:33-34, pricing.providers.ts:61) while the server charges 500–1,500 and 1,000.

---

## 4. Suggested batches (dependency order)

1. **C-0 quick fixes (S, no owner input).**
   - LIVE-06 banner: contract-drafter/page.tsx:49 and :170, letter-drafter.
   - Delete the stale 15/10-point lines.
   - PartyForm: representative ID + "other" (both forms + contractsProRun).
   - `*` markers on the drafter and contracts intakes.
   - Activity: make the card filter obvious or non-sticky.
   - Najiz: align the 9,000 / 10,000 copy.
2. **C-1 owner decisions to collect first.**
   - Claim price 200, plus prices for rejoinder, supplementary and closing.
   - Plan discount on the 500-point drafter.
   - Roles for q335.
   - What a client may see on a shared case.
   - Prices for "revise one section" and the in-drafter wargame.
   - Hand-over of the Saudi prompt repo.
3. **C-2 ops (user).** Diagnose the "تعذّر الاتصال" failures (LIVE-03/04/17/21) from the app and nginx logs and from n8n activation.
4. **C-3 money-safe gate.** SQL: `ai_release_run` / `ai_reject_run` (reject refunds), sweep `review` after N hours. Admin queue showing the output, plus a bell, email and WhatsApp alert. Only then expose "review" as the transition mode.
5. **C-4 paywall-safe opening (q335).** Truncate sources for users without full access in retrieval, then relax `libraryAccess`, widen `roles` per decision C-1, and keep the consultant blocks.
6. **C-5 inputs.**
   - Server-side docx/txt/md → text for AI files.
   - An attachment preview modal.
   - "Paste text" on brief-check, contract review and wargaming.
   - Drop the forced branch and specialty (validators + n8n prompt inference).
7. **C-6 telemetry.** SQL `progress_events`. Return the runId before retrieval (a background step), push file, query, law and verify events, extend the n8n callback with `detail` and `kind`, then build `<AiThinkingStage/>` across the 10 mount points.
8. **C-7 studios rebuilt on real AI (L).**
   - Drafter: MemoBlock per `sections[]` + a "revise section" tool; a laws step from `source_ids`; hand-off to wargaming.
   - Contracts: a clause editor over the real output + "revise clause"; new n8n jobs for contract-review (250/15 pages) and negotiator (150).
   - Brief-check: add `dimension` and `quote` to feed the 5-axis view.
9. **C-8 sharing (L).** SQL: share an AI output or a saved doc, plus `share_feedback` (comment and approve) and notifications. Then:
   - wire ClientSharePanel into the drafter and contracts approval steps;
   - give `share/[token]` comment and approve;
   - add share-history with a GET over `document_shares`;
   - the case sharing page last (needs the C-1 scope decision).
10. **C-9 collector hub.** A "send with context to ▾" handoff (generalize `transcriptHandoff` to a typed payload per target), mount the save button on principles, and add `ai_runs` to the activity feed.

**Not in this slice but seen:**
- The untracked `najizDecomposer.ts` and `api/v1/najiz/sync` in the main folder parse court minutes for the Chrome extension. They are unrelated to the v5.2 filter.
- owner-edits e00e51cd adds only the extension.
