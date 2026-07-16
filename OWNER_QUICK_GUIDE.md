# 🚀 دليل المالك السريع — تشغيل المشروع والتعديل عليه
# Owner Quick Start Guide

> **آخر تحديث:** ١٦ يوليو ٢٠٢٦
> **الفرع الخاص بك:** `owner-edits` (جاهز على GitHub)

---

## ⚡ الخلاصة في ٣٠ ثانية

```
أنت تعمل على فرع "owner-edits" — المطوّر يعمل على "main"
كل تعديلاتك تذهب إلى فرعك — لن تكسر شيئاً أبداً
عندما تنتهي → المطوّر يراجع ويدمج تعديلاتك
```

---

## الخطوة ١ — تحميل المشروع (مرة واحدة فقط)

### ١.١ ثبّت Node.js

حمّل من https://nodejs.org ← اختر **LTS** ← ثبّته (Next → Next → Finish).

### ١.٢ انسخ المشروع

افتح Terminal أو اطلب من الـ AI:

```bash
cd ~/Desktop
git clone https://github.com/drjimmy1990/latest-nzamy-full.git
cd latest-nzamy-full
```

### ١.٣ انتقل لفرعك

```bash
git checkout owner-edits
```

> ✅ **من الآن فصاعداً أنت دائماً على فرع `owner-edits`.**
> لا تحتاج إنشاء فروع جديدة أبداً.

### ١.٤ أنشئ ملف البيئة

```bash
cp .env.example .env.local
```

ثم افتح `.env.local` واملأ ٣ قيم فقط (اسأل المطوّر عنها):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development
```

### ١.٥ ثبّت الحزم وشغّل

```bash
npm install
npm run dev
```

افتح المتصفح → **http://localhost:3000** ← الموقع يعمل! 🎉

---

## الخطوة ٢ — عدّل ما تريد

### ماذا يمكنك تعديله؟

| ✅ يمكنك | ❌ اتركه للمطوّر |
|---|---|
| CSS / ألوان / خطوط / تصميم | إضافة جداول في قاعدة البيانات |
| نصوص وعناوين الصفحات | API routes وserver actions |
| ترتيب وتخطيط المكونات | RLS policies وأمان Supabase |
| محتوى المدونة (ملفات .md) | إعداد الدفع والاشتراكات |
| صور وأيقونات | إعداد n8n والأتمتة |

### أين الملفات المهمة؟

| ما تريد تعديله | المسار |
|---|---|
| الصفحة الرئيسية | `src/app/page.tsx` |
| صفحة المدونة | `src/app/blog/` |
| المكتبة القانونية | `src/app/laws/` |
| لوحة التحكم | `src/app/dashboard/` |
| الشريط العلوي (Navbar) | `src/components/Navbar.tsx` |
| التذييل (Footer) | `src/components/Footer.tsx` |
| الأزرار العائمة | `src/components/FloatingButtons.tsx` |
| الألوان والتصميم العام | `src/app/globals.css` |
| محتوى المقالات | `blog-toolkit/blog_final/` |

### كيف تعمل مع الـ AI؟

اطلب من الـ AI في IDE مثل:

> "غيّر لون الشريط العلوي إلى الأزرق الداكن"
> "اجعل خط العنوان أكبر في الصفحة الرئيسية"
> "أضف زر واتساب في الفوتر"
> "عدّل النص في صفحة المدونة"

الـ AI سيعدّل الملفات تلقائياً — وستشاهد النتيجة فوراً في المتصفح.

---

## الخطوة ٣ — زرع البيانات

### المكتبة القانونية

```bash
# تحقق من الوضع الحالي
npm run library:status

# إذا فارغة → ازرع
npm run library:seed

# تحقق
npm run library:verify
```

### المدونة

```bash
# ارفع الصور أولاً
npm run blog:images

# ثم ازرع المقالات
npm run blog:seed
```

> 💡 **آمن للتكرار** — لو شغّلته مرتين لن تتكرر البيانات.

---

## الخطوة ٤ — ارفع تعديلاتك

عندما تنتهي من التعديل وتريد إرسالها للمطوّر:

### الطريقة ١: اطلب من الـ AI

> "احفظ كل التعديلات وارفعها على GitHub"

الـ AI سيشغّل:
```bash
git add .
git commit -m "وصف التعديل"
git push origin owner-edits
```

### الطريقة ٢: يدوياً

```bash
git add .
git commit -m "fix: تعديل ألوان الشريط العلوي"
git push origin owner-edits
```

### ماذا بعد؟

- ✅ تعديلاتك مرفوعة على فرع `owner-edits` في GitHub
- ✅ المطوّر يشوفها ويراجعها
- ✅ المطوّر يدمجها في `main` ← تنتشر على الموقع الحي
- ✅ أنت لا تحتاج تفعل شيئاً آخر

---

## الخطوة ٥ — تحديث نسختك (قبل كل جلسة عمل جديدة)

قبل ما تبدأ تعديلات جديدة، حدّث نسختك لتحصل على آخر تغييرات المطوّر:

```bash
git checkout owner-edits
git pull origin owner-edits
```

> إذا ظهرت مشاكل (conflict) — اطلب من الـ AI: "حل التعارضات" أو تواصل مع المطوّر.

---

## 📋 ورقة الغش — كل الأوامر

### تشغيل الموقع
```bash
npm run dev                    # شغّل محلياً → localhost:3000
# Ctrl+C                      # أوقف السيرفر
```

### حفظ ورفع التعديلات
```bash
git add .                      # أضف كل التعديلات
git commit -m "وصف التعديل"    # احفظ
git push origin owner-edits    # ارفع على GitHub
```

### تحديث نسختك
```bash
git pull origin owner-edits    # حمّل آخر التحديثات
```

### زرع البيانات
```bash
npm run library:status         # عدد سجلات المكتبة
npm run library:seed           # زرع المكتبة
npm run blog:seed              # زرع المدونة
npm run blog:images            # رفع صور المدونة
```

### أوامر مفيدة
```bash
git status                     # شوف ما تغيّر
git diff                       # شوف التعديلات بالتفصيل
npm run build                  # تحقق أن كل شيء يعمل (مثل السيرفر)
```

---

## ⚠️ أشياء مهمة

1. **لا تشتغل على `main`** — دائماً تأكد أنك على `owner-edits`:
   ```bash
   git branch    # النجمة * يجب أن تكون بجانب owner-edits
   ```

2. **لا ترفع `.env.local`** — Git يتجاهله تلقائياً (محمي).

3. **إذا شيء انكسر** — لا تقلق! تعديلاتك على فرع منفصل. اطلب من الـ AI:
   > "ارجع للنسخة السابقة من الملف [اسم الملف]"

4. **البيانات مشتركة** — أنت والمطوّر تستخدمان **نفس** قاعدة Supabase. أوامر `clear` تمسح للجميع.

---

## 🔄 كيف يعمل التعاون

```
GitHub Repository
┌──────────────────────────────────────┐
│                                      │
│  main (المطوّر) ──────► الموقع الحي  │
│    ↑                                 │
│    │ المطوّر يدمج عندما يكون جاهزاً │
│    │                                 │
│  owner-edits (أنت) ◄── تعديلاتك     │
│                                      │
└──────────────────────────────────────┘
       ↑                    ↑
  جهاز المالك          جهاز المطوّر
```

**القاعدة الذهبية:** أنت تعدّل وترفع → المطوّر يراجع ويدمج → التحديث ينتشر.

---

> **تحتاج مساعدة؟** اطلب من الـ AI في IDE أو تواصل مع المطوّر مباشرة.
