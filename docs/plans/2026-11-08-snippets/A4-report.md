# A4 report — ٤١٧ roles, ٤٤٣ links, ٤٣٩ page count, ٤٤٠ percentages, ٤٤١ name

Branch `t/table`, worktree `D:\nzwt\b1108-table`. One commit per item:

| Item | Commit | Subject |
|---|---|---|
| ٤١٧ | `b3269898` | lawyer tools for lawyers and firms only |
| ٤٤٣ | `63b6a672` | lawyer tool links hidden from other accounts; no pending promises |
| ٤٣٩ | `0c17b265` | a page is 3000 counted characters, no tashkeel, one space a run |
| ٤٤٠ | `8586dcd7` | a contract's own rate passes only when the input states it verbatim |
| ٤٤١ | `4e05034c` | «عصارة المرفقات» is the case-brief tool's only name |

No migration and no SQL. No change to `_verify.sql`, `sqlMergeHygiene.test.ts`, owner docs or SQL READMEs.

## ٤١٧ — final role table (src/lib/ai/tools.ts)

Admin passes every role check (`toolRoleRefusal` returns null for admin). «consultant blocked» means a lawyer whose practice kind is consultant is refused as well.

| Tool id | Roles | Consultant blocked |
|---|---|---|
| `legal-drafter` | lawyer, firm | yes |
| `contracts-pro` | lawyer, firm | no |
| `contract-review` | lawyer, firm | no |
| `contract-negotiator` | lawyer, firm | no |
| `case-brief` | lawyer, firm | no |
| `wargaming` | lawyer, firm | yes |
| `analyze-strength` | lawyer, firm | yes |
| `najiz-optimizer` | lawyer, firm | yes |
| `brief-check` | lawyer, firm | yes |
| `communicate` | lawyer, firm | no |
| `assistant` | lawyer, firm | no |
| `canvas-card` | lawyer, firm | no |
| `contract-drafter` | lawyer, firm | no |
| `quick-answer` | every registered type (REGISTERED_ROLES) | no |
| `legal-opinion-consult` | every registered type (REGISTERED_ROLES) | no |
| `legal-opinion-letter` | every registered type (REGISTERED_ROLES) | no |
| `library-assistant` | LIBRARY_ROLES (unchanged) | no |
| `echo-fast`, `echo-job` | lawyer, firm (unchanged) | no |

There are three layers of guard:

1. **Server.** `POST /api/v1/ai/runs` → `startRunWith` returns 403 `role` before reading `platform_settings`, before any rpc, and before any n8n call.
2. **Edge.** `src/proxy.ts` and `routeAccess.ts` (generated from `LAWYER_ONLY_AI_PAGES`) send an individual, corporate, micro, NGO, government or provider account back to its own dashboard from these pages:
   - /ai/contracts
   - /ai/contract-negotiator
   - /ai/contract-drafter
   - /ai/wargaming
   - /ai/analyze-strength
   - /ai/najiz-optimizer
   - /ai/brief-check
   - /ai/communicate
   - /ai/assistant
3. **Client fallback.** The /ai layout renders `LawyerOnlyToolNotice` instead of the page. It offers «اطلب استشارة», «سؤال قانوني سريع» and «الرأي القانوني».

The /ai hub and quick-answer follow-ups also hide those pages. /ai/draft (legal-drafter) and /ai/analyze (case-brief) are not edge-blocked, because they split by role inside the page. The server 403 still applies to them.

The doc comments were rewritten for the 8 Nov answer. `git log -S REGISTERED_ROLES` showed that 4bf783dd had opened these tools to every account; that change has been reverted.

## ٤٤٣ — links hidden, per role

Lawyer, firm and admin see everything as before. For every other role:

- **Individual client**
  - Sidebar: «محترف العقود المختصر» (/ai/contract-drafter) removed.
  - Dashboard quick services: «صياغة عقد» (/ai/contract-drafter) removed, along with the «اسأل ذكاء نظامي · قريباً» hero button and quick-service (/ai/consult). They are replaced by «سؤال قانوني سريع» (/ai/quick-answer) and «الرأي القانوني» (/ai/legal-opinion).
  - client/services: «صياغة عقد مخصص» hidden (filtered by `isLawyerOnlyAiHref`).
  - client/contracts: the AI contract button now reads «اطلب استشارة» and opens /dashboard/client/consultation/new.
- **Corporate (company)**
  - Navbar: «محترف العقود» (/ai/contracts) removed.
  - Floating services: `corp-legal-draft` and `corp-contract-ai` removed.
  - /ai/corp/deal-intel and /ai/corp/risk-assessment: the /ai/contracts link is drawn only for lawyer, firm or admin (`LawyerToolLink`).
- **NGO**
  - Sidebar and navbar: «محترف العقود» (/ai/contracts) removed.
  - Floating services: `ngo-volunteer-contract` removed.
  - ngo dashboard: the AI_TOOLS contracts card removed.
  - ngo/contracts: the /ai/contracts button removed.
  - ngo/volunteers: the /ai/contracts button and secondary action removed, and «أو صياغة عقد تطوع» dropped from the description.
- **Micro (small business)**
  - micro/contracts: the /ai/contracts button removed.
  - micro/requests: the «محترف العقود» row removed.
- **Government and provider:** no lawyer-tool rows were in their menus. The welcome bar changes are below.
- **Shared screens any account opens** (drawn only for lawyer, firm or admin):
  - /ai/contracts links on /ai/debt-collection, /ai/fee-calculator and /ai/templates.
  - /ai/wargaming in the translation tool.
  - The /ai/brief-check card in DraftPreStep.
  - «اقترح سنداً نظامياً» in the business kanban case graph.
- **Business services page (/services/labor):** «حلل قضيتي» now opens /dashboard/client/consultation/new instead of /ai/analyze-strength. Its badge reads «استشارة مع محامٍ من نظامي».

### Welcome bar (src/components/OnboardingBanner.tsx): removed text

| Role | Removed | Now |
|---|---|---|
| client | «أو تواصل مع محامٍ متخصص»; action «ابحث عن محامٍ» (/dashboard/client/find-lawyer) | «قدّم طلب خدمة أو استشارة، أو استخدم المجيب السريع…»; action «اطلب استشارة» |
| business | «اربط مستشارك القانوني، وتابع العقود والتراخيص، وأنشئ طلبات الرأي القانوني من لوحة تحكم واحدة.»; actions «قدّم طلب قانوني» /dashboard/business/requests, «مراجعة العقود» /dashboard/business/contracts, «الحوكمة والامتثال» /dashboard/business/governance | «اطلب خدمة قانونية أو استشارة، وتابع طلبات منشأتك من لوحة تحكم واحدة.»; actions client/services, consultation/new, client/requests |
| government | «راجع اللوائح، وأنشئ الصكوك، …»; action «اللوائح والتعليمات» (/dashboard/government/regulations, a dead page) | «تابع قضايا الجهة، واطلب الرأي القانوني، بكفاءة وشفافية.» |
| ngo | «ورفع التقارير، وتنظيم الفعاليات والعقود»; actions «إنشاء تقرير» (/ai/ngo/report-generator, قريباً) and «إدارة الفعاليات» (/dashboard/ngo/events, dead) | «إدارة المتطوعين والتقارير والامتثال…»; actions «التقارير الدورية», «الرأي القانوني» |
| provider | «لعرض خدماتك على آلاف العملاء» | «أكمل ملفك المهني، وابدأ بقبول الطلبات الواردة.» |
| micro | «وأنشئ عقودك الأولى»; action «إنشاء عقد» (/ai/contracts) | «…واحصل على التوجيه العام بخطوات واضحة.»; action «الرأي القانوني» |

## ٤٣٩ — page count

- **The rule.** `src/lib/ai/pageCount.ts` is new, pure and has no imports. It is the single rule:
  1. Strip U+064B–U+065F, U+0670 and U+0640.
  2. Collapse each run of whitespace (`\s+`) to one space.
  3. Trim.
  4. Count 3000 characters per page, with a minimum of 1 page.
- **Who uses it.**
  - `textExtract.ts` re-exports it, so `aiFiles.ts` (file pages and caps) and `runCore.ts` (pasted-text pages, page price and the 30/150 caps) use it.
  - `tools.ts pastedText` (server) and `aiReadable.pasteState` (browser counter on brief-check, wargaming and contract-review) both call `measurePaste`.
  - There was no other client-side page or price preview.
- **The text the model reads is unchanged.** Validators keep the trimmed original, and the file link serves the original.
- **Raw ceiling.** A paste is also refused past 2× its limit in raw characters, so the raw size stays bounded.
  - `TEXT_FILE_MAX_CHARS` goes from 90,000 to 180,000 raw (2 × 30 pages). Otherwise a fully vocalised 30-page file would be refused as "too long".
  - It is also the cap on what a text link serves, so whatever passes the count is served whole.

## ٤٤٠ — percentages in contract-tool output

- **New helpers.** `percentsOutsideInput(output, inputTexts)` and `canonicalPercent` in tools.ts. Normalisation:
  - Arabic-Indic and Persian digits become Latin.
  - «٫», «,» and «.» become «.».
  - Leading zeros and trailing fraction zeros are dropped.
  - % and ٪ are treated the same, and the space before the sign is ignored.
- **What counts as the input contract.**
  - contract-review: the pasted `contract_text`. It is stored in `ai_runs.input` and read back at the callback.
  - contract-negotiator: the pasted clause texts only, not `their_demand` or `our_goal`.
- **With no contract text, every percentage still fails** (owner ١٩٣).
- **n8n.** Only a comment changed in workflows.mjs. The regenerated JSON differed only in line endings and was checked out. The live prompts still ask for rates in words, which pass, so the live n8n needs no change. Allowing digits in the prompt would be a separate prompt change.

## ٤٤١ — name

- The CaseBriefStudio heading now reads the registry label (`aiToolLabelAr("case-brief")` = «عصارة المرفقات»).
- The «الخطوة صفر» badge is removed.
- Two sentences that called the tool «الموجز» now say «الأداة».
- Comments in navigation.sidebars.legal.ts, tools.ts, caseBrief.test.ts and n8n/ai/workflows.mjs drop both old names.
- The id `case-brief`, the page /ai/analyze and the label key are unchanged.
- workflows.mjs changed only in a comment. The regenerated JSON had only line-ending churn and was checked out. The live n8n workflow's prompt never carried the old names, so **the live workflow needs no change**.

## ٤٤٢ / ٤٠٨ — confirmation only (no change)

- **٤٠٨ — confirmed.** contract-review and contract-negotiator are off until an admin opens them.
  - /ai/contract-negotiator shows «مفاوض العقود — قريباً» with no price.
  - /ai/contracts hides the AI review branch (`useToolUsable("contract-review")`) and offers the team path.
  - The legal sidebar rows carry «قريباً».
  - `toolPointsDisplay.ts` keeps both out of /pricing and the hub badges. No screen prints 250 or 150 points before the tool is usable.
- **٤٤٢ (a) letterhead white-label — NOT what the code does today.**
  - The generated letterhead footer carries the Nezamy brand:
    - on screen and in print: `src/components/letterhead/Letterhead.tsx` `LetterheadFooter` shows the wordmark, «صادر عبر منصة نظامي» and nezamy.sa;
    - in Word: `src/lib/docx/letterheadDocx.ts` puts `PLATFORM_STAMP_AR` in the generated footer.
  - The QR captions also name منصة نظامي.
  - Only an office's own uploaded Word template is white-label.
  - Not changed (confirm-only). Needs a ruling.
- **٤٤٢ (b) AI disclaimer screen-only — true except for one tool.**
  - The shared export (`AiResultActions`) adds no disclaimer.
  - But /ai/analyze-strength exports `strengthReportText`, which ends with `STRENGTH_DISCLAIMER`. This follows owner ٤١٤ (7 Nov): «on the screen and at the end of the exported text».
  - Not changed. Needs a ruling on whether ٤٤٢ (b) overrides ٤١٤.

## الملخص للمالك

**٤١٧ — أدوات المحامين للمحامين والمكاتب فقط**
عادت أدوات العمل القانوني الثلاث عشرة للمحامي ومكتب المحاماة وحدهما: الصائغ، ومحترف العقود، ومراجع العقود ومفاوضها، وعصارة المرفقات، والمحاكاة، وتحليل القوة، ومحسّن ناجز، ومراجعة المذكرة، والتواصل، والمساعد المتقدم، وبطاقة اللوحة، ومحترف العقود المختصر.
أما السؤال السريع والرأي القانوني (الاستشارة والخطاب) فمتاحة لكل حساب مسجّل.
الحماية على ثلاث طبقات: الخادم يرفض التشغيل قبل أي خصم، والصفحة تعيد الحساب غير المحامي إلى لوحته، والشاشة تعرض بديلاً هو «اطلب استشارة».

**٤٤٣ — إخفاء روابط أدوات المحامين عن الحسابات الأخرى**
أُزيلت روابط أدوات المحامين من قوائم الأفراد والشركات والجمعيات والمنشآت الصغيرة، ومن لوحاتهم وخدماتهم العائمة وشريط الترحيب.
زر «حلل قضيتي» في صفحة الخدمات العمالية يفتح الآن نموذج طلب الاستشارة.
حُذفت من شريط الترحيب الوعود غير المفعّلة، مثل «إدارة الفعاليات» و«اللوائح والتعليمات» و«إنشاء تقرير» و«لعرض خدماتك على آلاف العملاء»، ومعها رابطان إلى صفحتين غير موجودتين.

**٤٣٩ — عدّ الصفحات**
الصفحة ٣٠٠٠ حرف تُعدّ بعد حذف التشكيل والتطويل وجعل المسافات المتكررة مسافة واحدة.
النص يصل إلى النموذج كما كتبه المستخدم دون أي تغيير.
تستعمل الشاشة والخادم دالة واحدة، فيتطابق العدّاد الظاهر مع ما يُحتسب.
ولكي لا يُرفض ملف مشكول بالكامل، رُفع السقف الخام للملف إلى ضعف الثلاثين صفحة، ويبقى الحد الفعلي ٣٠ صفحة بالعدّ الجديد.

**٤٤٠ — النسب المئوية في نتائج أدوات العقود**
تُقبل النسبة في نتيجة مراجعة العقد أو المفاوض فقط إذا وردت بنصها في العقد الملصوق، أيّاً كانت كتابة أرقامها أو علامتها.
أي نسبة أخرى تُفشل التشغيل ويُستردّ المبلغ.
وإذا رُفع العقد ملفاً ولم يُلصق نصه، تبقى كل نسبة مرفوضة كما كان.

**٤٤١ — اسم الأداة**
«عصارة المرفقات» هو الاسم الوحيد للأداة.
حُذف «الموجز القضائي» و«الخطوة صفر» من الشاشة ومن الشيفرة، ولم يتغيّر رابط الأداة ولا معرّفها.
لا يلزم أي تعديل على n8n الحي.

## Tests

- **Full unit suite.** `npm run -s test:unit` after each item: 6324 tests, 6318 pass. The 6 failures are the known baseline:
  - T28-24 volume series
  - lawyer dashboard consultant
  - end read ends_at
  - grantPurchase keys
  - maker-rule policies
  - trackingWiring no-v1
- **Type check.** `npx tsc --noEmit -p .` is clean.
- **New tests.**
  - `src/lib/ai/lawyerOnlyTools.test.ts` covers:
    - the map against the registry;
    - the matcher;
    - the edge rules and PROTECTED;
    - the layout notice;
    - the hub and quick-answer filters;
    - three ٤٤٣ scans: non-lawyer menus/dashboards/navbar/floating/banner, LawyerToolLink wiring, and the welcome bar.
  - toolRoles.test.ts:
    - a role-table test;
    - a `startRunWith` 403 for individual and corporate × legal-drafter and case-brief × tool off/staff/live, with no rpc, no platform_settings read and no n8n call.
  - `src/lib/ai/pageCount.test.ts`: tashkeel-heavy text, repeated whitespace, the raw ceiling, the browser and the server agreeing, and the original text being kept.
  - aiFiles: a vocalised 30-page .txt counts as 30 pages.
  - contractReview and contractNegotiator: verbatim passes, a different rate fails, no input fails, and a rate that appears only in the demand fails.
  - caseBrief: the old names are absent and the heading uses the label.
- **Updated source-contract tests.** No coverage deleted. Updated files:
  - betaGatedRoutes
  - proxyRedirects
  - cannedOutputGate
  - toolStatus
  - assistant, caseBrief, legalDrafter, n8nWorkflows
  - contractDrafter, contractsPro, contractNegotiator, contractReview
  - textExtract

## Impact analysis

The GitNexus index for `latest-nzamy-full` is stale: `impact` returns "target not found" for `textPages`, `pastedText` and the other symbols, so it could not rank the risk.

`detect_changes` (compare against the last commit) reports risk **LOW** with no indexed symbols matched.

The callers found by search instead:

- `textPages`: aiFiles.resolveAiFiles and runCore.startRunWith (paste pages).
- `pastedText`: the brief-check, wargaming and contract-review validators.
- `pasteState`: the brief-check, wargaming and contract-review screens.
- `contractReviewOutput` / `contractNegotiatorOutput`: only the registry's `validateOutput`, called by runCore settle.
- `ROUTE_ACCESS` and `PROTECTED`: the edge proxy, for 9 more /ai prefixes.

**My own estimate is MEDIUM.** The money paths are unchanged in shape, but who may run 13 tools has changed.

## Concerns and open questions

1. **٤٤٢ (a)** The generated letterhead is not white-label (Nezamy stamp, wordmark, nezamy.sa and QR captions). Should the platform stamp be removed, or kept only on the free tier?
2. **٤٤٢ (b) vs ٤١٤** analyze-strength's exported text ends with the ٤١٤ disclaimer. Does "screen-only" override ٤١٤? (Now lawyer-only, so the reach is small.)
3. **٤١٧ vs ٤٤٥/٤١٩** The owner priced contract drafting for individuals (100–150). contract-drafter is now lawyer and firm only, so an individual has no self-service contract drafting, only a consultation request. The `contract-draft` row in clientServiceCatalog and the DB pricing row still exist; they are only hidden in the UI.
4. Clients lose the self-service /ai/brief-check and /ai/wargaming entries (edge-blocked). The team-order paths remain.
5. A guest opening one of the newly PROTECTED /ai pages is sent to login rather than shown a marketing page.
6. `userPermissions.ts` still grants `ai:contracts` and similar permissions to client plans. These are unused for gating (the href filter decides), but they are misleading.
7. **٤٥١** quick-answer and legal-opinion still require the library tier, so a non-Pro non-lawyer account sees «سؤال قانوني سريع» and «الرأي القانوني» but is refused with the tier copy.
8. **٤٣٩** The raw file and link ceiling doubled (90k → 180k characters). Model input per run can be up to twice as long in raw characters for heavily vocalised text, though prices follow the counted pages.
9. **٤٤٠** For an uploaded contract file (the main path) the server never has the text, so any digit percentage still fails the run. The prompts' "write rates in words" rule stays necessary.
10. The negotiator does not accept a rate stated only in the other side's demand. Confirm that is intended.
