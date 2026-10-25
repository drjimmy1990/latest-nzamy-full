# دفعة 2026-10-26 (أجوبة المالك ٢٥ أكتوبر): ترتيب التنفيذ والنشر

**الحالة:** لم يُنفَّذ شيء من هذه الدفعة على الإنتاج بعد. كل SQL على الإنتاج ينفذه المستخدم في محرر Supabase، بعد نسخة احتياطية ومراجعة نتيجة كل ملف.

*English, short:* run `01_NOW_…` in the Supabase SQL editor **now** — it needs no code deploy — then `02_NOW_AFTER_01_…` (owner ٢٧٨ (أ): the unpaid founder badges go, the library days stay). Run `10_BEFORE_DEPLOY_…` (P1, quarterly and half-yearly billing) and `20_BEFORE_DEPLOY_…` (P7, coupons server only) before deploying this batch's code. Nothing checks it at deploy time (`deploy.sh` does not run `_verify.sql`), so P2 must refuse quarterly / half-yearly in code until the database accepts them. Later files of this batch are added here as they are built.

## ترتيب التنفيذ (ملخص)

| # | الملف | متى | ملاحظة |
|:--:|---|---|---|
| 1 | `01_NOW_20261026_01_founder_no_signup_grant.sql` | **الآن، وقبل أي نشر** | يوقف منح شارة المؤسس وأيام المكتبة عند التسجيل. لا يحتاج نشر كود. نفّذه قبل نشر كود هذه الدفعة، لأن النشر لا يتحقق منه تلقائياً |
| 2 | `02_NOW_AFTER_01_20261026_02_founder_badges_unpaid_removed.sql` | **الآن، بعد 01 مباشرة** | قرار المالك ٢٧٨ (أ): يسحب شارة «المحامي المؤسس» غير المدفوعة ممن سجّلوا منذ بدء الحملة، ويُبقي أيام المكتبة الـ ٩٠ حتى تنتهي. يتوقف دون أي تغيير إن لم يُنفَّذ 01 قبله. لا يحتاج نشر كود |
| 3 | `10_BEFORE_DEPLOY_20261026_10_billing_cycles.sql` | **قبل نشر كود الدفعة** | يسمح بدورتي الاشتراك الربع السنوية والنصف السنوية في الطلبات والاشتراكات، ويضيف عمودَي سعرهما للباقات. لا يغيّر أي سعر. النشر لا يتحقق منه تلقائياً، فنفّذه قبل النشر |
| 4 | `20_BEFORE_DEPLOY_20261026_20_coupons_server_only.sql` | **قبل نشر كود الدفعة** | P7: أكواد الخصم تُتحقَّق في الخادم فقط. يُغلق قراءة الأكواد على الجميع، ويضيف قواعد المالك (حد أدنى، سقف ٢٥٪، مرة لكل مستخدم، طلب دفع واحد مفتوح للكود، لا خصم على شحن النقاط)، ويوقف الكود القديم `LAUNCH2026` دون تغيير قيمه. الكود يعمل قبله وبعده، لكن الأكواد تبقى مقروءة للجميع حتى يُنفَّذ. قبله: استعلام قراءة للأكواد الفعّالة تُرسل نتيجته للمالك |
| — | `11_…` فما بعد | لاحقاً | محجوزة للمراحل التالية من هذه الدفعة |

## 01: إيقاف منح «المحامي المؤسس» عند التسجيل (P0، عاجل)

`01_NOW_20261026_01_founder_no_signup_grant.sql` نسخة مطابقة من `supabase/migrations/20261026_01_founder_no_signup_grant.sql`.

**لماذا الآن:** قرار المالك (٢٥ أكتوبر): لا شارة ولا مقعد مؤسس ولا ٣ أشهر مكتبة بمجرد التسجيل المجاني. لكن آلية الحملة على الإنتاج (`20261021_50`) ما زالت تمنح كل محامٍ أو مستشار يسجّل منذ ٢٥ أكتوبر الشارة و٩٠ يوماً من المكتبة تلقائياً. كل تسجيل قبل تنفيذ هذا الملف يأخذها.

**ماذا يفعل:**
- يحذف المشغّل `trg_lawyer_profiles_founder` ودالته `lawyer_profile_founder_campaign()`. بعدها لا يمنح التسجيل شارة ولا أيام مكتبة.
- **يُبقي** عمود `founder_badge`، والدالة `founder_campaign_active()`، والإعداد `founder_campaign` بقيمته كما هي. تحتاجها عضوية المحامي المؤسس المدفوعة (المرحلة P3).
- **لا يمس** الشارات وأيام المكتبة التي مُنحت قبل تنفيذه. أجاب المالك عن السؤال ٢٧٨ بالخيار (أ): الملف `02` التالي يسحب الشارات غير المدفوعة ويُبقي أيام المكتبة.
- يعدّل وصف العمود ووصف الإعداد ليقولا الحقيقة: لا شيء يُمنح عند التسجيل، والشارة لاحقاً بالعضوية المدفوعة فقط.

**التنفيذ:**
1. افتح محرر SQL في Supabase، والصق محتوى الملف كاملاً، ونفّذه.
2. يجب أن تظهر في نهايته الرسالة `20261026_01 verify: OK`، ومعها عدد الشارات وعدد منح المكتبة `lib-founder` التي أُعطيت حتى الآن.
3. إن توقف بالرسالة `canceling statement due to lock timeout` فلم يتغير شيء: قراءة طويلة كانت تمسك جدول المحامين. أعد التنفيذ بعد لحظات.
4. نفّذ الاستعلامين التاليين. الرقم الثاني يُنقل إلى المالك مع السؤال ٢٧٨:

```sql
select tgname from pg_trigger where tgname='trg_lawyer_profiles_founder';
-- المتوقع بعد التنفيذ: لا صفوف (0 rows)

select count(*) from public.lawyer_profiles where founder_badge;
-- عدد من حصلوا على الشارة منذ بدء الحملة — للسؤال ٢٧٨
```

**الملف قابل لإعادة التشغيل**، داخل `begin … commit`، ومهلة القفل فيه ٥ ثوانٍ، وينتهي بـ `notify pgrst, 'reload schema'`.

**قبل النشر:** `deploy.sh` **لا** يشغّل `_verify.sql`؛ أُزيلت هذه الخطوة منه في ٢٥ سبتمبر. فلا شيء يوقف النشر إن نُسي هذا الملف، وعندها يبقى المشغّل يمنح الشارة بصمت حتى بعد اختفاء الشريط. لذلك نفّذه **قبل** نشر كود هذه الدفعة. للتحقق يدوياً، نفّذ على الخادم من مجلد المشروع:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify:|ERROR"
```

يجب أن يظهر `_verify: 20261026_01 OK`. وإن ظهر خطأ في قسم `20261026_01`، فالمشغّل ما زال موجوداً (أو أعاد أحد تنفيذ `20261021_50`): أعد تنفيذ هذا الملف.

**الشريط (البنر):** نص «سجّل الآن واحصل على ٣ أشهر من المكتبة القانونية مجاناً وشارة المؤسس» يُخفى مع **نشر الكود** لا مع هذا الملف: الكود الجديد لا يعرض شريط المؤسس حتى تُتاح العضوية المدفوعة. بين تنفيذ الملف والنشر يبقى الشريط يعد بهدية لم تعد تُمنح. إن أردتم إخفاءه فوراً، أفرغوا تاريخي «حملة المحامي المؤسس» في `/dashboard/admin/settings` واحفظوا. لا شيء آخر يقرأ هذين التاريخين الآن. القرار لكم، ويمكن إعادة التاريخين لاحقاً.

**للتراجع** (يعيد منح الهدية عند التسجيل، فلا يكون إلا بموافقة مكتوبة من المالك): أعد تنفيذ `supabase/migrations/20261021_50_founder_campaign.sql`، واحذف قسم `verify:founder_no_signup_grant` من `_verify.sql`، وإلا فشل التحقق اليدوي التالي.

## 02: سحب شارة «المحامي المؤسس» غير المدفوعة (السؤال ٢٧٨، بعد 01)

`02_NOW_AFTER_01_20261026_02_founder_badges_unpaid_removed.sql` نسخة مطابقة من `supabase/migrations/20261026_02_founder_badges_unpaid_removed.sql`.

**لماذا:** جواب المالك عن السؤال ٢٧٨ (الخيار أ، ٢٦ أكتوبر): من سجّلوا منذ بدء الحملة تُسحب منهم الشارة غير المدفوعة، وتبقى لهم أيام المكتبة الـ ٩٠ حتى تنتهي مدتها. العضوية المدفوعة لم تُبنَ بعد (المرحلة P3)، فكل شارة موجودة اليوم غير مدفوعة.

**ماذا يفعل:**
- يتوقف **دون أي تغيير** إن كان المشغّل `trg_lawyer_profiles_founder` ما زال موجوداً، برسالة تطلب تنفيذ `01_NOW_…` أولاً.
- ينشئ جدول سجلّ صغيراً `founder_badge_removals`: من سُحبت شارته ومتى. لا يقرؤه إلا مفتاح الخدمة.
- يسجّل فيه كل من يحمل الشارة **بلا طلب دفع مدفوع لعضوية المؤسس**، ثم يُطفئ شارتهم. اليوم هذا يعني كل الشارات.
- **لا يمس** جدول `library_access_grants` إطلاقاً. أيام المكتبة تنتهي وحدها في موعدها. يتحقق الملف من ذلك بنفسه، ويتراجع عن كل شيء إن تغيّر صف واحد.

**التنفيذ:**
1. بعد نجاح `01`، افتح محرر SQL في Supabase، والصق محتوى الملف كاملاً، ونفّذه.
2. يجب أن تظهر في نهايته الرسالة `20261026_02 verify: OK`، ومعها عدد الشارات المسحوبة وعدد منح المكتبة `lib-founder` الباقية.
3. إن توقف بالرسالة `canceling statement due to lock timeout` فلم يتغير شيء. أعد التنفيذ بعد لحظات.
4. للتأكد:

```sql
select count(*) from public.lawyer_profiles where founder_badge;
-- المتوقع: 0

select count(*) from public.founder_badge_removals;
-- عدد من سُحبت منهم الشارة — للمالك

select count(*) from public.library_access_grants
 where plan_ref = 'lib-founder' and ends_at > now();
-- منح المكتبة الباقية: لم يتغير
```

**الملف قابل لإعادة التشغيل**، داخل `begin … commit`، ومهلة القفل فيه ٥ ثوانٍ، وينتهي بـ `notify pgrst, 'reload schema'`. إعادة تشغيله لا تغيّر شيئاً، إلا أن تعود شارة لمن لم يدفع فيطفئها مجدداً.

**تنبيه للمرحلة P3:** الملف يُبقي الشارة لمن له طلب في `payment_orders` حالته `paid` واسم بنده يحوي `founder`. إن بيعت العضوية المدفوعة بطريقة أخرى فيجب تعديل هذه القاعدة في الملف نفسه قبل أي إعادة تشغيل بعد P3.

**التحقق اليدوي:** `deploy.sh` **لا** يشغّل `_verify.sql`. نفّذه بيدك كما في قسم 01، ويجب أن يظهر `_verify: 20261026_02 OK`. يكتفي القسم بتنبيه ما دام الملف لم يُنفَّذ، ويذكر عدد الشارات الباقية دون أن يتوقف. يتوقف بخطأ فقط إن نُفِّذ الملف ثم اختفى جدول السجلّ، أو صار الجدول مفتوحاً للجلسات.

*English:* clears every `lawyer_profiles.founder_badge` that has no paid founder order (`payment_orders` status `paid`, `item_id` containing `founder`; none exists before P3, so today that is every badge), recording each user id in the service-role-only `founder_badge_removals`. It never writes `library_access_grants` (hash-checked inside the transaction). It refuses to run before 01. Expect `20261026_02 verify: OK`. Idempotent. Docker-proved: 02 run three times, a no-op re-run, and a paid badge kept after a P3-shaped order: `supabase/tests/rls/founder_badges_unpaid_removed.test.sql`.

**للتراجع** (يعيد الشارات غير المدفوعة، فلا يكون إلا بموافقة مكتوبة من المالك): الأمر في رأس الملف، تحت `ROLLBACK`.

## 10: الدورتان الربع سنوية والنصف سنوية (P1، قبل النشر)

`10_BEFORE_DEPLOY_20261026_10_billing_cycles.sql` نسخة مطابقة من `supabase/migrations/20261026_10_billing_cycles.sql`.

**لماذا:** وثيقة التسعير المعتمدة (٢٥ أكتوبر، القاعدة ١) تبيع المحامين والمكاتب والشركات والمنشآت والجمعيات ومقدمي الخدمات اشتراكاً ربع سنوي (٣ أشهر) أو نصف سنوي (٦ أشهر) أو سنوي، وتتيح للأفراد الشهري أيضاً. الكود يعرف الدورتين الجديدتين منذ P1، لكن قاعدة البيانات ترفضهما في موضعين:
- قيد `payment_orders_billing_check` في طلبات الدفع (شهري / سنوي / دفعة واحدة فقط).
- قيد `billing_cycle` في جدول الاشتراكات. بدون هذا الملف يُدفع الطلب الربع سنوي ولا يُفعَّل الاشتراك أبداً.

**ماذا يفعل:**
- يوسّع القيدين إلى: شهري، ربع سنوي، نصف سنوي، سنوي، ودفعة واحدة للطلبات. ويبقى «مخصص» للاشتراكات التي يمنحها المشرف.
- يضيف للباقات عمودَي `price_quarterly` و`price_semiannual`، فارغين لكل الباقات. **لا يغيّر أي سعر** ولا يمس أي صف قائم.
- يتوقف دون أي تغيير إن وجد صفاً بقيمة دورة غير معروفة، ويذكر القيمة.

**التنفيذ:**
1. افتح محرر SQL في Supabase، والصق محتوى الملف كاملاً، ونفّذه.
2. يجب أن تظهر في نهايته الرسالة `20261026_10 verify: OK`.
3. إن توقف بالرسالة `canceling statement due to lock timeout` فلم يتغير شيء. أعد التنفيذ بعد لحظات.

**الملف قابل لإعادة التشغيل**، داخل `begin … commit`، ومهلة القفل فيه ٥ ثوانٍ، وينتهي بـ `notify pgrst, 'reload schema'`.

**قبل النشر وبعده:** كود P1 يعمل قبل الملف وبعده، لأنه لا يبيع أي باقة بدورة ربع أو نصف سنوية بعد.

**لا شيء يوقف النشر:** `deploy.sh` **لا** يشغّل `_verify.sql`، كما في قسم 01. قسم `verify:billing_cycles` فيه فحص يدوي فقط، تشغّله بالأمر المذكور في قسم 01:
- **يكتفي بتنبيه** ما دام الملف لم يُنفَّذ؛
- **يتوقف بخطأ** إن نُفِّذ جزئياً أو عاد قيد ضيّق، كأن تُستعاد نسخة قديمة من المخطط. الحل حينها: أعد تنفيذ الملف.

**المرحلة P2** (أول سعر ربع سنوي أو نصف سنوي): نفّذ هذا الملف قبل نشرها. ولأن النشر لا يتحقق منه، يجب أن يرفض كود P2 نفسه البيع بهاتين الدورتين إلى أن يتأكد فحصٌ وقت التشغيل أن قاعدة البيانات تقبلهما.

*English:* widens the `payment_orders.billing` and `subscriptions.billing_cycle` checks to monthly / quarterly / semiannual / yearly (+ `once` / `custom`), and adds the nullable `subscription_plans.price_quarterly` / `price_semiannual` columns. It writes no price and touches no row. Expect `20261026_10 verify: OK`. Idempotent. Run it before this batch deploys. Nothing enforces that: `deploy.sh` does not run `_verify.sql`, so P2's code must refuse quarterly / half-yearly until a runtime probe shows the database accepts them. Docker-proved twice, with a restore-shaped narrowing between the runs: `supabase/tests/rls/billing_cycles.test.sql`.

**للتراجع** (فقط ما دام لا يوجد طلب أو اشتراك بدورة ربع أو نصف سنوية): الأوامر في رأس الملف، تحت `ROLLBACK`.

## 20: أكواد الخصم في الخادم فقط (P7، قبل النشر)

`20_BEFORE_DEPLOY_20261026_20_coupons_server_only.sql` نسخة مطابقة من `supabase/migrations/20261026_20_coupons_server_only.sql`.

**لماذا:** وثيقة التسعير (٢٥ أكتوبر، §١٣أ) وجواب المالك ٢٧٩. قبل هذا الملف:
- كان أي زائر يستطيع قراءة كل أكواد الخصم الفعّالة وقيمها عبر واجهة البيانات (السياسة «anyone can read active coupons»)، وكانت صفحة المحفظة تعرض القائمة كاملة لكل عميل.
- كان أي مستخدم مسجّل يستطيع أن يكتب لنفسه صفوفاً في سجل استخدام الكوبونات.
- لم تكن أي من قواعد المالك مطبّقة.

**ماذا يفعل:**
- يحذف كل السياسات على جدولي `coupons` و`coupon_usage`، ويسحب كل صلاحيات الزوار والمستخدمين المسجّلين عليهما. لا يقرؤهما ولا يكتب فيهما إلا الخادم بمفتاح الخدمة.
- يضيف عمودين:
  - `max_discount_pct`: سقف الخصم، ٢٥٪ من صافي الطلب قبل الضريبة، ولا يقبل أكثر منه.
  - `excluded_kinds`: أنواع الطلبات المستثناة، وفيها شحن النقاط دائماً.
- يمنع استخدام الكوبون أكثر من مرة للمستخدم الواحد، وأكثر من مرة للطلب الواحد.
- يمنع أن يحمل المستخدم الواحد الكوبون نفسه في **أكثر من طلب دفع مفتوح أو مدفوع** في الوقت نفسه (قيد `payment_orders_coupon_once_key`). كان يمكن فتح صفحتي دفع لمنتجين مختلفين بالكود نفسه ودفع الاثنتين بالخصم. لا تُحسب الطلبات المغلقة، ولا الدفع التجريبي، ولا الطلب الذي دُفع ولم يُمنح فيه شيء لأن صاحبه يملك باقة أعلى.
- يُبقي عدّاد الاستخدام `used_count` مطابقاً لسجل الاستخدام: يزيد عند التسجيل، **وينقص عند الحذف** (إلغاء العملية خلال ٩٠ دقيقة يُعيد الكوبون لصاحبه)، ولا ينزل تحت الصفر.
- يضبط الكودين اللذين حدّدهما المالك:
  - `NZAMY50`: خصم ٥٠ ر.س، بحد أدنى ٢٠٠ ر.س من صافي الطلب قبل الضريبة.
  - `NEWCLIENT`: خصم ٧٥ ر.س لأول طلب خدمة مفردة، بحد أدنى ٣٠٠ ر.س. **ملاحظة:** الدفع الإلكتروني اليوم يبيع الباقات والمكتبة وشحن النقاط فقط، ولا يبيع خدمة مفردة، فلا يمكن استخدام هذا الكود في الدفع الإلكتروني بعد.
  - لا يغيّر حالة التفعيل ولا التواريخ إن كان المشرف عدّلها، ولا ينشئ أي كود آخر.
  - **تُكتب قواعد المالك مرة واحدة فقط**، ويُختم الصف بذلك (`metadata.owner_rules`). إعادة تنفيذ الملف لا تكتبها ثانية، فأي تعديل يجريه المشرف بعدها من صفحة الكوبونات يبقى. إن اختلفت قيم الكود عن قواعد المالك يذكر الملف ذلك في رسالة، ولا يتوقف.
- **يوقف كل كود فعّال آخر** أُدخل بغير صفحة الكوبونات في لوحة المشرف، **دون تغيير قيمته**، ويذكر أسماءها في رسالة. السبب: قبل هذه الدفعة لم يكن أي كود يُستبدل فعلاً، وبعد النشر يقبل الدفع كل كود فعّال. أهم هذه الأكواد `LAUNCH2026` من البيانات الأولى القديمة (خصم ٢٥٪، ٥٠٠ استخدام، بلا حد أدنى، وكان مقروءاً للجميع)، وهو ليس من كودَي المالك.
  - **انقل للمالك** أسماء الأكواد التي تظهر في الرسالة `20261026_20: switched off …`.
  - يستطيع المشرف إعادة تفعيل أي منها من صفحة الكوبونات. وإعادة تنفيذ الملف لا تُلغي ذلك.
  - الأكواد التي أنشأها المشرف من صفحة الكوبونات لا تُمس.
- **يذكر في رسالة كل كود يبقى فعّالاً** غير كودَي المالك (أنشأه المشرف، أو أعاد تفعيله)، مع نوعه وقيمته وحده الأدنى وعدد استخداماته: الدفع يقبله بعد النشر. الرسالة تبدأ بـ `20261026_20: active codes besides NZAMY50 / NEWCLIENT`.
- يتوقف **دون أي تغيير** إن وجد في سجل الاستخدام صفين لنفس الكوبون ونفس المستخدم، أو لنفس الطلب، ويذكرهما.

**كيف يُطبَّق الخصم في الكود:**
- يُحسب الخصم داخل إنشاء طلب الدفع، فيُخزَّن الطلب بصافيه بعد الخصم.
- تُحسب الضريبة ١٥٪ على الصافي بعد الخصم.
- يُطالَب ميسّر بهذا الإجمالي نفسه، والاسترداد يعيد المبلغ المدفوع فعلاً.
- يُسجَّل استخدام الكوبون عند نجاح الدفع **ومنح ما دُفع له** فقط. الطلب الذي فشل دفعه، أو دُفع ولم يُمنح فيه شيء، أو كان دفعاً تجريبياً، لا يستهلك الكوبون. إلغاء العملية خلال ٩٠ دقيقة يُعيده، والاسترداد بعدها لا يُعيده.
- لا يقبل الدفع الكود إن كان المستخدم يحمله في طلب آخر مفتوح لم تنتهِ مهلته («هذا الكود مستخدم في طلب آخر قيد الدفع — أكمل ذلك الطلب أو ألغِه»). الطلب المفتوح الذي انتهت مهلته ولم يصله دفع يُغلق تلقائياً عند المحاولة التالية.
- إنشاء كوبون خصم جديد من لوحة المشرف يتطلب الآن حداً أدنى للطلب، ولا يقبل سقفاً فوق ٢٥٪، ويستثني شحن النقاط دائماً.

**قبل التنفيذ (قراءة فقط، لا تغيّر شيئاً):** نفّذ هذا الاستعلام، **وأرسل نتيجته للمالك**. هذه هي الأكواد الفعّالة اليوم، وبعد النشر يقبلها الدفع كلها ما لم يوقفها الملف:

```sql
select code, discount_type, discount_value, min_order_amount, max_uses, used_count,
       metadata->>'created_by_admin' as created_by_admin, valid_until
  from public.coupons where active order by code;
-- created_by_admin غير فارغ = أنشأه المشرف من صفحة الكوبونات (يبقى فعّالاً)
```

**التنفيذ:**
1. افتح محرر SQL في Supabase، والصق محتوى الملف كاملاً، ونفّذه.
2. يجب أن تظهر في نهايته الرسالة `20261026_20 verify: OK`.
3. إن توقف بالرسالة `canceling statement due to lock timeout` فلم يتغير شيء. أعد التنفيذ بعد لحظات.
4. إن توقف بالرسالة `payment_orders holds more than one open / paid / refunded order of one buyer carrying one coupon` فلم يتغير شيء: راجع الطلبات المذكورة قبل إعادة التنفيذ.
5. انقل للمالك سطرين:
   - `20261026_20: switched off (…): …` (الأكواد التي أُوقفت).
   - `20261026_20: active codes besides NZAMY50 / NEWCLIENT …` (الأكواد التي تبقى فعّالة، بقيمها).
6. للتأكد:

```sql
select code, discount_type, discount_value, min_order_amount, max_discount_pct, excluded_kinds, active
  from public.coupons order by code;
-- NZAMY50: fixed 50، حد أدنى 200، سقف 25، {topup}
-- NEWCLIENT: fixed 75، حد أدنى 300، سقف 25، {plan,library,topup}
-- LAUNCH2026 (إن وُجد): active = false، وقيمه كما هي
```

**الملف قابل لإعادة التشغيل**، داخل `begin … commit`، ومهلة القفل فيه ٥ ثوانٍ، وينتهي بـ `notify pgrst, 'reload schema'`.

**قبل النشر وبعده:** الكود يعمل قبل الملف وبعده. قبله يُخفى حقل الكوبون في صفحة الدفع، ويُرفض أي كود يُرسل للدفع (فلا يُحصَّل السعر كاملاً من عميل ينتظر خصماً). وصفحة المحفظة لم تعد تقرأ الأكواد أصلاً. **لكن الأكواد تبقى مقروءة لأي زائر عبر واجهة البيانات حتى يُنفَّذ هذا الملف**، فنفّذه قبل النشر أو معه.

**لا شيء يوقف النشر:** `deploy.sh` **لا** يشغّل `_verify.sql`. قسم `verify:coupons_server_only` فحص يدوي فقط، بالأمر المذكور في قسم 01:
- **يكتفي بتنبيه** ما دام الملف لم يُنفَّذ؛
- **يتوقف بخطأ** إن عادت سياسة أو صلاحية، أو اختفى أحد قيود «مرة واحدة» الثلاثة، أو توقف العدّاد عن متابعة الإضافة والحذف، أو غاب أحد كودَي المالك أو لم تُكتب قواعده عليه؛
- **ينبّه فقط** إن عدّل المشرف قيم كود من كودَي المالك بعد كتابة قواعده، ويذكر كل كود فعّال آخر.

*English:* drops every policy on `coupons` / `coupon_usage` and revokes anon / authenticated (service role only); adds `max_discount_pct` (≤ 25) and `excluded_kinds` (always `topup`), unique guards on `(coupon_id, user_id)` and `order_id`, a unique guard of one open / paid / refunded order per (buyer, coupon) on `payment_orders` (`payment_orders_coupon_once_key`; test-mode and already-entitled orders excluded), and a trigger that keeps `used_count` on insert AND delete (a void releases a redemption; floored at 0); writes the owner's rules ONCE on NZAMY50 (50 SAR, min 200 net) and NEWCLIENT (75 SAR, min 300 net, single services only — not usable online until checkout sells one) and stamps `metadata.owner_rules`, so a re-run keeps later admin edits (named in a NOTICE, never an error). Creates no other code; a NOTICE lists every code that stays active besides the two, with its values — send it and the read-only pre-run query's result to the owner. Every OTHER active code not created on the admin coupons page (LAUNCH2026 from the old seed: 25 %, 500 uses, no minimum) is switched off with its values kept and named in a NOTICE — before P7 nothing redeemed a code, after the deploy checkout honours every active row; an admin may switch one back on and a re-run does not undo that. Stops unchanged on duplicate redemptions or duplicate open couponed orders. Expect `20261026_20 verify: OK`. Idempotent. Docker-proved twice, with the old policies, an insert-only trigger and a dropped order guard restored between the runs and admin edits that must survive the second run, plus four negative controls: `supabase/tests/rls/coupons_server_only.test.sql`.

**للتراجع** (يعيد الأكواد مقروءة للجميع، فلا يكون إلا بموافقة المالك): الأوامر في رأس الملف، تحت `ROLLBACK`.
