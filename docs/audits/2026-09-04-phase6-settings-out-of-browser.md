# المرحلة ٦ — الإعدادات والخروج من المتصفح: سجل التنفيذ

**التاريخ:** ٢٠٢٦-٠٩-٠٤ (مساءً) · **الفرع:** `main` ثم `owner-edits` · **الترحيل:** [`20260906_phase6_settings_out_of_browser.sql`](../../supabase/migrations/20260906_phase6_settings_out_of_browser.sql) — **لم يُشغَّل على الإنتاج بعد**.

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
