# المرحلة ٦ — الإعدادات والخروج من المتصفح: سجل التنفيذ

**التاريخ:** ٢٠٢٦-٠٩-٠٤ (مساءً) · **الفرع:** `main` ثم `owner-edits` · **الترحيل:** [`20260906_phase6_settings_out_of_browser.sql`](../../supabase/migrations/20260906_phase6_settings_out_of_browser.sql) — **شُغِّل على الإنتاج في ٥ سبتمبر ✓ (تحقّق مباشر)**.

**الحالة:** الخطوتان ١ و٢ (الترحيل والمسارات والعقود) مبنيّتان ومُختبَرتان. الخطوة ٣ (الشاشات) تُبنى بعدهما مباشرة — القسم ٧.

## ١ · ما وجدناه قبل الكتابة (قراءة ١٤٢ موضع `localStorage`)

* **الملاحظات اللاصقة والمذكّرات الصوتية (base64 داخل `localStorage`!) وتظليلات القلم** على صفحات
  المواد لا نسخة لها على الخادم — تغيير الجهاز يمحو تعليقات المحامي كلها. جلسات البومودورو، طلبات
  الميزات، نشاط القراءة، بلاغات أخطاء المكتبة: الشيء نفسه.
* «مجلدات القوانين» التي تفترضها الخطة موجودة أصلاً باسم `library.smart_folders` منذ
  20260626 — ينقصها **التثبيت** فقط الذي تحفظه الواجهة محلياً. و`FolderSelectionModal` نسخة
  ثانية كاملة من «حفظ في مجلد» لا تلمس الخادم أبداً حتى للمسجَّلين.
* `research_items.item_type` يقبل ستّ قيم بينما «جامع البحث» يرسل سبعاً أخرى، ولا عمود عنوان —
  **كل حفظ حقيقي كان يفشل**، والخدمة ترسل `title` والمسار يُسقطه صامتاً.
* `profiles` بلا مدينة/جنسية، و`lawyer_profiles` بلا تاريخ إصدار الترخيص/عنوان المكتب — فكان تبويب
  الملف الشخصي في الإعدادات يحفظ إلى `localStorage`، ويجمع **رقم الهوية وتاريخ الميلاد** بلا حاجة.
* المرفقات: حذف نهائي فوري (الصفّ ثم الملف من المتصفح)، لا سلة ولا حجز قانوني (بند ١٨٦).
* `useSubscription.can()` يستشير أعلام مدير وهمية تُقرأ من `localStorage` **في الإنتاج** — أي زائر
  يقلبها في متصفحه.
* `library.invitations` بلا أي كود يقرؤه؛ تدفّق «اشترك/جرّب» في `laws/subscribe` كله على
  `invitationStore` محلي مزيَّف.
* تبويب «المساعدة» يرسل التذكرة إلى لا مكان، رغم وجود `support_tickets` ومسارات الإدارة لها.

## ٢ · ما في الترحيل

| الجدول | ما أُضيف |
|---|---|
| `library.smart_folders` | `is_pinned` (محروس بـ`to_regclass`) |
| `public.law_article_notes` **جديد** | `page_id` فريد لكل مستخدم · `note_text` · `audio_path` (مفتاح كائن في التخزين، **لا base64**) · `strokes jsonb` مصفوفة · `position` · `is_visible`؛ RLS المالك فقط |
| `public.work_sessions` **جديد** | `mode` (focus/short_break/long_break) · `started_at` · `ended_at` · `duration_min` ١..٦٠٠ · `completed` · `task_id` بلا FK (حذف المهمة يُبقي السجل) · `label` |
| `public.research_items` | `title` · `used` · `updated_at` · قيد `item_type` موسَّع بالقيم السبع التي يرسلها الجامع |
| `profiles` / `lawyer_profiles` | `city` · `nationality` / `license_issued_on` · `office_address` — إعدادات الكيانات في `*_profiles.metadata.settings` القائم |
| `public.feature_requests` **جديد** | قراءة/إدراج للمالك، تحديث للمدير |
| `public.library_issue_reports` **جديد** | «أبلغ عن خطأ في هذه المادة» — نفس النمط |
| `public.attachments` | `source` · `deleted_at` · `deleted_by` · `legal_hold` · `hold_reason` · سياسة **تحديث** للمالك/طرفَي الطلب (20260518 أعطت SELECT وINSERT فقط) · قيد **الحجز يمنع الحذف** |

اختبار RLS في Docker: [`phase6_settings_out_of_browser.test.sql`](../../supabase/tests/rls/phase6_settings_out_of_browser.test.sql) — **٢٢ فحصاً خضراء**؛ `stubs.sql` وُسِّع بـ`library.smart_folders` و`research_sessions/items` و`attachments`.

## ٣ · قرارات مسجَّلة

1. **إعادة استخدام لا تكرار:** المجلدات تبقى في `library.smart_folders`؛ إعدادات الكيانات في `metadata.settings`.
2. **لا رقم هوية ولا تاريخ ميلاد** في تبويب الملف (قاعدة المرحلة ٢: الهوية تجزئةً فقط، على بطاقة الموكّل).
3. **حذف المستند = سلة ٣٠ يوماً**، والحجز القانوني يمنعه؛ التفريغ عمل الكرون الساعي (صفّ + كائن)، لا مُحفِّز قاعدة.
4. **المذكّرات الصوتية ملفات** في التخزين تحت مجلد المستخدم.
5. **يبقى في المتصفح عمداً:** السمة، حالة السايدبار، لافتة مُغلقة. **وضع اللوحة (مبسّطة/كاملة) لا** — يُكتب في `display_mode` عبر التفضيلات.
6. أعلام المدير تبقى مبدّل عرض تجريبي؛ **الإنتاج يحكم بالاستحقاقات الحقيقية فقط**.

## ٤ · العقود كُتبت أولاً بيدنا

[`articleNotesService.ts`](../../src/lib/services/articleNotesService.ts) · [`workSessionsService.ts`](../../src/lib/services/workSessionsService.ts) · [`feedbackService.ts`](../../src/lib/services/feedbackService.ts) · [`preferencesService.ts`](../../src/lib/services/preferencesService.ts) (`readingActivity` · `recentSessions` · `dashboardMode` فقط) · [`profileSettingsFields.ts`](../../src/lib/services/profileSettingsFields.ts) (+اختبار: لا حقل هوية/ميلاد لأي نوع؛ كل حقل له هدف حقيقي `profile` / `lawyer` / `entitySettings`).

## ٥ · المسارات — تسعة بنّائين ومكذِّب لكل واحد

| المهمة | المسارات | ملاحظات |
|---|---|---|
| التفضيلات | `PATCH /api/v1/settings/preferences` | مفاتيح مسموحة فقط (غيرها 400)؛ دمج سطحي **لا يمسّ** `preferences.notifications`؛ `dashboardMode` يُكتب أيضاً في `lawyer_profiles`/`firm_profiles.display_mode`. ١٣ اختباراً |
| ملاحظات المواد | `GET/PUT/DELETE /api/v1/library/notes` · `GET …/notes/audio-url` | `audioPath` يجب أن يبدأ بـ`<uid>/notes/`؛ رابط موقَّع ٣٠٠ ثانية بعد قراءة RLS. ٤٢ اختباراً |
| جلسات العمل | `GET/POST /api/v1/lawyer/work-sessions` · `DELETE …/[id]` | نطاق التاريخ بيوم الرياض. ٩ اختبارات |
| طلبات الميزات والبلاغات | `GET/POST /api/v1/feature-requests` · `GET/PATCH /api/v1/admin/feature-requests[/[id]]` · `POST /api/v1/library/issue-reports` · `GET/PATCH /api/v1/admin/library-issue-reports[/[id]]` | ٣١ اختباراً |
| المجلدات والبحث | `GET/PATCH /api/library/folders` (+`isPinned`) · `POST …/sessions/[id]/items` و`POST …/desktop` (يحفظان `title`) · `GET /api/v1/research/items?used=` · `PATCH/DELETE /api/v1/research/items/[id]` | `researchService` يستخدم الخادم في وضع Supabase لـ`markUsed`/`updateItem`/`removeFromInbox`/`getUnused*` — **صارت غير متزامنة** (القسم ٦) |
| المستندات | `DELETE /api/v1/documents/[id]` (**حذف ناعم**؛ `?permanent=1` من السلة فقط) · `GET …?trash=1` · `POST …/[id]/restore` · `PATCH …/[id]/hold` · خطوة **PURGE** في `cron/deadlines` | القوائم الأخرى للمرفقات (ملف القضية، الطلب) تستثني المحذوف؛ `documentService` +`getTrash`/`restoreDocument`/`purgeDocument`/`setLegalHold`. ٥٩٤ اختباراً في الحزمة |
| دعوات المكتبة | `POST /api/v1/library/invitations/redeem` · `GET/POST /api/v1/admin/library-invitations` | عميل الخدمة بـ`.schema('library')`؛ الاستهلاك ذرّي؛ المنحة `grantEntitlement({action:'plan', tier:'pro', durationDays:30})`. **لا سجل استرداد لكل مستخدم** في الجدول: كود متعدّد الاستخدام يمكن استرداده مراراً من الحساب نفسه — قصور في الشكل الحالي، مسجَّل |
| البوّابة | — | `resolveFeatureAccess()` في [`featureAccess.ts`](../../src/hooks/featureAccess.ts): **في الإنتاج تُتجاهَل أعلام المدير المحلية** ويحكم المستوى وحده. `useSubscription` **CRITICAL** بالأثر — التغيير تضييق محروس (الكتلة كانت لا تُعيد إلا `false`، فحذفها لا يُخفي شيئاً جديداً). ٨ اختبارات |
| التذاكر | `GET/POST /api/v1/tickets` | الجدول الحقيقي `support_tickets` (20260706) لا `tickets`؛ `ticketsService` |

## ٦ · التحقق

* `impact()` قبل كل رمز موجود — كلها LOW/بلا مستدعين إلا `useSubscription` (CRITICAL، أعلاه)
  و`deleteDocument` (خمس صفحات مستندات؛ التوقيع ثابت، فقط لم تعد تحذف الكائن).
* **المكذِّبون:** ملاحظات المواد — ادّعاء «مطابقة كاملة للعقد» نُقض (٥ فروق أُصلحت)؛ المجلدات
  والبحث — **حاجب**: توقيعات `getUnused`/`getUnusedCount`/`getDesktopUnusedCount` تغيّرت من
  متزامنة إلى `Promise` (٦ إصلاحات؛ **مستدعوها في الشاشات يُكيَّفون في الخطوة ٣**)؛ دعوات
  المكتبة — «التراجع عن الاستهلاك عند فشل المنحة» نُقض ثم أُصلح، وبقي سباقٌ نظري بين استردادين
  متزامنين مسجَّلاً؛ البوّابة — **خمسة ملفات صفحات تقرأ أعلام المدير الخام مباشرة** متجاوزةً
  `can()` (خارج نطاق المسارات — الخطوة ٣).
* `npx tsc --noEmit` نظيف · `npm run test:unit` **٨٥٤/٨٥٤** بعد اكتمال الدفعات الثلاث المتزامنة.
* `detect_changes()` على الشجرة المشتركة: CRITICAL (١٥٣ رمزاً) — مجموع الموجة ٢ والمرحلتين ٧ و٦ معاً.

## ٧ · ما بقي — الخطوة ٣ (الشاشات)

تبويبات الإعدادات كلها (الملف الشخصي على الحقول الحقيقية — يتطلّب توسيع `PATCH /api/v1/profile`
بـ`nationality`/`license_issued_on`/`office_address`/`metadata.settings`، الأمان والخصوصية على
`user_settings`، الامتثال والتفويض بلا حالات مخترَعة، الفريق على أعضاء المكتب، المهنة على
`lawyer_profiles`) · الملاحظات اللاصقة والصوت والتظليل إلى `articleNotesService` · البومودورو إلى
`workSessionsService` · لافتة طلب الميزة وصفحتا الإدارة و«أبلغ عن خطأ» · نشاط القراءة والجلسات
الأخيرة ووضع اللوحة إلى التفضيلات · `FolderSelectionModal` والتثبيت إلى المجلدات · مستدعو البحث
غير المتزامنون · سلة المستندات والحجز على الصفحات الخمس · صفحة الاشتراك ولافتة الدعوة على الخادم
· الملفات الخمسة التي تتجاوز البوّابة · تبويب المساعدة إلى التذاكر.

## ٨ · الخطوة ٣ — الشاشات (٢٠٢٦-٠٩-٠٤ ليلاً)

عشرة بنّائين على ملفات منفصلة ثم كنسٌ للبوّابة بعد حاجز، ومكذِّب لكل واحد ومُصلِح لما نُقض
(٢٩ وكيلاً). القاعدة المُختبَرة في كل ملف: **بعد المهمة، بيانات المستخدم المسجَّل على الخادم**؛
ما بقي في المتصفح مُبرَّر سطراً سطراً (زائر بلا حساب · وضع العرض التجريبي · السمة والسايدبار).

### تبويبا «الملف الشخصي» و«بيانات الكيان»

**الملفات:** `route.ts` · `ProfileTab.tsx` · `EntitySettingsTab.tsx` · `profileEntityFields.ts` · `profileEntityFields.test.ts` · `profileFormTransform.ts` · `profileFormTransform.test.ts`

* في «الملف الشخصي»: الحقول الحقيقية فقط لكل نوع حساب (لا رقم هوية ولا تاريخ ميلاد)؛ حقل «الجنسية» وللمحامي «تاريخ إصدار الترخيص» و«عنوان المكتب» أصبحت تُحفظ فعلياً.
* البريد الإلكتروني و«تاريخ انتهاء الترخيص» (للمحامي) يظهران للقراءة فقط مع ملاحظة أنهما غير قابلين للتعديل من هذه الصفحة حالياً.
* زر «حفظ التغييرات» يرسل طلباً حقيقياً للخادم؛ عند النجاح تظهر «تم الحفظ»، وعند الفشل تظهر رسالة خطأ عربية تحت الحقول والزر يبقى قابلاً للمحاولة.
* إن فشل تحميل البيانات عند فتح الصفحة، يبقى زر الحفظ معطّلاً كي لا تُكتب بيانات فارغة فوق بيانات محفوظة فعلاً.
* لا يوجد زر «تغيير الصورة» وهمي بعد الآن — فقط ملاحظة صادقة أن رفع الصورة غير متاح.
* في «إعدادات الكيان» لحساب شركة (corporate): اسم الشركة الرسمي، رقم السجل التجاري، اسم الممثل النظامي، وقائمة اختيار «صفة الممثل النظامي» — كلها تُحمَّل من الخادم وتُحفظ في جدول الشركة الحقيقي.
* في «إعدادات الكيان» لمكتب/منشأة/جهة/جمعية: حقول تواصل (عنوان، هاتف، بريد، موقع، سجل تجاري حيث ينطبق) تُحفظ فعلياً في إعدادات الكيان على الخادم بدل عدم الحفظ إطلاقاً كما كان سابقاً.
* لم يعد هناك زر حفظ لا يفعل شيئاً («لم تُحفظ هذه البيانات») في تبويب إعدادات الكيان — الحفظ حقيقي الآن، وفي وضع العرض التجريبي فقط تظهر رسالة أن الحفظ محلي مؤقت.

**التحقق:** 58 اختباراً · المكذِّب أكّد 12 ادّعاءً ونقض 2 (أُصلح 6).

**بقي مسجَّلاً:** EntitySettingsTab.tsx's own submit (entitySettings/businessProfile) is not diff-aware. · Whether useUser().userType can ever disagree with the DB-authoritative profile.user_type the route routes on (which would make the new lawyer-null Save gate a false positive).

### تبويبا «الأمان» و«الخصوصية»

**الملفات:** `SecurityTab.tsx` · `PrivacyTab.tsx` · `_securityFields.ts` · `_securityFields.test.ts` · `_privacyFields.ts` · `_privacyFields.test.ts`

* تبويب الأمان: اختفى مفتاح «التحقق بخطوتين (OTP)» ومفتاحا البصمة وتنبيه الجهاز الجديد نهائياً — لا وجود لأي منها بعد الآن.
* تبويب الأمان: تغيير كلمة المرور أصبح حقيقياً — حقل كلمة مرور جديدة (٨ أحرف على الأقل) وحقل تأكيد، مع رسائل خطأ عربية عند عدم التطابق أو القصر، وزر يعرض «جاري التحديث...» ثم «تم التحديث» فعلياً عبر حساب المستخدم.
* تبويب الأمان: قسم «مهلة الجلسة» الجديد يعرض قائمة اختيار (١٥ دقيقة إلى ٢٤٠ دقيقة) وزر «حفظ» — الاختيار يُحفظ في قاعدة البيانات ويبقى بعد إعادة تحميل الصفحة، مع توضيح أنه تفضيل مخزَّن وليس إنهاءً تلقائياً فعلياً للجلسة.
* تبويب الأمان: جدول الجلسات النشطة وجدول سجل تسجيلات الدخول (كانا بيانات وهمية ثابتة) استُبدلا برسالة صادقة: «سجل الجلسات وسجل الدخول غير متاحين على المنصّة بعد».
* تبويب الأمان: «حذف الحساب» لم يعد نموذجاً يطلب كتابة كلمة التأكيد — أصبح رسالة صريحة بأن الحذف يحتاج تواصلاً مع الدعم، مع رابط فعلي لصفحة /contact.
* تبويب الخصوصية: أربعة مفاتيح فقط الآن (بدل ٣-٤ مفاتيح وهمية لكل نوع حساب) وهي مرتبطة بأعمدة حقيقية في قاعدة البيانات، تُحمَّل من الخادم ولا تبدأ مفعّلة افتراضياً في الذاكرة أبداً.
* تبويب الخصوصية: لحسابات الشركات والجمعيات، المفتاح الأول يظهر بعنوان «الموافقة على معالجة البيانات (PDPL)» ولا يظهر مفعّلاً إلا إذا كانت موافقة محفوظة فعلياً على الخادم.
* تبويب الخصوصية: قسم «حقوق البيانات» (تحميل البيانات، طلب الحذف، سياسة الخصوصية) لم يعد أزراراً بلا وظيفة — أصبح رسالة صادقة بأن التحميل والحذف يحتاجان تواصلاً مع الدعم (رابط /contact) بينما رابط سياسة الخصوصية يفتح /privacy فعلياً.
* تبويب الخصوصية: زر «حفظ إعدادات الخصوصية» يحفظ فعلياً عبر GET/PUT ويعرض «تم الحفظ» فقط بعد نجاح الحفظ الحقيقي.

**التحقق:** 27 اختباراً · المكذِّب أكّد 19 ادّعاءً ونقض 1 (أُصلح 2).

**محجوب:** 

### تبويبات «الامتثال» و«التفويض» و«الفريق» و«المهنة»

**الملفات:** `ComplianceTab.tsx` · `DelegationTab.tsx` · `TeamManagementTab.tsx` · `ProfessionTab.tsx`

* تبويب الامتثال (Compliance) في الإعدادات صار لوحة واحدة صادقة تقول إنه لا يوجد محرك امتثال (لا PDPL، لا ZATCA، لا SAMA، لا سياسة احتفاظ بالبيانات، لا موعد مراجعة) — اختفت الوحدات الخمس المزيفة وسنة الاحتفاظ الوهمية والتاريخ الثابت 1447/12/01.
* تبويب التفويض (Delegation) صار لوحة واحدة صادقة تقول إنه لا توجد آلية تفويض صلاحيات حقيقية — اختفى المُفوَّضان الوهميان (نورة العتيبي، عبدالعزيز الحربي) ونموذج «تفويض جديد» وزر الإلغاء.
* تبويب إدارة الفريق (Team) لحساب مكتب المحاماة (firm) يعرض الآن الأعضاء الحقيقيين من public.firm_members (الاسم، الدور، الحالة: نشط/بانتظار القبول/معلَّق/مُزال) مع زر يفتح صفحة الفريق الحقيقية /dashboard/firm/team لأي دعوة أو تعديل؛ حساب لا يملك مكتباً (موظف غير المالك) يرى رسالة تعذّر تحميل صادقة بدل قائمة فارغة مضلِّلة؛ كل حساب آخر (محامٍ، شركة، جهة حكومية، جمعية) يرى لوحة صادقة تقول إن لا جدول أعضاء مماثل له بعد — اختفت الأسماء المزيفة الخمسة عشر ونموذج الدعوة المحلية وعبارة «الرابط وهمي».
* تبويب المهنة (Profession) لحساب محامٍ يقرأ الآن إعداداته الفعلية من الخادم (الظهور في السوق، قبول عملاء جدد، إظهار بيانات التواصل، التخصصات، السعر بالساعة) ويحفظها فعلياً عبر PATCH /api/v1/profile؛ حساب غير محامٍ يرى لوحة صادقة توضّح أن هذه الإعدادات لحسابات المحامين فقط — اختفت أزرار Pro Bono والطلبات الفورية ومدة الاستشارة ومناطق التغطية وساعات العمل التي لم يكن لها عمود في قاعدة البيانات.

**التحقق:** لا اختبارات وحدة (تعديلات عرض) · المكذِّب أكّد 9 ادّعاءً.

### الملاحظات اللاصقة والصوت والتظليل على صفحات المواد

**الملفات:** `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\components\ResearchWorkspace.tsx` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\components\CanvasHighlighter.tsx` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\components\StickyNotesManager.tsx` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\app\laws\components\MyNotesSection.tsx` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\hooks\useArticleNote.ts` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\lib\services\articleNoteLocalMigration.ts` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\lib\services\articleNoteLocalMigration.test.ts`

* عند فتح صفحة نظام أو أمر أو مبدأ قضائي أو كتاب فقهي وأنت مسجّل دخول، تظهر أدوات البحث (ملاحظة / تظليل / ممحاة) فوراً دون شاشة فارغة أثناء الاتصال بالخادم — لكن الأزرار تبقى معطّلة لثوانٍ قليلة حتى تُحمَّل ملاحظتك المحفوظة، تفادياً لفقدان أي تعديل سريع.
* أي ملاحظة أو تظليل أو تسجيل صوتي كتبته سابقاً في المتصفح (قبل تسجيل الدخول) على صفحة ما، يُنقل تلقائياً إلى حسابك في أول زيارة موقّعة لنفس الصفحة، ويختفي من تخزين المتصفح بعد نجاح النقل فقط.
* كل تعديل على الملاحظة (النص، الموضع، التظليلات) يُحفظ في السحابة تلقائياً بعد نحو ٠٫٨ ثانية من التوقف عن الكتابة، من دون أي زر حفظ — صف واحد لكل صفحة كما هو مطلوب.
* تسجيل صوتي جديد يُرفع إلى السحابة فور إيقاف التسجيل (مع مؤشّر «جارٍ الحفظ...»)، وتشغيله يطلب رابطاً جديداً في كل مرة بدل الاعتماد على رابط قديم قد تنتهي صلاحيته أثناء جلسة قراءة طويلة.
* صفحة «ملاحظاتي» في مكتبة الأنظمة تعرض الآن ملاحظات حسابك الحقيقية (لا محتوى المتصفح) عند تسجيل الدخول، مع حالة «جارٍ التحميل» وحالة «تعذّرت قراءة ملاحظاتك» ومعها زر إعادة المحاولة عند فشل الاتصال — بدل عرض القائمة فارغة بشكل مضلّل عند فشل القراءة.
* الزائر غير المسجّل دخول: لا تغيير مطلقاً — ملاحظاته وتظليلاته تبقى في متصفحه فقط، تماماً كما كانت قبل هذه المرحلة.
* أداة «الملاحظات اللاصقة المتعددة» غير المستخدمة في أي صفحة من صفحات الموقع (StickyNotesManager) أُزيلت من المشروع.

**التحقق:** 66 اختباراً · المكذِّب أكّد 10 ادّعاءً ونقض 1 (أُصلح 7).

**بقي مسجَّلاً:** In the degraded signed-in state (hydrated=true, canWrite=false -- getArticleNote() threw, or migration failed), the note popup's textarea/position/visibility/strokes controls stay interactive: the user can keep editing w

### سجل البومودورو

**الملفات:** `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\app\dashboard\lawyer\tasks\_components\_pomodoro\storage.ts` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\app\dashboard\lawyer\tasks\_components\_pomodoro\sessionMapping.ts` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\app\dashboard\lawyer\tasks\_components\_pomodoro\sessionMapping.test.ts` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\app\dashboard\lawyer\tasks\_components\PomodoroPanel.tsx`

* محامٍ مسجّل دخول في وضع supabase: تبويبات الإحصاء والتحليل والسجل وشارة المستوى تعرض الآن جلسات البومودورو الحقيقية المحفوظة على الخادم (work_sessions)، لا التخزين المحلي.
* عند فتح لوحة المهام لأول مرة بعد هذا التحديث، تظهر رسالة «جاري تحميل سجل الجلسات…» لثوانٍ قبل ظهور الأرقام الحقيقية — بدل ظهور شارة «نحاس» أو صفر إحصاءات وهمية أثناء التحميل.
* إذا تعذّر الاتصال بالخادم، تظهر رسالة «تعذّر تحميل سجل الجلسات.» مع زر «إعادة المحاولة» بدل عرض سجل فارغ يوهم بعدم وجود جلسات.
* عند إكمال فترة تركيز أو استراحة (أو الضغط على إعادة الضبط بعد ٥ دقائق فأكثر)، تُرسَل الجلسة تلقائياً إلى الخادم وتظهر فوراً في كل التبويبات دون إعادة تحميل الصفحة.
* إن كانت هناك جلسات قديمة محفوظة في متصفح المحامي من قبل هذا التحديث، تُرحَّل مرة واحدة تلقائياً إلى الخادم عند أول دخول، ثم تُحذف من المتصفح.
* إن فشل حفظ فترة واحدة على الخادم (انقطاع شبكة مثلاً)، يظهر سطر تنبيه صغير في تبويب السجل: «تعذّر حفظ إحدى الفترات على الخادم.» بدل إخفاء الفشل بصمت.
* إن كان لدى المحامي أكثر من ٥٠٠ جلسة على الخادم، يظهر إشعار اقتطاع صادق فوق السجل بدل عرض إحصاءات ناقصة دون تنبيه.
* في وضع العرض التجريبي (demo) أو لزائر غير مسجّل الدخول، لا شيء تغيّر عملياً — السجل المحلي في المتصفح كما كان قبل هذا التحديث.

**التحقق:** 17 اختباراً · المكذِّب أكّد 14 ادّعاءً.

**محجوب:** The engine's own completion event (inside usePomodoroEngine.ts, not an owned file) could not be changed to call the async recordWorkSession directly at the mome

### طلبات الميزات · تذاكر الدعم · صفحتا الإدارة

**الملفات:** `FeatureRequestBanner.tsx` · `HelpTab.tsx` · `page.tsx` · `page.tsx` · `AdminSidebar.tsx`

* الشريط الجانبي في كل لوحات التحكم: بطاقة «💡 عندك فكرة جديدة؟» تُرسل الآن الطلب فعلياً للخادم (submitFeatureRequest)، مع رسالة خطأ حقيقية إن فشل الإرسال بدل نجاح وهمي.
* نفس البطاقة تعرض قسم «طلباتي» بحالات حقيقية من الخادم (جديد/مخطَّط له/نُفِّذ/اعتُذر عنه) بدل القائمة المحفوظة محلياً سابقاً؛ وتعرض «تعذّر تحميل طلباتك» مع زر إعادة محاولة عند فشل القراءة.
* زائر غير مسجّل يفتح البطاقة فيرى سطر «سجّل الدخول لإرسال فكرتك» وزر دخول بدل النموذج.
* تبويب المساعدة في الإعدادات (HelpTab): نموذج تذكرة الدعم يضيف حقل «التصنيف» المطلوب، ويرسل فعلياً عبر ticketsService.submitTicket؛ «تم الإرسال!» لا يظهر إلا بعد رد الخادم، ورسالة خطأ حقيقية عند الفشل.
* أسفل نموذج التذكرة قسم جديد «تذاكري» يسرد تذاكر المستخدم الحقيقية من الخادم بحالتها (مفتوحة/قيد المتابعة/تم الحل/مغلقة)، مع حالة تحميل، حالة تعذّر القراءة مع إعادة محاولة، وحالة فارغة صادقة.
* صفحة أدمن جديدة «طلبات الميزات» (/dashboard/admin/feature-requests): تعرض كل طلبات المستخدمين الأحدث أولاً مع فلتر حالة، وتسمح بتغيير الحالة وإضافة ملاحظة تنفيذ تُحفظ عبر PATCH فعلي.
* صفحة أدمن جديدة «بلاغات المكتبة» (/dashboard/admin/library-issue-reports): تعرض بلاغات «أبلغ عن خطأ في هذه المادة» الأحدث أولاً مع فلتر حالة وتغيير حالة فعلي.
* الشريط الجانبي للأدمن (AdminSidebar) يضيف رابطين جديدين فقط: «طلبات الميزات» تحت قسم النظام، و«بلاغات المكتبة» تحت قسم المنصة والمحتوى.

**التحقق:** 27 اختباراً · المكذِّب أكّد 13 ادّعاءً ونقض 1 (أُصلح 1).

### نشاط القراءة · القراءات الأخيرة · وضع اللوحة · «أبلغ عن خطأ»

**الملفات:** `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\app\laws\[slug]\page.tsx` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\app\laws\components\GamificationCard.tsx` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\components\dashboard\SharedSidebar.tsx` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\components\laws\ReportArticleIssueButton.tsx` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\lib\services\readingActivityStats.ts` · `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\src\lib\services\readingActivityStats.test.ts`

* في صفحة مادة نظام (laws/[slug])، للمستخدم المسجّل: عدّاد النشاط (الأنظمة/المواد المستعرَضة أسبوعياً وشهرياً) يُقرأ ويُحفظ الآن على حسابه في السيرفر بدل متصفحه — يبقى محفوظاً عند تغيير الجهاز أو مسح بيانات المتصفح.
* الجلسات الأخيرة (آخر الأنظمة التي فتحها) لنفس صفحة المادة تُحفظ أيضاً على حساب المستخدم المسجّل بنفس الطريقة؛ الزائر غير المسجَّل يبقى محفوظاً في متصفحه فقط كما كان.
* زر جديد «أبلغ عن خطأ في هذه المادة» يظهر في شريط أدوات صفحة المادة (بجانب وضع القراءة وحجم الخط) — يفتح نافذة صغيرة لاختيار نوع الخطأ وكتابة الوصف وإرساله؛ الزائر غير المسجَّل يرى «سجّل الدخول لإرسال البلاغ» بدل النموذج.
* بطاقة «نشاطك القانوني المعتمد» في فهرس المكتبة (GamificationCard) لم تعد تعرض أرقاماً مختلَقة (٣ أنظمة، ١٢ مادة...) عندما لا يوجد نشاط فعلي — تعرض أصفاراً حقيقية بدلاً من ذلك، واختفت شارة «+12% عن الأسبوع الماضي» وسطر «نشاط مستمر: ٤ أيام متتالية» من البطاقة ومن صورة المشاركة القابلة للتنزيل، لأن الرقمين لم يكونا محسوبين من أي بيانات فعلية.
* تبديل «مبسّطة / كاملة» في القائمة الجانبية للوحات المحامي والمكتب يُحفظ الآن على حساب المستخدم المسجَّل في السيرفر — يفتح بنفس الاختيار من أي جهاز يسجّل عليه دخوله؛ في وضع العرض التجريبي (demo) يبقى الاختيار في الجلسة الحالية فقط دون حفظ.

**التحقق:** 8 اختباراً · المكذِّب أكّد 14 ادّعاءً.

### المجلدات والتثبيت · مستدعو البحث

**الملفات:** `FolderSelectionModal.tsx` · `SmartFolders.tsx` · `smartFolderApiMapper.ts` · `smartFolderApiMapper.test.ts` · `DesktopPanel.tsx` · `SessionsPanel.tsx` · `StepLaws.tsx`

* في نافذة "إضافة المستند للمجلدات" (تظهر من صفحة نظام/مبدأ/كتاب/أمر) لمستخدم مسجّل الدخول: تُعرض مجلداته الحقيقية من الخادم، ويمكنه إنشاء مجلد وإضافة المستند الحالي إليه أو حذفه منه، وتنعكس التغييرات فوراً في قسم "مجلداتي" بصفحة الأنظمة دون تحديث الصفحة.
* قسم "جلساتك وقراءاتك الأخيرة" داخل نافذة إضافة المستند يعرض لمستخدم مسجّل الدخول قراءاته الأخيرة كما هي محفوظة على حسابه، لا كما خزّنها هذا المتصفح فقط.
* تثبيت مجلد (📌) في "مجلداتي" وهو مسجّل الدخول يبقى محفوظاً على حسابه — يظهر التثبيت نفسه من جهاز آخر بعد تسجيل الدخول، لا يختفي عند تنظيف المتصفح.
* إن تعذّر تحميل مجلداته من الخادم، تظهر رسالة "تعذّرت قراءة مجلداتك" مع زر إعادة المحاولة بدل قائمة فارغة أو بيانات قديمة من المتصفح.
* زر "مُميَّز كـ مستخدم" في تبويبي الديسك توب والجلسات بمُجمِّع الأبحاث، وزر إضافة العناصر المحددة للنص في خطوة "النصوص النظامية" بمولّد المذكرات: كل منها ينتظر الآن تأكيد الخادم قبل تحديث القائمة، فلا يعود العنصر يظهر أحياناً غير مميَّز بعد إعادة تحميل سريعة.
* المستخدم الزائر (غير المسجّل) لا يتغيّر شيء عنده — مجلداته وقراءاته الأخيرة تبقى في متصفحه كما كانت.

**التحقق:** 6 اختباراً · المكذِّب أكّد 13 ادّعاءً ونقض 3 (أُصلح 5).

**بقي مسجَّلاً:** src/hooks/useUser.ts was edited (logout()'s supabase branch) even though it is not in this task's named files. · researchService.ts's own header comment documents an unresolved race: `removeFromInbox(id); reload();` (and the equivalent for markUsed/updateItem) in DesktopPanel.tsx / SessionsPanel.tsx fires the write and the re-fetch · After gating createFolderLocally/addItemLocally's localStorage writes to guests only (part of the finding-2 fix), a signed-in user whose folder-create or item-add request fails now sees the folder/item appear in the UI v · SmartFolders.tsx's own 'Manage Folder Content' modal reads nzamy_recent_sessions from localStorage unconditionally (not gated by isAuthenticated), unlike FolderSelectionModal.tsx which correctly branches to getPreference

**محجوب:** DesktopPanel.tsx's handleDelete/handleDeleteSel (removeFromInbox) and SessionsPanel.tsx's handleDelete/handleDeleteSel (removeFromInbox) and handleSaveItemEdit 

### سلة المستندات والحجز القانوني

**الملفات:** `DocumentsTrashPanel.tsx` · `_trashCopy.ts` · `_trashCopy.test.ts` · `page.tsx` · `page.tsx` · `page.tsx` · `page.tsx` · `page.tsx`

* في الصفحات الخمس لصفحة «مستنداتي/المستندات»، ظهر قسم أو تبويب جديد باسم «سلة المحذوفات» يعرض المستندات المحذوفة مع تاريخ الحذف بالأرقام العربية («حُذف في ١٥ أغسطس ٢٠٢٦»)، وزرّي «استعادة» و«حذف نهائي» (الأخير يطلب تأكيداً صريحاً بأنه لا يمكن التراجع عنه)
* نص تأكيد الحذف في صفحة العميل والمنشأة أصبح: «سيُنقل إلى السلة ويُحذف نهائياً بعد ٣٠ يوماً» بدلاً من «لا يمكن التراجع»
* صفحة المحامي: أضيف زر حذف حقيقي (لم يكن موجوداً إطلاقاً) ينقل المستند إلى السلة بنفس الرسالة، وزر «حجز قانوني» جديد بجانب كل مستند يسأل عن السبب (اختياري) ويمنع حذف المستند طالما الحجز فعّال، مع شارة صفراء «حجز قانوني» تظهر على المستند المحجوز
* صفحة المنشأة (business): عند استعادة مستند من السلة كان مرتبطاً بطلب خدمة، تظهر رسالة توضح أنه لن يظهر في خزنة المنشأة وتوجّه المستخدم لملف الطلب، بدل أن يبدو أن الاستعادة لم تفعل شيئاً
* صفحة الأعمال الصغيرة (micro): أُزيل زر حذف كان بلا أي وظيفة (لا استدعاء عند الضغط) من نافذة تفاصيل الملف، واستُبدل بقسم سلة محذوفات حقيقي
* صفحة المكتب (firm): أُضيف قسم سلة محذوفات حقيقي أسفل القائمة الوهمية الحالية (القائمة نفسها لا تزال بيانات تجريبية ولم تُغيَّر)

**التحقق:** 18 اختباراً · المكذِّب أكّد 20 ادّعاءً.

**محجوب:** Legal-hold toggle on firm/documents/page.tsx's main list — task asked for it explicitly on lawyer AND firm pages. · Delete-copy update on firm and micro pages' main lists. · Micro page's fabricated storage quota bar (‌«٦.٥ م.ب / ١٠٠ م.ب») and dead «تحميل الملف» button in the detail modal.

### اشتراك المكتبة وكود الدعوة

**الملفات:** `page.tsx` · `InvitationBanner.tsx` · `InvitationModal.tsx` · `AdminSidebar.tsx` · `page.tsx` · `libraryInvitationDisplay.ts` · `libraryInvitationDisplay.test.ts`

* في صفحة اشتراك المكتبة (/laws/subscribe) اختفت عبارة «٣ دعوات لزملائك (تجربة … لكل دعوة)» من مزايا كل باقة — لم تكن هذه الميزة موجودة فعلياً على أي خادم.
* مستخدم مسجّل دخول بباقة أقل من Pro يرى زر «لديك كود دعوة؟ فعّله هنا» أسفل قائمة الباقات في صفحة الاشتراك، وشريطاً مشابهاً «لديك كود دعوة للمكتبة القانونية؟» أعلى صفحة /laws — كلاهما يفتح نفس نافذة تفعيل الكود.
* زائر غير مسجّل يضغط أي باقة مدفوعة يرى تنبيه «يلزم تسجيل الدخول للاشتراك في المكتبة» ثم يُنقل تلقائياً لصفحة تسجيل الدخول — بدل إنشاء اشتراك وهمي محلي وعرض ٣ روابط دعوة مزيفة كما كان يحدث سابقاً.
* عند إدخال كود صحيح في نافذة التفعيل تظهر رسالة صادقة من نوع «فُعّلت باقة Pro حتى ٤ أكتوبر ٢٠٢٦» (أو بدون تاريخ إن لم يُعِد الخادم واحداً)، مع زر «تحديث الوصول الآن» يعيد تحميل الصفحة لتفعيل الوصول فعلياً.
* عند إدخال كود خاطئ أو منتهي أو مستنفد تظهر رسالة الخادم العربية نفسها (مثل «كود الدعوة غير صالح» أو «انتهت صلاحية كود الدعوة»)، لا رسالة مخترعة.
* في وضع العرض التجريبي (demo) لا يظهر زر تفعيل الكود لا في الشريط ولا في صفحة الاشتراك، لأن التفعيل لا يمكن أن ينجح هناك أصلاً.
* صفحة إدارة جديدة «أكواد دعوة المكتبة» في لوحة تحكم الأدمن (رابط جديد أسفل قسم «الإعدادات» في القائمة الجانبية) تعرض جدول الأكواد: الكود، الاستخدام (مستخدَم/الحد الأقصى)، تاريخ الانتهاء أو «بلا انتهاء»، الحالة (نشط/مستنفد/منتهي)، تاريخ الإنشاء، وزر نسخ لكل كود يُظهر «تم النسخ» أو يبلّغ صراحة عن فشل النسخ.
* زر «كود جديد» في نفس الصفحة يفتح نموذجاً لإنشاء كود بحد أقصى للاستخدامات (١–١٠٠٠)، تاريخ انتهاء اختياري، وكود مخصص اختياري — ينجح أو يعرض رسالة الخادم العربية عند الرفض.

**التحقق:** 6 اختباراً · المكذِّب أكّد 16 ادّعاءً ونقض 1 (أُصلح 2).

**محجوب:** Delete src/lib/invitationStore.ts

### الصفحات التي كانت تتجاوز بوّابة الاشتراك

**الملفات:** `featureAccess.ts` · `featureAccess.test.ts` · `page.tsx` · `FirmProfileReadinessPanel.tsx` · `SectorProfileReadinessPanel.tsx`

* في صفحة «إدارة الفريق» بالشركات: قائمة الموظفين وبطاقة «الإدارة القانونية مفوضة خارجياً» تعتمدان الآن على صلاحية الاشتراك (can) بدل قراءة إعداد المتصفح المحلي مباشرة — في وضع الإنتاج لا يغيّر أي تعديل في LocalStorage من يظهر من الأدوار القانونية أو ظهور بطاقة السوق الخارجي.
* في لوحتي «جاهزية بروفيل المكتب» و«جاهزية القطاع» (تظهر داخل: /dashboard/firm, /dashboard/business, /dashboard/government, /dashboard/ngo, /dashboard/micro): قائمة «الخدمات/الأسطح المفعّلة» أصبحت تُقرأ من can() لا من إعدادات الأدمن المحلية مباشرة. الأثر المرئي: في وضع الإنتاج تظهر الآن كل الخدمات مفعّلة لكل حساب دائماً (لأن جميع بوابات firm-*/gov-*/ngo-*/micro-* مضبوطة على المستوى المجاني حالياً)، ولا يعود أي تعديل في متصفح الزائر يغيّر هذه القائمة. في الوضع التجريبي (demo) لم يتغيّر شيء — لا يزال محرر الأدمن (/dashboard/admin/...) يتحكم بها كالسابق.
* أرقام النقاط وحجم المكتب والباقة المعروضة في /dashboard/firm/profile و/dashboard/firm/health-check و/dashboard/firm/departments لم تتغيّر — لا تزال تعرض بيانات محلية وهمية كنص فقط، لأنها عرض بيانات وليست بوابة إظهار/إخفاء (خارج نطاق هذه المهمة).

**التحقق:** 12 اختباراً · المكذِّب أكّد 11 ادّعاءً ونقض 2 (أُصلح 8).

**بقي مسجَّلاً:** MEMBERS on src/app/dashboard/business/team/page.tsx (and its derived stats: إجمالي الفريق, طلبات وإجراءات نشطة, عقود وطلبات منجزة, مدراء إدارات) is a hardcoded fake roster. · firm-branding gate in FEATURE_GATES/resolveFeatureAccess has no corresponding entry in FIRM_FLAG_TO_FEATURE_KEY.

### ما بقي في المتصفح — ولماذا

| المفتاح | الملف | السبب |
|---|---|---|
| `nzamy_demo_key` | `ProfileTab.tsx` | Read/written only inside `if (isDemoUiEnabled && typeof window !== "undefined")` blocks that are themselves inside `if (!isSupabaseMode)` branches — never executes when isSupabaseMode is true (task's  |
| `nzamy_profile_fields_<userType>` | `ProfileTab.tsx` | Same double guard (isDemoUiEnabled + !isSupabaseMode) as nzamy_demo_key. Demo-mode-only local seed/save for the profile form; never touched in supabase mode. |
| `sticky_note_text_<pageId>, sticky_note_pos_<pageId>, sticky_` | `useArticleNote.ts` | Signed-out visitor path — the phase rule keeps the browser as the guest's only store, unchanged from before this phase. The same five keys are also read once (and removed only after a successful serve |
| `sticky_note_text_<pageId>, sticky_note_audio_<pageId>, stick` | `MyNotesSection.tsx` | Guest-only local scan and guest-only delete — both paths are gated behind `if (signedIn) return` / an explicit `if (signedIn) {...}` branch; a signed-in reader's list and delete both go through getMyA |
| `nzamy_pomodoro_sessions` | `storage.ts` | Demo mode (!isSupabaseMode) is an explicitly permitted localStorage use per the phase rule, and loadSessions/saveSession/clearSessions now only touch it in that branch. The one remaining supabase-mode |
| `nzamy_activity` | `page.tsx` | Guest-only branch of the reading-activity effect (else of `isLoggedIn && isSupabaseMode`) — guests keep the browser per the phase rule. |
| `nzamy_recent_sessions` | `page.tsx` | Guest-only branch of the recent-sessions effect, same gate as above. |
| `nzamy_activity` | `GamificationCard.tsx` | loadLocalActivity() — guest/demo fallback read only, when the signed-in+supabase branch does not apply. |
| `nzamy_dashboard_mode` | `SharedSidebar.tsx` | One-time migration: read once and immediately deleted for a signed-in supabase user (carries a pre-Phase-6 local choice up to the server if the server has none yet); never read again after. Guests/dem |
| `nzamy_smart_folders` | `FolderSelectionModal.tsx` | Primary store for guests (no account to persist to). For signed-in users it is written only as a same-tab cache alongside every optimistic state update, mirroring SmartFolders.tsx's pre-existing patte |
| `nzamy_recent_sessions` | `FolderSelectionModal.tsx` | Guest-only read path for the "Recent Sessions" list. Signed-in users read getPreferences().recentSessions from the server instead (per task instruction). |
| `nzamy_smart_folders` | `SmartFolders.tsx` | Pre-existing pattern, not introduced by this task — every write handler in this file (rename, color, delete, remove-item, create, and now toggle-pin) does an optimistic localStorage write + CustomEven |
| `nzamy_recent_sessions` | `SmartFolders.tsx` | Pre-existing guest-only read in the "manage folder content" sub-view, unchanged — out of this task's scope (only the mapper extraction and the pin handler were named). |
| `nzamy_admin_features (indirect, via useAdminSettings/updateC` | `page.tsx` | The page still calls useAdminSettings() directly for `mounted`/`updateCompanyFeatures` and keeps a local hasInternalLegal useState mirror — but only to drive the demo-only <select> control that lets a |

### التحقق الختامي للمرحلة كلها
`npx tsc --noEmit` نظيف على الشجرة · `npm run test:unit` **١٠٥٧+** · `next build` نظيف · `detect_changes()` على
الشجرة المشتركة CRITICAL — مجموع دفعتين متزامنتين (الشاشات والإغلاقات السريعة) لا هذه وحدها.
الرمز الوحيد HIGH بالأثر: `ResearchWorkspace` (٤ مستدعين — صفحات القراءة) وبقي توقيعه كما هو.
