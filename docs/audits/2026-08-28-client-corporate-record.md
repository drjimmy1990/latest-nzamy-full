# سجل حسابَي العميل والشركة — ٢٨ أغسطس ٢٠٢٦

> الدليل، لا الملخّص. التدقيق الأصلي في
> [`2026-08-27-client-corporate-audit.md`](2026-08-27-client-corporate-audit.md).

**النطاق:** الـ٦٩ ملاحظة الباقية بعد إصلاح الحرجة الثماني — ٢٨ مرتفعة، ١٨ متوسطة،
٢٣ منخفضة، على ٤٦ مساراً (٢٢ للعميل، ٢٤ للشركة).

## النتيجة

| | العدد |
|---|:-:|
| أُعيد التحقّق منها | ٦٩ |
| **كانت مغلقة أصلاً** | **٥٦** |
| أُعلن إغلاقها ثم أعادها وكيل مهاجم | **١** |
| كانت حيّة | ٤ |
| **أُصلحت في هذه الجولة** | **٣** |
| تنتظر قرار المالك (كلها خلف الحارس) | ٨ |
| تنتظر تنفيذ المايجريشن، لا كوداً | ٢ |

**والـ٢٨ المرتفعة كلها مغلقة — ٢٨ من ٢٨.**

أغلقها التزامان لاحقان للتدقيق:

```
84ce53d  feat(client,corporate): a company can order, and forty things stop pretending
5ed05e3  fix(reads): "could not read" can no longer render as "you have none"   (٧١ ملف)
```

> **أرقام السطور في التدقيق الأصلي بايظة** — الالتزامان عدّلا هذه الملفات بعد كتابته.
> الوصف هو المرجع، لا الرقم.

## الملاحظة الوحيدة التي أعادها التكذيب

`high-14` — **برنامج الإحالة.** الصفحة `/dashboard/client/referral` أُصلحت فعلاً
(صارت `DashboardComingSoon`)، **لكن نفس الوعد ظلّ يُعرض في «الإعدادات ← دعوة
الأصدقاء»** — ملف لم يفتحه التنظيف. وكان هناك **أسوأ** مما وصفه التدقيق:

```
دعوات أُرسلت 12   ·   تسجيلات مكتملة 7   ·   رصيد مكتسب 350 ر.س
```

ثوابت على مستوى الوحدة، **متطابقة لكل الحسابات الثمانية عشر**، تحت عنوان حيّ
«إحصائيات الإحالات». ليست وعداً بميزة — بل **ثلاث جُمل عن حساب القارئ نفسه وعن
فلوسه**.

> **الدرس:** إصلاح صفحةٍ لا يُغلق ملاحظةً حتى يُبحَث عن **موضع العرض الثاني**.

---

## الحكم على كل ملاحظة

| # | الخطورة | الحكم | صمد أمام التكذيب؟ | الموضع | الوصول |
|---|---|---|:-:|---|---|
| **لوحة الشركة الأساسية** | | | | | |
| high-16 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/page.tsx` | حيّة |
| high-17 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/page.tsx` | حيّة |
| high-18 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/page.tsx` | حيّة |
| high-19 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/page.tsx` | حيّة |
| high-20 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/page.tsx` | حيّة |
| high-21 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/page.tsx` | حيّة |
| med-12 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/page.tsx` | حيّة |
| low-7 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/components/dashboard/business/BusinessProfileReadinessPanel.tsx` | حيّة |
| low-8 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/page.tsx` | حيّة |
| low-9 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/components/dashboard/business/BusinessProfileReadinessPanel.tsx` | حيّة |
| low-10 | منخفض | ⏸ قرار مالك | — | `src/app/dashboard/business/requests/page.tsx` | خلف الحارس |
| low-11 | منخفض | ⏸ قرار مالك | — | `src/app/dashboard/business/consultations/page.tsx` | خلف الحارس |
| low-12 | منخفض | ⏸ قرار مالك | — | `src/app/dashboard/business/team/page.tsx` | خلف الحارس |
| low-13 | منخفض | ⏸ قرار مالك | — | `src/app/dashboard/business/team/[id]/page.tsx` | خلف الحارس |
| low-14 | منخفض | ⏸ قرار مالك | — | `src/app/dashboard/business/departments/page.tsx` | خلف الحارس |
| low-15 | منخفض | ⏸ قرار مالك | — | `src/app/dashboard/business/departments/[id]/page.tsx` | خلف الحارس |
| low-16 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/components/dashboard/business/BusinessSubViews.tsx` | غير مركّبة |
| **طلبات العميل والاستشارات والخطابات** | | | | | |
| high-4 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/_components/ClientLetterWorkflow.tsx` | حيّة |
| high-5 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/_components/ClientLetterWorkflow.tsx` | حيّة |
| high-6 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/_components/ClientLetterWorkflow.tsx` | حيّة |
| high-7 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/consultation/page.tsx` | حيّة |
| high-8 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/components/dashboard/SessionChatPane.tsx` | حيّة |
| high-9 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/components/dashboard/SessionChatPane.tsx` | حيّة |
| high-10 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/consultation/[id]/page.tsx` | حيّة |
| high-11 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/consultation/new/page.tsx` | حيّة |
| high-12 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/consultation/[id]/page.tsx` | حيّة |
| med-3 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/consultation/new/page.tsx` | حيّة |
| med-4 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/consultation/[id]/page.tsx` | حيّة |
| med-5 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/consultation/[id]/page.tsx` | حيّة |
| med-6 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/consultation/[id]/page.tsx` | حيّة |
| low-1 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/consultation/[id]/page.tsx` | حيّة |
| low-2 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/contracts/page.tsx` | حيّة |
| **محفظة العميل والإحالات والبحث عن محامٍ** | | | | | |
| high-13 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/lib/services/lawyerService.ts` | حيّة |
| high-14 | مرتفع | 🔧 كانت حيّة | **لا** | `src/app/dashboard/client/referral/page.tsx` | حيّة |
| high-15 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/wallet/page.tsx` | حيّة |
| med-7 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/my-group/page.tsx` | حيّة |
| med-8 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/messages/page.tsx` | حيّة |
| med-9 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/find-lawyer/page.tsx` | حيّة |
| med-10 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/constants/navigation.sidebars.primary.ts` | حيّة |
| med-11 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/messages/page.tsx` | حيّة |
| low-3 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/find-lawyer/page.tsx` | حيّة |
| low-4 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/documents/page.tsx` | حيّة |
| low-5 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/my-group/page.tsx` | حيّة |
| low-6 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/my-group/page.tsx` | حيّة |
| **مالية الشركة والاشتراكات** | | | | | |
| high-26 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/settings/components/tabs/_shared.tsx` | حيّة |
| high-27 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/settings/components/tabs/SubscriptionTab.tsx` | حيّة |
| high-28 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/page.tsx` | حيّة |
| low-18 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/constants/settingsReadiness.ts` | حيّة |
| low-19 | منخفض | 🔧 كانت حيّة | — | `src/app/settings/components/tabs/InvoiceTab.tsx` | حيّة |
| low-20 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/app/settings/components/tabs/EntitySettingsTab.tsx` | حيّة |
| low-21 | منخفض | ⏸ قرار مالك | — | `src/app/dashboard/business/wallet/page.tsx` | خلف الحارس |
| low-22 | منخفض | ⏸ قرار مالك | — | `src/app/dashboard/business/reports/page.tsx` | خلف الحارس |
| **التسجيل ومسار الاستقبال المشترك** | | | | | |
| med-13 | متوسط | 🔧 كانت حيّة | — | `src/app/register/client/page.tsx` | حيّة |
| med-14 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/register/client/page.tsx` | حيّة |
| med-15 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/register/client/page.tsx` | حيّة |
| med-16 | متوسط | 🔧 كانت حيّة | — | `supabase/migrations/20260827_signup_contact_fields.sql` | حيّة |
| med-17 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/register/client/page.tsx` | حيّة |
| med-18 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/components/consultation/constants.ts` | حيّة |
| low-23 | منخفض | ✅ أُغلقت سابقاً | نعم | `src/components/consultation/steps/StepConfirm.tsx` | حيّة |
| **لوحة العميل الرئيسية والقضايا** | | | | | |
| high-1 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/page.tsx` | حيّة |
| high-2 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/page.tsx` | حيّة |
| high-3 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/_components/CaseCard.tsx` | حيّة |
| med-1 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/cases/page.tsx` | حيّة |
| med-2 | متوسط | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/client/cases/updates/page.tsx` | حيّة |
| **العمليات القانونية للشركة** | | | | | |
| high-22 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/kanban/CaseGraphView.tsx` | حيّة |
| high-23 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/kanban/_use-case-graph-state.ts` | حيّة |
| high-24 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/dashboard/business/kanban/CaseGraphView.tsx` | حيّة |
| high-25 | مرتفع | ✅ أُغلقت سابقاً | نعم | `src/app/services/corporate/health-check/page.tsx` | حيّة |
| low-17 | منخفض | 🔧 كانت حيّة | — | `src/app/dashboard/business/reviews/new/page.tsx` | خلف الحارس |

---

## ما أُصلح

| البند | النتيجة | ماذا تغيّر |
|---|---|---|
| `low-19` | MADE_HONEST | Chose DISABLE-WITH-A-STATED-REASON over "keep the button and say nothing is stored". Removed handleSave (setSaved(true) + the setTimeout that reset it), the «تم الحفظ» success tick, and the localMessage/LocalActionStatus status line — with the useState / motion / CheckCircle / LocalActionStatus imports they were the only users of. The five inputs are uncontrolled (no name/ref/onChange), so nothing typed was ever read: the handler was a pure no-op and «تم … |
| `low-17` | MADE_HONEST | Replaced the whole four-step «إرسال مستند للمراجعة» wizard body with DashboardComingSoon (title «إرسال مستند للمراجعة», backHref /dashboard/business), plus a header comment recording what came off and why. Confirmed unchanged before replacing: the dropzone was `<div onClick={() => setFileUploaded(true)}>` with no `type="file"` anywhere in the file (nothing chosen, read or stored); the confirmed state printed the fabricated `{docTitle \|\| "عقد_توريد_شركة_… |
| `high-14` | MADE_HONEST | OVERTURNED finding confirmed against current source, then closed. /dashboard/client/referral is genuinely DashboardComingSoon, but the identical promise still rendered at /settings -> «دعوة الأصدقاء» for every individual, lawyer and corporate account (settingsReadiness.ts lists "referral" in all three visibleTabs; settings/page.tsx:89 renders it; settings/layout.tsx is a no-op wrapper). I re-verified all three underpinnings myself: `grep -rn 'from("referr… |

كل إصلاح هاجمه وكيل مستقل لم يصنعه. **النتيجة: صفر رفض، صفر ارتداد، تقارُب على
المجموعات الثلاث.**

---

## ما ينتظر قرار المالك — ثمانية، كلها خلف الحارس

`isHiddenBusinessSection` يرسم `SectionNotReady` فوق كل هذه المسارات لكل من ليس
مديراً. **القرار ٦ في الخطة يحسمها دفعة واحدة:** تُحذف فتذهب معها، أو تُبنى فتصير
شغلاً حقيقياً.

| # | المسار | ما فيه اليوم |
|---|---|---|
| low-10 | `src/app/dashboard/business/requests/page.tsx` | Unchanged: :35 `const MOCK_REQUESTS: ServiceRequest[] = [` still drives the KPI strip (:235-238 `MOCK_REQUESTS.filter(r => r.status === "open").length` etc.) and the input-less modal still submits with :202 `onClick={() => setDone(true)}`. Still unreachable: layout.tsx:110 `const sectionHidden = us… |
| low-11 | `src/app/dashboard/business/consultations/page.tsx` | Unchanged: :31 `const MOCK: Consultation[] = [` and the invented money KPI at :55 `{ label: 'إجمالي الأتعاب', value: `${MOCK.filter(c=>c.status==='completed').reduce((s,c)=>s+c.fee,0).toLocaleString('ar-SA')} ر.س` }`. Still hidden by layout.tsx:110 `isHiddenBusinessSection(pathname)` — CORPORATE_SI… |
| low-12 | `src/app/dashboard/business/team/page.tsx` | Unchanged: :72 `const MEMBERS: TeamMember[] = [` with :76 `email: "n.zahrani@example.sa", phone: "+966 50 847 1928",`, and the invite control is still :182 `onClick={() => { if (email && role) setSent(true); }}` — the typed values gate a local boolean and are never POSTed. Still hidden by layout.ts… |
| low-13 | `src/app/dashboard/business/team/[id]/page.tsx` | Unchanged at :175 — `const member = MEMBERS_BY_ID[memberId] ?? MEMBERS_BY_ID["1"];` — an unknown id still silently renders another person's profile instead of a not-found, over the literal MEMBERS_BY_ID / CASES_BY_MEMBER / ACTIVITY maps. Its parent /dashboard/business/team is not in CORPORATE_SIDEB… |
| low-14 | `src/app/dashboard/business/departments/page.tsx` | Unchanged: :43 `const MOCK_DEPTS: Department[] = [` including :51 `costMonth: 14250,`, aggregated into headline figures at :249-250 `const totalRequests = MOCK_DEPTS.reduce((s, d) => s + d.requestsMonth, 0); const totalCost = MOCK_DEPTS.reduce((s, d) => s + d.costMonth, 0);`, and the add-department… |
| low-15 | `src/app/dashboard/business/departments/[id]/page.tsx` | Unchanged: :67 `const DEPTS: Record<string, Department> = {`, :102 `const MEMBERS_BY_DEPT: Record<string, DeptMember[]> = {`, :120 `const CONSULTS_BY_DEPT: Record<string, Consultation[]> = {`, read at :171-172 `const members = MEMBERS_BY_DEPT[deptId] ?? []; const consults = CONSULTS_BY_DEPT[deptId]… |
| low-21 | `src/app/dashboard/business/wallet/page.tsx` | The file is untouched: `const BILLING_HISTORY = [ { id: "inv-101", desc: "تجديد اشتراك نظامي برو", amount: 1999, date: "2026-04-01", status: "paid" }, ...` (:28-31) under a «─── Mock Data ───» header (:11), with WALLET_DATA (:12-19, «باقة نظامي برو (الشركات)», 35/50) and USAGE_HISTORY naming «أحمد … |
| low-22 | `src/app/dashboard/business/reports/page.tsx` | Untouched, and the audit's line numbers still match exactly: `{ label: "إجمالي الأتعاب", value: "١١٧,٤٠٠", sub: "ريال سعودي", ..., trend: +18 }` (:114), the subtitle «مارس ٢٠٢٦ — الزهراني للمقاولات» naming a company that is not the viewer's (:98), DEPT_REPORTS (:14-46) and MONTHLY_TREND (:48-55) al… |

---

## ما سُجِّل ولم يُصلَح

**٤٥ بنداً.**

| المصدر | الملف | الملاحظة |
|---|---|---|
| مراجعة الـ٦٩ · corp-main | `src/app/dashboard/business/layout.tsx` | ?mode=service is NOT inert, contrary to the claim in page.tsx:126-131 ("The parameter is simply inert"). layout.tsx still reads it (ModeHandler, :26-31) and paints a banner at :140-146 reading «وضع طلب الخدمة — لا يوجد قسم قانوني داخلي», and src/app/onboarding/page.tsx:728 still routes corporate accounts with hasLawyer===false to `${base… |
| مراجعة الـ٦٩ · corp-main | `src/hooks/useAdminSettings.ts` | The C-001 fabrication that low-7 was about still lives at :205 `currentCompanyFeatures: features[MOCK_CURRENT_COMPANY_ID] \|\| DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID]` (MOCK_CURRENT_COMPANY_ID = "C-001", useAdminSettingsHelper.ts:487). It no longer reaches the corporate overview, but it still feeds src/hooks/useSubscription.ts:145-157,… |
| مراجعة الـ٦٩ · corp-main | `src/components/dashboard/business/BusinessProfileReadinessPanel.tsx` | Dead prop and a stale rationale: :36-50 keeps the `compact` prop and the misnomer name "because BusinessSubViews.tsx imports this export" and "BusinessSubViews passes it" — that file was deleted. `compact` now has no caller (the overview renders `<BusinessProfileReadinessPanel />` with no props), so the `shown = compact ? fields.slice(0,… |
| مراجعة الـ٦٩ · corp-main | `src/app/dashboard/business/team/page.tsx` | This hidden page is the last consumer of the mock-company hook outside useSubscription: :255 `const { currentCompanyFeatures, mounted, updateCompanyFeatures } = useAdminSettings();` and :337 `updateCompanyFeatures(currentCompanyFeatures.companyId, { hasInternalLegal: next })` — a toggle inside a guarded section that writes C-001's flags,… |
| مراجعة الـ٦٩ · client-requests | `src/components/consultation/ClientConsultationComponents.tsx` | `PlanBadge` (line 41) is now an exported-but-unused component — the only two `PlanBadge` hits left in src/ are comment lines in consultation/new/page.tsx (272, 938) describing its removal. It still carries the literal «مشمولة في باقتك — بدون تكلفة إضافية» (54) and its `included`/`used`/`limit` props, so re-importing it anywhere would rei… |
| مراجعة الـ٦٩ · client-requests | `src/app/dashboard/client/services/page.tsx` | Line 285 still tells clients «خدمات الذكاء الاصطناعي قد تكون مشمولة في باقتك» — a hedged («قد تكون») sibling of the claim med-3 removed from the booking wizard. Not the same defect (it asserts nothing about a specific booking) but it is the last surviving «مشمولة في باقتك» string on a client screen, and it sits above a price list. Outsid… |
| مراجعة الـ٦٩ · client-requests | `src/app/dashboard/client/consultation/page.tsx` | CONSULT_STATUS_BY_REQUEST_STATUS and REQUEST_STATUS_AR are knowingly duplicated between consultation/page.tsx (119-142) and consultation/[id]/page.tsx (154-176); the comment at 112-118 flags the extraction into src/lib as an open follow-up. Both copies are `Record<WorkflowRequestStatus, …>` so a new status is a compile error in both, whi… |
| مراجعة الـ٦٩ · client-requests | `src/app/ai/contract-drafter/page.tsx` | Line 90 still runs `await new Promise((r) => setTimeout(r, 1800));` before `generateContractText(...)` — the same fake-work spinner pattern that was removed from ClientLetterWorkflow as high-6. This is on /ai/contract-drafter, outside my group, and was not among my 15 findings. |
| مراجعة الـ٦٩ · client-wallet | `src/constants/navigation.sidebars.primary.ts` | Line 126 — the «ربعي» sidebar item still carries a hardcoded `badge: "نشط"`. Unlike the deleted `badge: "2"` this one is a status claim about the user's own group, rendered verbatim by SidebarComponents.tsx with no read behind it, on an item whose only gate is `requiresClientGroup: true`. Small, but it is the same class as the badge that… |
| مراجعة الـ٦٩ · client-wallet | `src/app/dashboard/client/find-lawyer/[id]/page.tsx` | Still nothing but `redirect(`/lawyers/${params.id}`)`, i.e. still a bounce into the route src/app/lawyers/layout.tsx:27 sends to /services/lawyers while BETA_MONOPOLY_MODE is true. It is now an orphan: a repo-wide grep for `find-lawyer/${` returns zero hits since the card's «عرض الملف» link was removed. Dead route rather than a live defe… |
| مراجعة الـ٦٩ · client-wallet | `src/app/dashboard/client/messages/page.tsx` | The paperclip's explanation is carried only by a `title=` attribute (662). On a touch device there is no hover, so a client who taps it to attach evidence is navigated out of the live conversation to /dashboard/client/documents with no visible reason. The control is honest but the reason is invisible to the users most likely to press it. |
| مراجعة الـ٦٩ · client-wallet | `src/app/dashboard/client/wallet/page.tsx` | The mock `coupons` (102) and `transactions` (140-200) literals survive in the file, reachable only through `walletLoading && !isSupabaseMode` (338). `isSupabaseMode` is a module-level constant in src/lib/runtimeMode.ts, so this branch is eliminated from the production build — noting it only so a future reader does not re-raise it as inve… |
| مراجعة الـ٦٩ · corp-finance | `src/constants/settingsReadiness.ts` | The seatPolicy docblock at :39 states «NEVER POPULATED», but the LAWYER branch still populates it 150 lines below: `seatPolicy: canInviteTeam ? { label: "مقاعد المساعدين", used: 2, included: 3, ... }` (:192-194). The comment and the code disagree, and RoleScopeTab/TeamManagementTab still render that invented 2/3 bar — and TeamManagementT… |
| مراجعة الـ٦٩ · corp-finance | `src/components/floating/constants/floatingServices.tsx` | Three links into hidden corporate sections survive the 26-August unlinking: :387 «تقارير ومخاطر» and :388 «المحفظة والفواتير» in the floating services menu, :428 «تقارير الامتثال», plus src/constants/navigation.navbar.ts:122 «التقارير» → /dashboard/business/reports. All four land on «هذا القسم قيد الإعداد». The sidebar was cleaned; these… |
| مراجعة الـ٦٩ · corp-finance | `src/app/settings/components/tabs/InvoiceTab.tsx` | The «رفع شعار الفاتورة» button (:30-36) has an onClick that only prints «رفع شعار الفاتورة محلي فقط؛ تخزين الملفات ينتظر الباك إند», and the file contains no `<input type="file">` — no file can be chosen, so even the claimed local upload never happens. Same shape in EntitySettingsTab.tsx:140-146 («رفع الشعار» + «PNG, SVG — بحد أقصى 2MB» … |
| مراجعة الـ٦٩ · corp-finance | `src/app/settings/components/tabs/EntitySettingsTab.tsx` | Both surviving 'local-only' tabs still flip the button label to «تم الحفظ» (EntitySettingsTab:193, InvoiceTab:74) while the status line directly beneath states nothing was saved. The tick and the sentence contradict each other on the same screen. |
| مراجعة الـ٦٩ · signup | `src/components/consultation/steps/StepScheduling.tsx` | LIVE cosmetic defect on the public /book/consultation calendar, adjacent to the med-18 fix and not covered by any of the 7 findings: line 271 renders the Arabic day chip as `{isAr ? d.dayAr.slice(0, 2) : d.dayEn}`. Every Arabic weekday in WEEKDAYS_AR starts with «ال», so all seven day chips read «ال» and only the date numeral distinguish… |
| مراجعة الـ٦٩ · signup | `تقرير_للمالك_٢٠٢٦-٠٨-٢٨.md` | Deployment-ordering hazard attached to the two STILL_LIVE verdicts above, worth surfacing because it can silently undo three earlier fixes. The owner report at :261-262 warns «ولا يُنفَّذ بعده أي ملف يستبدل handle_new_user() — سيمسح صامتاً قفل الإدارة وتصحيح المزوّد وفرع هوية الشركة». The 20260827 migration header explains why: seven suc… |
| مراجعة الـ٦٩ · signup | `src/app/register/client/page.tsx` | Not a defect, recorded so the fix stage does not misread this group's shape: five of these seven findings were already closed by commit 84ce53d («feat(client,corporate): a company can order, and forty things stop pretending»), which landed after the audit. The brief said only the 8 حرج were fixed, but that commit's scope reached well pas… |
| مراجعة الـ٦٩ · client-home | `src/lib/services/dashboardService.ts:68-76` | The Phase-1 defect pattern is still live on this exact surface, one layer below all five findings. `getDashboardSummary()` ends in `catch { return { ...DEMO_SUMMARY }; }` in supabase mode, and DEMO_SUMMARY (50-63) is `{ activeCases: [], … walletBalance: 0, unreadNotifications: 0, subscription: { plan: "free", name: "مجانية", limits: {…},… |
| مراجعة الـ٦٩ · client-home | `src/app/dashboard/client/page.tsx:329-343` | The open-order count on the landing page reads `activeCasesTotal` off the summary via an inline cast — `const summaryWithTotal = summary as (DashboardSummary & { activeCasesTotal?: number }) \| null;` — a field DashboardSummary does not declare. It is guarded and only feeds a phrase, so it is not the high-3 class of cast, but the summary… |
| مراجعة الـ٦٩ · corp-legalops | `src/app/dashboard/firm/cases/[id]/LegalCanvas.tsx` | A SECOND, UNFIXED COPY of the high-23 defect on the firm surface. :12-29 declare their own `MOCK_NODES`/`MOCK_EDGES` — an invented commercial dispute («شركة الأفق للمقاولات (المدعي)», «مؤسسة النور (المدعى عليه)», «مطالبة مالية (١.٢ مليون)», «سلمان العتيبي (محامي)») — rendered unconditionally at :70-94 by a component that takes no props (… |
| مراجعة الـ٦٩ · corp-legalops | `src/constants/navigation.navbar.ts` | Live corporate controls still aim at the guarded /dashboard/business/reviews/new, so a corporate user who clicks them lands on «هذا القسم قيد الإعداد» rather than on a disabled control: navigation.navbar.ts:117 («إرسال للمراجعة»), floatingServices.tsx:379, :389, :398, :407, :439, and wa-steps/StepAiChat.tsx:95 (primaryHref). navigation.s… |
| مراجعة الـ٦٩ · corp-legalops | `src/app/dashboard/business/reviews/new/page.tsx` | Even before the localStorage write, the page's own subheading at :112 sells the three unimplemented mechanisms as the product — «ارفع المستند — حدد الإدارات — ونظامي يتكفل بالباقي (رابط + تنبيهات + تصعيد تلقائي)» — repeated at :240 («سيتم إرسال رابط واتساب لكل منها»), :304-306 («التصعيد التلقائي … يُصعّد تلقائياً للـ CEO») and :347. Any … |
| تكذيب الإصلاح · invoice | `src/app/settings/components/tabs/EntitySettingsTab.tsx` | Cross-tab inconsistency the fix exposes, and a loose rationale. EntitySettingsTab:113-117 is the SAME no-op — `handleSave = () => { setSaved(true); setLocalMessage(...); setTimeout(...) }` over inputs that also carry no name/ref/onChange (:175-179) — but it keeps a live button that flashes «تم الحفظ» above a line saying «لم تُحفظ هذه الب… |
| تكذيب الإصلاح · invoice | `src/app/settings/components/tabs/InvoiceTab.tsx` | `title` on a `disabled` button surfaces no tooltip in Chrome or Firefox (pointer events are suppressed on disabled controls), so both title attributes (:53, :96) are decorative. No information is lost — the visible Arabic paragraphs at :59-61 and :101-104 carry the reason — but the title is not the delivery mechanism the fixer's descript… |
| تكذيب الإصلاح · invoice | `src/app/settings/components/tabs/InvoiceTab.tsx` | Cosmetic leftovers from the removal: the save button keeps `flex items-center gap-2` (:97) although the CheckCircle it spaced is gone, and the fifth field is still labelled «نص ثابت أسفل الفاتورة (اختياري)» (:71) — «optional» is meaningless now that no field is saved at all. |
| تكذيب الإصلاح · invoice | `src/app/settings/components/tabs/_shared.tsx` | The fixer's third followUp is accurate, verified: globals.css redefines only --color-gray-50/100/200 (:101-103), so SectionTitle's `dark:text-gray-500` stays #6b7280 and is legible on the dark surface. Not the gray-token trap; no change needed. |
| تكذيب الإصلاح · reviews | `src/app/dashboard/business/reviews/new/page.tsx` | Imprecision inside the honest notice, not a false promise. The description says «وما كان يظهر من رقم مراجعة ورابط ورمز دخول كان ثابتاً في الصفحة ولا يفتح شيئاً» — grouping the review NUMBER with the link and code as hardcoded. The link and passcode genuinely were string literals, but the number came from createWorkflowId("BIZ-REV") (clie… |
| تكذيب الإصلاح · reviews | `src/constants/navigation.sidebars.business.ts` | Stale line reference, outside the fixer's file. Line 29 of the ruling comment still reads «إرسال للمراجعة → business/reviews/new/page.tsx:14 writes to localStorage, never to service_requests». Line 14 of that file is now part of the removal comment, and the localStorage write no longer exists. Cosmetic; the sidebar entry it documents is … |
| تكذيب الإصلاح · reviews | `src/app/dashboard/business/reviews/page.tsx` | Confirms the fixer's own follow-up, and the asymmetry is real. The parent list is still MOCK_DOCS behind SubscriptionGuard featureKey="dept-reviews" (:166). isHiddenBusinessSection hides it from non-admin corporate (asserted in the same test file), but an admin renders the fabricated list exactly as an admin rendered this wizard. Not a r… |
| تكذيب الإصلاح · reviews | `src/app/settings/components/tabs/InvoiceTab.tsx` | Dirty in the working tree alongside the reviews file, together with ReferralTab.tsx. NOT this fixer's scope creep: neither diff mentions "review", and both are settings/billing tabs belonging to another group's concurrent work. Recorded only so the tree state is not later misattributed to the reviews fix. |
| تكذيب الإصلاح · resurrected:ReferralTab.tsx | `src/app/settings/components/tabs/ReferralTab.tsx` | The file header (lines 10-13) and the fixer's claim both say the promise rendered «for every individual, lawyer and corporate account». That is wrong about the third type: corporate is canUseReferral:false (settingsReadiness.ts:270) and has no "referral" entry in its visibleTabs. The three visibleTabs carrying "referral" are :167 individ… |
| تكذيب الإصلاح · resurrected:ReferralTab.tsx | `src/app/settings/hooks/useSettingsTabs.ts` | Line 54 still labels the tab `labelAr: "دعوة الأصدقاء"` (iconKey "gift") — an invitation framing over a panel that says the programme is off. Not a regression on three grounds: the file is outside the fixer's list (editing it would have been the forbidden move), a nav label naming a feature area is not an assertion of fact, and the same … |
| تكذيب الإصلاح · resurrected:ReferralTab.tsx | `src/app/api/v1/referrals/route.ts` | Pre-existing, untouched, and now demonstrably orphaned: a tree-wide grep for `v1/referrals` finds no fetch call site — only the two docblock mentions in ReferralTab.tsx and dashboard/client/referral/page.tsx. It still derives referralCode/referralUrl from user.id.slice(0,8) and computes stats over a table nothing ever inserts into. Not t… |
| أثناء الإصلاح · invoice | `src/app/settings/components/tabs/InvoiceTab.tsx` | NEEDS_BACKEND — no write path for invoice identity (entity name, VAT number, invoice address, invoices email, invoice footer text). There is no table, column or route that accepts these fields, and no client-readable invoice source: the only receipts door is /api/v1/admin/receipts, which requires an admin session (documented in PaymentsT… |
| أثناء الإصلاح · invoice | `src/app/settings/components/tabs/InvoiceTab.tsx` | NEEDS_BACKEND — no storage path for an invoice logo. The upload button never had an <input type="file"> behind it; enabling it needs a Supabase Storage bucket (or reuse of an existing one) plus a column holding the resulting URL. |
| أثناء الإصلاح · invoice | `src/app/settings/components/tabs/_shared.tsx` | Not mine to edit, noted only: SectionTitle uses text-gray-400 dark:text-gray-500. Pre-existing and legible (the gray-token trap is gray-100/200), so no change made — flagging it because it is the one gray-* token still rendering inside this tab. |
| أثناء الإصلاح · reviews | `src/components/floating/constants/floatingServices.tsx` | Informational, not a regression and not my file. Five entries link to /dashboard/business/reviews/new (lines ~379 corp-hr-review, ~389 corp-finance-review, ~398 corp-employee-new, ~407 corp-head-review, and the ~439 non-service-mode branch), with subtitles such as «أرسل ملفاً للفريق القانوني». They now land on the honest قريباً page inst… |
| أثناء الإصلاح · reviews | `src/constants/navigation.navbar.ts` | Informational, not my file. Line 117 keeps the navbar entry «إرسال للمراجعة» → /dashboard/business/reviews/new. Same situation as floatingServices: the destination is now honest, but the link still advertises a capability that is not available. |
| أثناء الإصلاح · reviews | `src/components/floating/wa-steps/StepAiChat.tsx` | Informational, not my file. Line 95 sets primaryHref to /dashboard/business/reviews/new as the primary call-to-action out of the WhatsApp AI-chat step; it now resolves to the قريباً page. |
| أثناء الإصلاح · reviews | `src/constants/businessProfileReadiness.ts` | Informational, not my file. Line 60 lists /dashboard/business/reviews and /dashboard/business/reviews/new among the routes a readiness item points at; both are hidden sections, so that readiness entry can no longer be completed by a non-admin corporate account. |
| أثناء الإصلاح · reviews | `src/app/dashboard/business/reviews/page.tsx` | Not my file, no change made. The parent list page is still built on MOCK_DOCS (invented documents, departments, reviewers and notes) behind SubscriptionGuard. It is hidden by isHiddenBusinessSection for non-admin corporate accounts, but an admin renders the fabricated list exactly as an admin rendered this wizard. Same treatment (Dashboa… |
| أثناء الإصلاح · reviews | `src/lib/workflowStore.ts` | Not my file, informational. This page was one of the call sites of saveWorkflowRequest/createWorkflowId; that import is now gone from it. No change made to the store, and other call sites were not inspected. |
| أثناء الإصلاح · resurrected:ReferralTab.tsx | `src/app/settings/hooks/useSettingsTabs.ts` | Line 54 still labels the tab `labelAr: "دعوة الأصدقاء"` (iconKey "gift"). Outside my file list, so not edited. Not a defect in my judgement — the label now opens onto a panel that states the programme is inactive, which is exactly the reasoning on which /dashboard/client/referral kept its sidebar row rather than 404ing. Flagged only so a… |

