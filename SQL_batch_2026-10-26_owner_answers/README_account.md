# حذف الحساب (D6، قرار المالك ٢٩٨): ترتيب التنفيذ والنشر

**الترتيب:** ترتيب تنفيذ الدفعة كاملاً في `README.md` (جدول واحد، ومعه ما يُرسل بعد كل ملف). هذا الملف يشرح ملفي حذف الحساب (70، 71) و72 الذي يسبقهما، وينفذها المستخدم بعد نسخة احتياطية:

| الترتيب | الملف | من أين | متى |
|---|---|---|---|
| 0 | `72_BEFORE_DEPLOY_20261026_72_file_folder_owner.sql` (بعد 65 و66) | محرر SQL في Supabase | قبل نشر الكود، **وقبل 70** — انظر `README.md`، قسم «65 → 66 → 72 → 70 → 71» |
| 1 | `70_BEFORE_DEPLOY_20261026_70_account_deletion.sql` | محرر SQL في Supabase | قبل نشر الكود |
| 2 | `71_AFTER_70_storage_policies_documents_select.sql` | على الخادم بدور `supabase_admin` (الأمر أدناه)، **لا** من محرر SQL | بعد 70، ويجوز قبل النشر أو بعده |

بدون 72 ينتقل مستند العضو لصاحب المكتب، لكن روابط التحميل ترفضه لأن ملفه في مجلد العضو. ونفّذ 72 **قبل** 70: إن حُذف حساب بين الملفين يبقى مستنده على القضية بلا صاحب ولا سجلّ نقل، فلا يستطيع 72 معرفة مجلده، ويبقى غير قابل للتحميل نهائياً. الترتيب الكامل للملفات الخمسة في `README.md`.

*English, short:* run the read-only FK query below first. Then run `70_BEFORE_DEPLOY_…` in the SQL editor **before** deploying the D6 code (expect `20261026_70 verify: OK`). Then run `71_AFTER_70_…` on the server as `supabase_admin` (storage policies cannot be created from the SQL editor; expect `storage_policies_documents: OK`). Deploy, run `_verify.sql` by hand (deploy.sh does **not** run it; expect `_verify: 20261026_70 OK` and `_verify: 71_AFTER_70 OK`), and add the daily n8n job. The code is safe before the files run, because it keeps the old behaviour.

## ماذا يفعل الملف

`70_BEFORE_DEPLOY_20261026_70_account_deletion.sql` نسخة مطابقة (`cmp`) من `supabase/migrations/20261026_70_account_deletion.sql`.

قرار المالك ٢٩٨، مطبَّقاً على قاعدة البيانات:

1. **الحساب المستقل** (محامٍ فرد أو عميل فرد) يُجمَّد ٦٠ يوماً عند طلب الحذف:
   - يُخفى ملفه العام فوراً، من دليل المحامين وصفحة `/lawyers/...`.
   - يستطيع استعادته في أي وقت خلال المهلة.
   - بعد ٦٠ يوماً يُحذف نهائياً مع مستنداته وملاحظاته الشخصية.
   - **الفواتير الضريبية تبقى**: صف `payment_orders` لا يُحذف، ويُحفظ عليه اسم المشتري وبريده كما كانا (`metadata.buyer_snapshot`).
2. **عضو المكتب** عند إخراجه أو حذف حسابه: ملفات القضايا وملاحظات المكتب ومستندات الموكلين **لا تُحذف**، بل تنتقل إلى صاحب المكتب. يشمل ذلك:
   - القضايا والجلسات والمهام والمهل.
   - بطاقات الموكلين وملاحظاتها.
   - ملاحظات القضايا ومستنداتها.
   - العقود والاستشارات.

   ويُسجَّل كل نقل في جدول `firm_asset_transfers`: من كتب السجل، ولمن انتقل، ومتى. ويصل لصاحب المكتب إشعار بعدد السجلات، دون محتواها. وبعد الإخراج لا يعود العضو يرى هذه السجلات، ولا يستطيع تنزيل ملفاتها مباشرة من التخزين **بعد تنفيذ الملف 71** (الملف يبقى في مجلده، لكن سياسة القراءة تتبع صاحب السجل). قبل هذا الملف كان العضو المُخرَج يراها ما دام هو مالكها.

   يُنقل فقط ما يخص مكتباً **كان المستخدم عضواً فيه** (له صف في `firm_members` بأي حالة). العميل الذي له طلب على قضية مكتب ليس عضواً: إن حُذف حسابه يبقى طلبه بلا صاحب، ويبقى مستنده للمكتب، ولا يصل لصاحب المكتب إشعار «عضو حُذف حسابه».
3. **من يرفع التجميد:** المستخدم الذي طلب الحذف بنفسه يستعيد حسابه في أي وقت خلال المهلة. أما التجميد الذي قامت به الإدارة فلا يرفعه صاحب الحساب: يرى «تم تجميد الحساب بقرار من الإدارة — تواصل مع الدعم» دون زر استعادة، وترفعه الإدارة فقط بـ«استعادة حساب مجمّد» (افتراض بانتظار جواب المالك).

**الحماية على كل طرق الحذف**، بما فيها لوحة Supabase وسكربتات التنظيف: مشغّل `BEFORE DELETE` على `auth.users`. هو **وحده** ينقل ويحفظ، داخل عملية الحذف نفسها: إن فشل الحذف أو رُفض لا يتغير أي سجل، ويبقى الحساب قابلاً للاستعادة بكل ملفاته.
- ينقل أصول المكتب قبل أي حذف. إن بقي سجل مكتب لم يمكن نقله **يرفض** الحذف (`ACCOUNT_DELETE_FIRM_ASSETS_LEFT`) فلا يضيع شيء.
- **يرفض** حذف صاحب مكتب أو شركة أو جهة ما زال لها أعضاء آخرون، لأن حذفه يحذف المكتب كله. الرسالة: `ACCOUNT_DELETE_ENTITY_OWNER`.
- يُبقي مستندات الحساب المحذوف على قضية فيها طرف آخر لذلك الطرف (السؤال ٣ للمالك).

**وأيضاً:** يصبح `entitlement_requests.decided_by` بقيمة `ON DELETE SET NULL`. كان المفتاح الوحيد في المستودع الذي يمنع حذف حساب، وهو حساب كل مشرف قرّر طلب منح.

## قبل التنفيذ: فحص للقراءة فقط

مفاتيح أُضيفت يدوياً على الإنتاج لا يراها المستودع. نفّذ هذا الاستعلام وأرسل نتيجته للفريق:

```sql
select con.conrelid::regclass as tbl, a.attname as col, con.confdeltype as on_delete
  from pg_constraint con
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
 where con.contype = 'f'
   and con.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
   and con.confdeltype in ('a', 'r')
 order by 1, 2;
-- المتوقع: صف واحد فقط، entitlement_requests | decided_by | a (يصلحه الملف 70)
-- أي صف آخر يمنع حذف الحساب؛ عملية الحذف تسجّله على الطلب (blocked) ولا تكرر المحاولة
```

## التنفيذ

1. افتح محرر SQL في Supabase، والصق محتوى الملف كاملاً، ونفّذه.
2. يجب أن تظهر في نهايته الرسالة `20261026_70 verify: OK`.
3. إن توقف بالرسالة `canceling statement due to lock timeout` فلم يتغير شيء. أعد التنفيذ بعد لحظات.
4. للتأكد:

```sql
select tgname from pg_trigger
 where tgname in ('trg_auth_users_account_keep_rules', 'trg_firm_members_removed_transfer',
                  'trg_lawyer_profiles_account_frozen_unlisted');
-- المتوقع: ٣ صفوف

select count(*) from public.account_deletion_requests;
-- المتوقع: 0
```

**الملف قابل لإعادة التشغيل**، داخل `begin … commit`، ومهلة القفل فيه ٥ ثوانٍ، وينتهي بـ `notify pgrst, 'reload schema'`. **لا يحذف أي حساب ولا أي صف.**

## الملف 71: سياسة قراءة ملفات التخزين

`71_AFTER_70_storage_policies_documents_select.sql` نسخة مطابقة (`cmp`) من `supabase/storage_policies_documents.sql`. يعيد إنشاء سياسات حاوية `documents` الأربع كما كانت، ويضيف إلى سياسة القراءة شرطاً واحداً: لا يقرأ المستخدم ملفاً في مجلده إذا كان سجلّه لغيره (مستند انتقل لصاحب المكتب، أو نسخة عقد لم يعد يديره). الشرط دالة `storage_object_held_by_other` من الملف 70، لذلك يُنفَّذ **بعد 70**.

سياسات التخزين لا تُنشأ من محرر SQL (جدول `storage.objects` ليس ملك دوره). نفّذه على الخادم من مجلد المشروع:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < SQL_batch_2026-10-26_owner_answers/71_AFTER_70_storage_policies_documents_select.sql
```

- المتوقع في نهايته: `storage_policies_documents: OK — 4 owner-only policies, nothing else can match bucket documents`.
- إن نُفِّذ قبل 70 تُنشأ سياسة القراءة بلا الشرط مع رسالة، فأعد تنفيذه بعد 70.
- **لا تُعِد تنفيذ الملف 17** من دفعة 2026-10-25 بعد 71: ذلك الملف قديم ويعيد سياسة القراءة بلا الشرط. `_verify.sql` يتوقف بخطأ إن حدث ذلك، والحل إعادة تنفيذ 71.

## النشر والتحقق

- **قبل الملف** يعمل الكود الجديد كما كان:
  - الإعدادات تعرض «تواصل مع الدعم».
  - «حذف نهائي» في لوحة الإدارة يحذف فوراً كما كان.
  - التجميد يجيب بأنه غير متاح حتى يُنفَّذ الملف.
  - مهمة الحذف المجدولة تتجاوز الطلب: `skipped: schema_missing`.
- **بعد الملف وبعد النشر:**
  - في الإعدادات ← الأمان: «حذف الحساب».
  - في لوحة الإدارة: «تجميد ثم حذف بعد ٦٠ يوماً» (الافتراضي)، و«استعادة الحساب المجمّد»، و«حذف نهائي الآن». الأخير للمشرف الرئيسي فقط، وبكتابة عبارة التأكيد.
- `deploy.sh` **لا** يشغّل `_verify.sql`. نفّذه بيدك على الخادم:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261026_70|ERROR"
```

يجب أن يظهر `_verify: 20261026_70 OK`. يكتفي القسم بتنبيه ما دام الملف لم يُنفَّذ. ويتوقف بخطأ إن نُفِّذ جزئياً أو حُذف أحد المشغّلات أو كانت المنفَّذة نسخة أقدم من 70، والحل حينها إعادة تنفيذ الملف.

ويجب أن يظهر أيضاً `_verify: 71_AFTER_70 OK` (غيّر النمط في الأمر إلى `"_verify: 20261026_70|_verify: 71_AFTER_70|ERROR"`). يتوقف بخطأ ما دام 70 منفَّذاً و71 لم يُنفَّذ، أو نُفِّذ 17 بعده.

## مهمة الحذف اليومية (n8n)

`CRON_SECRET` مضبوط أصلاً لمهمة المهل. أضف في n8n:

- **Schedule Trigger:** يومياً، مثلاً ٠٣:٠٠ بتوقيت الرياض.
- **HTTP Request:** `POST https://nezamy.sa/api/v1/cron/account-purge`، مع الترويسة `x-cron-secret: <CRON_SECRET>`.

تحذف المهمة فقط الطلبات التي مضى عليها ٦٠ يوماً ولم تُلغَ. لكل طلب، بالترتيب:
1. تفحص دون أن تغيّر شيئاً: هل هو صاحب مكتب له أعضاء، وهل سيبقى سجل مكتب لا يمكن نقله.
2. تحذف الحساب. النقل لصاحب المكتب وحفظ المستندات المشتركة واسم المشتري على الفواتير تتم **داخل** الحذف نفسه: إن رُفض الحذف لا يتغير شيء.
3. بعد الحذف فقط تطلب قائمة الملفات من قاعدة البيانات، ثم تحذف ملفات التخزين الشخصية. **لا تحذف بمجلد كامل أبداً**: الملف الذي يشير إليه سجل باقٍ يبقى.
4. تسجّل النتيجة على الطلب.

«حذف نهائي الآن» من لوحة الإدارة يجمّد الحساب قبل الحذف، فإن لم يكتمل الحذف (مرفوض أو تعذّر) يبقى الحساب مجمّداً بقرار الإدارة. وإن تعذّر حتى تجميده يُلغى الطلب ويُبلَّغ المشرف، فلا يبقى طلب حذف على حساب مفتوح.

**أثناء التجميد** لا يستطيع الحساب الدفع ولا النشر في المجتمع ولا إنشاء طلب خدمة ولا أي كتابة أخرى من الواجهة: صفحة `/checkout` تحوّله إلى «حسابك مجمّد»، وكل واجهة برمجية تكتب ترفضه (403).

صاحب المكتب الذي له أعضاء، أو مفتاح يمنع الحذف، يصير طلبه `blocked` ويبقى الحساب مجمّداً حتى يقرر المالك. ولا تكرر المهمة المحاولة كل يوم. الرد JSON بالأعداد: `claimed` و`purged` و`blocked` و`retry`.

## تنبيهات

- **إخفاء الملف العام «فوراً»** يتم في قاعدة البيانات. لكن نسخة صفحة خزّنها nginx (`proxy_cache_dir`) قد تبقى ظاهرة حتى تنتهي مدة تخزينها. `deploy.sh` يفرغ هذا التخزين عند كل نشر.
- **حذف حسابات الاختبار (UAT):** المشغّل الجديد يرفض حذف صاحب مكتب أو شركة أو جهة ما زال لها أعضاء. احذف الأعضاء أولاً، ثم أصحاب المكاتب.
- **مكتب استشارات:** إن كان صاحب المكتب «مستشاراً» (`practice_kind = consultant`) فقاعدة المادة ١٨ تمنع نقل جلسات العضو المُخرَج إليه من جلسة صاحب المكتب. ينجح الإخراج، وتبقى تلك الجلسات مع العضو حتى ينقلها الحذف النهائي (السؤال ٧ للمالك).

- **بطاقات الدفع المحفوظة لدى ميسّر:** الحذف يحذف صفها من جدولنا (`payment_methods`)، لكنه لا يحذف الرمز (token) لدى ميسّر نفسه. يُضاف ذلك مع B2 (التجديد التلقائي)، ومعه: لا تجديد لحساب مجمّد.

## للتراجع

الأوامر في رأس الملف تحت `ROLLBACK`. الجدولان يبقيان لأنهما سجل.

*English:*
- **Tables.** Adds `account_deletion_requests` (60-day freeze; own-row read; writes only through functions) and the `firm_asset_transfers` trail.
- **Triggers.**
  - A BEFORE DELETE trigger on `auth.users` moves firm rows to the firm owner. It refuses to delete an entity owner who still has members. It keeps documents on a shared case, and it snapshots the buyer onto paid invoices.
  - A `firm_members` → `removed` trigger moves that member's firm rows to the owner.
  - Frozen lawyer and provider profiles are unlisted.
- **Foreign key.** `entitlement_requests.decided_by` becomes SET NULL.
- **Safety.** It deletes nothing. It is idempotent.
- **Storage (file 71).** The documents bucket's SELECT policy calls `storage_object_held_by_other(name)` (SECURITY DEFINER), so a removed member cannot download the firm files left in his folder. Run as `supabase_admin`, after 70; never re-run 17 after it.
- **Purge.** `account_purge_prepare` is a dry run; the moves happen only inside the delete; the files are listed after it (`account_purge_storage_paths`).
- **Tested.** Docker-proved (T1–T15 with the migration run twice; six negative controls recorded in the header): `supabase/tests/rls/account_deletion.test.sql`.
