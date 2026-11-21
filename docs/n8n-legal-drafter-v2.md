# legal-drafter-v2 (staging) — جانب n8n لخط الصائغ v2

> 2026-11-21 · تصميم وكود فقط. **لا شيء منه على n8n الحي.** L14 (`hhmOLkcaPj3bojmh`) لم يُمس.
> المصدر المرجعي للصياغة: النسخة الحية المصدّرة `n8n/live-2026-11-21/ai-legal-drafter__hhmOLkcaPj3bojmh.json` (غير مضافة لهذا الفرع؛ نص عقدة Build prompt فيها منسوخ حرفيًا داخل `legalDrafterV2.mjs`).

> التجربة المحلية: `docs/n8n-legal-drafter-v2-local-test.md` · المهلة وشكل الحزمة وجدول `ai_prompts`: `docs/n8n-legal-drafter-v2-timeout-and-package.md`.

## الملفات
| الملف | الدور |
|---|---|
| `n8n/ai/legalDrafterV2.mjs` | المصدر الوحيد للـworkflow (مثل `workflows.mjs`)، خارج `AI_WORKFLOWS` لأن تلك القائمة مرآة لسجل أدوات التطبيق |
| `n8n/ai/legal-drafter-v2.json` | ملف الاستيراد، يولّده `node scripts/n8n-ai-export.mjs` (أُصلح فيه خلل المسارات ذات المسافات) |
| `src/lib/ai/n8nLegalDrafterV2.test.ts` | نموذج مزيّف يقود الحلقة كما يفعل n8n (16 اختبارًا) |

تشغيل الاختبار: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/n8nLegalDrafterV2.test.ts`

## البنية
اسم: `NZAMY · AI · legal-drafter-v2 (staging)` · مسار: `nzamy-ai/legal-drafter-v2` · مصادقة Header Auth نفسها (`NZAMY AI · inbound`) · يُستورد غير مفعّل.

```
Webhook → Accepted 202 → (ملفات؟ Files → Download → Prepare → Ready?) → Next stage ◄─────┐
Next stage → Final? ─ نعم → Callback                                                      │
                    └ لا  → Progress · stage + Read?/Write → Absorb ───────────────────────┘
```
حلقة واحدة، Agent واحد، نموذج واحد. **Next stage** يختار المرحلة التالية ويبني برومبتها، وحين لا يبقى شيء يجمّع النتيجة. **Absorb** يحلّل JSON المرحلة ويفحصه ويخزنه في حالة تمر إلى Next stage. المراحل:

| المرحلة | متى | ما تفعله |
|---|---|---|
| `write` | دائمًا | برومبت L14 الحي حرفيًا لكل طور (`issues`/`draft`/`section`) — الطور `issues` هو «التحليل» الذي يسميه التطبيق، وليس `outline` |
| `extraction` | طور `draft` | يستخرج من `body.sources` فقط؛ الكود يُسقط أي `sid` لم يُرسل ويضع `verified` إن وردت العبارة حرفيًا في نص المصدر |
| `adversary` | طور `draft` | قراءة فقط: ناتجه يذهب إلى `lawyer_notes.adversary` ولا يصل المذكرة أبدًا (مُختبر) |
| `refine` | طور `draft` | يأخذ المذكرة + تقرير الاستخراج + الفاحص، ويخرج بنفس شكل المذكرة؛ قائمة `changes` تُفصل إلى الملاحظات؛ `requests_changed` يُنبّه إن تغيّرت الطلبات |
| `najiz` | طور `draft` | `output.najiz = {text, chars, over_limit, markers_kept}` بحد 9000 حرف وحفظ `[يحتاج تحقق]` |

طورا `issues` و`section` يمرّان بمرحلة `write` وحدها: السلوك والمخرج كما L14 تمامًا.

## تسليم كل مرحلة فور انتهائها (منفَّذ في n8n، ينتظر قبول التطبيق)
مع كل نداء تقدم (`status: "progress"`) يضيف n8n الحقل `stage_done` = مخرج **المرحلة التي انتهت للتو**: `{ stage, output }` أو `{ stage, skipped: true, reason }`. شكل `output`: `write` المذكرة أو التحليل كما هي؛ `extraction` و`adversary` الملاحظات بعد الفحص؛ `refine` `{ memo, changes, requests_changed }`؛ `najiz` `{ text, chars, over_limit, markers_kept }`. مخرج آخر مرحلة يصل في الـCallback النهائي. **عقد جديد على التطبيق:** أن يحفظ `stage_done` ويعرضه للمحامي فورًا ويحاسب على المراحل المسلَّمة (مواصفة `mcp/EXT_RUNS_SPEC.md`).

**حارس الوقت:** اختياري عبر `body.deadline_at` (ISO) و`body.reserve_ms` (الافتراضي ١٨٠٠٠٠). بعد `write`، إن بقي للمهلة أقل من الاحتياطي تُتخطى المراحل المتبقية بسبب `deadline` وتُسجَّل في `lawyer_notes.skipped` وتنتهي الجولة `succeeded` بما أُنجز؛ ما وصل المحامي يبقى معه. المطلوب من التطبيق: إرسال `deadline_at` ورد سعر المراحل المتخطاة فقط (مقترح، غير مفعَّل).

## حزمة الويب هوك (ما يضيفه التطبيق على حزمة L14)
- `prompts`: `{ draft?, extraction, adversary, refine, najiz }` نصوص من جدول `ai_prompts`. `draft` = برومبت النوع (03–08)؛ إن غاب، برومبت L14 المدمج. تُرسل كرسالة المستخدم لا كرسالة نظام (LangChain يقرأ `{}` متغيرات).
- `models` (اختياري): `{ <stage>: "gemini-…" }` لكل مرحلة؛ معرّف غير صالح يُتجاهل. **غير مُثبت على n8n حي**: عقدة Model تقرأه بتعبير `$('Next stage').last().json.model`.
- `input.stages` (اختياري): مجموعة جزئية من المراحل اللاحقة. `input.on_stage_error`: `fail` (الافتراضي، يوافق «يُرد السعر كاملًا عند فشل أي مرحلة») أو `skip` (تُتخطى مرحلة لاحقة وتُسجَّل في `lawyer_notes.skipped`؛ `write` لا تُتخطى أبدًا).
- الباقي كما L14: `input`, `sources`, `files`, `respond.callback_url`.

## المخرج
شكل L14 كما هو (`title/sections/requests/cited`، والمذكرة هي المنقحة إن جرى التنقيح) **مضافًا** `lawyer_notes` و`najiz`:
```
lawyer_notes: { extraction:{items,gaps,conflicts,dropped}|null, adversary:{verdict,findings}|null,
                refine:{changes,requests_changed}|null, skipped:[], engine:{stages,prompts:{stage:"body"|"temp"|"built-in"},models} }
```
`citations` تُحسب من نص المذكرة النهائية. تقدم n8n يُرسل بالخطوات المسموحة في التطبيق فقط (`reading/drafting/reviewing`) مع `detail` عربي لكل مرحلة. حارس تسرب: إن تكرّر في المخرج أول ٨٠ حرفًا من أي برومبت وصل → `prompt_leak` (فشل، فيُرد السعر).

## نقاط الاتصال بالتطبيق (لم أمسّ الكود)
1. ~~`tools.ts legalDrafterOutput` يُسقط `lawyer_notes` و`najiz`~~ — **أُنجز 2026-11-21**: يمرّران في طور `draft` فقط (مفاتيح معروفة، حد ١٠٠ ألف حرف للملاحظات، وناجز بنص ≤ ٢٠٠٠٠)، والشكل الخاطئ يُسقط بصمت ولا يرفض المذكرة (اختبار في `legalDrafter.test.ts`). تصحيح سطر الأسعار في `n8n/ai/README.md` أُنجز أيضًا.
2. مسار جديد في السجل (أو `n8nPath` حسب البيئة) يشير إلى `nzamy-ai/legal-drafter-v2` عند الاختبار، وإرسال `prompts`/`models` في الحزمة.
3. الأسعار في الكود الحي (`draftKinds.ts`): دعوى وردود 500، استئناف 800، نقض والتماس 1500؛ سطر الأسعار في `n8n/ai/README.md` قديم (200/1000) ويحتاج تصحيحًا.
4. المهلة: `jobDeadlineSeconds` 15 دقيقة؛ خمس نداءات متتالية قد تقترب منها مع نموذج بطيء — تُقاس على staging.

## ينتظر من المالك / المنسّقة
- **إذن صريح** لإنشاء الـworkflow على n8n (بواسطة `N8N_API_KEY` كمتغير بيئة عند المالك) وتركه غير مفعّل أو تفعيله على staging.
- نصوص برومبتات `draft/extraction/adversary/refine/najiz` (الحالي TEMP قصير في `TEMP_PROMPTS`، يظهر في `engine.prompts` بقيمة `temp`).
- قرار سياسة فشل مرحلة متأخرة: `fail` (استرداد كامل) أم `skip`.
- نموذج طويل السياق لكل مرحلة (flash-lite لا يكفي لبرومبتات ~١٣٥ ألف حرف) ثم إثبات تعبير `models` على n8n؛ `maxOutputTokens` الحالي 16000 لكل مرحلة.
- قياس التكلفة والزمن على القضايا الثلاث قبل تثبيت السعر.

## مخاطر معروفة
- تعبيرا `Model.modelName` و`$('Next stage').last()` داخل حلقة لم تُشغَّل على n8n فعليًا؛ الاختبار المحلي يحاكي العقد Code فقط، لا Agent ولا Gemini.
- مرفقات الملفات: يقرؤها Gemini (Read) في مرحلة `write` الأولى فقط كما L14؛ بقية المراحل تعمل على النص.
