# الصائغ v2 — المهلة، وحزمة prompts/models، وجدول ai_prompts

> 2026-11-21 · تحليل وتصميم؛ لم يُنفَّذ شيء من التغييرات المقترحة في التطبيق أو قاعدة البيانات.
> **(حقيقة)** = مقروء من الكود. **(تقدير)** = أرقام افتراضية لم تُقَس. **(افتراض)** = لم أتحقق منه.

## ١. المهلة: ١٥ دقيقة مقابل خمس نداءات متتالية

### ما في الكود (حقائق)
- `legal-drafter` مهلته `jobDeadlineSeconds: 15 * 60` (`tools.ts`، مواصفة `legal-drafter`)، وتُحسب في `runCore.ts:712` **قبل** البحث في المكتبة وقبل الإرسال إلى n8n، فالبحث وقراءة الملفات من ضمنها.
- كل طور تشغيل مستقل بمهلته: `issues` نداء واحد، `section` نداء واحد، **`draft` وحده** يمر بخمسة نداءات (write ← extraction ← adversary ← refine ← najiz). فالخطر في المسودة فقط.
- ما بعد المهلة: `ai_sweep_runs` يُفشل كل تشغيل ما زال `running` بعد `deadline_at` بسبب `timeout` ويرد النقاط (`aiSweep.ts`). وإن وصل الـcallback متأخراً فـ`runCore.ts:1127` يردّ `200 {final}` ويتجاهل النتيجة. **الخلاصة: عمل المراحل كلها يضيع والمستخدم يُردّ له سعره.**
- أحداث التقدم لا تمدّ المهلة (لا أثر لذلك في `progressEvents`/`runCore`).
- جانب n8n: لا `executionTimeout` في إعدادات الـworkflow، ولا مهلة على عقدتي Agent وModel. المتغير العام `EXECUTIONS_TIMEOUT` على الخادم الحي لم أطّلع عليه (**افتراض**: غير محدود). عقدة Callback مهلتها ٣٠ ثانية **بلا إعادة محاولة**؛ عقدتا Progress ٥ ثوانٍ وتتجاوزان الفشل.
- الحزمة تحمل `deadline_at`، والـworkflow لا يقرؤه اليوم.

### الحساب (تقدير لا قياس)
مخرجات كل مرحلة بالرموز (العربية ٢–٣ حروف للرمز، **افتراض**): write ‏6–10 آلاف · extraction ‏3–6 · adversary ‏1.5–3 · refine ‏6–10 · najiz ≤ ‏4.5 (٩٠٠٠ حرف). المجموع المعتاد ≈ ‏17–33 ألف رمز (نأخذ ٢٥ ألفاً)، والسقف النظري ٥ × ‏16000 = ‏80 ألفاً (`maxOutputTokens`).
الزمن ≈ المخرجات ÷ السرعة + (٥ مراحل × ‏≈٨ ثوانٍ لقراءة المدخلات الكبيرة والإقلاع):

| سرعة التوليد | ٢٥ ألف رمز (معتاد) | ٨٠ ألف رمز (سقف) |
|---|---|---|
| سريعة ‏150 ر/ث | ≈ ٣٫٥ دقيقة | ≈ ٩٫٥ دقيقة |
| متوسطة ‏70 ر/ث | ≈ ٦٫٥ دقيقة | ≈ ٢٠ دقيقة ✗ |
| بطيئة ‏35 ر/ث (نماذج تفكير / سياق طويل) | ≈ ١٣ دقيقة | ≈ ٣٨ دقيقة ✗ |

أضف: بحث المكتبة قبل الإرسال (ثوانٍ)، وقراءة الملفات بـGemini في أول مرحلة (دقيقة أو أكثر لمسح ضوئي)، وإعادات 429/503. **الخلاصة (تقدير):** المعتاد يتسع في ١٥ دقيقة بنموذج سريع أو متوسط، لكن بلا هامش مع نموذج بطيء أو مخرجات قريبة من السقف، وأي تجاوز يُلغي الخط كله.

### التوصيات (مرتبة)
1. **القياس أولاً.** سكربت التجربة المحلية يطبع وقت كل حدث تقدم، والفرق بين سطرين = زمن مرحلة. شغّله على القضايا الثلاث (استئناف مدني، رد تجاري، نقض تجاري) بالنموذج المقصود، ثم نثبّت الأرقام مكان التقديرات أعلاه.
2. **حارس ميزانية في «Next stage»** (**نُفِّذ** — انظر `n8n-legal-drafter-v2.md`، القرار: تسليم كل مرحلة فور انتهائها + تخطٍّ بسبب `deadline`): قبل كل مرحلة لاحقة يحسب `remaining = Date.parse(b.deadline_at) - Date.now()`؛ إن قلّ عن `احتياطي` (≈ ضعف أبطأ زمن مرحلة مقاس + ٦٠ ثانية للـcallback) يتوقف ويجمّع بما أُنجز، مع `lawyer_notes.skipped = [{stage, reason: "deadline"}]`. قرار للمالك: **تسليم جزئي** (مذكرة بلا تنقيح/ناجز مع تنبيه) أم **فشل صريح مبكر** بردّ كامل؛ الأول أنفع للمحامي، والثاني أبسط. (الكود الحالي إن تجاوز يفشل بصمت عبر المكنسة.)
3. **نموذج لكل مرحلة** (البنية جاهزة: `body.models`): قوي وطويل السياق لـwrite وrefine، وأسرع لـadversary وnajiz وextraction. هذا أكبر مكسب زمني متاح بلا تغيير هيكلي. تذكير: مرحلة write حين تكون هناك ملفات تمر بعقدة Read التي تستعمل النموذج الثابت `MODEL.modelName` لا `body.models` (**حقيقة** من `legalDrafterV2.mjs`).
4. **مهلة الطور `draft` وحده ٣٠ دقيقة**: المهلة اليوم رقم واحد للأداة (`tools.ts`)، فرفعها يؤخر رد نقاط `issues`/`section` العالقين أيضاً. الأنسب دالة على `input.phase` في `runCore.ts:712` (تغيير تطبيق، لم أُجرِه).
5. **إعادة محاولة على عقدة Callback** (`retryOnFail` ثلاث مرات بفاصل ثانيتين): فشل شبكي لحظي في الإرسال الأخير يضيّع خمس مراحل. تغيير صغير في `legalDrafterV2.mjs` إن وافق المشرف.
6. **المسار الأصلي في الخطة (بند ٢):** «كل مرحلة `ai_run` فرعية تحت تشغيل رئيسي». ما بُني الآن يحلقها داخل n8n في تشغيل واحد ومهلة واحدة (**افتراض**: مقصود كجسر للتجربة). التنسيق من التطبيق، بنداء n8n لكل مرحلة ومهلة لكل مرحلة، يزيل مشكلة المهلة من أصلها ويتيح الاستئناف من مرحلة فاشلة كما تقول الخطة.

## ٢. شكل الحزمة كما بُني (`legalDrafterV2.mjs`)
```jsonc
{
  "v": 1, "run_id": "…", "tool": "legal-drafter", "input": { /* كما L14 */
      "phase": "issues|draft|section",
      "stages": ["extraction","refine"],        // اختياري، draft فقط
      "on_stage_error": "fail|skip" },          // اختياري، الافتراضي fail
  "sources": [ … ], "files": [ … ], "respond": { "callback_url": "…" }, "deadline_at": "…",
  "prompts": {                                   // اختياري
    "draft": "نص برومبت النوع (03–08)",
    "extraction": "…", "adversary": "…", "refine": "…", "najiz": "…" },
  "models": {                                    // اختياري
    "write": "gemini-…", "extraction": "…", "adversary": "…", "refine": "…", "najiz": "…" }
}
```
قواعد التنفيذ (حقائق من الكود):
- **prompts**: نص غير فارغ بعد القص يُستعمل ويوسم `body` في `lawyer_notes.engine.prompts`؛ الغائب يشغّل TEMP قصيراً ويوسم `temp`؛ `write` بلا `draft` يشغّل برومبت L14 المدمج ويوسم `built-in`. في غير طور `draft` لا يُقرأ منها شيء. تُرسل كرسالة المستخدم لا النظام (أقواس LangChain). حارس التسرب: أول ٨٠ حرفاً من أي نص بطول ≥ ٨٠ إن ظهرت في المخرج → `prompt_leak`.
- **models**: كل قيمة تُقص وتُطابَق `^(models/)?[A-Za-z0-9][A-Za-z0-9._-]{1,60}$`؛ غير المطابق يُتجاهل ويعود النموذج الافتراضي. مفتاح مرحلة الصياغة هو `write` (اسم المرحلة في الـworkflow)، وأضفتُ قبول `draft` أيضاً لأنه اسمها في خطة `ai_prompts` (اختبار جديد). يظهر المستعمل في `lawyer_notes.engine.models` وفي `usage.model`.
- **الحجم**: لا حد في الـworkflow؛ حد جسم n8n الافتراضي ‏16 MiB (`N8N_PAYLOAD_SIZE_MAX`، **افتراض**) يكفي لحزمة ≈ ‏٤٠٠ ألف حرف عربي (≈ ‏٨٠٠ ك.ب). مع ذلك أرسل برومبتات **المراحل التي ستعمل فقط** (طابق `input.stages`) ولا ترسلها لـ`issues`/`section`.
- التخزين المؤقت للبرومبتات (بند ٣ في الخطة): غير منفَّذ؛ عقدة Agent لا تكشف cached-content (**افتراض**).

## ٣. جدول `ai_prompts` (مقترح يطابق الحزمة؛ لم يُنشأ)
الخطة: `ai_prompts(tool, stage, version, body, status)`. يلزم عمودان إضافيان: **`variant`** لأن `draft` له نص لكل نوع مذكرة، و**`model`** ليسافر النموذج المقصود مع النص.
```sql
create table public.ai_prompts (
  id         uuid primary key default gen_random_uuid(),
  tool       text not null,                     -- 'legal-drafter'
  stage      text not null check (stage in ('draft','extraction','adversary','refine','najiz')),
  variant    text not null default '',          -- نوع المذكرة (claim|reply|…|petition) لـdraft؛ '' = لكل الأنواع
  version    integer not null,
  body       text not null check (length(body) between 1 and 300000),
  model      text,                              -- معرّف نموذج اختياري لهذه المرحلة (يطابق نمط models)
  status     text not null default 'draft' check (status in ('draft','active','retired')),
  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tool, stage, variant, version)
);
create unique index ai_prompts_one_active on public.ai_prompts (tool, stage, variant) where status = 'active';
```
- **الأمان**: RLS مفعّلة بلا سياسات للعملاء؛ تقرأها خدمة التطبيق (service role) وتعدّلها شاشة الإدارة فقط. لا يُنسخ `body` إلى `ai_runs.input/output` ولا إلى سجلات.
- **الإرسال**: عند بدء تشغيل `draft` يحلّ التطبيق الصف النشط لكل مرحلة تعمل (`draft` بحسب `input.kind`) فيبني `prompts[stage] = body` و`models[workflow_stage] = model` (مع تحويل `draft`→`write`، أو يكفي الآن لأن الـworkflow يقبل الاسمين). ويسجّل في التشغيل `{stage, version, sha256(body)}` فقط لإعادة بناء ما استُعمل دون تخزين النص.
- **فجوة تحتاج قراراً**: الأنواع الثمانية في الكود (`claim, reply, rejoinder, supplementary, closing, appeal, cassation, petition`) مقابل ستة برومبتات `03–08`. لا أعرف مطابقتها (**افتراض**: تحدّدها أنت)؛ التصميم يتسع لأي مطابقة عبر `variant`.
- الترقيم والترحيل يتبعان عرف `supabase/migrations/` (لم أنشئ ملفاً).
