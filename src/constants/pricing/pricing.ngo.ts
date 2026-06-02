import { Brain, Heart, ShieldCheck, FileText } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Plans: NGO / Non-Profit Organizations ────────────────────────────────────
export const plansNgo: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "ngo-free", name: "جمعية ناشئة", badge: null,
      priceMonthly: "مجاني", priceYearly: "مجاني", periodMonthly: "", periodYearly: "",
      desc: "إدارة أساسية للمتطوعين والتبرعات لدعم القطاع الثالث", target: "جمعيات ناشئة", cta: "سجّل جمعيتك مجاناً",
      ctaHref: "/register/client?type=ngo", highlighted: false, color: "border-slate-200/50",
      features: {
        ai: ["المستشار الذكي: ٣ استفسارات / أسبوع", null, null, null],
        platform: ["إدارة المتطوعين (حتى ٥٠ متطوع)", "سجل التبرعات والماليات الأساسي", "رادار الامتثال (تنبيهات فقط)", null],
        support: ["دعم مجتمعي عبر المنتدى", null],
      },
    },
    {
      id: "ngo-impact", name: "الأثر المستدام", badge: "~١٩٩ ر.س / شهر",
      priceMonthly: "٢,٣٨٨", priceYearly: "٢,٣٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "أدوات الذكاء الاصطناعي لرفع كفاءة الحوكمة والتشغيل", target: "جمعيات متوسطة", cta: "ارتقِ بالجمعية",
      ctaHref: "/register/client?type=ngo&plan=impact", highlighted: true, color: "border-emerald-200/60",
      features: {
        ai: ["المستشار الذكي: ٥٠/أسبوع", "صائغ عقود التطوع AI", "محلل التبرعات والبيانات المالية", null],
        platform: ["إدارة المتطوعين (حتى ٥٠٠)", "تصدير التقارير الربعية (مسودة)", "رادار الامتثال التفاعلي", "خصم ١٥٪ على استشارات المحامين"],
        support: ["دعم فني أولوية عبر البريد", null],
      },
    },
    {
      id: "ngo-institutional", name: "التميز المؤسسي", badge: "~٤٩٩ ر.س / شهر ⭐",
      priceMonthly: "٥,٩٨٨", priceYearly: "٥,٩٨8", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "حوكمة كاملة وتقارير تلقائية للمراكز الرقابية", target: "مؤسسات كبرى", cta: "تواصل للمؤسسات",
      ctaHref: "/register/client?type=ngo&plan=institutional", highlighted: false, color: "border-royal/20",
      features: {
        ai: ["جميع قدرات AI للجمعيات", "مدقق الحوكمة الذكي (المركز الوطني)", "مُعد التقارير السنوية AI", "مراجعة عقود الشراكات"],
        platform: ["لوحة تحكم إدارية متقدمة", "ربط مباشر مع مكاتب المحاماة", "إعداد تلقائي لتقرير الشفافية", null],
        support: ["مدير حساب مخصص", "دعم على مدار الساعة"],
      },
    },
  ],
  en: [
    {
      id: "ngo-free", name: "Startup NGO", badge: null,
      priceMonthly: "Free", priceYearly: "Free", periodMonthly: "", periodYearly: "",
      desc: "Basic management for volunteers and donations", target: "New NGOs", cta: "Sign Up Free",
      ctaHref: "/register/client?type=ngo", highlighted: false, color: "border-slate-200/50",
      features: {
        ai: ["AI Consultant: 3 queries / week", null, null, null],
        platform: ["Volunteer management (up to 50)", "Basic donation ledger", "Compliance radar (alerts only)", null],
        support: ["Community forum support", null],
      },
    },
    {
      id: "ngo-impact", name: "Sustainable Impact", badge: "~199 SAR/mo",
      priceMonthly: "2,388", priceYearly: "2,388", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "AI tools to elevate governance and operations", target: "Mid-size NGOs", cta: "Upgrade NGO",
      ctaHref: "/register/client?type=ngo&plan=impact", highlighted: true, color: "border-emerald-200/60",
      features: {
        ai: ["AI Consultant: 50/week", "AI Volunteer Contract Drafter", "Donation & Finance Analyzer", null],
        platform: ["Up to 500 volunteers", "Quarterly reports export", "Interactive compliance radar", "15% discount on lawyer consults"],
        support: ["Priority email support", null],
      },
    },
    {
      id: "ngo-institutional", name: "Institutional Excellence", badge: "~499 SAR/mo ⭐",
      priceMonthly: "5,988", priceYearly: "5,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Full governance and automated regulatory reports", target: "Large Institutions", cta: "Contact Us",
      ctaHref: "/register/client?type=ngo&plan=institutional", highlighted: false, color: "border-royal/20",
      features: {
        ai: ["All NGO AI features", "Smart Governance Checker (NCNP)", "AI Annual Report Generator", "Partnership Contract Review"],
        platform: ["Advanced admin dashboard", "Direct connection to law firms", "Auto Transparency Report prep", null],
        support: ["Dedicated account manager", "24/7 priority support"],
      },
    },
  ],
};

// ─── Comparison Tables: NGO ───────────────────────────────────────────────────
export const comparisonNgo: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "أدوات الذكاء الاصطناعي", icon: Brain, rows: [
      { feature: "المستشار الذكي",                 "ngo-free": "٣/أسبوع", "ngo-impact": "٥٠/أسبوع",    "ngo-institutional": "١٠٠/أسبوع" },
      { feature: "صائغ عقود التطوع AI",            "ngo-free": false,     "ngo-impact": true,          "ngo-institutional": true },
      { feature: "محلل التبرعات والمالية",         "ngo-free": false,     "ngo-impact": true,          "ngo-institutional": true },
      { feature: "مدقق الحوكمة الذكي",             "ngo-free": false,     "ngo-impact": false,         "ngo-institutional": true },
      { feature: "مُعد التقارير التلقائي",         "ngo-free": false,     "ngo-impact": false,         "ngo-institutional": true },
    ]},
    { category: "الامتثال والإدارة", icon: ShieldCheck, rows: [
      { feature: "إدارة المتطوعين",                "ngo-free": "٥٠ كحد أقصى","ngo-impact": "حتى ٥٠٠",  "ngo-institutional": "حتى ١,٠٠٠ + تحليلات" },
      { feature: "رادار الامتثال والحوكمة",        "ngo-free": "تنبيهات",  "ngo-impact": "تفاعلي",      "ngo-institutional": "آلي + تصدير للجهات" },
      { feature: "سجل التبرعات",                   "ngo-free": "أساسي",    "ngo-impact": "متقدم",       "ngo-institutional": "متقدم + ربط محاسبي" },
    ]},
  ],
  en: [
    { category: "AI Tools", icon: Brain, rows: [
      { feature: "AI Consultant",                  "ngo-free": "3/week",  "ngo-impact": "50/week",   "ngo-institutional": "100/week" },
      { feature: "AI Volunteer Contract",          "ngo-free": false,     "ngo-impact": true,          "ngo-institutional": true },
      { feature: "Donation Analyzer",              "ngo-free": false,     "ngo-impact": true,          "ngo-institutional": true },
      { feature: "Smart Governance Checker",       "ngo-free": false,     "ngo-impact": false,         "ngo-institutional": true },
      { feature: "Auto Report Generator",          "ngo-free": false,     "ngo-impact": false,         "ngo-institutional": true },
    ]},
    { category: "Compliance & Management", icon: ShieldCheck, rows: [
      { feature: "Volunteer Management",           "ngo-free": "Up to 50", "ngo-impact": "Up to 500",  "ngo-institutional": "Up to 1,000 + Analytics" },
      { feature: "Compliance Radar",               "ngo-free": "Alerts",   "ngo-impact": "Interactive","ngo-institutional": "Auto + Export" },
      { feature: "Donation Ledger",                "ngo-free": "Basic",    "ngo-impact": "Advanced",   "ngo-institutional": "Advanced + Acc Sync" },
    ]},
  ],
};
