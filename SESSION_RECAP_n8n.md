# SESSION_RECAP_n8n — الصائغ v2 على n8n

> أُعيد بناؤه من الملفات (المحادثة الأصلية فُقدت). الفرع `claude/n8n-sayegh-v2-c27063`. لا شيء على `n8n.asra3.com`.
> الخطة: `docs/plans/2026-11-21-sayegh-pipeline-v2-plan.md` (موجودة في الـcheckout الرئيسي على `owner-edits` وغير موجودة على `main`).

## ما أُنجز
- `b62804be`: workflow `legal-drafter-v2` (staging، غير مفعّل، مسار `nzamy-ai/legal-drafter-v2`): حلقة واحدة write ← extraction ← adversary ← refine ← najiz، مصدره `n8n/ai/legalDrafterV2.mjs` والـJSON يولّده `scripts/n8n-ai-export.mjs`. برومبتات من `body.prompts`، نموذج لكل مرحلة من `body.models`، `on_stage_error`، حارس تسرب البرومبت، سكربت تجربة محلية، وتمرير `lawyer_notes`/`najiz` في `tools.ts`. وثائق `docs/n8n-legal-drafter-v2*.md`.
- `6b2af0cc`: `stage_done` مع كل نداء تقدم + حارس الوقت `deadline_at`/`reserve_ms`.
- **هذه الجلسة:** مرحلة `intake` الاختيارية (قبل write، تقرأ المرفقات وتغذي write بـ`<case_brief>`)، و`model_tier` عبر `tier_models`، و٣ اختبارات جديدة (الملف 23 اختبارًا كلها تمر؛ n8nWorkflows وlegalDrafter 109 تمر)، وتحديث JSON والوثيقة.

## القرارات المعتمدة
تسعير موحد بلا رسوم مراحل (٥٠٠/٨٠٠/١٥٠٠)؛ المصادر من المكتبة؛ البرومبتات تسافر في الحزمة لا في الـworkflow؛ فشل أي مرحلة = رد السعر كاملًا (`fail` افتراضيًا)؛ الأدوات للمشرفين فقط بداية؛ نشر n8n بإذن المالك فقط.

## ما تبقى (خارج ملفات n8n أو ينتظر المالك)
1. **إذن المالك** لاستيراد الـworkflow على n8n (staging) وإثبات تعبيري `models`/`$('Next stage').last()` فعليًا — لم يُجرَّب Agent/Gemini حقيقيًا.
2. نصوص برومبتات المالك (intake/draft/extraction/adversary/refine/najiz)؛ الحالي TEMP.
3. التطبيق: جدول `ai_prompts` (مقترح في `docs/n8n-legal-drafter-v2-timeout-and-package.md`)، إرسال `prompts/models/tier_models/deadline_at`، قبول `stage_done`، مهلة طور `draft`، مطابقة الأنواع الثمانية بالبرومبتات 03–08.
4. اختيار نموذج طويل السياق لكل مرحلة وقياس الزمن والتكلفة على القضايا الثلاث.
5. قرار المالك: سياسة فشل المرحلة المتأخرة (`fail` أم `skip`) والتسليم الجزئي.
6. ملاحظة: عقدة Read تستعمل النموذج الثابت لا `models`؛ و`stages` غير المعروفة تُتجاهل.

## الخطوة التالية
مراجعة المالك ثم إذن استيراد `n8n/ai/legal-drafter-v2.json` على staging وتشغيل `scripts/n8n-local-smoke.mjs` ثم قياس المراحل.
