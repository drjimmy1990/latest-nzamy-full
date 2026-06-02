import { Brain, Gavel, ShieldCheck, Buildings } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Plans: Micro / Small Business ───────────────────────────────────────────
//
// الفكرة: صاحب البقالة لا يفكر بـ"باقة" — يفكر بـ"مشكلة".
// موظف مطالب بحقوقه، مخالفة بلدية، مورد مخالف للعقد.
// نحن لا نبيع له باقة — نبيع له "ضامن قانوني طول السنة".
// سعر واحد. قيمة واضحة. بلا تعقيد.
//
export const plansMicro: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      // ── المجاني: مراقب الاشتراطات فقط ──
      id: "micro-free", name: "المراقب المجاني", badge: null,
      priceMonthly: "مجاني", priceYearly: "مجاني",
      periodMonthly: "", periodYearly: "",
      desc: "راقب رخصتك واشتراطاتك — قبل أن تتفاجأ بمخالفة",
      target: "منشآت صغيرة", cta: "سجّل مجاناً",
      ctaHref: "/register/client?type=micro",
      highlighted: false, color: "border-slate-200/50",
      features: {
        ai:       ["المستشار AI: ١ استفسار / يوم", "مراقبة الرخصة التجارية والسجل", null, null],
        platform: ["تنبيه قبل ٣٠ يوماً من انتهاء أي رخصة", "ملف منشأة أساسي", null, null],
        support:  ["دعم بريد إلكتروني", null],
      },
    },
    {
      // ── درع المنشأة: الضامن القانوني السنوي ──
      // المنطق: ٢,٤٩٩ ÷ ١٢ = ~٢٠٨ ر.س/شهر
      // مقارنة: محامٍ ساعة = ٥٠٠+ ر.س. نحن: سنة كاملة = ٢,٤٩٩
      id: "micro-shield", name: "درع المنشأة", badge: "~٢٠٨ ر.س / شهر",
      priceMonthly: "٢,٤٩٩", priceYearly: "٢,٤٩٩",
      periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "ضامنك القانوني طول العام — للموظفين، العقود، المخالفات، والمنافسات",
      target: "منشآت صغيرة", cta: "احمِ منشأتك الآن",
      ctaHref: "/register/client?type=micro&plan=shield",
      highlighted: true, color: "border-royal/20",
      features: {
        ai: [
          "المستشار AI: ٣٠ استفساراً / شهر",
          "فحص عقد AI: ٣ عقود / شهر",
          "مساعد المنشآت الصغيرة AI (عمل، إيجار، مخالفات)",
          "قوالب عقود متقدمة (عمل، خدمات، إيجار، توريد)",
        ],
        platform: [
          "٢ استشارة مع محامٍ متخصص / شهر (مجدولة)",
          "٢ قضية / سنة كترافع (عمالية أو تجارية — بحد أقصى مبلغ النزاع)",
          "رسم ٢ عقود مخصصة / سنة من محامٍ مرخّص",
          "مراقبة الاشتراطات + تنبيهات ذكية طوال العام",
        ],
        support:  ["دعم واتساب أولوية", "الترافع يُفعَّل بعد ٦٠ يوماً من الاشتراك"],
      },
    },
  ],
  en: [
    {
      id: "micro-free", name: "Free Monitor", badge: null,
      priceMonthly: "Free", priceYearly: "Free",
      periodMonthly: "", periodYearly: "",
      desc: "Monitor your business compliance — before a fine surprises you",
      target: "Small Business", cta: "Sign Up Free",
      ctaHref: "/register/client?type=micro",
      highlighted: false, color: "border-slate-200/50",
      features: {
        ai:       ["AI Consultant: 1 query / day", "Commercial license & records monitoring", null, null],
        platform: ["30-day alert before any license expires", "Basic business profile", null, null],
        support:  ["Email support", null],
      },
    },
    {
      // Logic: 2,499 ÷ 12 = ~208 SAR/month
      // Compare: one lawyer hour = 500+ SAR. We offer: a full year = 2,499
      id: "micro-shield", name: "Business Shield", badge: "~208 SAR / month",
      priceMonthly: "2,499", priceYearly: "2,499",
      periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Your legal guardian all year — for employees, contracts, fines & disputes",
      target: "Small Business", cta: "Protect Your Business",
      ctaHref: "/register/client?type=micro&plan=shield",
      highlighted: true, color: "border-royal/20",
      features: {
        ai: [
          "AI Consultant: 30 queries / month",
          "AI Contract Review: 3 contracts / month",
          "Small Business AI Assistant (labor, lease, violations)",
          "Advanced contract templates (labor, services, lease, supply)",
        ],
        platform: [
          "2 scheduled consultations with specialist lawyer / month",
          "2 litigation cases / year (labor or commercial — up to dispute cap)",
          "2 custom contracts drafted by licensed lawyer / year",
          "Compliance monitoring + smart alerts all year",
        ],
        support:  ["Priority WhatsApp support", "Litigation activates after 60 days from subscription"],
      },
    },
  ],
};

// ─── Comparison Table: Micro / Small Business ─────────────────────────────────
export const comparisonMicro: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "الذكاء الاصطناعي", icon: Brain, rows: [
      { feature: "استفسارات AI/شهر",            "micro-free": "١/يوم",   "micro-shield": "٣٠/شهر" },
      { feature: "فحص عقد AI",                  "micro-free": false,     "micro-shield": "٣ عقود/شهر" },
      { feature: "قوالب عقود جاهزة",             "micro-free": false,     "micro-shield": "متقدمة (عمل، إيجار، توريد)" },
      { feature: "مساعد المنشآت الصغيرة AI",     "micro-free": false,     "micro-shield": true },
    ]},
    { category: "المراقبة والحماية", icon: ShieldCheck, rows: [
      { feature: "مراقبة الرخصة والسجل",         "micro-free": true,      "micro-shield": true },
      { feature: "تنبيهات الانتهاء",              "micro-free": "٣٠ يوماً","micro-shield": "ذكية + تذكير" },
    ]},
    { category: "المحامي والترافع", icon: Gavel, rows: [
      { feature: "استشارة مع محامٍ متخصص",        "micro-free": "دفع منفرد","micro-shield": "٢/شهر مجاناً" },
      { feature: "ترافع في قضايا (تمثيل كامل)",   "micro-free": false,     "micro-shield": "٢ قضايا/سنة" },
      { feature: "رسم عقد مخصص من محامٍ",          "micro-free": "دفع منفرد","micro-shield": "٢/سنة" },
    ]},
    { category: "السعر والجدوى", icon: Buildings, rows: [
      { feature: "سعر الباقة",                   "micro-free": "مجاني",   "micro-shield": "٢,٤٩٩ ر.س/سنة" },
      { feature: "التكلفة الشهرية الفعلية",       "micro-free": "صفر",     "micro-shield": "~٢٠٨ ر.س/شهر" },
      { feature: "مقارنة: ساعة واحدة مع محامٍ",  "micro-free": "٥٠٠+ ر.س","micro-shield": "سنة كاملة بـ٢,٤٩٩" },
      { feature: "الترافع يُفعَّل بعد",           "micro-free": "-",       "micro-shield": "٦٠ يوماً" },
    ]},
  ],
  en: [
    { category: "AI Assistance", icon: Brain, rows: [
      { feature: "AI queries / month",            "micro-free": "1/day",   "micro-shield": "30/month" },
      { feature: "AI contract review",            "micro-free": false,     "micro-shield": "3/month" },
      { feature: "Contract templates",            "micro-free": false,     "micro-shield": "Advanced (labor, lease, supply)" },
      { feature: "Small Business AI Assistant",   "micro-free": false,     "micro-shield": true },
    ]},
    { category: "Monitoring & Protection", icon: ShieldCheck, rows: [
      { feature: "License & record monitoring",   "micro-free": true,      "micro-shield": true },
      { feature: "Expiry alerts",                 "micro-free": "30 days", "micro-shield": "Smart + reminders" },
    ]},
    { category: "Lawyer & Litigation", icon: Gavel, rows: [
      { feature: "Specialist lawyer consultation","micro-free": "Pay per use","micro-shield": "2/month free" },
      { feature: "Litigation (full representation)","micro-free": false,   "micro-shield": "2 cases/year" },
      { feature: "Custom contract by lawyer",     "micro-free": "Pay per use","micro-shield": "2/year" },
    ]},
    { category: "Pricing & Value", icon: Buildings, rows: [
      { feature: "Plan price",                    "micro-free": "Free",    "micro-shield": "2,499 SAR/year" },
      { feature: "Effective monthly cost",        "micro-free": "Zero",    "micro-shield": "~208 SAR/month" },
      { feature: "Compare: one lawyer hour",      "micro-free": "500+ SAR","micro-shield": "Full year at 2,499" },
      { feature: "Litigation activates after",    "micro-free": "-",       "micro-shield": "60 days" },
    ]},
  ],
};
