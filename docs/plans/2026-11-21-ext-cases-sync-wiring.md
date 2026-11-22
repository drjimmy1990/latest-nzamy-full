# ربط `cases/sync` — ما بقي بعد التنفيذ · 2026-11-21

> الحالة: **منفَّذ ومُختبَر محليًا، غير منشور وغير مُشغَّل على أي قاعدة.** بانتظار موافقة المالك.

## ما في هذا الفرع
| الملف | الدور |
|---|---|
| `src/lib/ext/casesSync.ts` + `.test.ts` | تحقق المخطط، إزالة تكرار بالبصمة، تقنيع الهويات (٩ اختبارات تمر) |
| `src/app/api/v1/ext/cases/sync/route.ts` | المسار؛ رقيق فوق `requireExtCaller` |
| `SQL_batch_2026-11-21_ext_cases_sync/01_ext_cases_sync.sql` | جدولا `ext_case_syncs` و`ext_case_items` ودالة `ext_cases_sync` (معاملة واحدة + قفل على المفتاح) |
| `nezamy-chrome-extension/sync-client.js` + `.test.mjs` | تحويل الحزمة ← العقد، مفتاح حتمي، تصنيف الردود، تراجع أسّي، انتهاء الطابور (٨ اختبارات تمر) |

## تحديث 22 نوفمبر: دُمج فرع MCP محليًا في هذا الفرع (لم يُدمج في `main`)
حُلّت ٣ تعارضات اختبار بإضافة `sayegh-v2` فوق نسخة HEAD (سعر الصائغ 200 كما في السجل الحالي، لا 500). أُضيف `cases:sync` إلى `Scope` و`migration_v2.sql` و`standing`. `tsc` لا يُظهر أخطاء في `ext/`. **ملاحظة:** `mcp/platform-patch/migration.sql` ما زال يحصر النطاقات في الأربعة الأولى؛ يلزم تشغيل `migration_v2.sql` بعده.

## (قبل الدمج) ما لم يكن يعمل
1. **`_extAuth.ts` موجود على فرع MCP فقط.** المسار يستورده؛ لن يُبنى هذا الفرع منفردًا. حاولت دمج `claude/mcp-sayegh-v2-a707a4` فتعارضت ثلاثة ملفات اختبار (`pricingApprovals/liveClaims/toolRoles.test.ts`) فألغيت الدمج. الأنسب: يُدمج فرع MCP أولًا ثم هذا.
2. **نطاق `cases:sync`:** يُضاف إلى `Scope` في `_extAuth.ts` وإلى `check (scopes <@ …)` في `mcp/platform-patch/migration_v2.sql` (الفرع نفسه). في المسار الآن `as never` مؤقتًا.
3. **الإضافة نفسها على `owner-edits`** وفيها تعديلات المالك غير الملتزمة. لم ألمس `background.js`. الربط (عند الالتزام):
   - `import { bundleToSyncRequest, sendSync, pruneQueue } from "./sync-client.js"`
   - في `pushBundleToNezamy`: استبدال `fetch(.../najiz/sync)` بـ`sendSync(await bundleToSyncRequest(bundle,{extensionVersion}), {serverUrl, token: apiKey})`؛ `done`⇒ لا شيء، `retry`⇒ `enqueuePendingSync`، `rejected`⇒ وسم «مرفوضة» (لا إعادة تلقائية). حذف رسالة «ستُرفع فور ربط حسابك».
   - `flushPendingSyncQueue`: `pruneQueue` قبل التفريغ.
   - مصدر التوكن: PAT من إعدادات الإضافة؛ إزالة `credentials: include`.
4. **ملاحظة تصميم:** مطابقة القضية عبر `cases.metadata.ext.{platform,number}` مع `assigned_user_id` — لا أعمدة جديدة على `cases`. جداول `case_dossiers` غير موجودة؛ الخطوة ٥ في العقد (عناصر الملف) مؤجلة.

## أسئلة للمالك (تضاف إلى مفتوحة العقد)
- بوابة **معين** (`moeen`) ليست ضمن منصات العقد الست: تُهمَل الآن. هل تُضاف منصة `moeen`؟
- مدة انتهاء الطابور المحلي (٧ أيام مقترحة)، وتشفيره.
- لم أتحقق من نشر المسارات القديمة على الإنتاج؛ لم أُبقِ طبقة توافق.
- المرفقات: بصمات فقط الآن؛ `attachments` و`records` تبقى فارغة من الإضافة حتى يُقرَّر مصدرها في `content.js`.
