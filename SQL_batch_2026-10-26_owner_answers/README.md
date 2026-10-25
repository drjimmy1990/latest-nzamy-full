# دفعة 2026-10-26 (أجوبة المالك ٢٥ أكتوبر): ترتيب التنفيذ والنشر

كل SQL على الإنتاج ينفذه المستخدم، بعد نسخة احتياطية ومراجعة نتيجة كل ملف. هذا الجدول هو **الترتيب الوحيد** لهذه الدفعة؛ ملفات `README_dash.md` و`README_lib.md` و`README_account.md` تشرح ملفاتها فقط وتحيل إليه. الترتيب جُرِّب كاملاً من أوله إلى آخره في Docker محلي.

## ترتيب التنفيذ (جدول واحد)

**من أين:**
- **محرر SQL** = محرر SQL في لوحة Supabase (دور `postgres`): الصق محتوى الملف كاملاً ونفّذه.
- **`supabase_admin`** = على الخادم، لأن سياسات التخزين لا تُنشأ من المحرر (يجيب `42501`):

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full/SQL_batch_2026-10-26_owner_answers && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < <file>
```

ضع اسم الملف مكان `<file>`.

| # | الملف | من أين | متى | أرسل لنا |
|:--:|---|---|---|---|
| 1 | `01_NOW_20261026_01_founder_no_signup_grant.sql` | محرر SQL | **الآن**، قبل أي نشر. «قد يكون نُفِّذ — إن نُفِّذ فلا تُعِده» | السطر `20261026_01 verify: OK …` (فيه عدد الشارات ومنح المكتبة) |
| 2 | `02_NOW_AFTER_01_20261026_02_founder_badges_unpaid_removed.sql` | محرر SQL | **الآن**، بعد 01. «قد يكون نُفِّذ — إن نُفِّذ فلا تُعِده» | السطر `20261026_02 verify: OK …` |
| 3 | `10_BEFORE_DEPLOY_20261026_10_billing_cycles.sql` | محرر SQL | قبل النشر | السطر `20261026_10 verify: OK …` |
| 4 | `20_BEFORE_DEPLOY_20261026_20_coupons_server_only.sql` | محرر SQL | قبل النشر | نتيجة استعلام القراءة الذي **قبله** (قسم 20 أدناه)، ثم السطر `20261026_20 verify: OK …` والسطران `20261026_20: switched off …` و`20261026_20: active codes besides NZAMY50 / NEWCLIENT …` |
| 5 | `50_ANY_TIME_20261026_50_smart_folders_grants.sql` | محرر SQL | في أي وقت — **إلا** إن كان ملف المالك الأصلي `20261025_01` (صلاحيات الكتابة على المجلدات) قد نُفِّذ يوماً على الإنتاج: فنفّذ 50 **مع النشر** (يسحب الكتابة المباشرة التي ما زالت طرق المجلدات في الكود المنشور اليوم تستعملها) | السطر `20261026_50 verify: OK …` |
| 6 | `51_ANY_TIME_20261026_51_feqh_books_series.sql` | محرر SQL | في أي وقت، وقبل تحميل المكتبة التالي | السطر `20261026_51 OK …` |
| 7 | `52_BEFORE_DEPLOY_20261026_52_library_search_relevance.sql` | محرر SQL | قبل النشر | السطر `20261026_52 verify: OK …` |
| 8 | `62_BEFORE_DEPLOY_20261026_62_tracking_links_v2.sql` | محرر SQL | قبل النشر | السطر `20261026_62 verify: OK …` |
| 9 | `63_BEFORE_DEPLOY_20261026_63_branding_vault.sql` | محرر SQL | قبل النشر | السطر `20261026_63 verify: OK …` |
| 10 | `64_AFTER_63_storage_policies_branding.sql` | **`supabase_admin`** (الأمر أعلاه) | بعد 63 مباشرة | السطر `storage_policies_branding: OK …` |
| 11 | `65_BEFORE_DEPLOY_20261026_65_attachments_path_ownership.sql` | محرر SQL | الآن (ثغرة مفتوحة اليوم). «قد يكون نُفِّذ — إن نُفِّذ فلا تُعِده» | السطر `20261026_65 verify: OK …` |
| 12 | `66_NOW_20261026_66_document_shares_path_ownership.sql` | محرر SQL | الآن، بعد 65. «قد يكون نُفِّذ — إن نُفِّذ فلا تُعِده» | السطر `20261026_66 verify: OK …` |
| 13 | `72_BEFORE_DEPLOY_20261026_72_file_folder_owner.sql` | محرر SQL | قبل النشر، بعد 65 و66، **وقبل 70** | السطر `20261026_72 verify: OK …` |
| 14 | `70_BEFORE_DEPLOY_20261026_70_account_deletion.sql` | محرر SQL | قبل النشر، بعد 72. قبله: استعلام القراءة في `README_account.md` | نتيجة استعلام القراءة، ثم السطر `20261026_70 verify: OK …` |
| 15 | `71_AFTER_70_storage_policies_documents_select.sql` | **`supabase_admin`** (الأمر أعلاه) | بعد 70، وقبل النشر | السطر `storage_policies_documents: OK …` |
| 16 | **نشر الكود** | الخادم | بعد كل ما سبق | — |
| 17 | `supabase/migrations/_verify.sql` | **`supabase_admin`**، بيدك | بعد النشر | كل الأسطر `_verify: 20261026_… OK` (الأمر تحت الجدول) |

**ملاحظات على الترتيب:**
- **إن أُعيد تنفيذ 66 بعد 72 فأعد تنفيذ 72** (66 يعيد فحص المشاركة القديم). ولا تُعِد ملف دفعة 2026-10-25 رقم 17 بعد 71.
- ملفا المالك الأصليان `20261025_01_smart_folders_authenticated_grants.sql` و`20261019_vault_lawyer_branding.sql` **لا يُنفَّذان**؛ 50 و63 يحلان محلهما.
- كل ملف قابل لإعادة التشغيل وينتهي بسطر تحقق. إن توقف أحدها بالرسالة `canceling statement due to lock timeout` فلم يتغير شيء: أعد تنفيذه بعد لحظات.

**بعد النشر: `_verify.sql` بيدك.** سكربت النشر `deploy.sh` **لا** يشغّل `_verify.sql`، فشغّله من المجلد نفسه:

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full/SQL_batch_2026-10-26_owner_answers && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < ../supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: (20261026_|71_AFTER_70)|ERROR"
```

المتوقع سطر `OK` لكل قسم من أقسام 20261026، وهي: `_verify: 20261026_01 OK`، `_02`، `_10`، `_20`، `_50`، `_51`، `_52`، `_62`، `_63`، `_65`، `_66`، `_70`، `_72`، ثم `_verify: 71_AFTER_70 OK`، ولا سطر `ERROR`. أرسل لنا الناتج كما هو.

*English, short:* one run order for the whole batch, verified end to end in Docker: 01 → 02 → 10 → 20 → 50 → 51 → 52 → 62 → 63 → 64 (as `supabase_admin`) → 65 → 66 → 72 → 70 → 71 (as `supabase_admin`) → deploy → `_verify.sql` by hand. 01, 02, 65 and 66 may already have run — do not re-run them if they did. 50 runs any time, unless the owner's original `20261025_01` grant file ever ran on production: then run 50 together with the deploy, because it removes the direct writes main's folder routes still use. `deploy.sh` does not run `_verify.sql`: run it with the command above and expect an OK line for every 20261026 section plus `_verify: 71_AFTER_70 OK`.

## 65 → 66 → 72 → 70 → 71: ملفات المستندات وحذف الحساب معاً (قبل النشر)

خمسة ملفات من مسارين، تعمل معاً بهذا الترتيب (وهو جزء من الجدول الواحد أعلاه). التفاصيل: 65 و66 في `README_dash.md`، و70 و71 في `README_account.md`، و72 هنا.

| الترتيب | الملف | من أين | متى |
|:--:|---|---|---|
| 1 | `65_BEFORE_DEPLOY_20261026_65_attachments_path_ownership.sql` | محرر SQL | الآن (ثغرة مفتوحة اليوم). إن كان نُفِّذ فلا تُعِده |
| 2 | `66_NOW_20261026_66_document_shares_path_ownership.sql` | محرر SQL | الآن، بعد 65. إن كان نُفِّذ فلا تُعِده |
| 3 | `72_BEFORE_DEPLOY_20261026_72_file_folder_owner.sql` | محرر SQL | **قبل نشر الكود**، بعد 65 و66، **وقبل 70** (إن حُذف حساب بينهما يبقى مستنده على القضية بلا صاحب ولا سجلّ نقل، فلا يعرف 72 مجلده) |
| 4 | `70_BEFORE_DEPLOY_20261026_70_account_deletion.sql` | محرر SQL | قبل نشر الكود |
| 5 | `71_AFTER_70_storage_policies_documents_select.sql` | على الخادم بدور `supabase_admin` (الأمر في `README_account.md`) | بعد 70 |

### لماذا الملف 72

- **الملف 65** وروابط التحميل تقدّم الملف فقط إذا كان مساره في مجلد **صاحب الصف الحالي**.
- **الملف 70** يغيّر صاحب الصف ولا يستطيع نقل الملف نفسه:
  - عند إخراج عضو من المكتب أو حذف حسابه، ينتقل مستند القضية إلى صاحب المكتب، ويبقى الملف في مجلد العضو.
  - مستند الحساب المحذوف على قضية فيها طرف آخر يبقى بلا صاحب.
  - نسخة العقد التي حُذف حساب رافعها يصبح رافعها فارغاً.
- النتيجة بدون 72: صاحب المكتب يرث مستندات **لا يستطيع أحد تحميلها**. التحميل والمستند المسلَّم و«تحميل الكل (ZIP)» والمشاركة كلها تجيب «غير موجود».
- وفي الاتجاه الآخر: قاعدة 65 تسمح للمستخدم بتسجيل أي ملف داخل مجلده. فكان يستطيع العضو المُخرَج أن يسجّل ملف المكتب الباقي في مجلده كمستند له في خزنته، ثم يأخذ نسخته عبر طرق الخادم (النسخ، المشاركة).

### ماذا يفعل 72

- يضيف عموداً `folder_owner_id` إلى `attachments` و`contract_versions`: صاحب المجلد الذي كُتب فيه الملف.
  - يُثبَّت عند التسجيل، ولا تغيّره أي جلسة بعد ذلك.
  - النقل لصاحب المكتب يغيّر صاحب الصف فقط، فيبقى المجلد مجلد العضو، ويبقى الملف قابلاً للتحميل لصاحبه الجديد.
  - قيد `CHECK` يمنع أي كاتب من تسجيل مجلد لا يقع فيه المسار.
- يملأ العمود للصفوف الحالية. الصفوف التي مسارها خارج مجلد صاحبها (مزوّرة قبل 65) تبقى فارغة، فتبقى مرفوضة.
- يمنع الجلسة من تسجيل مسار يملكه صف لمستخدم آخر. فلا يستعيد العضو المُخرَج ملفات المكتب الباقية في مجلده.
- يجعل فحص المشاركة في 66 (`can_share_attachment`) يقرأ المجلد المسجَّل، فيستطيع صاحب المكتب مشاركة مستند ورثه.
- لا يعدّل حارس 65 نفسه. يضيف مشغّلاً منفصلاً بعده، فإعادة تنفيذ 65 لا تلغيه.

**وفي 70** (لم يُنفَّذ بعد، فعُدِّل هو نفسه):
- إذا كان للعضو في خزنته نسخة من ملف للمكتب (مسجّلة على مسار مستند قضية أو نسخة عقد للمكتب)، تنتقل مع الملف إلى صاحب المكتب، ولا تُحذف.
- يتوقف بخطأ إن لم تكن دوال النقل مملوكة لـ`postgres` أو `supabase_admin`.

**لماذا لا يحتاج حارس 65 أي استثناء لعملية النقل:**
- حارس 65 يحكم على `current_user`.
- دوال النقل في 70 من نوع `SECURITY DEFINER`، فداخلها `current_user` هو مالكها (`postgres`)، وهو دور يثق به 65.
- ينطبق هذا على إخراج العضو من جلسة صاحب المكتب، وعلى حذف الحساب الذي ينفذه GoTrue بدور `supabase_auth_admin`.
- لذلك لا علامة خاصة (flag) ولا دور إضافي في 65. وقد ثبت ذلك في Docker.

### التنفيذ والتحقق

1. نفّذ 72 في محرر SQL. يجب أن تظهر في نهايته `20261026_72 verify: OK`.
2. **قبل نشر الكود.** الكود الجديد يقرأ `folder_owner_id`. قبل 72 يفشل كل تحميل مستند.
3. **إن أُعيد تنفيذ 66 بعد 72 فأعد تنفيذ 72.** الملف 66 يعيد فحص المشاركة القديم.
4. `deploy.sh` **لا** يشغّل `_verify.sql`. نفّذه بيدك على الخادم وابحث عن السطر `_verify: 20261026_72 OK`:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261026_(65|66|70|72)|_verify: 71_AFTER_70|ERROR"
```

- قسم `verify:file_folder_owner` يكتفي بتنبيه ما دام 72 لم يُنفَّذ.
- ويتوقف بخطأ في الحالات الآتية:
  - نقص مشغّل أو قيد؛
  - أُعيد 66 بعد 72؛
  - بقي صف في مجلد صاحبه بلا `folder_owner_id`؛
  - دوال النقل في 70 مملوكة لدور لا يثق به 65.

**الملف قابل لإعادة التشغيل**، داخل `begin … commit`، ومهلة القفل فيه ٥ ثوانٍ. **لا يحذف شيئاً.** للتراجع: الأوامر في رأس الملف تحت `ROLLBACK`.

### الاختبار (Docker محلي فقط)

سلسلة واحدة بترتيب الإنتاج، تنفّذ كل ملف مرتين، ثم تشغّل اختبارات حذف الحساب ومسارات المرفقات وروابط المشاركة واختبار التكامل. كل اختبار في معاملة تُلغى بعده. الأمر في رأس `supabase/tests/rls/batch_2026_10_26_integration.test.sql`، وفيه أيضاً ثلاثة اختبارات سلبية مسجّلة.

*English:*
- **Order.** 65 → 66 → **72** → 70 → 71. Run 72 in the SQL editor **before the code deploy**: the routes select `attachments.folder_owner_id` / `contract_versions.folder_owner_id`. It needs 65.
- **72 before 70.** An account deleted between 70 and 72 leaves its document on a shared case with owner null and no trail row, so 72 cannot learn its folder.
- **What 72 does.** It records the folder each file was written in. Session-fixed, CHECKed against the path, backfilled (also from `firm_asset_transfers` if 70 ran first). A document 70 moves to the firm owner, keeps for the other party (owner null) or whose uploader is deleted stays servable.
- **Blocking.** A session cannot register a path another account's row holds (`storage_object_held_by_other`).
- **Sharing.** `can_share_attachment` (66) checks the recorded folder.
- **If 66 is re-run, re-run 72 after it.**
- **No change to 65's guard.** 70's movers are `SECURITY DEFINER` owned by `postgres`, so `current_user` inside them is trusted on the owner's removal PATCH and on GoTrue's delete as `supabase_auth_admin`. 70's verify now asserts that owner.
- **70 change.** A member's vault copy of a firm file moves with it.
- **Checks.** Expect `20261026_72 verify: OK`, then `_verify: 20261026_72 OK` from the manual `_verify.sql` run. `deploy.sh` does not run it.
- **Tested.** Docker: `supabase/tests/rls/batch_2026_10_26_integration.test.sql`.

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
