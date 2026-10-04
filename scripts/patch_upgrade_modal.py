import sys

file_path = r"src/components/UpgradeModal.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """  free: {
    id: "free",
    label: "المجاني",
    price: "٠",
    period: "دائماً",
    color: "zinc",
    features: ["٥ استفسارات AI/شهر", "مطالعة الأنظمة", "بدون محامي"],
    nextPlan: "ai-individual",
  },
  "ai-individual": {
    id: "ai-individual",
    label: "AI فردي",
    price: "٩٩",
    period: "شهرياً",
    color: "emerald",
    features: ["٤٠ استفسار AI/شهر", "يستشهد بالمواد القانونية", "تصعيد فوري للمحامي", "أرشفة الاستشارات"],
    nextPlan: "legal-protection",
  },
  "legal-protection": {
    id: "legal-protection",
    label: "الحماية القانونية",
    price: "٢٩٩",
    period: "شهرياً",
    color: "royal",
    features: ["٨٠ استفسار AI/شهر", "١ استشارة مجانية/شهر", "١ مراجعة عقد مجانية", "محامي شخصي مخصص"],
    nextPlan: undefined,
  },"""

repl = """  free: {
    id: "free",
    label: "المجاني",
    price: "٠",
    period: "دائماً",
    color: "zinc",
    features: ["٥ استفسارات AI/شهر", "مطالعة الأنظمة", "بدون محامي"],
    nextPlan: "shield",
  },
  shield: {
    id: "shield",
    label: "التأمين القانوني الفردي",
    price: "٣٦٥",
    period: "سنوياً (ريال يومياً)",
    color: "royal",
    features: [
      "ذكاء اصطناعي قانوني غير محدود",
      "٣ استشارات مع محامٍ مرخّص",
      "مراجعة عقد مجاناً سنوياً",
      "خصم ١٥٪ على أتعاب الترافع",
      "عرض التأسيس: ٢٩٦ ر.س لأول ٣٩٦ مشتركاً",
    ],
    nextPlan: "group",
  },
  group: {
    id: "group",
    label: "التأمين الجماعي (الرَّبع)",
    price: "٧٥٠",
    period: "سنوياً (٣ أفراد)",
    color: "amber",
    features: [
      "٥ استشارات مرئية لكل عضو/سنة",
      "خصم ٢٥٪ على الترافع والقضايا",
      "ضامن مالي موحد وعزل تام للخصوصية",
      "صياغة عقدين مجاناً للمجموعة",
    ],
    nextPlan: undefined,
  },"""

if target not in content:
    print("Error: target not found in UpgradeModal.tsx")
    sys.exit(1)

content = content.replace(target, repl, 1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully updated UpgradeModal.tsx to match Tripartite Council plans")
