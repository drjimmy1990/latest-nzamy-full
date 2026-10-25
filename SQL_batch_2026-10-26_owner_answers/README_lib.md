# دفعة 2026-10-26 — المكتبة (L-A «مجلداتي»، L-B أجزاء كتب الفقه، ترتيب البحث حسب الصلة)

**الحالة:** لم يُنفَّذ على الإنتاج بعد. كل SQL على الإنتاج ينفذه المستخدم في المحرر، بعد نسخة احتياطية ومراجعة نتيجة الملف.

| # | الملف | متى |
|:--:|---|---|
| 50 | `50_ANY_TIME_20261026_50_smart_folders_grants.sql` | **في أي وقت**، قبل نشر الكود أو بعده |
| 51 | `51_ANY_TIME_20261026_51_feqh_books_series.sql` | **في أي وقت**، ويُفضَّل **قبل** تحميل المكتبة التالي (قرار المالك ٢٦٢) |
| 52 | `52_BEFORE_DEPLOY_20261026_52_library_search_relevance.sql` | **قبل نشر الكود** يُفضَّل، وآمن في أي ترتيب (قرار المالك ٢٧٧) |

`50_ANY_TIME_20261026_50_smart_folders_grants.sql` نسخة مطابقة من `supabase/migrations/20261026_50_smart_folders_grants.sql`.

## ماذا يصلح

أصلح المالك (إصلاحات المكتبة الثلاث، 2026-10-25) زر «حفظ في مجلداتي». كان الحفظ يفشل بالخطأ `42501`، لأن المستخدم المسجّل لا يملك صلاحية الكتابة على جدولي المجلدات. صار المساران `/api/library/folders` و`/api/library/folders/items` يتحققان من الحساب أولاً، ثم يكتبان بحساب الخادم (`service_role`). ويتحقق كل منهما من أن المجلد ملك المستخدم، ومن حدود المدخلات.

**لذلك يعمل الحفظ دون هذا الملف.** هذا الملف حماية إضافية:

1. **الزائر (`anon`):** لا يملك أي صلاحية على الجدولين. مجلدات الزائر في متصفحه فقط.
2. **المستخدم المسجّل (`authenticated`):** قراءة فقط، وسياسات RLS الحالية تقصرها على مجلداته.
3. **لا كتابة مباشرة للمستخدم المسجّل:** تُسحب منه كل صلاحيات الكتابة.
   - **هذا هو الفرق عن ملف المالك:** ملف المالك (`20261025_01`) كان يمنحه INSERT/UPDATE/DELETE.
   - **لماذا لم نأخذ بذلك:** المنح يسمح لأي مستخدم مسجّل بالكتابة مباشرة عبر PostgREST بالمفتاح العام، متجاوزاً حدود المسار. مثال ذلك: اسم مجلد بطول ١٠ ميغابايت، أو نوع عنصر غير معروف.
   - **الكود لا يحتاج هذا المنح:** المساران يكتبان بحساب الخادم.
4. **حساب الخادم (`service_role`):** يملك كل الصلاحيات.
5. **سياسة التعديل:** تُضاف سياسة «Users can update own folder items» من ملف المالك. هي لصاحب المجلد فقط، ولا أثر لها ما دام المستخدم المسجّل بلا صلاحية تعديل.
6. **سبعة قيود (CHECK) بحدود المسارين نفسها:**
   - اسم المجلد من ١ إلى ٨٠ حرفاً.
   - اللون بصيغة `#RRGGBB`.
   - الأيقونة من ١ إلى ٨ أحرف.
   - نوع العنصر `law` أو `order` أو `precedent` أو `book`.
   - المعرّف حتى ٢٠٠ حرف.
   - العنوانان حتى ٣٠٠ حرف.

## القيود مضافة بصيغة `NOT VALID`

- **الصفوف الجديدة والمعدّلة:** تُفحص كلها.
- **الصفوف الموجودة:** لا تُفحص، لأننا لا نرى بيانات الإنتاج.
- **صف قديم يخالف قيداً:** يبقى ويُقرأ، لكن تعديله يفشل (تثبيت، تسمية، تغيير لون) حتى يُصحَّح.
- **احتمال وجود هذه الصفوف ضعيف:** بدأ الإنتاج نظيفاً في 2026-09-25، وكل الواجهات منذ ذلك الحين ترسل ألواناً سداسية و«📁».

للتأكد بعد التنفيذ:

```sql
select count(*) from library.smart_folders
 where char_length(name) not between 1 and 80
    or (color is not null and color !~ '^#[0-9A-Fa-f]{6}$')
    or (icon is not null and char_length(icon) not between 1 and 8);
select count(*) from library.smart_folder_items
 where entity_type not in ('law','order','precedent','book')
    or char_length(entity_id) not between 1 and 200
    or char_length(coalesce(title,'')) > 300 or char_length(coalesce(title_en,'')) > 300;
```

إن كانت النتيجتان صفراً، يمكن تثبيت القيود بالأوامر التالية (اختياري):

```sql
alter table library.smart_folders validate constraint smart_folders_name_length;
alter table library.smart_folders validate constraint smart_folders_color_hex;
alter table library.smart_folders validate constraint smart_folders_icon_length;
alter table library.smart_folder_items validate constraint smart_folder_items_entity_type;
alter table library.smart_folder_items validate constraint smart_folder_items_entity_id_length;
alter table library.smart_folder_items validate constraint smart_folder_items_title_length;
alter table library.smart_folder_items validate constraint smart_folder_items_title_en_length;
```

## الخطوات

1. نفّذ الملف. يجب أن تظهر في آخره الرسالة `20261026_50 verify: OK`.
   - يعمل داخل `begin … commit`.
   - قابل لإعادة التشغيل.
   - ينتهي بـ `notify pgrst, 'reload schema'`.
2. شغّل `supabase/migrations/_verify.sql` (أحدث نسخة)، ويجب أن يظهر `_verify: 20261026_50 OK`.
   - قبل التنفيذ يظهر تنبيه «not applied yet» دون خطأ.
   - بعد التنفيذ يتوقف الفحص بخطأ في ثلاث حالات:
     - عادت للزائر صلاحية على أحد الجدولين، كأن تُعاد `20260922_01`.
     - عادت للمستخدم المسجّل صلاحية كتابة، كأن يُنفَّذ ملف المالك الأصلي.
     - حُذف أحد القيود السبعة.
3. **لا تنفّذ** ملف المالك `20261025_01_smart_folders_authenticated_grants.sql`، فهذا الملف يحل محله.

**للتراجع** (لا يلزم الكود):
- أسقط القيود السبعة بـ `alter table … drop constraint …`.
- أسقط السياسة بـ `drop policy "Users can update own folder items" on library.smart_folder_items;`.
- أعد `grant select on library.smart_folders, library.smart_folder_items to anon;` إن أردت.

**اختبار Docker:** `supabase/tests/rls/smart_folders_grants.test.sql`. في رأسه أمر التشغيل الكامل، والملف فيه يُنفَّذ مرتين.

---

## English (short)

`50_ANY_TIME_20261026_50_smart_folders_grants.sql` is an exact copy of `supabase/migrations/20261026_50_smart_folders_grants.sql`. **Run it any time, before or after the deploy.** The code works without it, because the folder routes now write through the service role and check ownership and input limits themselves.

What it does:
- Locks the two folder tables: anon gets nothing, authenticated gets SELECT only, service_role gets everything.
- Adds the owner's missing UPDATE policy.
- Adds 7 `NOT VALID` CHECK limits that mirror `src/app/api/library/folders/validate.ts`.

It deliberately does **not** grant INSERT/UPDATE/DELETE to `authenticated`, which the owner's original `20261025_01` did. That grant would let any signed-in user write these tables directly through PostgREST with the anon key, bypassing the route limits. Do not run his original file.

Expected results:
- The file ends with `20261026_50 verify: OK`.
- Then `_verify.sql` prints `_verify: 20261026_50 OK`.

---

## ٥١ — سلسلة كتاب الفقه ورقم مجلده (L-B، قرار المالك ٢٦٢)

`51_ANY_TIME_20261026_51_feqh_books_series.sql` نسخة مطابقة من `supabase/migrations/20261026_51_feqh_books_series.sql`.

**ماذا يضيف:** عمودين في `library.feqh_books`:

- `series_id`: معرّف العمل الذي تشترك فيه مجلداته (`series_id` أو `collection_id` في ملف المصدر).
- `volume_number`: رقم المجلد كما في الملف (`volume_number` أو `current_volume`)، من ١ إلى ٩٩٩٩.

القيمة الفارغة (NULL) تعني أن الملف لم يذكرها، فيبقى تجميع الأجزاء بالعنوان كما هو اليوم. لا تغيير في الصلاحيات: قراءة الفهرس عامة كما كانت.

**متى:** في أي وقت. الكود يعمل قبله (يقرأ العمودين اختيارياً)، وسكربت التحميل `seed-library-from-owner.mjs` يحذف المفتاحين من الصفوف ما دام العمودان غير موجودين، فلا يسقط أي كتاب. لكن **السلسلة لا تُحفظ إلا بعد تنفيذه**، فنفّذه قبل التحميل التالي. في ملفات المالك اليوم ١٣٧ ملف فقه تحمل `collection_id`.

**لماذا قبل التحميل:** في نسخة ملفات المالك المحلية (`last_owner`، 2026-10-25) عنوان كل جزء في الواجهة الأمامية هو عنوان الكتاب وحده («الإنصاف في معرفة الراجح من الخلاف») بلا «الجزء 7». قاعدة العنوان وحدها تعطي ١٣١ بطاقة (سلسلتان فقط)، و`series_id` يعطي ١٨ بطاقة (١١ سلسلة: الإنصاف ٣١، الشرح الكبير ٣١، كشاف القناع ١٦، المغني ١٥، الوسيط ١٢، الفروع ١١، مصادر الحق ٦، منتهى الإرادات ٥، الإقناع ٤، شرح منتهى الإرادات ٣، القضاء الإداري ٣). لا دمج لعملين مختلفين، ولكل سلسلة مؤلف واحد. فإن حُمِّلت هذه الملفات قبل الملف ٥١ ظهر كل جزء بطاقةً مستقلة.

**النتيجة المتوقعة:**

- آخر الملف: `20261026_51 OK — feqh_books.series_id and volume_number in place`.
- ثم `_verify.sql`: `_verify: 20261026_51 OK — … (N book rows carry a series)`؛ قبل التحميل يكون N صفراً.

**التراجع:**

```sql
alter table library.feqh_books drop column if exists series_id, drop column if exists volume_number;
```

**اختبار Docker:** `supabase/tests/rls/feqh_books_series.test.sql` (أمر التشغيل في رأسه؛ الملف يُنفَّذ مرتين). نُفِّذ مرتين محلياً: T1–T5 PASS، والضبط السلبي (دون الملف) يفشل عند T1.

### English (short)

Adds `library.feqh_books.series_id varchar(150)` and `volume_number int` (1–9999), both nullable, a partial index on `series_id`, no grant changes (table-level SELECT already covers them). Any time; the code reads them as optional and the owner loader strips both keys while the columns are missing, so books still load — but series are only kept after this file runs, so run it before the next library load.

---

## ٥٢ — ترتيب نتائج البحث حسب الصلة (قرار المالك ٢٧٧ (أ))

`52_BEFORE_DEPLOY_20261026_52_library_search_relevance.sql` نسخة مطابقة من `supabase/migrations/20261026_52_library_search_relevance.sql` (فُحصت بـ `cmp`).

**ماذا يضيف:** أربع دوال بحث، واحدة لكل قسم: الأنظمة (المواد)، والمبادئ، والفقه، والأوامر والتعاميم. كل دالة ترتّب النتائج حسب صلتها بكلمات البحث (`ts_rank_cd`)، ثم بالمعرّف عند التساوي، **في كل صفحة**. التصفح بلا بحث لا يتغير: يبقى بترتيب التاريخ الرسمي.

**لماذا:** كان البحث يعرض النتائج بترتيب المعرّف في كل الأقسام. دالة الترتيب القديمة `20260925_01` (لمعاينة «الكل» فقط) موسومة «لا تُنفَّذ» لبطئها، فالإنتاج اليوم لا يرتّب شيئاً.

**حدّ الترتيب ٥٬٠٠٠ نتيجة:**

- الترتيب يقرأ نص كل نتيجة مطابقة، فكلفته تكبر مع عدد النتائج.
- إذا طابق البحث **٥٬٠٠٠ نتيجة أو أقل** في قسم: ترتيب حسب الصلة في كل الصفحات.
- إذا طابق **أكثر من ٥٬٠٠٠** (كلمة شائعة جداً وحدها): يبقى ترتيب المعرّف كما اليوم، في كل صفحات ذلك البحث. لا تُرتَّب صفحة أولى ثم تُعرض الثانية بترتيب آخر.
- يذكر الرد لكل قسم الترتيب الذي استُعمل (`order`: `relevance` أو `id`).
- القياس (Docker، ١١٠ آلاف مادة اصطناعية): نحو ٩٠ ملّي ثانية لثلاثة آلاف نتيجة، وأقل من حدّ الأربع ثوانٍ بكثير. ذاكرة النظام في Docker كانت دافئة، فليس هذا رقم «بارد» حقيقياً. **لم يُقَس على الإنتاج.**

**أمر جانبي في المبادئ:** الدالة الحالية `search_principles_page` تربط كل مبدأ بمجموعته. مع مئات المجموعات (كما في الإنتاج) لا تستعمل خطتها فهرس البحث: تقرأ كل المبادئ واحداً واحداً (في Docker مع ٣٠٢ مجموعة: الجدول كله). الدالة الجديدة تبحث في الفهرس مرة واحدة، ولا تقرأ المجموعات إلا عند تصفية بالمسار أو المصدر أو المحكمة. والاقتراحات أثناء الكتابة (autocomplete) تستعمل الدالة الجديدة أولاً.

**تحقّق بعد التنفيذ (زائراً، بلا تسجيل دخول):** ابحث في «الأنظمة» ثم في «المبادئ» عن كلمة تطابق بين ألفين وخمسة آلاف نتيجة. يجب أن تظهر النتائج لا رسالة تعذّر البحث. هذا النطاق هو الأثقل على الترتيب، ولا رجوع إلى الترتيب القديم إن انتهت المهلة.

**الصلاحيات:** كأخواتها. `SECURITY INVOKER`، ومهلة ٤ ثوانٍ داخل الدالة، وتنفيذها لحساب الخادم (`service_role`) فقط. لا تغيير على الاشتراك ولا على ما يُخفى عن غير المشترك.

**متى:** يُفضَّل **قبل** نشر الكود، فيبدأ الترتيب من أول طلب. لكنه آمن في أي ترتيب: الكود يستدعي الدالة الجديدة أولاً، وإن لم توجد (`PGRST202`) عاد إلى ترتيب اليوم.

**النتيجة المتوقعة:**

- آخر الملف: `20261026_52 verify: OK — four relevance windows …`.
- ثم شغّل `supabase/migrations/_verify.sql` بنفسك: `_verify: 20261026_52 OK — …`. سكربت النشر `deploy.sh` **لا** يشغّل `_verify.sql`.

**التراجع** (يعود البحث إلى ترتيب المعرّف خلال عشر دقائق):

```sql
begin;
  drop function if exists library.search_law_articles_relevance(text, integer, integer, text, text, text);
  drop function if exists library.search_principles_relevance(text, integer, integer, text, text, integer, text);
  drop function if exists library.search_feqh_relevance(text, integer, integer);
  drop function if exists library.search_decrees_relevance(text, integer, integer, text, text, text[]);
commit;
notify pgrst, 'reload schema';
```

**اختبار Docker:** `supabase/tests/rls/library_search_relevance.test.sql` مع `prelude_search_relevance_fixture.sql` (أمر التشغيل في رأسه؛ الملف يُنفَّذ مرتين). نُفِّذ مرتين محلياً: T1–T7 PASS. يثبت T7 بخطة التنفيذ (`EXPLAIN`) وعدّادات الفهرس أن الكلمة النادرة والشائعة تستعملان فهرس GIN في الأقسام الأربعة، بلا مرور على المفتاح الأساسي. والضبط السلبي (دون الملف) يفشل عند T1.

### English (short)

Four relevance windows (laws/articles, principles, fiqh blocks, decrees), each `ts_rank_cd(fts, q, 1) desc, id` on every page, same parameters and rows as the existing id-order windows (decrees: the inline select's public columns), `SECURITY INVOKER`, `statement_timeout 4s`, service_role only. A query matching more than 5,000 rows of a section keeps the id order on every page (`ranked: false`) — ranking de-TOASTs every match. Prefer running it before the deploy; the code falls back to today's order while it is missing. deploy.sh does not run `_verify.sql`; run section `verify:search_relevance` by hand.
