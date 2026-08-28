# تدقيق حسابَي العميل والشركة — ٢٧ أغسطس ٢٠٢٦

تدقيق آلي على **٤٦ مسار** (٢٢ للعميل، ٢٤ للشركة) بسبعة وكلاء قراءة،
وكل ملاحظة راجعها وكيل ثانٍ مهمته **تكذيبها** لا تأكيدها.

| | العدد |
|---|---|
| ملاحظات مرفوعة | 84 |
| **نجت من التكذيب** | **77** |
| سقطت في المراجعة | 7 |
| حرجة | 8 |
| مرتفعة | 28 |
| يصل لها مستخدم حقيقي في الإنتاج | 65 |

> **مستثنى عمداً:** الكود المحجوب بوضع العرض (بيتشال من بناء الإنتاج)،
> ومسارات `/marketplace` و`/lawyers` (محوّلة بـ`BETA_MONOPOLY_MODE`)،
> والعلامات الصادقة «غير متاحة حالياً».

---

## ⚠️ الحالة اليوم — ٢٨ أغسطس ٢٠٢٦

| الخطورة | العدد | الحالة |
|---|:-:|---|
| حرجة | ٨ | ✅ أُصلحت |
| مرتفعة | ٢٨ | ✅ **أُغلقت كلها** |
| متوسطة | ١٨ | ✅ ١٦ مغلقة · ٢ تنتظران تنفيذ المايجريشن |
| منخفضة | ٢٣ | ✅ ١٤ مغلقة · ١ أُصلحت · ٨ تنتظر قرار المالك (خلف الحارس) |

**أُعيد التحقّق من الـ٦٩ الباقية كلها في ٢٨ أغسطس، فتبيّن أن ٥٦ منها كانت مغلقة
أصلاً** بأثر `84ce53d` و`5ed05e3`. ثم هاجم وكيلٌ مستقلٌّ الأحكام بالإغلاق فأعاد
**واحدة** إلى الحياة (`high-14` — تبويب الإحالات في الإعدادات).

> **أرقام السطور في هذا الملف من ٢٧ أغسطس، وأكثرها لم يعد صحيحاً** — الالتزامان
> أعلاه عدّلا هذه الملفات بعد كتابته. **اقرأ الوصف، لا الرقم.**

السجل الكامل — حكم لكل ملاحظة، وما صمد أمام التكذيب، وما سُجِّل ولم يُصلَح:
[`2026-08-28-client-corporate-record.md`](2026-08-28-client-corporate-record.md)

---


## حرج — 8

### 1. Client dashboard home renders 3 fabricated legal documents tied to invented case numbers

- **الملف:** `src/app/dashboard/client/page.tsx:523`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة العميل الرئيسية والقضايا
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Log in as any individual client -> /dashboard/client (the sidebar's first item, and the post-login landing page). The «مستنداتي» card at line 510 is a bare <div className={card}> with NO length guard, NO isSupabaseMode/isDemoUiEnabled gate and NO demo label — unlike the Messages card directly above it, which is guarded by RECENT_MESSAGES.length > 0. Every client sees these three rows, including a brand-new account with an empty vault. Each row links to /dashboard/client/documents, where they do not exist. A hearing transcript («محضر الجلسة») and a legal notice attributed to «قضية ٢٠٢٥-٠٠١» are statements about the user's own legal file.

```
{ name: "عقد التوظيف.pdf", type: "PDF", date: "١٢ أبريل ٢٠٢٦", case: "قضية ٢٠٢٥-٠٠١" },
{ name: "إشعار قانوني.docx", type: "Word", date: "٨ أبريل ٢٠٢٦", case: "قضية ٢٠٢٥-٠٠٢" },
{ name: "محضر الجلسة.pdf", type: "PDF", date: "١ مارس ٢٠٢٦", case: "قضية ٢٠٢٥-٠٠١" },
```

> **المراجع:** Verified at src/app/dashboard/client/page.tsx:521-547. The array is a bare literal inside `<div className={card}>` with no isSupabaseMode/isDemoUiEnabled guard, no length check, and no demo label — unlike the Messages card at 472 which is guarded. The rows link to /dashboard/client/documents, which loads real rows via getDocuments() (documents/page.tsx:282), so the three files provably do not exist there. Reachability is in fact sharper than the auditor states: because CaseCard crashes the page for clients WITH requests (finding 5), this card is seen exactly by the zero-request cohort — every new account — for whom «محضر الجلسة · قضية ٢٠٢٥-٠٠١» is pure invention about their own legal file. S

### 2. Hero tells every client they have exactly two active cases — hardcoded string, never derived from data

- **الملف:** `src/app/dashboard/client/page.tsx:148`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة العميل الرئيسية والقضايا
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client, top-left welcome hero — the first sentence a client reads after login. Not gated on anything. It is worst precisely when it is most wrong: section 2 («قضاياي») is guarded by MY_CASES.length > 0 (line 243), so for a client with zero cases that section is hidden entirely and this fabricated line is the ONLY case count on the page. Compounding it, dashboardService.ts:64-65 catches a failed /api/v1/dashboard/summary and silently returns DEMO_SUMMARY (all-zero) with no error shown — so an outage also renders this claim unchallenged.

```
لديك <strong className="text-white">قضيتان نشطتان</strong> يتابعهما محاموك الآن
```

> **المراجع:** Verified at page.tsx:147-149: the string is a literal in JSX with no interpolation; MY_CASES (line 39) is in scope and never read on that line. Not gated. The auditor's aggravating point checks out: section 2 is behind MY_CASES.length > 0 (line 243), and dashboardService.ts:64-66 swallows a failed fetch into DEMO_SUMMARY, so on an outage this claim renders with zero contradicting data. And because CaseCard throws for clients who do have requests, the only people who ever see this sentence are those with zero active cases. Blocking, reachable=true — both correct.

### 3. The client's own question is printed back as «التشخيص والإجابة القانونية المباشرة» in a document titled an official report

- **الملف:** `src/app/dashboard/client/consultation/[id]/page.tsx:499`
- **النوع:** بيانات مخترعة
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Client sidebar «استشاراتي» → /dashboard/client/consultation → book an AI consultation (path="ai", receiver="ai_workspace") → open it → AI branch renders → «تنزيل التقرير الموثق PDF» (797).

```
Report body: `<div class="section-title">التشخيص والإجابة القانونية المباشرة</div>` / `<div class="answer">${consultation.topic}</div>` (498-499), under the page heading `<div class="title">تقرير استشارة وتشخيص قانوني رسمي للعميل</div>` (477). But `consultation.topic` is the client's own words: `topic: found.description` (152), and `description: activeTopic` in consultation/new/page.tsx:233 is the textarea the client typed into. Nothing ever overwrites `description` — the only two `type: "consultation"` creators are consultation/new/page.tsx:231 and dashboard/lawyer/consultations/page.tsx:125. The same substitution renders on screen at 697-701 under «رأي المساعد الذكي والتشخيص القانوني».
```

> **المراجع:** Verified end to end. `[id]/page.tsx:152` sets `topic: found.description`; the wizard writes `description: activeTopic` (new/page.tsx:233) where activeTopic is the client's own textarea/aiQuestion (line 173). I checked every writer of `description`: the two `type:"consultation"` creators, and the ONLY server path that can change it — the `edit_details` action in api/v1/service-requests/[id]/route.ts:518-563 — which writes `validated.value` from the CLIENT's edit form, never an AI answer. I also opened /ai/consult (the page the wizard's own confirm button pushes to, new/page.tsx:441), the last candidate for writing an answer back: it uses `getMockResponse()` locally (line 56) and contains no s

### 4. Which Saudi statutes are presented as the basis of the client's case is decided by a keyword regex on their free text

- **الملف:** `src/app/dashboard/client/consultation/[id]/page.tsx:567`
- **النوع:** بيانات مخترعة
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Same path as the report finding — AI consultation detail page, statutes panel is always rendered, and the same block is embedded in the downloadable PDF.

```
`const isLabor = /عمال|موظف|راتب|فصل/.test(low);` / `const isRealEstate = /عقار|أرض|شقة|إيجار/.test(low);` (567-568) selects between three hardcoded arrays (570-603) rendered under «السندات ومواد الأنظمة ذات العلاقة» (708), and printed in the PDF under «السند القانوني والمواد النظامية المعول عليها» (295). Any topic that matches neither regex — a criminal, family, inheritance or corporate matter — silently gets civil-contract articles: «المادة 140 - نظام المعاملات المدنية» and «المادة 178 - الشرط الجزائي والتعويض» (593-602). I am not claiming the article texts are invented; the provable lie is that they are presented as the authorities relied upon *for this client's matter* when a two-regex k
```

> **المراجع:** Confirmed at both render sites. `[id]/page.tsx:567-568` — `const isLabor = /عمال|موظف|راتب|فصل/.test(low); const isRealEstate = /عقار|أرض|شقة|إيجار/.test(low);` — selects among three hardcoded arrays (570-603 on screen, 293-329 in the PDF), rendered under «السندات ومواد الأنظمة ذات العلاقة» (708) and «السند القانوني والمواد النظامية المعول عليها» (295). `low` is built from the client's own free text plus an always-empty questionText (566). A criminal, family, inheritance or corporate matter falls through to «المادة 140 - نظام المعاملات المدنية» / «المادة 178 - الشرط الجزائي» (593-602). On the disclaimer defence: the footer says the report is indicative and not a formal opinion — it says noth

### 5. «تم تسجيل رسالتك» is shown for a message that was never persisted anywhere

- **الملف:** `src/app/dashboard/client/consultation/[id]/page.tsx:252`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client/consultation → open any non-AI (lawyer) consultation before assignment → type in the chat box → send.

```
In `sendMessage()`, when `chatRoomId` is null: `setChatNotice(lawyerUserId ? "تعذّر إرسال الرسالة الآن..." : "سيتم تفعيل المحادثة المباشرة قريباً بمجرد تأكيد تعيين المحامي. تم تسجيل رسالتك.")` (249-253). The only thing that happened is the optimistic local append at 231-237; `sendChatMessage` is called only inside `if (chatRoomId)` (239-241). `chatRoomId` stays null whenever `lawyerUserId` is null — and `lawyerUserId` comes from `found.assignedTo` (143), which is null on every consultation until an admin assigns one. The message vanishes on reload and no one on the office side ever sees it.
```

> **المراجع:** Confirmed by following the whole chain. In the room effect (172-198) `roomId` is only created when `lawyerUserId` is truthy — `if (!roomId && lawyerUserId)` (178) — so with no assigned lawyer and no pre-existing room, `setChatRoomId(null)` (192). In `sendMessage` (224-255) `sendChatMessage` runs only inside `if (chatRoomId)` (239-241); the else branch at 248-253 shows «سيتم تفعيل المحادثة المباشرة قريباً بمجرد تأكيد تعيين المحامي. تم تسجيل رسالتك.» while the only thing that happened is the optimistic local append at 230-237. `lawyerUserId` is `found.assignedTo` (143), optional on WorkflowRequest (workflowStore.ts:81) and set only by admin assignment. I also verified the cancel/assign endpoin

### 6. «طلب قانوني جديد» writes the company's legal request to localStorage only, then tells them it was sent to the legal department

- **الملف:** `src/app/dashboard/business/_components/AddCaseModal.tsx:116`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Log in as a corporate account → land on /dashboard/business (first and default sidebar item, allowed for ALL_BUSINESS_ROLES per entityRouteAccess.ts:32) → the large gold CTA «طلب قانوني جديد» in the header (page.tsx:218-226, `onClick={() => setShowAddCase(true)}`) → fill both steps → «حفظ واعتماد» (page.tsx line 199-205 of the modal). Also reachable from the empty-state «+ أضف طلباً جديداً» at page.tsx:301.

```
The success screen claims delivery: AddCaseModal.tsx:114-116 — `<p ...>تم التوجيه بنجاح!</p>` / `تم تسجيل الطلب وإرساله للقسم القانوني لاتخاذ اللازم.` But handleSave (line 56-59) calls `saveWorkflowRequest({...})` from @/lib/workflowStore, and workflowStore.ts:93-97 is an unconditional passthrough with no backend branch at all: `export function saveWorkflowRequest(input: ...): WorkflowRequest { return createWorkflowRequestLocal(input); }`. createWorkflowRequestLocal (clientWorkflowRepository.ts:124-128) does `window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))` and nothing else. This is not 'not built yet': the wired alternative exists and was not used — clientWorkflowRepository.t
```

> **المراجع:** Verified end to end. AddCaseModal.tsx:56-59 calls saveWorkflowRequest({...}); workflowStore.ts:93-97 is `export function saveWorkflowRequest(input): WorkflowRequest { return createWorkflowRequestLocal(input); }` — no BACKEND_ENABLED branch at all, unlike the async createWorkflowRequest at clientWorkflowRepository.ts:327-341 which does POST to /api/v1/service-requests when NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND==="supabase". createWorkflowRequestLocal only does window.localStorage.setItem(STORAGE_KEY, ...). Success copy at line 114/116 confirmed verbatim: «تم التوجيه بنجاح!» / «تم تسجيل الطلب وإرساله للقسم القانوني لاتخاذ اللازم.» Write-only confirmed: receiver "business_legal" is written at AddC

### 7. AI graph analysis is a hardcoded paragraph citing a fabricated Saudi judicial precedent, shown on a lawyer's real case

- **الملف:** `src/app/dashboard/business/kanban/CaseGraphOverlays.tsx:264`
- **النوع:** بيانات مخترعة
- **السطح:** العمليات القانونية للشركة
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Lawyer account → sidebar «جميع القضايا» (navigation.sidebars.legal.ts:18) → any real case → tab «الجراف» (or one click from the dashboard CTA at src/app/dashboard/lawyer/page.tsx:441, `?tab=graph`, honoured at page.tsx:236) → toolbar button «تحليل AI» (CaseGraphView.tsx:100). Nothing in the business layout guard runs on this path. Blocking rather than high because this is the one item a lawyer can carry out of the product: a citable precedent number (٣٤٢/١٤٤٤هـ) and named evidentiary strategy, badged as the platform's AI, on a case file the platform fetched from the real API.

```
CaseGraphOverlays.tsx:264 — `تأسيسك لمبدأ "الفسخ التعسفي" ممتاز ويتوافق مع سابقة قضائية (رقم ٣٤٢ لعام ١٤٤٤هـ).` and :267-269 — `<strong>نقطة ضعف محتملة:</strong> لم تقم بربط أي إشعار أو رسالة رسمية (دليل) تثبت أنك أنذرت المقاول قبل الغلق. المحكمة قد تطلب هذا المستند`. The whole <div> at :256-276 is static JSX — no props, no model call. It is produced by `runAiAnalysis` (_use-case-graph-state.ts:264-270): `setIsSimulatingAnalysis(true); setTimeout(() => { setIsSimulatingAnalysis(false); setShowAiAnalysis(true); }, 2000);` — a 2s spinner labelled «جاري التحليل...» (CaseGraphView.tsx:102) and nothing else. The only dynamic value on the panel is the node count in the byline `نظامي AI • تحليل {no
```

> **المراجع:** Tried to refute four ways, all failed. (1) Followed the handler: `runAiAnalysis` (_use-case-graph-state.ts:264-270) is `setIsSimulatingAnalysis(true); setTimeout(() => { setIsSimulatingAnalysis(false); setShowAiAnalysis(true); }, 2000);` — no model call, no fetch. (2) The panel body at CaseGraphOverlays.tsx:256-276 is literal JSX; the precedent line reads verbatim `تأسيسك لمبدأ "الفسخ التعسفي" ممتاز ويتوافق مع سابقة قضائية (رقم ٣٤٢ لعام ١٤٤٤هـ).` and the only interpolated value on the whole panel is `{nodeCount}` at :240. (3) Looked for a demo/beta guard: `grep -rn 'BetaReviewGate|isSupabaseMode|isDemoUiEnabled|backendDisabled|تجريبي|demo|عينة|توضيحي' src/app/dashboard/business/kanban/` retu

### 8. Corporate payments ledger invents five money movements, including funds claimed to be "held" pending case completion

- **الملف:** `src/app/settings/components/tabs/PaymentsTab.tsx:12`
- **النوع:** بيانات مخترعة
- **السطح:** مالية الشركة والاشتراكات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Corporate login → sidebar «الإعدادات» → «المدفوعات» tab. Shown when canManageBilling is true; settingsReadiness.ts:108 is `["owner","finance_manager"].includes(role ?? "owner")`, so a corporate account with businessRole unset also defaults to owner and sees it.

```
  const transactions = [
    { date: "٢٠٢٥/٠٣/١٥", desc: "رسوم استشارة قانونية", amount: "٢٥٠ ر.س", status: "مكتمل" },
    { date: "٢٠٢٥/٠٢/٢٨", desc: "أتعاب القضية ٢٠٢٥-٠٠١ — بانتظار الإنجاز", amount: "٢,٥٠٠ ر.س", status: "محجوز" },
    ...
    { date: "٢٠٢٤/١٢/٠٥", desc: "استرداد — إلغاء موعد", amount: "١٥٠ ر.س", status: "مسترد" },

Rendered as «سجل المعاملات» in a real table (lines 139-166) with colour-coded status pills (statusColor, lines 18-22). «محجوز» on 2,500 SAR asserts an escrow hold that no code performs — grep for fetch/supabase/api in this file returns nothing. «مسترد» asserts a refund was issued. A saved «Visa •••• 4242» expiring ٠٦/٢٧ is also invented (line 111). The one line
```

> **المراجع:** Confirmed verbatim. PaymentsTab.tsx:10-16 is a hardcoded array rendered in a real <table> at 68-91 with colour-coded status pills (statusColor 18-22, applied at 84). The file's ONLY handlers are setLocalMessage at :42 and :50 — no fetch, no supabase, no api import anywhere — so «محجوز» on ٢,٥٠٠ ر.س with «أتعاب القضية ٢٠٢٥-٠٠١ — بانتظار الإنجاز» asserts an escrow hold nothing performs, and «مسترد» asserts a refund that was never issued. The saved «Visa •••• 4242 / تنتهي ٠٦/٢٧» (38-39) is likewise invented. Reachability is FIRMER than the auditor stated: proxy.ts:52 lists /settings under PROTECTED (auth only) and ROUTE_ACCESS (proxy.ts:13-37) has no userType rule for it, settings/layout.tsx is


## مرتفع — 28

### 1. Wallet banner promises 3 active discount coupons that do not exist

- **الملف:** `src/app/dashboard/client/page.tsx:573`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة العميل الرئيسية والقضايا
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client, «رصيد محفظتك» banner (section 5), rendered unconditionally. Note the contrast one line up: line 568 reads the REAL balance (summary.walletBalance) and correctly shows ٠ ر.س when empty. The coupon count beside it is a literal — there is no coupon field on DashboardSummary (dashboardService.ts:28-36) and no coupons query in /api/v1/dashboard/summary. A money claim the client will try to redeem.

```
لديك أيضاً <strong className={isDark ? "text-amber-400" : "text-amber-600"}>٣ كوبونات خصم</strong> نشطة.
```

> **المراجع:** Verified at page.tsx:571-574. «٣ كوبونات خصم» is a literal in the same <p> where line 568 correctly reads summary.walletBalance and degrades to ٠ ر.س — so the contrast the auditor draws is real. Confirmed there is no coupon field on DashboardSummary (dashboardService.ts:28-36) and no coupon query in /api/v1/dashboard/summary (7 queries, none touch coupons). Section 5 is rendered unconditionally. High and reachable=true stand.

### 2. Paying subscribers are told they are on the free plan and pushed to subscribe — page reads sub.plan, schema has plan_id/tier

- **الملف:** `src/app/dashboard/client/page.tsx:47`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة العميل الرئيسية والقضايا
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client for any client with an active subscriptions row. The summary route selects "*, subscription_plans(*)" and returns the raw row, so sub.plan is always undefined -> planId always resolves to "free". USER_PLAN.id === "free" then renders Scenario A (line 267): «أنت على الباقة المجانية» plus «١ استفسار AI يومياً فقط» and an «اشترك الآن» button. A customer who has already paid is told they have no plan, has their entitlements understated, and is upsold a plan they already own.

```
const planId = (sub?.plan ?? "free") as "free" | "shield" | "ai-individual" | "legal-protection";
```

> **المراجع:** Schema verified: public.subscriptions (20260603_phase1_003_subscriptions_billing.sql:30-50) has plan_id and tier, and no `plan`, `name`, `limits` or `used` columns; the route returns the raw row (summary/route.ts:78-88). So sub?.plan is always undefined and planId always resolves to "free" (page.tsx:47), forcing Scenario A at line 269 — «أنت على الباقة المجانية» + «اشترك الآن». Reachable: paid rows exist only via the admin grant (api/v1/admin/subscriptions/route.ts:281 .insert with plan_id/tier), which is the only paid path today — so this hits admin-granted subscribers, a real but narrow cohort. One sub-claim does NOT hold: entitlements are not actually understated at enforcement time — src

### 3. Dashboard case cards crash the whole page for exactly the clients who have active matters

- **الملف:** `src/app/dashboard/client/_components/CaseCard.tsx:10`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** لوحة العميل الرئيسية والقضايا
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client for any client with >=1 service_requests row in pending_assignment / assigned / in_review. summary.activeCases is raw `select("*")` from service_requests (api/v1/dashboard/summary/route.ts:35-40); that table (20260518_client_workflow_backend_ready.sql:4-19) has no statusColor / statusLabel / lawyer / lawyerType / nextAction / urgent / progress / caseNo columns — page.tsx:38 just casts it `as ClientCase[]`. So STATUS_COLOR[undefined] is undefined and `sc.bg` throws a TypeError during render. There is no error.tsx anywhere under src/app/dashboard (only src/app/ai/error.tsx), so the entire client dashboard fails. The advertised live case cards render nothing at all for the only users who have cases.

```
const sc = STATUS_COLOR[cs.statusColor];
...
<span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
```

> **المراجع:** Confirmed end-to-end. STATUS_COLOR (_data.ts:10-14) has only keys amber/blue/green; service_requests (20260518_client_workflow_backend_ready.sql:4-19) has no statusColor column, and page.tsx:39 casts the raw rows `as ClientCase[]`, so CaseCard.tsx:10 yields undefined and line 31 dereferences `sc.bg` — a TypeError during render. I verified a live writer rather than assuming one: /dashboard/client/requests/new (the form the brief lists as wired) calls createWorkflowRequest with `status: "pending_assignment"` at requests/new/page.tsx:138 with no payment gate, and consultation/new writes pending_assignment whenever nothing is owed (paymentsBlocked at line 203 is `disabled && needsPayment`, so fr

### 4. «مساعدة AI» pastes the client's own instruction into the letter body instead of rewriting it

- **الملف:** `src/app/dashboard/client/_components/ClientLetterWorkflow.tsx:114`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Client sidebar «نظامي AI» → «صائغ الخطابات» → /dashboard/client/letters → steps 1-3 → letter output → hover any block → «مساعدة AI» → type a note → «تطبيق».

```
`async function applyNote(id) { setRefining(id); ... await new Promise(r => setTimeout(r, 1400)); setBlocks(b => b.map(bl => bl.id === id ? { ...bl, content: bl.content + `\n[ملاحظة AI: ${noteText}]` } : bl)); }` (110-117). While the timeout runs the UI shows «AI يعيد صياغة الفقرة...» (180). No fetch, no model call. A client who types «اجعل النبرة أكثر حزماً» ends up with the literal line «[ملاحظة AI: اجعل النبرة أكثر حزماً]» inside the formal letter they are about to send to a landlord, employer or bank.
```

> **المراجع:** Handler confirmed verbatim at ClientLetterWorkflow.tsx:110-117: `setRefining(id); setNoteId(null); await new Promise(r => setTimeout(r, 1400)); setBlocks(b => b.map(bl => bl.id === id ? {...bl, content: bl.content + `\n[ملاحظة AI: ${noteText}]`} : bl))`. No fetch, no model call anywhere in the file. The spinner copy «AI يعيد صياغة الفقرة...» is at 180. Reachable — /dashboard/client/letters is in the client sidebar (navigation.sidebars.primary.ts:48 «صائغ الخطابات»). Severity corrected blocking→high: it is a fake AI feature, but the mangled paragraph is rendered on screen and every block is click-to-edit (152), so the client sees the bracket before sending. It misleads about a feature, not ab

### 5. Both letter export buttons — «تنزيل PDF» and «تنزيل Word» — have no handler at all

- **الملف:** `src/app/dashboard/client/_components/ClientLetterWorkflow.tsx:225`
- **النوع:** زر لا يعمل
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client/letters → complete the 3-step wizard → letter output screen → the two download buttons at the bottom.

```
`<motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="..."><DownloadSimple size={16} weight="bold" /> تنزيل PDF</motion.button>` (225-227) and the identical `... <NotePencil size={16} weight="bold" /> تنزيل Word` (228-230). Neither carries `onClick`. The only wired button in that row is «خطاب جديد» (`onClick={onReset}`, 231). There is no copy control either, so there is no way whatsoever to get the finished letter out of the page.
```

> **المراجع:** Read the whole action row (ClientLetterWorkflow.tsx:225-233). Both `motion.button`s carry only `whileHover`/`whileTap`/`className` — no onClick, no form, no ref. The only wired control in the row is «خطاب جديد» (`onClick={onReset}`, 231). I grepped the file for any download/print/blob helper: none exists (contrast the consultation page, which has a real `handleDownloadPDF` using window.open + print). Reachable via the sidebar «صائغ الخطابات». Note: I am confirming the two dead buttons, not the auditor's stronger aside that there is 'no way whatsoever' to get the letter out — the block text is selectable and hand-copyable.

### 6. «اصنع الخطاب بالذكاء الاصطناعي» runs a 1.8s fake spinner and fills a hardcoded template

- **الملف:** `src/app/dashboard/client/_components/ClientLetterWorkflow.tsx:256`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client/letters → pick a letter type, a recipient, write ≥15 chars → «اصنع الخطاب بالذكاء الاصطناعي».

```
`async function generate() { setProcessing(true); await new Promise(r => setTimeout(r, 1800)); setProcessing(false); setDone(true); }` (256-261) — no network call. The letter is `initialBlocks` (92-98), a fixed template that interpolates the client's raw input verbatim: `content: `يتشرف المرسِل ${myName} بإحاطتكم علماً بالموضوع التالي:\n${story}`` (95). During the timeout the button reads «جارٍ صياغة الخطاب...» (471), step 3 promises «الذكاء الاصطناعي سيصيغه بأسلوب رسمي قانوني» (413) and the page header states «الخطاب يُعدّه الذكاء الاصطناعي» (letters/page.tsx:55).
```

> **المراجع:** `generate()` at ClientLetterWorkflow.tsx:256-261 is exactly `setProcessing(true); await new Promise(r => setTimeout(r, 1800)); setProcessing(false); setDone(true);` — no network call in the function or the file. The output is `initialBlocks` (92-98), a fixed template whose body interpolates the raw input: `content: \`يتشرف المرسِل ${myName} بإحاطتكم علماً بالموضوع التالي:\n${story}\`` (95). The claims are where the auditor says: step-3 promise «الذكاء الاصطناعي سيصيغه بأسلوب رسمي قانوني», and I confirmed the page header notice independently — letters/page.tsx:55-56 reads «الخطاب يُعدّه الذكاء الاصطناعي — يُنصح بمراجعته من محامٍ قبل الإرسال الرسمي.» No demo guard on this component; both /dash

### 7. The consultation rating modal collects four scores and a comment, then throws them away

- **الملف:** `src/app/dashboard/client/consultation/page.tsx:148`
- **النوع:** مُدخلات تُرمى
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client/consultation → any consultation whose request status is `completed` → «قيّم الاستشارة» (350-357) → rate → «إرسال التقييم».

```
`<button onClick={() => setSubmitted(true)} disabled={stars === 0} ...>إرسال التقييم</button>` (147-153). `setSubmitted(true)` is the entire submit path — no fetch anywhere in RatingModal (64-157). `stars`, `clarity`, `benefit`, `punctual` and `comment` are local state only. The success screen then claims «تقييمك يساعدنا على تحسين جودة الخدمة للجميع.» (86).
```

> **المراجع:** Read RatingModal in full (consultation/page.tsx:64-157). `stars`, `hover`, `clarity`, `benefit`, `punctual`, `comment` are all plain useState; the submit button is `onClick={() => setSubmitted(true)} disabled={stars === 0}` (147-150) and there is no fetch, no service import, and no onSubmit prop anywhere in the component — the only prop is `onClose`. The success screen then claims «تقييمك يساعدنا على تحسين جودة الخدمة للجميع.» (86). Reachable: the «قيّم الاستشارة» trigger is gated on `c.status === "completed" && !c.rating` (350) and completed IS reachable (both mappers pass `completed` through).

### 8. The chat attachment picker opens, and the chosen file is never read or uploaded

- **الملف:** `src/components/dashboard/SessionChatPane.tsx:302`
- **النوع:** مُدخلات تُرمى
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client/consultation → open a lawyer consultation (status not completed/cancelled, which is every one — see the cancelled-status finding) → paperclip icon in the message bar.

```
`onClick={() => fileRef.current?.click()}` on the paperclip (295) opens `<input ref={fileRef} type="file" className="hidden" />` (302) — the input has no `onChange`, no `accept`, and nothing in the file reads `fileRef.current.files`. The client picks a document, the dialog closes, and nothing appears in the thread and no error is shown. (`sendMessage` in consultation/[id]/page.tsx:224-255 handles text only.)
```

> **المراجع:** Confirmed by grep across both files: the ONLY occurrences of `fileRef` in SessionChatPane.tsx are the declaration (188), the click trigger `onClick={() => fileRef.current?.click()}` (295) and `<input ref={fileRef} type="file" className="hidden" />` (302) — no onChange, no accept, and nothing anywhere reads `fileRef.current.files`. The parent (`[id]/page.tsx`) declares its own unused fileRef at 124 and passes no file handler into the pane (props at 903-915). `sendMessage` (224-255) takes only `input` text. Reachable on any lawyer consultation's message bar.

### 9. The voice-message button only toggles its own icon colour

- **الملف:** `src/components/dashboard/SessionChatPane.tsx:325`
- **النوع:** زر لا يعمل
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Same as the attachment finding — the message bar of any lawyer consultation.

```
`onClick={() => setIsRecording(!isRecording)}` (325), rendering `{isRecording ? <MicrophoneSlash size={18} /> : <Microphone size={18} />}` (330). `isRecording` is declared in consultation/[id]/page.tsx:113 and read nowhere except this className/icon swap — no `MediaRecorder`, no `getUserMedia`, no upload. The button turns red and stays red. (The repo does have working speech capture in src/components/ui/VoiceInput.tsx; it is not used here.)
```

> **المراجع:** Confirmed. `onClick={() => setIsRecording(!isRecording)}` (SessionChatPane.tsx:325) and the icon swap at 330 are the only consumers: grep for `isRecording` returns just the prop declaration (165), destructure (179), the className at 327 and the icon at 330 in the pane, plus `useState(false)` at [id]/page.tsx:113 and the prop pass at 912. No MediaRecorder, no getUserMedia, no upload in either file. The affordance reads as start/stop (Microphone → MicrophoneSlash) so a client can speak, 'stop', and get no message and no error.

### 10. The call and video-call buttons in the consultation header have no handlers

- **الملف:** `src/app/dashboard/client/consultation/[id]/page.tsx:877`
- **النوع:** زر لا يعمل
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client/consultation → open any lawyer consultation → the three icons at the top-left of the header.

```
`<motion.button whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.93 }} className="..."><Phone size={16} /></motion.button>` (877-880) and the identical block with `<Video size={16} />` (881-884). Neither has `onClick`; the only wired header button is the AI-panel toggle at 885-893. They are rendered unconditionally, so on a «مرئية» (video) consultation the client's only apparent way to join the call is a button that does nothing.
```

> **المراجع:** Read the header action group ([id]/page.tsx:875-893). Both buttons carry only whileHover/whileTap/className — the Phone one at 877-880 and the Video one at 881-884 — while the third, the AI-panel toggle, does have `onClick={() => setShowAIPanel(!showAIPanel)}` (887), which rules out a shared parent handler. They render unconditionally inside the lawyer branch, so a client on a `mode: "video"` consultation (metadata.mode, set by the wizard at 262) sees a join-the-call control that does nothing.

### 11. «درجة الأولوية» (normal / urgent / critical) is chosen by the client and never sent to the server

- **الملف:** `src/app/dashboard/client/consultation/new/page.tsx:102`
- **النوع:** مُدخلات تُرمى
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client/consultation/new → step 2 «درجة الأولوية» → pick urgent/critical → step 3 → confirm.

```
`const [urgency, setUrgency] = useState<"normal" | "urgent" | "critical">("normal");` (102), set by the three-button group at 677-699 («عادية» / «عاجلة» / «حرجة جداً»). The metadata actually sent is `metadata: { path, specialty, mode, serviceId, quoteSource, lawyerId, lawyerName, paymentIntentId, paymentProvider, attachmentCount }` (258-269) — no `urgency`. `grep -rn urgency src/app/dashboard/client/consultation/` returns only the declaration and the two className comparisons at 688/695. A client who marks their matter «حرجة جداً» sends a request indistinguishable from a routine one.
```

> **المراجع:** Reproduced the grep myself: `urgency` in consultation/new/page.tsx appears at 102 (useState), 686 (setUrgency in the three-button group «عادية»/«عاجلة»/«حرجة جداً», 677-699) and 688/695 (className comparisons only). The metadata object actually submitted (258-269) is `{ path, specialty, mode, serviceId, quoteSource, lawyerId, lawyerName, paymentIntentId, paymentProvider, attachmentCount }` — no urgency — and it is not folded into `title` or `description` either (both built at 249-253 from specialty/lawyer name and activeTopic). Reachable: the urgency group is on step 2, which both the ai and lawyer paths pass through.

### 12. A cancelled consultation is displayed as «قادمة» with a live message box

- **الملف:** `src/app/dashboard/client/consultation/[id]/page.tsx:147`
- **النوع:** بيانات مخترعة
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Client sidebar «طلباتي» → /dashboard/client/requests → a `consultation` row in pending_assignment/pending_payment → «إلغاء الطلب» (requests/page.tsx:213-220, which PATCHes status to "cancelled") → then sidebar «استشاراتي» → the same consultation still reads «قادمة».

```
`status: found.status === "completed" ? "completed" : found.status === "pending_payment" ? "upcoming" : "upcoming",` (147) — every status other than `completed` collapses to `upcoming`, so `cancelled` renders the blue «قادمة» badge (STATUS_CONFIG, 87). Identical mapping in the list at consultation/page.tsx:408, where the «ملغية» filter therefore always counts 0. It compounds: SessionChatPane gates its composer on `consultation.status !== "completed" && consultation.status !== "cancelled"` (SessionChatPane.tsx:278), a condition that can never see `cancelled`, so the client keeps typing into a cancelled consultation.
```

> **المراجع:** The core defect is proven. `[id]/page.tsx:147` and `consultation/page.tsx:408` both read `status: request.status === "completed" ? "completed" : request.status === "pending_payment" ? "upcoming" : "upcoming"` — every non-completed status, cancelled included, becomes «قادمة» (STATUS_CONFIG, 87). I verified the cancel really writes that status: requests/page.tsx:640-646 patches `{ status: "cancelled" }` with event `cancelled_by_client`, on the same workflow request the consultation pages read. And SessionChatPane.tsx:278 gates the composer on `status !== "completed" && status !== "cancelled"`, a test the collapsed value can never fail. ONE CORRECTION to the auditor's wording: «the ملغية filter

### 13. find-lawyer directory can never show a lawyer: getLawyers() casts raw profile rows to `Lawyer` without mapping, so every card is filtered out and the search box throws

- **الملف:** `src/lib/services/lawyerService.ts:106`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Sidebar → «ابحث عن محامٍ» (navigation.sidebars.primary.ts:23) → /dashboard/client/find-lawyer. CONDITIONAL on the DB holding ≥1 row with lawyer_profiles.verification_status='verified' AND marketplace_visible=true. With zero such rows the page shows the honest «لا يوجد محامون متاحون حالياً» empty state and the bug is latent; lawyerService.ts:33-36 says production had 5 lawyer rows but does not say how many are verified+visible, and marketplace_visible defaults to false. I could not query prod to settle it — treat the row count as the gate.

```
lawyerService.ts:100-106 — `const response = await apiGet<LawyerListResponse>("/api/v1/lawyers", {...}); return response.lawyers ?? [];` — no mapping. The route (src/app/api/v1/lawyers/route.ts:33-37) projects `id, display_name, display_name_en, avatar_url, city, user_type, lawyer_profiles!inner(...)`. There is no `name`, `priceMin`, `expertise`, `specialtyKey`, `available`, `rating`. The page then filters on those keys: find-lawyer/page.tsx:323 `const matchPrice  = l.priceMin          <= maxPrice;` → `undefined <= 1200` → false for EVERY row, so `sorted` is always `[]`. And page.tsx:319 `const matchSearch = !q || l.name.includes(q) || l.specialty.includes(q) || l.expertise.some((e) => e.inc
```

> **المراجع:** Verified end to end. lawyerService.ts:100-106 does `apiGet<LawyerListResponse>("/api/v1/lawyers", …)` then `return response.lawyers ?? []` with no mapping, and api.ts:41 `return response.json()` confirms apiGet hands back the raw body. The route (api/v1/lawyers/route.ts:31-39) projects only `id, display_name, display_name_en, avatar_url, city, user_type, lawyer_profiles!inner(...)` and returns `{ lawyers, total }` at :93 — no `name`, `priceMin`, `expertise`, `specialtyKey`, `available`, `rating`. page.tsx:323 `const matchPrice = l.priceMin <= maxPrice;` is `undefined <= 1200` → false for every row, so `sorted` is permanently []; page.tsx:319 `l.name.includes(q)` throws a TypeError inside the

### 14. Referral programme records nothing: no code ever inserts into `referrals`, and the referral link points at a lawyer-recruitment page that ignores ?ref

- **الملف:** `src/app/dashboard/client/referral/page.tsx:317`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Sidebar → «برنامج الإحالة» (navigation.sidebars.primary.ts:72) → /dashboard/client/referral. Also reached from the wallet hero CTA «ادعُ مزيداً واكسب أكثر» (wallet/page.tsx:357) and the wallet «ادعُ أصدقاءك واكسب المزيد — ٥٠ ر.س لكل صديق» card (wallet/page.tsx:481-492).

```
referral/page.tsx:317 «تحصل على مكافأة ٥٠ ر.س لكل صديق ينضم ويشترك يضاف لرصيد باقتك» and steps[2] at line 65 «تحصل على مكافأة ٥٠ ر.س». The link handed out is built in src/app/api/v1/referrals/route.ts:30 — `referralUrl: \`https://nezamy.sa/join?ref=${user.id.slice(0, 8).toUpperCase()}\``. But (a) src/app/join/page.tsx never reads `ref` — its only outbound links are `/register/provider` (lines 245, 592) and it is a «انضم كمحامٍ أو مزود خدمة» provider-recruitment landing page, not a client signup; (b) `grep -rn 'from("referrals")' src/` returns exactly ONE hit — the GET at referrals/route.ts:14. Nothing in src/app/register, src/app/login, or any migration inserts a referrals row (the table + R
```

> **المراجع:** Absence proof holds under a discriminating search. `grep -rn referrals --include=*.sql` over the whole repo returns the table + RLS + indexes + updated_at trigger only (supabase/migrations/20260603_phase1_005_advanced_features.sql:139/257/375-381/438-440/465 and the same in full-schema.sql) — there is no INSERT into referrals in any migration, trigger or function, and `grep -rn -A3 -i "insert into" --include=*.sql | grep -i referral` returns nothing. In src/, the only `.from("referrals")` is the SELECT at api/v1/referrals/route.ts:14. The link really is built at route.ts:30 `referralUrl: `https://nezamy.sa/join?ref=…`` and src/app/join/page.tsx has no `ref`/`useSearchParams` read at all; its

### 15. Wallet tells the user their real SAR balance auto-applies at a «صفحة الدفع» that does not exist anywhere in the app

- **الملف:** `src/app/dashboard/client/wallet/page.tsx:347`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Sidebar → «باقتي» (navigation.sidebars.primary.ts:68) → /dashboard/client/wallet. The mock `coupons`/`transactions` arrays on this page are correctly gated on `walletLoading && !isSupabaseMode` (lines 507, 512, 630, 635) and never render in prod — this finding is about the live copy, not the mocks.

```
wallet/page.tsx:347 «يُطبَّق الرصيد تلقائياً عند الدفع لأي خدمة»; :377-378 «عند الضغط على أي خدمة مدفوعة … تظهر لك خيار "استخدام رصيد المحفظة" في صفحة الدفع — يُخصم الرصيد تلقائياً من إجمالي الفاتورة»; :505 «انسخ الكود وأدخله في صفحة الدفع، أو سيُطبّق تلقائياً». There is no checkout route in the repo (no src/app/checkout, no page containing a coupon field), and the only function that can apply a coupon or wallet credit — `quoteClientService` (src/lib/pricingRepository.ts:108-145, with `walletUsed = input.useWallet ? Math.min(walletBalance, ...)`) — has ZERO callers: `grep -rn 'quoteClientService\|useWallet' src/` returns only its own definition and two comments. This is not a case of "the ba
```

> **المراجع:** Verified. The three copy lines are live and ungated: wallet/page.tsx:347 «يُطبَّق الرصيد تلقائياً عند الدفع لأي خدمة», :377-378 «… تظهر لك خيار "استخدام رصيد المحفظة" في صفحة الدفع — يُخصم الرصيد تلقائياً من إجمالي الفاتورة», :505 «انسخ الكود وأدخله في صفحة الدفع». No checkout exists: `find src/app -type d -name checkout|payment*` yields only api/v1/payments/status, api/v1/admin/payments and the admin payments list, and a repo-wide grep for a coupon entry field (كود الخصم / couponCode / promoCode outside /admin) returns zero hits. `grep -rn 'quoteClientService|useWallet' src/` returns only pricingRepository.ts:20/108/131 plus two comments (consultation/new/page.tsx:177, orderTransitions.ts:3

### 16. Overview KPI cards show four invented numbers as this company's live legal metrics

- **الملف:** `src/app/dashboard/business/page.tsx:28`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business — the default corporate dashboard, first sidebar link. Rendered on the ERP path, which is the only path a real account takes (see surface note).

```
page.tsx:28-33 — `const STATS = [ { ar: "استشارات معلقة", value: "٤", ... trend: +2 ... }, { ar: "عقود سارية", value: "٣٤", trend: +5, trendLabel: "تم تجديدها" ... }, { ar: "قضايا عمالية", value: "٢", trend: -1, trendLabel: "مقارنة بالشهر الماضي" }, { ar: "معدل الامتثال", value: "٩٢٪", trend: +4, trendLabel: "PDPL & ZATCA" } ];` — rendered verbatim at page.tsx:253-279 with per-card trend arrows. There is no fetch, no hook and no props feeding this array anywhere in the file; the values and the month-over-month trends are literals. Nothing on the card says demo. A company reads «٢ قضايا عمالية» and «معدل الامتثال ٩٢٪ — PDPL & ZATCA» as a statement about its own regulatory exposure.
```

> **المراجع:** STATS at page.tsx:28-33 confirmed as literals; rendered at 253-279 with trend arrows and no data source anywhere in the file. No demo label on the cards. The ERP render path is the one every production corporate account takes (see finding 1 reasoning). «معدل الامتثال ٩٢٪ — PDPL & ZATCA» is a regulatory-exposure claim; high is right and arguably conservative.

### 17. Two fabricated «مواعيد حرجة» legal deadlines with day countdowns

- **الملف:** `src/app/dashboard/business/page.tsx:35`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business, right-hand column of the default corporate overview.

```
page.tsx:35-38 — `const URGENT_DEADLINES = [ { label: "تجديد عقد التوريد الرئيسي", date: "١٥ أبريل ٢٠٢٦", daysLeft: 7, severity: "urgent" }, { label: "تسليم تقرير حوكمة البيانات", date: "٢٠ أبريل ٢٠٢٦", daysLeft: 12, severity: "warning" } ];` rendered at page.tsx:336-346 inside a red-bordered «مواعيد حرجة» panel that prints `متبقي {d.daysLeft} أيام` (line 343). These are the most actionable items on the page — a fabricated contract-renewal date and a fabricated data-governance filing deadline, both stated as this company's, both hardcoded. The dates are also already in the past relative to the ٢٠٢٦ dates elsewhere in the file, so the countdown is not even self-consistent.
```

> **المراجع:** URGENT_DEADLINES at page.tsx:35-38 confirmed verbatim, rendered at 336-346 in a red «مواعيد حرجة» panel printing «متبقي {d.daysLeft} أيام». No fetch, no props. The self-inconsistency claim also checks out: today is 2026-08-26, so ١٥ أبريل ٢٠٢٦ and ٢٠ أبريل ٢٠٢٦ are months past while the panel still counts down 7 and 12 days.

### 18. Invented seconded-counsel retainer: a named lawyer, a named firm, an «نشط» status badge and 12/40 billable hours remaining

- **الملف:** `src/app/dashboard/business/page.tsx:402`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business, right-hand column, below the AI tools card.

```
page.tsx:397 renders `<span ...>نشط</span>`; page.tsx:402 loads an avatar for a person who does not exist — `<img src="https://ui-avatars.com/api/?name=أحمد+سالم&background=0B3D2E&color=C8A762" alt="المستشار" ... />`; page.tsx:406-407 — `<p ...>أ. أحمد سالم</p>` / `<p ...>مكتب المنشاوي وشركاه</p>`; page.tsx:413-417 — `<span ...>الساعات المتبقية هذا الشهر</span>` `<span className="font-bold font-mono">١٢ / ٤٠</span>` over a `w-[30%]` progress bar. All literals, no data source. This asserts an active legal-retainer relationship with a specific named advocate at a specific named firm, plus a monthly hour allowance — a commercial and professional relationship the company does not have. The «إدار
```

> **المراجع:** All quoted lines verified: the «نشط» badge (~397), the ui-avatars.com img for «أحمد سالم» (402), «أ. أحمد سالم» (406) / «مكتب المنشاوي وشركاه» (407), «الساعات المتبقية هذا الشهر» with «١٢ / ٤٠» (413-417) over a hardcoded w-[30%] bar. Every value is a JSX literal with no data source. Asserting an active retainer with a named advocate at a named firm is a professional-relationship claim the company does not have. The «إدارة الانتداب» link to /dashboard/business/cases is indeed outside VISIBLE_BUSINESS_ROUTES.

### 19. «باقتك الحالية — Growth» prints invented subscription quotas and consumption

- **الملف:** `src/app/dashboard/business/page.tsx:69`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business, full-width banner below the two-column grid.

```
page.tsx:69-77 — `const BUSINESS_PLAN = { name: "Growth", requestsUsed: 12, requestsLimit: 20, consultationsUsed: 3, consultationsLimit: 5, aiQueriesUsed: 18, aiQueriesLimit: 30 };` — its own comment on line 68 concedes `// ── Subscription plan mock (replace with real user context when backend ready) ──`, but that comment is not shown to the user. The UI presents it as fact: page.tsx:438 `<h2 ...>باقتك الحالية — {BUSINESS_PLAN.name}</h2>`, then three meters at page.tsx:443-465, one of which (استعلامات AI 18/30) crosses the 80% threshold and prints the upsell `اقتربت من الحد — فكّر في الترقية` (line 462) next to a «ترقية الباقة» link. A company is being told what plan it is on, how much of it
```

> **المراجع:** BUSINESS_PLAN at page.tsx:69-77 confirmed, with the developer-only comment at 68 that the user never sees. Rendered at 438 («باقتك الحالية — {BUSINESS_PLAN.name}») and the three meters at 443-465, where aiQueries 18/30 = 60%... verified the threshold logic: pct = 18/30*100 = 60, isNear = pct >= 80 is FALSE, so «اقتربت من الحد» does NOT fire for AI queries. It DOES fire for «الطلبات القانونية» 12/20 = 60%? No — also false. Recomputing: requests 12/20=60%, consultations 3/5=60%, aiQueries 18/30=60%. None reaches 80%, so the upsell line at 462 never renders. The auditor's specific upsell claim is wrong, but the core finding stands unchanged: the plan name, all three quotas and all three consump

### 20. Fabricated «إخطار من السكرتير القانوني الذكي» claims three supplier contracts were analysed and liability gaps found

- **الملف:** `src/app/dashboard/business/page.tsx:243`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business, the amber notice bar directly under the page header — the second thing on the screen.

```
page.tsx:242-243 — `<p ...>تم تحليل ٣ عقود موردين جديدة، واكتشاف ثغرات في بند تحمل المسئولية. الرجاء المراجعة.</p>` — hardcoded JSX text, no state, no data source. It asserts that specific analytical work was performed on specific documents belonging to this company and that a specific legal defect (a liability-clause gap) was found. The «مراجعة التقرير» link beside it (page.tsx:246, `href="/ai/secretary"`) does not lead to that report: /ai/secretary is itself canned — its chat handler is `setTimeout(() => { ... text: "تم تسجيل ذلك في السجل، وسأقوم بتذكيرك في الوقت المناسب ومتابعة تنفيذه." ... }, 1500)` (src/app/ai/secretary/page.tsx:205-207) over INITIAL_RULES / INITIAL_DECISIONS / INITIAL_
```

> **المراجع:** page.tsx:243 confirmed verbatim as hardcoded JSX with no state or data source: «تم تحليل ٣ عقود موردين جديدة، واكتشاف ثغرات في بند تحمل المسئولية. الرجاء المراجعة.» It asserts analytical work on specific documents belonging to this company and a specific legal defect. The secondary claim also holds: /ai/secretary has NO BetaReviewGate anywhere in the file (grep returned nothing), its chat handler is the setTimeout canned reply at 205-207, and INITIAL_RULES/INITIAL_DECISIONS/INITIAL_ACTIVITY (36/43/49) are literal arrays seeded into state at 189-191. So the «مراجعة التقرير» link genuinely leads to another canned surface, ungated.

### 21. Three fabricated pending department requests with IDs, departments and timestamps

- **الملف:** `src/app/dashboard/business/page.tsx:40`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business, the main left-hand panel of the overview.

```
page.tsx:40-44 — `const INITIAL_REQUESTS = [ { id: "NZ-REQ-102", title: "مراجعة اتفاقية سرية (NDA)", dept: "المبيعات", type: "مراجعة عقد", status: "high", date: "اليوم ٩:٠٠ ص" }, { id: "NZ-REQ-101", title: "تظلم موظف", dept: "الموارد البشرية", ... }, ... ];` seeded straight into state at page.tsx:118 (`const [recentRequests, setRecentRequests] = useState(INITIAL_REQUESTS);`) and rendered under the heading «طلبات الإدارات المعلقة» (page.tsx:290) with an «عاجل جداً» red pulsing dot. `date: "اليوم ٩:٠٠ ص"` makes a static literal read as activity from this morning. One of them, «تظلم موظف» from HR, is a live employee grievance — a company could reasonably believe it has an unhandled one.
```

> **المراجع:** INITIAL_REQUESTS at page.tsx:40-44 confirmed verbatim including `date: "اليوم ٩:٠٠ ص"`, seeded at page.tsx:118 `useState(INITIAL_REQUESTS)` and rendered under «طلبات الإدارات المعلقة» (290) with the red animate-pulse dot for status "high". No demo label. «تظلم موظف» from HR presented as a live unhandled grievance is a real misrepresentation.

### 22. «مساحة محفوظة» — case graph claims it is saved; nothing is ever persisted and every edit is lost on tab switch

- **الملف:** `src/app/dashboard/business/kanban/CaseGraphView.tsx:97`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** العمليات القانونية للشركة
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Same path as finding 1. A lawyer who spends a session building the relations graph of a real case — adding parties, evidence, edges, per-node notes — is told the workspace is saved and loses all of it by clicking «الملاحظات» or refreshing.

```
CaseGraphView.tsx:96-98 — `<div className=...>` `<span className="w-2 h-2 rounded-full bg-emerald-500" /> مساحة محفوظة` — a green status dot reading "saved workspace", pinned in the toolbar. There is no persistence anywhere in the subtree: grep for localStorage/fetch/apiRequest/supabase across _use-case-graph-state.ts, CaseGraphView.tsx and CaseGraphOverlays.tsx returns zero hits, and the file's only three useEffects (_use-case-graph-state.ts:194, 201, 215) bind a global click handler, a ctrl+wheel zoom and a keyboard shortcut handler. Nodes/edges/groups/notes live solely in useState. The host renders it under `{activeTab === "graph" && ...}` (lawyer/cases/[id]/page.tsx:1018), so switching t
```

> **المراجع:** Tried to find the persistence the auditor missed and there is none. `grep -n 'useEffect|localStorage|fetch\(|apiRequest|supabase'` across _use-case-graph-state.ts, CaseGraphView.tsx, CaseGraphOverlays.tsx and _graph-model.ts returns only the three useEffects at _use-case-graph-state.ts:194/201/215 (global click handler, ctrl+wheel zoom, keyboard shortcuts) — zero storage or network calls in the entire subtree. Nodes, edges, groups and notes are plain useState. The badge is literal at CaseGraphView.tsx:96-98: `<span className="w-2 h-2 rounded-full bg-emerald-500" /> مساحة محفوظة`, pinned first in the toolbar before the AI button. The host mounts it under `{activeTab === "graph" && ...}` (lawy

### 23. Lawyer's real case file is seeded with an unrelated fabricated construction dispute, unlabelled

- **الملف:** `src/app/dashboard/business/kanban/_use-case-graph-state.ts:22`
- **النوع:** بيانات مخترعة
- **السطح:** العمليات القانونية للشركة
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Same path as finding 1. The panel header above the canvas reads «الجراف البصري للقضية — {caseData.title}» with a «نظامي AI» pill (lawyer/cases/[id]/page.tsx:1023-1027), where caseData came from the live /api/v1/service-requests/{id} fetch — so a real case name sits directly above five fabricated nodes including a fabricated item of evidence, attributed to three colleagues who do not exist.

```
_use-case-graph-state.ts:22-23 — `const defaultNodes = seedNodes ?? (isGlobal ? [] : MOCK_NODES);` / `const defaultEdges = seedEdges ?? (isGlobal ? [] : MOCK_EDGES);`. The lawyer case page mounts `<CaseGraphView isDark={isDark} isGlobal={false} />` (lawyer/cases/[id]/page.tsx:1037 and again at :1054 for fullscreen) with no initialNodes, so the false branch fires. MOCK_NODES (_graph-model.ts:63-69) is a made-up contractor dispute: `{ type: "person", title: "مؤسسة البناء الحديث", desc: "المقاول المنفذ للمشروع" }`, `{ type: "doc", title: "عقد المقاولة رقم (١٢٣)", desc: "يتضمن شرط جزائي للتأخير" }`, `{ type: "evidence", title: "تقرير المهندس الاستشاري", desc: "يثبت سوء تنفيذ الميدة" }`, each att
```

> **المراجع:** The obvious refutation — that the lawyer route passes real seed data like the other call sites do — is false for the route that actually ships. src/components/dashboard/lawyer/LawyerCaseSubViews.tsx:609 does pass `initialNodes={caseGraphNodes.nodes}`, but `grep -rn LawyerCaseSubViews src/` shows nothing imports that file; the live route src/app/dashboard/lawyer/cases/[id]/page.tsx mounts `<CaseGraphView isDark={isDark} isGlobal={false} />` at :1037 and :1054 with no seed, so `const defaultNodes = seedNodes ?? (isGlobal ? [] : MOCK_NODES);` (_use-case-graph-state.ts:22) takes the MOCK_NODES branch. MOCK_NODES (_graph-model.ts:63-69) is the invented contractor dispute quoted, with the invented

### 24. Graph share modal: fake link, dead primary CTA, and a privacy redaction toggle that redacts nothing

- **الملف:** `src/app/dashboard/business/kanban/CaseGraphView.tsx:697`
- **النوع:** زر لا يعمل
- **السطح:** العمليات القانونية للشركة
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Same path as finding 1, then toolbar button «مشاركة» (CaseGraphView.tsx:148, title="مشاركة مع العميل"). A lawyer preparing to share a case graph with a client toggles on name/amount redaction, reads the modal's own warning «تأكد من عدم مشاركة معلومات سرية», and presses a button that does nothing — so nothing leaks, but the control set is theatre and the lawyer believes a redacted link was issued.

```
CaseGraphView.tsx:697 — `<button className="flex-[2] ...">إنشاء رابط المشاركة</button>` — the modal's primary CTA has no onClick. :692 — `<span ...>https://nzamy.app/graph/share/abc123...</span>` is a hardcoded literal, identical for every user and every case, and its `نسخ` button (:693) also has no onClick. Worst of the cluster: the toggles `{ label: "أسماء الأشخاص والشركات", val: blurNames, set: setBlurNames }` and `{ label: "القيم المالية والأرقام", val: blurAmounts, set: setBlurAmounts }` (:646-647) under the heading «طمس المعلومات الحساسة:» are the ONLY reads of blurNames/blurAmounts in the entire subtree — they paint their own switch and are never consulted when rendering a node, so th
```

> **المراجع:** Read the whole modal (CaseGraphView.tsx:620-702) rather than trusting the summary, and every claim holds. `<button className="flex-[2] py-2.5 rounded-xl ... bg-[#0B3D2E] text-[#C8A762] ...">إنشاء رابط المشاركة</button>` at :697 has no onClick; the link at :692 is the literal `https://nzamy.app/graph/share/abc123...` and its `نسخ` button at :693 has no onClick; the four «صلاحيات المشارك» controls at :666-686 are `<div>`s with hardcoded border classes and no state. The redaction claim is the one I most expected to break, so I grepped the whole repo: `grep -rn 'blurNames|blurAmounts' src/` returns exactly six lines — the two useState declarations (_use-case-graph-state.ts:42-43), the two hook r

### 25. Public «الفحص القانوني ٣٦٠°» service page sells a 6,999 SAR/yr product whose every CTA lands on a construction notice

- **الملف:** `src/app/services/corporate/health-check/page.tsx:88`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** العمليات القانونية للشركة
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Any visitor, signed in or not — /services/corporate/health-check is outside PROTECTED in src/proxy.ts and is listed for indexing in src/app/sitemap.ts:58. Scoped note: the page file itself belongs to the marketing surface, but it is the sole advertisement for /dashboard/business/health-check, which is mine; reporting it here so the pairing is not lost between agents.

```
Three CTAs — :88 `<motion.a href="/dashboard/business/health-check" ...>ابدأ الفحص الآن`, :317 `...ابدأ الآن` (the button under each pricing card), :339 `...ابدأ الفحص مجاناً` — all point at a route the business layout refuses to render (layout.tsx:106), so the buyer lands on «هذا القسم قيد الإعداد». The page prices the service: :43 `{ name: "مراقبة سنوية", price: "٦,٩٩٩", sub: "ر.س / سنة", subPrice: "٣,٩٩٩", ... }`, :44 `{ name: "إضافة وثائق", price: "١,٠٠٠", sub: "ر.س / ٥٠ وثيقة" }`. It also states invented performance and market numbers as fact: :103-106 `{ v: "٨٢ نقطة", l: "يتم فحصها تلقائياً" }, { v: "٩٣٪", l: "دقة التصنيف الذكي" }, { v: "٢٤ ساعة", l: "لتسليم التقرير الكامل" }` and :336
```

> **المراجع:** Tried to refute on reachability of both ends and neither breaks. The page is public: /services is not in the PROTECTED list in src/proxy.ts:38-53, and src/app/sitemap.ts:58 submits it for indexing. All three CTAs are literally `href="/dashboard/business/health-check"` (:88, :317, :339). That destination is absent from CORPORATE_SIDEBAR — which now holds only /dashboard/business and /dashboard/business/documents — and VISIBLE_BUSINESS_ROUTES is derived from that array, so isVisibleBusinessRoute() returns false and business/layout.tsx renders SectionNotReady («هذا القسم قيد الإعداد») for every non-admin. The prices are as quoted (ANNUAL_PLANS at :43-44), and the invented figures are hardcoded 

### 26. Every "this is only local / demo" disclaimer in Settings is deleted from the production build

- **الملف:** `src/app/settings/components/tabs/_shared.tsx:42`
- **النوع:** بيانات مخترعة
- **السطح:** مالية الشركة والاشتراكات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** This is the root cause of findings 2-7. Any logged-in account → /settings (linked from the corporate sidebar, navigation.sidebars.business.ts:65). src/app/settings/layout.tsx is an explicit no-op pass-through, so there is no guard between the user and these tabs.

```
const IS_PRODUCTION = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND === "supabase";  (line 7)
  // Hide in production — this is a development-only notice
  if (IS_PRODUCTION) return null;  (lines 41-42)

.env.vps:26 → NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase, so IS_PRODUCTION is true on the deployed build. The guard sits BEFORE the {children} return, so a tab's own custom wording is suppressed too — PaymentsTab.tsx:26-28 passes «المدفوعات هنا للعرض وتجهيز العقود فقط؛ ... لا يلمس بوابة دفع حقيقية الآن» as children and it never renders in prod. Twelve tabs depend on this component for their only honesty label (grep: ComplianceTab:75, DelegationTab:61, EntitySettingsTab:130, InvoiceTab:19, 
```

> **المراجع:** Mechanism verified exactly as quoted. _shared.tsx:7 `const IS_PRODUCTION = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND === "supabase"` is true on the deployed build (.env.vps:26 and .env.local:12 both set it), and line 42 `if (IS_PRODUCTION) return null;` sits BEFORE the {children} return at 44-49, so a tab's own custom wording is suppressed with the default text — PaymentsTab.tsx:26-28 passes «لا يلمس بوابة دفع حقيقية الآن» as children and it never paints. Grep confirms 13 call sites across 12 tabs (Compliance:75, Delegation:61, EntitySettings:130, Invoice:19, Nafath:29, Payments:26, Profession:44, Profile:463, RoleScope:40, Signature:120, Subscription:120, TeamManagement:157). LocalActi

### 27. Subscription tab shows a corporate plan, four usage meters and three PAID invoices that are all hardcoded

- **الملف:** `src/app/settings/components/tabs/SubscriptionTab.tsx:113`
- **النوع:** بيانات مخترعة
- **السطح:** مالية الشركة والاشتراكات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Corporate login → «الإعدادات» → «الخطة والحدود» tab (settingsReadiness.ts:263, same canManageBilling gate that defaults to owner). The demo banner at line 120 is null in prod.

```
  const invoices = [
    { date: "١ مايو ٢٠٢٦",    amount: plan.price === "مجاني" ? "٠ ر.س" : plan.price, status: "مدفوع" },
    { date: "١ أبريل ٢٠٢٦",   amount: ..., status: "مدفوع" },
    { date: "١ مارس ٢٠٢٦",    amount: ..., status: "مدفوع" },

Rendered under «آخر الفواتير» with an emerald «مدفوع» badge (lines 220-227). The corporate plan they price is equally invented (lines 50-60): name "Corporate Legal", renewal "١ أغسطس ٢٠٢٦", and usage meters «المستخدمون النشطون 12/25», «الأقسام 4/10», «العقود الشهرية 8/20», «تخزين المستندات 15/100 جيجا» — drawn under «استخدامك هذا الشهر» (line 188). The auto-renew toggle promises «سيتجدد تلقائياً في ١ أغسطس ٢٠٢٦ بمبلغ بموجب عقد» (lines 160-161). N
```

> **المراجع:** Content confirmed: invoices 112-116, corporate plan 50-60 (name "Corporate Legal", renewal «١ أغسطس ٢٠٢٦», the four meters), rendered under «استخدامك هذا الشهر» 186-214 and «آخر الفواتير» 219-237 with an emerald «مدفوع» badge at 225-227; auto-renew copy at 159-163; BackendReadyNotice at :120 is null in prod. No fetch/supabase in the file — every button is a setLocalAction. Same always-visible gate as finding 2 (unset business_role → owner). Severity corrected blocking→high: for userType "corporate" plan.price is «بموجب عقد» (line 52), so the invoice rows render with no riyal figure and the toggle reads «سيتجدد تلقائياً في ١ أغسطس ٢٠٢٦ بمبلغ بموجب عقد». Fabricated plan, meters and paid-invoic

### 28. The corporate landing page — the only corporate dashboard route that is reachable — shows an invented plan and quota banner

- **الملف:** `src/app/dashboard/business/page.tsx:69`
- **النوع:** بيانات مخترعة
- **السطح:** مالية الشركة والاشتراكات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Corporate login lands on /dashboard/business, which is one of only two routes in CORPORATE_SIDEBAR (navigation.sidebars.business.ts:52). The banner is gated `canManageBilling = businessRole === "owner"` (line 111), so the company owner — the account that would discuss billing — is exactly who sees it.

```
// ── Subscription plan mock (replace with real user context when backend ready) ──
const BUSINESS_PLAN = {
  name: "Growth",
  requestsUsed: 12, requestsLimit: 20,
  consultationsUsed: 3, consultationsLimit: 5,
  aiQueriesUsed: 18, aiQueriesLimit: 30,
};

Rendered at line 438 as «باقتك الحالية — Growth» with three live-looking progress bars (lines 444-446) and an «اقتربت من الحد — فكّر في الترقية» warning at 80%. Nothing labels it as sample data on screen — the honest note is a source comment only. The banner's «ترقية الباقة» link (line 439) points at /dashboard/business/wallet, which layout.tsx:103 refuses to render for any non-admin, so the upgrade path is a dead end. The surrounding STAT
```

> **المراجع:** Confirmed, and the reachability argument is stronger than written. BUSINESS_PLAN at page.tsx:68-76 renders at 429-469 as «باقتك الحالية — Growth» with three computed bars and the 80% «اقتربت من الحد — فكّر في الترقية» warning; nothing on screen labels it sample (the honest note is a source comment at :67). Gate at :111 `canManageBilling = businessRole === "owner"` reads :105 `businessRole = (user).businessRole ?? "owner"`, and since nothing writes business_role anywhere in the repo, EVERY corporate account falls to owner. It also passes the route guard: getBusinessRouteDecision defaults an unset role to "employee" (entityRouteAccess.ts:151) and /dashboard/business is `match: "exact"` with AL


## متوسط — 18

### 1. «قضاياي» can never list a case — nothing in the codebase ever writes the cases table, and the filter asks for a status it cannot have

- **الملف:** `src/app/dashboard/client/cases/page.tsx:120`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** لوحة العميل الرئيسية والقضايا
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Sidebar «ملفاتي > قضاياي» (navigation.sidebars.primary.ts:31), and the dashboard's «عرض الكل» link. The user-visible contradiction: the dashboard home asserts «لديك قضيتان نشطتان», the client clicks through, and this page renders «لا توجد قضايا مطابقة». Three independent reasons it stays empty: (1) nothing ever inserts into cases; (2) the table defaults status to 'open' (migration line 71) while the query filters .eq("status","active"); (3) even a hand-inserted row has no client/court/type/nextDate columns, so the card would print an empty «المحامي:» and type "general". The card also links to /cases/{cases.id} while the detail page resolves ids against service_requests — a different id space.

```
getActiveCases()
  .then(data => {
    setCases(data.map(c => ({ ... lawyer: c.client || '', court: c.court || '', ...
```

> **المراجع:** All three legs verified. (1) from("cases") has exactly three call sites, all selects (api/v1/cases/route.ts:29, cases/[id]/route.ts:24, admin/erp/route.ts:22); no insert in src/ and none in any migration. The «قضية جديدة» modal is not a counterexample — NewCaseModal/ contains no fetch, apiMutate or service import at all. (2) getActiveCases → getCases({status:"active"}) → GET /api/v1/cases?status=active → .eq("status", status) at route.ts:36, while public.cases defaults status to 'open' (migration line 72). (3) SharedCase (casesStore.ts:10-19) has client/court/type/nextDate, none of which are columns on public.cases, so even a hand-inserted row prints an empty «المحامي:» and type 'general'. T

### 2. /cases/updates is a fully fabricated case file — invented lawyer, hearings, progress percentage — under copy promising it is live

- **الملف:** `src/app/dashboard/client/cases/updates/page.tsx:30`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة العميل الرئيسية والقضايا
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** URL-only. I grepped all of src/ for "cases/updates" and found ZERO inbound links — it is not in the sidebar, not linked from /cases or /cases/[id]. A client reaches it only by typing the path or following an old link, which is why this is capped at medium rather than blocking despite the content. Two dead controls live inside it as sub-symptoms of the same mock: the «تفاصيل» button (line 196) and «اسأل عن قضيتي» (line 237) both have no onClick.

```
const SHARED_FROM_LAWYER: SharedItem[] = [
  { id: 't1', type: 'task', title: 'رفع لائحة الدعوى', status: 'done', date: '١ فبراير ٢٠٢٦', note: 'تم رفع اللائحة وتسجيلها بنجاح', lawyerName: 'م. فيصل الغامدي' },
```

> **المراجع:** Verified: SHARED_FROM_LAWYER at cases/updates/page.tsx:30-81 is six invented items all attributed to «م. فيصل الغامدي»; progressPct is computed from them at module scope (line 100); line 158 reads «كل ما شاركه محاميك معك — مباشرة وفوري»; line 194 asserts «جلسة المرافعة النهائية — ٢٢ مايو ٢٠٢٦». The file has no fetch, no service import and no demo/beta guard. The two dead controls check out — the «تفاصيل» button (line 196) and «اسأل عن قضيتي» (line 237) are plain <button> elements with no onClick. Reachability confirmed as the auditor described: grep for "cases/updates" across src/ returns zero inbound links, and the static `updates` segment does render (it takes precedence over cases/[id]). 

### 3. Every subscriber consultation is claimed as «مشمولة في باقتك» and billed 0, because the used-count is hardcoded to zero

- **الملف:** `src/app/dashboard/client/consultation/new/page.tsx:187`
- **النوع:** بيانات مخترعة
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Any client on an admin-granted tier ≥2 → /dashboard/client/consultation/new → book more than one paid consultation; every one shows the green «مشمولة» badge and a 0 total.

```
`const consultationsUsed = 0;` (187) → `const includedAllowance = service.requiresPayment ? consultationLimit : 1;` (198) → `const consultationIncluded = consultationsUsed < includedAllowance;` (199). For `tierRank >= 2` the limit is 1 (183), so the comparison is permanently true. PlanBadge then renders «مشمولة في باقتك — بدون تكلفة إضافية» (ClientConsultationComponents.tsx:52-55) on the subscriber's second, fifth and twentieth consultation alike, `payableTotal` is 0 (200), and the row is written `payment: { amount: payableTotal, status: ... "included" }` (251-256). The tier's stated allowance of one consultation is never enforced and the client is told, falsely, that this one is covered.
```

> **المراجع:** Facts confirmed: `const consultationsUsed = 0;` (new/page.tsx:187, with a TODO admitting no count endpoint exists), `includedAllowance = service.requiresPayment ? consultationLimit : 1` (198), `consultationIncluded = consultationsUsed < includedAllowance` (199) — permanently true for tierRank>=2 where the limit is 1 (183). It flows into `payableTotal = 0` (200), the label «تأكيد بدون رسوم» (330), `payment.status: "included"` (251-256), and both PlanBadge call sites (497-501, 799-803), where ClientConsultationComponents.tsx:48-55 renders «مشمولة في باقتك — بدون تكلفة إضافية». Severity corrected high→medium: the statement is false from the second consultation on, but the direction of the error

### 4. The lawyer the client picked is saved under `lawyerName` but the consultation pages read `lawyer`, so the selection never appears

- **الملف:** `src/app/dashboard/client/consultation/new/page.tsx:265`
- **النوع:** مُدخلات تُرمى
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client/consultation/new?lawyer=<id> (the link the find-lawyer page produces) → confirm → open the consultation from «استشاراتي».

```
The wizard writes `lawyerId: selectedLawyer?.id ?? null, lawyerName: selectedLawyer?.name ?? null,` (264-265). Both consultation pages read a different key: `String(request.metadata?.lawyer ?? "بانتظار تأكيد المحامي")` (consultation/page.tsx:409) and `String(found.metadata?.lawyer ?? "بانتظار تأكيد المحامي")` (consultation/[id]/page.tsx:148). `metadata.lawyer` is written by nothing in this flow, so even a client who arrived via `?lawyer=<id>`, saw the lawyer's name on the confirmation screen (370) and had it stored, is told forever that no lawyer has been confirmed. Same class of key mismatch for `metadata?.day` / `metadata?.time` (153-154), which are never written, so date/time always read 
```

> **المراجع:** Key mismatch verified in both directions. Writer: `lawyerId: selectedLawyer?.id ?? null, lawyerName: selectedLawyer?.name ?? null` (new/page.tsx:264-265), inside a metadata object I read in full (258-269) — no `lawyer`, no `day`, no `time`. Readers: `String(request.metadata?.lawyer ?? "بانتظار تأكيد المحامي")` (consultation/page.tsx:409) and the identical line at [id]/page.tsx:148, plus `metadata?.day` / `metadata?.time` at 153-154. I grepped for any writer of `metadata.lawyer` across src/app and src/lib — including the admin assignment path in api/v1/service-requests/[id]/route.ts, which sets `assigned_to`, not a metadata name — and found none. So a client who booked a named lawyer is told 

### 5. «الوقائع والبيانات المستهدفة» shows a placeholder sentence as if facts had been extracted

- **الملف:** `src/app/dashboard/client/consultation/[id]/page.tsx:668`
- **النوع:** بيانات مخترعة
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Any AI consultation detail page, and its downloaded report.

```
`{consultation.questionText || "تأصيل الوقائع التي تم إدخالها وتطويرها في الاستبيان"}` (668), and in the PDF `<td>${consultation.questionText || "تأصيل الوقائع المحددة من الاستبيان التشخيصي"}</td>` (488). `questionText: found.metadata?.question as string` (158) — no code path anywhere writes `metadata.question` (the wizard's metadata keys are listed at 258-269), so the fallback is what always renders. The client reads a sentence describing an intake questionnaire that does not exist, presented as the facts the system derived from their case.
```

> **المراجع:** Confirmed and reinforced by my /ai/consult check. `questionText: found.metadata?.question as string` ([id]/page.tsx:158) and no code path writes `metadata.question` — the wizard's metadata keys are exhaustively listed at 258-269, /ai/consult writes no workflow row at all, and the `edit_details` endpoint only rewrites `description` + `editHistory`. So the `||` fallbacks always fire: «تأصيل الوقائع التي تم إدخالها وتطويرها في الاستبيان» on screen (668, under the label «الوقائع والبيانات المستهدفة» and the card subtitle «موجز الوقائع التي تم مطابقتها وتحليلها بالذكاء الاصطناعي», 662) and «تأصيل الوقائع المحددة من الاستبيان التشخيصي» in the PDF table row «الوقائع المستخلصة» (487-488) and in the 

### 6. The consultation fee is relabelled «القيمة المالية المقدرة» (estimated monetary value of the matter) in the report

- **الملف:** `src/app/dashboard/client/consultation/[id]/page.tsx:491`
- **النوع:** بيانات مخترعة
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** AI consultation detail page → «تنزيل التقرير الموثق PDF».

```
`<th>القيمة المالية المقدرة</th>` / `<td>${consultation.price.toLocaleString("ar-SA")} ر.س</td>` (491-492), where `price: found.payment.amount` (156) is what the client was charged for the consultation itself. A client whose free AI consultation cost 0 reads that their claim is worth «٠ ر.س» in a document headed «تقرير استشارة وتشخيص قانوني رسمي للعميل».
```

> **المراجع:** Confirmed. The PDF table renders `<th>القيمة المالية المقدرة</th><td>${consultation.price.toLocaleString("ar-SA")} ر.س</td>` (491-492) in the «موجز الوقائع والاستخلاص الأولي» section of a document headed «تقرير استشارة وتشخيص قانوني رسمي للعميل» (477). `price: found.payment.amount` (156) is the consultation fee — and I traced where that number comes from: `payment: { amount: payableTotal }` (new/page.tsx:251-252), i.e. what the client was charged for the booking. The free AI path sets it to 0, so the report states the matter's estimated value is «٠ ر.س». Medium is right — a mislabelled column, not a fabricated figure.

### 7. «حجم المجموعة» picker in the create-group modal has no value/onChange and its answer never reaches createGroup

- **الملف:** `src/app/dashboard/client/my-group/page.tsx:245`
- **النوع:** مُدخلات تُرمى
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** The sidebar entry is `requiresClientGroup: true` (navigation.sidebars.primary.ts:69, filtered in SidebarComponents.tsx:208), so a user with no group reaches it from the pricing page CTA `ctaHref: "/dashboard/client/my-group?action=create"` (src/constants/pricing/pricing.individuals.ts:49 and :136) → EmptyState → «أنشئ مجموعة جديدة». Note the create modal itself is honest about billing («نظام الفوترة والتناوب غير مفعَّل بعد — لن يتم سحب أي مبلغ الآن», line 259) — the finding is the discarded selection and the fixed 5-seat ceiling, not the discount copy.

```
my-group/page.tsx:245-251 — `<select className={...}>` with four options («٥ أشخاص (خصم ٣٠٪) - الأفضل» … «شخصين (خصم ١٥٪)») and no `value`, no `onChange`, no ref. The submit handler at :270-280 sends only the name: `await createGroup({ name: groupName.trim() || GROUP.name });`. src/lib/services/groupService.ts:88 accepts `{ name, description?, max_members? }` and forwards it to POST /api/v1/groups, so the field the picker is for exists and is simply never populated. The group then renders a hardcoded ceiling everywhere — DEFAULT_GROUP `maxMembers: 5` (line 34) is what :386, :444 and :495 («متبقي {GROUP.maxMembers - MEMBERS.length} مقعد») print.
```

> **المراجع:** Read the modal directly. my-group/page.tsx:245-251 is a bare `<select className={…}>` with four discount options and no value, onChange, name or ref. The submit handler at :268-280 sends only `await createGroup({ name: groupName.trim() || GROUP.name })`, and groupService.ts:88 `createGroup(data: { name; description?; max_members? })` forwards the body to POST /api/v1/groups — the field the picker exists for is accepted and simply never populated. The 5-seat ceiling is also confirmed hardcoded: DEFAULT_GROUP.maxMembers = 5 (line 33) and line 184 rebuilds the group as `{ ...DEFAULT_GROUP, id, name, invite_code }`, so `GROUP.maxMembers` at :386, :444, :482 and :495 is always 5 whatever the serv

### 8. Attachment button in the lawyer chat is a bare <button> with no handler — a client attaching evidence gets silence

- **الملف:** `src/app/dashboard/client/messages/page.tsx:573`
- **النوع:** زر لا يعمل
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Sidebar → «رسائلي» (navigation.sidebars.primary.ts:35) → /dashboard/client/messages → open any active thread; the paperclip sits inside the composer, left of the text input, whenever the thread is not closed.

```
messages/page.tsx:573-575 — `<button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">` / `<Paperclip size={18} />` / `</button>`. No onClick, no file input, no <label> wrapper (contrast the documents page, which wraps its hidden input in a <label> at documents/page.tsx:503-519). `chat.sendMessage` (useChat.ts:26) does accept `type?: "text" | "file"` and ChatMessage carries `message_type: "text" | "file" | "system"` (chatService.ts:33), so the file path exists in the service and is simply never wired to this control.
```

> **المراجع:** Confirmed by reading the composer. messages/page.tsx:573-575 is `<button className="p-1.5 text-gray-400 …"><Paperclip size={18} /></button>` — no onClick, no hidden <input type="file">, no <label htmlFor>, and no file-input element anywhere in the file. The service layer does support it (useChat.ts:26 `sendMessage: (content, type?: "text" | "file")`), so the path exists and is unwired, as claimed. Reachable: sidebar :35 → /dashboard/client/messages; the composer renders whenever `!isClosed`, conditional only on the account having at least one real chat room (chat.rooms from getChatRooms, no mock fallback in supabase mode). Category A, medium.

### 9. find-lawyer header prints an invented platform rating (4.7/5) and consultation count (1,900+) as live stats

- **الملف:** `src/app/dashboard/client/find-lawyer/page.tsx:466`
- **النوع:** بيانات مخترعة
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Sidebar → «ابحث عن محامٍ» → /dashboard/client/find-lawyer. These two tiles render unconditionally, above the results grid, in every state including the empty one — so they are visible even when the page is admitting it has no lawyers.

```
find-lawyer/page.tsx:465-467 — `{ label: 'متوسط التقييم', value: '4.7', unit: '/ 5' }, { label: 'استشارة مكتملة', value: '1,900+', unit: '' }` rendered at :469-474 inside a block the page's own comment (line 453) labels «Right: live stats — asymmetric data block». Neither number has a source: src/lib/services/lawyerService.ts:29-31 states outright that «there is no ratings table, no reviews table and no case-outcome data anywhere in the schema». Nothing marks these as illustrative.
```

> **المراجع:** Verified verbatim. find-lawyer/page.tsx:465-467 is a literal array `[{ label: 'متوسط التقييم', value: '4.7', unit: '/ 5' }, { label: 'استشارة مكتملة', value: '1,900+', unit: '' }]` mapped into tiles at :468-475, inside the block the file itself labels «Right: live stats — asymmetric data block» (line 453). Nothing labels them as sample or illustrative, and there is no ratings/reviews/consultation-count source — lawyerService.ts:29-31 states plainly that no such table exists in the schema. The tiles render unconditionally above the AnimatePresence results block, so they show in the loading, empty and no-results states alike. Category B, reachable via sidebar :23, medium.

### 10. Permanent fake unread badge "2" on «رسائلي» in every client sidebar

- **الملف:** `src/constants/navigation.sidebars.primary.ts:35`
- **النوع:** بيانات مخترعة
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Visible on every /dashboard/client/* page for every individual client, from first login onwards, including accounts with zero chat rooms.

```
navigation.sidebars.primary.ts:35 — `{ label: "رسائلي", labelEn: "Messages", href: "/dashboard/client/messages", icon: "ChatCircle", badge: "2" }`. It is rendered verbatim: src/components/dashboard/SidebarComponents.tsx:159-161 `{!compact && !isLocked && item.badge && ( … {item.badge} … )}`. The real unread number exists and is used elsewhere on the messages page itself (`unread: room.unread_count || 0`, messages/page.tsx:211), so this is a constant standing in for data the app already has.
```

> **المراجع:** Confirmed, and I checked for an override rather than assuming. navigation.sidebars.primary.ts:35 hardcodes `badge: "2"` on the Messages item. SidebarComponents.tsx:158-162 renders `{item.badge}` verbatim whenever `!compact && !isLocked`; the only competing branch is the tier UpgradeBadge at :153-155, and the Messages item carries no gateKey so `isLocked` is false. A grep for `badge` across src/components/dashboard/ turns up no code that substitutes a live unread count for this item, and navigation.sidebars.ts:441-461 does not filter /dashboard/client/messages. The real number does exist and is used on the page itself (messages/page.tsx:211 `unread: room.unread_count || 0`). Category B, visib

### 11. Every message a client sends instantly shows a green "read" receipt that nothing on the server backs

- **الملف:** `src/app/dashboard/client/messages/page.tsx:232`
- **النوع:** بيانات مخترعة
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Sidebar → «رسائلي» → open a thread → send a message; the green filled check appears under the bubble immediately.

```
messages/page.tsx:227-233 maps every fetched message with `read: true,` regardless of anything, and the optimistic bubble at :289-295 is created with `read: true` too. The renderer at :518-522 turns that into a receipt: `msg.sender === "client" && (msg.read ? <CheckCircle size={12} className="text-emerald-500" weight="fill" /> : <Circle size={12} />)`. `ChatMessage` (src/lib/services/chatService.ts:27-36) has no read field at all — the only read state in the schema is `ChatParticipant.last_read_at` (chatService.ts:42), which this page never reads. The `<Circle>` (unread) branch is therefore unreachable and the client is told the lawyer has read every message the moment they press send.
```

> **المراجع:** Confirmed on both paths. messages/page.tsx:227-233 maps every fetched message with a literal `read: true`, and the optimistic bubble at :285-291 is built with `read: true` as well. The renderer at :518-523 turns that into `msg.sender === "client" && (msg.read ? <CheckCircle className="text-emerald-500" weight="fill" /> : <Circle />)`, so the unread branch is unreachable. chatService.ts's ChatMessage carries no read field; the only read state in the schema is ChatParticipant.last_read_at, which this page never queries. The optimistic path alone is enough: press send and a green filled check appears under the bubble immediately, telling the client their lawyer has read it. Category B, medium.

### 12. EscalationFlow banner tells a company with no case that «قضيتك فيها تفاصيل تحتاج نظر محامي», from a hardcoded complexity score

- **الملف:** `src/app/dashboard/business/page.tsx:472`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business, near the bottom of the overview, under the legal-library banner.

```
page.tsx:472 — `<EscalationFlow complexityScore={55} variant="banner" onDismiss={() => {}} />`. The literal 55 selects the middle branch at EscalationFlow.tsx:139-142 (`complexityScore >= 70 ? t.complexHigh : complexityScore >= 40 ? t.complexMid : t.complexLow`) and the result is rendered as a styled notice at line 190. `t.complexMid` is EscalationFlow.tsx:55 — `complexMid: "قضيتك فيها تفاصيل تحتاج نظر محامي — فكّر في استشارة"`. It is presented as an assessment of the reader's matter, on a dashboard where no case, document or question has been submitted, and where no scoring code ran — the number is typed into the JSX. Same literal banner is rendered in ServiceModeView at BusinessSubViews.ts
```

> **المراجع:** Verified: page.tsx:472 passes the literal complexityScore={55}; EscalationFlow.tsx:139-142 selects t.complexMid for 40<=score<70; EscalationFlow.tsx:55 is «قضيتك فيها تفاصيل تحتاج نظر محامي — فكّر في استشارة», rendered in the styled complexity notice at ~190. No scoring code runs. The subtitle copy compounds it («الذكاء الاصطناعي أعطاك نتيجة أولية»), claiming an AI assessment that never happened. Same literal at BusinessSubViews.tsx:190. The auditor's self-check is also correct and honest: the dismiss button is genuinely wired (setDismissed(true) at 165, `if (dismissed) return null` at 137), so this is not a dead control. Medium stands.

### 13. The phone number /register/client requires is dropped by the SDK and never reaches the server at all

- **الملف:** `src/app/register/client/page.tsx:257`
- **النوع:** مُدخلات تُرمى
- **السطح:** التسجيل ومسار الاستقبال المشترك
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /register/client (public) -> pick any account type -> step 2 «رقم الجوال» is required to advance -> step 3 «إنشاء الحساب». The account is created and the number is gone. The proxy's onboarding gate (src/proxy.ts:280-292, needsOnboarding with `hasPhone`) re-asks for it — but only on a PROTECTED prefix (src/proxy.ts:114-115 `const isProtected = PROTECTED.some(...); if (!isProtected) return NextResponse.next();`), and PROTECTED (src/proxy.ts:40-55) contains neither /book/consultation nor /ai/orders. So a client can register, book a consultation and track it without ever being asked again, and that order reaches the admin queue reading «لا يوجد جوال».

```
page.tsx:257 — `phone: formData.phone ? `+${formData.countryCode || "966"}${formData.phone}` : undefined,` — passed as a SIBLING of `email` to `supabase.auth.signUp`. auth-js 2.107.0 (node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:659-679) takes the email branch: `if ('email' in credentials) { const { email, password, options } = credentials; ... body: { email, password, data: options?.data ?? {}, gotrue_meta_security, code_challenge, code_challenge_method }`. `phone` is never destructured and never put in the body, so it is not transmitted in any form. It is also absent from `options.data` (lines 259-292 list user_type, display_name, full_name, tier, sub_role, country_code, city, 
```

> **المراجع:** CONFIRMED as a category-C discard, but severity downgraded high -> medium. Verified empirically: node_modules/@supabase/auth-js is 2.107.0 and GoTrueClient.js signUp() takes `if ('email' in credentials)` first, destructuring only `{ email, password, options }` and building `body: { email, password, data: options?.data ?? {}, gotrue_meta_security, code_challenge, code_challenge_method }` — `phone` is never destructured on that branch and never transmitted. It is also absent from options.data (page.tsx:259-292). The call is inside `if (BACKEND_MODE === "supabase")` (page.tsx:249) — the PRODUCTION branch, not a demo guard. handle_new_user()'s profiles insert is confirmed four-column (`INSERT IN

### 14. Government registration: the entity name is collected, then the signup trigger writes the placeholder «جهة حكومية جديدة»

- **الملف:** `src/app/register/client/page.tsx:285`
- **النوع:** مُدخلات تُرمى
- **السطح:** التسجيل ومسار الاستقبال المشترك
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /register/client -> step 1 «جهة حكومية» (rendered from data.ts:30-37) or /register/client?type=government (page.tsx:59 whitelists it) -> fill «اسم الجهة الحكومية» -> create account.

```
The government metadata spread sends only two keys — page.tsx:285-288: `...(clientType === "government" && { government_role: formData.governmentRole || "gov_counsel", officer_specialty: formData.officerSpecialty || null, }),`. The trigger's government branch reads two DIFFERENT keys — 20260826_corporate_identity_persisted.sql:269-275: `INSERT INTO public.government_profiles (owner_user_id, entity_name_ar, entity_type) VALUES (new.id, COALESCE(new.raw_user_meta_data->>'entity_name', 'جهة حكومية جديدة'), COALESCE(new.raw_user_meta_data->>'entity_type', 'other'))`. Neither `entity_name` nor `entity_type` is ever sent, so the COALESCE always takes its fallback and every government row stores th
```

> **المراجع:** CONFIRMED exactly as written. The form writes the camelCase key `entityName` (Steps.tsx:168 `onChange("entityName", ...)`), the signup metadata spread sends only `government_role` and `officer_specialty` (page.tsx:285-288), and the trigger's government branch reads the snake_case `entity_name`/`entity_type` (20260826:269-275). grep across src/ for `entity_name` returns only the admin read at dashboard/admin/users/[id]/page.tsx:188 — the write key is never sent, so COALESCE always takes 'جهة حكومية جديدة'. Confirmed the entityName value survives only as profiles.display_name via the fallback chain at page.tsx:246.  Robust to the obvious refutation: I cross-checked the PREVIOUS trigger, 202608

### 15. NGO registration: org name becomes the placeholder «منظمة جديدة» and the national-centre registration number has no column and no reader

- **الملف:** `src/app/register/client/page.tsx:289`
- **النوع:** مُدخلات تُرمى
- **السطح:** التسجيل ومسار الاستقبال المشترك
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /register/client -> step 1 «جمعية / منظمة» (data.ts:38-45) or ?type=ngo -> fill both NGO fields -> create account.

```
page.tsx:289-291 sends one key: `...(clientType === "ngo" && { ngo_reg_number: formData.ngoRegNumber, }),`. The trigger's NGO branch reads two others — 20260826_corporate_identity_persisted.sql:279-284: `INSERT INTO public.ngo_profiles (owner_user_id, org_name_ar, org_type) VALUES (new.id, COALESCE(new.raw_user_meta_data->>'org_name', 'منظمة جديدة'), COALESCE(new.raw_user_meta_data->>'org_type', 'other'))`. `org_name` is never sent, so «اسم الجمعية / المنظمة» (Steps.tsx:205-206, `onChange("ngoName", ...)`) never lands in its column and every NGO row reads the placeholder — surfaced to admins via src/app/dashboard/admin/users/[id]/page.tsx:189 `ngo: ["org_name_ar", "org_type"]`. The registrat
```

> **المراجع:** CONFIRMED. page.tsx:289-291 sends only `ngo_reg_number`; the trigger's NGO branch reads `org_name`/`org_type` (20260826:279-284), and the form's key is `ngoName` (Steps.tsx:206). grep across src/ for `org_name` finds only the admin read at dashboard/admin/users/[id]/page.tsx:189, never a write — so COALESCE always yields 'منظمة جديدة'. Cross-checked the prior trigger: 20260821:181-188 is byte-identical, so this survives regardless of whether 20260826 is applied in prod.  The registration-number half is confirmed too: I read the ngo_profiles DDL (20260603_phase1_002_entities.sql:567-586) — columns are org_name_ar, org_name_en, org_type, volunteer_count, program_count, board_seats, compliance_

### 16. City and country selected at registration never reach profiles.city / profiles.country_code, which both exist as columns

- **الملف:** `src/app/register/client/page.tsx:265`
- **النوع:** مُدخلات تُرمى
- **السطح:** التسجيل ومسار الاستقبال المشترك
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /register/client -> step 2, the «الدولة» select and the «المدينة» select/input (Steps.tsx:389-432) are shown to every account type -> create account.

```
page.tsx:265-266 puts them in signup metadata: `country_code: formData.country || "SA", city: formData.city || null,`. The trigger reads neither — its profiles insert is `INSERT INTO public.profiles (id, display_name, email, user_type)` (20260826_corporate_identity_persisted.sql:197). Both columns exist and are real: `country_code text not null default 'SA'` with `create index ... idx_profiles_country_code` (20260603_phase1_001_profiles.sql:41,61) and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS city TEXT; -- 1b. profiles: add city column (frontend filters by city)` (20260616_production_readiness_fixes.sql:15-17). Both are on the self-service allowlist at src/app/api/v1/profile/route.ts:178-179
```

> **المراجع:** CONFIRMED, but the auditor's reasoning needs one correction that changes which half of it actually bites. Both controls are real and write formData (Steps.tsx:389-432: the country <select> offers SA/AE/EG/JO/KW/QA/BH/OM/MA and `onChange("country", ...)`; the city select/input writes `onChange("city", ...)`). Both are sent as metadata (page.tsx:265-266) and the trigger reads neither — verified four-column profiles insert at 20260826:196-197. Both columns are real: `country_code text not null default 'SA'` at 20260603_phase1_001_profiles.sql:41, and `ADD COLUMN IF NOT EXISTS city TEXT` at 20260616_production_readiness_fixes.sql:15-17. Both are on the self-service allowlist (api/v1/profile/rout

### 17. The national ID / Iqama number asked of every individual registrant is stored nowhere and read by nothing

- **الملف:** `src/app/register/client/page.tsx:272`
- **النوع:** مُدخلات تُرمى
- **السطح:** التسجيل ومسار الاستقبال المشترك
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /register/client -> step 1 «فرد» (the default and most common path) -> step 2 shows «رقم الهوية / الإقامة» (Steps.tsx:301 `{!isCompany && !isGov && !isNGO && (`) -> create account.

```
page.tsx:272-274: `...(clientType === "individual" && { id_number: formData.idNumber, }),`. `handle_new_user()` never reads `id_number` (its profiles insert is the four-column one at 20260826_corporate_identity_persisted.sql:197, and no branch fires for user_type 'individual'), `profiles` has no such column (20260603_phase1_001_profiles.sql:30-54), and grep for `id_number` across src/ finds only src/app/ai/gov/incident-report/page.tsx, an unrelated local form type for accused/witness rows — nothing reads the signup key. The value survives only in `auth.users.raw_user_meta_data`, which the 20260826 migration header explicitly names as the failure mode, not the destination: «the CR number the 
```

> **المراجع:** CONFIRMED. The field is real and shown to the most common account type: Steps.tsx:333-341, label «رقم الهوية / الإقامة», IdentificationCard icon, placeholder 1XXXXXXXXX, gated `{!isCompany && !isGov && !isNGO && (` at Steps.tsx:301. It is sent as `id_number` (page.tsx:272-274) inside the production `BACKEND_MODE === "supabase"` branch.  I read the full profiles DDL (20260603_phase1_001_profiles.sql:30-54): id, user_type, display_name, display_name_en, email, phone, avatar_url, country_code, language, calendar_type, theme, verified_at, nafath_verified, onboarding_completed, metadata, created_at, updated_at. No id_number column. I re-ran the grep myself: `id_number` across src/ hits only src/a

### 18. The booking calendar shows a hardcoded April 6–12 grid with two days greyed out as unavailable

- **الملف:** `src/components/consultation/constants.ts:96`
- **النوع:** بيانات مخترعة
- **السطح:** التسجيل ومسار الاستقبال المشترك
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /book/consultation (public, absent from PROTECTED in src/proxy.ts:40-55) -> step 1 specialty -> step 2 description (20 chars) -> step 3, pick any non-AI consultation type -> «📅 حدّد وقتاً تفضّله» (StepScheduling.tsx:169) reveals the grid.

```
constants.ts:96-104: `export const calendarSlots = [ { dayAr: "الأحد", dayEn: "Sun", date: "6 أبر", dateEn: "Apr 6", times: ["10:00", "14:00", "16:30"] }, ... { dayAr: "الثلاثاء", ... times: [] }, ... { dayAr: "الجمعة", ... times: [] }, ...]`. StepScheduling.tsx:262-277 renders it as a live 7-day picker: `{calendarSlots.map(d => { const hasFree = d.times.length > 0; ... <motion.button ... disabled={!hasFree} ...` with `!hasFree ? "cursor-not-allowed opacity-30"` and a green availability dot `{hasFree && <span className={... "bg-emerald-400"} />}`, printing `{d.date.split(" ")[0]}` — i.e. the bare numbers 6,7,8,9,10,11,12 as if they were this week's dates. Today is 2026-08-26. Nothing on scre
```

> **المراجع:** CONFIRMED. calendarSlots (constants.ts:96-104) is exactly as quoted — a fixed table dated 6-12 أبر with Tuesday and Friday carrying `times: []`. StepScheduling.tsx:262-277 renders it live: `disabled={!hasFree}`, `!hasFree ? "cursor-not-allowed opacity-30"`, a green `bg-emerald-400` availability dot on the days that do have times, and `{d.date.split(" ")[0]}` printing the bare numerals 6-12 as though they were dates. Today is 2026-08-26.  I specifically checked the exclusion-1 escape and it does not apply: I read the gate that opens the whole timing block (StepScheduling.tsx:101 `{consultType && consultType !== "ai" && (`) — an ordinary runtime condition on the picked consultation type, not i


## منخفض — 23

### 1. «طلب مراجعة من محامٍ» passes ?escalate=<id>, which the target page never reads

- **الملف:** `src/app/dashboard/client/consultation/[id]/page.tsx:803`
- **النوع:** مُدخلات تُرمى
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** AI consultation detail page → «طلب مراجعة من محامٍ» button next to the PDF download.

```
`<Link href={`/dashboard/client/consultation/new?escalate=${consultation.id}`}>` (803). The new-consultation wizard reads only `specialty`, `q`, `path`, `type`, `lawyer` (consultation/new/page.tsx:139-143); `grep -rn escalate src/app` returns no reader outside the unrelated /ai/global helper. The client lands on a blank wizard with no specialty, no question and no link back to the AI opinion they asked a lawyer to review, and must retype everything.
```

> **المراجع:** Verified. The link is `href={`/dashboard/client/consultation/new?escalate=${consultation.id}`}` ([id]/page.tsx:803), and the wizard's URL effect reads only `specialty`, `q`, `path`, `type`, `lawyer` (new/page.tsx:139-143). My own repo-wide grep for `escalate` returns hits only in ai/global/globalResearchHelper.ts + ai/global/page.tsx (an unrelated boolean) and ai/mail-advisor (a tone id) — no reader of the query param. Severity corrected medium→low: the button does navigate and the client CAN still book the lawyer review; nothing is claimed to have been carried over and no data is destroyed. It is a lost hand-off that forces retyping, closer to a UX gap than a lie.

### 2. Dead «عرض» button on the pending-signature alert (currently unrenderable)

- **الملف:** `src/app/dashboard/client/contracts/page.tsx:311`
- **النوع:** زر لا يعمل
- **السطح:** طلبات العميل والاستشارات والخطابات
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** Client sidebar «عقودي» → /dashboard/client/contracts; the alert block is skipped because no ai_draft row is ever in a pending_signature-mapped status.

```
`<button className={...}>عرض <ArrowUpRight size={14} weight="bold" /></button>` (311-315) — no `onClick`. Stating the reachability honestly: it renders only when some `ai_draft` request maps to `pending_signature`, i.e. status in_review/pending_signature/pending_assignment (mapContractStatus, 20-36). Every creator of `type: "ai_draft"` writes `status: "completed"` (ai/contract-drafter/page.tsx:104, ai/gov/judgment-drafter/page.tsx:44, ai/ngo/volunteer-contract/page.tsx:138, ai/micro/page.tsx:173), which maps to `active` — so today the alert and its dead button never appear. Only an admin moving such a row to in_review would surface it. Reported as low for that reason.
```

> **المراجع:** Both halves check out, and the auditor stated the reachability honestly rather than overclaiming. The button at contracts/page.tsx:311-315 carries className only — no onClick, no Link wrapper. The alert is gated on `contracts.some(c => c.status === 'pending_signature')` (295), fed by `requests.filter(r => r.type === 'ai_draft')` (221) through `mapContractStatus` (20-36). I opened all four ai_draft creators: contract-drafter:104, gov/judgment-drafter:44 and ngo/volunteer-contract:138 all write `status: "completed"` → `active`; ai/micro (159-171) emits `type: "ai_draft"` only when `selected?.id === "labor_contract"`, which by the same ternary also forces `status: "completed"` — so its pending_

### 3. «عرض الملف» on a lawyer card links to /lawyers/[id], which BETA_MONOPOLY_MODE redirects to a marketing page instead of the profile

- **الملف:** `src/app/dashboard/client/find-lawyer/page.tsx:237`
- **النوع:** زر لا يعمل
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** NOT reachable today: this Link lives inside LawyerCard, and finding #1 proves `sorted` is always empty so no card is ever rendered. Reported because it is the landmine directly behind that fix — repairing the row-shape bug makes this misleading control live in the same commit. Same applies to the «احجز الآن» button, the price label and the «متاح الآن» pill on the card.

```
find-lawyer/page.tsx:236-241 — `<Link href={\`/lawyers/${l.id}\`} …>عرض الملف</Link>`. src/app/lawyers/layout.tsx:27 — `if (BETA_MONOPOLY_MODE) redirect("/services/lawyers");`, and BETA_MONOPOLY_MODE is `true` (src/lib/betaConfig.ts:46). Pressing "view profile" therefore never shows a profile; it bounces to the single-firm services page. The `[id]` route under this surface is itself only `redirect(\`/lawyers/${params.id}\`)` (find-lawyer/[id]/page.tsx:4), i.e. the same destination.
```

> **المراجع:** Every fact checks out: find-lawyer/page.tsx:236-241 `<Link href={`/lawyers/${l.id}`}>عرض الملف</Link>`; src/app/lawyers/layout.tsx:27 `if (BETA_MONOPOLY_MODE) redirect("/services/lawyers");`; betaConfig.ts:46 `export const BETA_MONOPOLY_MODE = true;`; and find-lawyer/[id]/page.tsx is nothing but `redirect(`/lawyers/${params.id}`)`, i.e. the same bounce. I am confirming rather than refuting because the finding does not overstate itself — it explicitly declares reachable:false and explains that finding #1 keeps `sorted` empty so no card ever renders. It is a latent landmine behind the #1 fix, not a lie any user is told today; keep it at low and reachable:false.

### 4. «ترتيب» (sort) button on My Documents has no handler

- **الملف:** `src/app/dashboard/client/documents/page.tsx:618`
- **النوع:** زر لا يعمل
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Sidebar → «مستنداتي» (navigation.sidebars.primary.ts:34) or navbar (navigation.navbar.ts:92) → /dashboard/client/documents; the button sits beside the search box.

```
documents/page.tsx:618-625 — `<button className={...}>` … `<SortAscending size={18} weight="bold" />` `<span className="hidden sm:inline">ترتيب</span>` `</button>`. No onClick anywhere on it, and the page holds no sort state (only `search`, `isDragOver`, `uploading`, `error`, `actionError`). The list order is whatever getDocuments() returned. The rest of this page is genuinely wired — upload, view, download and delete all hit real services with real Arabic error banners.
```

> **المراجع:** Confirmed. documents/page.tsx:618-625 is `<button className={…}><SortAscending size={18} weight="bold" /><span className="hidden sm:inline">ترتيب</span></button>` with no onClick, and the page's entire state is docs/loading/search/isDragOver/uploading/error/actionError (lines 260-269) — no sort key, no comparator, and `filtered` is search-only. The auditor's fairness note is accurate: upload, view, download and delete on this page are genuinely wired. Category A, reachable via sidebar :34, low.

### 5. Settings (gear) button in the group header has no handler

- **الملف:** `src/app/dashboard/client/my-group/page.tsx:401`
- **النوع:** زر لا يعمل
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/client/my-group while the user is in a group (sidebar «ربعي», shown only when hasClientGroup) — top-right of the group header.

```
my-group/page.tsx:401-404 — `<motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }} transition={sp} className={...}>` `<Gear size={16} />` `</motion.button>`. No onClick; it animates on hover and press and does nothing. It sits directly beside «دعوة عضو», which IS wired (handleInvite → inviteToGroup, line 355-370).
```

> **المراجع:** Confirmed, and I checked the honest-marker escape hatch. my-group/page.tsx:401-404 is a `<motion.button whileHover whileTap transition={sp} className={…}><Gear size={16} /></motion.button>` with no onClick — it animates and does nothing, sitting beside the «دعوة عضو» button that IS wired (handleInvite → inviteToGroup, :355-370). DashboardComingSoon is used in this file, but only at line 431, wrapping the billing/rotation block further down the page; the header at 401 is outside it, so the button is not covered by an honest not-built-yet marker. Category A, reachable only while the user is in a group, low.

### 6. Pricing-page CTA passes ?action=create to My Group, which reads searchParams and never uses it

- **الملف:** `src/app/dashboard/client/my-group/page.tsx:126`
- **النوع:** زر لا يعمل
- **السطح:** محفظة العميل والإحالات والبحث عن محامٍ
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Pricing page → an individual plan's group CTA → /dashboard/client/my-group?action=create.

```
my-group/page.tsx:126 — `const searchParams = useSearchParams();` is the ONLY occurrence of `searchParams` in the file (verified by grep). Meanwhile src/constants/pricing/pricing.individuals.ts:49 and :136 both point their plan CTA at `"/dashboard/client/my-group?action=create"`, which implies the create-group modal opens on arrival. It does not — the user lands on the EmptyState and has to find «أنشئ مجموعة جديدة» themselves.
```

> **المراجع:** Confirmed. `grep -n 'searchParams' src/app/dashboard/client/my-group/page.tsx` returns exactly one line — :126 `const searchParams = useSearchParams();` — with no `.get(...)` anywhere in the file and no effect keyed on it, while pricing.individuals.ts:49 and :136 both send the plan CTA to `/dashboard/client/my-group?action=create`. The user lands on the EmptyState with the modal closed and must find «أنشئ مجموعة جديدة» themselves. Minor and self-recoverable, so low is right; it is a mis-wired CTA rather than a lie about money or a case.

### 7. «بروفيل الشركة التشغيلي» shows a hardcoded fictional company's profile to every corporate account

- **الملف:** `src/components/dashboard/business/BusinessProfileReadinessPanel.tsx:87`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business — rendered at page.tsx:188, above the header, on the default overview (and in compact form in ServiceModeView at BusinessSubViews.tsx:90).

```
The panel reads `currentCompanyFeatures` (line 29), which useAdminSettings.ts:205 resolves as `features[MOCK_CURRENT_COMPANY_ID] || DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID]` with `MOCK_CURRENT_COMPANY_ID = "C-001"` (useAdminSettingsHelper.ts:487) — a constant, never derived from the signed-in account. C-001 is `companySize: "large", legalStructure: "legal_department", serviceModel: "platform_and_litigation", hasInternalLegal: true` (useAdminSettingsHelper.ts:144-149). The panel prints those as this company's facts — line 84-87: `{ label: "حجم الشركة", value: BUSINESS_COMPANY_SIZE_LABEL[currentCompanyFeatures.companySize] }`, `{ label: "الهيكل القانوني", ... }`, `{ label: "قانوني داخلي", val
```

> **المراجع:** Mechanism verified: useAdminSettings.ts:205 resolves `features[MOCK_CURRENT_COMPANY_ID] || DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID]` with MOCK_CURRENT_COMPANY_ID = "C-001" (useAdminSettingsHelper.ts:487), never derived from the session; C-001 is companySize:"large", legalStructure:"legal_department", serviceModel:"platform_and_litigation", hasInternalLegal:true (helper 142-160), and the panel prints exactly those at lines 84-87. Rendered at page.tsx:188 and compact at BusinessSubViews.tsx:90. Downgraded medium→low: the mitigation is stronger than the auditor allowed. The panel carries a Warning-iconed amber box reading «كل الأسطح UI-ready؛ audit/approval/service entitlement الحقيقي ينتظر ba

### 8. Seven cards and links on the visible overview lead to sections the layout refuses to render

- **الملف:** `src/app/dashboard/business/page.tsx:257`
- **النوع:** زر لا يعمل
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business — click any of the four stat cards or the header «لوحة الأقسام» button.

```
Every STATS card is a link — page.tsx:257 `<Link key={i} href={s.href}>` over hrefs `/dashboard/business/cases?status=pending`, `/dashboard/business/employee-contracts`, `/dashboard/business/cases?type=labor`, `/dashboard/business/health-check` (page.tsx:29-32). Add «لوحة الأقسام» → /dashboard/business/kanban (page.tsx:208), «عرض الكل» → /kanban (page.tsx:292), each request row → /kanban (page.tsx:304), «إدارة الانتداب» → /cases (page.tsx:421) and «ترقية الباقة» → /wallet (page.tsx:440). None of those paths is in VISIBLE_BUSINESS_ROUTES, so layout.tsx:103 (`const sectionHidden = userType !== "admin" && !isVisibleBusinessRoute(pathname);`) renders SectionNotReady («هذا القسم قيد الإعداد») ins
```

> **المراجع:** Mechanism verified: VISIBLE_BUSINESS_ROUTES is derived from CORPORATE_SIDEBAR and contains exactly /dashboard/business and /dashboard/business/documents, so cases, employee-contracts, health-check, kanban and wallet all fail isVisibleBusinessRoute() and hit `sectionHidden` in layout.tsx. Downgraded medium→low: I read SectionNotReady (layout.tsx:50-67) and it is not merely a neutral placeholder — it says «هذا القسم قيد الإعداد» AND «لم يُربط هذا القسم ببيانات شركتك بعد، وقد أُخفي من القائمة حتى يجهز. ما كان يظهر فيه لم يكن يخصّك.» That last clause explicitly tells the user the content was never theirs, which is the honest not-built-yet marker the brief excludes from findings. The residual def

### 9. «إدارة من الأدمن» link on the corporate overview points at an admin route the proxy refuses to corporate users

- **الملف:** `src/components/dashboard/business/BusinessProfileReadinessPanel.tsx:74`
- **النوع:** زر لا يعمل
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /dashboard/business — top-right of the «بروفيل الشركة التشغيلي» panel, the first card on the page.

```
BusinessProfileReadinessPanel.tsx:73-79 — `<Link href="/dashboard/admin/business" className={...}> <Gear size={14} /> إدارة من الأدمن </Link>`. src/proxy.ts ROUTE_ACCESS declares `{ prefix: "/dashboard/admin", allowedTypes: ["admin"] }`, so a `profiles.user_type = 'corporate'` session is bounced at the edge; UserTypeGuard in the admin layout refuses it again in the browser. The control is rendered unconditionally — there is no role check around it — so a company sees a button offering to edit the (fictional) profile shown beside it and can never open it.
```

> **المراجع:** Verified: BusinessProfileReadinessPanel.tsx:73-79 renders <Link href="/dashboard/admin/business"> ... «إدارة من الأدمن» unconditionally, with no role check in the component. src/proxy.ts ROUTE_ACCESS contains `{ prefix: "/dashboard/admin", allowedTypes: ["admin"] }` (line ~35), so a profiles.user_type='corporate' session is refused at the edge. Dead control for the corporate audience that sees it. Low is correct — nothing is misrepresented, the click simply cannot succeed.

### 10. /dashboard/business/requests: six invented service requests with budgets and assignees, plus a new-request form that never reads its own inputs

- **الملف:** `src/app/dashboard/business/requests/page.tsx:35`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** Not reachable. Not linked from the corporate sidebar (navigation.sidebars.business.ts:49-68) and layout.tsx:103 refuses to render it for any non-admin. Two cards on the visible overview's limited-role views do point here (BusinessSubViews.tsx:390 and :405) but those views themselves never render in production. An admin passes the guard by design (layout.tsx:98-102).

```
requests/page.tsx:35-115 — `const MOCK_REQUESTS: ServiceRequest[] = [ { id: "r1", title: "مراجعة عقد توريد مع مورّد رئيسي", ... budget: "٣,٥٠٠ ر.س", assignee: "محمد الغامدي", ... }, ... { id: "r4", title: "تمثيل في نزاع تجاري أمام المحكمة", budget: "٢٥,٠٠٠ ر.س", assignee: "فهد العتيبي", description: "الترافع في قضية مطالبة مالية بقيمة ٣٠٠,٠٠٠ ريال أمام المحكمة التجارية بالرياض." } ];` driving the KPI strip (lines 234-239) and the list. Worse, NewRequestModal collects nothing: its select/input/textarea at lines 171-200 have no `value` and no `onChange` at all, and the submit is requests/page.tsx:202 — `onClick={() => setDone(true)}` — which jumps straight to line 158-159 `تم إرسال الطلب` / `س
```

> **المراجع:** Both halves verified. MOCK_REQUESTS begins at requests/page.tsx:35 with the quoted budgets/assignees. The modal is genuinely input-less: the select at ~171, the two inputs and the textarea at ~180-200 carry className and placeholder only — no value, no onChange, no ref — and the submit is `onClick={() => setDone(true)}` at 202, jumping to «تم إرسال الطلب» / «سيتواصل معك فريق نظامي خلال ٢٤ ساعة.» at 158-159. Reachability correctly reported as FALSE: /dashboard/business/requests is not in CORPORATE_SIDEBAR, so isVisibleBusinessRoute() is false and layout.tsx renders SectionNotReady for every non-admin. Low is right, and the auditor's note that it becomes blocking if the link is ever restored i

### 11. /dashboard/business/consultations: six invented consultations with named lawyers, star ratings and a summed fee total

- **الملف:** `src/app/dashboard/business/consultations/page.tsx:31`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** Not reachable. Not in CORPORATE_SIDEBAR; layout.tsx:103 renders SectionNotReady for any non-admin corporate user.

```
consultations/page.tsx:31-38 — `const MOCK: Consultation[] = [ { id: 'c-1', lawyerName: 'أ. سارة المنصور', topic: 'مراجعة عقد تأسيس الشركة', status: 'completed', date: '١٤٤٦/١٠/٠٥', duration: 45, rating: 5, fee: 750, summary: 'تمت مراجعة العقد وتحديد البنود الإشكالية.' }, ... ];` — real-looking Hijri dates, per-lawyer 5-star ratings rendered at lines 208-214, and a money KPI computed off them at line 55: `{ label: 'إجمالي الأتعاب', value: \`${MOCK.filter(c=>c.status==='completed').reduce((s,c)=>s+c.fee,0).toLocaleString('ar-SA')} ر.س\` }` — an invented total spend. The page header calls it «سجل استشارات الشركة» (line 87), i.e. this company's record. BLOCKED IN PRODUCTION by layout.tsx:103.
```

> **المراجع:** MOCK at consultations/page.tsx:31-38 verified verbatim, including the Hijri dates, per-lawyer ratings and fees. The money KPI at line 55 is confirmed: «إجمالي الأتعاب» computed as MOCK.filter(completed).reduce((s,c)=>s+c.fee,0) — an invented total spend derived from invented rows. Correctly reported unreachable: not in CORPORATE_SIDEBAR, blocked by the layout guard for non-admins. Low.

### 12. /dashboard/business/team: invented staff roster with real-format emails and phone numbers, and an invite button that sends nothing

- **الملف:** `src/app/dashboard/business/team/page.tsx:72`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** Not reachable. Not in CORPORATE_SIDEBAR; layout.tsx:103 renders SectionNotReady. Only the HR-manager overview links here (BusinessSubViews.tsx:280) and that view never renders in production.

```
team/page.tsx:72-80 — `const MEMBERS: TeamMember[] = [ { id: "1", nameAr: "نورة الزهراني", role: "legal_manager", dept: "الشؤون القانونية", status: "active", cases: 7, completedCases: 39, joinDate: "يناير ٢٠٢٤", email: "n.zahrani@example.sa", phone: "+966 50 847 1928", ... verified: true, hasLawyerPowers: true }, ... ];` plus `INITIAL_INVITES` at line 100. The invite modal is a dead control: team/page.tsx:182 — `onClick={() => { if (email && role) setSent(true); }}` — the collected name/email/role are never POSTed anywhere, the button only flips a local flag to show a success screen. Removing a pending invite is likewise local only (line 474, `setPendingInvites(p => p.filter(...))`). BLOCKED
```

> **المراجع:** MEMBERS at team/page.tsx:72-80 verified verbatim including n.zahrani@example.sa and +966 50 847 1928. The invite control is confirmed dead: team/page.tsx:182 is `onClick={() => { if (email && role) setSent(true); }}` — the collected values gate a local boolean and are never POSTed. Correctly unreachable (not in CORPORATE_SIDEBAR; layout guard). Low. Corroborated by the sidebar's own removal note at navigation.sidebars.business.ts, which cites this file and its fake invite link by name.

### 13. /dashboard/business/team/[id]: any member id renders a fabricated staff profile with an invented caseload, falling back to member "1"

- **الملف:** `src/app/dashboard/business/team/[id]/page.tsx:175`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** Not reachable. /dashboard/business/team is not a visible route, so neither is its child; layout.tsx:103 refuses both.

```
team/[id]/page.tsx:175 — `const member = MEMBERS_BY_ID[memberId] ?? MEMBERS_BY_ID["1"];` — an unknown id silently renders someone else's profile rather than a not-found. The data is literal: `MEMBERS_BY_ID` (line 73), `CASES_BY_MEMBER` (line 116) and `ACTIVITY` (line 132), presented as this employee's assigned cases and activity feed, with a mailto: on the invented address at line 271. BLOCKED IN PRODUCTION by layout.tsx:103.
```

> **المراجع:** Verified at team/[id]/page.tsx:175: `const member = MEMBERS_BY_ID[memberId] ?? MEMBERS_BY_ID["1"];` — an unknown id silently renders a different person rather than a not-found. MEMBERS_BY_ID / CASES_BY_MEMBER / ACTIVITY are literal maps. Correctly unreachable: the parent /dashboard/business/team is not a visible route, and isVisibleBusinessRoute() prefix-matches only the two allowed routes, so the child is refused too. Low.

### 14. /dashboard/business/departments: invented departments with per-department monthly request counts and costs, and an «add department» form that saves nothing

- **الملف:** `src/app/dashboard/business/departments/page.tsx:43`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** Not reachable. Not in CORPORATE_SIDEBAR; layout.tsx:103 renders SectionNotReady for non-admins.

```
departments/page.tsx:43-52 — `const MOCK_DEPTS: Department[] = [ { id: "hr", nameAr: "الموارد البشرية", rep: "سلمى الأحمدي", repEmail: "salma@company.com", requestsMonth: 8, costMonth: 14250, services: ["استشارات", "توثيق"] ... } ]` — and the page aggregates that invented money into headline figures at lines 249-250: `const totalRequests = MOCK_DEPTS.reduce((s, d) => s + d.requestsMonth, 0); const totalCost = MOCK_DEPTS.reduce((s, d) => s + d.costMonth, 0);`. The add-department modal is a dead control: departments/page.tsx:114-118 — `const handleSubmit = () => { if (!name.trim()) return; setDone(true); setTimeout(() => { onClose(); setName(""); setRep(""); setDone(false); }, 1800); };` — the
```

> **المراجع:** MOCK_DEPTS at departments/page.tsx:43-52 verified including rep «سلمى الأحمدي», repEmail salma@company.com, requestsMonth 8, costMonth 14250. The dead control is confirmed at 114-118: `const handleSubmit = () => { if (!name.trim()) return; setDone(true); setTimeout(() => { onClose(); setName(""); setRep(""); setDone(false); }, 1800); };` — the typed name and rep are discarded after a success animation, with no fetch or store. Correctly unreachable via the layout guard. Low.

### 15. /dashboard/business/departments/[id]: fabricated department detail — members and consultations keyed off literal maps

- **الملف:** `src/app/dashboard/business/departments/[id]/page.tsx:67`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** Not reachable. Child of a hidden route; layout.tsx:103 refuses it for non-admins.

```
departments/[id]/page.tsx:67 `const DEPTS: Record<string, Department> = {`, :102 `const MEMBERS_BY_DEPT: Record<string, DeptMember[]> = {`, :120 `const CONSULTS_BY_DEPT: Record<string, Consultation[]> = {` — three hardcoded maps rendered as the department's staff and its consultation history, with a mailto: to the invented representative at line 250 and a «/book/consultation» CTA at line 355. BLOCKED IN PRODUCTION by layout.tsx:103.
```

> **المراجع:** Verified: departments/[id]/page.tsx:67 `const DEPTS: Record<string, Department> = {`, :102 MEMBERS_BY_DEPT, :120 CONSULTS_BY_DEPT — three hardcoded maps rendered as the department's staff and consultation history (CON-441 / CON-462 with named lawyers and costs), plus the mailto: to the invented rep at ~250. Correctly unreachable as a child of a hidden route. Low.

### 16. HR and Finance role dashboards carry invented headcount and riyal figures — unreachable only because business_role is never written

- **الملف:** `src/components/dashboard/business/BusinessSubViews.tsx:332`
- **النوع:** بيانات مخترعة
- **السطح:** لوحة الشركة الأساسية
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** Not reachable today. Would become reachable on /dashboard/business the moment anything writes user_metadata.business_role for a corporate account.

```
BusinessSubViews.tsx:332-335 — `{ label: "إجمالي الأتعاب القانونية", value: "٢١٧,٥٠٠ ﷼" }, { label: "مبالغ تحصيل معلقة", value: "٨٣,٢٠٠ ﷼" }, { label: "ميزانية القسم", value: "٤٠٠,٠٠٠ ﷼" }, { label: "الاستخدام الشهري", value: "٥٤٪" }` and BusinessSubViews.tsx:255-258 — `{ label: "موظفون نشطون", value: "١٤٧" }, { label: "عقود قاربت الانتهاء", value: "٣" }, { label: "طلبات إجازة معلقة", value: "٨" }, { label: "نسبة التوطين", value: "٧٢٪" }`. Money and workforce figures with no data source. Recorded as LOW rather than high purely because of the reachability proof: these render only when `isLimitedRole` is true (page.tsx:110, :142), which requires `businessRole` ∈ {department_head, legal_staff, 
```

> **المراجع:** Data verified at BusinessSubViews.tsx:332-335 (٢١٧,٥٠٠ ﷼ / ٨٣,٢٠٠ ﷼ / ٤٠٠,٠٠٠ ﷼ / ٥٤٪) and 255-258 (١٤٧ / ٣ / ٨ / ٧٢٪), all literals with no data source. The reachability proof is the strongest part of this finding and it holds exactly as stated: a repo-wide grep for `business_role` across src/ returns exactly ONE occurrence, the read at useUser.ts:632, and zero writes — so businessRole is always undefined and `?? "owner"` (page.tsx:104) wins, making isLimitedRole (page.tsx:110) always false. The QA switcher that would write it is wrapped in canShowQaRoleSwitcher = process.env.NODE_ENV !== "production" (page.tsx:112), inlined false and eliminated from the prod build, and useUser's initDemo()

### 17. «إرسال مستند للمراجعة»: the file is never uploaded, the WhatsApp/escalation promises are unimplemented, and the review link and passcode are hardcoded literals

- **الملف:** `src/app/dashboard/business/reviews/new/page.tsx:185`
- **النوع:** مُدخلات تُرمى
- **السطح:** العمليات القانونية للشركة
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** Not reachable in production: /dashboard/business/reviews/new is outside VISIBLE_BUSINESS_ROUTES, so layout.tsx:106 renders «هذا القسم قيد الإعداد» for every corporate account; only a platform admin renders the page, which the layout documents as deliberate. LOW strictly on that basis — the content is blocking-grade (a company would believe a contract was distributed for approval and escalates to the CEO, when the file was never read and the record never left the browser) and becomes blocking the moment a sidebar link is restored, since VISIBLE_BUSINESS_ROUTES is derived from CORPORATE_SIDEBAR. Note the live entry points that already aim here: floatingServices.tsx:373, :383, :392, :401, :433 and BusinessSubViews.tsx:398.

```
reviews/new/page.tsx:185-190 — `<div onClick={() => setFileUploaded(true)} className={`border-2 border-dashed ...`}>` under the label «الملف» and the prompt «اسحب الملف هنا أو اضغط للاختيار (PDF, DOCX)». There is no <input type="file"> anywhere in the 389-line file; clicking flips a boolean and :194 renders a fabricated filename `{docTitle || "عقد_توريد_شركة_الأفق"}.pdf` with a green check. On submit, handleSendReview (:69-96) calls `saveWorkflowRequest`, which is `createWorkflowRequestLocal` (src/lib/workflowStore.ts:93-97 → src/lib/clientWorkflowRepository.ts:124-127 `window.localStorage.setItem(STORAGE_KEY, ...)`) — the browser-only sibling of the backend-aware `createWorkflowRequest` at 
```

> **المراجع:** Every technical claim checks out and the auditor's own downgrade is correct. `grep -n 'type="file"'` on the 389-line page returns nothing; the dropzone is `<div onClick={() => setFileUploaded(true)} ...>` at :186 and the confirmed state prints the fabricated `{docTitle || "عقد_توريد_شركة_الأفق"}.pdf` at :194. handleSendReview (:69-96) calls `saveWorkflowRequest`, which is `return createWorkflowRequestLocal(input);` (workflowStore.ts:93-97) ending at `window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));` (clientWorkflowRepository.ts:125) — the backend-aware `createWorkflowRequest` at :329-341, which POSTs to /api/v1/service-requests, is never called from here. The success screen's 

### 18. Company seat meter is a hardcoded 12/25 shown to every corporate account

- **الملف:** `src/constants/settingsReadiness.ts:270`
- **النوع:** بيانات مخترعة
- **السطح:** مالية الشركة والاشتراكات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Corporate login → «الإعدادات» → «صلاحياتي» tab. "role-scope" is in the corporate visibleTabs list unconditionally (settingsReadiness.ts:262), so every corporate role sees it, not just billing managers.

```
      seatPolicy: { label: "مقاعد الشركة", used: 12, included: 25, unit: "مستخدم", overLimitMessage: "وصلت الشركة إلى حد المقاعد؛ اطلب مقاعد إضافية من المالك أو مدير الفوترة." },

Rendered as the company's actual seat consumption in RoleScopeTab.tsx:71-84 under the heading «المقاعد/الحدود», with a filled progress bar computed from those two constants (line 80). TeamManagementTab.tsx:102-103 then uses the same 12 as the base for `usedSeats` and to decide `seatsFull`, so an invented number can block a real invite.
```

> **المراجع:** Primary claim confirmed: settingsReadiness.ts:270 hardcodes `used: 12, included: 25`, rendered in RoleScopeTab.tsx:68-84 under «المقاعد/الحدود» with the bar width computed from those constants at :80, and "role-scope" is unconditional in the corporate visibleTabs (:265), so every corporate role sees it with no disclaimer (BackendReadyNotice at RoleScopeTab:40 is null in prod). BUT the aggravating claim is FALSE and I checked it: no real invite exists to be blocked. TeamManagementTab.handleInvite (:115-148) only pushes into local `pendingInvites` state and reports «تم إنشاء دعوة محلية ... الرابط وهمي وجاهز للربط بالبريد/الجوال لاحقاً» (:146), and the ungated <p> at :163-165 tells the user «كل

### 19. Invoice identity fields are pre-filled with another firm's details and the save button discards them

- **الملف:** `src/app/settings/components/tabs/InvoiceTab.tsx:54`
- **النوع:** مُدخلات تُرمى
- **السطح:** مالية الشركة والاشتراكات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Corporate login → «الإعدادات» → «الفواتير» tab (settingsReadiness.ts:263, canManageBilling).

```
                placeholder={f.placeholder}
                defaultValue={f.placeholder}

defaultValue (not just placeholder) means the inputs open already containing the sample values from lines 43-47: «اسم الكيان على الفاتورة» = "مكتب نظامي للمحاماة والاستشارات القانونية" — a law firm, on a corporate company's invoice settings — plus a VAT number and «invoices@nezamy.sa». The save handler never leaves the browser:
  const handleSave = () => {
    setSaved(true);
    setLocalMessage("تم حفظ إعدادات الفواتير محلياً فقط؛ إصدار فواتير حقيقي ينتظر Billing API.");   (lines 11-13)
Grep for fetch/supabase/api in this file returns nothing. The button first reads «تم الحفظ» (line 68); the qualifying
```

> **المراجع:** Confirmed: InvoiceTab.tsx:53-54 really is `placeholder={f.placeholder}` followed by `defaultValue={f.placeholder}`, so the five inputs (:42-47) open containing «مكتب نظامي للمحاماة والاستشارات القانونية», a VAT mask and invoices@nezamy.sa on a corporate company's own invoice screen. handleSave (:11-15) only sets state; no fetch/supabase/api in the file. Reachable for every corporate account (same unset-business_role → owner path as finding 2). Severity corrected medium→low, and matched to finding 7 since it is the identical pattern: LocalActionStatus (:70) is NOT gated by IS_PRODUCTION, so on click the user is told «تم حفظ إعدادات الفواتير محلياً فقط؛ إصدار فواتير حقيقي ينتظر Billing API» — 

### 20. Company registration data (CR, VAT, GOSI, 187 employees, named legal representative) is pre-filled and the save is a setTimeout

- **الملف:** `src/app/settings/components/tabs/EntitySettingsTab.tsx:164`
- **النوع:** مُدخلات تُرمى
- **السطح:** مالية الشركة والاشتراكات
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** Corporate login → «الإعدادات» → «إعدادات الكيان» tab; shown when canManageEntity is true — settingsReadiness.ts:104 is `["owner","legal_manager","hr_manager"].includes(role ?? "owner")`, so an unset businessRole also qualifies.

```
                  placeholder={field.placeholder}
                  defaultValue={field.placeholder}

The corporate field set (lines 42-57) therefore opens already reading «اسم الشركة» = "شركة البناء المتقدمة المحدودة", «نوع النشاط التجاري» = "مقاولات وبناء", «عدد الموظفين» = "187", «المدينة» = "جدة", «اسم الممثل النظامي» = "عبدالعزيز محمد القرني". These are the fields that would feed a VAT invoice. The save is theatre:
    setSaving(true);
    setTimeout(() => { setSaving(false); setSaved(true); setLocalMessage("تم حفظ بيانات الكيان محلياً فقط؛ ..."); }, 1200);   (lines 113-119)
A 1200 ms spinner then «تم الحفظ»; no fetch/supabase call exists in the file.
```

> **المراجع:** Confirmed: EntitySettingsTab.tsx:163-164 is `placeholder={field.placeholder}` + `defaultValue={field.placeholder}`, so the corporate field set (:43-58) opens reading «شركة البناء المتقدمة المحدودة», «مقاولات وبناء», «187», «جدة», «عبدالعزيز محمد القرني». handleSave (:110-118) is exactly the quoted setTimeout(…, 1200) with no network call. Reachable — isCorporateEntityManager(undefined) → `["owner","legal_manager","hr_manager"].includes("owner")` → true, and business_role is never written. Severity corrected medium→low for the same reason as finding 6 and held equal to it: LocalActionStatus at :174 survives production and states «تم حفظ بيانات الكيان محلياً فقط؛ الاعتماد والتحديث الرسمي ينتظر

### 21. Corporate wallet page invents a plan, a usage log with named employees, and two PAID 1,999 SAR invoices — but the layout blocks it

- **الملف:** `src/app/dashboard/business/wallet/page.tsx:28`
- **النوع:** بيانات مخترعة
- **السطح:** مالية الشركة والاشتراكات
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** No corporate path exists. Typing the URL, or following the «ترقية الباقة» link on the dashboard (page.tsx:439), hits SectionNotReady. Only userType "admin" renders it, deliberately (layout.tsx:98-100).

```
const BILLING_HISTORY = [
  { id: "inv-101", desc: "تجديد اشتراك نظامي برو", amount: 1999, date: "2026-04-01", status: "paid" },
  { id: "inv-100", desc: "تجديد اشتراك نظامي برو", amount: 1999, date: "2026-03-01", status: "paid" },
];

Also WALLET_DATA (line 12, plan «باقة نظامي برو (الشركات)», 35/50 used) and USAGE_HISTORY (line 21, four actions attributed to named staff «أحمد المنسي», «سارة محمد»). Five controls are dead: «ترقية الباقة» (68), «إدارة البطاقات» (140), «عرض الكل» (158), the per-invoice download icon (218), «إدارة طرق الدفع» (225) — none carries an onClick.

NOT REACHABLE: src/app/dashboard/business/layout.tsx:103 — `const sectionHidden = userType !== "admin" && !isVisibleBusi
```

> **المراجع:** Content and the guard both verified, and the finding's own reachable:false / low rating is correct — it is not refuted by the unreachability criterion because it never claimed otherwise. WALLET_DATA (:12-19), USAGE_HISTORY (:21-26 with «أحمد المنسي», «سارة محمد») and BILLING_HISTORY (:28-31, two paid 1999 rows) are hardcoded. A grep for `onClick|href` across the whole file returns ZERO matches, so the five named controls are dead exactly as claimed. The guard holds: VISIBLE_BUSINESS_ROUTES is derived from CORPORATE_SIDEBAR (navigation.sidebars.business.ts:294-297), which lists only /dashboard/business and /dashboard/business/documents; isVisibleBusinessRoute strips the query and refuses /das

### 22. Corporate reports page invents 117,400 SAR of fees for a named company — same guard blocks it

- **الملف:** `src/app/dashboard/business/reports/page.tsx:49`
- **النوع:** بيانات مخترعة
- **السطح:** مالية الشركة والاشتراكات
- **يوصلها مستخدم حقيقي:** لا
- **الطريق:** No corporate path exists; the sidebar entry was removed and the layout guard refuses to render the page for non-admins.

```
const MONTHLY_TREND = [
  { month: "أكتوبر", cases: 7, fees: 28400 },
  ... { month: "مارس", cases: 16, fees: 63400 },
];

Plus a KPI «إجمالي الأتعاب / ١١٧,٤٠٠ / ريال سعودي» with a +18% trend (line 114), per-department fee totals (DEPT_REPORTS, line 14), and a subtitle naming a specific company that is not the viewer's: «مارس ٢٠٢٦ — الزهراني للمقاولات» (line 98).

NOT REACHABLE: blocked by the same layout.tsx:103 guard as the wallet page — /dashboard/business/reports is absent from VISIBLE_BUSINESS_ROUTES, so SectionNotReady renders for every non-admin.
```

> **المراجع:** Verified: DEPT_REPORTS (:14-45), MONTHLY_TREND (:47-54), the «إجمالي الأتعاب / ١١٧,٤٠٠ / ريال سعودي» KPI with +18 trend (:114) and the subtitle «مارس ٢٠٢٦ — الزهراني للمقاولات» (:98) naming a company that is not the viewer's. Blocked by the same derived guard as the wallet page — /dashboard/business/reports is absent from VISIBLE_BUSINESS_ROUTES, so layout.tsx:103/129 renders SectionNotReady for every non-admin, and the sidebar entry was removed (documented at navigation.sidebars.business.ts:24). Auditor's reachable:false and low severity are both correct; kept as a low finding because the file is still in the tree and one re-added sidebar link would re-open it.

### 23. After a failed upload the success screen tells the client to attach the files «من صفحة الطلب» — no attach control exists on that page

- **الملف:** `src/components/consultation/steps/StepConfirm.tsx:128`
- **النوع:** وعد لا يُنفَّذ
- **السطح:** التسجيل ومسار الاستقبال المشترك
- **يوصلها مستخدم حقيقي:** نعم
- **الطريق:** /book/consultation -> attach a file on step 2 -> submit on step 4 while the upload fails (dead link, storage error, or a 60 s timeout in documentService). `attachFailures`/`skippedNames` become non-empty (useConsultationForm.ts:244-253) and StepConfirm.tsx:110 renders the amber panel.

```
StepConfirm.tsx:126-130, the partial-success branch: `{isAr ? "الطلب نفسه وصل. أرسل الملفات للفريق عند تواصله معك، أو أرفقها من صفحة الطلب." : "The request itself arrived. Send the files when the team contacts you, or attach them from the request page."}`. The request page is /ai/orders/[id]. Its three client-facing panels are OrderSummary (read-only record of what was submitted — src/app/ai/orders/[id]/page.tsx:271), OrderEditPanel and OrderActions (page.tsx:293-296). OrderEditPanel has exactly one input — grep for `<input|<textarea` in src/app/ai/orders/[id]/_components/OrderEditPanel.tsx returns only `94: <textarea`, and it PATCHes `description` (line 54-55, `fetch(`/api/v1/service-reques
```

> **المراجع:** CONFIRMED, and I widened the search past the auditor's to try to refute it. The copy is verbatim at StepConfirm.tsx:126-130 inside the `attachmentsIncomplete` branch. /ai/orders/[id] has no upload control: `grep -rn 'type="file"|<input|<textarea|Dropzone|useOrderAttachments' src/app/ai/orders/` returns only three textareas (OrderEditPanel:94, RevisionPanel:317 and :381) and one comment reference. I read the page's panel list (page.tsx:264-296): RevisionPanel, OrderSummary, then a footer row with a back link, a WhatsApp support link, OrderEditPanel and OrderActions. OrderSummary's attachment section is download-only (`downloadAttachment`, line 149).  The refutation I tested and rejected: I gr


---

## ملاحظات سقطت في المراجعة (7)

اترفعت ثم **اتكذّبت** — مش مشاكل:

- Recent-messages card crashes the dashboard: reads msg.from/msg/time/unread, chat_messages has sender_id/body/created_at
  - _The schema mismatch is real (chat_messages at 20260603_phase1_004_community_features.sql:349-364 has sender_id/body/created_at, no `from`), but the stated trigger — «any client who is a member of a chat room» — cannot occur. A chat room can only be created by POST /api/v1/chat/rooms, which rejects the body unless `room_type` is present (chat/rooms/route.ts:85-90). The one and only caller, chatServ_
- «موعدك القادم» card renders blank and its call-your-lawyer button dials tel:undefined
  - _The field mismatch is real (public.consultations, 20260518 migration lines 51-63, has none of the seven cast fields), but the finding's load-bearing reachability sentence is factually wrong. /dashboard/client/consultation/new does NOT call POST /api/v1/consultations: at consultation/new/page.tsx:229-231 it calls createWorkflowRequest({ type: "consultation" }), which posts to /api/v1/service-reques_
- Community preview stamps a verified-lawyer seal on every post and shows blank vote/answer counts
  - _no verdict returned — dropped_
- Hardcoded unread-message badge on the messages card
  - _The literal is really there and really is mojibake (page.tsx:478-480, «ظ،» inside `w-4 h-4 rounded-full bg-red-500`), but it sits inside the same `RECENT_MESSAGES.length > 0` block as finding 6 (page.tsx:472). As established there, no chat_participants row can exist for any user because chatService.createChatRoom posts `type` while chat/rooms/route.ts:85 requires `room_type`, so summary/route.ts:6_
- Dashboard greets an unnamed client with an invented first name
  - _The fallback literal exists (page.tsx:144, `user.name?.split(" ")[0] || "خالد"`), but the stated trigger — «any account whose profile name is not yet set» — is refuted by useUser.ts:620: `name: meta.display_name ?? meta.full_name ?? user.email ?? ""`. A signed-in Supabase user always has an email, so user.name is never empty and the name is never the fallback for a real account; GUEST_SESSION's em_
- A gold verification seal is rendered beside the placeholder text «بانتظار تأكيد المحامي»
  - _REFUTED on the semantic claim. The icon renders where the auditor says (consultation/page.tsx:263, [id]/page.tsx:861), but nothing establishes that `SealCheck` is 'the platform's verified-lawyer badge'. I grepped all ~60 uses: it is a general-purpose seal glyph — a copy-success checkmark (firm/contracts/[id]/page.tsx:336, 421), a section heading icon («المسؤوليات», firm/team/[id]/page.tsx:202), th_
- Featured «محلل الصفقات والفرص» card promises a 360° due-diligence study; the destination is a setTimeout progress bar over a canned report
  - _REFUTED on its load-bearing evidence. The auditor missed the beta gate. deal-intel/page.tsx wraps the ENTIRE report body in <BetaReviewGate toolId="corp.deal-intel" toolName="تقرير تحليل الصفقة" reviewScope="legal-data"> opened at line 288 and closed at 523 — every MOCK_REPORT consumer is inside it, including the AiResultActions at 328-329 that calls formatDealIntelReport. In BetaReviewGate.tsx, i_