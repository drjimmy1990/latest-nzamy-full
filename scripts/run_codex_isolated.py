import subprocess
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
codex_cmd = r"C:\Users\Judge\AppData\Roaming\npm\codex.CMD"

PROMPT = """أنت الآن عضو مجلس المراجعة التشاوري الثلاثي (Codex CLI / GPT-5.6-Luna).
مطلوب نقدك المعماري والتقني الحاسم كعضو استشاري في المسائل التالية لمنصة نظامي:
1. هيكلة باقات العميل: الاقتصار على 3 خيارات (دفع بالعمل مقطوع، تأمين فردي 365 ر.س مع عرض تأسيس < 1 ريال وشارة عميل مؤسس لأول 396، وتأمين جماعي مدرج وضامن مالي موحد).
2. الشوائب والصفحات الشبحية في باقي الأدوار (مثل صفحة مشاهير التيك توك admin/celebrities، والموك في ai-usage، وصفحات قريباً).
3. معالجة حالة رصيد صفر أو بدون اشتراك (منع الـ 402 الصامت وبناء Paywall Modal وخيار Escrow).
4. مراقبة التوكنز والضغط في لوحة الأدمن (جدول ai_token_logs وتتبع التكاليف لكل Tenant).
5. خزنة المحامي ومطبوعاته الرسمية (ترويسة وختم مع باركود للتحقق).
6. السوق المهني (تعاقد B2B بين المحامين بحجز الضمان، وطلب مباشر vs مناقصة مفتوحة).
7. المقارنة مع قادة السوق (ناجز، شورى، إياس، Clio، LegalZoom).
قدم تحليلك كتقرير نصي مركز في 600-800 كلمة."""

print("Running Codex with disable collab...")
try:
    p = subprocess.run(
        [codex_cmd, "exec", "--ephemeral", "--disable", "collab", "-s", "read-only", "-m", "gpt-5.6-luna", "-"],
        input=PROMPT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        shell=True,
        timeout=180
    )
    output = p.stdout if p.returncode == 0 else (p.stdout + "\n" + p.stderr)
    out_path = r"outputs\uat\runs\uat-live-human-run\codex_deliberation.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)
    print(f"Saved codex deliberation, length: {len(output)}")
except Exception as e:
    print(f"Error: {e}")
