import subprocess
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

PROMPT = """المطلوب من المجلس الاستشاري تقديم تحليل معماري وتقني وتجاري تفصيلي عاجل للقرارات والمسائل التالية لمنصة نظامي (nezamy.sa):

المسألة 1: هيكلة باقات العميل (3 باقات فقط لمنع التشتت):
- الباقة 1: عضوية الحماية القانونية الفردية (365 ر.س سنويًا - ريال يومياً): 12 استشارة مبدئية، مراجعة عقد واحد، قضية تمثيل مؤهلة (سقف أتعاب 10,000 ر.س وفترة انتظار 90 يوماً).
- الباقة 2: الرَّبع القانوني (الأصدقاء والعائلة): عضوية جماعية (مالك دفع + 2 إلى 5 أعضاء) بعزل تام للملفات والاستشارات. ما هي التسعيرة العادلة للمجموعة وطريقة التوزيع وتناوب الدفع المقترحة؟
- الباقة 3: العميل المؤسس (اليوم الوطني 96 - client-founder-2026): 396 مقعداً بسعر 296 ر.س، خصم مؤسس 15%، شارة، ومخرج واحد لكل أداة مستقلة.
- خيار مستقل: الدفع بالعمل القانوني المقطوع (Pay-per-piece).

المسألة 2: آلية التشغيل والتسليم المؤقتة (نمط الصائغ القانوني - Human-in-the-loop):
- توجيه المالك: عدم تعطيل الخدمات بانتظار اكتمال الـ AI، بل إتاحة رفع الطلب للعميل فوراً مع ظهور حالة "جاري العمل على طلبك"، لتستلمها الإدارة يدوياً في طابور مهام وتنفذها وتسلّمها له في لوحته لحين اكتمال الـ AI والـ API.
- ما هي ضوابط ومعمارية هذه الآلية لضمان عدم حدوث فوضى تشغيلية أو خرق لاتفاقية مستوى الخدمة (SLA)؟

المسألة 3: صفحات الهبوط المستقلة (Dedicated Landing Pages):
- بناء صفحة هبوط مستقلة لكل باقة بحملة ورابط تسويقي مخصص و QR مباشر للإقناع السريع والاشتراك.

المسألة 4: تدقيق سلوك زر الواتساب العائم (Floating WhatsApp FAB):
- الفحص الدقيق لسلوك زر الواتساب قبل تسجيل الدخول (زائر يطلب خدمة ويختار فئته) وبعد تسجيل الدخول (مساعد ذكي يتعرف تلقائياً على الدور وينقل سياق المستخدم).

قدم تحليلك المتعمق، مبرزاً: نقاط القوة، نقاط الضعف والمخاطر، والحل المعماري والتنفيذي المعتمد لكل مسألة."""

OUTPUT_DIR = r"D:\Data\Data\antigravity ai\GIT NZAMY\latest-nzamy-full\outputs\uat\runs\uat-live-human-run"
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("--- 1. تشغيل استشارة كلود عبر stdin ---")
try:
    proc_claude = subprocess.run(
        ["cmd.exe", "/c", "claude", "--output-format", "text"],
        input=PROMPT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180
    )
    claude_res = proc_claude.stdout if proc_claude.returncode == 0 else (proc_claude.stdout + "\n" + proc_claude.stderr)
    claude_path = os.path.join(OUTPUT_DIR, "claude_deliberation.md")
    with open(claude_path, "w", encoding="utf-8") as f:
        f.write(claude_res)
    print(f"✓ تم حفظ مداولة كلود ({len(claude_res)} حرف)")
except Exception as e:
    print(f"خطأ في استدعاء كلود: {e}")

print("\n--- 2. تشغيل استشارة كودكس عبر stdin ---")
try:
    proc_codex = subprocess.run(
        ["cmd.exe", "/c", "codex", "exec", "--ephemeral", "-m", "gpt-5.6-luna", "-"],
        input=PROMPT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180
    )
    codex_res = proc_codex.stdout if proc_codex.returncode == 0 else (proc_codex.stdout + "\n" + proc_codex.stderr)
    codex_path = os.path.join(OUTPUT_DIR, "codex_deliberation.md")
    with open(codex_path, "w", encoding="utf-8") as f:
        f.write(codex_res)
    print(f"✓ تم حفظ مداولة كودكس ({len(codex_res)} حرف)")
except Exception as e:
    print(f"خطأ في استدعاء كودكس: {e}")

print("\n✓ اكتملت مداولات المجلس الاستشاري بنجاح!")
