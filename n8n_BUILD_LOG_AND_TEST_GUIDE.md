# NZAMY · n8n — Build Log & Test Guide / سجل البناء ودليل الاختبار

> **بالعربية:** هذا الملف يوثّق كل workflow نبنيه على n8n — ماذا يفعل، كيف يُستدعى من التطبيق، وكيف تختبره بنفسك. لغة مختلطة (عربي + إنجليزي) عمداً: الشرح بالعربية، والمسارات والأكواد بالإنجليزية.
> **In English:** Living log of every NZAMY n8n workflow — what it does, how the app triggers it, and how to test it. Bilingual on purpose: prose in Arabic, paths/code in English.
>
> **التاريخ / Date:** 2026-07-06 · **المثيل / Instance:** `https://n8n.asra3.com` (shared/personal) · **الخطة الأصلية / Master plan:** [`n8n_FINAL_MASTER_PLAN.md`](./n8n_FINAL_MASTER_PLAN.md) · **الحالة العامة / Status review:** [`PROJECT_STATUS_REVIEW_2026-07-06.md`](./PROJECT_STATUS_REVIEW_2026-07-06.md)
>
> **قاعدة ذهبية / Golden rule:** كل الإرسال (email/WhatsApp) مؤجّل حالياً ويُمثَّل بعُقدة **DUMMY** — يعني الـ workflow يستقبل ويجهّز الرسالة، لكن خطوة الإرسال الأخيرة placeholder تملؤها لاحقاً عند نشر Evolution API / مزوّد البريد.

---

## 0. كيف يعمل النظام كله / How the whole thing works

```
[تطبيق Next.js]  →(app-side push)→  [n8n webhook]  →  [Compose عربي]  →  [Deliver ⟶ DUMMY]
 المستخدم يفعل شيئاً          POST JSON            يبني الرسالة          إرسال (placeholder)
 (ينشئ طلب / يُسنَد / يكتمل)                        {to, subject, body}   تملؤه لاحقاً
```

- **App-side push (الطريقة المختارة):** التطبيق نفسه هو من يستدعي n8n. عند كل حدث (إنشاء/إسناد/إكمال طلب) يرسل `POST` إلى مسار webhook المناسب. الكود في `src/lib/n8n/dispatch.ts`.
- **خامل حتى التفعيل / Inert until enabled:** لا شيء يُرسَل ما لم يُضبط متغيّر البيئة `N8N_WEBHOOK_BASE_URL` على الخادم. فبدونه، `dispatchToN8n` يرجع `{delivered:false}` بلا أي طلب شبكي.
- **الحمولة / Payload:** شكل ثابت يبنيه `src/lib/n8n/payload.ts` (`buildWebhookPayload`). n8n يقرأ الحمولة من `body` داخل عقدة الـ Webhook.

### شكل الحمولة / Payload shape (`buildWebhookPayload`)

```json
{
  "event": "service_request.created",
  "entity":    { "id": "req_123", "type": "service", "status": "pending_assignment" },
  "actor":     { "id": "user_abc", "name": "أحمد", "role": "individual" },
  "recipient": { "id": "lawyer_xyz", "role": "lawyer" },
  "payment":   { "amount": 0, "status": "not_required" },
  "timestamp": "2026-07-06T12:00:00.000Z",
  "data": {
    "title": "استشارة عمالية",
    "description": "نزاع فصل تعسفي",
    "receiver": "lawyer",
    "assignedTo": null,
    "requester": {},
    "requesterUserId": "user_abc",
    "createdAt": "2026-07-06T12:00:00.000Z"
  }
}
```

> **ملاحظة مهمة / Important:** الحمولة تحمل **معرّفات (IDs)** فقط — لا تحمل رقم جوال ولا بريد. لذلك خطوة الإرسال الحقيقية ستحتاج أن تحوّل `to_user_id` إلى جوال/بريد عبر استعلام Supabase. هذا مقصود ومكتوب في كل عقدة DUMMY.

---

## 1. الحاويات الستّ / The 6 containers

| # | الحاوية / Container | ID | الحالة / Status |
|---|--------------------|-----|----------------|
| 1 | **Service Requests** (طلبات الخدمة) | `YkvR5SI8ljcSOfuC` | ✅ **مبني** (3 فروع + DUMMY) — WF 2.4 placeholder |
| 2 | **Onboarding & Verification** (التسجيل والتوثيق) | `5mg451RaFPJXwME4` | ✅ **مبني** (4 فروع + DUMMY) — 1.2b placeholder |
| 3 | **Communication** (التواصل والتذكيرات) | `Y8SnEGaXTC3dboGA` | ⛔ مؤجّل — يحتاج Supabase + LLM + Evolution |
| 4 | **Admin & Moderation** (الإدارة والإشراف) | `vOjQdg5CPgO9naa6` | ⬜ لم يُبنَ بعد |
| 5 | **Billing & Wallet** (الفوترة والمحفظة) | `nLcTncqGZnSKCOoQ` | ⛔ محجوب على قرار بوابة الدفع |
| 6 | **AI Legal Tools** (الأدوات الذكية) | `rtj1TC9rd6Ule7am` | ⬜ لم يُبنَ بعد (37 عقدة) |

**كلها `inactive` (مسودّات) — لا يعمل أي منها الآن.** All inactive drafts — none running yet.

---

## 2. ✅ Service Requests — الحلقة الأساسية (مبنية) / the core loop (built)

**ID:** `YkvR5SI8ljcSOfuC` · **الرابط / Open:** `https://n8n.asra3.com/workflow/YkvR5SI8ljcSOfuC`

هذه الحاوية تُغطّي دورة حياة الطلب بين العميل والمحامي. كل فرع = **Webhook → Compose → Deliver(DUMMY)**.
الـ Webhook مضبوط على `responseMode: onReceived` أي يردّ `200` فوراً ثم يُكمل المعالجة (مناسب للإشعارات).

### 2.1 — طلب جديد / New request → notify Nzamy/lawyers
- **متى يعمل / When:** العميل ينشئ طلب خدمة (`POST /api/v1/service-requests`) → التطبيق يرسل `service_request.created`.
- **المسار / Webhook path:** `POST /webhook/new-request`
- **ماذا يفعل / Does:** يبني رسالة «طلب خدمة جديد بانتظار الإسناد» موجّهة لصفّ المحامين (`to_role`).
- **يُخرج / Output:** `{ branch:"2.1_new_request", to_user_id, to_role, subject_ar, body_ar, entity_id, _payload }`

### 2.2 — تم الإسناد / Assigned → notify client
- **متى يعمل / When:** تتغيّر حالة الطلب إلى `assigned` (`PATCH /api/v1/service-requests/[id]`) → `service_request.status_changed`.
- **المسار / Webhook path:** `POST /webhook/request-assigned`
- **ماذا يفعل / Does:** يبني رسالة «تم إسناد طلبك إلى محامٍ» موجّهة **للعميل** (`data.requesterUserId`).

### 2.3 — اكتمل + تقييم / Completed + review → notify client
- **متى يعمل / When:** تتغيّر الحالة إلى `completed` → `service_request.status_changed` (status=completed).
- **المسار / Webhook path:** `POST /webhook/request-completed`
- **ماذا يفعل / Does:** يبني رسالة «اكتمل طلبك — نودّ رأيك» موجّهة للعميل (سيُضاف رابط التقييم عند الإرسال الحقيقي).

### 2.4 — تصعيد SLA 48 ساعة / 48h SLA escalation
- **الحالة / Status:** ⬜ ما زال placeholder (NoOp). يحتاج **بيانات اعتماد Supabase** في n8n ليستعلم عن الطلبات المتأخّرة (cron كل ساعة). يُبنى لاحقاً.

> **عقدة DUMMY / The DUMMY node:** كل فرع ينتهي بعقدة HTTP اسمها `2.x Deliver ⟶ DUMMY` ترسل `POST` إلى `$env.NZAMY_DELIVERY_URL` (أو placeholder `https://replace-me.invalid/deliver`). مضبوطة `continueOnFail` فلا تُفشل التشغيل. **للتفعيل الحقيقي:** غيّر الرابط إلى Evolution WhatsApp / خدمة البريد، وأضف استعلام Supabase لتحويل `to_user_id` إلى جوال/بريد.

---

## 2ب. ✅ Onboarding & Verification — التسجيل والتوثيق (مبنية جزئياً)

**ID:** `5mg451RaFPJXwME4` · **الرابط / Open:** `https://n8n.asra3.com/workflow/5mg451RaFPJXwME4`

نفس النمط: **Webhook → Compose → Deliver(DUMMY)**. الحمولة المتوقّعة = صفّ الملف الشخصي الجديد (profile row) داخل `body`.

| الفرع / Branch | المسار / Path | ماذا يفعل / Does | الحالة |
|----------------|---------------|------------------|--------|
| **1.1 Welcome** | `POST /webhook/new-user` | رسالة ترحيب «مرحباً بك في نظامي» للمستخدم الجديد | ✅ مبني |
| **1.2a Notify admin** | `POST /webhook/verification` | يُبلّغ الأدمن «طلب توثيق محامٍ جديد» | ✅ مبني |
| **1.2b Approval callback** | `GET /webhook/lawyer-approval` | يضبط `is_verified` للمحامي (كتابة DB) | ⬜ placeholder — يحتاج **Supabase cred** |
| **1.3 Firm onboarding** | `POST /webhook/new-firm` | ترحيب بمكتب المحاماة (post-beta) | ✅ مبني |
| **1.4 Provider** | `POST /webhook/new-provider` | إبلاغ الأدمن بطلب توثيق مزوّد (post-beta) | ✅ مبني |

> **⚠️ مشغّل التسجيل / Signup trigger:** التسجيل يمرّ عبر Supabase Auth (`handle_new_user` DB trigger) لا عبر route في التطبيق — لذلك `/new-user` **لن يُستدعى تلقائياً** بـ app-side push. لتفعيله: إمّا **Supabase DB webhook** على `INSERT profiles` → `/webhook/new-user`، أو ربط استدعاء في تدفّق صفحة التسجيل. أما `/verification` فيمكن استدعاؤه من مسار تقديم التوثيق في التطبيق مستقبلاً.

**اختبار / Test** (نفس أسلوب القسم 4، بحمولة profile):
```bash
curl -X POST https://n8n.asra3.com/webhook/new-user \
  -H "Content-Type: application/json" \
  -d '{ "id": "user_new_1", "display_name": "سارة", "user_type": "individual", "email": "test@example.com" }'
```
المتوقّع: تشغيل ناجح، عقدة Compose تُخرج «أهلاً سارة! …»، وDeliver يحاول الإرسال (DUMMY).

---

## 3. جانب التطبيق / App-side push (مبني ومدموج / wired + committed)

**Commit:** `bb6ba41` (on `main`). **خامل حتى تضبط `N8N_WEBHOOK_BASE_URL`.**

| الملف / File | التغيير / Change |
|--------------|------------------|
| `src/lib/n8n/dispatch.ts` | يحدّد المسار حسب الحدث+الحالة: `created→/new-request` · `status_changed`+`assigned→/request-assigned` · `completed→/request-completed` |
| `src/lib/n8n/payload.ts` | أضاف `data.requesterUserId` (لاستهداف العميل عند الإسناد/الإكمال) |
| `src/app/api/v1/service-requests/route.ts` (POST) | يستدعي `dispatchToN8n` بعد إنشاء الطلب (best-effort, try/catch) |
| `src/app/api/v1/service-requests/[id]/route.ts` (PATCH) | يستدعي `dispatchToN8n` بعد تغيير الحالة |

### متغيّرات البيئة / Env vars (على الخادم / server `.env.local`)

```bash
# يفعّل الدفع من التطبيق إلى n8n / turns on app→n8n push
N8N_WEBHOOK_BASE_URL=https://n8n.asra3.com/webhook
# اختياري: سرّ مشترك يُرسَل كترويسة X-Webhook-Secret / optional shared secret
N8N_WEBHOOK_SECRET=<اختر-سرّاً-قوياً>
```

بعد ضبطها: `git pull → npm run build → pm2 reload nzamy`.

---

## 4. كيف تختبر / How to test

### أ) اختبار الـ workflow مباشرة في n8n (بدون التطبيق) / Test the workflow directly

1. افتح الحاوية في n8n → فعّلها (**Active**) أو اضغط **Test workflow / Listen for test event**.
2. أرسل طلباً تجريبياً بـ `curl` (استبدل `/webhook/` بـ `/webhook-test/` أثناء وضع الاختبار):

```bash
curl -X POST https://n8n.asra3.com/webhook/new-request \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <نفس-السرّ>" \
  -d '{
    "event": "service_request.created",
    "entity": { "id": "req_test_1", "type": "service", "status": "pending_assignment" },
    "actor": { "id": "user_client_1", "name": "عميل تجريبي", "role": "individual" },
    "recipient": { "role": "lawyer" },
    "payment": { "amount": 0, "status": "not_required" },
    "timestamp": "2026-07-06T12:00:00.000Z",
    "data": { "title": "استشارة عمالية تجريبية", "description": "اختبار", "receiver": "lawyer", "requesterUserId": "user_client_1" }
  }'
```

3. **المتوقّع / Expected:** يرجع `200` فوراً. في n8n → تبويب **Executions** ترى تشغيلاً ناجحاً: عقدة Compose تُخرج `subject_ar`/`body_ar` بالعربية، وعقدة Deliver تحاول الإرسال (ستفشل بهدوء لأنها DUMMY — هذا طبيعي).

للفرعين الآخرين بدّل المسار والحمولة:
- `/webhook/request-assigned` — `entity.status = "assigned"`, و`data.requesterUserId` = معرّف العميل.
- `/webhook/request-completed` — `entity.status = "completed"`.

### ب) اختبار من التطبيق (end-to-end) / Test through the app

1. اضبط `N8N_WEBHOOK_BASE_URL` على الخادم وأعد النشر، وفعّل الحاوية في n8n.
2. سجّل دخول كعميل → أنشئ طلب خدمة → يجب أن يظهر تشغيل على `/new-request` في n8n Executions.
3. سجّل دخول كمحامي/أدمن → أسند الطلب → تشغيل على `/request-assigned`.
4. علّم الطلب مكتملاً → تشغيل على `/request-completed`.
5. **إن لم يظهر شيء:** تأكّد أن `N8N_WEBHOOK_BASE_URL` مضبوط (بدونه الدفع خامل)، وأن الحاوية `Active`، وراجع logs الخادم عن `[service-requests ...] n8n dispatch failed`.

---

## 5. المتبقّي / What's left (build order)

| الأولوية | العنصر / Item | يحتاج / Needs |
|----------|---------------|---------------|
| ✅ مبني (n8n) | ~~Service Requests~~ + ~~Onboarding (1.1/1.2a/1.3/1.4)~~ | جاهزة بـ DUMMY. Service Requests مربوطة بـ app-push؛ Onboarding يحتاج **مشغّل تسجيل** (DB webhook على `INSERT profiles` أو ربط في صفحة التسجيل) |
| ⛔ التالي (محجوب على creds) | **Communication** (4.1 triage · 4.2/4.3 reminders) | 4.1: **Evolution + LLM** · 4.2/4.3: **Supabase cred** + الأعمدة `consultations.reminder_sent/reminder_1h_sent` و`cases.hearing_reminder_sent` (migrations معلّقة). بناؤها بـ DUMMY بلا فائدة — تُبنى عند توفّر الـ creds |
| 🥈 | **Admin & Moderation** (ملخّص يومي، إشراف) | Supabase cred |
| ⛔ | **Billing & Wallet** | قرار بوابة الدفع (محجوب — الدفع مُعطّل حالياً) |
| ⬜ | **AI Legal Tools** (18 أداة) | أولوية أقل: مخرجات AI محجوبة بالمراجعة في البيتا |
| ⬜ | **WF 2.4 + 1.2b** | Supabase cred (استعلام/كتابة DB) |

---

## 6. لجعل الإرسال حقيقياً / To make delivery real

عند نشر Evolution API واختيار مزوّد البريد:
1. **n8n env:** اضبط `NZAMY_DELIVERY_URL` = رابط إرسال Evolution WhatsApp / خدمة البريد.
2. **حلّ جهة الاتصال / Resolve contact:** أضف عقدة Supabase قبل الإرسال تستعلم عن جوال/بريد المستلم بـ `to_user_id` (الحمولة تحمل ID فقط). يحتاج **بيانات اعتماد Supabase** في n8n (على الأرجح موجودة أصلاً في workflows الـ RAG SUPABASE).
3. **بدّل عقدة DUMMY** بعقدة Evolution/HTTP الحقيقية، أو أبقِها موجّهة إلى `NZAMY_DELIVERY_URL`.
4. **فعّل الحاوية** (Active) — تمام.

---

## سجل التغييرات / Change log

- **2026-07-06:** بُنيت حاوية Service Requests (فروع 2.1/2.2/2.3 + DUMMY delivery)، ومُدمج app-side push (commit `bb6ba41`). 0 workflows فعّالة بعد.
- **2026-07-06:** بُنيت حاوية Onboarding (فروع 1.1/1.2a/1.3/1.4 + DUMMY، بـ `onError` بلا تحذيرات؛ 1.2b placeholder). Communication مؤجّلة (تحتاج Supabase/LLM/Evolution). كلها ما زالت `inactive`.
