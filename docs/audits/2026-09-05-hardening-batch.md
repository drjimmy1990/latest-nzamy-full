# دفعة التقوية — ما لا يحتاج قرار المالك: سجل التنفيذ (٥ سبتمبر ٢٠٢٦)

**الفرع:** `main` ثم `owner-edits`. **الترحيلات الجديدة (تشغّلها أنت):** `20260909_document_shares_hashes.sql` · `20260910_case_notes.sql` · `20260911_community_reports.sql` — كلها اختُبرت في حاضنة Docker (RLS) قبل الدفع.
**الطريقة:** ثمانية بنّائين على ملفات منفصلة، مكذِّب لكل واحد، مُصلِح لما نُقض؛ ثم ثلاث مهام لاحقة (lint، شاشة المشاركة، صفحة بلاغات الإدارة).

## ما وجدناه قبل الكتابة

* بند ١٧٤ يسمّي ثلاث أسرار مخزَّنة نصاً صريحاً. **اثنان منها جداول ميتة**: `case_share_tokens` و`team_invitations` لا كاتب ولا قارئ لهما في الكود كله. الثالث `document_shares` **حيّ من جهة القراءة فقط**: مسار تحقق يقارن الباسكود نصاً، ولا شيء يُنشئ صفّاً — الرابط الذي تولّده الواجهة كان `Math.random()` في ذاكرة الصفحة ويعطي 404.
* لا تحديد لمعدّل الطلبات في أي مكان إلا خانق خاص داخل مسار «تقييم الأعمال».
* لا جدول لملاحظات القضية؛ لا جدول لبلاغات المجتمع (لوحة الإشراف كانت تختلق «سبب البلاغ»).
* `invitationStore.ts` مخزن متصفح وهمي (تحقق بتعبير نمطي، جدول تراخيص محامين مكتوب يدوياً) ما زال يستورده مساران.

## مشاركة المستندات برابط وباسكود — حقيقية ومُجزَّأة (بند ١٧٤)

**الترحيل:** `20260909_document_shares_hashes.sql`

**المسارات:** `POST /api/v1/share` · `POST /api/v1/share/[token]/verify`

* من يفتح رابط مشاركة صالحاً (/share/<token>) ويُدخل الباسكود الصحيح يرى الآن عنوان المستند الحقيقي وزر «فتح المستند» يفتح الملف الفعلي عبر رابط موقّع صالح 5 دقائق — بدل نص عقد وهمي ثابت («عقد عمل محدد المدة») وأزرار «اعتماد العقد»/«إرسال الملاحظات» كانت لا تُنفّذ شيئاً.
* لوحة «مشاركة مع العميل» (ClientSharePanel) لم تعد تعرض تنبيه «مشاركة المستندات غير مفعّلة بعد على الخادم» — الرابط والباسكود الناتجان يعملان فعلياً فور الضغط على «إنشاء رابط + باسكود»، ويظهر الآن سطر صريح: احفظ الباسكود الآن، لن يُعرض مرة أخرى بعد مغادرة الصفحة.
* تنبيه مهم: لا ClientSharePanel ولا شاشة StepApproval (مسار الصياغة) موصولتان اليوم بأي صفحة فعلية في التطبيق — كلتاهما شيفرة يتيمة (orphaned) لم تتغيّر هذه الحقيقة بهذا العمل، فلن يرى أي مستخدم حالي هاتين اللوحتين حتى تُوصَّلا بشاشة حقيقية في مهمة لاحقة؛ ما تغيّر هو أن الكود خلفهما صار حقيقياً بدل أن يكون مسرحية.

**التحقق:** 4 اختباراً · حاضنة RLS: Ran successfully via Docker (postgres:16-alpine, supabase/tests/rls/run.sh). Migrations applied in order: 20260616_production_readiness_fixes.sql (adds the owne · المكذِّب أكّد 10.

**البند 174 — partial:** المسار الحي الوحيد من الثلاثة (document_shares) بات حقيقياً بالكامل ومُختبراً: الترحيل (idempotent) يضيف token_hash/passcode_hash/document_path ويُرحّل القيم القديمة بخوارزمية sha256 مطابقة تماماً لِـ shareSecrets.ts (تحقّقتُ من ذلك داخل حاوية Docker فعلية)، مسار الكتابة الجديد POST /api/v1/share يتحقق من صلاحية القراءة عبر RLS قبل الإنشاء ولا يخزّن أي نص صريح، ومسار التحقق تمت إعادة كتابته بالكام **بقي:** لم يُلمس عمود case_share_tokens.token ولا team_invitations.token — تأكّد بالبحث الحرفي في src أنه لا كاتب ولا قارئ لأي منهما إطلاقاً (توثيق فقط في ثلاث تعليقات لـ team_invitations)، فتجزئة عمود لا يكتبه ولا يقرأه أحد كانت ستكون مسرحية لا إصلاحاً — بانتظار قرار المالك إن كان يريد حذف الجدولين أو بناء مسارات حقيقية لهما لاحقاً. الأهم: لوحتا الواجهة اللتان يُفترض أن تستدعيا هذا المسار الحقيقي (Client

## تحديد معدّل الطلبات (بند ١٧٢)

**المسارات:** `POST /api/v1/share/[token]/verify` · `POST /api/v1/library/invitations/redeem` · `POST /api/v1/invite/[code]/accept` · `POST /api/v1/contact` · `POST/PUT/PATCH/DELETE /api/v1/* (every subtree except /api/v1/cron/* and /api/v1/n8n/*)`

* لا يتغير أي مظهر مرئي لأي صفحة أو حساب — هذا تعزيز خلفي بحت.
* بعد النشر: أي محاولة إعادة إرسال سريعة ومتكررة (أكثر من ١٠ مرات خلال ١٠ دقائق) لتفعيل رابط مشاركة، أو استرداد دعوة مكتبة، أو قبول دعوة، أو إرسال نموذج التواصل، ستُرفض برسالة «طلبات كثيرة — حاول بعد قليل.» بدل أن تُقبل بلا حدود.
* بعد النشر: أي حساب يرسل أكثر من ١٢٠ طلب تعديل/حذف/إضافة في الدقيقة عبر واجهة /api/v1 (عدا مهام الجدولة الداخلية وn8n) سيُرفض بنفس الرسالة مؤقتًا.
* لا تغيير على أي شاشة أو تدفق موجود؛ التحقق الحالي داخل صفحة التقييم القانوني المجاني (نموذج العمل) يبقى كما هو دون مساس.

**التحقق:** 27 اختباراً · حاضنة RLS: Not applicable to this task — owner item 172 is a pure in-memory rate limiter with no database/RLS surface. No migration, no SQL, no RLS policy touched. · المكذِّب أكّد 11 ونقض 1 (أُصلح 3).

**البند 172 — partial:** بُني المُحدِّد (rate limiter) في src/lib/rateLimit.ts (نافذة ثابتة، خزن في ذاكرة العملية فقط، حد أقصى صارم على الذاكرة، ٢٧ اختبارًا ناجحًا) وطُبِّق في src/proxy.ts كخطوة أولى قبل أي منطق آخر (الفرق مع الأصل: ١١٢ سطرًا إضافة فقط، صفر حذف/تعديل — تأكد بـ git diff). حزمة صارمة (١٠ كل ١٠ دقائق) على أربعة مسارات حساسة، وحزمة عامة (١٢٠ كل دقيقة) على كل POST/PUT/PATCH/DELETE تحت /api/v1 عدا cron وn8n. ال **بقي:** الكود غير منشور على الإنتاج بعد (يحتاج نشرًا/deploy كما في كل مرحلة سابقة). كذلك: الإعداد الحالي لـ nginx (proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for) يُلحق بقيمة الهيدر بدل استبدالها، مما يسمح لمهاجم بانتحال أول عنوان IP في x-forwarded-for والتحايل على الحد — وهذا تابع لإعداد الخادم وليس لهذه المهمة، وموثّق بوضوح في رأس الوحدة حتى لا يُفهم أن العنوان موثوق أمنيًا.

**محجوب:** Owner item 172 is fully built in code but NOT deployed to production — the whole point of a rate limiter is to run on live traffic. — This session cannot deploy; per the memory pattern for every prior phase (5, 6, 7, migrations 20260906-08), "built" and "live" are tracked separately. Marking this closed would be dishonest until the next deploy ships it.

**محجوب:** The x-forwarded-for-first IP resolution the owner explicitly specified is bypassable under the current nginx config. — deployment_guide.md line ~284 shows `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, which APPENDS to whatever the client already sent instead of replacing it — so a caller can prepend a fake first entry (`X-Forwarded-For: 1.2.3.4`) and bypass t

## ملاحظات القضية (بند ٦٥ — النصف الباقي)

**الترحيل:** `20260910_case_notes.sql`

**المسارات:** `GET /api/v1/cases/[id]/notes` · `POST /api/v1/cases/[id]/notes` · `PATCH /api/v1/cases/[id]/notes/[noteId]` · `DELETE /api/v1/cases/[id]/notes/[noteId]`

* في ملف قضية المحامي (تبويب «الملاحظات»): مربع كتابة ملاحظة حقيقي مع اختيار «خاصة بي» أو «للمكتب» بدل رسالة «لا يمكن حفظ ملاحظة من هذا الملف حالياً».
* قائمة ملاحظات محفوظة تحت المُركّب: اسم الكاتب (أو أيقونة محايدة إن جُهل الاسم) والنطاق والتاريخ ونص الملاحظة، مع أزرار «تعديل» و«حذف» على ملاحظات المستخدم نفسه فقط.
* ملاحظات سجل الأحداث القديمة (المشتقة تلقائيًا من أحداث القضية) بقيت ظاهرة تحت عنوان منفصل «ملاحظات من سجل الأحداث»، بلا خلط مع الملاحظات المحفوظة الجديدة.
* في ملف قضية المكتب: تبويب جديد بعنوان «الملاحظات» ظهر لأول مرة، بنفس المُركّب والقائمة.

**التحقق:** 0 اختباراً · حاضنة RLS: Ran (Docker available): `bash supabase/tests/rls/run.sh supabase/migrations/20260903_phase2_clients_and_firm_membership.sql supabase/migrations/20260910_case_no · المكذِّب أكّد 10 ونقض 1 (أُصلح 5).

**البند 65 — partial:** الجدول public.case_notes وسياسات RLS الخاصة به أُنشئت (migration 20260910_case_notes.sql) وأُثبتت بحاضنة Docker (19/19 اختبارًا كما هو متوقع)؛ المسارات الأربعة GET/POST/PATCH/DELETE تعمل فعليًا عبر caseNotesService.ts؛ تبويب «الملاحظات» في ملف قضية المحامي أصبح يعرض مُركّب كتابة حقيقي (خاصة بي/للمكتب) وقائمة ملاحظات محفوظة قابلة للتعديل والحذف بدل رسالة «لا يمكن حفظ ملاحظة من هذا الملف حالياً»، مع **بقي:** الترحيل 20260910_case_notes.sql لم يُطبَّق بعد على قاعدة بيانات الإنتاج ولم يُنشر الكود — حتى يتم ذلك ستفشل الشاشتان الجديدتان على الإنتاج بخطأ «الجدول غير موجود» رغم أن الكود جاهز ومُختبر محليًا. يتطلب الإغلاق الكامل: تشغيل الترحيل على الإنتاج ثم نشر هذا الكود، مطابقةً لنمط بقية ترحيلات هذه الدفعة.

## الإبلاغ عن محتوى المجتمع (بند ٦٩ — نصف)

**الترحيل:** `20260911_community_reports.sql`

**المسارات:** `POST /api/v1/community/reports` · `GET /api/v1/admin/community/reports?status=` · `PATCH /api/v1/admin/community/reports/[id]` · `GET /api/v1/admin/community/moderation`

* زر «إبلاغ» جديد بجانب «حفظ» و«شارك» أعلى كل سؤال في صفحة المجتمع
* زر إبلاغ صغير (أيقونة علم) بجانب زر الإعجاب في كل رد/إجابة
* الضغط على الزر يفتح نافذة صغيرة لاختيار سبب البلاغ (إزعاج، إساءة، معلومات مضلِّلة، طلب تواصل خارج المنصة، سبب آخر) مع حقل تفاصيل اختياري
* الزائر غير المسجّل يرى بدلاً من الزر رابط «سجّل الدخول للإبلاغ» يوصله لصفحة الدخول
* عند نجاح الإرسال: رسالة شكر صريحة؛ عند تكرار الإبلاغ على نفس المحتوى: رسالة «سبق أن أبلغت عن هذا المحتوى» من الخادم نفسه، وليست رسالة مختلقة
* لوحة إشراف المجتمع (الصفحة الحالية غير المُعدَّلة) ستعرض الآن سبب بلاغ حقيقي (مع عدّ البلاغات) للمنشورات التي أُبلغ عنها فعلاً، بدل التخمين الدائم كما كان سابقاً

**التحقق:** 29 اختباراً · حاضنة RLS: Ran via Docker (postgres:16-alpine) using supabase/tests/rls/run.sh against 20260911_community_reports.sql + the new test file: all assertions passed — own inse · المكذِّب أكّد 15 ونقض 1 (أُصلح 5).

**البند 69 — partial:** القسم الثالث من البند ٦٩ — «زر الإبلاغ عن المحتوى» — مبني بالكامل الآن: جدول community_reports (RLS مُختبر عبر Docker)، مسار عام لإرسال البلاغ (409 عند التكرار)، مساران للإدارة (قائمة + تحديث الحالة مع تدقيق admin_audit_events)، وزر «إبلاغ» فعلي في صفحة السؤال وفي كل ردّ، مع رسائل صادقة للزائر والنجاح والتكرار. لوحة إشراف المجتمع تعرض الآن سبب البلاغ الحقيقي عند وجود بلاغات فعلية، مع بقاء النص الم **بقي:** القسم الثاني من البند ٦٩ — «ترحيل مهام الجلسة عند تأجيلها» (AddHearingModal.tsx) — لم يُبنَ في هذه الدفعة إطلاقاً؛ لم تُفتح أو تُعدَّل أي ملفات خاصة به. قسم قفل التزامن (claim_service_request) كان قد أُنجز سابقاً في هجرة 20260908.

## دعوة الزملاء على الخادم وحذف المخزن الوهمي (بندا ٩٨ و١٥١)

**المسارات:** `GET /api/v1/invite/[code]`

* صفحة /invite/[code]: التحقق من كود الدعوة يمر الآن عبر الخادم (لا تخمين محلي)، وتظهر اسم الشخص الذي أرسل الدعوة إن وُجد (بدون بريده أو جواله)
* مدة التجربة المعروضة أصبحت تطابق القيمة الحقيقية من قاعدة البيانات (مثلاً ١٤ يوماً)، بدل الافتراض الدائم لثلاثة أشهر
* إن تعذّر التحقق بسبب خطأ في الخادم تظهر رسالة «تعذّر التحقق من الدعوة» مع زر «إعادة المحاولة»، بدل الادّعاء بأن الرابط غير صالح
* درج «أبلغ عن مشكلة» في المكتبة القانونية (زر عائم): الزائر غير المسجَّل يرى الآن «سجّل الدخول لإرسال البلاغ» بدل نموذج يُرسِله إلى لا مكان؛ المستخدم المسجَّل يرسل بلاغاً حقيقياً يصل لوحة الإدارة، مع حالة «جارٍ الإرسال...» ورسالة خطأ حقيقية إن فشل الإرسال بدل نجاح مصطنع دائماً
* حقل رقم واتساب في نفس الدرج يُحفظ الآن ضمن نص البلاغ (لا يوجد عمود مخصص له في القاعدة)؛ خانة إرفاق الملفات/الصور حُذفت من الدرج لأنها كانت تلتقط الملفات ثم تُسقطها بصمت (لا تخزين خلفي لها)

**التحقق:** 5 اختباراً · حاضنة RLS: لم يُشغَّل. هذه الدفعة لا تضيف أي ترحيل ولا تغيّر أي سياسة RLS على public.invitations — مسار GET الجديد يقرأ فقط عبر service client (يتجاوز RLS بتصميم الجدول نف · المكذِّب أكّد 13 ونقض 2 (أُصلح 5).

**البند 98 — closed:** البند كان مسجَّلاً «✅ مغلق كلياً» بتحفظ صريح: «invitationStore بقي لدعوات الزملاء (نظام آخر) فقط». هذه الدفعة تزيل ذلك التحفظ الأخير — صفحة /invite/[code] ودرج بلاغ المكتبة (الموردان الوحيدان الفعليان لـ invitationStore، تم التحقق بـ grep) أُعيد بناؤهما على GET /api/v1/invite/[code] و feedbackService.submitLibraryIssueReport، ثم حُذف الملف نفسه بعد تأكيد عدم وجود مستورد آخر. **بقي:** لا يوجد. الملف حُذف والمسارين الحقيقيين الوحيدين له أُعيد بناؤهما بالكامل على خدمات سحابية حقيقية.

**البند 151 — partial:** عدد استدعاءات localStorage. في src انخفض من 142 (حسب آخر تحقق) إلى 126 بعد حذف invitationStore.ts (كان يحمل ~9 مواضع قراءة/كتابة محلية: اشتراك المكتبة، الدعوات المقبولة، بلاغات الأعطال). لا تغيير على useClientGroupMembership.ts:21-24 (لا يزال يرجع لـ localStorage في وضع العرض التجريبي) ولا وجود لبنية حفظ تلقائي سحابي Debounced 500ms — كلاهما خارج نطاق الملفات المسندة لهذه الدفعة (98، 151 فقط ضمن ا **بقي:** البند أوسع من نطاق هذه الدفعة: تنظيف useClientGroupMembership.ts وبناء بنية الحفظ التلقائي السحابي (debounce 500ms) يحتاجان ملفات لم تُسنَد لي هنا؛ يبقى 🟡 منفَّذ جزئياً كما كان، مع تقدّم إضافي (16 موضع أقل) وليس إغلاقاً.

## درجات التقاضي في ملف قضية الشركة (بند ٧) — لم تُبنَ: تحتاج قرارك


**التحقق:** 0 اختباراً · حاضنة RLS: Ran supabase/tests/rls/run.sh with migration 20260903_phase1_case_tables.sql plus a new diagnostic test file (supabase/tests/rls/business_case_stages_no_request · المكذِّب أكّد 14.

**البند 7 — unchanged:** لم تُبنَ تبويبة «درجات التقاضي» في ملف قضية الشركات: 1) المسار GET /api/v1/lawyer/case-stages/[caseId] يستخدم assertRole(['lawyer','firm']) فقط (route.ts:105) — أي حساب «شركة/corporate» يُرفَض بخطأ 403 قبل أن تُطبَّق سياسات RLS أصلاً. 2) حتى لو أُضيف «corporate» لتلك القائمة، فسياسة RLS الوحيدة على public.case_stages ("case stages readable by owner or firm", عبر can_access_case_row(owner_user_id,  **بقي:** يبقى إغلاق هذا البند مشروطاً بتغييرين يجب أن يُنفَّذا معاً وليس أحدهما فقط: (أ) توسيع قائمة الأدوار المسموح بها في GET فقط ضمن src/app/api/v1/lawyer/case-stages/[caseId]/route.ts لتشمل 'corporate' (مع إبقاء POST/PATCH كما هما — فلا يجوز لحساب العميل إنشاء درجة تقاضٍ أو تسجيل نتيجة حكم)، و(ب) هجرة (migration) جديدة تضيف سياسة SELECT على public.case_stages تمنح صاحب الطلب (requester_user_id) حق القر

**محجوب:** Add 'corporate' to the GET allow-list of assertRole(['lawyer','firm']) in src/app/api/v1/lawyer/case-stages/[caseId]/route.ts (GET only — never POST/PATCH, a client must not create stages or record co — Outside my owned file (business/cases/[id]/page.tsx only) — this task's scope is a single page component. Also: this change must land together with the migration below, never alone — shipping the API relaxation without the matching RLS policy flips the tab fro

**محجوب:** A new migration adding a SELECT policy on public.case_stages granting read access to the case's requester (service_requests.requester_user_id = auth.uid()), alongside the existing owner-or-firm policy — Requires a new migration file and a data-disclosure decision (whether a corporate client should see judge names, circuit, court case number, and per-degree outcomes — the same fields the firm case file shows a lawyer). That is an owner decision, not hardening,

## نصوص الشركات في مسار الطلبات (بند ٢٢)

* عنوان صفحة «طلباتي» يعرض الآن «طلبات منشأتك» عند تسجيل الدخول بحساب شركة (userType = corporate)، ويبقى «طلباتي» كما هو لحسابات الأفراد — لا تغيير آخر ظاهر على الصفحتين.

**التحقق:** 0 اختباراً · حاضنة RLS: لم يُشغَّل — لا تغيير في قاعدة البيانات أو RLS في هذه المهمة (تعديل نص واجهة فقط في مكوّن عميل React، بلا مسارات API أو جداول متأثرة). · المكذِّب أكّد 8.

**البند 22 — closed:** صفحة «طلباتي» في src/app/dashboard/client/requests/page.tsx أصبحت تعرض «طلبات منشأتك» عند userType === "corporate" و«طلباتي» لحساب فردي — نفس المثال الذي ذكره بند المالك حرفياً. تم فحص كل نص عربي ظاهر في الصفحتين المملوكتين (requests/page.tsx و services/page.tsx)؛ ما عداه من نصوص (الترويسة الفرعية، البحث، شارة «قيّم محاميك»، عناوين الكتالوج في services/page.tsx) كان حيادياً أصلاً ولا يفترض حساباً  **بقي:** لا يوجد شيء متبقٍ داخل الصفحتين المملوكتين. الملاحظة الوحيدة خارج النطاق: كتالوج src/constants/clientServiceCatalog.ts (ملف غير مملوك لهذه المهمة) يتضمن خدمة «قسمة تركة وحصر الورثة» وهي فردية بطبيعتها (إرث/ورثة) لكنها تسمية خدمة عادية ضمن كتالوج مشترك وليست صياغة تخاطب المستخدم بافتراض فرديته — إخفاؤها أو إعادة صياغتها لحسابات الشركات قرار كتالوج/منتج منفصل، ليس بند صياغة نصوص.

## التكامل المستمر (بند ١٥٥)

* لا يوجد أي تغيير مرئي لمستخدمي الموقع — هذه بنية تحتية للتطوير (CI) تعمل في الخلفية عند كل push أو pull request، ولا تظهر في واجهة النظامي.

**التحقق:** 1080 اختباراً · حاضنة RLS: لا ينطبق — هذه المهمة لا تتضمن أي migration أو تغييرًا على RLS، فلم يُشغَّل حصاد Docker لاختبارات RLS. · المكذِّب أكّد 9 ونقض 1 (أُصلح 4).

**البند 155 — partial:** أُضيف .github/workflows/ci.yml يعمل عند push و pull_request إلى main و owner-edits: actions/checkout ثم actions/setup-node (Node 22 + كاش npm) ثم npm ci، فحص الأنواع، اختبارات الوحدة، ثم ESLint — بالإضافة إلى مهمة build منفصلة واختيارية تُشغَّل فقط عند وجود أسرار NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY في مستودع GitHub. أُضيف أيضًا engines:{node:>=22} في package.json. تم التحقق من **بقي:** أمر npm run lint نفسه يفشل حاليًا (7 أخطاء react-hooks/preserve-manual-memoization سابقة وغير متعلقة بهذه المهمة، في ملفات ضمن src/app/dashboard/firm/**)، وبالتالي فإن خطوة lint في CI ستظهر باللون الأحمر على main/owner-edits حتى تُصلَح تلك الأخطاء أو يُخفَّض مستوى القاعدة في eslint.config.mjs — وهو ملف خارج نطاق هذه المهمة (المُخصَّص لي فقط .github/workflows/ci.yml و package.json/engines)، فبقي دو

**محجوب:** npm run lint currently exits 1 (7 real errors) on a clean checkout of main, from react-hooks/preserve-manual-memoization findings in src/app/dashboard/firm/contracts/page.tsx and one other file under  — eslint.config.mjs is not in this task's owned files (only .github/workflows/ci.yml and package.json engines are), so I documented the failure as a comment in ci.yml rather than editing the eslint config. Fixing the 7 findings, or demoting react-hooks/preserve-

## المهام اللاحقة (في اليوم نفسه)

* lint أخضر: أخطاء react-hooks/preserve-manual-memoization السبعة كانت useMemo يدوية على قيمة تأتي من دالة مستوردة (itemsOf) فلا يستطيع مترجم React التحقق منها — حُذفت الـuseMemo في صفحتَي العقود (المكتب والمحامي) وصفحة الاستشارات بنفس نمط القيم المشتقة المجاورة؛ لا eslint-disable ولا تغيير في الإعدادات؛ الناتج نفسه.
* شاشة المشاركة: زرّ «مشاركة برابط» على كل مستند في «مستنداتي» (لا في السلة، ولا في وضع العرض التجريبي) يفتح نافذة بمدّة الصلاحية (٢٤ ساعة/٣ أيام/٧ أيام/٣٠ يوماً) و«حماية بباسكود»؛ الرابط والباسكود يُعرضان مرة واحدة مع زرّ نسخ.
* صفحة إدارية جديدة «بلاغات المجتمع» (/dashboard/admin/community/reports) بفلتر حالة وعدّاد حقيقي وأزرار «تمت المراجعة/رفض/اتُّخذ إجراء»، وشارة «N بلاغ» على صفحة الإشراف؛ التكامل أضاف معرّف المنشور الأصلي لبلاغات الإجابات فصار الرابط يعمل لها أيضاً.

## تصحيح من التكامل
* `resolveClientIp` كان يقرأ **أول** مدخل في `x-forwarded-for` — وnginx على الخادم (`deployment_guide.md:283-284`) يضبط `X-Real-IP $remote_addr` ويُلحق العنوان الحقيقي في **آخر** `X-Forwarded-For`؛ فصار الترتيب: `x-real-ip` ثم آخر مدخل، فلا يستطيع العميل انتحال عنوانه للتهرّب من الحدّ. اختبارات المحدِّد أُعيدت كتابتها (١٤).
* بايت NUL حرفي داخل ثابت في `rateLimit.ts` استُبدل بتسلسل الهروب.

## ما لم يُبنَ عمداً
* بند ٧ (درجات التقاضي لملف قضية الشركة): يحتاج توسيع سماح مسار `case-stages` إلى `corporate` **مع** سياسة قراءة جديدة على `case_stages` لصاحب الطلب — أي **قرار إفصاح**: هل يرى عميل الشركة اسم القاضي والدائرة ورقم القضية ونتيجة كل درجة؟ أُدرج في أسئلة المالك.
* بند ٦٩ — «ترحيل مهام الجلسة المؤجَّلة»: لم يُبنَ.
* كاتب `public.invitations` (من يدعو زميلاً وماذا تمنح الدعوة): قرار منتج.
