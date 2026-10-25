# حذف الحساب (D6، قرار المالك ٢٩٨): ترتيب التنفيذ والنشر

**الحالة:** لم يُنفَّذ على الإنتاج بعد. ينفذه المستخدم في محرر Supabase بعد نسخة احتياطية.

*English, short:* run the read-only FK query below first. Then run `70_BEFORE_DEPLOY_20261026_70_account_deletion.sql` **before** deploying the D6 code. Expect `20261026_70 verify: OK`. Then deploy, run `_verify.sql` by hand (expect `_verify: 20261026_70 OK`), and add the daily n8n job. The code is safe before the file runs, because it keeps the old behaviour.

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

   ويُسجَّل كل نقل في جدول `firm_asset_transfers`: من كتب السجل، ولمن انتقل، ومتى. ويصل لصاحب المكتب إشعار بعدد السجلات، دون محتواها. وبعد الإخراج لا يعود العضو يرى هذه السجلات. قبل هذا الملف كان العضو المُخرَج يراها ما دام هو مالكها.

**الحماية على كل طرق الحذف**، بما فيها لوحة Supabase وسكربتات التنظيف: مشغّل `BEFORE DELETE` على `auth.users`.
- ينقل أصول المكتب قبل أي حذف.
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

يجب أن يظهر `_verify: 20261026_70 OK`. يكتفي القسم بتنبيه ما دام الملف لم يُنفَّذ. ويتوقف بخطأ إن نُفِّذ جزئياً أو حُذف أحد المشغّلات، والحل حينها إعادة تنفيذ الملف.

## مهمة الحذف اليومية (n8n)

`CRON_SECRET` مضبوط أصلاً لمهمة المهل. أضف في n8n:

- **Schedule Trigger:** يومياً، مثلاً ٠٣:٠٠ بتوقيت الرياض.
- **HTTP Request:** `POST https://nezamy.sa/api/v1/cron/account-purge`، مع الترويسة `x-cron-secret: <CRON_SECRET>`.

تحذف المهمة فقط الطلبات التي مضى عليها ٦٠ يوماً ولم تُلغَ. لكل طلب، بالترتيب:
1. تنقل أصول المكتب.
2. تحذف الحساب.
3. تحذف ملفات التخزين الشخصية، بعد حذف الحساب لا قبله: إن رُفض الحذف يبقى الحساب قابلاً للاستعادة بملفاته. **لا تحذف بمجلد كامل أبداً**: الملف الذي يشير إليه سجل باقٍ يبقى.
4. تسجّل النتيجة على الطلب.

صاحب المكتب الذي له أعضاء، أو مفتاح يمنع الحذف، يصير طلبه `blocked` ويبقى الحساب مجمّداً حتى يقرر المالك. ولا تكرر المهمة المحاولة كل يوم. الرد JSON بالأعداد: `claimed` و`purged` و`blocked` و`retry`.

## تنبيهات

- **إخفاء الملف العام «فوراً»** يتم في قاعدة البيانات. لكن نسخة صفحة خزّنها nginx (`proxy_cache_dir`) قد تبقى ظاهرة حتى تنتهي مدة تخزينها. `deploy.sh` يفرغ هذا التخزين عند كل نشر.
- **حذف حسابات الاختبار (UAT):** المشغّل الجديد يرفض حذف صاحب مكتب أو شركة أو جهة ما زال لها أعضاء. احذف الأعضاء أولاً، ثم أصحاب المكاتب.
- **مكتب استشارات:** إن كان صاحب المكتب «مستشاراً» (`practice_kind = consultant`) فقاعدة المادة ١٨ تمنع نقل جلسات العضو المُخرَج إليه من جلسة صاحب المكتب. ينجح الإخراج، وتبقى تلك الجلسات مع العضو حتى ينقلها الحذف النهائي (السؤال ٧ للمالك).

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
- **Tested.** Docker-proved twice (T1–T11, with two negative controls; the chain includes the live lawyer_profiles and the Art. 18 guard): `supabase/tests/rls/account_deletion.test.sql`.
