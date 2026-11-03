# S3 — AI tools on existing backends, studios on real AI, client sharing (gap Waves 4a, 4d, 4e)

**Base:** worktree `D:\nzwt\ownerfree`, branch `batch/2026-11-03-owner-free` (main 1103812d). Every file:line below was re-read at HEAD on 2026-11-03.
**Specs:** `docs/audits/2026-11-02-owner-package/D-ai-tools.md`, `C-ai-architecture-studios.md`, `00-gap-analysis-and-plan.md` §Wave 4.
**Migration range:** `20261103_50` … `20261103_59`. This section uses **one**: `20261103_50_client_shares.sql`.

## Conventions for every task in this section

- **Before editing any function, component or constant**, run `impact({target: "<symbol>", direction: "upstream"})` (project CLAUDE.md) and paste the blast radius into the task's commit body. Stop and tell the user if it says HIGH or CRITICAL.
- **Before every commit**, run `detect_changes()`.
- **Unit run:** `npm run test:unit`. The baseline has 6 known CRLF failures; the count of failures must not grow. A single file: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test <file>`.
- **Build:** `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack`.
- **UI rules:**
  - No mock data, no timers that pretend to work, no invented prices. Anything unbuilt says «قريباً».
  - Never `text-gray-100` / `text-gray-200`.
  - Dates are formatted on the client only, never during SSR.
- **Golden files** (`C:\Users\LOQ\Downloads\حزمة_المبرمج_٢٠٢٦-١١-٠١\…`) are read for layout ideas only. Copy **no** `MOCK_*`, no `setTimeout` "AI", no `Math.random`, and never the golden `/share/[token]`, which accepts any 6 digits.
- **Tool ids stay as they are.** `case-brief` keeps its id and n8n path: `platform_settings.ai_tools` is keyed by id.
- **Prices are today's server prices** (`tools.ts`). This section changes no existing price.
- **The two new tools** (contract review 250, negotiator 150) take their prices from the owner's canonical pricing document, items 9 and 10 (`…/04_…/وثيقة_التسعير_الكنوني…2026-10-25.md:203-209`). The same rows carry q296: «يُحفظ سعرها بالنظام ولا يظهر ولا تُباع حتى يُربط تحليلها الذكي الفعلي». So:
  - nav rows and `/pricing` stay «قريباً» in this section;
  - the tool page shows its price and form **only when** `GET /api/v1/ai/tool-status` (task S3-07) says the tool is usable for the caller.

---

## Part A — Wave 4a: UI on backends that already exist

### Task S3-01: «عصارة المرفقات» = the real case-brief flow, mounted as the lawyer half of `/ai/analyze`

**Shared files:**
- `src/constants/lawyerAiCatalog.ts`
- `src/app/ai/page.tsx` (the `/ai` hub)
- `src/constants/betaGatedRoutes.ts`

**Files:**
- Create `src/components/ai/caseBrief/CaseBriefStudio.tsx`. Move the whole body of `src/app/ai/case-brief/page.tsx` (544 lines) into it unchanged, as a `default export function CaseBriefStudio()`.
- Modify `src/app/ai/case-brief/page.tsx` to `export { default } from "@/components/ai/caseBrief/CaseBriefStudio"`. It is deleted in S3-02.
- Modify `src/app/ai/analyze/_components/AttachmentSqueezer.tsx`:
  - replace the `DashboardComingSoon` body with `<CaseBriefStudio />`;
  - rewrite the header comment: what it was, and that it is now the real case-brief job.
- Modify `src/app/ai/analyze/page.tsx:42`: render `AdvisoryTemplateNotice` only in the client branch (not for lawyer or firm).
- Modify `src/constants/lawyerAiCatalog.ts:159-170` (`ai:analyze`): drop `comingSoon: true` and its comment, and keep `adminPricingKey`.
- Modify `src/constants/lawyerAiBadges.ts`: `"ai:analyze"` → `"case-brief"` (the price label reads the registry).
- Modify `src/app/ai/page.tsx:562`:
  - `ai:analyze` card: `descAr` «لخّص ملف القضية واستخرج الوقائع والتناقضات والنواقص من أوراقك»;
  - remove the «قريباً» badge for lawyer/firm;
  - `CLIENT_ANALYZE_CARD` (:622-638) keeps clients on their gated card.
- Modify `src/constants/betaGatedRoutes.ts:34` and its test: `/ai/analyze` stays gated for clients only. Lawyer and firm get the studio.
- Tests to rewrite on purpose:
  - `src/lib/services/cannedOutputGate.test.ts:126-140,239,329`;
  - `src/components/ai/sendToDrafterWiring.test.ts:17` (drop AttachmentSqueezer from `GATED`; `SendToDrafterButton` stays unmounted, see "Not in this section");
  - `src/constants/betaGatedRoutes.test.ts:70-71,157`;
  - `src/lib/services/pricingApprovals.test.ts:319-320` (path → `components/ai/caseBrief/CaseBriefStudio.tsx`);
  - `src/lib/ui/darkModeGuard.test.ts:33` (same path move).

**Interfaces:**
- Consumes `useAiRun().start("case-brief", input, { files })`, `CASE_BRIEF_FILES {max:5,maxPages:30,maxBytes:22 MiB}` and `CASE_BRIEF_PRICES {small:30,large:150}` (`tools.ts:329-331`).
- Produces `CaseBriefStudio(): JSX.Element`.

**Steps:**
- [ ] **Failing test.** `src/lib/services/cannedOutputGate.test.ts`, new test `"عصارة المرفقات renders the real case-brief job for lawyer and firm"`. It asserts:
  - `AttachmentSqueezer.tsx` contains `CaseBriefStudio`;
  - it does not contain `DashboardComingSoon`;
  - `CaseBriefStudio.tsx` contains `useAiRun` and `"case-brief"`;
  - it contains none of `MOCK_`, `Math.random`, or `setTimeout(` followed within 200 characters by `setResult`.
- [ ] **Failing test.** `lawyerAiCatalog` row `ai:analyze` has `comingSoon !== true`. `lawyerAiBadges["ai:analyze"] === "case-brief"`.
- [ ] Run `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/cannedOutputGate.test.ts src/constants/betaGatedRoutes.test.ts`. Expect FAIL.
- [ ] Move the code. Edit the files listed. The 30-page cap stays: pages over 30 are refused, as today (see Excluded, ٤٢٨).
- [ ] Verify: the unit run plus the build. On the dev server as a lawyer, `/ai/analyze` shows the case-brief intake with «٣٠ نقطة / ١٥٠ نقطة»; as an individual it shows the gated client analyzer.
- [ ] Commit `feat(ai): عصارة المرفقات is the real case-brief job on /ai/analyze (lawyer, firm)`.

### Task S3-02: 301 `/ai/case-brief` → `/ai/analyze`, and one nav row

**Shared files:**
- `src/proxy.ts`
- `src/constants/navigation.sidebars.legal.ts`
- `src/constants/lawyerAiCatalog.ts`
- `src/app/ai/page.tsx`

**Files:**
- Modify `src/proxy.ts:349-355` (`REDIRECTS`): add `"/ai/case-brief": "/ai/analyze"` (proxy answers 301 at :397-400; next.config `permanent` would be 308).
- Delete `src/app/ai/case-brief/page.tsx`.
- Modify `src/app/sitemap.ts:81`: remove `/ai/case-brief`.
- Modify `src/constants/navigation.sidebars.legal.ts:32` and `:262`. The rows become `{ label: "عصارة المرفقات", labelEn: "Attachment Analyzer", href: "/ai/analyze", icon: "Scan" }`: no «جديد», no «قريباً».
- Remove the `ai:case-brief` row from:
  - `src/constants/lawyerAiCatalog.ts:76-84`;
  - `src/app/ai/page.tsx:556`.
- Then grep `"ai:case-brief"` across `src` (userPermissions, lawyerAiBadges, pricingApprovals.test.ts:223) and point each hit at `ai:analyze`.

**Interfaces:** consumes `REDIRECTS: Record<string,string>`.

**Steps:**
- [ ] **Failing test.** In `src/lib/nav/` (or `src/proxy` tests, wherever REDIRECTS is asserted; grep `REDIRECTS` in `*.test.ts`), a test `"/ai/case-brief is a 301 to /ai/analyze"`. It reads `src/proxy.ts` as source and asserts the line `"/ai/case-brief":` maps to `"/ai/analyze"`.
- [ ] **Failing test.** Every href in `navigation.sidebars.legal.ts` that equals `/ai/case-brief` → count 0.
- [ ] **Failing test.** `sitemap.ts` does not contain `/ai/case-brief`.
- [ ] Run. Expect FAIL. Implement. Run the unit suite plus the build.
- [ ] Verify with `curl -sI http://localhost:3000/ai/case-brief`: `301` and `location: /ai/analyze`.
- [ ] Commit `feat(ai): 301 /ai/case-brief → /ai/analyze; one «عصارة المرفقات» row`.

### Task S3-03: a real 301 for `/ai/research`

**Shared files:**
- `src/proxy.ts`

**Files:**
- Modify `src/proxy.ts` `REDIRECTS`: `"/ai/research": "/ai/legal-opinion"`.
- Delete `src/app/ai/research/page.tsx` (the `setTimeout(…, 2200)` client redirect) and `src/app/ai/research/layout.tsx`.
- Remove `/ai/research` from `sitemap.ts` if it is listed there.
- Update `src/lib/lawyerQuickTools.ts:19` (comment) and `src/lib/lawyerQuickTools.test.ts:56`. `/ai/research` stays out of the quick tools; the test reason becomes "a 301".

**Steps:**
- [ ] **Failing test.** `"/ai/research is a 301 to /ai/legal-opinion"` (the same REDIRECTS source test as S3-02), plus `existsSync("src/app/ai/research/page.tsx") === false`.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] `curl -sI …/ai/research` returns `301` and `location: /ai/legal-opinion`.
- [ ] Commit `fix(ai): /ai/research is a real 301, not a 2.2 s client timer`.

### Task S3-04: corporate and NGO contract tools route to محترف العقود

**Shared files:**
- `src/proxy.ts`
- `src/constants/navigation.navbar.ts`
- `src/constants/navigation.sidebars.business.ts`
- `src/components/floating/constants/floatingServices.tsx`
- `src/constants/betaGatedRoutes.ts`
- `src/lib/betaConfig.ts`

**Why contracts-pro for both:** `contracts-pro` roles include `corporate` and `ngo` (`tools.ts:1378`). `contract-drafter` has no `ngo` (`tools.ts:1333`).

**Files:**
- `src/proxy.ts` `REDIRECTS`:
  - `"/ai/corp/contracts": "/ai/contracts"`;
  - `"/ai/ngo/volunteer-contract": "/ai/contracts"`.
- Delete `src/app/ai/corp/contracts/page.tsx` (236 lines; `MOCK_CONTRACT` behind BetaReviewGate) and `src/app/ai/ngo/volunteer-contract/page.tsx` (447 lines).
- Repoint every inbound link to `/ai/contracts` (label «محترف العقود», no «قريباً»):
  - `src/app/dashboard/micro/contracts/page.tsx:186`;
  - `src/app/dashboard/micro/requests/page.tsx:45`;
  - `src/app/dashboard/ngo/contracts/page.tsx:47`;
  - `src/app/dashboard/ngo/page.tsx:23` (sub «قريباً» → «بالذكاء الاصطناعي»);
  - `src/app/dashboard/ngo/volunteers/page.tsx:44,66`;
  - `floatingServices.tsx:453,479,535`;
  - `navigation.navbar.ts:242`;
  - `navigation.sidebars.business.ts:315` (and the comment at :34).
- Remove the two routes from:
  - `betaGatedRoutes.ts:37,40`;
  - `betaConfig.ts:123,127`;
  - `sectorProfileReadiness.ts:370` (replace with `/ai/contracts`).
- Update `src/app/ai/ngo/honesty.test.ts` to drop the volunteer-contract assertions, or move them to "the route is a 301".

**Steps:**
- [ ] **Failing test.** `"corporate and NGO contract tools are 301s to /ai/contracts"`. It asserts both REDIRECTS entries, that both page files are absent, and that a grep of `src` for `"/ai/corp/contracts"` and `"/ai/ngo/volunteer-contract"` outside `proxy.ts` returns 0 hits.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(ai): corporate and NGO contract tools open محترف العقود (301)`.

### Task S3-05: `/ai/micro` — contract cards open the contract drafter; the rest stay «قريباً»

**Shared files:**
- `src/constants/betaGatedRoutes.ts`
- `src/lib/betaConfig.ts`

**Files:** modify `src/app/ai/micro/page.tsx` (467 lines).
- The cases at :31-33 (employment contract), :73-75 (rent) and :87-89 (services) become link cards to `/ai/contract-drafter`, with text «يُكتب بمحرر العقود المختصر — ٥٠٠ نقطة». The price is read via `aiToolPriceText("contract-drafter","ar")`, not typed by hand.
- The warning letter (:45-47), complaint reply (:59-61) and question (:101-103) cases become non-clickable cards badged «قريباً».
- Delete the output builder (:107-125), the timer (:154) and the result/gate block (:394+). The page no longer needs `BetaReviewGate`. Remove `/ai/micro` from `betaGatedRoutes.ts:32` and `micro.result` from `betaConfig.ts:130`.
- Leave `src/app/dashboard/micro/page.tsx:60` and `navigation.sidebars.business.ts:166` badged «قريباً». The page is still mostly unbuilt.

**Interfaces:** consumes `aiToolPriceText(id, "ar")` from `src/lib/ai/toolPointsDisplay.ts`.

**Steps:**
- [ ] **Failing test.** In `src/lib/services/cannedOutputGate.test.ts`, test `"/ai/micro has no canned output"`. Page source:
  - contains no `setTimeout(`;
  - contains no `MOCK`;
  - contains `href="/ai/contract-drafter"` (3 occurrences, or one mapped list holding 3 ids);
  - contains `aiToolPriceText("contract-drafter"`;
  - contains «قريباً».
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `fix(ai/micro): contract cases open the real contract drafter; the rest are «قريباً»`.

### Task S3-06: the quick-answer UI, at today's price (20) and today's roles

**Shared files:**
- `src/constants/navigation.sidebars.legal.ts`

**Files:**
- Modify `src/app/ai/quick-answer/page.tsx` (whole file).
- Create `src/app/ai/quick-answer/_quickAnswer.ts` (pure).
- Create `src/app/ai/quick-answer/_quickAnswer.test.ts`.
- Modify `navigation.sidebars.legal.ts:33`. Today the lawyer row «سؤال قانوني سريع» opens `/ai/assistant`, and it is the lawyer sidebar's **only** assistant row, so do not repoint it.
  - Relabel it `{ label: "المساعد المتقدم", labelEn: "Advanced Assistant", href: "/ai/assistant" }`. That is the catalog's own title (`lawyerAiCatalog.ts:301`).
  - Add a row above it: `{ label: "سؤال قانوني سريع", labelEn: "Quick Legal Q&A", href: "/ai/quick-answer", icon: "ChatCircle" }`.
  - The firm row at :263 already points to quick-answer.

**Interfaces (pure, `_quickAnswer.ts`):**
- `export const QUICK_ANSWER_EXAMPLES: readonly string[]`: exactly 4 neutral example questions. No names, no amounts.
- `export const QUICK_ANSWER_FOLLOW_UPS: ReadonlyArray<{ href: "/ai/legal-opinion" | "/ai/analyze" | "/ai/wargaming"; labelAr: string }>`. Labels: «الرأي الفصل», «عصارة المرفقات», «المحاكي الشامل».
- `export function quickAnswerRefusalText(code: string | null): string | null`:
  - `"no_sources"` → «لم نجد في مكتبة الأنظمة نصاً يجيب عن هذا السؤال — أُعيدت نقاطك. أعد صياغته بكلمات نظامية أو اطلب رأياً من الرأي الفصل.»;
  - `"ungrounded"` → «لم تستند الإجابة إلى نص من المكتبة فحُجبت وأُعيدت نقاطك.»;
  - anything else → `null`.

**UI (no new backend):**
- the example chips fill the textarea;
- the sources list is collapsible (`SourceList` per source, first open);
- `AiResultActions text={stripCitationMarkers(answer)} collectorSource="other"` (save to the collector, copy);
- a «اسأل سؤالاً آخر» reset;
- the follow-up links;
- the price line stays `aiToolPriceText("quick-answer","ar")`.

**No free daily question.** The ungrounded rule is unchanged.

**Steps:**
- [ ] **Failing test.** `_quickAnswer.test.ts`:
  - `QUICK_ANSWER_EXAMPLES.length === 4`;
  - no example matches `/[0-9٠-٩۰-۹]/u` (no invented numbers, Latin or Arabic-Indic);
  - the lawyer sidebar has exactly one `/ai/quick-answer` row and still exactly one `/ai/assistant` row;
  - `quickAnswerRefusalText("no_sources")` includes «أُعيدت نقاطك»;
  - `quickAnswerRefusalText("x") === null`;
  - follow-up hrefs equal exactly `["/ai/legal-opinion","/ai/analyze","/ai/wargaming"]`.
- [ ] **Failing test.** `pricingApprovals.test.ts`: the quick-answer page still renders only `aiToolPriceText("quick-answer"` and contains no literal `١٥` or `15 نقطة`.
- [ ] Run, expect FAIL. Implement. `useAiRun().code` drives `quickAnswerRefusalText`. Run the unit suite plus the build.
- [ ] Commit `feat(ai): quick-answer UI — examples, sources, collector, follow-ups (20 points, unchanged)`.

---

## Part B — Wave 4d: studios on real AI

### Task S3-07: `GET /api/v1/ai/tool-status` — may the caller run this tool now?

**Why:** there is no client-readable mode endpoint today. A page learns `tool_off` only from a failed run (`runCore.ts:294-300`; `aiToolsConfig.ts` is read only by admin routes). q296 needs the two new tools to hide their price until they are live.

**Shared files:**
- `src/lib/ai/runCore.ts` (export only)
- `src/lib/rateLimitRoutes.ts`

**Files:**
- Modify `src/lib/ai/runCore.ts:148`: `async function readAiToolsSetting` → `export async function readAiToolsSetting`. No behavior change.
- Modify `src/lib/ai/aiToolsConfig.ts`: add the pure `toolAvailability`.
- Create `src/app/api/v1/ai/tool-status/route.ts`.
- Modify `src/lib/rateLimitRoutes.ts`: add `/api/v1/ai/tool-status` to the same per-IP GET bucket as `isPointsStandingRoute`.
- Tests: `src/lib/ai/aiToolsConfig.test.ts` (extend), `src/lib/rateLimitRoutes.test.ts` (extend).

**Interfaces:**
- `export function toolAvailability(spec: Pick<AiToolSpec,"roles"|"consultantBlocked">, actor: { userType: string; practiceKind: string | null }, runtime: AiToolRuntime): "ok" | "role" | "consultant_blocked" | "tool_off"`. It uses the same order and rules as `runCore.ts:286-300`: admin bypasses role and consultant; `off`, or `staff` for a non-admin, gives `tool_off`.
- `GET /api/v1/ai/tool-status?tool=<id>`:
  - `200 { usable: boolean }` with `Cache-Control: private, no-store`;
  - `401` when signed out;
  - `400 { error }` for an unknown id (`getAiTool` returns null).
- It reads the profile like `points-standing/route.ts`. Never return the mode, the limits or the price.

**Steps:**
- [ ] **Failing tests** (`aiToolsConfig.test.ts`, `"toolAvailability"`):
  - roles `["lawyer"]`, actor individual, mode live → `"role"`;
  - actor admin, mode staff → `"ok"`;
  - actor lawyer, mode staff → `"tool_off"`;
  - consultantBlocked, actor lawyer with practiceKind consultant, live → `"consultant_blocked"`;
  - actor lawyer, live → `"ok"`.
- [ ] **Failing test.** `rateLimitRoutes.test.ts`: `GET /api/v1/ai/tool-status` matches the points-standing IP bucket.
- [ ] Run, expect FAIL. Implement. A source test asserts `runCore.ts` contains `export async function readAiToolsSetting`. Run the unit suite plus the build.
- [ ] Commit `feat(ai): tool-status — usable or not, for the signed-in caller (no mode, no price)`.

### Task S3-08: drafter section editor (manual only, no AI action)

**Files:**
- Modify `src/components/draft/legalDraft.ts` (add pure helpers).
- Modify `src/components/draft/legalDraft.test.ts` (create it if absent).
- Modify `src/components/draft/steps/StepAiDraft.tsx:66-68` and `:270-300`.

**Interfaces:**
- `export function editPleadingSection(p: Pleading, index: number, patch: { heading?: string; body?: string }): Pleading`:
  - returns a new object;
  - an out-of-range index returns `p` unchanged;
  - heading is trimmed and capped at 200;
  - body is capped at 12000 (`tools.ts:1114-1115`).
- `export function editedSectionIndexes(original: Pleading, edited: Pleading): number[]`.

**UI:**
- Each section of the pleading (`StepAiDraft.tsx:270-276`) gets «تعديل» → an inline `<input>` for the heading plus a `<textarea>` for the body → «تم» / «تراجع عن التعديل».
- The edited sections carry the tag «عُدِّل يدوياً».
- `written` becomes `pleadingText(editedPleading)`, and the same edited object feeds:
  - `onPleading(written)`, so the optional team review receives the edited text;
  - `downloadWord()` via `pleadingWordHtml(editedPleading)`;
  - `AiResultActions text`;
  - the share snapshot (S3-26).
- When any section is edited, the `CitationCheckList` title becomes «التحقق من المواد — على نص الذكاء الاصطناعي قبل تعديلك».
- A `beforeunload` prompt fires while edits exist. **No copy says «حُفظ».** Nothing persists the edits except a share or a download.

**No «عدّل هذا القسم» AI button** (٤١٠).

**Steps:**
- [ ] **Failing tests** (`legalDraft.test.ts`). With `p = { title: "t", sections: [{heading:"أ",body:"x"},{heading:"ب",body:"y"}], requests: [], citation_check: [] }`:
  - `editPleadingSection(p, 1, { body: "z" }).sections[1].body === "z"`, while `p.sections[1].body === "y"` (no mutation);
  - `editPleadingSection(p, 5, { body: "z" }) === p`;
  - a body of 12001 chars is cut to 12000;
  - `editedSectionIndexes(p, edited) deepEqual [1]`.
- [ ] **Failing source test** (`src/components/draft/stepAiDraftWiring.test.ts`). `StepAiDraft.tsx`:
  - contains `editPleadingSection`;
  - contains no `«عدّل هذا القسم»` and no `"revise"` run start;
  - contains `pleadingWordHtml(edited` (the edited variable name as implemented);
  - does not contain «حُفظ».
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(draft): edit any section of the pleading by hand; Word, copy and team review carry the edit`.

### Task S3-09: contracts clause editor (manual only)

**Files:**
- Modify `src/components/contracts/contractsProRun.ts` (pure helpers).
- Modify or create `src/components/contracts/contractsProRun.test.ts`.
- Modify `src/components/contracts/steps/draft/StepGenerate.tsx:54-80`.
- Modify `src/app/ai/contracts/page.tsx` (hold the edited draft; pass `draftText` from it).

**Interfaces:**
- `export function editContractSection(d: ContractsProDraft, index: number, patch: { heading?: string; body?: string; heading_alt?: string; body_alt?: string }): ContractsProDraft`. Caps: heading/heading_alt 200; body/body_alt 12000. An `*_alt` patch is ignored when `d.alt === null`.
- `export function editedContractSections(a: ContractsProDraft, b: ContractsProDraft): number[]`.
- `StepGenerate` gets the new props `onEditSection(index, patch)` and `editedIndexes: number[]`.

**UI:**
- Per section, «تعديل البند». For a bilingual contract, two textareas side by side (the `Facing` grid).
- The tag «عُدِّل يدوياً».
- The `CitationCheckList` note changes as in S3-08.
- `contractsProText(edited)` feeds `AiResultActions` and the share snapshot.
- No AI revise button: «صياغة بديلة لبند» has no price (see Excluded).

**Steps:**
- [ ] **Failing tests:**
  - `editContractSection(d, 0, { body_alt: "B" })` with `d.alt = "English"` sets `sections[0].body_alt === "B"`; with `d.alt = null` it leaves `body_alt` undefined;
  - there is no mutation of `d`;
  - `editedContractSections` returns `[0]`.
- [ ] **Failing source test.** `StepGenerate.tsx` contains `onEditSection` and no `useAiRun`. `contracts/page.tsx` passes `contractsProText(` of the edited draft.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(contracts): edit any clause by hand, both languages`.

### Task S3-10: brief-check output accepts `dimension` and `quote` (old runs still valid)

**Shared files:**
- `src/lib/ai/tools.ts` (validators)

**Files:**
- Modify `src/lib/ai/tools.ts:397-439` (`briefCheckOutput`).
- Modify `src/lib/ai/briefCheck.test.ts` (or the test file that covers `briefCheckOutput`; grep `briefCheckOutput`).

**Interfaces:**
- `export const BRIEF_CHECK_DIMENSIONS = ["laws","princip","defenses","requests","style"] as const`. These are the five ids of the golden `DIMS` list; the labels live in S3-12.
- Each finding becomes `{ severity, location, issue, fix, dimension: BriefDimension | null, quote: string | null }`:
  - `dimension = oneOf(f.dimension, BRIEF_CHECK_DIMENSIONS, null)`;
  - `quote = boundedText(f.quote, 400) ?? null`.
- A finding without the fields is still valid.

**Deploy order:** this ships with or before the prompt (S3-11). The old workflow's output (no dimension) must still pass.

**Steps:**
- [ ] **Failing tests:**
  - an old-shape finding (no dimension or quote) → output finding has `dimension === null` and `quote === null`, and the run is accepted (not null);
  - `{dimension:"laws", quote:"…"}` is kept;
  - `{dimension:"win_rate"}` → `null`;
  - a quote of 401 chars is cut to 400.
- [ ] Run, expect FAIL, implement, run the unit suite.
- [ ] Commit `feat(ai/brief-check): findings may carry one of five dimensions and the quoted passage`.

### Task S3-11: brief-check prompt asks for `dimension` and `quote` — repo JSON plus import

**Files:**
- Modify `n8n/ai/workflows.mjs:311` (`BRIEF_CHECK_PROMPT`).
- Regenerate `n8n/ai/brief-check.json` with `node scripts/n8n-ai-export.mjs`.
- Extend `src/lib/ai/n8nWorkflows.test.ts`.

**Prompt rules, added in Arabic:**
- each finding names exactly one of the 5 ids;
- `quote` is copied verbatim from the memo (≤ 400 characters) or omitted;
- never cite a judicial principle by number or date;
- for `princip`, say that a supporting principle is missing, not which one;
- no percentages.

**Steps:**
- [ ] **Failing test** (`n8nWorkflows.test.ts`, `"brief-check prompt names the five dimensions and forbids numbered principles"`):
  - the built prompt for the brief-check package contains each of `laws`, `princip`, `defenses`, `requests`, `style`;
  - it contains «لا تذكر رقم مبدأ»;
  - it contains `quote`.
- [ ] Run, expect FAIL, implement, export, run `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/n8nWorkflows.test.ts`.
- [ ] Commit `feat(n8n/brief-check): ask for the dimension and the quoted passage`.
- [ ] **STOP-POINT.** The user imports `n8n/ai/brief-check.json` into the live n8n, after the deploy that carries S3-10. Until then the report shows every finding under «غير مصنّف».

### Task S3-12: brief-check — the 5-dimension view

**Files:**
- Modify `src/app/ai/brief-check/_BriefCheckReport.tsx` (90 lines).
- Create `src/app/ai/brief-check/_dimensions.ts` (pure).
- Create `src/app/ai/brief-check/_dimensions.test.ts`.

**Interfaces:**
- `export const BRIEF_DIMENSION_LABELS: Record<BriefDimension, string>`:
  - laws «السند النظامي»;
  - princip «المبادئ القضائية»;
  - defenses «الدفوع والحجج»;
  - requests «الطلبات والمبالغ»;
  - style «الصياغة والأسلوب».
- `export function groupByDimension(findings: BriefFinding[]): Array<{ id: BriefDimension | "none"; label: string; findings: BriefFinding[] }>`:
  - groups in the fixed order of the five ids, then `"none"`, labelled «غير مصنّف»;
  - empty groups are dropped.
- `export function dimensionCounts(findings): Record<BriefDimension|"none", { high: number; medium: number; low: number }>`.

**UI:**
- A row of 5 colored chips, one per dimension, each with its finding count by severity; clicking a chip filters.
- Each finding shows its `quote` in a blockquote titled «المقطع كما قرأه الذكاء الاصطناعي».
- **No score, no %**, no "strength" number.
- The colors use explicit dark/light pairs (blue / purple / amber / red / emerald), never gray-100/200 text.

**Steps:**
- [ ] **Failing tests:**
  - `groupByDimension([{dimension:"style",…},{dimension:null,…},{dimension:"laws",…}]).map(g=>g.id) deepEqual ["laws","style","none"]`;
  - `dimensionCounts` counts high/medium/low per id;
  - `Object.keys(BRIEF_DIMENSION_LABELS).length === 5`.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(ai/brief-check): five-dimension view of the real findings`.

### Task S3-13: contract review — registry entry (250 points, up to 15 pages, no retrieval)

**Shared files:**
- `src/lib/ai/tools.ts`
- `src/lib/ai/toolPointsDisplay.ts`

**Files:**
- Modify `src/lib/ai/tools.ts`: add the constants and validators after the contracts-pro block (~:799) and the registry entry after `"contracts-pro"` (:1372-1387).
- Create `src/lib/ai/contractReview.test.ts`.

**Interfaces:**
- `export const CONTRACT_REVIEW_PRICE = 250`. Source: canonical item 9; the owner's q296 hides it until live.
- `export const CONTRACT_REVIEW_FILES: FileRules = { max: 1, maxPages: 15, maxBytes: 22 * 1024 * 1024 }`.
- `const REVIEW_RISKS = ["high","medium","low"] as const`.
- `const REVIEW_CATEGORIES = ["obligations","payment","liability","termination","dispute","confidentiality","ip","compliance","other"] as const`.
- `contractReviewInput(raw)` returns `{ represented_party (1–150, required), concerns (≤2000, optional), other_party (≤150, optional), contract_type (≤80, optional) }`. The error for a missing party is «حدّد الطرف الذي تمثّله».
- `contractReviewOutput(raw)` returns `{ summary (1–3000), overall_risk ∈ REVIEW_RISKS, clauses: 1..40 × { ref (≤200), quote (≤600), category ∈ REVIEW_CATEGORIES default "other", risk ∈ REVIEW_RISKS, issue (1–1200), defensive_edit (≤3000), negotiating_edit (≤3000) }, missing: ≤15 × { title ≤200, why ≤800 }, cited: ≤40 }` or `null`.
  - **Rejects (null → refund) any string field matching `PERCENT_PATTERN`.** Owner ١٩٣: no chances, no %.
    - Define `export const PERCENT_PATTERN = /[0-9٠-٩۰-۹]+([.,٫][0-9٠-٩۰-۹]+)?\s*[%٪]/u` in `tools.ts`. JavaScript's `\d` matches ASCII digits only.
    - Add `function hasPercent(v: unknown): boolean`, which walks strings, arrays and plain objects.
    - No such helper exists today: the wave-4 tools rely on word-only fields (`tools.ts:439-443`).
  - `cited` is enriched by the existing citation check exactly as brief-check's is (runCore enricher, `citation_check`).
- Registry entry `"contract-review"`:
  - `n8nPath "nzamy-ai/contract-review"`, `class "job"`, `tier "deep"`;
  - `roles` = the contracts-pro roles `["lawyer","firm","individual","corporate","micro","ngo"]` (the canonical document lists it for lawyers, item 9, and for individuals, «فحص عقد شخصي», :431);
  - `consultantBlocked: false`, `price: () => CONTRACT_REVIEW_PRICE`, `dailyLimit: 5`, `defaultMode: "off"`, `jobDeadlineSeconds: 15*60`;
  - `files: CONTRACT_REVIEW_FILES`, `filesRequired: () => true`;
  - **no `retrieval`**, so the library Pro gate (٤١٧) is not involved;
  - `validateInput` / `validateOutput` as above.
- **Not** added to the `/pricing` rows or hub badges.
  - If `pricingApprovals.test.ts`'s page-price table needs the id in `PRICED_AI_TOOL_IDS` to accept the page in S3-15, add it there.
  - At HEAD that list's only non-test consumer is `src/lib/ai/pointsStanding.ts:17-21`: the tool-id allow-list of the «رصيدك لا يكفي» check. It displays no price.
  - Re-grep before adding. If a new consumer renders the list, keep the ids out and exempt the two page rows in the test instead.

**Steps:**
- [ ] **Failing tests** (`contractReview.test.ts`):
  - `AI_TOOLS["contract-review"].price({}, {pages:15,turn:0}) === 250`;
  - `.files.maxPages === 15`;
  - `.retrieval === undefined`;
  - `.defaultMode === "off"`;
  - input without `represented_party` → `ok:false`;
  - an output with `issue: "احتمال الخسارة ٧٠٪"` → `null`;
  - a valid output with 2 clauses → `clauses.length === 2`, and an unknown category becomes `"other"`;
  - `clauses: []` → `null`.
- [ ] Run, expect FAIL, implement, run the unit suite.
- [ ] Commit `feat(ai): contract-review job in the registry — 250 points, one file up to 15 pages, off by default`.

### Task S3-14: contract-review n8n workflow — repo JSON plus import

**Files:**
- Modify `n8n/ai/workflows.mjs`:
  - a new `CONTRACT_REVIEW_PROMPT` (Arabic);
  - a new `AI_WORKFLOWS` row `{ tool: "contract-review", kind: "docJob", name: "NZAMY · AI · contract-review (مراجع العقود)", path: "nzamy-ai/contract-review", webhookId: <new v4 uuid>, prepare: docPrepare(CONTRACT_REVIEW_PROMPT), parse: DOC_PARSE, maxOutputTokens: 12000 }`, mirroring brief-check at :766-773.
- Create `n8n/ai/contract-review.json` via `node scripts/n8n-ai-export.mjs`.
- Extend `src/lib/ai/n8nWorkflows.test.ts`.
- Add a row to `n8n/ai/README.md`.

**Prompt rules:**
- read the uploaded contract only;
- split it into clauses, for the represented party;
- risk is a **word** (high/medium/low);
- each clause gets a defensive edit and a negotiating edit;
- missing clauses;
- `cited` lists articles as written, and the platform checks them;
- never a percentage or a chance;
- never invent names or amounts (`[....]`).

**Steps:**
- [ ] **Failing tests:**
  - the existing "every workflow matches its registry path" test now covers `contract-review`: the path equals `AI_TOOLS["contract-review"].n8nPath`, and the webhook id is unique;
  - a new test asserts the built prompt contains «لا تذكر نسبة» and `defensive_edit`.
- [ ] Run, expect FAIL, implement, export, run.
- [ ] Commit `feat(n8n): contract-review workflow (repo JSON)`.
- [ ] **STOP-POINT.** The user imports `n8n/ai/contract-review.json` into the live n8n, re-selects the credentials (README), and switches `contract-review` to `staff` in `/dashboard/admin/ai-usage` for a production test. `live` is the user's call.

### Task S3-15: contract review in `/ai/contracts` review mode (and `/ai/contract-reviewer` → 301)

**Shared files:**
- `src/proxy.ts`
- `src/constants/betaGatedRoutes.ts`
- `src/lib/betaConfig.ts`

**Files:**
- Create `src/components/contracts/steps/review/StepRAiReview.tsx`: the run plus the human order, mirroring `StepGenerate`.
- Create `src/components/contracts/ContractReviewReport.tsx`: the real results view.
- Create `src/components/contracts/contractReviewRun.ts` and `contractReviewRun.test.ts` (pure).
- Modify `src/app/ai/contracts/page.tsx:412-424`: the review `submit` step renders `StepRAiReview`.
- `src/proxy.ts` `REDIRECTS`: `"/ai/contract-reviewer": "/ai/contracts"`. Delete `src/app/ai/contract-reviewer/page.tsx` (`MOCK_RESULT`).
- Remove `/ai/contract-reviewer` from `betaGatedRoutes.ts:28` and its `betaConfig.ts` entry.
- Update `firmProfileReadiness.ts:337` and `floatingServices.tsx:392` to `/ai/contracts`; that row keeps «قريباً».
- **Leave** `StepRAnalysis.tsx`, `StepRDecisions.tsx` and `StepRReport.tsx` unreferenced on disk (owner decision ٤). Revive none of their mock matrix.

**Interfaces (pure, `contractReviewRun.ts`):**
- `export function contractReviewInput(s: { rPartyFocus: string; rFears: string; rOtherParty: string; contractType: string }): Record<string, unknown>`.
- `export function asContractReview(output: Record<string, unknown> | null): ContractReview | null`.
- `export function reviewRiskCounts(r: ContractReview): { high: number; medium: number; low: number }`.
- `export function contractReviewText(r: ContractReview, manual: Record<number, string>): string`. This is the copy/export text. A manual edit replaces the suggestion for that clause.

**UI behavior:**
- On mount, `GET /api/v1/ai/tool-status?tool=contract-review`:
  - **`usable: false`** → the step shows exactly today's human-order `StepSubmit` (the copy at :415 stays) and **no price**;
  - **`usable: true`** → the primary card reads «مراجعة العقد بالذكاء الاصطناعي — ٢٥٠ نقطة» (from `CONTRACT_REVIEW_PRICE`), and the human order becomes the optional collapsible block, as in `StepGenerate`.
- The run sends `files: [attachments[0].documentId]`, AI-readable only (`splitAiReadable`; a .docx says it must be PDF or an image).
- **The report:**
  - a risk matrix as category × risk **word** cells (counts of clauses), not numbers about outcome;
  - per clause: quote, issue, «تعديل دفاعي» and «تعديل تفاوضي» (copy buttons), and «تعديلي اليدوي» (a textarea, client state only);
  - missing clauses;
  - `CitationCheckList` of `citation_check`;
  - `AiResultActions text={contractReviewText(...)}`.
- Over 15 pages: the server refuses (`files.maxPages`), and the copy says «حتى ١٥ صفحة».

**Steps:**
- [ ] **Failing tests** (`contractReviewRun.test.ts`):
  - `contractReviewInput({rPartyFocus:"المستأجر",…}).represented_party === "المستأجر"`;
  - `asContractReview({summary:"s",overall_risk:"high",clauses:[…2],missing:[],citation_check:[]}).clauses.length === 2`;
  - `asContractReview({}) === null`;
  - `reviewRiskCounts` → `{high:1, medium:1, low:0}` for the fixture;
  - `contractReviewText(r, {0:"نصي"})` includes «نصي» and not the clause-0 `defensive_edit`.
- [ ] **Failing source tests:**
  - `contracts/page.tsx` renders `StepRAiReview` in the review submit step;
  - `StepRAiReview.tsx` contains `tool-status` and renders `CONTRACT_REVIEW_PRICE` only inside the `usable` branch;
  - `ContractReviewReport.tsx` contains no `%` and no `٪`;
  - REDIRECTS has `"/ai/contract-reviewer"`.
- [ ] Add the page-price row to `pricingApprovals.test.ts`, as at :318-323, for `CONTRACT_REVIEW_PRICE`.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(contracts): AI contract review in review mode (250, when live); /ai/contract-reviewer → 301`.

### Task S3-16: contract negotiator — registry entry (150 points)

**Shared files:**
- `src/lib/ai/tools.ts`
- `src/lib/ai/toolPointsDisplay.ts` (only if the price table needs the id)

**Files:**
- Modify `src/lib/ai/tools.ts`.
- Create `src/lib/ai/contractNegotiator.test.ts`.

**Interfaces:**
- `export const CONTRACT_NEGOTIATOR_PRICE = 150` (canonical item 10, q296).
- `export const NEGOTIATOR_CLAUSES_MAX = 10`.
- `contractNegotiatorInput(raw)` returns `{ our_party (1–150, required), contract_type (≤150, optional), clauses: 1..10 × { text (20–4000, required), their_demand (≤1500), our_goal (≤1500) } }`. The error for no clauses is «ألصق بنداً واحداً على الأقل (حتى ١٠ بنود)».
- `contractNegotiatorOutput(raw, input)` returns `{ summary (1–3000), clauses: exactly input.clauses.length × { index (0-based, matches its position), issue (≤1500), risk ∈ ["high","medium","low"], alternatives: 1..3 × { stance ∈ ["firm","balanced","flexible"], text (1–4000), rationale (≤1500) }, fallback (≤1500) }, cited: ≤40 }` or `null`.
  - It **rejects** any percentage (`hasPercent`, `PERCENT_PATTERN` from S3-13: Latin and Arabic-Indic digits, `%` or `٪`).
  - It rejects a clause count that differs from the input's.
- Registry entry `"contract-negotiator"`:
  - `n8nPath "nzamy-ai/contract-negotiator"`, `class "job"`, `tier "deep"`;
  - `roles ["lawyer","firm"]` (the only nav rows are the firm and lawyer sidebars, `navigation.sidebars.legal.ts:268`);
  - `consultantBlocked: false`, `price: () => CONTRACT_NEGOTIATOR_PRICE`, `dailyLimit: 5`, `defaultMode: "off"`, `jobDeadlineSeconds: 15*60`;
  - no files, no retrieval.

**Steps:**
- [ ] **Failing tests:**
  - price 150, `defaultMode "off"`, `retrieval` undefined;
  - 11 clauses → `ok:false`;
  - an output with 2 clauses for a 3-clause input → `null`;
  - an alternative with `rationale: "فرصة القبول ٨٠%"` → `null`;
  - an unknown stance → `null` (the whole clause is invalid, so the run is invalid).
- [ ] Run, expect FAIL, implement, run the unit suite.
- [ ] Commit `feat(ai): contract-negotiator job in the registry — 150 points, off by default`.

### Task S3-17: contract-negotiator n8n workflow — repo JSON plus import

**Files:**
- `n8n/ai/workflows.mjs`:
  - `CONTRACT_NEGOTIATOR_PROMPT`;
  - a row `{ tool: "contract-negotiator", kind: "caseJob", name: "NZAMY · AI · contract-negotiator (مفاوض العقود)", path: "nzamy-ai/contract-negotiator", webhookId: <new v4 uuid>, prepare: docPrepare(PROMPT), build: caseBuild(PROMPT), parse: CASE_PARSE, maxOutputTokens: 10000 }`, mirroring contract-drafter at :797-808.
- Export `n8n/ai/contract-negotiator.json`.
- `n8nWorkflows.test.ts`.
- The README row.

**Prompt rules:**
- three stances: firm, balanced, flexible;
- a rationale for each;
- a fallback position;
- no chances or percentages;
- no invented facts;
- keep the clause order.

**Steps:**
- [ ] **Failing tests:**
  - the registry-path test covers the new row;
  - the built prompt contains `firm`, `balanced`, `flexible` and «لا تذكر نسبة».
- [ ] Run, expect FAIL, implement, export, run.
- [ ] Commit `feat(n8n): contract-negotiator workflow (repo JSON)`.
- [ ] **STOP-POINT.** The user imports `n8n/ai/contract-negotiator.json` into the live n8n, re-selects the credentials, and sets the tool to `staff` for a production test.

### Task S3-18: `/ai/contract-negotiator` rebuilt on the real job

**Shared files:**
- `src/constants/betaGatedRoutes.ts`
- `src/lib/betaConfig.ts`

**Files:**
- Rewrite `src/app/ai/contract-negotiator/page.tsx`. Delete `MOCK_RESULT` (:36), the timers and the `BetaReviewGate` (:126-127, :286).
- Remove `/ai/contract-negotiator` from `betaGatedRoutes.ts:29` and `contract-negotiator.result` from `betaConfig.ts:139`.
- **The nav row `navigation.sidebars.legal.ts:268` keeps «قريباً»** (q296). The user removes the badge after going live; a later one-line change is listed in the release notes.

**UI:**
- On mount, call tool-status:
  - **`usable: false`** → `DashboardComingSoon`-style card «مفاوض العقود — قريباً» with no price;
  - **`usable: true`** → the form: our party, contract type, 1–10 clause blocks (text, their demand, our goal), and «حلّل وفاوض — ١٥٠ نقطة» from `CONTRACT_NEGOTIATOR_PRICE`.
- `useAiRun().start("contract-negotiator", input)`.
- **Result:** per clause, the issue, a risk word, three alternative cards (حازم / متوازن / مرن), each with its rationale and a copy button, and the fallback; then `CitationCheckList`; then `AiResultActions`.

**Steps:**
- [ ] **Failing source test** (`src/lib/services/cannedOutputGate.test.ts`, `"contract-negotiator runs the real job"`). The page:
  - contains `useAiRun` and `"contract-negotiator"`;
  - contains `tool-status`;
  - contains no `MOCK_`, no `BetaReviewGate`, no `setTimeout(`;
  - shows `CONTRACT_NEGOTIATOR_PRICE` only inside the usable branch.
- [ ] Add the price row to `pricingApprovals.test.ts`.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(ai): contract negotiator on the real job (150, when live)`.

---

## Part C — Wave 4e: client sharing

### Design (binding for S3-19 … S3-27)

- **Existing tables are not changed.**
  - `document_shares` (attachments; its guard trigger requires an attachment, `20261026_66`) keeps its RLS and its sha256 hashes.
  - AI work goes to a **new** table `client_shares`.
- **One feedback table** `share_feedback`. It points at exactly one of `document_shares(id)` or `client_shares(id)`. Rows are inserted **only by the service role**, from the guest route. The only session policy is the share owner's SELECT, plus admin.
- **One lockout table** `share_access`, keyed by `token_hash` and shared by both share kinds:
  - 5 wrong passcodes lock the link for 15 minutes (the tracking-links pattern, `20261026_62:148-149`);
  - it also stamps the first and last open and the open count;
  - it is written only through two security-definer functions that only `service_role` may execute.
- **Work shares always have a passcode.** It is hashed with **scrypt plus a per-row salt** (`node:crypto`, no new dependency) in `shareSecrets.ts`, never with plain sha256.
- **The passcode is re-sent and re-verified on every feedback POST.** It lives in React state only: no cookie, no storage.
- **Feedback** is allowed only on a share that has a passcode (`document_shares.passcode_hash` not null, or any work share), not expired and not revoked.
- **The snapshot** is the lawyer's edited document at share time:
  - stable section ids `s1…sN`;
  - `content_sha256` = sha256 of the canonical JSON;
  - an approval stores the `content_sha256` it approved.
- **A work share must reference the caller's own `succeeded` run** of `legal-drafter` (phase draft) or `contracts-pro`.
- **The history API** never returns `token_hash`, `passcode_hash` or the salt. Dates are formatted on the client.
- **Deploy order:** migration `_50` runs **BEFORE** the deploy. If the code arrives first:
  - the new routes answer `503 { error: "المشاركة مع العميل غير متاحة بعد — حاول لاحقاً" }` on Postgres `42P01` or PostgREST `PGRST205`;
  - the existing attachment verify path keeps working, with lockout skipped when `share_access` is missing (the IP strict bucket still applies).

### Task S3-19: scrypt passcode helpers

**Files:**
- Modify `src/lib/services/shareSecrets.ts`.
- Modify or create `src/lib/services/shareSecrets.test.ts`.

**Interfaces:**
- `export function hashPasscode(passcode: string): string` returns `"scrypt$16384$8$1$<saltHex32>$<hashHex64>"`. It uses `scryptSync(passcode, salt, 32, { N: 16384, r: 8, p: 1 })` with a 16-byte salt from `randomBytes`.
- `export function verifyPasscode(passcode: string, stored: string): boolean`:
  - parses the format;
  - returns `false` on any malformed value (never throws);
  - compares with `timingSafeEqual`.
- `export function isSixDigits(v: unknown): v is string` tests `/^\d{6}$/`.

**Steps:**
- [ ] **Failing tests:**
  - `verifyPasscode("123456", hashPasscode("123456")) === true`;
  - `verifyPasscode("123457", h) === false`;
  - two hashes of the same passcode differ (salt);
  - `verifyPasscode("123456", "sha256$x") === false`;
  - `verifyPasscode("123456", "") === false`;
  - `isSixDigits("12345a") === false`.
- [ ] Run, expect FAIL, implement, run.
- [ ] Commit `feat(share): salted scrypt passcode hashing for work shares`.

### Task S3-20: migration `20261103_50_client_shares.sql` plus its Docker test

**Shared files:**
- `supabase/migrations/_verify.sql` (append one block)

**Files:**
- Create `supabase/migrations/20261103_50_client_shares.sql`.
- Create `supabase/tests/rls/client_shares.test.sql`.
- Create `SQL_batch_2026-11-03_owner_free/` entry (copy plus README line: «يُشغَّل قبل النشر»), following the batch folder convention of the controller.

**Schema** (idempotent: `create table if not exists`, `drop policy if exists` / `create policy`, `create or replace function`; a guard `do $$` block raises if `public.ai_runs`, `public.document_shares.token_hash` or `public.is_admin()` is missing):

- **`public.client_shares`:**
  - `id uuid pk default gen_random_uuid()`;
  - `owner_id uuid not null references auth.users(id) on delete cascade`;
  - `source_tool text not null check (source_tool in ('legal-drafter','contracts-pro'))`;
  - `source_run_id uuid not null references public.ai_runs(id) on delete cascade`;
  - `title text not null check (char_length(title) between 1 and 200)`;
  - `snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and pg_column_size(snapshot) <= 400000)`;
  - `content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$')`;
  - `token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$')`;
  - `passcode_hash text not null check (passcode_hash like 'scrypt$%')`;
  - `expires_at timestamptz not null`;
  - `revoked_at timestamptz`;
  - `created_at timestamptz not null default now()`;
  - index `(owner_id, created_at desc)`.
- **RLS on `client_shares`:**
  - `client_shares_select_own` for select using `owner_id = auth.uid() or public.is_admin()`;
  - `client_shares_insert_own` for insert with check `owner_id = auth.uid()`;
  - `client_shares_revoke_own` for update using/with check `owner_id = auth.uid()`;
  - no delete policy;
  - trigger `guard_client_share_session_writes` (security invoker, `search_path=''`): for non-service users an UPDATE may change **only** `revoked_at`, from null to non-null; an INSERT requires `source_run_id` to be the caller's own `succeeded` run of `source_tool`.
- **`public.share_feedback`:**
  - `id uuid pk`;
  - `document_share_id uuid references public.document_shares(id) on delete cascade`;
  - `client_share_id uuid references public.client_shares(id) on delete cascade`;
  - `check (num_nonnulls(document_share_id, client_share_id) = 1)`;
  - `kind text not null check (kind in ('comment','approve','changes'))`;
  - `section_id text check (section_id ~ '^s[0-9]{1,2}$')`;
  - `body text check (body is null or char_length(body) between 1 and 2000)`;
  - `check (kind <> 'comment' or body is not null)`;
  - `author_label text check (author_label is null or char_length(author_label) <= 100)`;
  - `content_sha256 text`;
  - `created_at timestamptz not null default now()`;
  - indexes on both FKs.
  - **RLS:** `share_feedback_select_owner` for select using `exists(client_shares s where s.id = client_share_id and s.owner_id = auth.uid()) or exists(document_shares d where d.id = document_share_id and d.owner_id = auth.uid()) or public.is_admin()`. No insert, update or delete policy. `revoke insert, update, delete … from anon, authenticated`.
- **`public.share_access`:**
  - `token_hash text pk`;
  - `failed_attempts int not null default 0`;
  - `locked_until timestamptz`;
  - `open_count int not null default 0`;
  - `first_opened_at timestamptz`, `last_opened_at timestamptz`.
  - **RLS** enabled with **no** policies. `revoke all from anon, authenticated`.
- **`public.share_passcode_try(p_token_hash text) returns text`** (security definer, `search_path=''`, execute to `service_role` only):
  - upserts the row with a `for update` lock;
  - if `locked_until > now()`, returns `'locked'`;
  - if `locked_until` has passed, clears it and sets `failed_attempts = 0`;
  - if `failed_attempts >= 5`, sets `locked_until = now() + interval '15 minutes'`, sets `failed_attempts = 0` and returns `'locked'`;
  - otherwise increments `failed_attempts` and returns `'try'`.
  - Each attempt is counted **before** the passcode check, so concurrent guesses cannot exceed 5. A correct passcode on any of tries 1–5 is accepted, because `share_passcode_ok` then resets the counter.
- **`public.share_passcode_ok(p_token_hash text, p_open boolean) returns void`** (security definer, `service_role` only): sets `failed_attempts = 0` and `locked_until = null`; when `p_open`, increments `open_count` and stamps first and last open.
- **`public.share_history_for_owner(p_limit int default 50, p_before timestamptz default null)`** (security definer, `search_path=''`, `stable`, execute to `authenticated`, filters by `auth.uid()`). It returns a table of:
  - `kind` ('document'|'work'), `id`, `title`, `source_tool`;
  - `created_at`, `expires_at`, `revoked_at`;
  - `open_count`, `first_opened_at`, `last_opened_at`;
  - `feedback_count`;
  - `latest_decision` ('approve'|'changes'|null), `latest_decision_at`.
  - It is a union of the caller's `document_shares` (only rows with `token_hash` not null) and `client_shares`, left-joined to `share_access` and to `share_feedback` aggregates. It is ordered by `created_at desc` and limited to `least(p_limit, 100)`. **It returns no hash columns.**
- **The migration ends with a SELECT check:** `select (<all 3 tables exist> and <3 functions exist with the exact signatures> and <share_access has 0 policies> and <share_feedback has exactly 1 policy>) is true as ok;`. `ok` is never null (`coalesce(…, false)`).

**Steps:**
- [ ] **Failing Docker test** `supabase/tests/rls/client_shares.test.sql`, as two users A and B through `set_config('test.uid', …)` from `stubs.sql`:
  - A inserts a `client_shares` row for A's succeeded `contracts-pro` run → ok;
  - A inserts one for B's run → `42501`;
  - A inserts one for A's `failed` run → `42501`;
  - B selects A's share → 0 rows;
  - A updates `title` → `42501`;
  - A updates `revoked_at` → ok;
  - an `authenticated` insert into `share_feedback` → permission denied;
  - as service role, insert feedback on A's share; A selects it → 1 row; B → 0 rows;
  - `share_passcode_try` as `authenticated` → permission denied;
  - as service role, calls 1–5 return `'try'`, the 6th returns `'locked'`, and the 7th (still inside 15 minutes) returns `'locked'`;
  - after `update share_access set locked_until = now() - interval '1 second'`, the next call returns `'try'`;
  - `share_passcode_ok(h, true)` → `open_count = 1`, `failed_attempts = 0`, `locked_until` null;
  - `share_history_for_owner()` as A returns A's rows only, and its column list contains no `%hash%`;
  - running the migration twice succeeds (idempotent);
  - the final `ok` = true.
- [ ] Create the prelude `supabase/tests/rls/prelude_document_shares_fixture.sql`, following the precedent of `prelude_points_lots_fixture.sql`. It creates a minimal `public.document_shares (id uuid pk, owner_id uuid, document_id text, document_path text, title text, token text, token_hash text unique, passcode text, passcode_hash text, expires_at timestamptz, metadata jsonb, created_at timestamptz default now())` with RLS on and the owner select/update policies of `20261026_66:241-255`. `stubs.sql` already defines `public.is_admin()` (:31).
- [ ] Run the chain already proven to load `ai_runs` (`supabase/tests/rls/ai_runs.test.sql:8-21`), plus the prelude and `_50`. With `R=supabase/tests/rls; M=supabase/migrations`:
  `bash $R/run.sh $M/20260603_phase1_003_subscriptions_billing.sql $M/20260627_platform_settings.sql $M/20261019_10_library_access_grants.sql $M/20261022_10_payments_core.sql $R/prelude_points_lots_fixture.sql $M/20261022_20_points_lots.sql $M/20261027_10_ai_runs.sql $R/prelude_document_shares_fixture.sql $M/20261103_50_client_shares.sql $M/20261103_50_client_shares.sql $R/client_shares.test.sql`
  The migration is listed twice to prove re-runnability. Expect FAIL (files missing).
- [ ] Write the migration. Re-run until green. Append a `client_shares` block to `_verify.sql` (an `ok` row per check).
- [ ] Commit `feat(db): client_shares + share_feedback + share_access (20261103_50, run BEFORE deploy)`.

### Task S3-21: work snapshot validator plus `POST /api/v1/shares/work`

**Files:**
- Create `src/lib/shares/workSnapshot.ts` (pure) and `src/lib/shares/workSnapshot.test.ts`.
- Create `src/app/api/v1/shares/work/route.ts`.

**Interfaces:**
- `export interface WorkSnapshot { v: 1; title: string; preamble: string | null; alt_language: string | null; sections: Array<{ id: string; heading: string; body: string; heading_alt?: string; body_alt?: string }>; requests: string[] }`.
- `export function validateWorkSnapshot(raw: unknown): { ok: true; snapshot: WorkSnapshot } | { ok: false; error: string }`:
  - title 1–200;
  - preamble ≤ 6000;
  - sections 1–40, each heading 1–200 and body 1–12000 (alt fields only when `alt_language`);
  - requests ≤ 15 × ≤ 1000;
  - **ids are re-assigned server-side as `s1…sN`** (the client's ids are ignored);
  - the serialized JSON is ≤ 400000 bytes.
- `export function snapshotSha256(s: WorkSnapshot): string`: sha256 of `JSON.stringify` with keys in the fixed order above.
- `POST /api/v1/shares/work`:
  - body `{ runId: uuid, tool: "legal-drafter"|"contracts-pro", snapshot, expiresInHours?: 1–720 (default 72) }`;
  - `assertRole()` (frozen accounts are refused; satisfies `accountFreezeWrites.test.ts`);
  - an RLS-scoped read of `ai_runs` where `id = runId and status = 'succeeded' and tool = tool` (and, for legal-drafter, `output->>'phase' = 'draft'`) → 404 «العمل غير موجود» if absent;
  - `token = generateShareToken()`, `passcode = generatePasscode()`;
  - an RLS-scoped insert of `{ owner_id, source_tool, source_run_id, title, snapshot, content_sha256, token_hash: sha256Hex(token), passcode_hash: hashPasscode(passcode), expires_at }`;
  - `201 { url: "/share/<token>", passcode, expiresAt }`. This is the only time either is returned;
  - `42P01` / `PGRST205` → 503 with the design copy; `42501` → 403.

**Steps:**
- [ ] **Failing tests** (`workSnapshot.test.ts`):
  - two sections with client ids `x`, `y` → ids `s1`, `s2`;
  - 41 sections → `ok:false`;
  - a `body_alt` with `alt_language: null` → dropped;
  - `snapshotSha256` is stable across key order of the input and changes when one body character changes.
- [ ] **Failing source test** (`src/app/api/v1/shares/work/route.test.ts`, read as source):
  - contains `assertRole(`, `hashPasscode(`, `sha256Hex(token)`;
  - contains `.eq("status", "succeeded")`;
  - never contains `passcode_hash:` inside a `NextResponse.json(` call;
  - maps `42P01` to `503`.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(share): share an edited AI draft or contract with a client (hashed token, salted passcode)`.

### Task S3-22: the verify route serves both kinds, with a per-link lockout and open stamps

**Files:**
- Modify `src/app/api/v1/share/[token]/verify/route.ts`.
- Create `src/lib/shares/shareLookup.ts` (pure decision helpers) and its test.

**Interfaces:**
- `export function shareState(row: { expires_at: string | null; revoked_at?: string | null }, now: number): "ok" | "expired" | "revoked"`.
- **Route flow** (service role, unchanged lookup by `sha256Hex(token)`):
  1. Look up `document_shares` by `token_hash`; if absent, look up `client_shares`; if both are absent → 404 (unchanged copy).
  2. `shareState`: expired → 410 (unchanged); revoked → 410 «أُلغي هذا الرابط».
  3. If the share has a passcode:
     - `rpc("share_passcode_try", { p_token_hash })`;
     - `'locked'` → `423 { error: "أُقفل الرابط مؤقتاً بعد محاولات خاطئة — حاول بعد ١٥ دقيقة" }`;
     - compare: sha256 + `timingSafeEqual` for `document_shares` (unchanged), `verifyPasscode` for work shares;
     - a mismatch → 401 (unchanged copy).
  4. On success, `rpc("share_passcode_ok", { p_token_hash, p_open: true })`.
  5. The attachment branch is unchanged: `isShareServable` plus a signed URL. The work branch returns `200 { success: true, data: { kind: "work", title, document: snapshot, feedback: true } }`. The attachment success adds `kind: "attachment"` and `feedback: passcode_hash !== null`.
- If `share_access` or the RPCs are missing (`42883`, `PGRST202`, `42P01`), skip the lockout and stamps and continue. **The attachment flow must keep working before `_50`.**

**Steps:**
- [ ] **Failing tests:**
  - `shareState({expires_at: past}) === "expired"`;
  - `shareState({expires_at: future, revoked_at: now}) === "revoked"`.
- [ ] **Failing source test** (`verify/route.test.ts`):
  - contains `share_passcode_try` and `share_passcode_ok`;
  - contains `verifyPasscode(`;
  - still contains `isShareServable(`;
  - the response JSON never includes `passcode_hash` or `token_hash`;
  - a regression assertion: the missing-function codes `42883`/`PGRST202` lead to a continue, not a 500.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(share): verify serves AI work shares; 5 wrong passcodes lock a link for 15 minutes`.

### Task S3-23: `POST /api/v1/share/[token]/feedback` — comment, approve, request changes

**Shared files:**
- `src/lib/rateLimitRoutes.ts`
- `src/proxy.ts` (only if a new bucket constant is needed there)

**Files:**
- Create `src/app/api/v1/share/[token]/feedback/route.ts`.
- Create `src/lib/shares/feedbackInput.ts` (pure) and its test.
- Modify `rateLimitRoutes.ts`: a new per-visitor bucket for `/api/v1/share/[^/]+/feedback`. Policy `{ windowMs: 10*60*1000, max: 40 }` per visitor and `{ max: 400 }` per proxy-resolved IP. This is wider than the 10/10 min strict bucket, so a client can comment on every section.

**Interfaces:**
- `export function validateFeedback(raw: unknown, sectionIds: readonly string[] | null): { ok: true; value: { passcode: string; kind: "comment"|"approve"|"changes"; sectionId: string | null; body: string | null; authorLabel: string | null } } | { ok: false; error: string }`:
  - `passcode` must pass `isSixDigits`;
  - `comment` requires a body of 1–2000;
  - `approve` and `changes` allow a body of ≤ 2000;
  - `sectionId` must be in `sectionIds` (null for attachments, so any sectionId is refused there);
  - `authorLabel` ≤ 100.
- **Route** (no session, service role):
  - the same lookup, `shareState` and lockout as S3-22, re-run on **every** request;
  - a share without a passcode → `403 «لا يقبل هذا الرابط ملاحظات»`;
  - the feedback count is capped at 200 per share → `429 «بلغ هذا الرابط حدّ الملاحظات»`;
  - insert `share_feedback` (`content_sha256` = the work share's, on `approve`/`changes`);
  - `recordNotification({ userId: owner_id, title: kind === "approve" ? "اعتمد العميل: <title>" : kind === "changes" ? "طلب العميل تعديلات على: <title>" : "ملاحظة جديدة من العميل على: <title>", href: "/ai/share-history" })`;
  - `201 { success: true }`.
- `accountFreezeWrites.test.ts`: the handler reads no session. Confirm the walker accepts it as session-free, and add it to `ALLOWED` with the reason «client feedback on a share link: no account session» if the walker requires that.

**Steps:**
- [ ] **Failing tests** (`feedbackInput.test.ts`):
  - a `comment` with an empty body → `ok:false`;
  - `approve` with no body → ok;
  - `sectionId: "s3"` with ids `["s1","s2"]` → `ok:false`;
  - `sectionId: "s1"` with `null` ids → `ok:false`;
  - passcode `"12345"` → `ok:false`.
- [ ] **Failing test** (`rateLimitRoutes.test.ts`): `POST /api/v1/share/abc/feedback` matches the new bucket; `POST /api/v1/share/abc/verify` still matches strict.
- [ ] **Failing source test:** the route contains `share_passcode_try`, `recordNotification(` and `createServiceClient`, and does not contain `getUser(`.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(share): the client can comment, approve or ask for changes (passcode every time, owner notified)`.

### Task S3-24: `/share/[token]` — read, comment and approve

**Files:**
- Modify `src/app/share/[token]/page.tsx` (137 lines).
- Create `src/app/share/[token]/_ShareDocument.tsx`.

**UI:**
- **The passcode step is unchanged.** On 423, show the lock copy.
- **After verify:**
  - **`kind: "attachment"`** → today's download card. If `feedback`, a general comment box plus «أعتمد المستند» / «أطلب تعديلات».
  - **`kind: "work"`** → the document rendered from the snapshot. The title, the preamble, then each section (heading and body; bilingual sections side by side) with «أضف ملاحظة على هذا البند» (a textarea, `sectionId`), then the requests list. At the bottom, the name field (optional, «اسمك (اختياري)»), a general comment, and «أعتمد هذه النسخة» / «أطلب تعديلات».
- Every POST sends the passcode held in React state. **Nothing goes to localStorage, sessionStorage or cookies.**
- After «أعتمد»: «تم إرسال اعتمادك إلى المحامي».
- **No fake states.** A button shows sent/failed only from the real response.

**Steps:**
- [ ] **Failing source test** (`src/app/share/[token]/sharePage.test.ts`):
  - the page plus `_ShareDocument.tsx` contain `/feedback` and `passcode`;
  - they contain no `localStorage`, no `sessionStorage`, no `document.cookie`;
  - they contain no `Math.random` and no `setTimeout(`;
  - they do not contain the golden's client-side check `passcode.length === 6 &&` followed by `setIsAuthenticated(true)` without a fetch.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(share): the client reads the shared work and comments or approves it`.

### Task S3-25: `ClientSharePanel` in the drafter and in contracts

**Files:**
- Create `src/hooks/useWorkShare.ts`.
- Modify `src/components/contracts/ClientSharePanel.tsx`: add an optional `historyHref?: string` prop that shows «سجل المشاركات»; no other behavior change.
- Modify `src/components/draft/steps/StepAiDraft.tsx`: mount under the pleading.
- Modify `src/components/contracts/steps/draft/StepGenerate.tsx`: mount under the contract; the page passes the run id and the edited draft.
- Pure mappers in `src/lib/shares/workSnapshot.ts`.

**Interfaces:**
- `export function useWorkShare(): { link: string | null; passcode: string | null; generating: boolean; error: string | null; generate(args: { tool: "legal-drafter" | "contracts-pro"; runId: string; snapshot: unknown }): Promise<void>; reset(): void }`. It POSTs `/api/v1/shares/work`, and shows the passcode once with the panel's existing "shown once" copy.
- `export function pleadingSnapshot(p: Pleading): unknown` and `export function contractSnapshot(d: ContractsProDraft): unknown`. They map to the `WorkSnapshot` shape, and the server re-validates.
  - Every heading, body and request goes through `stripCitationMarkers` (`src/components/ai/CitedAnswer`), so the client never sees raw `[S…]` markers.
  - If that module imports React, move `stripCitationMarkers` into a pure file it re-exports, so `node --test` can load the mapper.
- The panel copy adds: «يرى العميل هذه النسخة كما هي الآن؛ أي تعديل بعد المشاركة يحتاج رابطاً جديداً».

**Steps:**
- [ ] **Failing tests:**
  - `pleadingSnapshot({title:"t",sections:[{heading:"a",body:"b"}],requests:["r"],citation_check:[]})` passes `validateWorkSnapshot` with `sections[0].id === "s1"`;
  - `contractSnapshot` of a bilingual draft keeps `body_alt`;
  - a section body `"نص [S1] آخر [S2]"` becomes `"نص آخر"` (markers stripped; whitespace collapsed exactly as `stripCitationMarkers` does).
- [ ] **Failing source test:**
  - `StepAiDraft.tsx` and `StepGenerate.tsx` contain `ClientSharePanel` and `useWorkShare`;
  - the snapshot argument is built from the **edited** object (S3-08/S3-09 variable names);
  - `useContractsState.generateShareLink` (the attachment-only path) is not used by these two mounts.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(share): share the edited pleading or contract with a client from the drafter and contracts`.

### Task S3-26: share history — API and page

**Shared files:**
- `src/proxy.ts` (remove `"/ai/share-history": "/settings"` at :350)
- `src/constants/navigation.sidebars.legal.ts` (optional link; skip it if the controller prefers no nav change)

**Files:**
- Create `src/app/api/v1/shares/route.ts` (GET list).
- Create `src/app/api/v1/shares/[id]/route.ts`:
  - `GET ?kind=work|document` returns its feedback;
  - `PATCH { kind, revoke: true }`.
- Rewrite `src/app/ai/share-history/page.tsx` (today a ComingSoon).
- Create `src/lib/shares/historyView.ts` (pure) and its test.

**Interfaces:**
- **`GET /api/v1/shares?before=<iso>`:**
  - `assertRole()`;
  - `rpc("share_history_for_owner", { p_limit: 50, p_before })`;
  - returns `200 { items: HistoryRow[], next: string | null }`;
  - `42883`/`PGRST202` → 503 with the design copy.
- **`GET /api/v1/shares/[id]?kind=…`:** an RLS-scoped `share_feedback` select. Columns: `kind`, `section_id`, `body`, `author_label`, `created_at`. Up to 200 rows, ascending.
- **`PATCH /api/v1/shares/[id]`:**
  - `work` → RLS update `client_shares.revoked_at = now()`;
  - `document` → RLS update `document_shares.expires_at = now()`. The existing policy `"document_shares owner update"` (`20261026_66:246-250`, `using/with check owner_id = auth.uid()`) and the guard trigger (which fixes only owner, document, path and token) allow it. No RLS change. Check that the update returns 1 row; 0 → 404;
  - `200 { success: true }`.
- `export function shareStatusAr(row: HistoryRow, now: number): "ملغى" | "منتهي" | "معتمد" | "طُلبت تعديلات" | "فُتح" | "لم يُفتح بعد"`. Precedence: revoked > expired > latest decision > opened > not opened.
- **The page** shows one card per share: title, kind (مستند / مذكرة / عقد), status chip, opens, feedback count, «عرض الملاحظات» (an expandable list by section), and «إلغاء الرابط». **Dates are formatted in a `useEffect` on the client.**

**Steps:**
- [ ] **Failing tests** (`historyView.test.ts`):
  - a revoked row → «ملغى»;
  - an expired row with an approve → «منتهي»;
  - a live row with an approve → «معتمد»;
  - `open_count 0` → «لم يُفتح بعد».
- [ ] **Failing source tests:**
  - the page contains no `DashboardComingSoon`;
  - `toLocaleDateString` is called only inside `useEffect` or an event handler (match the pattern used in the SSR-date tests, `grep -rn "ssr" src/**/*.test.ts`);
  - `proxy.ts` has no `"/ai/share-history"` key;
  - the GET route never selects `token_hash` or `passcode_hash`.
- [ ] Update `cannedOutputGate.test.ts`, which today asserts that share-history is ComingSoon.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(share): share history with status, client notes and revoke`.

### Task S3-27: case sharing page (last) — the case's documents only

**Files:**
- Rewrite `src/app/dashboard/lawyer/cases/[id]/sharing/page.tsx` (today a ComingSoon).
- Extend `GET /api/v1/shares` with an optional `documentIds` filter (comma list, ≤ 100 numeric ids, filtered in TypeScript after the RPC; never `.in()` past 100).

**Scope:**
- list the case's attachments **uploaded by the signed-in lawyer** (same read as the case page: `caseData.attachments` filtered by `owner_user_id === user.id`);
- each one has «مشاركة مع الموكل», which opens the existing `src/components/documents/ShareDocumentModal.tsx` (real `POST /api/v1/share`);
- below, the shares already made for these documents, with status, notes and revoke (reusing S3-26's components);
- a note at the top: «تشارك هنا مستندات بعينها فقط؛ لا يرى الموكل القضية ولا جلساتها ولا جدولها الزمني من هذا الرابط».
- **Out of scope:** timeline, hearings or guest visibility toggles (see Excluded).

**Steps:**
- [ ] **Failing source test:**
  - the page contains `ShareDocumentModal` and `/api/v1/shares`;
  - it contains no `DashboardComingSoon` and no `SHAREABLE_ITEMS`;
  - it contains the scope note.
- [ ] **Failing test** for the `documentIds` parser (pure, in `historyView.ts`): `parseDocumentIds("1,2,x") → ["1","2"]`; 101 ids → the first 100.
- [ ] Run, expect FAIL, implement, run the unit suite plus the build.
- [ ] Commit `feat(cases): share chosen case documents with the client, with their status and notes`.

---

## Release notes for the controller (no code)

- **Order:**
  1. run `20261103_50` (BEFORE the deploy);
  2. deploy;
  3. STOP-POINT imports: brief-check (S3-11), contract-review (S3-14), contract-negotiator (S3-17);
  4. admin sets the two new tools to `staff`, tests, then `live`;
  5. a one-line follow-up removes «قريباً» from the negotiator and reviewer nav rows once they are live.
- **`_verify.sql`:** the user runs it by hand after the migration.
- **Owner report lines:**
  - case-brief merged into عصارة المرفقات;
  - research, corporate and NGO contract 301s;
  - micro contract cards;
  - quick answer UI (still 20 points, no free question until ٤١٢);
  - manual section and clause editing;
  - the brief-check five dimensions;
  - contract review 250 and negotiator 150 (hidden until live, q296);
  - client sharing with comments and approval;
  - share history;
  - case document sharing.

## Estimate

- **Tasks:** 27. Part A has 6, Part B has 12, Part C has 9.
- **Days:** about **19 developer-days**:
  - A ≈ 3.5;
  - B ≈ 8 (S3-15 contract-review UI ≈ 1.5 and S3-18 ≈ 1);
  - C ≈ 7.5 (S3-20 migration plus Docker test ≈ 1.25).
- **Stop points:**
  - S3-11, S3-14, S3-17: live n8n imports;
  - no new npm dependency (scrypt is `node:crypto`);
  - no RLS change on an existing table (`document_shares` is only referenced by a new FK, and its revoke uses the existing owner policy).

## Excluded, each with its blocker

| Item | Blocked by |
|---|---|
| analyze-strength folded into wargaming, the win-% gauge, and the analyze-strength + memo-studio 301s | ٤١٤ (and the wargaming price, ٤٠٩) |
| `/ai/communicate` → legal-opinion redirect | ٤١٥ |
| Najiz v5.2 rules and prompt, and the condensation price | ٤١٦ |
| New n8n tools of 4b (direction-support, compare, legal-translate, monitor impact, mail-advisor, templates, corp hr/compliance/advisor/privacy) | ٤٠٨ (only after he agrees) |
| Legal-opinion completion 4c (study, memo, cross-exam, due diligence) | ٤٠٨ |
| «عدّل هذا القسم» as a priced AI action in the drafter, and the in-drafter wargame | ٤١٠ |
| Quick answer at 15 points with one free question a day for individuals | ٤١٢ |
| Showing an ungrounded procedural answer | ٤١٣ |
| Opening quick answer, case-brief or the negotiator to more account types | ٤١٧ |
| case-brief over 30 pages at +5/page | ٤٢٨ |
| Contract review's "3 contracts a year included" in the smart and legal-protection plans | ٤١٩ / ٤٢٠ |
| Any golden-screen restore (copying a golden file) | ٤٠٨, and the dispatch rule |
| AI «صياغة بديلة لبند» (revise a clause) in contracts | None open yet: a new owner question is needed (no price anywhere) |
| Case sharing beyond chosen documents (timeline, hearings, guest visibility scopes) | None open yet: a new owner question is needed («ما الذي يراه الموكل من قضيته») |
| Contract review over 15 pages at +10/page up to 100 | Technical, not an owner question: no file rule in the codebase exceeds 30 pages / 22 MB within the 15-minute job deadline. It needs a capacity test first |
| Audio in عصارة المرفقات, interactive Q&A | An outside service (speech-to-text provider), Wave 8 |
| Founder-plan credits on contract review or the negotiator | Not in the founder credit tool list (`20261101_10:742`); founder decisions are not in this section |

## Not in this section (seen, left alone)

- `SendToDrafterButton` stays unmounted. Mounting it under the real case-brief result is the collector hand-off of Wave 3.
- `useContractsState.startBPSearch` (`setTimeout` 2200) sits in the unreferenced BestPractices path. It is dead, but not this section's to delete.
