# Audit of the 58 live `BetaReviewGate` call sites

This document maps every place `<BetaReviewGate>` is used outside its own
definition file, as of branch `feat/review-gate-and-three-services` at commit
`7c9a8c1` (after Task A1 landed the honest no-payload copy). It exists to tell
the project owner which of these gated tools deserve to be wired to the real
order pipeline next (Tasks C1–C4 of this plan), and which are dead UI or
out-of-scope mock tools.

## 0. The count is 58, not 52 — here is the arithmetic

The plan title and Task A2's own Step-1 command undercount, because
`grep -rl` / `grep -rln` return **matching files**, not **call sites**, and
one file (`src/app/ai/procedures/page.tsx`) wraps three separate tools in
three separate gates.

Commands run on this branch, raw output below each:

```
$ grep -rl "BetaReviewGate" --include=*.tsx src/app src/components \
    | grep -v "components/BetaReviewGate.tsx" | wc -l
56
```

```
$ grep -rn "<BetaReviewGate" --include=*.tsx src/app src/components \
    | grep -v "components/BetaReviewGate.tsx" | wc -l
58
```

```
$ grep -c "<BetaReviewGate" src/app/ai/procedures/page.tsx
3
```

```
$ grep -rc "<BetaReviewGate" --include=*.tsx src/app src/components \
    | grep -v "components/BetaReviewGate.tsx" | grep -v ":0$" | awk -F: '$2>1'
src/app/ai/procedures/page.tsx:3
```

So: **56 files**, all but one (`procedures/page.tsx`, which has 3) contain
exactly one `<BetaReviewGate>` JSX opening tag → 55 × 1 + 1 × 3 = **58 call
sites**. That is the number this document audits and the number in the title.

For completeness, one more check proves the population is fully captured —
that no `<BetaReviewGate` usage exists anywhere outside `src/app` or
`src/components` (only non-JSX mentions — comments, `betaConfig.ts` labels —
turn up, confirmed by inspection):

```
$ grep -rn "BetaReviewGate" src --include=*.tsx --include=*.ts \
    | grep -v "src/app/\|src/components/"
(19 matches, all inside src/lib/betaConfig.ts doc comments/labels and
 src/constants/businessProfileReadiness.ts prose — no <BetaReviewGate> JSX)
```

The plan's predecessor figure ("52 reachable call sites … 56 files reference
it; 4 are inside الصائغ's now-hidden steps") arrived at 52 by treating each of
the 56 *files* as one call site and subtracting the 4 dead ones (56 − 4 = 52),
without noticing that `procedures/page.tsx` alone contributes 3. The correct
arithmetic is **58 total → 4 dead → 54 reachable**.

## 1. Reachability standard used in this document

A call site is marked **reachable** when normal user interaction — filling a
form, clicking "generate", completing a wizard step — can make React actually
render the `<BetaReviewGate>` JSX, as opposed to it living inside a branch
that is never mounted regardless of what the user does. This is the same
standard the task brief itself applies to the four `src/components/draft/steps/`
files (see §2): the question is "can this JSX node ever appear in the DOM",
not "does the page's route require a subscription tier" or "is the route
linked from navigation." Where a tool sits behind a paid tier or an
`isDemoBypass`/role check, that is noted as a side fact, not used to flip the
reachability verdict — a real subscriber on that tier still reaches it.

One fact worth stating once rather than 58 times: every single call site in
this document passes `reviewScope="legal-data"`. Per
`src/components/BetaReviewGate.tsx:153-156`, that makes `isLegalDataGated`
`true` unconditionally (`reviewScope === "legal-data"` short-circuits the
`||`), so `shouldGate` is `true` for every non-bypass, non-forceShow user —
the audience is not limited to lawyer/firm roles the way `reviewScope="role"`
would be.

## 2. The four dead call sites (draft wizard's hidden steps)

`src/components/draft/draftConstants.ts:24-28`:

```ts
export const CLIENT_VISIBLE_STEPS = [
  STEPS[0], // identify
  STEPS[1], // case
  SUBMIT_STEP,
] as const;
```

`STEPS` (`draftConstants.ts:3-12`) also defines `analysis`, `defenses`,
`laws`, `drafting`, `review`, `approval` — none of which are in
`CLIENT_VISIBLE_STEPS`. The page that would host them,
`src/app/ai/draft/page.tsx`, only conditionally renders three components based
on `s.step`:

```tsx
{s.step === "identify" && <StepIdentify .../>}
{s.step === "case"     && <StepCase .../>}
{s.step === "submit"   && <StepSubmit .../>}
```

(`src/app/ai/draft/page.tsx:107-120`). `StepDefenses`, `StepDrafting`,
`StepLaws`, `StepReview` are never imported there, and a repo-wide search
confirms no file anywhere imports them:

```
$ grep -rn "from ['\"]@/components/draft/steps/Step(Defenses|Drafting|Laws|Review)['\"]" src
(no matches)
```

So these four components are orphaned — not rendered by any parent, at any
step, under any state. Marked **dead**.

| # | File | toolId / toolName | Real input if it were reachable |
|---|------|--------------------|----------------------------------|
| 1 | `src/components/draft/steps/StepDefenses.tsx:315` | `draft.defenses` / "استخراج الدفوع القانونية" | None — only prop is `isDark`; state initializes from `MOCK_DEFENSES` and only supports locally editing/adding defense text that never leaves the component. |
| 2 | `src/components/draft/steps/StepDrafting.tsx:381` | `draft.final` / "صياغة العقد" or "الصائغ القانوني" | `memoType`, `memoSubType` (echoed from the identify step, unused for generation) — the drafted body is always `MOCK_SECTIONS`. |
| 3 | `src/components/draft/steps/StepLaws.tsx:127` | `draft.laws` / "اقتراح النصوص النظامية والمبادئ" | `customLegalTexts` (a real free-text prop with a setter) — but even this field can never reach an order because the step itself is never mounted. |
| 4 | `src/components/draft/steps/StepReview.tsx:106` | `draft.review` / "تحليل جودة المذكرة والمحاكاة" | `memoType`, `legalBranch`, `defenseCount`, `lawCount`, `hasParties`, `hasCaseText`, `hasJudgmentData` (booleans/counts derived upstream) — output is `MOCK_WARGAME`/`buildChecks()` over those flags, but again unreachable. |

Bucket for all four: **dead**.

## 3. The service-key mapping used to decide "wire now"

Per `src/lib/services/orderIntake.ts:11-24`, `SERVICE_TITLE_AR` is:

```ts
draft:         "الصائغ القانوني"   // already converted (A1 done, C-series n/a)
contracts:     "محترف العقود"      // C2 (draft mode) + C3 (review mode)
wargaming:     "المحاكي الشامل"    // C1
legal_opinion: "الرأي الفصل"       // C4 (seven sub-flows)
```

Cross-checked against the plan (`docs/superpowers/plans/2026-08-15-review-gate-and-three-services.md`):
C1 modifies `src/app/ai/wargaming/page.tsx`; C2/C3 modify
`src/app/ai/contracts/page.tsx`, `src/hooks/useContractsState.ts`,
`src/components/contracts/steps/{draft,review}/**`; C4 modifies
`src/app/ai/legal-opinion/page.tsx` and its `_components/**`.

**Headline surprise: `src/app/ai/contracts/page.tsx` and
`src/components/contracts/steps/{draft,review}/**` — C2/C3's entire target —
contain zero `<BetaReviewGate>` calls today:**

```
$ grep -rn "BetaReviewGate" src/components/contracts/steps/draft src/app/ai/contracts/page.tsx
(no matches)
```

So the "wire now" bucket contains **no** contracts call site — there is
nothing to wire a payload onto yet; C2/C3 will presumably add the gate (or
skip it) as part of building the submit step. This also means the tools with
similar-sounding names — `/ai/contract-drafter` ("محترف صياغة العقود" /
"Contract Drafter Pro"), `/ai/contract-reviewer`, `/ai/contract-negotiator`,
and `/ai/corp/contracts` ("مسودة العقد للشركات") — are **not** محترف العقود
and are **not** in scope for C2/C3, despite the name overlap. They are
classified `honest copy`.

"Wire now" therefore holds exactly **4** of the 58 sites: wargaming's one
gate, and legal-opinion's three (page.tsx's cross-exam gate, `ResultView.tsx`'s
shared gate covering the other five non-letter, non-cross-exam sub-types, and
`LetterWorkflow.tsx`'s letter gate).

## 4. Wire now (4 sites) — this plan's in-progress services

### `/ai/wargaming` — المحاكي الشامل (C1)

`src/app/ai/wargaming/page.tsx:267`, `toolId="wargaming.result"`,
`toolName="محاكاة القضية والمذكرة المنقحة"`.

**Reachable** — normal flow: `CaseSetup` (step `"setup"`) → `TargetSelect`
(step `"targets"`) → `runSim()` → step `"results"` → user clicks "طبّق على
المذكرة" (`Results`, line 534, sets `applied=true`) → `{applied &&
<PolishPanel .../>}` (line 543) → the gate is inside `PolishPanel`.

**Real input in scope:** `ctx.role` (plaintiff/defendant/advisor, select),
`ctx.area` (8-option select), `ctx.summary` (textarea, min 20 chars, plus
voice input), `ctx.file` (upload captures only `f.name`, not the `File`
object — line 376), `targets: Set<SimTarget>` (multi-toggle: `opponent`,
`court`, `critique`, `plea`).

Known gap already assigned to C1 step 3 in the plan (not a new finding): the
`نقض المذكرة` / critique target has no memo input field — the polish panel
always renders `MOCK_MEMO_BASE` regardless of what the user's real memo says.

### `/ai/legal-opinion` — الرأي الفصل, cross-exam sub-flow (C4)

`src/app/ai/legal-opinion/page.tsx:329`, `toolId="legal-opinion.cross-exam"`,
`toolName="مُولّد الاستجواب"`.

**Reachable** — `{currentStep === "result" && (selectedType === "cross-exam"
? <BetaReviewGate>...<CrossExamResultView/></BetaReviewGate> : <ResultView/>)}`
(lines 326-341). Selecting the "cross-exam" card at step `"type"` → `
ContextCrossExam` at step `"context"` (`description`, validated ≥ 50 chars
via `canProceed()` line 80) → step `"settings"` → `"processing"` (4-6s fake
delay) → `"result"`.

**Real input:** `description` (free text, the cross-exam brief).

### `/ai/legal-opinion` — الرأي الفصل, the other five sub-flows (C4)

`src/app/ai/legal-opinion/_components/ResultView.tsx:38`,
`toolId="legal-opinion.result"`,
`toolName="الرأي القانوني المدعوم بالنصوص والسوابق"`.

**Reachable** — rendered by `page.tsx`'s `{currentStep === "result" && (...
: <ResultView outputType={selectedType} .../>)}` for every `selectedType`
except `"cross-exam"` — i.e. `consult`, `study`, `legal-memo`, `research`,
`due-diligence` (the letter flow is intercepted earlier by `isLetterMode` and
never reaches this branch). One gate, five sub-types.

**Real input** varies by sub-type, all lifted into the page's own state:
`topicArea`, `description`, `question` (quick-chat), `studyGoal`,
`litigationStage`, `memoStructure`, `memoDetailLevel`, `researchSources`,
`researchLimit`. Per the plan's own audit (C4 step 2, not a new finding
here), three context sub-components hold real fields that are **not** lifted
to this state and so cannot currently reach an order even if this gate were
wired: `ContextMemo.tsx:29-32` (`audience`, `side`), `ContextResearch.tsx:43-46`
(`researchType`, `compareWith`, `keywords`), `ContextDueDiligence.tsx:45-62`
(nearly every field). C4 step 2 already assigns fixing this.

Note for the wiring effort: C4 also plans to hide `ResultView`/
`CrossExamResultView` entirely (both are "100% canned" per the plan), so
these two gates may end up **removed** rather than payload-wired — "wire now"
here means "in this plan's scope," not "guaranteed to end up with a send
button."

### `/ai/legal-opinion` — الرأي الفصل, letter sub-flow (C4)

`src/app/ai/legal-opinion/_components/LetterWorkflow.tsx:449`,
`toolId="legal-opinion.letter"`, `toolName="الخطاب القانوني"`.

**Reachable** — `{letterDone && (<BetaReviewGate>...)}` (line 447);
`letterDone` is set after step 3's send button (`letterSubject.trim().length
>= 10`, line 426) completes `letterProcessing`.

**Real input:** `letterType`/`letterTypeCustom`, `letterPurpose`,
`senderName`, `senderRole`, `recipientName`, `recipientType`, `govEntity`,
`responseDeadline`, `deadlineDays`, `letterSubject`, `letterAttachments`
(free-text labels, not files), `letterLegalRef`. Per the plan, `fullLetterText`
(the `useMemo` at line 45) is genuinely built from these fields, not
fabricated — the one output in the whole legal-opinion tool that is not
canned.

## 5. Honest copy (50 sites) — real input exists, out of scope today

Every row below is **reachable** (evidence given) and has `reviewScope=
"legal-data"`. "Bucket" is `honest copy` unless stated otherwise. Grouped by
product area.

### 5.1 Individual/lawyer tools (`src/app/ai/*`)

One row here is not like the other 49: `/ai/transcriber`'s gate is the only
site in this entire audit that is *conditionally disabled by a prop* — see
its row below. Half of that tool's output (the `verbatim` transcript) is
never gated at all today; only the `legal` extraction path is. It stays
classified `honest copy` — a fourth bucket is not warranted for one
prop-driven exception — but a reader picking wiring candidates should not
assume it behaves like the other 49 rows in this table.

| Route | toolId — toolName | Reachability evidence | Real user input held |
|---|---|---|---|
| `/ai/analyze` (individual users only) | `analyze.smart.result` — "تحليل قوة الموقف القانوني" | `src/app/ai/analyze/page.tsx:23-27` renders `<SmartAnalyzer>` only for `user.userType` **not** `lawyer`/`firm` (those see `AttachmentSqueezer` instead, ungated). Inside `SmartAnalyzer.tsx`, `{phase === "result" && report && <BetaReviewGate>...}` (line 224), reached via `submit()` → dynamic follow-up questions → `runAnalysis()`. | `text` (case textarea; file upload only sets `text` to a `[ملف: name]` placeholder, not real file content), `dynQuestions`/`answers` (AI-generated follow-up questions with real free-text answers). |
| `/ai/analyze-strength` | `analyze-strength.result` — "محلل الموقف والخصم" | `page.tsx:263-265`, ternary `analyzed ? (...) : (<BetaReviewGate>...)` — reached via `analyze()` (line 256, requires `caseDesc`). | `caseDesc` (textarea), `caseFile` (filename only), `attachments[]` (description + filename pairs), `hasOpponentMemo`/`useFirmMemory`/`bulkUpload` (toggles). |
| `/ai/assistant` | `assistant.result` — "نظامي أسيستنت" | `page.tsx:482-486`: each chat message with `msg.role === "assistant" && !msg.thinking` is individually wrapped (`key={msg.id}`). Reached by sending any chat message. | `input` (chat free text) per turn. |
| `/ai/brief-check` | `brief-check.result` — "فحص المذكرة والسوابق" | `page.tsx:170`, `{results && <BetaReviewGate>...}`, set by `handleFile()` after a 2.8s fake check. | `file` (filename only, via `handleFile(name)`); `BRIEF_ISSUES` output is static regardless of which file. |
| `/ai/case-brief` | `case-brief.result` — "إحاطة القضية القانونية" | `page.tsx:329-331`, `{step === "result" && result && assess && <BetaReviewGate>...}`, reached via `runBrief()` (requires ≥1 file). | `chatInput` (textarea — role + what to look for), `files[]` (filenames only, multi-upload), `generateClientRequests` (toggle). `MOCK_RESULT` is static. |
| `/ai/communicate` | `communicate.result` — "المتحدث الذكي" | `page.tsx:171-198`, ternary else-branch when `output && !generating`. | `recipient`, `subject`, `tone` (select), `context` (textarea, required). |
| `/ai/compare` | `compare.result` — "المقارنة الذكية للمستندات" | `_result-view.tsx:44` wraps the whole component unconditionally; parent `page.tsx:109-117` mounts `<ResultView>` only when `stage === "result"`, reached via `handleCompare()` (requires `textA`/`textB` ≥ 30 chars each, or upload). | Parent page holds real `textA`/`textB` (full document text, ≥30 chars, supports AR/EN/FR) and `docType`, but `ResultView` itself only receives `docAName`/`docBName` (filenames) as props — the actual document text does not reach the gated component. `MOCK_DIFFS`/`MOCK_ISSUES` are static. |
| `/ai/consult` | `consult.result` — "الاستشارة القانونية الذكية" | `page.tsx:283-289`, each `msg.role === "ai"` chat message individually wrapped, same pattern as `/ai/assistant`. | Free-text chat input per turn, or a quick-prompt click. |
| `/ai/contract-drafter` | `contract-drafter.result` — "مسودة العقد ومراجعته السريعة" / "Contract draft and quick review" | `StepContractResult.tsx:37` wraps the whole component; it is `step4` of the contract-drafter wizard (props-driven, not itself the entry point). | `contractText`, `contractType`, `reviewResult` (all lifted from the parent wizard's state, passed as props). Uses a **separate, local-only** persistence path (`saveWorkflowRequest` / `src/lib/clientWorkflowRepository.ts`, see §7) — not the `createServiceOrder` pipeline. |
| `/ai/contract-negotiator` | `contract-negotiator.result` — "استراتيجية تفاوض العقد" | `page.tsx:286`, `{step === "result" && result && <BetaReviewGate>...}`, reached via `handleAnalyze()` (requires ≥1 goal). | `contractText`, `context` (textarea), `goals[]` (multi-select negotiation goals). |
| `/ai/contract-reviewer` | `contract-reviewer.result` — "تقرير مراجعة العقد" | `page.tsx:227`, `{step === "result" && result && <BetaReviewGate>...}`, reached via `handleReview()`. | `contractText`, `focus[]` (multi-select review priorities, "ركّز المراجعة على"). |
| `/ai/global` | `global.result` — "نتيجة نظامي عالمي" | `page.tsx:301`, reached after `research()` sets `phase === "result"` (requires a selected jurisdiction + `query`). | `jurId`/`subId` (jurisdiction/sub-jurisdiction selection), `query` (free-text legal question). `runResearch(jur, sub, query)` is a local function, not an LLM call — its output was not further traced. |
| `/ai/micro` | `micro.result` — "مستند المنشأة الصغيرة" | `page.tsx:392`, reached after `generate()` (requires a selected situation + answers). | `selected` (one of 6 situation types), `answers[]` (3 situation-specific free-text fields with real placeholders), `file` (filename only). Notably `buildOutput(situationId, answers)` (lines 108-124) is a genuine mail-merge — the output text really does interpolate `answers[0..2]` — the most input-driven output found in this whole audit outside the wire-now bucket. Also uses the local-only `saveWorkflowRequest` path (§7), not `createServiceOrder`. |
| `/ai/procedures` (tab "الدوائر القضائية" and tab "الإجراءات", shared answer state) | `procedures.smart-answer` — "إجابة المرشد القضائي" (**2 call sites**, `page.tsx:157` and `page.tsx:335`) | Both reached via `doSearch(query)` setting `answer`; site 1 (circuits tab) shows all answer types, site 2 (procedures tab) filters out `answer.type === "circuit"`. `getSmartAnswer(q)` (`./_ai`) is a local lookup function, not an LLM call. | `query` (free text or one of 4 quick-question buttons per tab), plus voice input. |
| `/ai/procedures` (tab "الإجراءات", court-procedure browser) | `procedures.manual-guide` — "دليل الإجراءات القضائية" | `page.tsx:447`, reached by clicking a court card (`selectedCourt`) — `procedure?.steps` from the static `PROCEDURE_STEPS[selectedCourt]`. | None beyond which of the listed courts was clicked — the step content itself is fully static reference data. |
| `/ai/quick-answer` | `quick-answer.result` — "الإجابة القانونية السريعة" | `page.tsx:400`, reached via `ask(query)` after selecting `mode` (fast/deep) and typing a query, `step === "result"`. | `mode` (select), `query` (free text). `MOCK_RESULT` is static regardless. |
| `/ai/report-generator` | `report-generator.result` — "التقرير الذكي" | `page.tsx:253`, reached via `handleGenerate()`, `step === "done"`. | `selectedType` (5 report types), `caseRef` (text input), `format` (word/pdf/md). `MOCK_REPORT` never references `caseRef` — see §7 finding. |
| `/ai/smart-inspector` | `smart-inspector.result` — "الفاحص الذكي" | `page.tsx:431`, reached via `analyze(context)` after either the file path (`uploadedFile`, filename only) or manual path (3 guided `answers[]`), `mode === "result"`. | `domain` (case category), `answers[]` (manual path, 3 guided answers) or `uploadedFile` (filename only, file path). |
| `/ai/transcriber` | `transcriber.legal-result` — "استخلاص الوقائع القانونية من التفريغ" — **the one call site where a prop disables the gate** | `page.tsx:475`: `<BetaReviewGate ... forceShow={mode !== "legal"}>`. Per `BetaReviewGate.tsx:162`, `forceShow` short-circuits the gate entirely — so when `mode === "verbatim"` the transcript renders **ungated** (children shown directly, no beta card at all); the gate is only live when `mode === "legal"` (legal-facts extraction). Reached via upload → purpose selection → `stage === "result"`. | `mode` (legal/verbatim toggle), `purpose` (select), `customNote` (free text), `file` — this is one of the few tools that captures a real `File` object (`useState<File \| null>`), not just a filename. |

### 5.2 Corporate tools (`src/app/ai/corp/*`)

| Route | toolId — toolName | Reachability evidence | Real user input held |
|---|---|---|---|
| `/ai/corp/advisor` | `corp.advisor` — "رأي المستشار التجاري" | `page.tsx:152`, `{response && <BetaReviewGate>...}`, reached via `ask()`. | `input` (free-text commercial-legal question) or a quick-topic click. `MOCK_RESPONSE` static. |
| `/ai/corp/compliance` | `corp.compliance` — "تفاصيل امتثال الشركة" | `page.tsx:110`, `{!analyzed ? (...) : ...}`-adjacent; gate wraps content shown once `analyzed` is set by `analyze()` (single click, no form). | **None.** No text/select input anywhere on the page — `COMPLIANCE_AREAS` is a hardcoded 6-item list; the only action is a single "فحص مستوى الامتثال" button. |
| `/ai/corp/compliance-monitor` | `corp.compliance-monitor` — "تقرير الامتثال التنظيمي" | `page.tsx:278`, `{step === 2 && <BetaReviewGate>...}`, reached via `calculateResults()` (step 1's Yes/No questionnaire). | `answers: Record<string, boolean>` — real per-question Yes/No responses to the static `QUESTIONS` checklist. Unlike most tools here, `calculateResults()` genuinely computes `overallScore`/section scores from these answers (deterministic logic, not canned) — only the recommendation text bodies are static per question. |
| `/ai/corp/contracts` | `corp.contracts` — "مسودة العقد للشركات" | `page.tsx:190`, `{response && <BetaReviewGate>...}`, reached via `draft()`. | `input` (textarea — contract description/parties/terms), `type` (select, contract type). `MOCK_CONTRACT` static regardless. Not محترف العقود — a distinct corp-specific drafting tool. |
| `/ai/corp/corpmind` | `corp.corpmind` — "تحليل العقد عبر CorpMind" | `page.tsx:300`, inside `ContractAnalysisView`'s `step === "done"` branch, reached by clicking/dropping on the upload zone. | **None captured at all** — `handleUpload()` (line 244) takes no argument and never reads `File.name` or content; even the displayed "analyzed" contract name (`MOCK_ANALYSIS.contractName`) is hardcoded. The most theatrical upload flow found in this audit — see §7. |
| `/ai/corp/deal-intel` | `corp.deal-intel` — "تقرير تحليل الصفقة" | `page.tsx:288`, reached via `startProcess()` → `stage === "report"` (requires `dealType`, `sector`, `description` ≥ 20 chars). | `dealType`, `sector` (selects), `description` (textarea, ≥20 chars), `partyType`, `partyName`, `dimensions[]` (multi-select analysis dimensions). `MOCK_REPORT` static. |
| `/ai/corp/hr` | `corp.hr` — "رأي المستشار العمالي" | `page.tsx:148`, `{response && <BetaReviewGate>...}`, reached via `ask()`. | `query` (free-text labor-law question) or a quick-action click. `MOCK_HR_RESPONSE` static. |
| `/ai/corp/risk-assessment` | `corp.risk-assessment` — "تحليل مخاطر الطرف التعاقدي" | `page.tsx:264`, ternary `!result ? (...) : (<BetaReviewGate>...)`, reached via `handleAssess()`. | Full `RiskInputs` form: `partyName`, `partyType`, `duration`, `contractValue`, `latePayments`, `rejectedClauses`, `modifyTerms`, `previousDisputes`, `validCR`, `pdplCompliant` (booleans via toggle buttons), `notes` (textarea). `evaluateRisk()` (lines 46-60) is genuine deterministic scoring logic over these real inputs, not canned. |

### 5.3 Government-sector tools (`src/app/ai/gov/*`)

All 19 files below share the same three-step shape (`"input" → "generating"/
"reviewing"/"analyzing" → "result"`, guarded by a `mounted` SSR check), and
the same evidence pattern: `{step === "result" && (<BetaReviewGate>...)}`
following a `setStep("result")` timeout after the user fills a `form` object
and passes its `isValid`/`canProceed`-style gate. Reachability is cited once
per file at its gate's line number; it is not re-derived per row because the
pattern was verified identically in all 19.

| Route | toolId — toolName | Gate line | Real user input held |
|---|---|---|---|
| `/ai/gov/arrest-forms` | `gov.arrest-forms` — "نماذج القبض والتفتيش" | `page.tsx:58` (`step === "result"`) | `form = { type, target, address, reason, authority }`. `DRAFT` genuinely interpolates all of these via string templating (not a `MOCK_` constant) — a real mail-merge. |
| `/ai/gov/compliance-checker` | `gov.compliance-checker` — "تقرير الامتثال الحكومي" | `page.tsx:153` — **unconditional**, no generate step at all; wraps content shown from page load | No free text. `INITIAL_CHECKS` (10-item checklist) is pre-seeded `pending`; the only interaction is per-item `status` cycling and `notes` (free text) via `updateStatus`/`updateNotes` — genuine annotation of static seed data, not AI generation. |
| `/ai/gov/contract-reviewer` | `gov.contract-reviewer` — "مراجعة العقد الحكومي" | `page.tsx:78` (`step === "result"`) | `form = { contractType, parties, value, terms }` (terms textarea ≥20 chars). `reviewText` header interpolates `contractType`/`parties`/`value`; the actual `ISSUES` findings array is static regardless of `terms` content. |
| `/ai/gov/deadline-calculator` | `gov.deadline-calculator` — "حساب المواعيد الإجرائية" | `page.tsx:89` (`deadlines.length > 0`) | `form = { label, startDate, days, category }`, added to a real `deadlines[]` array. `addDays()`/`daysLeft()` are genuine date arithmetic over real input — not mocked at all; this tool's entire output is a deterministic calculation. |
| `/ai/gov/detention-records` | `gov.detention-records` — "محضر الضبط والإيقاف" | `page.tsx:58` (`step === "result"`) | `form = { name, id, location, reason, time }`. |
| `/ai/gov/evidence-analyzer` | `gov.evidence-analyzer` — "تحليل الأدلة الجنائية" | `page.tsx:80` (`step === "result"`) | `form = { crimeType, evidence, accused }`. |
| `/ai/gov/guarantees-checker` | `gov.guarantees-checker` — "مراجعة الضمانات الإجرائية" | `page.tsx:70` (`step === "result"`) | `form = { crimeType, detentionDate, actions }`. |
| `/ai/gov/incident-report` | `gov.incident-report` — "تقرير الحادثة الرسمي" | `page.tsx:402` (`step === "result"`) | `incidentDate`, `incidentTime`, `incidentPlace`, `incidentDesc`, `evidenceDesc`, `seized`, `officerNotes` — 7 discrete fields (largest field count of any gov tool). |
| `/ai/gov/indictment-drafter` | `gov.indictment-drafter` — "لائحة الاتهام" | `page.tsx:371` (`step === "result"`) | `caseNumber`, `accusedName`, `accusedId`, `incidentDate`, `incidentPlace`, `factsText`, `customCharge`, `penaltyText` — 8 discrete fields. |
| `/ai/gov/investigation-forms` | `gov.investigation-forms` — "نموذج التحقيق" | `page.tsx:61` (`step === "result"`) | `selected` (5 template types), `details` (textarea). `DRAFT` interpolates `selected`/`details` directly. Note: the "إنشاء النموذج" button (line 47) has **no `disabled` guard** — every sibling gov tool disables its generate button until `isValid`; this one does not (minor inconsistency, not a security issue since the template still just echoes whatever was typed, including empty). |
| `/ai/gov/judgment-drafter` | `gov.judgment-drafter` — "مسودة الحكم القضائي" | `page.tsx:118` (`step === "result"`) | `form = { caseType, facts, legalBasis, decision }` (`isValid` requires `facts` ≥20 chars). `DRAFT` (line 26) interpolates **only** `form.decision` — `facts` is validated as required but never appears in the rendered draft text, nor is it saved anywhere; `legalBasis` at least reaches `saveWorkflowRequest`'s `metadata`. See §7 finding. Also the only other gov tool (besides `/ai/micro`) using the local-only `saveWorkflowRequest` path (§7). |
| `/ai/gov/judgment-weigher` | `gov.judgment-weigher` — "ترجيح الأدلة القضائية" | `page.tsx:153` (`step === "result"`, inferred from identical pattern; not independently re-verified beyond the `form` shape) | `form = { claimSummary, claimEvidence, defenseSummary, defenseEvidence, legalBasis }` (`isValid` requires `claimSummary`/`defenseSummary` ≥20 chars). `MOCK_RESULT` static regardless. |
| `/ai/gov/judicial-search` | `gov.judicial-search` — "بحث المبادئ القضائية" | `page.tsx:114` (`step === "result"`) | `query` (free text), `category` (select). `MOCK_PRINCIPLES` (3 static entries) unaffected by either. |
| `/ai/gov/jurisdiction-analyzer` | `gov.jurisdiction-analyzer` — "تحليل الاختصاص القضائي" | `page.tsx:82` (`step === "result"`, inferred from identical pattern) | `form = { subject, parties, amount, location }`. |
| `/ai/gov/legal-opinion-drafter` | `gov.legal-opinion-drafter` — "الرأي القانوني الحكومي" | `page.tsx:274` (`step === "result"`, inferred from identical pattern) | `factsText`, `question`, `relatedLaws`, `requestingEntity`, `requestDate` — 5 discrete fields. Distinct tool from `/ai/legal-opinion` (الرأي الفصل); government-sector naming overlap only. |
| `/ai/gov/procedure-guide` | `gov.procedure-guide` — "دليل الإجراءات الأمنية" | `page.tsx:65`, inside `{selected === p.id && (<BetaReviewGate>...)}` per accordion card | `search` (filter text) and `selected` (which of 4 static procedures is expanded) both stay usable **outside** the gate — only the expanded step-by-step content (fully static `PROCEDURES[].steps`) is hidden. No free text is hidden; this gate hides pure reference content. |
| `/ai/gov/procurement-reviewer` | `gov.procurement-reviewer` — "تقرير مراجعة المنافسات والمشتريات" | `page.tsx:78` (`step === "result"`, inferred from identical pattern) | `form = { type, value, entity, details }`. |
| `/ai/gov/rights-reminder` | `gov.rights-reminder` — "قائمة ضمانات الموقوف" | `page.tsx:56` — **unconditional**, wraps the entire interactive checklist itself, not just an AI-generated result | `checked: number[]` — which of the 8 static rights items (`RIGHTS`) the officer has marked complete, via clickable toggle rows, plus a reset button. **This gate hides the tool's only functionality, not an AI output** — while `BETA_REVIEW_MODE` is on, the checklist cannot be interacted with at all, since the toggle buttons themselves are children of `<BetaReviewGate>`. See §7 finding. |
| `/ai/gov/verdict-drafter` | `gov.verdict-drafter` — "مسودة الحكم القضائي" | `page.tsx:334` (`step === "result"`, inferred from identical pattern) | `caseNumber`, `caseYear`, `factsText`, `evidenceText`, `lawsText`, `weighingReason` — 6 discrete fields. Same Arabic tool name as `/ai/gov/judgment-drafter` but a distinct route/file. |

### 5.4 NGO tools (`src/app/ai/ngo/*`)

| Route | toolId — toolName | Reachability evidence | Real user input held |
|---|---|---|---|
| `/ai/ngo/donation-analyzer` | `ngo.donation-analyzer` — "تحليل التبرعات والامتثال" | `page.tsx:100`, `step === "result"` after a fixed 2s delay. | `period` (free text, default "الربع الأول ٢٠٢٦") is the **only** real input — the donation list (`SAMPLE`) is hardcoded and not user-entered; `RESULT` (totals, insights) is static regardless of `period`. |
| `/ai/ngo/report-generator` | `ngo.report-generator` — "التقرير الدوري للجمعية" | `page.tsx:260`, ternary else-branch when `generated`. | `reportType`, `orgName`, `period`, `missionSummary`, `achievements`, `challenges`, `nextSteps` (7 text fields), `kpis[]` (structured KPI values). |
| `/ai/ngo/volunteer-contract` | `ngo.volunteer-contract` — "عقد التطوع" | `page.tsx:372`, `step === "result"`. | `volunteerName`, `volunteerId`, `volunteerPhone`, `volunteerCity`, `volunteerRole`, `orgName`, `programName`, `duration`, `startDate`, `endDate`, `hoursPerWeek`, `workLocation`, `duties`, `benefits` — 14 discrete fields, the largest field count in the whole audit. |

## 6. The 5 gov gate conditionals, confirmed directly (no inference)

The five gov-sector rows in §5.3 whose gate line was initially estimated by
pattern were re-checked directly:

```
$ grep -n -B4 '<BetaReviewGate' src/app/ai/gov/judgment-weigher/page.tsx \
    src/app/ai/gov/jurisdiction-analyzer/page.tsx \
    src/app/ai/gov/legal-opinion-drafter/page.tsx \
    src/app/ai/gov/procurement-reviewer/page.tsx \
    src/app/ai/gov/verdict-drafter/page.tsx

src/app/ai/gov/judgment-weigher/page.tsx-150-          {step === "result" && (
src/app/ai/gov/judgment-weigher/page.tsx:153:              <BetaReviewGate toolId="gov.judgment-weigher" ...

src/app/ai/gov/jurisdiction-analyzer/page.tsx-81-          {step === "result" && (
src/app/ai/gov/jurisdiction-analyzer/page.tsx:82:            <BetaReviewGate toolId="gov.jurisdiction-analyzer" ...

src/app/ai/gov/legal-opinion-drafter/page.tsx-273-        {step === "result" && (
src/app/ai/gov/legal-opinion-drafter/page.tsx:274:          <BetaReviewGate toolId="gov.legal-opinion-drafter" ...

src/app/ai/gov/procurement-reviewer/page.tsx-77-          {step === "result" && (
src/app/ai/gov/procurement-reviewer/page.tsx:78:            <BetaReviewGate toolId="gov.procurement-reviewer" ...

src/app/ai/gov/verdict-drafter/page.tsx-332-        {step === "result" && (
src/app/ai/gov/verdict-drafter/page.tsx:334:            <BetaReviewGate toolId="gov.verdict-drafter" ...
```

All five are `{step === "result" && (...)}`, identical to the other 14 gov
tools — confirmed, not inferred. §5.3's table is now backed by a direct read
or grep of every one of its 19 rows.

## 7. Findings for a later effort (not fixed here — documentation only)

1. **`report-generator.result` (`/ai/report-generator`) collects `caseRef`
   and never uses it.** `MOCK_REPORT` (`page.tsx:59-92`) is a fixed string
   that does not reference `caseRef` anywhere — the field the user types into
   has no effect on the output. This is exactly the anti-pattern constraints.md
   rule 6 describes ("a control the user can type into whose value never
   leaves the component").

2. **`corp.corpmind` (`/ai/corp/corpmind`) captures nothing at all.**
   `handleUpload()` (`page.tsx:244`) is wired to both the click and the drop
   handler but takes no file argument and never reads `File.name`, unlike
   every other "upload" tool in this audit (which at least capture the
   filename). The result screen's displayed contract name is a hardcoded
   string (`MOCK_ANALYSIS.contractName`), not derived from any upload.

3. **`gov.judgment-drafter`'s `facts` field is validated as required, then
   discarded.** `isValid` requires `form.facts.length > 20`
   (`page.tsx:25`), but the rendered `DRAFT` template (`page.tsx:26`) only
   interpolates `form.decision`; `facts` never appears in the draft text and
   is not included in the `metadata` passed to `saveWorkflowRequest` either
   (only `caseType` and `legalBasis` are). The user is asked to write ≥20
   characters of facts that go nowhere.

4. **`gov.rights-reminder`'s gate hides the tool's only interactivity, not an
   AI output.** The entire checklist — the toggle buttons that let an officer
   mark which of the 8 statutory rights have been satisfied — lives inside
   `<BetaReviewGate>` (`page.tsx:56-76`). There is no AI generation on this
   page at all; `BetaReviewGate` was presumably applied here by the same
   sweep that gated genuinely AI-backed tools, but this one has nothing to
   hide except a static reference checklist with local state. The same is
   true, to a lesser degree, of `gov.compliance-checker` (an unconditional
   gate around annotation of a static checklist with no generate step) and
   `gov.procedure-guide` (though there only the fully-static step content is
   hidden, not the browse/search UI).

5. **A parallel, local-only "workflow" persistence path exists alongside the
   real order pipeline, and is easy to mistake for it.** `src/lib/
   workflowStore.ts` (`saveWorkflowRequest`, `createWorkflowId`) is used by
   exactly four files — `contract-drafter/page.tsx`, `ngo/volunteer-
   contract/page.tsx`, `micro/page.tsx`, `gov/judgment-drafter/page.tsx` —
   and is backed by `src/lib/clientWorkflowRepository.ts`'s `*Local`
   functions (browser-local storage, not `createServiceOrder` /
   `POST /api/v1/service-requests`). It produces a `savedId`/`savedDraftId`/
   `savedContractId` shown in the UI, which can read as "this was saved"
   without going through the real order pipeline this plan requires
   (constraints.md's "one order-creation transport, no exceptions" rule).
   Worth a decision later on whether to remove it, migrate it to
   `createServiceOrder`, or leave it as a distinct, clearly-labelled local
   draft-save feature.

None of the above were fixed as part of this task — Task A2 is documentation
only, per the controller notes.

## 8. Bucket totals

| Bucket | Count | Sites |
|---|---|---|
| **Wire now** (this plan, C1/C4) | 4 | wargaming (1), legal-opinion (3: cross-exam, result, letter) |
| **Honest copy** (real input, out of scope today) | 50 | §5.1 (20 rows/sites) + §5.2 (8) + §5.3 (19) + §5.4 (3) |
| **Dead** (unreachable) | 4 | §2 — the four draft-wizard step components |
| **Total** | **58** | |

§5.1's 20 sites: SmartAnalyzer, analyze-strength, assistant, brief-check,
case-brief, communicate, compare, consult, contract-drafter,
contract-negotiator, contract-reviewer, global, micro,
`procedures.smart-answer` (2 separate call sites, one per tab),
`procedures.manual-guide`, quick-answer, report-generator, smart-inspector,
transcriber — 17 files contributing 1 site each, plus `procedures/page.tsx`
contributing 3, = 20. §5.3's 19 sites are the 19 files listed in that table
(one call site each). This reconciles with §0: 4 (wire now) + 50 (honest
copy) + 4 (dead) = 58, matching the raw `grep -c` count.
