# المرحلة ٧ (نصف الملف الشخصي) — الملف والخدمات والتقييمات: سجل التنفيذ

**التاريخ:** ٢٠٢٦-٠٩-٠٤ (مساءً) · **الفرع:** `main` ثم `owner-edits` · **الترحيل:** [`20260907_phase7_profile_services_reviews.sql`](../../supabase/migrations/20260907_phase7_profile_services_reviews.sql) — **لم يُشغَّل على الإنتاج بعد**.

**النطاق:** نصف المرحلة ٧ الذي لا يحجبه قرار — ملف المحامي (بنود ١٢٨ · ١٧٨ · ١٧٩ · ١٩٢ · ١٣٠).
النصف الثاني (سوق المحامين: ٥٨ · ١٤٤ · ١٤٥ · ١٨٥) محجوب بـ`BETA_MONOPOLY_MODE` وهو قرار
المالك؛ والإنجازات/التلعيب (٤٠) لا بيانات خلفها؛ وإعادة التسمية (٥٥) قرار محتوى.

## ١ · ما وجدناه قبل الكتابة

* `lawyer_profiles` بلا رابط عام (`slug`) ولا سطر تعريفي ولا مؤهلات ولا محاكم ولا لغات —
  الملف العام يُفتح بالمعرّف الطويل فقط.
* لا جدول خدمات: «الخدمات» في الملف مصفوفة ثابتة.
* `reviews` موجود من المرحلة ١ لكن بلا قيد «تقييم واحد لكل طلب»، وسياسة الإدراج لا تشترط أن
  يكون المقيِّم صاحبَ طلب **مكتمل** مُسنَد إلى المحامي المقيَّم — أي شخص كان يستطيع تقييم أي محامٍ.
* زرّ «تصدير PDF — قريباً» معطَّل على ملف المحامي؛ ولا نموذج تقييم للعميل في أي مكان.
* لا شيء يمنع محامياً من وضع رقم هاتفه أو واتسابه في نبذته أو وصف خدمته (بند ١٧٩).

## ٢ · ما في الترحيل

* **`lawyer_profiles`** +`slug` (نمط `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`، كلمات محجوزة
  `browse/new/me/admin/api/search/directory`، فهرس فريد جزئي) · `headline_ar` · `education` (jsonb
  مصفوفة) · `courts text[]` · `languages text[]` افتراضيها `{ar}` · `show_contact` · `is_accepting_clients`.
* **`lawyer_services`** جديد: `pricing_kind` (fixed/from/hourly/quote — السعر إلزامي إلا مع quote)،
  `category`، `position`، `active`. RLS: القراءة العامة **لخدمات المحامي الموثَّق الظاهر في السوق
  النشطة فقط**، والمالك كل شيء.
* **`reviews`**: فهرس فريد جزئي على `request_id`؛ سياسة إدراج = صاحب طلب **مكتمل** مُسنَد إلى
  المقيَّم، والمقيَّم ≠ المقيِّم؛ منظور `lawyer_review_stats` (`security_invoker`).
* اختبار RLS في Docker: [`phase7_profile_services_reviews.test.sql`](../../supabase/tests/rls/phase7_profile_services_reviews.test.sql) — **١٨ فحصاً خضراء**؛ `stubs.sql` وُسِّع بـ`lawyer_profiles` و`reviews`.

## ٣ · العقود كُتبت أولاً بيدنا

| الملف | ما فيه |
|---|---|
| [`contactSanitizer.ts`](../../src/lib/services/contactSanitizer.ts) (+٥ اختبارات) | كشف الهاتف/البريد/الرابط/المعرّف/الواتساب في نصّ حر، بأرقام هندية أو غربية. **الهاتف يحتاج بادئة + أو 00 أو جوّالاً سعودياً 05…** مع حدود رقمية — فالسجل التجاري ذو العشرة أرقام ورقم المادة **ليسا** هاتفاً (كان الإصدار الأول يلتقطهما، وأصلحناه قبل أن يلمسه بانٍ) |
| [`lawyerProfileFields.ts`](../../src/lib/services/lawyerProfileFields.ts) (+اختبار) | `slugIssue` · `suggestSlug` · `educationIssue` · `COURTS`/`COURT_AR` · `LANGUAGES`/`LANGUAGE_AR` · `isPricingKind` · `isServiceCategory` · `SERVICE_CATEGORY_AR` · `servicePriceLabelAr` |
| [`lawyerServicesService.ts`](../../src/lib/services/lawyerServicesService.ts) | `/api/v1/lawyer/services` — `getMyServices` · `createService` · `updateService` · `deleteService` |
| [`reviewsService.ts`](../../src/lib/services/reviewsService.ts) | `/api/v1/reviews` · `/eligible` · `/mine` · `[id]/response` |

## ٤ · ما بُني — تسعة بنّائين، ومكذِّب لكل واحد

**المسارات**

| المهمة | الملفات | ما يفعله |
|---|---|---|
| R1 | [`api/v1/profile/route.ts`](../../src/app/api/v1/profile/route.ts) | `PATCH` يقبل `slug` (يُنظَّف ويُصغَّر؛ `23505` ← **409** «هذا الرابط مستخدم من محامٍ آخر» — الفحص مقيَّد بوجود `slug` في التحديث حتى لا يُنسب تصادمُ رقم الترخيص إلى الرابط) · `education` · `courts` · `languages` · `headline_ar` (≤١٦٠). **`bio_ar` و`headline_ar` يمرّان بكاشف التواصل** ويُرفضان بالعربية. البوّابة بقيت `lawyer` فقط: حساب المكتب لا صفّ له في `lawyer_profiles` (مسجَّل) |
| R2 | [`api/v1/lawyers/route.ts`](../../src/app/api/v1/lawyers/route.ts) · [`[id]/route.ts`](../../src/app/api/v1/lawyers/[id]/route.ts) · `lawyerDirectory.ts` | الدليل يحمل `slug` و`reviewStats`؛ الملف العام يحمل `services` و`reviewStats` و`reviews` — **التقييم المجهول بلا اسم مقيِّم ولا `requestId`** |
| R3 | [`api/v1/lawyer/services/route.ts`](../../src/app/api/v1/lawyer/services/route.ts) · `[id]/route.ts` | `GET` قائمتي (بـ`eq` صريح لأن ثلاث سياسات SELECT متساهلة تُجمع بـOR) · `POST` 201 · `PATCH` · `DELETE`؛ العنوان والوصف ومدّة الخدمة تمرّ بكاشف التواصل؛ السعر إلزامي إلا مع «حسب الطلب» |
| R4 | [`api/v1/reviews/route.ts`](../../src/app/api/v1/reviews/route.ts) · `eligible/` · `mine/` · `[id]/response/` | `GET` عام (بوّابة الموافقة: محامٍ موثَّق ظاهر في السوق) + إحصاءات · `POST` (الأهلية = صاحب طلب مكتمل مُسنَد إلى المقيَّم؛ `23505` ← 409 تقييم واحد لكل طلب) · `GET /eligible` (طلباتي المكتملة بلا تقييم) · `GET /mine` (ما كُتب عني) · `POST [id]/response` (ردّ المحامي، بكاشف التواصل) |

**الشاشات**

| المهمة | الملفات | ما يراه المستخدم |
|---|---|---|
| U1 | [`lawyer/profile/edit/page.tsx`](../../src/app/dashboard/lawyer/profile/edit/page.tsx) | «سطر تعريفي» (عدّاد ١٦٠ + تحذير تواصل فوري) · «رابط ملفك العام» مع «اقتراح رابط» و**رسالة 409 تحت الحقل نفسه** · «المؤهلات العلمية» (≤١٠) · المحاكم · اللغات |
| U2 | [`lawyer/profile/page.tsx`](../../src/app/dashboard/lawyer/profile/page.tsx) · [`_components/profile/ServiceFormModal.tsx`](../../src/app/dashboard/lawyer/_components/profile/ServiceFormModal.tsx) · [`ReviewsPanel.tsx`](../../src/app/dashboard/lawyer/_components/profile/ReviewsPanel.tsx) | تبويبات **نبذة / الخدمات / التقييمات** (لا تبويب «إنجازات» — لا بيانات) · خدمات بإضافة/تفعيل/حذف · تقييمات بردّ · زرّ **«طباعة / حفظ PDF» حقيقي** (`window.print` + `@media print` يطبع بطاقة الملف وحدها) بدل «تصدير PDF — قريباً» · نسخ رابط الملف العام |
| U3 | [`lawyers/[slug]/page.tsx`](../../src/app/lawyers/[slug]/page.tsx) | السطر التعريفي · المؤهلات (سنة التخرّج بلا فاصل آلاف — أُصلح) · المحاكم · اللغات · بطاقات الخدمات مع «اطلب هذه الخدمة» ← معالج الاستشارة بـ`?lawyer=&service=` · التقييمات والإحصاءات. **الصفحة ما زالت خلف تحويل `BETA_MONOPOLY_MODE`** |
| U4 | [`components/reviews/ReviewForm.tsx`](../../src/components/reviews/ReviewForm.tsx) · `client/requests/page.tsx` · `client/consultation/[id]/page.tsx` | نموذج تقييم بخمسة أزرار نجوم حقيقية (لا `div`) · عنوان/نصّ يمرّان بكاشف التواصل على كل ضغطة · «تقييم مجهول» · يظهر على الطلب **المكتمل** وعلى صفحة الاستشارة؛ نصّه لا يَعِد بالملف العام ما دام وضع البيتا قائماً |
| U5 | `client/consultation/new/page.tsx` · `intakeValues.ts` | `?service=` يختار الخدمة مسبقاً في المعالج (`?lawyer=` كان موجوداً) |

## ٥ · التحقق

* **`impact()` قبل كل رمز مُعدَّل** — كلها LOW أو «بلا مستدعين» (معالجات المسارات وصفحات Next
  لا حواف استدعاء لها في الفهرس). لا HIGH ولا CRITICAL. `detect_changes()` على الشجرة المشتركة
  أعطى CRITICAL (١٥٣ رمزاً) — وهو **مجموع ثلاث دفعات متزامنة** في شجرة واحدة، لا هذه الدفعة.
* **تسعة مكذِّبين** قرأوا كلا طرفَي كل سلك. ثلاث نتائج «كبرى» أُصلحت في التكامل:
  `requestId` كان يتسرّب مع التقييم المجهول (**يكشف هوية المقيِّم** لمن يملك لوحة الطلبات) —
  سُدّ في المحوِّلَين معاً؛ رسالة Postgres الخام كانت تُعاد لزائر مجهول على الدليل — صارت
  عربية؛ سنة التخرّج كانت تُعرض «٢٬٠١٥». واثنتان صغرى: نمط UUID المتساهل وُحِّد؛ نصّ نموذج
  التقييم لا يَعِد بالملف العام في البيتا.
* `npx tsc --noEmit` نظيف · `npm run test:unit` **٨٤١/٨٤١** لحظة التكامل (٨٥٤ الآن مع اختبارات
  المرحلة ٦) · خادم التطوير تعلّق أثناء فحص `curl` فتُحقِّق من رموز الحالة بقراءة الكود.

## ٦ · ما لم يُفعل عمداً، وما بقي

* **مقيَّم من نوع مكتب**: `POST /reviews` يقبل مقيَّماً مكتباً، لكن `GET` العام يفحص موافقة
  `lawyer_profiles` فقط — فتقييمات المكتب لا تظهر علناً. لا يوجد عمود موافقة على `firm_profiles`
  ولا سياسة قراءة عامة لها؛ **قرار منتج** (لا حساب مكتب على الإنتاج، والدليل مخفيّ بالبيتا).
* الملف العام `/lawyers/[slug]` مبنيّ كاملاً لكنه **خلف تحويل البيتا** — يُفتح بقلب
  `BETA_MONOPOLY_MODE` وحده.
* عنوان الطلب (`service_requests.title`) الظاهر مع التقييم لا يمرّ بكاشف التواصل (خطر رقم
  القضية كإيجابية كاذبة) — مؤجَّل.
* الترحيل **لم يُشغَّل على الإنتاج**: حتى يُشغَّل، تبويبا الخدمات والتقييمات يعرضان «تعذّرت
  القراءة» بصدق ولا تنهار الصفحة.
