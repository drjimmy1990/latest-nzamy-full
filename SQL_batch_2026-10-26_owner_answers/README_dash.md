# دفعة 2026-10-26 (إجابات المالك 25 أكتوبر) — مسار لوحة التحكم

**الحالة:** لم يُنفَّذ شيء من هذا المسار على الإنتاج بعد. كل SQL على الإنتاج ينفّذه المستخدم في المحرر، بعد نسخة احتياطية ومراجعة نتيجة كل ملف.

## 62: رابط متابعة القضية — الإصدار الثاني (D2، قرار المالك ٢٧٦)

`62_BEFORE_DEPLOY_20261026_62_tracking_links_v2.sql` نسخة مطابقة من `supabase/migrations/20261026_62_tracking_links_v2.sql`.

**الشرط المسبق:** `13_BEFORE_DEPLOY_20261025_32_case_tracking_links.sql` من دفعة 25 أكتوبر (نُفِّذ ✓). الملف يتوقف برسالة واضحة إن لم يجده.

**ماذا يضيف:**
- **مدة الرابط** يختارها المحامي عند الإنشاء: ٧ أيام، ٣٠ يوماً، ٩٠ يوماً، أو «حتى انتهاء المرحلة الحالية». تنتهي المرحلة إذا أُغلقت (تاريخ إغلاقها اليوم أو قبله)، أو حُذفت، أو فتح محامي القضية مرحلة أحدث. المراحل التي يكتبها غير العاملين على القضية لا تُحسب.
- **الإيقاف المؤقت بدل الحذف:** عند انتهاء المدة، أو بقرار المحامي، يصبح الرابط «موقوفاً مؤقتاً». يرى الموكل صفحة محايدة: «الرابط موقوف مؤقتاً — تواصل مع محاميك»، دون أي بيانات عن القضية. يعيد المحامي تفعيل **الرابط نفسه** بضغطة ويختار له مدة جديدة. «الإلغاء النهائي» باقٍ ولا رجعة فيه.
- **تحقق خفيف دون حساب:** يُدخل الموكل **آخر ٤ أرقام** من رقم الجوال المسجّل في ملف القضية. المصدر بالترتيب:
  1. بطاقة الموكل المرتبطة بالقضية (`lawyer_clients.phone`).
  2. رقم حساب مقدّم الطلب، إذا لم يكن هو نفسه من العاملين على القضية. فرقم المحامي لا يفتح رابط موكله أبداً.
  - المقارنة داخل قاعدة البيانات، والرقم لا يخرج منها لأي دور، ولا حتى `service_role`.
  - ٥ محاولات خاطئة تقفل الرابط ١٥ دقيقة، ولا تُقبل خلالها حتى الأرقام الصحيحة.
  - تُقبل الأرقام العربية (٤٥٦٧) والفارسية.
- **لا يُنشأ رابط لقضية بلا رقم جوال.** تظهر للمحامي رسالة: «أضف رقم جوال الموكل في ملف القضية أولاً».

**الكود:** بعد النجاح يضع الخادم كوكي `nz_track_unlock` لمدة ١٢ ساعة، لهذا الرابط وحده (`Path=/track/<token>`، httpOnly، Secure، SameSite=Strict). الكوكي موقَّع بمفتاح مشتق من `SUPABASE_SERVICE_ROLE_KEY` الموجود أصلاً في الخادم. **لا يلزم متغير بيئة جديد.** وإن غاب المفتاح لا يُفتح أي رابط (يفشل مغلقاً).

### الترتيب

1. نفّذ `62_BEFORE_DEPLOY_20261026_62_tracking_links_v2.sql` **قبل نشر الكود** (الأفضل). يجب أن تظهر في نهايته الرسالة `20261026_62 verify: OK`.
2. شغّل `supabase/migrations/_verify.sql` (أحدث نسخة). يجب أن يظهر `_verify: 20261026_62 OK`. قبل التنفيذ يظهر تنبيه «not applied yet» دون خطأ.
3. انشر الكود.

**إن نُشر الكود قبل الملف:** لا شيء ينكسر.
- تعمل صفحة `/track` كما في الإصدار الأول، دون طلب الأرقام.
- يُنشأ الرابط بلا مدة.
- يظهر للمحامي «إلغاء نهائي» وحده، وزرّا الإيقاف المؤقت وإعادة التفعيل مخفيان.
- بعد تنفيذ الملف يتحول كل شيء تلقائياً، ولا حاجة لإعادة النشر.

### ما يتغير للروابط الموجودة

- **كل رابط قائم** يأخذ مدة ٣٠ يوماً من لحظة تنفيذ الملف. ثم يتوقف مؤقتاً ويمكن إعادة تفعيله.
- **كل رابط قائم سيطلب الأرقام الأربعة** من الموكل عند فتحه.
- إن لم يكن في ملف قضيته رقم جوال، فلن يُفتح الرابط حتى يضيف المحامي الرقم. يُضاف الرقم في بطاقة الموكل المرتبطة بالقضية، أو يكون في حساب الموكل نفسه.

### تحذير

- **لا تُعِد تنفيذ `13_BEFORE_DEPLOY_20261025_32_…` بعد هذا الملف.**
  - إعادة تنفيذه ترجع دالة العرض إلى الإصدار الأول، فيُفتح الرابط الموقوف أو المنتهي.
  - `_verify.sql` يكشف ذلك برسالة خطأ صريحة.
  - إن حدث، فأعد تنفيذ هذا الملف (62).
- الملف قابل لإعادة التشغيل، داخل `begin … commit`، وينتهي بـ `notify pgrst, 'reload schema'`.

**للتراجع (يدوياً):** أعد تنفيذ 13 (يرجع العرض للإصدار الأول)، ثم احذف دوال هذا الملف وأعمدته الجديدة. الروابط تبقى بنفس رموزها.

### الاختبار (Docker محلي فقط)

```bash
T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
  $T/prelude_case_tables_real.sql $T/prelude_profiles_live_columns.sql \
  $M/20260903_phase1_case_tables.sql $M/20260903_phase2_clients_and_firm_membership.sql \
  $M/20260905_phase3_consultations_and_contracts.sql $M/20260910_case_notes.sql \
  $M/20261017_41_notes_visibility_case_team.sql $M/20261025_31_dashboard_notes.sql \
  $M/20261025_32_case_tracking_links.sql \
  $M/20261026_62_tracking_links_v2.sql $M/20261026_62_tracking_links_v2.sql \
  $T/tracking_links_v2.test.sql
```

---

**English summary.** `62_BEFORE_DEPLOY_20261026_62_tracking_links_v2.sql` is identical to `supabase/migrations/20261026_62_tracking_links_v2.sql` and requires 20261025_32.

What it adds:
- Lifetimes: 7d, 30d, 90d, or until the current stage ends.
- Pause instead of delete, on expiry or by hand. Resume keeps the same URL; revoke stays one-way.
- The client's 4-digit unlock against the case-file mobile: the attached client card first, else a non-worker requester's account phone. It is compared in SQL, and 5 wrong tries lock the link for 15 minutes.

Run it before deploying. The code also works before it, as v1: no digits, no lifetime, no pause.

Effects on existing data:
- Existing links get 30 days from the run.
- Existing links will start asking for the digits.
- A case without a mobile cannot open its link.

Do not re-run 20261025_32 after this file: that restores the v1 snapshot, and `_verify.sql` flags it.

The unlock cookie is signed with a key derived from `SUPABASE_SERVICE_ROLE_KEY`, so no new environment variable is needed.
