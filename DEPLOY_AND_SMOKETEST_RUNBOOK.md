# NZAMY — Deploy & Smoke-Test Runbook / دليل النشر والاختبار

> **الهدف / Goal:** نشر عمل هذه الجلسة (بوابات النزاهة Phase 0 + دفع n8n) والتحقق أن الحلقة تعمل حيّاً قبل بناء المزيد.
> **التاريخ / Date:** 2026-07-06 · **الخادم / Server:** PM2 app `nzamy`, port 3055 · **n8n:** `https://n8n.asra3.com`
> رتّب التنفيذ: **A ثم B ثم C ثم D ثم E**. كل خطوة فيها «المتوقّع / Expected» — لو خالفها أوقف وابحث.

---

## A — نشر التطبيق / Deploy the app

على الخادم داخل مجلد التطبيق:

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full
git pull origin main

# 1) طبّق أي migration معلّق (منها الجديد 20260706_reminder_flags.sql)
npx supabase db push        # أو: npx supabase migration up --linked

# 2) تأكّد من متغيّرات البيئة في .env.local
#    - CRITICAL: يجب أن يكون backend = supabase
grep NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND .env.local     # ⇒ =supabase
#    - فعّل الدفع إلى n8n (اختياري الآن — يلزم لاختبار الحلقة من التطبيق)
#      أضِف هذين السطرين:
#      N8N_WEBHOOK_BASE_URL=https://n8n.asra3.com/webhook
#      N8N_WEBHOOK_SECRET=<اختر سرّاً قوياً>   (اختياري)

# 3) ابنِ وأعد التحميل
npm run build
pm2 reload nzamy

# 4) تحقّق من الإقلاع
pm2 logs nzamy --lines 20    # ⇒ يجب أن ترى: ✓ Ready in ...
```

**المتوقّع / Expected:** `✓ Ready`، ولا أخطاء `Could not find a production build` أو انهيار بدء التشغيل (لو `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` خاطئ، `instrumentation.ts` يوقف الإقلاع عمداً في الإنتاج).

---

## B — تحقّق بوابات النزاهة (Phase 0) حيّاً / Verify Phase 0 gates

افتح الموقع (كمستخدم عادي) وتحقّق:

| افحص / Check | المتوقّع / Expected |
|--------------|---------------------|
| `/ai/report-generator` → ولّد تقريراً | **بطاقة مراجعة** «تم الإعداد… إرسال للمراجعة الذكية» — **لا** تقرير مزيّف قابل للتنزيل |
| `/ai/smart-inspector` و `/ai/legal-opinion` (cross-exam/letter) | نفس بطاقة المراجعة على المخرج |
| `/marketplace` | **يُعاد توجيهه إلى `/services`** |
| `/services` | قسم «نخبة المستشارين» + رابط `/lawyers` **مختفيان** |
| `/dashboard/lawyer/cases/<id>/sharing` | صفحة **«قريباً»** (لا واجهة مشاركة وهمية) |
| `/dashboard/lawyer/activity` (محامٍ جديد) | **حالة فارغة** + إحصائيات «—» (لا تاريخ ملفّق) |
| `/dashboard/lawyer/profile` | **لا** تبويبَي «إنجازاتي» و«التقييمات» |

---

## C — تجهيز n8n / Set up n8n

**لا حاجة لأي متغيّر بيئة في n8n — أزلنا `$env` نهائياً.** عُقد الإرسال تحمل رابطاً نصّياً واضحاً `https://REPLACE-WITH-EVOLUTION-OR-EMAIL.example/send` — افتح العقدة وعدّل الحقل مباشرةً عند جاهزية Evolution/البريد. وسرّ 1.2b قيمة نصّية `CHANGE-ME-APPROVAL-SECRET` داخل عقدة `1.2b Check token` (عدّلها إن أردت تفعيل رابط الاعتماد).

1. **فعّل الحاويات / Activate** (زر Active): ابدأ بـ **NZAMY · Service Requests** (`YkvR5SI8ljcSOfuC`).
   - Communication/Admin فيها cron — تفعيلها يبدأ المؤقّتات (غير ضارّ مع رابط الإرسال الوهمي).

---

## D — اختبار الحلقة / Smoke-test the loop

### D1) اختبار مباشر للـ webhook (الأسرع — بلا تطبيق)
```bash
curl -X POST https://n8n.asra3.com/webhook/new-request \
  -H "Content-Type: application/json" \
  -d '{ "event":"service_request.created",
        "entity":{"id":"req_test","type":"service","status":"pending_assignment"},
        "actor":{"id":"u1","name":"عميل تجريبي","role":"individual"},
        "recipient":{"role":"lawyer"}, "payment":{"amount":0,"status":"not_required"},
        "timestamp":"2026-07-06T12:00:00.000Z",
        "data":{"title":"استشارة تجريبية","description":"اختبار","receiver":"lawyer","requesterUserId":"u1"} }'
```
**المتوقّع:** يرجع `200` فوراً. في n8n → **Executions** تشغيل ناجح: `2.1 Compose new` يُخرج `subject_ar`/`body_ar` عربي؛ `2.1 Deliver DUMMY` قد يظهر خطأ (رابط وهمي) لكنه لا يوقف التشغيل (onError continue) — **طبيعي**.

### D2) اختبار كامل من التطبيق (يلزم `N8N_WEBHOOK_BASE_URL` + Service Requests فعّالة)
1. سجّل دخول **كعميل** → أنشئ طلب خدمة ⇒ في n8n Executions يظهر `/new-request`.
2. سجّل دخول **كمحامٍ/أدمن** → أسند الطلب ⇒ `/request-assigned` يعمل، وعقدة **`2.2 Resolve client`** تُرجع ملف العميل (email/phone حقيقي).
3. علّم الطلب **مكتملاً** ⇒ `/request-completed` يعمل.
- لو لم يظهر شيء: تأكّد `N8N_WEBHOOK_BASE_URL` مضبوط + الحاوية Active + راجع `pm2 logs nzamy` عن `n8n dispatch failed`.

### D3) التذكيرات/SLA (اختياري)
- 2.4 SLA (cron كل ساعة) و4.2 reminder (كل 30 د) تعمل تلقائياً بعد التفعيل + تطبيق `20260706_reminder_flags.sql`. راقب Executions لاحقاً.

---

## E — تحقّق أمني سريع / Quick security check (تسريب PII)

```bash
curl -s "https://<موقعك>/api/v1/lawyers" | head -c 600
```
**المتوقّع:** لا يحتوي الرد على `phone` أو `email`، و`license_number` يظهر فقط لمن `show_contact=true`.

---

## قائمة نهائية / Final checklist

- [ ] A: `git pull` + `db push` + env + `build` + `pm2 reload` ⇒ `✓ Ready`
- [ ] B: بوابات Phase 0 كلها تعمل كما هو متوقّع
- [ ] C: n8n env + تفعيل Service Requests
- [ ] D1: webhook مباشر ⇒ execution ناجح
- [ ] D2: حلقة العميل↔المحامي كاملة ⇒ 3 executions + resolve يرجع جهة الاتصال
- [ ] E: `/api/v1/lawyers` بلا PII

**بعد نجاح كل ذلك:** الإرسال ما زال وهمياً — الخطوة التالية الحقيقية هي ربط Evolution/البريد (عدّل رابط عُقد الإرسال مباشرةً في n8n) + التحصين الأمني (rate-limiting على مسارات AI العامة). راجع [`PROJECT_STATUS_REVIEW_2026-07-06.md`](./PROJECT_STATUS_REVIEW_2026-07-06.md) و [`n8n_BUILD_LOG_AND_TEST_GUIDE.md`](./n8n_BUILD_LOG_AND_TEST_GUIDE.md).

---

## طلبات الخدمات اليدوية — فحص يدوي

- [ ] عميل: `/ai/draft` → ٣ خطوات فقط (التحديد · القضية · الإرسال)
- [ ] وقائع أقل من ٣٠ حرفاً → رسالة خطأ، ولا يُنشأ صف
- [ ] إرسال ناجح → تحويل إلى `/ai/orders/<id>` بحالة "بانتظار الاستلام"
- [ ] أدمن: الطلب يظهر في `/dashboard/admin/service-orders` مع اسم وجوال العميل
- [ ] فتح "التفاصيل" → قسم "مرفقات العميل" يعرض ملفات الطلب، وزر التحميل يفتح كل ملف
- [ ] "استلام" → الحالة "قيد التنفيذ"، و`assigned_to` = الأدمن
- [ ] رفع ملف → الحالة "مُسلّمة"
- [ ] عميل: `/ai/orders/<id>` → "جاهز" وزر التحميل يفتح الملف
- [ ] `request_events` يعرض: created → status_changed → completed
- [ ] الجرس يعرض إشعار "طلبك جاهز"
- [ ] سجلّات الخادم تُظهر حمولة `request-completed` و`recipient.id` = **العميل** لا الأدمن
- [ ] محاولة تسليم مرتين → `409`
- [ ] غير أدمن على `/api/v1/admin/service-orders` → `403`
