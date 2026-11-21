# تجربة «الصائغ v2» على جهازك — دليل التشغيل المحلي

> 2026-11-21 · لا شيء هنا يمس `n8n.asra3.com` ولا L14. كل ما في الدليل على `localhost` ووقائع وهمية.
> ما يُوسم **(افتراض)** لم أتحقق منه من الكود؛ جرّبه وأخبرنا إن اختلف.

## ما الذي ستفعله
1. تشغّل n8n على جهازك (`npx n8n`) — لا Docker.
2. تستورد الـworkflow `n8n/ai/legal-drafter-v2.json` وتربط له ثلاثة credentials.
3. تشغّل السكربت `scripts/n8n-local-smoke.mjs` فيرسل حزمة تجريبية ويعرض النتيجة.

أنت من يقرر متى تبدأ: لم أثبّت n8n ولم أشغّله، و`npx n8n` سينزّل الحزمة من الإنترنت عند أول تشغيل (مئات الميغابايتات، **افتراض**).

## ١. تشغيل n8n
المتطلب: Node 24 موجود عندك. إن رفضه n8n برسالة «unsupported Node version» فاستعمل Node 22 LTS (**افتراض**: إصدار n8n الحالي يدعم 20.19 إلى 24.x؛ الرسالة ستخبرك).

```powershell
npx n8n
```
انتظر سطر `Editor is now accessible via: http://localhost:5678`، ثم افتح الرابط. أول مرة يطلب إنشاء «حساب المالك» المحلي: بريد وكلمة سر من اختيارك، تبقى على جهازك فقط. اترك هذه النافذة تعمل.

البيانات تُحفظ في `%USERPROFILE%\.n8n`؛ حذف ذلك المجلد (وأنت من يقرر) يزيل كل شيء.

## ٢. الـcredentials (من القائمة: Credentials → Create)
لا تستعمل أي مفتاح إنتاج في الأولين.

| الاسم بالضبط | النوع | القيم |
|---|---|---|
| `NZAMY AI · inbound` | **Header Auth** | Name: `X-Nzamy-Key` · Value: أي نص تختاره الآن، مثل `local-test-key` (تحتاجه في الخطوة ٤) |
| `NZAMY AI · callback` | **Header Auth** | Name: `X-Nzamy-Key` · Value: أي نص، مثل `local-callback` (السكربت المحلي لا يفحصه) |
| `Google Gemini(PaLM) Api account` | **Google Gemini (PaLM) API** | مفتاحك أنت من Google AI Studio. ضعه في الخانة بنفسك؛ لا تلصقه في أي محادثة ولا ملف |

## ٣. الاستيراد وربط الـcredentials
1. Workflows → ⋯ (أو Add workflow) → **Import from File** → اختر `n8n/ai/legal-drafter-v2.json`. اسمه `NZAMY AI · legal-drafter-v2 (staging)`، ويُستورد غير مفعّل.
2. الملف يحمل معرّفات credentials الخاصة بالخادم الحي، فتظهر عقد بتنبيه أحمر. افتح كل عقدة واختر credential المحلي:

| العقدة | الـcredential |
|---|---|
| Webhook | `NZAMY AI · inbound` |
| Callback · Progress · stage · Progress · reading | `NZAMY AI · callback` |
| Model · Read | `Google Gemini(PaLM) Api account` |

3. احفظ، ثم فعّل الـworkflow (مفتاح **Active**، وفي الإصدارات الأحدث اسمه Publish — **افتراض**). بعد التفعيل يعمل الرابط:
   `http://localhost:5678/webhook/nzamy-ai/legal-drafter-v2`
   بديل بلا تفعيل: اضغط **Listen for test event** في عقدة Webhook ثم أرسل مرة واحدة إلى `/webhook-test/…` (السكربت: `--test-url`).

## ٤. التشغيل بالسكربت (الأسهل)
في نافذة PowerShell ثانية من جذر المشروع:

```powershell
$env:NZAMY_LOCAL_KEY = "local-test-key"
```
(نفس قيمة credential الـinbound. السكربت لا يطبعها، ويرفض أي عنوان غير localhost.)

الطور الأول — التحليل (مرحلة write وحدها):
```powershell
node scripts/n8n-local-smoke.mjs --phase issues
```
المسودة الكاملة (خمس مراحل: write ← extraction ← adversary ← refine ← najiz):
```powershell
node scripts/n8n-local-smoke.mjs --phase draft
```
تعديل قسم:
```powershell
node scripts/n8n-local-smoke.mjs --phase section
```
يشغّل السكربت مستمعاً على `127.0.0.1:8787` يلعب دور `/api/v1/ai/callback`، فتراه يطبع كل «تقدم» بوقته ثم النتيجة. أضف `--json` لعرض النتيجة كاملة، و`--wait 1200` لمهلة أطول (الافتراضي ٩٠٠ ثانية كمهلة التطبيق).

### ما الذي تتوقعه
| الطور | سطور التقدم | في الملخص |
|---|---|---|
| issues | `التحليل` | `issues/defenses/requests` بأعداد > 0 |
| section | `التحليل` ‏(الاسم عام لغير المسودة، **افتراض**: هذا ما في الكود) | `heading` و`body_chars` |
| draft | `الصياغة` ثم `الاستخراج من المكتبة` ثم `الفحص العدائي` ثم `التنقيح` ثم `تهيئة ناجز` | `engine: stages=write>extraction>adversary>refine>najiz` · `prompts` كلها `temp` عدا write = `built-in` · `najiz: chars=… over_limit=false` |

الفروق بين زمن سطر وآخر = زمن المرحلة السابقة؛ **هذه هي القياسات التي نحتاجها** لتحليل المهلة (انظر `docs/n8n-legal-drafter-v2-timeout-and-package.md`). انسخ لنا السطور كما هي.

### تجارب المراحل (كل واحدة تجربة منفصلة)
| تريد أن تثبت | الأمر |
|---|---|
| مرحلة واحدة فقط بعد الصياغة | `--phase draft --stages extraction` (أو `adversary` / `refine` / `najiz`) |
| أن `body.prompts` يصل ويُستعمل | `--phase draft --fake-prompts` ← `engine.prompts` كلها `body` |
| اختيار نموذج لكل المراحل | `--phase draft --model gemini-2.5-flash` (اختر معرّفاً يظهر في حسابك) |
| نموذج لمرحلة بعينها | `--phase draft --models refine=gemini-2.5-pro,najiz=gemini-2.5-flash` (يقبل المفتاح `write` أو `draft` للصياغة) |
| تخطي مرحلة فاشلة بدل الفشل الكامل | `--phase draft --on-error skip` |
| طلب مختلف النوع | `--kind claim` (أو `reply`, `cassation`…) |

مع `--fake-prompts` قد تأتي مخرجات النموذج غريبة لأن النصوص قصيرة ومعلّمة FAKE؛ المقصود إثبات وصولها فقط.

## ٥. أمر curl لكل طور (بدل السكربت)
curl وحده لا يستقبل النتيجة (n8n يردّ 202 فقط ثم يرسلها إلى callback)، فنحتاج مستمعاً. ثلاث خطوات:

**أ.** اكتب الحزمة في ملف (السكربت يكتبها بـUTF-8 صحيح؛ لا يرسل شيئاً):
```powershell
node scripts/n8n-local-smoke.mjs --phase issues --write-body $env:TEMP\v2-issues.json
node scripts/n8n-local-smoke.mjs --phase draft --write-body $env:TEMP\v2-draft.json
node scripts/n8n-local-smoke.mjs --phase section --write-body $env:TEMP\v2-section.json
```
(ولمراحل المسودة أضف نفس الأعلام أعلاه، مثل `--stages najiz`.)

**ب.** في نافذة منفصلة ابدأ المستمع واتركه:
```powershell
node scripts/n8n-local-smoke.mjs --listen
```

**ج.** أرسل (استبدل الملف بحسب الطور):
```powershell
curl.exe -i -X POST "http://localhost:5678/webhook/nzamy-ai/legal-drafter-v2" -H "Content-Type: application/json" -H "X-Nzamy-Key: $env:NZAMY_LOCAL_KEY" --data-binary "@$env:TEMP\v2-draft.json"
```
المتوقع: `HTTP/1.1 202` وجسم `{"accepted":true,"run_id":"…"}`، ثم تظهر الأحداث في نافذة المستمع.

## ٦. ما يلزم إن أخطأ شيء
| العَرَض | السبب المرجّح |
|---|---|
| `HTTP 403` (أو 401) | قيمة `NZAMY_LOCAL_KEY` لا تطابق credential الـinbound، أو اسم الترويسة ليس `X-Nzamy-Key` |
| `HTTP 404` | الـworkflow غير مفعّل، أو استعملت `/webhook/` وأنت على وضع الاختبار (`/webhook-test/` يعمل مرة واحدة بعد Listen) |
| لا يصل أي callback | المنفذ 8787 مشغول (`--port 8790` في الأمرين)، أو n8n يمنع النداء إلى العناوين المحلية (**افتراض**: الإصدارات الحديثة قد تفرض حماية SSRF اختيارية؛ راجع متغيرات البيئة في وثائق n8n) |
| `status=failed` و`model_error` | اسم النموذج الافتراضي `gemini-3.1-flash-lite` غير متاح لمفتاحك: جرّب `--model gemini-2.5-flash` |
| `model_error` رغم أن النموذج صحيح | تعبير `{{ $('Next stage').last().json.model }}` في عقدة Model **لم يُثبت على n8n بعد** — افتح العقدة واستبدله بنص ثابت مؤقتاً وأخبرنا |
| `schema_invalid` على مرحلة | النموذج لم يُرجع JSON كما طُلب؛ أعد المحاولة أو جرّب نموذجاً أقوى؛ مفيد أن تنسخ لنا اسم المرحلة |
| `prompt_leak` | المخرج كرّر أول ٨٠ حرفاً من برومبت (حارس مقصود)؛ لن يحدث مع TEMP |

لرؤية بيانات كل عقدة: Workflow → Settings → **Save successful production executions = Save** ثم Executions. هذا محلي فقط ووقائعه وهمية؛ لا تُصدّر الـworkflow بعد تغيير هذا الإعداد (الملف الأصلي يتركه على «لا تحفظ» عمداً حتى لا تبقى برومبتات المالك في السجلات).

## ٧. ما لا تثبته هذه التجربة
- **الملفات المرفقة** (عقدة Read وGemini للمستندات): السكربت يرسل `files: []`. للتجربة يلزم رابط ملف تصل إليه n8n.
- **التطبيق نفسه**: لا خصم نقاط ولا حجز ولا حارس مخرجات التطبيق (`tools.ts`)؛ هذه تغطيها اختبارات `node --test`.
- **جودة المخرجات**: النصوص المستعملة TEMP قصيرة، وبرومبتات المالك الحقيقية لم تصل بعد.
- **الزمن الفعلي**: نماذج حسابك المجاني قد تبطّئ وتُحدّ بالطلبات (429)؛ الأرقام للاسترشاد فقط.

## ٨. الإيقاف
`Ctrl+C` في نافذة `npx n8n`. لا شيء يُرفع إلى أي مكان.
