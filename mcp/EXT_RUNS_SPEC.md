# مواصفة للمبرمج: `/api/v1/ext/ai/runs` و`/quote` (وGET للتشغيل)

> الحالة: **مواصفة لم تُبنَ**. المسودات في `platform-patch/routes` فيها `501` وTODO. العقد الملزم هو `nezamy-client/src/schemas.ts` (zod)، والمنصة تنفّذه. الخادم الوهمي `nezamy-client/test/mock-server.ts` هو التنفيذ المرجعي للسلوك، وكل ما تحت مجرّب فعلًا مقابله (العميل 20/20 والخادم 56/56).
> علامات: **[عقد]** مأخوذ من الكود المختبَر. **[افتراض]** من عندي ويُؤكَّد. **[n8n]** من `docs/n8n-legal-drafter-v2.md` (جلسة n8n، تصميم staging).

## ١. ما المطلوب ببساطة
محوّل رفيع فوق `startRunWith` (`src/lib/ai/runCore.ts`) **نفسه** الذي يستعمله الموقع: نفس فحص الدور والمادة ١٨ ووضع الأداة والتكرار والخصم والرد. لا مسار تشغيل موازٍ، ولا استدعاء مباشر لـn8n، ولا خصم مكتوب بيدك. ثلاث نقاط:

| الطريقة والمسار | الصلاحية | الغرض |
|---|---|---|
| `POST /api/v1/ext/ai/runs/quote` | `ai:run` ⚠ (المسودة كتبت `account:read`، والخادم الوهمي يطلب `ai:run`) | السعر والرصيد دون أي خصم |
| `POST /api/v1/ext/ai/runs` | `ai:run` | بدء تشغيل (خصم + n8n) |
| `GET /api/v1/ext/ai/runs/{id}` | `ai:run` | الحالة والنتيجة. **غير موجود في المسودات إطلاقًا** (المسودة قالت «+ [id]/route.ts» فقط) |

## ٢. أمور مشتركة بين الثلاثة
- **المصادقة [عقد]:** `Authorization: Bearer nzy_pat_…` عبر `requireExtCaller` (مسودة `_extAuth.ts`). التوكن يحدد `user_id`؛ **كل استعلام بـservice role يُقيَّد بهذا `user_id` يدويًا** (لا RLS هنا).
- **أول ما يُفحص بعد المصادقة:** مفتاح الإيقاف `ext_kill_switch` → `503` + `code:"kill_switch"`؛ ثم تجميد الحساب → `403` + `code:"frozen_account"`.
- **كل رد (نجاح أو خطأ) فيه `request_id`** وترويسة `X-Request-Id` و`Cache-Control: no-store`.
- **حد معدل لكل توكن** (`lib/rateLimitRoutes.ts`، المقترح 60/دقيقة): `429` + `Retry-After` (ثوانٍ) + `retry_after_seconds` في الجسم. العميل يعيد المحاولة تلقائيًا على 429/502/503/504 (حتى حد معيّن).
- **شكل الخطأ (مهم، فرق عن مسودتك) [عقد]:** مسطّح لا متداخل:
  ```json
  { "request_id": "req_…", "error": "رسالة عربية قصيرة للمحامي", "code": "insufficient_points", "retry_after_seconds": 12 }
  ```
  مسودة `extError` تعيد `{error:{code,message,request_id}}` وتستعمل `insufficient_scope` و`account_frozen`. **العميل لا يفهمهما**: يقرأ `error` كنص و`code` من القائمة التالية. صحّح المسودة (`error`=النص العربي، `code` من الجدول).
- **أكواد `code` المعروفة للعميل [عقد]:** `unauthorized`(401) · `forbidden_scope`(403، لا `insufficient_scope`) · `token_expired` · `frozen_account`(403، لا `account_frozen`) · `rate_limited`(429) · `quota_exceeded` · `library_locked`(423) · `library_tier` · `insufficient_points`(402) · `tool_off` · `role_refused` · `consultant_blocked` · `kill_switch`(503) · `device_limit` · `staff_only` · `validation`(400/422) · `not_found`(404). أي كود آخر يُعامل بحسب حالة HTTP. نص `error` يجب أن يكون عربيًا (يُعرض للمحامي كما هو إن احتوى حروفًا عربية).
- **لا أسرار في أي رد ولا في السجلات:** لا توكن، لا رابط n8n، لا `callback_url`، لا نص برومبت.

## ٣. `POST /ai/runs/quote` — عرض السعر (قراءة فقط)
**يجب ألا يستدعي `ai_start_run` ولا يحجز ولا يكتب شيئًا.** يقرأ السعر والرصيد من `pointsStanding.ts` ومن سجل الأدوات بالطريقة نفسها التي يقرّر بها `ai_start_run`.

الطلب [عقد]:
```json
{ "tool": "legal-drafter", "input": { "...": "نفس input التشغيل" }, "conversation_id": "اختياري" }
```
الرد 200 [عقد]:
```json
{ "request_id": "req_…", "tool": "legal-drafter", "price_points": 500, "balance": 1200,
  "can_afford": true, "daily_remaining": 9, "note": "نص عربي اختياري" }
```
- `daily_remaining`: المتبقي اليوم لهذه الأداة، أو `null` بلا حد.
- `note`: مثل «الصياغة بعد التحليل بلا رسوم إضافية» (حين `price_points = 0`).
- الأسعار من المنصة فقط (الخادم لا يكتب أرقامًا). الحالية في `draftKinds.ts`: دعوى وردود 500، استئناف 800، نقض والتماس 1500 **[n8n]**؛ الصياغة بعد تحليل في المحادثة نفسها 0؛ `contract-drafter` 500 (مسودة المسار).
- لسعر `sayegh-v2`: يُحسب بحسب `input.kind` كما `legal-drafter`، ولا يزيد لكل مرحلة [افتراض؛ قرار المالك: السعر يُحجز مرة ويُرد كاملًا عند فشل أي مرحلة، حسب الخطة].
- 4xx للمدخلات: `validation`. أداة غير مسموحة: `422 validation` أو `403 tool_off`.

## ٤. `POST /ai/runs` — بدء التشغيل
الطلب [عقد `StartRunRequest`]:
```json
{ "tool": "legal-drafter | contract-drafter | brief-check | sayegh-v2",
  "input": { "...": "..." },
  "idempotency_key": "8–128 حرفًا",
  "conversation_id": "اختياري" }
```
**قائمة الأدوات المسموحة (allowlist):** معرّفات السجل الفعلية في `aiTools/tools.ts`. مسودتك فيها ثلاثة؛ أضف `sayegh-v2` فقط حين تُنشأ أداته (انظر ٦).

الخطوات (بالترتيب):
1. مصادقة + `ai:run` + kill + تجميد.
2. `tool` في الـallowlist وإلا `422`/`tool_off`.
3. **مفتاح التكرار:** `ext:${tokenId}:${idempotency_key}` يُمرَّر إلى `startRunWith` (`idempotencyKey`). التوكن جزء من المفتاح فلا يتصادم عميلان.
4. حمّل `RunActor` (userType / practiceKind / displayName) للمستخدم كما يفعل `src/app/api/v1/ai/runs/route.ts`. **انسخ wiring الـn8n و`callbackUrl` و`libraryAccess` منه حرفيًا.** الـ`consultant_blocked` (م١٨) و`role_refused` يأتيان من `runCore` لا من هنا.
5. `startRunWith(...)` ثم حوّل رده إلى الشكل أدناه.

الرد [عقد `StartRunResponse`]:
```json
{ "request_id": "req_…", "run_id": "…", "conversation_id": "…|null", "status": "running", "charged_points": 500 }
```
- جديد: `202`. **تكرار بنفس المفتاح: يعيد `200` بالتشغيل نفسه و`charged_points: 0`** (لا خصم ثانٍ، لا تشغيل ثانٍ). هذا ما يعتمد عليه الخادم عند إعادة المحاولة.
- رصيد غير كافٍ: `402` + `insufficient_points` **قبل** أي خصم.
- `legal-drafter` طور `draft`: يلزمه `conversation_id` لتحليل ناجح سابق (الخادم يتحقق قبل الاستدعاء)، ويجب على المنصة تأكيد أن المحادثة ملك صاحب التوكن.

## ٥. `GET /ai/runs/{id}` — الحالة والنتيجة
القراءة عبر `runForViewer` (`lib/ai/runVisibility.ts`) **بعد** تحقق يدوي أن التشغيل لصاحب التوكن (وإلا `404 not_found`، لا `403` حتى لا يُكشف وجود تشغيل غيره).

الرد 200 [عقد `RunResponse`]:
```json
{ "request_id": "req_…", "run_id": "…", "tool": "…",
  "status": "running | succeeded | failed",
  "conversation_id": "…|null",
  "progress": [ { "step": "reading", "at": "2026-11-21T10:00:00Z" } ],
  "output": { }, "citations": [ { "sid": "S1", "title": "…", "status": "in_force", "library_id": "…", "url": "…" } ],
  "error_code": null, "error_message": null,
  "charged_points": 500, "refunded": false }
```
- الحالات ثلاث فقط. أي حالة داخلية أخرى تُطابَق عليها. `failed` يحمل `error_message` **عربيًا** و`refunded: true` إن رُدّت النقاط (الرد الكامل عند فشل أي مرحلة — قرار المالك).
- أثناء `running`: `output` غائب أو `null`. `progress[].step` من الخطوات المسموحة في التطبيق (`reading/drafting/reviewing`) **[n8n]**.
- `citations`: المصادر المستشهد بها **بحالتها من المكتبة نفسها** (`in_force | amended | repealed | unknown`)، وبـ`library_id` حين تُعرف. مصدرها حقل `cited` في مخرج n8n بعد مطابقته بالمكتبة **[افتراض: شكل `cited` غير موثّق؛ المطلوب أن يخرج هنا كمصفوفة بهذه الحقول]**. خادم MCP يستعمل `library_id` هنا ليفتح قراءة المادة الكاملة للمادة المستشهد بها فقط.
- **لا شكل `{run:{…}}`**: المنصة الحية ترجع هذا الغلاف، والعقد لا يحتويه. أخرج الحقول مباشرة.

### مخرج `output` لكل أداة
- `legal-drafter` طور `issues`: `{phase:"issues", facts_summary, issues[], defenses[], requests[], missing[]}` كما اليوم.
- `legal-drafter` طور `draft` (وكذلك `sayegh-v2`): `{title, preamble?, sections:[{heading,body}], requests[], citation_check?[]}` **[n8n: `title/sections/requests/cited`]**.
- **مضاف من الصائغ v2 [n8n]** — يُمرَّر كما هو ولا يُسقط (هذا ما أُنجز في `tools.ts legalDrafterOutput` على جانب n8n):
  ```json
  "lawyer_notes": { "extraction": {"items":[],"gaps":[],"conflicts":[],"dropped":[]} | null,
                    "adversary": {"verdict":…, "findings":[]} | null,
                    "refine": {"changes":[],"requests_changed":false} | null,
                    "skipped": [], "engine": {"stages":[],"prompts":{},"models":{}} },
  "najiz": { "text": "…", "chars": 8123, "over_limit": false, "markers_kept": true }
  ```
  قواعد: `lawyer_notes` **للمحامي فقط**: لا تُدمج في المذكرة ولا تُرسل للعميل (الخادم والإضافة يعرضانها منفصلة). `najiz.text` ≤ 9000 حرف (`over_limit` علامة). الأشكال الخاطئة تُسقط بصمت ولا تُفشل المذكرة. عناصر `items/findings/changes` الداخلية **[افتراض]** يقرؤها الخادم بتساهل (`sid`, `verified`, `text/quote/...`)؛ يكفي تمريرها كما أخرجها n8n.
- `contract-drafter`: عقد بأقسام مرقّمة وفراغات `[....]`.
- حجم `output` ≤ ~١٠٠ ألف حرف للملاحظات؛ المذكرة عادية.

## ٦. أداة `sayegh-v2` وربطها بـn8n (قرار مفتوح — أبلغ المنسّقة)
ما هو **مؤكد من n8n** [n8n]: المسار `nzamy-ai/legal-drafter-v2`، حزمة الويب هوك = حزمة L14 + `prompts`/`models`/`input.stages`/`input.on_stage_error`، ومخرجه المذكور في ٥. المراحل داخل n8n: `write` (دائمًا) ثم `extraction`/`adversary`/`refine`/`najiz` (طور `draft` فقط). **لا يوجد** في n8n: `intake`، ولا `dossier`، ولا `parent_run_id`، ولا تشغيل مرحلة لاحقة وحدها على مذكرة موجودة، ولا `unverified` ولا `memo_clean`.

خياران، والقرار للمنسّقة/المالك:
- **(أ) تحويل `legal-drafter` نفسه** إلى v2 عبر `n8nPath`/السجل حسب البيئة (هذا ما تقترحه جلسة n8n: نقطة الاتصال ٢). عندها لا حاجة لـ`sayegh-v2`، و`run_legal_drafter` ينال `lawyer_notes`/`najiz` تلقائيًا، و`run_sayegh` يصبح مرادفًا مبسّطًا.
- **(ب) أداة سجل مستقلة `sayegh-v2`** تشير إلى `legal-drafter-v2` (ما بُني عليه `run_sayegh` اليوم، **اقتراح مني غير مؤكد**) مع بوابة مشرفين (`account/standing.is_staff`).

ما يرسله `run_sayegh` اليوم كـ`input` [افتراض، يتغير حسب القرار أعلاه]:
```json
{ "pipeline":"v2", "stage":"pipeline|intake|draft|extraction|adversary|refine|najiz", "kind":"appeal",
  "client_role":"مستأنف", "notes":"", "facts":"…", "dossier_id":"…", "parent_run_id":"…", "on_stage_error":"skip" }
```
ترجمتها إلى حزمة n8n **[افتراض]**: `stage=pipeline` → بلا `input.stages` (كل المراحل)؛ `draft` → `stages:[]`؛ `extraction|adversary|refine|najiz` → `stages:[المرحلة]` **لكن n8n سيشغّل `write` قبلها دائمًا** (لا مرحلة لاحقة وحدها)؛ `intake` ← لا مقابل في n8n؛ `dossier_id/parent_run_id` ← لا مقابل (الخطة تذكر `case_dossiers` ولم تُبنَ). `on_stage_error` يمرّ كما هو (`fail` الافتراضي).
**اطلب من جلسة n8n/المنسّقة:** هل يُضاف `intake`/`dossier` إلى n8n، أم يُحذفان من `run_sayegh` ويبقى `stages` فقط؟

## ٧. نقاط أخرى يجب أن تُصلَح في المسودات
1. `_extAuth.ts`: نوع `Scope` ينقصه `dossier:read` و`research:write` (موجودان في العقد) — مطلوبان لمساري المشرفين الآخرين (`GET /dossiers/{id}`، `POST /research/items`) خارج نطاق هذه الوثيقة.
2. `USAGE_NOTICE_AR` في `_extAuth.ts` يخالف النص الحرفي في العقد (`schemas.ts USAGE_NOTICE_AR`)؛ الخادم يمرّر ما تعيده المنصة، فاعتمد نصًا واحدًا.
3. مسودة `ai-runs.route.ts` تعرّف `EXT_TOOLS` بلا `sayegh-v2` بينما عقد العميل `ExtTool` فيه `brief-check` و`sayegh-v2`.
4. لا تدع `GET /ai/runs/{id}` يكشف `n8n_execution_id` أو `callback_url` أو أي حقل داخلي.

## ٨. قائمة قبول (اختبرها على staging قبل أي مفتاح حقيقي)
1. quote لا يغيّر الرصيد ولا ينشئ صفًا في `ai_runs`.
2. POST ثم POST بنفس `idempotency_key` → نفس `run_id`، والثاني `charged_points:0`، والرصيد نقص مرة واحدة.
3. رصيد أقل من السعر → `402 insufficient_points`، بلا تشغيل.
4. فشل n8n (أو أي مرحلة) → `status:"failed"`، `refunded:true`، `error_message` عربي، والرصيد عاد كاملًا.
5. تشغيل لمستخدم آخر → `404`.
6. توكن بلا `ai:run` → `403 forbidden_scope`؛ `ext_kill_switch` → `503 kill_switch` فورًا.
7. مستشار قانوني (م١٨) على `legal-drafter` → `consultant_blocked`.
8. نتيجة `legal-drafter` طور `draft` فيها `lawyer_notes` و`najiz` سليمة الشكل، وعلى أي حقل فاسد تبقى المذكرة.
9. لا يظهر توكن ولا رابط n8n ولا نص برومبت في أي رد أو سجل.
10. شغّل مجموعة العميل `nezamy-client/test/client.test.ts` ومجموعة الخادم مقابل staging بدل الخادم الوهمي (غيّر `baseUrl` فقط) وقارن.
