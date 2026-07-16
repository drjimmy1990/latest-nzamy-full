# 🛠️ دليل المالك والمطوّر — تشغيل المشروع محلياً والتعاون عبر GitHub
# Owner & Developer Collaboration Guide

> **آخر تحديث:** ١٦ يوليو ٢٠٢٦
> **المشروع:** منصة نظامي (Nzamy) — `drjimmy1990/latest-nzamy-full`

---

## 📋 الفهرس

1. [المتطلبات الأساسية](#١-المتطلبات-الأساسية)
2. [تحميل المشروع من GitHub](#٢-تحميل-المشروع-من-github)
3. [إعداد ملف البيئة (.env.local)](#٣-إعداد-ملف-البيئة)
4. [تثبيت الحزم وتشغيل المشروع](#٤-تثبيت-الحزم-وتشغيل-المشروع)
5. [زرع بيانات المكتبة القانونية](#٥-زرع-بيانات-المكتبة-القانونية)
6. [زرع بيانات المدونة](#٦-زرع-بيانات-المدونة)
7. [طريقة العمل والتعاون — الفروع (Branches)](#٧-طريقة-العمل-والتعاون)
8. [الأوامر المفيدة — مرجع سريع](#٨-مرجع-سريع)
9. [استكشاف الأخطاء](#٩-استكشاف-الأخطاء)

---

## ١) المتطلبات الأساسية

قبل البدء، تأكد من تثبيت البرامج التالية على جهازك:

| البرنامج | الإصدار المطلوب | رابط التحميل |
|---|---|---|
| **Node.js** | v20 أو أعلى (الأفضل v24) | https://nodejs.org |
| **npm** | v10 أو أعلى (يأتي مع Node.js) | — |
| **Git** | أي إصدار حديث | https://git-scm.com |
| **VS Code** (محرر الأكواد) | اختياري لكن مُوصى | https://code.visualstudio.com |

### التحقق من التثبيت

افتح **Terminal** (أو **PowerShell** على Windows) واكتب:

```bash
node -v          # يجب أن يظهر v20.x.x أو أعلى
npm -v           # يجب أن يظهر 10.x.x أو أعلى
git --version    # يجب أن يظهر git version 2.x.x
```

> [!TIP]
> **على macOS:** يمكنك تثبيت كل شيء بأمر واحد:
> ```bash
> brew install node git
> ```
> **على Windows:** حمّل Node.js من الموقع الرسمي ← اختر LTS ← Next → Next → Finish.

---

## ٢) تحميل المشروع من GitHub

### الخطوة الأولى: انسخ المشروع (Clone)

```bash
# اختر مجلداً مناسباً على جهازك
cd ~/Desktop

# انسخ المشروع من GitHub
git clone https://github.com/drjimmy1990/latest-nzamy-full.git

# ادخل المجلد
cd latest-nzamy-full
```

### الخطوة الثانية: أنشئ فرعاً خاصاً بك

> [!IMPORTANT]
> **لا تعمل مباشرة على `main`!**
> أنشئ فرعاً (branch) باسم واضح — هذا يحمي الكود الأصلي ويسهّل دمج تعديلاتك لاحقاً.

```bash
# أنشئ فرعاً جديداً وانتقل إليه
git checkout -b owner/frontend-fixes

# الآن أنت على فرع "owner/frontend-fixes" — كل تعديلاتك ستكون هنا
```

**أمثلة لأسماء الفروع:**
- `owner/frontend-fixes` — إصلاحات واجهة
- `owner/blog-content` — تعديلات المدونة
- `owner/ui-redesign` — تعديلات التصميم
- `owner/settings-page` — صفحة الإعدادات

---

## ٣) إعداد ملف البيئة

ملف `.env.local` يحتوي المفاتيح السرية للاتصال بقاعدة البيانات. هذا الملف **لا يُرفع على GitHub** (محمي بـ `.gitignore`).

### الخطوة الأولى: انسخ الملف النموذجي

```bash
# على macOS / Linux:
cp .env.example .env.local

# على Windows (PowerShell):
Copy-Item .env.example .env.local
```

### الخطوة الثانية: عبّئ المفاتيح الحقيقية

افتح `.env.local` في أي محرر نصوص واملأ هذه القيم الثلاث **الإلزامية**:

```env
# ═══ إلزامي — المشروع لن يعمل بدونها ═══

# 1) رابط مشروع Supabase (من لوحة تحكم Supabase → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co

# 2) مفتاح Anon (عام — آمن للمتصفح)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

# 3) مفتاح Service Role (سري — للسيرفر فقط)
#    مطلوب لزرع البيانات وللعمليات الإدارية
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# ═══ إلزامي — الوضع ═══
NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development
```

> [!CAUTION]
> **أين تجد هذه المفاتيح؟**
> 1. ادخل https://supabase.com → اختر مشروعك
> 2. Settings → API
> 3. انسخ:
>    - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
>    - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
>    - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`
>
> ⚠️ **لا تشارك `SUPABASE_SERVICE_ROLE_KEY` مع أحد — هذا المفتاح يتجاوز كل الحماية!**

### الخطوة الثالثة: باقي المتغيرات (اختيارية)

باقي المتغيرات في `.env.example` **اختيارية** — المشروع سيعمل بدونها:
- `N8N_WEBHOOK_*` — أتمتة الإشعارات (واتساب، إيميلات) — لا يلزمك محلياً
- `EVOLUTION_*` — WhatsApp API — لا يلزمك محلياً
- `PAYMENT_*` — بوابة الدفع — غير مُفعّلة بعد

---

## ٤) تثبيت الحزم وتشغيل المشروع

### تثبيت الحزم (مرة واحدة)

```bash
npm install
```

> هذا يُحمّل كل المكتبات المطلوبة في مجلد `node_modules/` (حجمه كبير — لا يُرفع على GitHub).

### تشغيل المشروع محلياً

```bash
npm run dev
```

**النتيجة المتوقعة:**
```
▲ Next.js 16.2.9 (Turbopack)
- Local:    http://localhost:3000
- Network:  http://192.168.x.x:3000
```

✅ **افتح المتصفح → http://localhost:3000** — سترى الموقع يعمل!

> [!NOTE]
> التعديلات على الملفات تظهر **فوراً** في المتصفح (Hot Reload) — لا تحتاج إعادة التشغيل.
> اضغط `Ctrl+C` لإيقاف السيرفر.

---

## ٥) زرع بيانات المكتبة القانونية

المكتبة القانونية (٦٠ نظاماً + ١,٧٧٢ مادة + ١٠,٣٠٠ مبدأ قضائي + ٤٠ كتاباً فقهياً) تحتاج **زرع** في قاعدة البيانات.

### تحقق من الوضع الحالي أولاً

```bash
npm run library:status
```

**إذا ظهر `GRAND TOTAL: 50929`** — المكتبة مزروعة بالفعل ✅ ولا تحتاج إعادة زرع.

### زرع المكتبة (إذا كانت فارغة)

```bash
# الخطوة ١: تحقق بدون كتابة (dry run)
npm run library:seed -- --dry-run

# الخطوة ٢: ازرع فعلياً
npm run library:seed

# الخطوة ٣: تحقق من النتيجة
npm run library:verify
```

### إعادة زرع كاملة (مسح + زرع + تحقق)

```bash
npm run library:reseed
```

> [!WARNING]
> `library:reseed` يمسح كل البيانات القديمة أولاً ثم يزرع من جديد.
> استخدمه فقط إذا كنت تريد البدء من الصفر.

**الدليل التفصيلي الكامل:** [`library-toolkit/STEP_BY_STEP.md`](library-toolkit/STEP_BY_STEP.md)

---

## ٦) زرع بيانات المدونة

### الخطوة ١: تحقق أن ملفات المقالات موجودة

```bash
# يجب أن تجد مجلدات sec_00_*, sec_01_*, ... في:
ls blog-toolkit/blog_final/
```

### الخطوة ٢: ارفع صور الأغلفة أولاً

```bash
# معاينة فقط
npm run blog:images -- --dry

# رفع فعلي
npm run blog:images
```

### الخطوة ٣: ازرع المقالات

```bash
# معاينة فقط
npm run blog:seed -- --dry

# زرع فعلي (upsert — آمن للتكرار)
npm run blog:seed
```

### إعادة زرع كاملة (مسح + صور + مقالات)

```bash
npm run blog:reseed
```

> [!TIP]
> **تحديث مقال موجود:** عدّل ملف `.md` في `blog-toolkit/blog_final/` ← أعد تشغيل `npm run blog:seed`.
> النظام يستخدم **upsert على slug** — لن تتكرر المقالات.

---

## ٧) طريقة العمل والتعاون

### المبدأ الأساسي

```
main (الفرع الرئيسي) ← لا تلمسه مباشرة
  └── owner/frontend-fixes (فرعك) ← اعمل هنا
```

المطوّر (أنا) يعمل على `main`. أنت تعمل على فرعك. عند الانتهاء، ترفع فرعك وأنا أدمج التعديلات.

### سير العمل خطوة بخطوة

#### ① ابدأ العمل — أنشئ فرعاً

```bash
# تأكد أنك على آخر نسخة من main
git checkout main
git pull origin main

# أنشئ فرعاً جديداً
git checkout -b owner/my-changes
```

#### ② عدّل ما تريد

- عدّل ملفات CSS/HTML/React في `src/`
- عدّل محتوى المدونة في `blog-toolkit/blog_final/`
- شاهد التعديلات مباشرة في المتصفح (`npm run dev`)

#### ③ احفظ تعديلاتك (Commit)

```bash
# شوف ما تغيّر
git status

# أضف كل التعديلات
git add .

# احفظ مع رسالة واضحة
git commit -m "fix: تعديل ألوان الشريط العلوي وحجم الخط"
```

> [!TIP]
> **نصيحة في رسائل Commit:**
> - ابدأ بكلمة تصف النوع: `fix:` (إصلاح) | `feat:` (ميزة جديدة) | `style:` (تصميم)
> - اكتب بالعربي أو الإنجليزي — المهم أن تكون واضحة

#### ④ ارفع فرعك على GitHub

```bash
# أول مرة — ارفع الفرع الجديد
git push -u origin owner/my-changes

# المرات التالية — فقط
git push
```

#### ⑤ أنشئ Pull Request (طلب دمج)

1. افتح https://github.com/drjimmy1990/latest-nzamy-full
2. سيظهر لك شريط أصفر: **"owner/my-changes had recent pushes — Compare & pull request"**
3. اضغط **"Compare & pull request"**
4. اكتب وصفاً لما عدّلت
5. اضغط **"Create pull request"**

**ماذا يحدث بعدها:**
- المطوّر (أنا) يراجع تعديلاتك
- إذا كل شيء ممتاز → يدمجها في `main`
- إذا يحتاج تعديل → يكتب تعليق على الـ PR

#### ⑥ بعد الدمج — حدّث نسختك

```bash
git checkout main
git pull origin main

# ابدأ فرعاً جديداً للعمل القادم
git checkout -b owner/next-task
```

---

### ⚡ ملخص مرئي لسير العمل

```
┌─────────────────────────────────────────────────────┐
│                    GitHub (السحابة)                  │
│                                                     │
│   main ──────────────────────────────► الخادم (VPS) │
│     ↑                                               │
│     │  Pull Request (طلب دمج)                       │
│     │                                               │
│   owner/my-changes ◄── أنت ترفع هنا                │
└─────────────────────────────────────────────────────┘
        ↑                           ↑
        │                           │
   جهاز المالك               جهاز المطوّر
   (أنت)                     (أنا)
```

---

## ٨) مرجع سريع

### أوامر يومية

| الأمر | ما يفعل |
|---|---|
| `npm run dev` | تشغيل الموقع محلياً على `localhost:3000` |
| `npm run build` | بناء نسخة الإنتاج (للتحقق من الأخطاء) |
| `git status` | عرض الملفات المعدّلة |
| `git add .` | إضافة كل التعديلات |
| `git commit -m "رسالة"` | حفظ التعديلات |
| `git push` | رفع التعديلات على GitHub |
| `git pull origin main` | تحميل آخر التحديثات |

### أوامر المكتبة القانونية

| الأمر | ما يفعل |
|---|---|
| `npm run library:status` | عدد السجلات الحالية |
| `npm run library:seed` | زرع البيانات |
| `npm run library:verify` | فحص صحة البيانات |
| `npm run library:clear` | ⚠️ مسح كل بيانات المكتبة |
| `npm run library:reseed` | ⚠️ مسح + زرع + فحص |

### أوامر المدونة

| الأمر | ما يفعل |
|---|---|
| `npm run blog:seed` | زرع/تحديث المقالات |
| `npm run blog:seed -- --dry` | معاينة بدون كتابة |
| `npm run blog:images` | رفع صور الأغلفة |
| `npm run blog:clear` | ⚠️ مسح كل المقالات |
| `npm run blog:reseed` | ⚠️ مسح + صور + زرع |

### أوامر Git الأساسية

| الأمر | ما يفعل |
|---|---|
| `git checkout main` | الانتقال للفرع الرئيسي |
| `git checkout -b owner/اسم` | إنشاء فرع جديد |
| `git branch` | عرض الفروع (النجمة * = الفرع الحالي) |
| `git log --oneline -5` | عرض آخر ٥ عمليات حفظ |
| `git diff` | عرض التعديلات قبل الحفظ |
| `git stash` | تخزين التعديلات مؤقتاً (بدون حفظ) |
| `git stash pop` | استرجاع التعديلات المخزّنة |

---

## ٩) استكشاف الأخطاء

### مشكلة: `npm install` يفشل

```bash
# امسح الكاش وأعد المحاولة
rm -rf node_modules package-lock.json
npm install
```

### مشكلة: الموقع لا يعمل — صفحة بيضاء

تأكد أن `.env.local` يحتوي القيم الصحيحة:
```bash
# تحقق أن الملف موجود
cat .env.local | head -10

# تحقق أن Supabase URL صحيح (يفتح في المتصفح)
```

### مشكلة: `SUPABASE_SERVICE_ROLE_KEY` مفقود

```
✗ Missing SUPABASE_SERVICE_ROLE_KEY
```
→ افتح `.env.local` وتأكد أن السطر موجود **بدون مسافات قبل القيمة**.

### مشكلة: `git push` مرفوض (Permission denied)

```bash
# تأكد أن حسابك مُضاف كـ Collaborator في GitHub
# أو استخدم SSH بدل HTTPS:
git remote set-url origin git@github.com:drjimmy1990/latest-nzamy-full.git
```

### مشكلة: تعارض عند `git pull` (Merge conflict)

```bash
# إذا ظهر CONFLICT — لا تقلق!
# الطريقة الأسهل: احفظ تعديلاتك مؤقتاً
git stash
git pull origin main
git stash pop

# إذا ما زال هناك تعارض — تواصل مع المطوّر
```

### مشكلة: البناء يفشل بـ "Killed" (على السيرفر فقط)

```bash
# ذاكرة غير كافية — أضف swap:
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile

# ثم أعد البناء:
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

---

## 📁 هيكل المشروع — الملفات المهمة

```
latest-nzamy-full/
├── src/                          # ← الكود المصدري (عدّل هنا)
│   ├── app/                      # ← صفحات الموقع (Next.js App Router)
│   │   ├── blog/                 # ← المدونة
│   │   ├── dashboard/            # ← لوحة التحكم
│   │   ├── laws/                 # ← المكتبة القانونية
│   │   └── page.tsx              # ← الصفحة الرئيسية
│   ├── components/               # ← المكونات المشتركة (أزرار، قوائم...)
│   ├── lib/                      # ← مكتبات مساعدة (Supabase، SEO...)
│   └── constants/                # ← ثوابت ومحتوى ثابت
│
├── blog-toolkit/                 # ← أدوات زرع المدونة
│   ├── blog_final/               # ← ملفات المقالات (.md)
│   ├── seed-blog.mjs             # ← سكريبت زرع المقالات
│   └── seed-blog-images.mjs      # ← سكريبت رفع الصور
│
├── library-toolkit/              # ← أدوات زرع المكتبة
│   ├── STEP_BY_STEP.md           # ← الدليل التفصيلي
│   └── output/                   # ← ملفات JSON للزرع
│
├── .env.example                  # ← نموذج ملف البيئة (آمن)
├── .env.local                    # ← ملف البيئة الحقيقي (لا يُرفع!)
├── package.json                  # ← قائمة الحزم والأوامر
└── OWNER_DEVELOPER_GUIDE.md      # ← هذا الملف!
```

---

## 🔐 ملاحظات أمان مهمة

1. **لا ترفع `.env.local` أبداً** — يحتوي مفاتيح سرية. Git يتجاهله تلقائياً.
2. **لا تعمل على `main` مباشرة** — استخدم فرعاً خاصاً دائماً.
3. **`SUPABASE_SERVICE_ROLE_KEY`** يتجاوز كل الحماية — لا تشاركه مع أحد.
4. **البيانات المحلية = بيانات الإنتاج** — عند الزرع، أنت تكتب في **نفس** قاعدة البيانات الحية. كن حذراً مع أوامر `clear`.

---

> **للمساعدة:** تواصل مع المطوّر مباشرة أو افتح Issue على GitHub.
