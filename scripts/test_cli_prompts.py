import subprocess
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

PROMPT = """حلل وانتقد القرارات التالية لمنصة نظامي:
1. هيكلة باقات العميل: الحماية الفردية (365 ر.س)، الربع القانوني للأصدقاء والعائلة، والعميل المؤسس (296 ر.س).
2. تشغيل الصائغ والأدوات المستقلة بنمط manual admin queue بنص "جاري العمل على طلبك" لحين اكتمال الـ AI.
3. صفحات هبوط مستقلة لكل باقة برابط تسويقي مباشر.
4. سلوك زر الواتساب العائم قبل وبعد تسجيل الدخول.
أعط تحليلاً معمارياً مختصراً ومركزاً في 500 كلمة."""

claude_exe = r"C:\Users\Judge\.local\bin\claude.EXE"
codex_cmd = r"C:\Users\Judge\AppData\Roaming\npm\codex.CMD"

print("Running Claude...")
p_claude = subprocess.run([claude_exe, "-p", PROMPT, "--output-format", "text"], capture_output=True, text=True, encoding="utf-8", timeout=120)
print(f"Claude returned code {p_claude.returncode}, len={len(p_claude.stdout)}")
with open("outputs/uat/runs/uat-live-human-run/claude_deliberation.md", "w", encoding="utf-8") as f:
    f.write(p_claude.stdout if p_claude.returncode == 0 else (p_claude.stdout + "\n" + p_claude.stderr))

print("Running Codex...")
p_codex = subprocess.run([codex_cmd, "exec", "--ephemeral", "-m", "gpt-5.6-luna", "-"], input=PROMPT, capture_output=True, text=True, encoding="utf-8", shell=True, timeout=120)
print(f"Codex returned code {p_codex.returncode}, len={len(p_codex.stdout)}")
with open("outputs/uat/runs/uat-live-human-run/codex_deliberation.md", "w", encoding="utf-8") as f:
    f.write(p_codex.stdout if p_codex.returncode == 0 else (p_codex.stdout + "\n" + p_codex.stderr))

print("Done both!")
