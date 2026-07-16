# 📚 Library Toolkit — دليل مالك الموقع الشامل
### Owner's Comprehensive Guide — Legal Library Management

هذا الدليل يشرح كل ما تحتاجه لإدارة **المكتبة القانونية** على منصة نزامي. يغطي التحليل، الزرع، المسح، والتحقق من المحتوى القانوني.

> **⚠️ نفّذ جميع الأوامر من جذر المشروع `nzamy-website/` — وليس من داخل هذا المجلد.**

---

## 📑 جدول المحتويات (Table of Contents)

1. [نظرة عامة (Overview)](#-نظرة-عامة-overview)
2. [المتطلبات (Prerequisites)](#-المتطلبات-prerequisites)
3. [البداية السريعة (Quick Start)](#-البداية-السريعة-quick-start)
4. [مرجع الأوامر (Commands Reference)](#-مرجع-الأوامر-commands-reference)
5. [هيكل المحتوى (Content Structure)](#-هيكل-المحتوى-content-structure)
6. [جداول قاعدة البيانات (Database Tables)](#-جداول-قاعدة-البيانات-database-tables)
7. [العمليات الشائعة (Common Workflows)](#-العمليات-الشائعة-common-workflows)
8. [نظام الدفع (Paywall)](#-نظام-الدفع-paywall)
9. [مسارات API (API Routes)](#-مسارات-api-api-routes)
10. [استكشاف الأخطاء (Troubleshooting)](#-استكشاف-الأخطاء-troubleshooting)
11. [مخطط المحتوى (Schema Manifest)](#-مخطط-المحتوى-schema-manifest)

---

## 1. 🔭 نظرة عامة (Overview)

هذا المجلد (`library-toolkit/`) يحوي أدوات إدارة المكتبة القانونية — يحول ملفات `.md` المكتوبة بالعربية إلى بيانات منظمة في قاعدة البيانات، ثم يعرضها الموقع للمستخدمين.

### ماذا تفعل هذه الأدوات؟

- **تحليل (Parse):** تقرأ ملفات Markdown من مجلد المحتوى وتحولها إلى ملفات JSON منظمة
- **زرع (Seed):** ترفع ملفات JSON إلى قاعدة بيانات Supabase
- **مسح (Clear):** تحذف البيانات القديمة من قاعدة البيانات
- **تحقق (Verify):** تتأكد أن كل شيء يعمل بشكل صحيح
- **حالة (Status):** تعرض عدد الصفوف في كل جدول

### خط سير البيانات (Data Pipeline)

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  ملفات .md      │────▶│   Parsers    │────▶│  JSON Files  │────▶│   Seeder     │────▶│  Supabase DB │
│  (المحتوى       │     │  (محللات)    │     │  (output/)   │     │  (الزارع)    │     │ (قاعدة       │
│   بالعربية)     │     │              │     │              │     │              │     │  البيانات)   │
└─────────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                                              │
                                                                                              ▼
                                                                                      ┌──────────────┐
                                                                                      │   Website    │
                                                                                      │  (nezamy.sa) │
                                                                                      │  (/library)  │
                                                                                      └──────────────┘
```

```
 ملفات .md ──▶ library:parse ──▶ JSON ──▶ library:seed ──▶ Supabase ──▶ الموقع
                                                              ▲
                                          library:clear ──────┘  (مسح قبل إعادة الزرع)
                                          library:status        (عرض الحالة)
                                          library:verify        (التحقق بعد الزرع)
```

### 📂 ماذا يوجد في المجلد (What's in here)

```
library-toolkit/
├── README.md                ← هذا الدليل (this guide)
├── library-clear.mjs        ← مسح جداول المكتبة (wipe library tables)
├── library-parse.mjs        ← تحليل ملفات .md → JSON (parse raw content)
├── library-seed.mjs         ← زرع البيانات في قاعدة البيانات (insert into DB)
├── library-verify.mjs       ← التحقق بعد الزرع (post-deployment checks)
├── library-status.mjs       ← عرض عدد الصفوف (show row counts)
└── output/                  ← ملفات JSON المُحللة (auto-created by parse)
```

---

## 2. ✅ المتطلبات (Prerequisites)

### البرامج المطلوبة

| المتطلب | الحد الأدنى | التحقق |
|---|---|---|
| Node.js | v18+ | `node -v` |
| npm | v9+ (يأتي مع Node) | `npm -v` |
| Git | أي إصدار حديث | `git --version` |

### متغيرات البيئة (Environment Variables)

يجب أن يوجد ملف `.env.local` في جذر المشروع (`nzamy-website/.env.local`) ويحوي:

```env
# مطلوب لجميع الأوامر (required for all commands)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...your-service-role-key

# مطلوب لأمر verify فقط (required for verify only)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key
```

> ⚠️ **مهم:** `SUPABASE_SERVICE_ROLE_KEY` هو مفتاح إداري كامل الصلاحيات. لا تشاركه مع أحد ولا ترفعه إلى GitHub.

> 💡 السكريبتات تقرأ المتغيرات تلقائياً من `.env.local` أو `.env` أو `.env.vps` — لا حاجة لتمريرها يدوياً.

### مجلد المحتوى (Content Directory)

يجب أن يكون لديك مجلد المحتوى القانوني (يأتي من صاحب المحتوى). المسار النموذجي:

```
D:/path/to/01_المكتبة_القانونية/
```

تمرر هذا المسار عبر `--input` لأمر `library:parse`.

### التحقق من الجاهزية

```bash
# تأكد من وجود المتغيرات
npm run library:status
# إذا ظهر "✗ Missing SUPABASE_URL" → أضفها إلى .env.local
# إذا ظهرت أرقام الصفوف → كل شيء جاهز ✅
```

---

## 3. 🚀 البداية السريعة (Quick Start)

### أول مرة — زرع المكتبة من الصفر

```bash
# 1. ادخل مجلد المشروع
cd nzamy-website

# 2. تأكد أن المتغيرات موجودة
npm run library:status

# 3. حلّل المحتوى (غيّر المسار حسب موقع ملفاتك)
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية"

# 4. راجع المخرجات (اختياري — preview)
npm run library:seed -- --dry-run

# 5. ازرع البيانات فعلياً
npm run library:seed

# 6. تحقق أن كل شيء سليم
npm run library:verify

# 7. اطلع على الأرقام النهائية
npm run library:status
```

### خلاصة الأمر (Copy-paste one-liner)

```bash
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية" && npm run library:seed && npm run library:verify
```

> 💡 **دائماً شغّل `-- --dry-run` أو `-- --dry` أولاً إذا لم تكن متأكداً. لن تُكتب أي بيانات.**

---

## 4. 📖 مرجع الأوامر (Commands Reference)

جميع الأوامر تُنفذ من جذر المشروع `nzamy-website/`.

---

### 4.1 `library:status` — عرض الحالة (Show Status)

**ماذا يفعل:** يعرض عدد الصفوف في كل جدول من جداول المكتبة، مجمّعة حسب النوع.

**هل يكتب في قاعدة البيانات:** ❌ لا — قراءة فقط

```bash
# الأمر
npm run library:status

# أو مباشرة
node library-toolkit/library-status.mjs
```

**مثال المخرجات:**

```
════════════════════════════════════════════════════════════
  Library Status — Row Counts
════════════════════════════════════════════════════════════

── Laws (أنظمة ولوائح) ──
  laws                               42
  chapters                          385
  articles                         4210
  article_amendments                 67
  ──────────────────────────── ────────
  subtotal                         4704

── Decrees (أوامر وتعاميم) ──
  decrees_circulars                  28
  decree_pages                      412
  ──────────────────────────── ────────
  subtotal                          440

── Precedents (مبادئ وسوابق قضائية) ──
  judicial_collections               12
  principles                        856
  principle_paragraphs             2140
  ──────────────────────────── ────────
  subtotal                         3008

── Feqh (فقه ومراجع) ──
  feqh_books                          8
  feqh_chapters                      94
  feqh_sections                     312
  feqh_blocks                      1580
  ──────────────────────────── ────────
  subtotal                         1994

── User Data ──
  smart_folders                       0
  smart_folder_items                  0
  issue_reports                       0
  invitations                         0
  ──────────────────────────── ────────
  subtotal                            0

════════════════════════════════════════════════════════════
  GRAND TOTAL                     10146
════════════════════════════════════════════════════════════
```

**متى تستخدمه:**
- ✅ قبل وبعد الزرع للتأكد من الأرقام
- ✅ للتحقق السريع من صحة البيانات
- ✅ عند الشك في نقص أو زيادة

---

### 4.2 `library:parse` — تحليل المحتوى (Parse Content)

**ماذا يفعل:** يقرأ ملفات `.md` من مجلد المحتوى ويحولها إلى ملفات JSON منظمة في `library-toolkit/output/`. يستدعي المحللات الأربعة (laws, decrees, precedents, feqh) من `scripts/parsers/`.

**هل يكتب في قاعدة البيانات:** ❌ لا — يكتب ملفات محلية فقط في `output/`

```bash
# الأمر الأساسي — تحليل جميع الأنواع
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية"

# تحليل نوع واحد فقط
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية" --type laws
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية" --type decrees
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية" --type precedents
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية" --type feqh

# أو مباشرة بدون npm
node library-toolkit/library-parse.mjs --input "D:/path/to/01_المكتبة_القانونية" --type laws
```

**الأعلام (Flags):**

| العلم | مطلوب | الوصف |
|---|---|---|
| `--input <path>` | ✅ نعم | مسار مجلد المحتوى الجذري |
| `--type <type>` | ❌ اختياري | تحليل نوع واحد فقط: `laws` \| `decrees` \| `precedents` \| `feqh` |

**مثال المخرجات:**

```
════════════════════════════════════════════════════════════
  Library Parse
════════════════════════════════════════════════════════════
  Input:  D:\path\to\01_المكتبة_القانونية
  Output: D:\...\library-toolkit\output
  Types:  laws, decrees, precedents, feqh

── LAWS ──
  Input path: D:\path\to\01_المكتبة_القانونية\أنظمة ولوائح
  Running: npx tsx "scripts/parsers/parse-laws.ts" ...
  ✔ laws parsed successfully

── DECREES ──
  ...
  ✔ decrees parsed successfully

── Output Files ──
  laws.json                                   245.3 KB
  decrees.json                                 89.7 KB
  precedents.json                             312.1 KB
  feqh.json                                   178.4 KB

──────────────────────────────────────────────────────────
✔ Done: 4 succeeded, 0 failed
```

**متى تستخدمه:**
- ✅ أول مرة قبل الزرع
- ✅ بعد تحديث ملفات المحتوى
- ✅ عند إضافة محتوى جديد

---

### 4.3 `library:seed` — زرع البيانات (Seed Database)

**ماذا يفعل:** يقرأ ملفات JSON من `library-toolkit/output/` ويدخلها في قاعدة بيانات Supabase (schema: `library`). يُنفذ عبر `scripts/seed-library.ts`.

**هل يكتب في قاعدة البيانات:** ✅ نعم (ما لم تستخدم `--dry-run`)

```bash
# معاينة بدون كتابة
npm run library:seed -- --dry-run

# زرع جميع الأنواع
npm run library:seed

# زرع نوع واحد فقط
npm run library:seed -- --type laws
npm run library:seed -- --type decrees
npm run library:seed -- --type precedents
npm run library:seed -- --type feqh

# مسح + زرع معاً (يمسح القديم ثم يزرع الجديد)
npm run library:seed -- --clean
npm run library:seed -- --clean --type feqh
```

**الأعلام (Flags):**

| العلم | الوصف |
|---|---|
| `--dry-run` | معاينة فقط — لا يكتب أي شيء في قاعدة البيانات |
| `--type <type>` | زرع نوع واحد: `laws` \| `decrees` \| `precedents` \| `feqh` |
| `--clean` | يمسح الصفوف الموجودة قبل الزرع (مفيد لتجنب التكرار) |

**متى تستخدمه:**
- ✅ بعد `library:parse` مباشرة
- ✅ عند تحديث المحتوى (مع `--clean`)
- ✅ أول مرة لملء قاعدة البيانات

---

### 4.4 `library:clear` — مسح البيانات (Clear Database)

**ماذا يفعل:** يحذف جميع الصفوف من جداول المكتبة. يمسح بترتيب آمن (الأبناء أولاً) لتجنب أخطاء المفاتيح الأجنبية.

**هل يكتب في قاعدة البيانات:** ✅ نعم — يحذف (ما لم تستخدم `--dry`)

```bash
# معاينة (يعرض عدد الصفوف فقط — لا يحذف شيئاً)
npm run library:clear -- --dry

# مسح جميع جداول المكتبة
npm run library:clear

# مسح مجموعة واحدة فقط
npm run library:clear -- --type laws
npm run library:clear -- --type decrees
npm run library:clear -- --type precedents
npm run library:clear -- --type feqh
npm run library:clear -- --type user
```

**الأعلام (Flags):**

| العلم | الوصف |
|---|---|
| `--dry` | معاينة فقط — يعرض عدد الصفوف بدون حذف |
| `--type <type>` | مسح مجموعة واحدة: `laws` \| `decrees` \| `precedents` \| `feqh` \| `user` |

> ⚠️ **تحذير:** `--type user` يمسح المجلدات الذكية وبلاغات المستخدمين. استخدمه بحذر شديد.

**مثال المخرجات (dry run):**

```
════════════════════════════════════════════════════════════
  Library Clear (DRY RUN)
════════════════════════════════════════════════════════════

── LAWS ──
  article_amendments: 67 rows
  articles: 4210 rows
  chapters: 385 rows
  laws: 42 rows

── DECREES ──
  decree_pages: 412 rows
  decrees_circulars: 28 rows

──────────────────────────────────────────────────────────
--dry: no database writes. Remove --dry to delete.
```

**مثال المخرجات (live):**

```
════════════════════════════════════════════════════════════
  Library Clear (LIVE)
════════════════════════════════════════════════════════════

── LAWS ──
  article_amendments: 67 rows
  ✔ deleted 67 rows from article_amendments
  articles: 4210 rows
  ✔ deleted 4210 rows from articles
  ...

──────────────────────────────────────────────────────────
✔ Total deleted: 10146 rows
```

**متى تستخدمه:**
- ✅ قبل إعادة الزرع الكامل
- ✅ لتنظيف بيانات تجريبية
- ✅ عند حدوث تعارض مفاتيح أجنبية (FK constraint errors)

---

### 4.5 `library:verify` — التحقق (Verify)

**ماذا يفعل:** يُنفذ فحوصات شاملة بعد الزرع: اتصال Supabase، عدد الصفوف، صحة API، البحث، والبحث النصي الكامل (FTS). يستدعي `scripts/verify-library.ts`.

**هل يكتب في قاعدة البيانات:** ❌ لا — قراءة فقط

```bash
npm run library:verify

# أو مباشرة
node library-toolkit/library-verify.mjs
```

**متطلبات إضافية:**
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` في `.env.local`
- خادم التطوير يعمل (`npm run dev`) إذا كان الفحص يتضمن API health checks
- `BASE_URL` (اختياري — افتراضياً `http://localhost:3000`)

**متى تستخدمه:**
- ✅ بعد كل عملية زرع
- ✅ بعد نشر تحديث على الخادم
- ✅ عند الشك في مشكلة

---

### 4.6 `library:reseed` — إعادة الزرع الكاملة (Full Reseed Pipeline)

**ماذا يفعل:** ينفذ ثلاث خطوات متتالية:
1. `library:clear` — مسح جميع البيانات
2. `library:seed` — زرع البيانات من `output/`
3. `library:verify` — التحقق من النتائج

**هل يكتب في قاعدة البيانات:** ✅ نعم — يمسح ويزرع

```bash
npm run library:reseed
```

> ⚠️ **ملاحظة:** هذا الأمر لا يُنفذ `parse`. تأكد أنك نفذت `library:parse` أولاً وأن ملفات JSON في `output/` محدثة.

**ما يعادله يدوياً:**

```bash
npm run library:clear && npm run library:seed && npm run library:verify
```

**متى تستخدمه:**
- ✅ بعد تحديث المحتوى وتحليله
- ✅ لإعادة تعبئة قاعدة البيانات بالكامل

---

### 4.7 استخدام السكريبتات مباشرة (Direct Script Usage)

يمكنك تشغيل كل سكريبت مباشرة بدون `npm run`:

```bash
# مباشرة بـ node
node library-toolkit/library-status.mjs
node library-toolkit/library-clear.mjs --dry
node library-toolkit/library-clear.mjs --type laws
node library-toolkit/library-parse.mjs --input "D:/path" --type feqh
node library-toolkit/library-seed.mjs --dry-run
node library-toolkit/library-seed.mjs --type precedents
node library-toolkit/library-verify.mjs

# أو مع تمرير المتغيرات يدوياً
SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... node library-toolkit/library-status.mjs
```

---

### 📋 جدول ملخص الأوامر (Quick Reference)

| الأمر | الوصف | يكتب؟ |
|---|---|---|
| `npm run library:status` | عرض عدد الصفوف لكل جدول | ❌ لا |
| `npm run library:parse -- --input <path>` | تحليل `.md` → JSON | ⚠️ ملفات محلية |
| `npm run library:parse -- --input <path> --type laws` | تحليل نوع واحد | ⚠️ ملفات محلية |
| `npm run library:seed -- --dry-run` | معاينة الزرع | ❌ لا |
| `npm run library:seed` | **زرع جميع الأنواع** | ✅ نعم |
| `npm run library:seed -- --type laws` | زرع نوع واحد | ✅ نعم |
| `npm run library:seed -- --clean` | مسح + زرع | ✅ نعم |
| `npm run library:clear -- --dry` | معاينة المسح | ❌ لا |
| `npm run library:clear` | **مسح جميع الجداول** | ✅ نعم |
| `npm run library:clear -- --type laws` | مسح مجموعة واحدة | ✅ نعم |
| `npm run library:verify` | فحوصات التحقق | ❌ لا |
| `npm run library:reseed` | **مسح → زرع → تحقق** | ✅ نعم |

---

## 5. 📁 هيكل المحتوى (Content Structure)

### مجلد المحتوى الجذري

مجلد المحتوى (يأتيك من صاحب المحتوى) يجب أن يحوي مجلدات فرعية بأسماء عربية:

```
01_المكتبة_القانونية/
├── أنظمة ولوائح/              → laws    (Systems & Regulations — الأنظمة واللوائح التنفيذية)
├── أوامر وتعاميم/              → decrees (Orders & Circulars — الأوامر الملكية والتعاميم)
├── مبادئ وسوابق قضائية/        → precedents (Principles & Precedents — المبادئ والسوابق القضائية)
└── فقه ومراجع/                 → feqh    (Jurisprudence & References — الفقه والمراجع)
```

> 💡 إذا لم يجد المحلل المجلد الفرعي بالاسم العربي، يستخدم المجلد الجذري مباشرة. تأكد من تطابق الأسماء بالضبط.

### ربط الأسماء بالمحللات (Arabic → Parser Mapping)

| المجلد العربي | المحلل (Parser) | الجداول المستهدفة |
|---|---|---|
| `أنظمة ولوائح` | `parse-laws.ts` | `laws`, `chapters`, `articles`, `article_amendments` |
| `أوامر وتعاميم` | `parse-decrees.ts` | `decrees_circulars`, `decree_pages` |
| `مبادئ وسوابق قضائية` | `parse-precedents.ts` | `judicial_collections`, `principles`, `principle_paragraphs` |
| `فقه ومراجع` | `parse-feqh.ts` | `feqh_books`, `feqh_chapters`, `feqh_sections`, `feqh_blocks` |

### نموذج الطبقتين (Two-Layer Model)

كل ملف `.md` في المحتوى يتبع نموذج الطبقتين:

#### طبقة الآلة — Frontmatter (Machine Layer)

```yaml
---
title: "نظام المرافعات الشرعية"
slug: "nizam-al-morafaat"
type: "نظام"
issuing_authority: "مجلس الوزراء"
issue_date_hijri: "1435/01/15"
total_articles: 242
is_active: true
---
```

- **كل الحقول موجودة دائماً** — الفارغ = `null` (لا نص مثل "غير متوفر")
- هذا ما يقرأه سكريبت البذرة (Seeder)
- التواريخ الهجرية بصيغة `YYYY/MM/DD` نظيفة بلا لاحقة (هـ)
- الأرقام أصلية (لا تُغلّف بنص)
- القيم المنطقية `true`/`false` (لا "نعم"/"لا")

#### طبقة الإنسان — البطاقة المرئية (Human Layer / Visible Card)

```markdown
## البطاقة المرئية

| البند         | القيمة                    |
|--------------|--------------------------|
| الجهة المصدرة | مجلس الوزراء             |
| تاريخ الإصدار | 1435/01/15 هـ            |
| عدد المواد    | ٢٤٢ مادة                 |
```

- تُشتق من الـ frontmatter
- تعرض الفارغ إمّا مخفياً أو "غير متوفر في المصدر"
- لاحقة (هـ) تُضاف هنا فقط
- **ليست** ما يقرأه سكربت البذرة

---

## 6. 🗃️ جداول قاعدة البيانات (Database Tables)

جميع الجداول تقع في schema `library` (وليس `public`) في Supabase.

### نظرة عامة — 17 جدولاً في 5 مجموعات

```
library schema (17 tables)
├── Laws أنظمة ولوائح (4)
│   ├── laws                    ← الأنظمة (الجدول الأب)
│   ├── chapters                ← الأبواب والفصول
│   ├── articles                ← المواد
│   └── article_amendments      ← تعديلات المواد
├── Decrees أوامر وتعاميم (2)
│   ├── decrees_circulars       ← الأوامر والتعاميم (الأب)
│   └── decree_pages            ← صفحات التعميم
├── Precedents مبادئ وسوابق (3)
│   ├── judicial_collections    ← مجموعات السوابق (الأب)
│   ├── principles              ← المبادئ القضائية
│   └── principle_paragraphs    ← فقرات المبدأ
├── Feqh فقه ومراجع (4)
│   ├── feqh_books              ← الكتب (الأب)
│   ├── feqh_chapters           ← الأبواب
│   ├── feqh_sections           ← الفصول
│   └── feqh_blocks             ← الفقرات النصية
└── User بيانات المستخدم (4)
    ├── smart_folders            ← المجلدات الذكية
    ├── smart_folder_items       ← عناصر المجلدات
    ├── invitations              ← الدعوات
    └── issue_reports            ← بلاغات المشاكل
```

### العلاقات وترتيب الحذف (FK Relationships & Deletion Order)

عند المسح، يجب حذف **الأبناء أولاً** ثم الآباء لتجنب أخطاء المفاتيح الأجنبية:

#### Laws — ترتيب الحذف

```
1. article_amendments  ← يُحذف أولاً (ابن articles)
2. articles            ← ثم المواد (ابن chapters)
3. chapters            ← ثم الأبواب (ابن laws)
4. laws                ← أخيراً الأنظمة (الجذر)
```

#### Decrees — ترتيب الحذف

```
1. decree_pages        ← يُحذف أولاً (ابن decrees_circulars)
2. decrees_circulars   ← ثم التعاميم (الجذر)
```

#### Precedents — ترتيب الحذف

```
1. principle_paragraphs ← يُحذف أولاً (ابن principles)
2. principles           ← ثم المبادئ (ابن judicial_collections)
3. judicial_collections ← أخيراً المجموعات (الجذر)
```

#### Feqh — ترتيب الحذف

```
1. feqh_blocks         ← يُحذف أولاً (ابن feqh_sections)
2. feqh_sections       ← ثم الفصول (ابن feqh_chapters)
3. feqh_chapters       ← ثم الأبواب (ابن feqh_books)
4. feqh_books          ← أخيراً الكتب (الجذر)
```

#### User — ترتيب الحذف

```
1. smart_folder_items  ← يُحذف أولاً (ابن smart_folders)
2. smart_folders       ← ثم المجلدات
3. issue_reports       ← مستقل
4. invitations         ← مستقل
```

> 💡 أمر `library:clear` يعرف هذا الترتيب تلقائياً ويطبقه. لا تحتاج لحذف الجداول يدوياً.

---

## 7. 🔄 العمليات الشائعة (Common Workflows)

### 🆕 الزرع لأول مرة (First-Time Seeding)

```bash
# الخطوة 1: تحليل المحتوى
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية"

# الخطوة 2: زرع البيانات
npm run library:seed

# الخطوة 3: التحقق
npm run library:verify

# الخطوة 4: التأكد من الأرقام
npm run library:status
```

### 🔄 تحديث محتوى موجود (Updating Existing Content)

عند تعديل ملفات `.md` في مجلد المحتوى:

```bash
# أعد تحليل المحتوى المُحدّث
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية"

# أعد الزرع (مسح → زرع → تحقق)
npm run library:reseed
```

### ➕ إضافة نوع واحد فقط (Adding One Type)

مثال: إضافة أنظمة جديدة فقط:

```bash
# تحليل الأنظمة فقط
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية" --type laws

# زرع الأنظمة فقط (مع مسح القديم)
npm run library:seed -- --clean --type laws
```

### 🧹 مسح قسم واحد (Clearing One Section)

```bash
# معاينة أولاً
npm run library:clear -- --dry --type decrees

# تنفيذ المسح
npm run library:clear -- --type decrees
```

### 🔃 إعادة ضبط كاملة (Full Reset)

```bash
# 1. مسح كل شيء
npm run library:clear

# 2. تحليل من جديد
npm run library:parse -- --input "D:/path/to/01_المكتبة_القانونية"

# 3. زرع
npm run library:seed

# 4. تحقق
npm run library:verify
```

### 🩺 فحص الصحة (Health Check)

```bash
# عرض الأرقام
npm run library:status

# تحقق شامل
npm run library:verify
```

---

## 8. 💰 نظام الدفع (Paywall)

المكتبة القانونية تستخدم نظام paywall يتحكم بمن يرى المحتوى الكامل.

### كيف يعمل؟

```
                    ┌───────────────────────┐
                    │   مستخدم يطلب مادة    │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │ هل النظام في القائمة   │──── نعم ──▶ ✅ المحتوى كامل (مجاني)
                    │   البيضاء (whitelist)? │
                    └───────────┬───────────┘
                                │ لا
                    ┌───────────▼───────────┐
                    │  هل المستخدم Pro+?     │──── نعم ──▶ ✅ المحتوى كامل
                    │  (pro/max/corp/       │
                    │   enterprise)         │
                    └───────────┬───────────┘
                                │ لا (free أو guest)
                    ┌───────────▼───────────┐
                    │  عدد المواد < الحد     │──── نعم ──▶ ✅ المادة متاحة
                    │  المجاني؟              │
                    └───────────┬───────────┘
                                │ لا
                                ▼
                    🔒 المادة مقفلة — يحتاج ترقية
```

### الإعدادات في `platform_settings`

| المفتاح | النوع | الوصف | القيمة الافتراضية |
|---|---|---|---|
| `library_free_article_limit` | `{ default: number }` | عدد المواد المجانية لكل نظام | `5` |
| `library_whitelisted_laws` | `{ slugs: string[] }` | أنظمة مجانية بالكامل دائماً (بالـ slug) | `[]` |
| `library_free_law_overrides` | `{ overrides: { slug: number } }` | حد مجاني مخصص لنظام معين | `{}` |
| `library_free_items` | `{ laws: [], decrees: [], ... }` | محتوى مجاني لكل نوع | `{}` |

### مستويات الاشتراك (Subscription Tiers)

| المستوى | الوصول |
|---|---|
| **Guest** (زائر بدون حساب) | أول N مادة من كل نظام |
| **Free** (حساب مجاني) | أول N مادة من كل نظام |
| **Pro** | ✅ وصول كامل لكل المحتوى |
| **Max** | ✅ وصول كامل لكل المحتوى |
| **Corp** | ✅ وصول كامل لكل المحتوى |
| **Enterprise** | ✅ وصول كامل لكل المحتوى |

### كيف تُعدّل إعدادات الدفع؟

من لوحة الإدارة (Admin Dashboard):
1. اذهب إلى **nezamy.sa/dashboard/admin/settings**
2. غيّر **عدد المواد المجانية** (`library_free_article_limit`)
3. أضف أنظمة إلى **القائمة البيضاء** (`library_whitelisted_laws`) لجعلها مجانية بالكامل
4. اضغط **حفظ**

---

## 9. 🌐 مسارات API (API Routes)

جميع المسارات تقع تحت `/api/library/` وتُنفذ كـ Next.js API Routes.

| # | المسار | الطريقة | الوصف |
|---|---|---|---|
| 1 | `/api/library/init` | `GET` | القائمة الأولية للمكتبة مع pagination — تُستخدم عند تحميل صفحة المكتبة |
| 2 | `/api/library/search` | `POST` | بحث نصي كامل (Full-Text Search) في جميع أنواع المحتوى |
| 3 | `/api/library/autocomplete` | `GET` | اقتراحات بحث أثناء الكتابة (search suggestions) |
| 4 | `/api/library/laws/[slug]` | `GET` | تفاصيل نظام كامل مع الأبواب والمواد واللوائح والتعديلات |
| 5 | `/api/library/books/[slug]` | `GET` | تفاصيل كتاب فقهي مع فهرس المحتوى (أبواب/فصول) والفقرات |
| 6 | `/api/library/decrees/[id]` | `GET` | تفاصيل تعميم/أمر مع جميع الصفحات |
| 7 | `/api/library/precedents/[slug]` | `GET` | تفاصيل مجموعة مبادئ قضائية مع المبادئ والفقرات |
| 8 | `/api/library/folders` | `GET` `POST` `PATCH` `DELETE` | CRUD للمجلدات الذكية (Smart Folders) |
| 9 | `/api/library/folders/items` | `POST` | إضافة عنصر إلى مجلد ذكي |
| 10 | `/api/library/reports` | `POST` | إرسال بلاغ عن مشكلة في المحتوى (Issue Report) |

### ملاحظات على API

- مسارات التفاصيل (`laws/[slug]`، `books/[slug]`، `precedents/[slug]`، `decrees/[id]`) تُطبق فحص الـ paywall تلقائياً
- مسار `folders` يتطلب مصادقة المستخدم (authentication)
- مسار `init` يقبل query parameters للـ pagination والفلترة
- مسار `search` يقبل JSON body مع `query` و `type` filters

---

## 10. 🧯 استكشاف الأخطاء (Troubleshooting)

| المشكلة | الرمز | الحل |
|---|---|---|
| `✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY` | ⚠️ | أضفهما إلى `nzamy-website/.env.local` |
| `✗ Input directory not found` | ⚠️ | تأكد من صحة المسار في `--input`. استخدم المسار الكامل مع علامات تنصيص: `"D:/path/to/المجلد"` |
| `✗ Parser not found` | ⚠️ | تأكد من وجود `scripts/parsers/parse-{type}.ts` |
| `delete failed: ...violates foreign key constraint` | ❌ | شغّل `npm run library:clear` أولاً (يمسح بالترتيب الصحيح). لا تحذف الجداول يدوياً من Supabase |
| `Seeder failed` | ❌ | شغّل `npm run library:seed -- --dry-run` لمعرفة السبب. تأكد من وجود ملفات JSON في `library-toolkit/output/` |
| الجداول فارغة بعد الزرع | ❌ | شغّل `npm run library:verify` و `npm run library:status`. تأكد أن `output/` يحوي ملفات JSON |
| المحتوى لا يظهر في الموقع | ⚠️ | تأكد أن البيانات في Supabase (`library:status`). في الإنتاج: `git pull && npm run build && pm2 reload nzamy` |
| `Parser failed (exit code 1)` | ❌ | تأكد أن ملفات المحتوى بترميز UTF-8. افتحها في محرر نصوص وتأكد من عدم وجود أحرف مشوّهة |
| المجلد العربي غير معروف | ⚠️ | تأكد أن اسم المجلد مطابق تماماً: `أنظمة ولوائح` (وليس `انظمة ولوائح` أو `أنظمه ولوائح`) |
| `Verification failed` | ⚠️ | تأكد أن `npm run dev` يعمل (لفحوصات API). أضف `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| نظام الدفع لا يعمل (المحتوى كله مجاني أو كله مقفل) | ⚠️ | تحقق من `platform_settings` في Supabase: تأكد أن `library_free_article_limit` و `library_whitelisted_laws` بالقيم الصحيحة. استخدم لوحة الإدارة `/dashboard/admin/settings` |
| `count(table) failed` | ❌ | تأكد أن schema `library` موجود في Supabase وأن الجداول مُنشأة (migrations applied) |

### 💡 نصائح عامة

1. **دائماً استخدم `--dry` أو `--dry-run` أولاً** قبل أي عملية كتابة
2. **الترتيب مهم:** parse → seed → verify (لا تزرع بدون تحليل أولاً)
3. **الترميز:** جميع ملفات المحتوى يجب أن تكون UTF-8
4. **المسارات:** استخدم `/` بدلاً من `\` في المسارات، وضعها بين علامات تنصيص إذا كانت تحوي مسافات أو أحرف عربية
5. **النسخ الاحتياطي:** قبل `library:clear` في الإنتاج، خذ نسخة من Supabase Dashboard → Database → Backups

---

## 11. 📜 مخطط المحتوى (Schema Manifest)

المرجع المعتمد لهيكلة المكتبة هو ملف **Schema Manifest**:

```
test/library-last/schema_manifest.json    (v1.2)
```

هذا الملف هو **العقد الموحّد** بين:
- **(أ)** مهارة تنقيح المكتبة (المحللات/Parsers)
- **(ب)** سكربت البذرة (Seeder) الذي يقرأ frontmatter ويرفعه لقاعدة البيانات

### ماذا يحوي Schema Manifest؟

| القسم | الوصف |
|---|---|
| `manifest_version` | رقم الإصدار (حالياً `1.2`) |
| `two_layer_model` | شرح نموذج الطبقتين (آلة/إنسان) |
| `conventions` | اصطلاحات القيم الفارغة، التواريخ، الأرقام، والمفاتيح |
| `enums` | القيم المسموحة للحقول التعدادية (أنواع، حالات، جهات) |
| `forbidden_in_frontmatter` | نصوص ممنوعة (مثل "غير متوفر" — استخدم `null` بدلاً منها) |
| `internal_fields_not_seeded` | حقول داخلية لا تُزرع في قاعدة البيانات |

> 💡 إذا اختلف أي مرجع آخر مع هذا الملف — **يُقدَّم هذا الملف** (Schema Manifest).

---

## 🔗 سكريبتات ذات صلة (Related Scripts)

| الملف | الوصف |
|---|---|
| `scripts/parsers/parse-laws.ts` | محلل الأنظمة واللوائح |
| `scripts/parsers/parse-decrees.ts` | محلل الأوامر والتعاميم |
| `scripts/parsers/parse-precedents.ts` | محلل المبادئ والسوابق القضائية |
| `scripts/parsers/parse-feqh.ts` | محلل الفقه والمراجع |
| `scripts/seed-library.ts` | سكربت الزرع الرئيسي |
| `scripts/verify-library.ts` | سكربت التحقق |
| `test/library-last/schema_manifest.json` | عقد الاسكيما (v1.2) |
| `src/lib/access-control.ts` | منطق الـ paywall |
| `src/app/api/library/` | مسارات API |
| `blog-toolkit/` | صندوق أدوات المدونة (نفس النمط) |

---

## 🔄 بعد الزرع — تحديث الموقع المباشر (After Seeding — Deploy)

الزرع يضع **البيانات** في Supabase من جهازك. الموقع المباشر (`nezamy.sa`) يعرض البيانات بعد تحديث كود الخادم:

```bash
# SSH إلى السيرفر
ssh user@server

# تحديث الكود وإعادة البناء
cd /www/wwwroot/nzamy/latest-nzamy-full
git pull origin main
npm run build
pm2 reload nzamy
pm2 logs nzamy --lines 20 --nostream    # ابحث عن "✓ Ready"
```

ثم افتح `https://nezamy.sa/library` في **نافذة خاصة جديدة** (Incognito) للتأكد.

> 💡 لا حاجة لتنفيذ SQL على السيرفر — الـ SQL يُطبق عبر Supabase SQL Editor، والزرع يتم من جهازك.
