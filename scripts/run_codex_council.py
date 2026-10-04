# -*- coding: utf-8 -*-
import subprocess
import os

PROMPT = """أنت الآن عضو مجلس المراجعة التشاوري الثلاثي (Codex CLI / GPT-5.6-Luna) في مشروع منصة "نظامي" القانونية الذكية (Saudi Legal-Tech).
مطلوب منك تقديم نقد وتحليل معماري وتجاري ونظامي مستقل وحاسم (دون مجاملة) للمسائل الاستراتيجية التالية وفق معايير السوق السعودي والأنظمة المعمول بها:

1. هيكلة باقات العميل (Client Package Architecture):
   - مقترح المالك: توحيد مفهوم "الحماية القانونية / التأمين القانوني" وإلغاء التشتت واعتماد 3 خيارات فقط كحد أقصى:
     أ) الدفع بالعمل القانوني (Pay-as-you-go / Pay-per-piece): بدون اشتراك، ادفع فقط عند طلب مذكرة، عقد، أو استشارة.
     ب) التأمين القانوني الفردي (Individual Legal Protection): السعر الأساسي 365 ر.س/سنة (ريال يومياً)، وعرض يوم التأسيس بأقل من ريال يومياً (مثلاً 222 أو 296 ر.س/سنة).
     ج) التأمين القانوني الجماعي (Group Legal Protection / نمط "الرَّبع"): مدرج (Tiered) - كلما زاد عدد الأعضاء (مثلاً 3-10) قلت التكلفة للفرد وزادت المزايا (5 استشارات مرئية سنوياً لكل فرد، خصم أعلى على الترافع)، مع آلية الضامن المالي (Payment Guarantor) حيث يلتزم مالك المجموعة بسداد سنوي أو ربع سنوي عن كامل المجموعة، مع إمكانية الترقية السلسة من الفردي للجماعي.
   - ما رأيك المعماري والتجاري؟ كيف تنفذ هندسياً ومالياً وقانونياً في بيئة Supabase + Stripe/Moyasar؟

2. تدقيق أدوار المستخدمين السبعة وتنقيح الصفحات الشبحية (Ghost Pages Purge):
   - الأدوار: الشركات (corporate)، المنشآت المصغرة (micro)، القطاع غير الربحي (ngo)، مكاتب المحاماة (firm)، مقدمو العدالة (provider: notary, arbitrator, bailiff)، الجهات الحكومية (government)، وإدارة المنصة (admin).
   - ما هي الصفحات الشبحية والـ Junk التي يجب حذفها فوراً لتنظيف المنصة؟

3. معالجة حالة الحافة الحرجة: مستخدم يطلب خدمة ورصيده صفر / ليس لديه اشتراك:
   - حالياً الـ API يرجع 402 أو يفشل عند انعدام الرصيد.
   - ما هو الـ UX Flow والـ State Machine الأمثل؟ (Paywall modal, Checkout direct, Escrow deposit)؟

4. مراقبة استهلاك الموارد والتوكنز في لوحة الأدمن (Admin Resource & Token Monitoring):
   - كيف تراقب إدارة المنصة استهلاك نماذج الذكاء الاصطناعي (OpenAI, Claude) ومساحة التخزين والـ OCR لكل مستأجر (Tenant)، شركة محاماة، ومحامٍ فرد لمنع الاستنزاف والضغط؟

5. خزنة المحامي والمطبوعات المخصصة (Lawyer Vault & Custom Branded Letterheads):
   - كيف تُبنى خزنة المحامي الخاصة مع دعم مطبوعاته الرسمية (ترويسة، شعار، ختم، باركود توثيق) لتصدير المذكرات والعقود المخرجة من المنصة؟

6. الورك فلو الشامل للسوق المهني (Marketplace Workflows):
   - تعاقد المحامي مع محامٍ آخر أو مقدم عدالة (Subcontracting / B2B) وحفظ الحقوق والعمولة.
   - طلب العميل لمحامٍ بعينه (Direct Request) مقابل طرح طلب في السوق المفتوح (Open Tender).

7. المقارنة المعيارية التنافسية (Competitive Benchmark):
   - مقارنة نظامي مع قادة السوق السعودي (ناجز، شورى Shura، إياس Eyas، محامي دوت كوم) والعالمي (Clio، LegalZoom).
   - ما هي الفجوات التنافسية وما هي الميزة غير العادلة (Unfair Advantage) لنظامي؟

قدم تحليلك بنقاط هندسية وعملية دقيقة، محددة، خالية من الحشو.
"""

OUTPUT_DIR = r"D:\Data\Data\antigravity ai\GIT NZAMY\latest-nzamy-full\outputs\uat\runs\uat-live-human-run"
os.makedirs(OUTPUT_DIR, exist_ok=True)
codex_path = os.path.join(OUTPUT_DIR, "codex_deliberation.md")

print("Running Codex CLI with prompt...")
proc = subprocess.run(
    ["cmd.exe", "/c", "codex", "exec", "--ephemeral", "-m", "gpt-5.6-luna", "-"],
    input=PROMPT,
    capture_output=True,
    text=True,
    encoding="utf-8",
    timeout=300
)

stdout = proc.stdout if proc.stdout else ""
stderr = proc.stderr if proc.stderr else ""
full_output = stdout if proc.returncode == 0 else (stdout + "\n" + stderr)

with open(codex_path, "w", encoding="utf-8") as f:
    f.write(full_output)

print(f"Codex deliberation finished (Code: {proc.returncode}, Size: {len(full_output)} chars)")