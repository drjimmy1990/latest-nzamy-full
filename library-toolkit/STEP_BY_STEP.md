# 🚀 خطوات مسح وبذرة المكتبة — Step-by-Step Clear & Seed

---

## المتطلبات قبل البدء

### ١. تأكد من وجود `.env.local`

```
المسار: D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.env.local
```

يجب أن يحتوي:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

### ٢. تأكد من مسار المحتوى

المحتوى موجود هنا (أو أي مكان تضع فيه مجلد المكتبة):
```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\test\library-last\نماذج هيكل الأقسام الرئيسية
```

يجب أن يحتوي على هذه المجلدات الأربعة:
```
├── أنظمة ولوائح/
├── أوامر وتعاميم/
├── مبادئ وسوابق قضائية/
└── فقه ومراجع/
```

---

## الخطوات

### ⓪ افتح Terminal في مجلد المشروع

```powershell
cd "D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website"
```

---

### ① شوف الوضع الحالي في قاعدة البيانات

```powershell
npm run library:status
```

**النتيجة المتوقعة:**
```
═══════════════════════════════════════
  Library Status
═══════════════════════════════════════

  📚 الأنظمة (Laws)
     laws                    0 rows
     chapters                0 rows
     articles                0 rows
     article_amendments      0 rows

  📜 الأوامر (Decrees)
     decrees_circulars       0 rows
     decree_pages            0 rows

  ⚖️ المبادئ (Precedents)
     ...

  Grand Total: 0 rows
```

> إذا كان فيه بيانات قديمة، الخطوة التالية تمسحها.

---

### ② امسح البيانات القديمة (إن وجدت)

**أولاً — فحص جاف (المعاينة هي الوضع الافتراضي — بدون حذف):**
```powershell
npm run library:clear
```

**ثانياً — مسح فعلي (يتطلب `--live`؛ وعلى الإنتاج أيضاً `--force-prod`):**
```powershell
npm run library:clear -- --live
```

> ✅ هذا يمسح كل الجداول الـ 17 بترتيب آمن (الجداول الفرعية أولاً ثم الرئيسية).

---

### ③ حلّل ملفات المحتوى (Parse)

```powershell
npm run library:parse -- --input "D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\test\library-last\نماذج هيكل الأقسام الرئيسية"
```

**ماذا يحدث:**
1. يبحث عن مجلد `أنظمة ولوائح/` → يشغّل `parse-laws.ts`
2. يبحث عن مجلد `أوامر وتعاميم/` → يشغّل `parse-decrees.ts`
3. يبحث عن مجلد `مبادئ وسوابق قضائية/` → يشغّل `parse-precedents.ts`
4. يبحث عن مجلد `فقه ومراجع/` → يشغّل `parse-feqh.ts`

كل محلل يدخل **كل المجلدات الفرعية** بشكل متكرر ويجد كل ملفات `.md`.

**النتيجة:** ملفات JSON في:
```
nzamy-website\library-toolkit\output\
├── laws.json
├── decrees.json
├── precedents.json
└── feqh.json
```

---

### ④ ازرع في قاعدة البيانات (Seed)

**أولاً — تجربة جافة (يقرأ بس ما يكتب):**
```powershell
npm run library:seed -- --dry-run
```

**ثانياً — زرع فعلي:**
```powershell
npm run library:seed
```

**ماذا يحدث:**
1. يقرأ ملفات JSON من `library-toolkit/output/`
2. يدخل البيانات في Supabase بترتيب:
   - `laws` → `chapters` → `articles` → `article_amendments`
   - `decrees_circulars` → `decree_pages`
   - `judicial_collections` → `principles` → `principle_paragraphs`
   - `feqh_books` → `feqh_chapters` → `feqh_sections` → `feqh_blocks`

---

### ⑤ تحقق من النتائج

```powershell
npm run library:status
```

**النتيجة المتوقعة (بعد البذرة):**
```
  📚 الأنظمة (Laws)
     laws                   XX rows
     chapters              XXX rows
     articles             XXXX rows
     ...

  Grand Total: XXXX rows
```

---

## ملخص — الأوامر الخمسة بالترتيب

```powershell
# ⓪ اذهب لمجلد المشروع
cd "D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website"

# ① شوف الوضع
npm run library:status

# ② امسح القديم (معاينة افتراضياً — أضف --live للمسح الفعلي)
npm run library:clear -- --live

# ③ حلّل المحتوى
npm run library:parse -- --input "D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\test\library-last\نماذج هيكل الأقسام الرئيسية"

# ④ ازرع في DB
npm run library:seed

# ⑤ تحقق
npm run library:status
```

---

## أو: أمر واحد بعد التحليل

إذا أردت parse + زرع + تحقق بأمر واحد (بدون مسح — آمن وقابل للتكرار):

```powershell
npm run library:reseed -- --input "D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\test\library-last\نماذج هيكل الأقسام الرئيسية"
```

> هذا يساوي: `library:parse -- --input …` + `library:seed` + `library:verify`.
> للمسح المسبق استخدم `npm run library:reseed:wipe -- --input …` (مدمِّر).

---

## تحديث قسم واحد فقط

لا تحتاج تمسح وتزرع كل شيء. مثلاً لتحديث الأنظمة فقط:

```powershell
# مسح الأنظمة
npm run library:clear -- --type laws

# حلّل الأنظمة
npm run library:parse -- --input "D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\test\library-last\نماذج هيكل الأقسام الرئيسية" --type laws

# ازرع الأنظمة
npm run library:seed -- --type laws
```

الأقسام: `laws` | `decrees` | `precedents` | `feqh`

---

## هيكل المجلدات الكامل

```
nzamy-website\                                        ← مجلد المشروع (شغّل الأوامر من هنا)
│
├── .env.local                                        ← المفاتيح (SUPABASE_URL + SERVICE_ROLE_KEY)
│
├── library-toolkit\                                  ← أدوات المكتبة
│   ├── library-clear.mjs                             ← مسح الجداول
│   ├── library-parse.mjs                             ← تحليل المحتوى
│   ├── library-seed.mjs                              ← زرع في DB
│   ├── library-verify.mjs                            ← فحص الصحة
│   ├── library-status.mjs                            ← عدد الصفوف
│   ├── output\                                       ← ملفات JSON المُنتجة
│   │   ├── laws.json
│   │   ├── decrees.json
│   │   ├── precedents.json
│   │   └── feqh.json
│   ├── SEED_GUIDE.md                                 ← الدليل المختصر
│   └── README.md                                     ← الدليل الشامل
│
├── scripts\
│   ├── seed-library.ts                               ← البذار الأساسي
│   ├── verify-library.ts                             ← أداة التحقق
│   └── parsers\
│       ├── parse-laws.ts                             ← محلل الأنظمة
│       ├── parse-decrees.ts                          ← محلل التعاميم
│       ├── parse-precedents.ts                       ← محلل المبادئ
│       └── parse-feqh.ts                             ← محلل الفقه
│
└── test\library-last\                                ← محتوى المكتبة
    └── نماذج هيكل الأقسام الرئيسية\                  ← ← هذا المسار تمرره لـ --input
        ├── أنظمة ولوائح\                              ← 30 قسم فرعي
        │   ├── 00 - القسم الإجرائي والقضائي\
        │   │   └── اللائحة التنفيذية لإجراءات الاستئناف\
        │   │       └── ملف.md
        │   ├── 01 - القسم الجنائي\
        │   ├── 02 - القسم الإداري\
        │   ├── ... (30 قسم)
        │   └── 29 - القسم الدولي\
        │
        ├── أوامر وتعاميم\
        │   └── 30 - تعاميم\
        │       ├── تعاميم وزارة العدل\
        │       ├── تعاميم البنك المركزي السعودي\
        │       ├── المراسيم وقرارات مجلس الوزراء\
        │       └── ...
        │
        ├── مبادئ وسوابق قضائية\
        │   ├── 97 - السوابق القضائية\
        │   └── 98 - المبادئ القضائية\
        │       ├── 1- القضاء العادي\
        │       ├── 2- القضاء الإداري\
        │       └── 3- اللجان شبه القضائية\
        │
        └── فقه ومراجع\
            └── 99 - الكتب الفقهية والقانونية\
                ├── المغني - شرعي\
                ├── كشاف القناع - شرعي\
                ├── 1- مصنفات السنهوري\
                └── ... (15 كتاب)
```

---

## حل مشاكل شائعة

| المشكلة | السبب | الحل |
|---------|-------|------|
| `Missing SUPABASE_URL` | ملف `.env.local` مفقود أو فارغ | أنشئ الملف وضع المفاتيح |
| `Missing SERVICE_ROLE_KEY` | المفتاح غير موجود | أضفه من لوحة Supabase |
| `Input directory not found` | المسار خطأ | تحقق من المسار وعلامات التنصيص |
| `FK constraint violation` | البيانات القديمة تتعارض | شغّل `library:clear` أولاً |
| `Parser not found` | ملف المحلل مفقود | تحقق من `scripts/parsers/` |
| `0 files found` | المجلدات العربية غير موجودة | تحقق أن `أنظمة ولوائح` وأخواتها موجودة في مسار `--input` |
| `Seeder failed` | ملفات JSON فارغة | شغّل `library:parse` أولاً |

---

**آخر تحديث:** 2026-07-16
