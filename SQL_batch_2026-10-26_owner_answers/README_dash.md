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

---

## 63 + 64: خزنة الهوية والورق المروّس (D4، قرار المالك ٢٥٦)

| الترتيب | الملف | بأي دور | متى |
|---|---|---|---|
| 1 | `63_BEFORE_DEPLOY_20261026_63_branding_vault.sql` | محرر SQL (postgres) | قبل نشر الكود |
| 2 | `64_AFTER_63_storage_policies_branding.sql` | **`supabase_admin`** من الخادم (لا يكفي محرر SQL) | بعد 63 مباشرة |

`63_…` نسخة مطابقة من `supabase/migrations/20261026_63_branding_vault.sql`، و`64_…` نسخة مطابقة من `supabase/storage_policies_branding.sql`.

**الشرط المسبق:** جداول المكاتب من المرحلة الثانية (`firm_profiles` و`firm_members`، نُفِّذ ✓). يتوقف 63 برسالة واضحة إن لم يجدها. **لا يُستعمل** ملف المالك القديم `20261019_vault_lawyer_branding.sql`: يقرأ عموداً غير موجود (`profiles.role`)، و63 يحلّ محله.

**ماذا يضيف 63:**
- جدول `branding_vaults`: صف واحد لكل صاحب ورق مروّس — **إما** محامٍ فرد **وإما** مكتب محاماة، لا الاثنان معاً. فيه: اسم المكتب بالعربية والإنجليزية، العنوان، الهاتف، البريد، الموقع، لون التمييز (الافتراضي ذهبي المنصة `#C8A762`)، ومسار شعار المكتب إن رُفع.
- **رقم الترخيص لا يُخزَّن هنا.** يُقرأ من الملف الموثّق (`lawyer_profiles` / `firm_profiles`) ولا يُطبع إلا إذا كانت حالة التوثيق «موثّق».
- **من يقرأ ويكتب:**
  - خزنة المحامي: المحامي نفسه فقط، وحسابه حساب محامٍ.
  - خزنة المكتب: مالك المكتب، أو عضو **نشط** بدور «الشريك المدير» أو «مدير المكتب» — نفس من تسمح لهم لوحة المكتب بصفحة الهوية اليوم.
  - لا أحد غيرهم: لا زميل، ولا موكل، ولا زائر، ولا المشرف.
- **مسار الشعار** يكتبه الخادم وحده بعد التحقق من الصلاحية، لا الجلسة. ولا تحذف الجلسة الخزنة (المسح = تفريغ الحقول).
- **حاوية تخزين `branding`** خاصة (غير عامة): ١ ميجابايت، PNG وJPEG وWebP فقط. **SVG مرفوض** لأنه قد يحمل نصاً برمجياً. الخادم يفحص أيضاً بصمة الملف الفعلية، لا امتداده فقط.
- إن رفض المحرر الكتابة في `storage.buckets` تظهر رسالة تحذير لا خطأ، والملف 64 ينشئ الحاوية نفسها.
- ينتهي بالرسالة `20261026_63 verify: OK`.

**ماذا يضيف 64:** أربع سياسات تخزين للحاوية `branding` (قراءة/رفع/تعديل/حذف) تحصر كل جلسة في مجلد خزنتها: `u/<معرّف المحامي>/…` أو `f/<معرّف المكتب>/…`، ويحذف أي سياسة أخرى قد تطابق هذه الحاوية (يطبع قائمتها أولاً — احفظها). لا يمسّ سياسات `documents` ولا أي حاوية أخرى؛ وإعادة تنفيذ الملف 17 بعده لا تمسّ سياساته (مُختبَر). ينتهي بالرسالة `storage_policies_branding: OK`.

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 64_AFTER_63_storage_policies_branding.sql
```

**إن نُشر الكود قبل 63:** لا يتعطّل شيء. صفحتا «الورق المروّس» تعرضان «يتطلب تحديث قاعدة البيانات» ولا تحفظان شيئاً، ويبقى الخطاب قابلاً للطباعة بالاسم من الملف الشخصي دون شعار المكتب.
**إن لم يُنفَّذ 64:** التطبيق يعمل (الرفع والعرض عبر الخادم بعد فحص الصلاحية)، لكن `_verify.sql` يُظهر تحذيراً حتى يُنفَّذ.

`_verify.sql` (يدوياً، الأمر في قسم 62): يجب أن يظهر `_verify: 20261026_63 OK`.

**فحص الخادم:** رفع الشعار يمرّ عبر nginx إلى `/api/v1/branding/logo` (حتى ١ ميجابايت + غلاف الطلب). حدّ nginx الافتراضي `client_max_body_size 1m` قد يرفض شعاراً قريباً من الحد. رفع صورة الترخيص يتطلب أصلاً `client_max_body_size 6m;` — تأكد أنه مضبوط على مستوى الموقع كله لا على مسار الترخيص وحده.

**للتراجع (يدوياً):** احذف سياسات التخزين الأربع `branding … own`، ثم الجدول `branding_vaults`، ثم الدوال `can_manage_branding_object` و`can_manage_branding_vault` و`branding_vaults_touch`. الحاوية `branding` تُفرَّغ وتُحذف من Studio إن أردت.

### الاختبار (Docker محلي فقط)

```bash
T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
  $T/prelude_storage_objects_stub.sql $T/prelude_storage_buckets_stub.sql \
  $M/20261026_63_branding_vault.sql $M/20261026_63_branding_vault.sql \
  supabase/storage_policies_branding.sql supabase/storage_policies_branding.sql \
  $T/branding_vault.test.sql
```

**English summary.** Run `63_BEFORE_DEPLOY_20261026_63_branding_vault.sql` in the SQL editor before the deploy, then `64_AFTER_63_storage_policies_branding.sql` as `supabase_admin` (storage.objects is owned by supabase_storage_admin; the editor's postgres role gets 42501). 63 adds `branding_vaults` (exactly one of `lawyer_user_id` / `firm_id`), managed only by the lawyer himself or the firm's owner / active managing partner / active office admin (`can_manage_branding_vault`, SECURITY DEFINER); `logo_path` is server-only (column grants + a CHECK tying it to the vault's own folder); no session DELETE; licence numbers are not stored (read from the verified profile at print time). It upserts the private `branding` bucket (1 MB, png/jpeg/webp, no SVG). 64 adds four owner-only Storage policies over `u/<uid>/…` and `f/<firm id>/…` (`can_manage_branding_object`, false for any malformed name) and drops any other policy that could match the bucket. Code deployed before 63 shows «يتطلب تحديث قاعدة البيانات» and saves nothing; without 64 the app still works (service role after an RLS check) and `_verify` warns. The owner's old `20261019_vault_lawyer_branding.sql` must not be run. Server check: the logo upload goes through nginx (≤ 1 MB plus multipart overhead); make sure `client_max_body_size` (already required at 6m by the licence-image upload) covers `/api/v1/branding/logo`, not only the licence route.

---

## 65: ربط مسار الملف بصاحبه (إصلاح أمني — المراجعة المستقلة، البند ١)

`65_BEFORE_DEPLOY_20261026_65_attachments_path_ownership.sql` نسخة مطابقة من `supabase/migrations/20261026_65_attachments_path_ownership.sql`.

**هذه ثغرة مفتوحة على الإنتاج اليوم — نفّذ الملف قريباً، ولا تنتظر النشر.** لا يحتاج نشر كود: كل طرق الرفع في التطبيق تلتزم بالقاعدة أصلاً (فُحصت واحدة واحدة، القائمة أدناه)، فيُغلق الملف الثغرة للصفوف الجديدة لحظة تنفيذه.

**الثغرة:** روابط تحميل المستندات (المرفق الواحد، المستند المسلَّم، نسخة العقد، «تحميل الكل (ZIP)»، ورابط المشاركة) توقّع مسار الملف المسجّل في الجدول بصلاحية الخادم الكاملة. وقاعدة البيانات لم تكن تربط هذا المسار بمن سجّله. فكان يمكن لأي مستخدم مسجّل، عبر واجهة قاعدة البيانات مباشرة، أن:
- يسجّل صفاً على طلبه هو يشير إلى ملف مستخدم آخر، ثم يحمّله؛
- يغيّر مسار مستند في خزنته ليشير إلى ملف غيره؛
- يضع ملفاً في قضية شخص آخر يعرف رقم طلبها.

**القاعدة بعد الملف** (للجلسات فقط؛ الخادم بصلاحية `service_role` لا يتأثر):
- `attachments`: المستخدم يسجّل المستند باسمه هو، والملف داخل مجلده هو (`<معرّفه>/…`)، وعلى طلب هو صاحبه أو المحامي المسند إليه، أو بلا طلب (الخزنة). بعد التسجيل لا يتغيّر المسار ولا صاحب المستند ولا الطلب.
- `contract_versions`: النسخة يسجّلها رافعها باسمه، والملف في مجلده. بعد التسجيل لا يتغيّر المسار ولا العقد ولا الرافع.
- يحذف الملف **كل** سياسات الإدراج القديمة على `attachments` (منها سياسة 20260518 التي كانت تقبل أي صاحب وأي مسار) ويضع سياسة واحدة. يطبع أسماء ما حذفه.
- فهرس جديد على `service_requests (requester_user_id)`.

**الصفوف القديمة لا تُعدَّل.** لكن روابط التحميل في الكود الجديد ترفض أي صف مساره خارج مجلد صاحبه. إن ظهر في نهاية الملف تحذير بعدد صفوف كهذه، فشغّل الاستعلام المطبوع معه وأرسل النتيجة للمراجعة: قد يكون صفاً مزوّراً.

**طرق الرفع التي فُحصت:**

| الطريق | من يكتب | شكل المسار |
|---|---|---|
| `POST /api/v1/documents` (كل رفع مستند، ومنه تسليم المشرف ومستندات القضية) | الجلسة | `<uid>/<ms>-<name>`، والطلب يفحصه الطريق نفسه (صاحب الطلب أو المسند إليه) |
| `POST /api/v1/lawyer/contracts/[id]/versions` | الجلسة | `<uid>/contracts/<id>/<ms>-<name>`، `uploaded_by` = المستخدم |
| الأرشفة والاسترجاع والحجز القانوني | الجلسة | تعدّل `deleted_at` / `deleted_by` / `legal_hold` / `hold_reason` فقط |
| `documents/[id]/copy`، ربط المستند بالطلب، تنظيف السلة | `service_role` | لا تتأثر |

**ترتيب التنفيذ:** في أي وقت، قبل النشر أو بعده. يجب أن تظهر في نهايته `20261026_65 verify: OK`. وفي `_verify.sql` (يدوياً، الأمر في قسم 62): `_verify: 20261026_65 OK`.

**تنبيه:** أي جهة خارج هذا المستودع تكتب في الجدولين **بجلسة مستخدم** (تطبيق جوال، أو سير عمل n8n بتوكن مستخدم) تخضع للقاعدة نفسها. ما يكتب بمفتاح `service_role` لا يتأثر.

**ما لا يغلقه هذا الملف (للمتابعة):** جدول `document_shares` — سياسته تسمح للمستخدم بإدراج رابط مشاركة بأي مسار ملف وبرمز يختاره، وصفحة التحقق من الرابط توقّعه بصلاحية الخادم. هذه ثغرة من النوع نفسه وتحتاج ملفاً مستقلاً.

**للتراجع (يدوياً):** الأوامر في رأس الملف.

### الاختبار (Docker محلي فقط)

```bash
M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
  $M/20260903_phase2_clients_and_firm_membership.sql $M/20260904_phase5_deadline_radar.sql \
  $M/20260905_phase3_consultations_and_contracts.sql $M/20260910_case_notes.sql \
  $M/20261017_41_notes_visibility_case_team.sql \
  $T/prelude_attachments_live.sql $T/prelude_attachments_stray_insert_policies.sql \
  $M/20261025_51_soft_delete_case_notes_docs.sql \
  $M/20261026_65_attachments_path_ownership.sql $M/20261026_65_attachments_path_ownership.sql \
  $T/attachments_path_ownership.test.sql
```

---

**English summary.** `65_BEFORE_DEPLOY_20261026_65_attachments_path_ownership.sql` is identical to `supabase/migrations/20261026_65_attachments_path_ownership.sql`. **It closes a hole that is live on production today, so run it soon; it needs no code deploy** — every upload path in the app already complies (table above).

The hole: the download routes sign `storage_path` with the service role, and nothing tied that column to its writer. Through raw PostgREST a session could register an attachments row on its own request pointing at another user's file, re-point a vault document, or plant a file into a case whose id it knew (and the 20260518 INSERT policy accepted any owner and any path).

After 65, for sessions only (`postgres` / `service_role` / `supabase_admin` pass, as in 20261018_04):
- attachments: insert as yourself, a file in your own folder, on no request or one you filed / are assigned to; `storage_path`, `owner_user_id` and `request_id` never change.
- contract_versions: insert as yourself (`uploaded_by` = you), a file in your own folder; `storage_path`, `contract_id` and `uploaded_by` never change (`uploaded_by` may go to NULL — the FK's ON DELETE SET NULL).
- Enforced by SECURITY INVOKER triggers (`trg_00_…`, first BEFORE triggers) and one replacement INSERT policy. Every other INSERT policy on attachments is dropped by catalogue scan, and the dropped names are printed.
- An index on `service_requests (requester_user_id)`.

Existing rows are not rewritten. The new routes refuse any row whose path is outside its writer's folder, and the file warns with a count and a query if any exist. Writers outside this repo that use a user JWT are guarded the same way.

Not closed here: `document_shares` (FOR ALL, `owner_id = auth.uid()`) lets a session insert any `document_path` with a token it chose, and `/api/v1/share/[token]/verify` signs it with the service role. That is the same class of hole and needs its own file.

`deploy.sh` does not run `_verify.sql`; when you run it by hand, expect `_verify: 20261026_65 OK`.
