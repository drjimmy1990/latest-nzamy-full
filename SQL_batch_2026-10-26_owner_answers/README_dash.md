# دفعة 2026-10-26 (إجابات المالك 25 أكتوبر) — مسار لوحة التحكم

**الحالة:** لم يُنفَّذ شيء من هذا المسار على الإنتاج بعد. كل SQL على الإنتاج ينفّذه المستخدم في المحرر، بعد نسخة احتياطية ومراجعة نتيجة كل ملف.

## 62: رابط متابعة القضية — الإصدار الثاني (D2، قرار المالك ٢٧٦)

`62_BEFORE_DEPLOY_20261026_62_tracking_links_v2.sql` نسخة مطابقة من `supabase/migrations/20261026_62_tracking_links_v2.sql`.

**الشرط المسبق:** `13_BEFORE_DEPLOY_20261025_32_case_tracking_links.sql` من دفعة 25 أكتوبر (نُفِّذ ✓). الملف يتوقف برسالة واضحة إن لم يجده.

**ماذا يضيف:**
- **مدة الرابط** يختارها المحامي عند الإنشاء: ٧ أيام، ٣٠ يوماً، ٩٠ يوماً، أو «حتى انتهاء المرحلة الحالية». تنتهي المرحلة إذا أُغلقت (تاريخ إغلاقها اليوم أو قبله)، أو حُذفت، أو فتح محامي القضية مرحلة أحدث. المراحل التي يكتبها غير العاملين على القضية لا تُحسب.
  - يتوقف رابط «حتى انتهاء المرحلة» **لحظة** انتهاء مرحلته، لا عند فتحه التالي. فإعادة فتح المرحلة لا تُحييه؛ يعيد المحامي تفعيله بنفسه.
- **الإيقاف المؤقت بدل الحذف:** عند انتهاء المدة، أو بقرار المحامي، يصبح الرابط «موقوفاً مؤقتاً». يرى الموكل صفحة محايدة: «الرابط موقوف مؤقتاً — تواصل مع محاميك»، دون أي بيانات عن القضية. يعيد المحامي تفعيل **الرابط نفسه** بضغطة ويختار له مدة جديدة. «الإلغاء النهائي» باقٍ ولا رجعة فيه.
  - **الإيقاف اليدوي** يرفعه منشئ الرابط، أو من أوقفه، أو المحامي المسؤول عن القضية فقط. لا يرفعه زميل آخر ولو كان يملك إنشاء الروابط.
  - الإيقاف لانتهاء المدة، أو لكثرة المحاولات الخاطئة، يرفعه كل من يملك إنشاء الروابط على القضية.
- **تحقق خفيف دون حساب:** يُدخل الموكل **آخر ٤ أرقام** من رقم الجوال المسجّل في ملف القضية. المصدر بالترتيب:
  1. بطاقة الموكل المرتبطة بالقضية (`lawyer_clients.phone`).
  2. رقم حساب مقدّم الطلب، إذا لم يكن هو نفسه من العاملين على القضية. فرقم المحامي لا يفتح رابط موكله أبداً.
  - المقارنة داخل قاعدة البيانات، والرقم لا يخرج منها لأي دور، ولا حتى `service_role`.
  - ٥ محاولات خاطئة تقفل الرابط ١٥ دقيقة، ولا تُقبل خلالها حتى الأرقام الصحيحة.
  - **٢٠ محاولة خاطئة** منذ آخر إدخال صحيح توقف الرابط نفسه. القفل لـ١٥ دقيقة لا يصفّر هذا العدّاد؛ يصفّره إدخال صحيح أو إعادة التفعيل.
    - يرى الموكل صفحة «موقوف مؤقتاً» نفسها، دون ذكر السبب.
    - يرى المحامي «موقوف — محاولات خاطئة كثيرة»، مع تنبيه: «يبدو أن الرابط تسرّب إلى غير الموكل — يُفضّل إلغاؤه وإنشاء رابط جديد».
  - تُقبل الأرقام العربية (٤٥٦٧) والفارسية.
- **لا يُنشأ رابط لقضية بلا رقم جوال.** تظهر للمحامي رسالة: «أضف رقم جوال الموكل في ملف القضية أولاً».
- **مشغّلات على جداول المنصة:** يضيف الملف مشغّلات (triggers) على `case_stages` و`lawyer_clients` و`profiles` و`service_requests`. كل منها يحدّث روابط المتابعة للقضية المعنية فقط. اعرف ذلك قبل النسخة الاحتياطية، وانظر ترتيب التراجع أدناه.

**الكود:** بعد النجاح يضع الخادم كوكي `nz_track_unlock` لمدة ١٢ ساعة، لهذا الرابط وحده (`Path=/track/<token>`، httpOnly، Secure، `SameSite=Lax`).
- `Lax` لا `Strict`: الموكل يفتح الرابط من واتساب أو الرسائل، و`Strict` يُسقط الكوكي في هذه الحالة فيطلب الأرقام في كل مرة. الكوكي لا يفتح إلا صفحة عرض للقراءة فقط.
- الكوكي موقَّع بمفتاح مشتق من `SUPABASE_SERVICE_ROLE_KEY` الموجود أصلاً في الخادم. **لا يلزم متغير بيئة جديد.** وإن غاب المفتاح لا يُفتح أي رابط (يفشل مغلقاً).
- يحمل الكوكي **رقم إصدار** الرابط (`unlock_epoch`). يتغيّر الرقم عند كل إيقاف، وكل إعادة تفعيل، وكل تغيير لرقم الجوال خلف الرابط:
  - رقم بطاقة الموكل؛
  - رقم حساب مقدّم الطلب؛
  - تغيير البطاقة أو مقدّم الطلب المرتبط بالقضية.

  بعد أي تغيير منها يُطلب من الموكل إدخال الأرقام من جديد، ولا يبقى كوكي قديم صالحاً.

### الترتيب

1. نفّذ `62_BEFORE_DEPLOY_20261026_62_tracking_links_v2.sql` **قبل نشر الكود**. يجب أن تظهر في نهايته الرسالة `20261026_62 verify: OK`.
2. اختياري: شغّل `supabase/migrations/_verify.sql` (أحدث نسخة) **يدوياً**. `deploy.sh` لا يشغّله (أُزيل منه في 6223b221):

   ```bash
   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify:|ERROR"
   ```

   يجب أن يظهر `_verify: 20261026_62 OK`. قبل تنفيذ 62 يظهر تنبيه «not applied yet» دون خطأ.
3. افحص أن nginx لا يخزّن صفحات `/track/*` (انظر «فحوص الخادم» أدناه).
4. انشر الكود.

**الفترة بين تنفيذ الملف ونشر الكود:** في هذه الفترة يعمل الكود القديم مع قاعدة البيانات الجديدة.
- **الروابط الموقوفة والمنتهية لا تُفتح**، لأن دالة العرض نفسها ترفضها.
- **الروابط النشطة تُفتح دون طلب الأرقام**، كما في الإصدار الأول الحالي، لأن الصفحة القديمة لا تعرف خطوة التحقق.
- **شاشة المحامي القديمة قد تُنشئ رابطاً لقضية بلا رقم جوال.** هذا الرابط لن يُفتح بعد النشر حتى يُضاف الرقم.

لهذا اجعل الفترة قصيرة: انشر مباشرة بعد ظهور `verify: OK`.

**إن نُشر الكود قبل الملف:** لا تظهر أي بيانات قضية، لكن **كل روابط المتابعة تتوقف عن العمل**:
- تعرض صفحة `/track` لكل رابط: «هذا الرابط لم يعد متاحاً»، حتى ينفَّذ الملف 62. لا يوجد رجوع إلى الإصدار الأول دون الأرقام؛ الصفحة تفشل مغلقة.
- يُنشأ الرابط بلا مدة، ويظهر للمحامي «إلغاء نهائي» وحده.
- بعد تنفيذ الملف يعود كل شيء تلقائياً، ولا حاجة لإعادة النشر.

### ما يتغير للروابط الموجودة

- **كل رابط قائم** يأخذ مدة ٣٠ يوماً من لحظة تنفيذ الملف. ثم يتوقف مؤقتاً ويمكن إعادة تفعيله.
- **كل رابط قائم سيطلب الأرقام الأربعة** من الموكل عند فتحه.
- إن لم يكن في ملف قضيته رقم جوال، فلن يُفتح الرابط حتى يضيف المحامي الرقم. يُضاف الرقم في بطاقة الموكل المرتبطة بالقضية، أو يكون في حساب الموكل نفسه.

### فحوص الخادم (قبل النشر)

- **nginx لا يخزّن `/track/*`.** نفّذ الأمر **مرتين** (الطلب الأول دائماً MISS):

  ```bash
  curl -sI https://nezamy.sa/track/test | grep -iE "cache-control|x-cache"
  ```

  يجب أن يظهر `no-store`، ولا يظهر `HIT` في المرة الثانية. إن ظهر `HIT` فأضف لمسار `/track/` قاعدة `proxy_no_cache` / `proxy_cache_bypass` قبل النشر. وإلا قد تُعرض صفحة قضية فُتحت بالأرقام لزائر لم يُدخلها.
- **عنوان الزائر الحقيقي خلف Cloudflare.** يجب أن يثق nginx (`set_real_ip_from` + `real_ip_header CF-Connecting-IP`) بنطاقات Cloudflare المنشورة، فيصل `X-Real-IP` بعنوان الزائر لا بعنوان خادم Cloudflare. بدون ذلك يتقاسم كل زوار الخادم الواحد من Cloudflare عدّاد الحد نفسه، فيستطيع مهاجم استنفاده وحجب التحقق عن الموكلين.

### تحذير

- **لا تُعِد تنفيذ `13_BEFORE_DEPLOY_20261025_32_…` بعد هذا الملف.**
  - إعادة تنفيذه ترجع دالة العرض إلى الإصدار الأول، فيُفتح الرابط الموقوف أو المنتهي.
  - إذا شغّلت `_verify.sql` يدوياً (الأمر في «الترتيب»)، فهو يكشف ذلك برسالة خطأ صريحة.
  - إن حدث، فأعد تنفيذ هذا الملف (62).
- الملف قابل لإعادة التشغيل، داخل `begin … commit`، وينتهي بـ `notify pgrst, 'reload schema'`.

**للتراجع (يدوياً)، بهذا الترتيب:**
1. أعد تنفيذ 13 (يرجع العرض للإصدار الأول).
2. احذف **المشغّلات (triggers) أولاً**: `trg_case_tracking_links_born`، `trg_case_tracking_links_epoch`، `trg_case_stages_end_tracking_links`، `trg_lawyer_clients_tracking_phone`، `trg_profiles_tracking_phone`، `trg_service_requests_tracking_phone`. لو حُذف عمود قبلها لنجح الحذف بصمت، ثم تفشل كل كتابة على المراحل وكل تعديل لجوال حساب أو بطاقة موكل.
3. ثم دوال هذا الملف، ثم أعمدته الجديدة.

الروابط تبقى بنفس رموزها. انتبه: الكود الجديد يفشل مغلقاً بعد التراجع (كل الروابط «غير متاحة») حتى يُرجَع الكود أيضاً.

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
- Lifetimes: 7d, 30d, 90d, or until the current stage ends. A stage link is paused the moment its stage ends (a trigger on `case_stages`), so re-opening the stage does not revive it.
- Pause instead of delete, on expiry or by hand. Resume keeps the same URL; revoke stays one-way. A manual pause can be lifted only by the link's maker, the one who paused it, or the case's lead. An expired or locked pause can be lifted by anyone who may issue links.
- The client's 4-digit unlock against the case-file mobile: the attached client card first, else a non-worker requester's account phone. It is compared in SQL.
  - 5 wrong tries lock the link for 15 minutes.
  - 20 wrong tries since the last right answer pause the link (`paused_reason = 'locked'`); the 15-minute lock does not reset that count. The client sees an ordinary pause. The lawyer sees «موقوف — محاولات خاطئة كثيرة» and the advice to cancel and replace the link.
- The unlock cookie (`SameSite=Lax`, `Path=/track/<token>`, 12 h) is signed with a key derived from `SUPABASE_SERVICE_ROLE_KEY`, so no new environment variable is needed. It carries the link's `unlock_epoch`. The epoch moves on every pause, every resume and every change of the phone behind the link, so an old cookie stops working.

Order: run 62 BEFORE deploying.
- If the code is deployed first, every tracking link shows «هذا الرابط لم يعد متاحاً» (unavailable) until 62 runs. The page fails closed: there is no fallback to v1 without the digits.
- Between running 62 and the deploy, the old page still shows active links without the digits, which is today's v1 behaviour. Paused and expired links stay hidden. Keep that window short.

It adds triggers to four platform tables (`case_stages`, `lawyer_clients`, `profiles`, `service_requests`); each only touches the tracking links of the changed case. Rollback order: re-run 13, drop the six triggers FIRST, then the functions, then the columns.

Effects on existing data:
- Existing links get 30 days from the run.
- Existing links will start asking for the digits.
- A case without a mobile cannot open its link.

`deploy.sh` does not run `_verify.sql` (it was removed in 6223b221). When you run it by hand:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify:|ERROR"
```

It flags a re-run of 20261025_32 after this file, which would restore the v1 snapshot. Do not re-run 20261025_32 after 62.

Server checks before the deploy:
- Run `curl -sI https://nezamy.sa/track/test | grep -iE "cache-control|x-cache"` twice. It must show `no-store`, and the second run must not show `HIT`. If it shows `HIT`, add a `proxy_no_cache` / bypass rule for `/track/` before deploying.
- nginx `real_ip` should trust Cloudflare's published ranges, so `X-Real-IP` is the visitor and not the edge. Otherwise an attacker can exhaust a shared edge's per-IP bucket.
