-- prelude_law_summary_brief_fixture.sql — law preambles shaped like the owner
-- corpus (last_owner «أنظمة ولوائح», 2026-10-25), listed BEFORE
-- 20261025_20_law_summary_brief.sql in the chain of
-- law_summary_brief.test.sql, so the migration fills existing rows.
--
-- ONE fixture for both twins: public._sb_fixture holds each preamble and the
-- summary_brief it must produce. law_summary_brief.test.sql checks the SQL
-- function against it; src/lib/library/lawPreambleBlocks.test.ts reads THIS
-- FILE and checks the TypeScript lawSummaryBrief() against the same rows.
-- Format the unit test parses: one row per fixture,
--   ('<slug>', $pNN$<preamble>$pNN$, $eNN$<expected brief>$eNN$),
-- where an empty expected means NULL. A slug ending in -crlf is stored with
-- CRLF line endings (both tests apply the same replace).

create table public._sb_fixture (slug text primary key, preamble text not null, expected text);

insert into public._sb_fixture (slug, preamble, expected) values
-- 01: the موجز at the top, a labelled blockquote, then the card (precious-metals guide).
('sb-01', $p01$<details open>
<summary>📝 موجز المستند (خلاصة سريعة)</summary>

> **الموضوع والقرار المتخذ:** يهدف الدليل إلى مساعدة تجار المعادن الثمينة على الامتثال.

</details>

***

### 📊 بطاقة تعريف الوثيقة

| الحقل | القيمة |
| :--- | :--- |
| **نوع الوثيقة** | دليل إرشادي |
| **الجهة المصدرة** | وزارة التجارة |

***

# الدليل الإرشادي بشأن العناية الواجبة بالعميل$p01$,
 $e01$**الموضوع والقرار المتخذ:** يهدف الدليل إلى مساعدة تجار المعادن الثمينة على الامتثال.$e01$),

-- 02: card + ➕ table FIRST, the موجز (closed <details>, a heading inside) after
-- it, and the ديباجة <details> later: the first </details> after the موجز
-- closes it, never the last one in the preamble.
('sb-02', $p02$### 📊 بطاقة تعريف لائحة تنفيذية

| الحقل | القيمة |
| :--- | :--- |
| **نوع الوثيقة** | لائحة تنفيذية |
| **الجهة المصدرة** | مجلس الخدمة المدنية |

<details>
<summary>➕ المزيد من بيانات لائحة تنفيذية</summary>

| الحقل | القيمة |
| :--- | :--- |
| **التصنيف** | القسم الصحي والدوائي |
| **النسخة** | 3.1 |

</details>

<details>
<summary>📝 موجز المستند</summary>

### 🎯 ملخص محتوى المستند والهدف منه
لائحة الوظائف الصحية الصادرة عن مجلس الخدمة المدنية (1412هـ)، وتشمل 16 مادة موزعة على 8 فصول.

</details>

***

## ديباجة النظام
<details>
<summary>📜 ديباجة اللائحة</summary>

نص الديباجة.

</details>$p02$,
 $e02$### 🎯 ملخص محتوى المستند والهدف منه
لائحة الوظائف الصحية الصادرة عن مجلس الخدمة المدنية (1412هـ)، وتشمل 16 مادة موزعة على 8 فصول.$e02$),

-- 03: the V2 card with every row, no موجز: no brief.
('sb-03', $p03$### 📊 بطاقة تعريف التشريع

| الحقل | القيمة |
| :--- | :--- |
| **نوع التشريع** | لائحة تنفيذية |
| **حالة التشريع** | ساري |
| **أداة الإصدار** | قرار مجلس الوزراء رقم (468) وتاريخ 1447/07/10هـ |
| **اللوائح المدمجة** | لا يوجد |
| **تاريخ النشر** | 1447/07/27هـ (جريدة أم القرى، العدد 5140) |
| **المصدر الرسمي** | [جريدة أم القرى](https://uqn.gov.sa/details?p=28791) |

<details>
<summary>➕ المزيد من بيانات التشريع</summary>

| الحقل | القيمة |
| :--- | :--- |
| **التصنيف** | القسم الاستثماري |
| **عدد المواد** | 35 |
| **تاريخ النشر ميلادي** | غير متوفر في المصدر |
| **وثيقة النظام (PDF)** | *غير متوفر* |

</details>

# اللائحة التنظيمية للمنطقة الاقتصادية الخاصة

***

## ديباجة النظام
<details>
<summary>📜 ديباجة ومقدمة قرار مجلس الوزراء رقم (٤٦٨)</summary>

**قرار رقم : (٤٦٨) وتاريخ : ١٠ / ٧ / ١٤٤٧ه**

</details>$p03$,
 $e03$$e03$),

-- 04: a موجز written as plain prose (no blockquote), after the H1.
('sb-04', $p04$# الدليل الإجرائي لخدمة التقاضي الإلكتروني

<details open>
<summary>📝 موجز المستند (خلاصة سريعة)</summary>

دليل إجرائي صادر عن وزارة العدل لتطبيق إجراءات خدمة التقاضي الإلكتروني.
يبيّن الدليل ضوابط تحديد المواعيد وتبليغها.

</details>$p04$,
 $e04$دليل إجرائي صادر عن وزارة العدل لتطبيق إجراءات خدمة التقاضي الإلكتروني.
يبيّن الدليل ضوابط تحديد المواعيد وتبليغها.$e04$),

-- 05: an unclosed موجز <details>: not read (no brief, nothing moved).
('sb-05', $p05$<details open>
<summary>📝 موجز المستند (خلاصة سريعة)</summary>

> نص بلا إغلاق.$p05$,
 $e05$$e05$),

-- 06: a موجز whose body is empty: no brief.
('sb-06', $p06$<details open>
<summary>📝 موجز النظام</summary>

>

</details>$p06$,
 $e06$$e06$),

-- 07: «موجز الذكاء الاصطناعي» with a multi-line blockquote; stored with CRLF.
('sb-07-crlf', $p07$<details open>
<summary>📝 موجز الذكاء الاصطناعي</summary>

> **وصف موجز (تحرير المكتبة — وليس ترجمة رسمية):** نظام الدفاع المدني الصادر بالمرسوم الملكي رقم (م/10).
>
> يحدد النظام مفهوم الدفاع المدني ومهامه.

</details>$p07$,
 $e07$**وصف موجز (تحرير المكتبة — وليس ترجمة رسمية):** نظام الدفاع المدني الصادر بالمرسوم الملكي رقم (م/10).

يحدد النظام مفهوم الدفاع المدني ومهامه.$e07$),

-- 08: a <details> that is not a موجز (the card wrapped in <details>), then the موجز.
('sb-08', $p08$<details open>
<summary>📊 بطاقة تعريف المستند والبيانات الأساسية</summary>

### ⚖️ معلومات المستند الأساسية
| الحقل | القيمة |
| :--- | :--- |
| **رقم المستند / المرجع** | قرار مجلس الخدمة المدنية رقم ١٤١ |
| **تاريخ الإصدار** | ٢٧-٠٥-١٣٩٩هـ |

</details>

<details open>
<summary>📝 موجز القرار (خلاصة سريعة)</summary>

> الأحكام الخاصة بالموظفين المعينين على بند الأجور.

</details>$p08$,
 $e08$الأحكام الخاصة بالموظفين المعينين على بند الأجور.$e08$),

-- 09: no blocks at all (a plain decree preamble).
('sb-09', $p09$**قرار مجلس الوزراء رقم (104) وتاريخ 07 / 07 / 1379ه**

إن مجلس الوزراء…$p09$,
 $e09$$e09$);

-- 10: a موجز longer than 2,000 characters: the brief is cut at 2,000 and ends in «…».
insert into public._sb_fixture (slug, preamble, expected)
  values ('sb-10',
          E'<details open>\n<summary>📝 موجز المستند (خلاصة سريعة)</summary>\n\n> ' || repeat('أ', 2100) || E'\n\n</details>',
          repeat('أ', 2000) || '…');

insert into library.laws (slug, title, type, section_code, preamble)
  select slug, 'نظام ' || slug, 'نظام', '00',
         case when slug like '%-crlf' then replace(preamble, E'\n', E'\r\n') else preamble end
    from public._sb_fixture;
