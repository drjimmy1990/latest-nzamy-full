import { Brain, Gavel, Users, ShieldCheck, Lightning, Star, Fire, Crown } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Credits Packages: Lawyers ────────────────────────────────────────────────
// Model: pay-per-use credits. No monthly subscription.
// 1 SAR = 1 point at base rate. Bonuses apply per package tier.
// Validity: 6 months (Royal: 12 months)

export const plansLawyers: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "lawyer-basic", name: "الأساسية", badge: null,
      priceMonthly: "١٬٠٠٠", priceYearly: "١٬٠٠٠", periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "١٬٥٠٠ نقطة — بونص +٥٠٪", target: "مستقل", bonusLabel: "+٥٠٪ نقاط مجانية",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=basic-credits", highlighted: false, color: "border-blue-200/60",
      features: {
        ai: [
          "١٬٥٠٠ نقطة (تدفع ١٬٠٠٠ وتستلم ١٬٥٠٠)",
          "مذكرة ثانية مجانية بعد أول شحن",
          "المكتبة الكاملة: ٥٠ نقطة/شهر",
          "سؤال قانوني سريع: ٢٠ نقطة",
        ],
        platform: ["Kanban + تقويم (رصيد ≥ ٥٠٠)", "نشر في السوق (رصيد ≥ ٥٠٠)"],
        support: ["دعم بريد إلكتروني"],
      },
    },
    {
      id: "lawyer-advanced", name: "المتقدمة", badge: "الأكثر اختياراً",
      priceMonthly: "٢٬٥٠٠", priceYearly: "٢٬٥٠٠", periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٥٬٠٠٠ نقطة — بونص +١٠٠٪", target: "محامون", bonusLabel: "+١٠٠٪ نقاط مجانية",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=advanced-credits", highlighted: true, color: "border-royal/20",
      features: {
        ai: [
          "٥٬٠٠٠ نقطة (تدفع ٢٬٥٠٠ وتستلم ٥٬٠٠٠)",
          "مذكرة ثانية مجانية بعد أول شحن",
          "المكتبة الكاملة: ٥٠ نقطة/شهر",
          "سؤال سريع (٢٠ نقطة) + ترجمة قانونية (٥٠ نقطة)",
          "صلاحية ٦ أشهر",
        ],
        platform: ["Kanban + تقويم + السوق (رصيد ≥ ٥٠٠)"],
        support: ["دعم واتساب"],
      },
    },
    {
      id: "lawyer-elite", name: "النخبة", badge: null,
      priceMonthly: "٥٬٠٠٠", priceYearly: "٥٬٠٠٠", periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "١٢٬٥٠٠ نقطة — بونص +١٥٠٪", target: "مكاتب", bonusLabel: "+١٥٠٪ نقاط مجانية",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=elite-credits", highlighted: false, color: "border-emerald-200/60",
      features: {
        ai: [
          "١٢٬٥٠٠ نقطة (تدفع ٥٬٠٠٠ وتستلم ١٢٬٥٠٠)",
          "المكتبة الكاملة: ٥٠ نقطة/شهر",
          "السكرتير الذكي + راصد التشريعات",
          "صياغة من نموذج + الأرشيف السحابي",
          "صلاحية ٦ أشهر",
        ],
        platform: ["Kanban + تقويم + السوق", "فريق: حتى ٣ أشخاص (٤٩ ر.س/مستخدم/شهر)"],
        support: ["واتساب أولوية ٢٤/٧"],
      },
    },
    {
      id: "lawyer-royal", name: "الملكية", badge: "الأوفر قيمة",
      priceMonthly: "١٠٬٠٠٠", priceYearly: "١٠٬٠٠٠", periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٣٠٬٠٠٠ نقطة — بونص +٢٠٠٪", target: "مكاتب متوسطة", bonusLabel: "+٢٠٠٪ نقاط مجانية",
      cta: "انضم الآن", ctaHref: "/register/provider?plan=royal-credits", highlighted: false, color: "border-gold/20",
      features: {
        ai: [
          "٣٠٬٠٠٠ نقطة (تدفع ١٠٬٠٠٠ وتستلم ٣٠٬٠٠٠)",
          "المكتبة الكاملة: ٥٠ نقطة/شهر",
          "السكرتير الذكي + راصد التشريعات",
          "صياغة من نموذج + الأرشيف السحابي",
          "صلاحية ١٢ شهراً",
        ],
        platform: ["Kanban + تقويم + السوق", "فريق: حتى ٣ + ٤٩ ر.س/مستخدم/شهر", "Top Listing في السوق"],
        support: ["VIP واتساب مباشر", "مدير حساب شخصي"],
      },
    },
  ],
  en: [
    {
      id: "lawyer-basic", name: "Basic", badge: null,
      priceMonthly: "1,000", priceYearly: "1,000", periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "1,500 points — +50% bonus", target: "Independent", bonusLabel: "+50% Free Points",
      cta: "Top Up Now", ctaHref: "/register/provider?plan=basic-credits", highlighted: false, color: "border-blue-200/60",
      features: {
        ai: [
          "1,500 points (pay 1,000 receive 1,500)",
          "2nd free brief after first top-up",
          "Full Library: 50 pts/month",
          "Quick question: 20 pts",
        ],
        platform: ["Kanban + calendar (balance ≥ 500)", "Marketplace posting (balance ≥ 500)"],
        support: ["Email support"],
      },
    },
    {
      id: "lawyer-advanced", name: "Advanced", badge: "Most Popular",
      priceMonthly: "2,500", priceYearly: "2,500", periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "5,000 points — +100% bonus", target: "Lawyers", bonusLabel: "+100% Free Points",
      cta: "Top Up Now", ctaHref: "/register/provider?plan=advanced-credits", highlighted: true, color: "border-royal/20",
      features: {
        ai: [
          "5,000 points (pay 2,500 receive 5,000)",
          "2nd free brief after first top-up",
          "Full Library: 50 pts/month",
          "Quick question (20 pts) + Legal translation (50 pts)",
          "6-month validity",
        ],
        platform: ["Kanban + calendar + marketplace (≥500 balance)"],
        support: ["WhatsApp support"],
      },
    },
    {
      id: "lawyer-elite", name: "Elite", badge: null,
      priceMonthly: "5,000", priceYearly: "5,000", periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "12,500 points — +150% bonus", target: "Firms", bonusLabel: "+150% Free Points",
      cta: "Top Up Now", ctaHref: "/register/provider?plan=elite-credits", highlighted: false, color: "border-emerald-200/60",
      features: {
        ai: [
          "12,500 points (pay 5,000 receive 12,500)",
          "Full Library: 50 pts/month",
          "Smart Secretary + Legislation Monitor",
          "Template drafting + Cloud Archive",
          "6-month validity",
        ],
        platform: ["Kanban + calendar + marketplace", "Team: up to 3 (SAR 49/user/month)"],
        support: ["Priority WhatsApp 24/7"],
      },
    },
    {
      id: "lawyer-royal", name: "Royal", badge: "Best Value",
      priceMonthly: "10,000", priceYearly: "10,000", periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "30,000 points — +200% bonus", target: "Mid-size Firms", bonusLabel: "+200% Free Points",
      cta: "Join Now", ctaHref: "/register/provider?plan=royal-credits", highlighted: false, color: "border-gold/20",
      features: {
        ai: [
          "30,000 points (+200% bonus)",
          "Reply brief = SAR 167 | Appeal = SAR 333",
          "Cassation = SAR 500 | Due Diligence = SAR 1,667",
          "Simple contract = SAR 167 | Detailed = SAR 333",
          "Full Library: 50 pts/month",
          "Smart Secretary + Legislation Monitor",
          "Template drafting + Cloud Archive",
        ],
        platform: ["All infrastructure features", "Team: up to 3 + SAR 49/user/month", "12-month validity", "Top Listing"],
        support: ["Direct VIP WhatsApp", "Dedicated account manager"],
      },
    },
  ],
};

// ─── Product Pricing Table (Points Reference) ─────────────────────────────────
export const lawyerProductPricing = {
  ar: [
    { category: "مذكرات قانونية", items: [
      { name: "مذكرة رد / جوابية / إلحاقية / ختامية", points: 500 },
      { name: "مذكرة استئناف", points: 1000 },
      { name: "مذكرة نقض / التماس", points: 1500 },
    ]},
    { category: "عقود", items: [
      { name: "عقد مبسط (٣ صفحات)", points: 500 },
      { name: "عقد تفصيلي بلغتين", points: 1000 },
      { name: "تقرير عناية واجبة", points: 5000 },
    ]},
    { category: "أدوات تحليلية", items: [
      { name: "الرأي الفصل — دراسة قانونية", points: 800 },
      { name: "الرأي الفصل — مذكرة رأي", points: 400 },
      { name: "عصارة المرفقات", points: 300 },
      { name: "مُولّد أسئلة الاستجواب", points: 150 },
      { name: "الرأي الفصل — استشارة", points: 100 },
      { name: "داعم الاتجاه", points: 100 },
      { name: "الرأي الفصل — خطاب رسمي", points: 50 },
    ]},
    { category: "أدوات مساعدة", items: [
      { name: "المترجم القانوني", points: 50 },
      { name: "المحاكي الشامل (جلسة)", points: 30 },
      { name: "سؤال قانوني سريع", points: 20 },
      { name: "ParaLegal — إحاطة", points: 20 },
      { name: "المفرّغ الذكي (جلسة)", points: 10 },
      { name: "منقح ناجز", points: 10 },
      { name: "المقارن الذكي", points: 5 },
      { name: "السكرتير الذكي (تنظيم/تذكير)", points: 5 },
      { name: "راصد التشريعات (تنبيه مخصص)", points: 10 },
      { name: "صياغة مستند من نموذج", points: 50 },
      { name: "الأرشيف السحابي (سعة إضافية)", points: 50 },
    ]},
    { category: "مجاني دائماً", items: [
      { name: "المرشد القضائي", points: 0 },
      { name: "الحاسبة القانونية", points: 0 },
      { name: "المجمّع البحثي", points: 0 },
    ]},
  ],
};

// ─── Services Catalog Table — shown BELOW plan cards ───────────────────────────
// Points column = base cost (1 pt = 1 SAR when buying direct, no package)
// Displayed as informational reference; no per-plan pricing here.
export interface ServiceRow {
  name: string;
  points: number;
  baseSAR: string;  // price at 1 SAR/pt (no package)
  marketSAR?: string; // typical market price outside Nzamy
  note?: string;
}
export interface ServiceCategory {
  category: string;
  emoji: string;
  color: string;   // tailwind text colour class
  items: ServiceRow[];
}

export const lawyerServicesTable: ServiceCategory[] = [
  {
    category: "مذكرات قانونية",
    emoji: "📋",
    color: "text-blue-400",
    items: [
      { name: "مذكرة رد / جوابية / إلحاقية / ختامية", points: 500,  baseSAR: "٥٠٠", note: "مذكرة مجانية عند التسجيل 🎁" },
      { name: "مذكرة استئناف",                          points: 1000, baseSAR: "١٬٠٠٠" },
      { name: "مذكرة نقض / التماس",                    points: 1500, baseSAR: "١٬٥٠٠" },
    ],
  },
  {
    category: "عقود ومستندات",
    emoji: "📝",
    color: "text-emerald-400",
    items: [
      { name: "عقد مبسط (٣ صفحات)",         points: 500,  baseSAR: "٥٠٠" },
      { name: "عقد تفصيلي بلغتين",           points: 1000, baseSAR: "١٬٠٠٠" },
      { name: "صياغة مستند من نموذج",        points: 50,   baseSAR: "٥٠" },
      { name: "تقرير عناية واجبة (DD)",       points: 5000, baseSAR: "٥٬٠٠٠", note: "٩ أقسام شاملة" },
    ],
  },
  {
    category: "أدوات التحليل القانوني",
    emoji: "🔍",
    color: "text-amber-400",
    items: [
      { name: "الرأي الفصل — دراسة قانونية",   points: 800, baseSAR: "٨٠٠" },
      { name: "الرأي الفصل — مذكرة رأي",        points: 400, baseSAR: "٤٠٠" },
      { name: "عصارة المرفقات",                  points: 300, baseSAR: "٣٠٠" },
      { name: "مُولّد أسئلة الاستجواب",           points: 150, baseSAR: "١٥٠" },
      { name: "الرأي الفصل — استشارة",           points: 100, baseSAR: "١٠٠" },
      { name: "داعم الاتجاه (طلب)",               points: 100, baseSAR: "١٠٠" },
      { name: "الرأي الفصل — خطاب رسمي",        points: 50,  baseSAR: "٥٠" },
    ],
  },
  {
    category: "أدوات مساعدة",
    emoji: "⚡",
    color: "text-purple-400",
    items: [
      { name: "المترجم القانوني",                   points: 50, baseSAR: "٥٠" },
      { name: "المحاكي الشامل (جلسة)",             points: 30, baseSAR: "٣٠" },
      { name: "سؤال قانوني سريع",                  points: 20, baseSAR: "٢٠" },
      { name: "ParaLegal — إحاطة",                  points: 20, baseSAR: "٢٠" },
      { name: "راصد التشريعات (تنبيه مخصص)",      points: 10, baseSAR: "١٠" },
      { name: "المفرّغ الذكي (جلسة)",               points: 10, baseSAR: "١٠" },
      { name: "منقح ناجز",                          points: 10, baseSAR: "١٠" },
      { name: "الأرشيف السحابي (سعة إضافية)",     points: 50, baseSAR: "٥٠" },
      { name: "المقارن الذكي",                      points: 5,  baseSAR: "٥" },
      { name: "السكرتير الذكي (تنظيم / تذكير)",   points: 5,  baseSAR: "٥" },
    ],
  },
  {
    category: "مجاني دائماً ✅",
    emoji: "🎁",
    color: "text-green-400",
    items: [
      { name: "المرشد القضائي",       points: 0, baseSAR: "مجاني" },
      { name: "الحاسبة القانونية",    points: 0, baseSAR: "مجاني" },
      { name: "المجمّع البحثي",       points: 0, baseSAR: "مجاني" },
      { name: "المجتمع القانوني",     points: 0, baseSAR: "مجاني" },
      { name: "المكتبة الأساسية (نظام المرافعات + الإثبات)", points: 0, baseSAR: "مجاني" },
    ],
  },
];

// ─── Comparison Table ─────────────────────────────────────────────────────────
export const comparisonLawyers: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "باقات النقاط", icon: Lightning, rows: [
      { feature: "النقاط المحصّلة",        "lawyer-free": "—",         "lawyer-basic": "١٬٥٠٠",   "lawyer-advanced": "٥٬٠٠٠",  "lawyer-elite": "١٢٬٥٠٠", "lawyer-royal": "٣٠٬٠٠٠" },
      { feature: "البونص",                 "lawyer-free": "—",         "lawyer-basic": "+٥٠٪",    "lawyer-advanced": "+١٠٠٪",  "lawyer-elite": "+١٥٠٪",  "lawyer-royal": "+٢٠٠٪" },
      { feature: "سعر النقطة",             "lawyer-free": "—",         "lawyer-basic": "٠٫٦٧ ر.س","lawyer-advanced": "٠٫٥٠ ر.س","lawyer-elite": "٠٫٤٠ ر.س","lawyer-royal": "٠٫٣٣ ر.س" },
      { feature: "صلاحية النقاط",          "lawyer-free": "—",         "lawyer-basic": "٦ أشهر",  "lawyer-advanced": "٦ أشهر", "lawyer-elite": "٦ أشهر", "lawyer-royal": "١٢ شهراً" },
    ]},
    { category: "أسعار المنتجات", icon: Gavel, rows: [
      { feature: "مذكرة رد (٥٠٠ نقطة)",    "lawyer-free": "٥٠٠ ر.س",  "lawyer-basic": "٣٣٣ ر.س", "lawyer-advanced": "٢٥٠ ر.س ✅","lawyer-elite": "٢٠٠ ر.س","lawyer-royal": "١٦٧ ر.س" },
      { feature: "استئناف (١٬٠٠٠ نقطة)",   "lawyer-free": "١٬٠٠٠ ر.س","lawyer-basic": "٦٦٧ ر.س", "lawyer-advanced": "٥٠٠ ر.س", "lawyer-elite": "٤٠٠ ر.س","lawyer-royal": "٣٣٣ ر.س" },
      { feature: "نقض/التماس (١٬٥٠٠ نقطة)","lawyer-free": "١٬٥٠٠ ر.س","lawyer-basic": "١٬٠٠٠ ر.س","lawyer-advanced": "٧٥٠ ر.س", "lawyer-elite": "٦٠٠ ر.س","lawyer-royal": "٥٠٠ ر.س" },
      { feature: "عقد مبسط (٥٠٠ نقطة)",    "lawyer-free": "٥٠٠ ر.س",  "lawyer-basic": "٣٣٣ ر.س", "lawyer-advanced": "٢٥٠ ر.س", "lawyer-elite": "٢٠٠ ر.س","lawyer-royal": "١٦٧ ر.س" },
      { feature: "عناية واجبة (٥٬٠٠٠ نقطة)","lawyer-free":"٥٬٠٠٠ ر.س","lawyer-basic": "٣٬٣٣٣ ر.س","lawyer-advanced": "٢٬٥٠٠ ر.س","lawyer-elite": "٢٬٠٠٠ ر.س","lawyer-royal": "١٬٦٦٧ ر.س" },
    ]},
    { category: "الأدوات والمزايا", icon: Brain, rows: [
      { feature: "مذكرة مجانية عند التسجيل","lawyer-free": true,        "lawyer-basic": true,       "lawyer-advanced": true,     "lawyer-elite": true,     "lawyer-royal": true },
      { feature: "مذكرة ثانية مجانية",       "lawyer-free": false,       "lawyer-basic": true,       "lawyer-advanced": true,     "lawyer-elite": true,     "lawyer-royal": true },
      { feature: "المكتبة الكاملة",          "lawyer-free": "مرافعات+إثبات","lawyer-basic":"٥٠ نقطة/شهر","lawyer-advanced":"٥٠ نقطة/شهر","lawyer-elite":"٥٠ نقطة/شهر","lawyer-royal":"٥٠ نقطة/شهر" },
      { feature: "Kanban + تقويم + سوق",     "lawyer-free": false,       "lawyer-basic": "رصيد ≥ ٥٠٠","lawyer-advanced": "رصيد ≥ ٥٠٠","lawyer-elite": "رصيد ≥ ٥٠٠","lawyer-royal": "رصيد ≥ ٥٠٠" },
    ]},
    { category: "الفريق والدعم", icon: Users, rows: [
      { feature: "أعضاء الفريق (الإضافي ٤٩ ر.س/شهر)","lawyer-free":"—","lawyer-basic": "—",       "lawyer-advanced": "—",      "lawyer-elite": "حتى ٣",  "lawyer-royal": "حتى ٣" },
      { feature: "Top Listing في السوق",     "lawyer-free": false,       "lawyer-basic": false,      "lawyer-advanced": false,    "lawyer-elite": false,    "lawyer-royal": true },
      { feature: "الدعم",                    "lawyer-free": "بريد",      "lawyer-basic": "بريد",     "lawyer-advanced": "واتساب", "lawyer-elite": "واتساب ٢٤/٧","lawyer-royal": "VIP + مدير حساب" },
    ]},
  ],
  en: [
    { category: "Credit Packages", icon: Lightning, rows: [
      { feature: "Points received",    "lawyer-free": "—",      "lawyer-basic": "1,500",    "lawyer-advanced": "5,000",   "lawyer-elite": "12,500",  "lawyer-royal": "30,000" },
      { feature: "Bonus",              "lawyer-free": "—",      "lawyer-basic": "+50%",     "lawyer-advanced": "+100%",   "lawyer-elite": "+150%",   "lawyer-royal": "+200%" },
      { feature: "Point cost",         "lawyer-free": "—",      "lawyer-basic": "SAR 0.67", "lawyer-advanced": "SAR 0.50","lawyer-elite": "SAR 0.40","lawyer-royal": "SAR 0.33" },
      { feature: "Validity",           "lawyer-free": "—",      "lawyer-basic": "6 months", "lawyer-advanced": "6 months","lawyer-elite": "6 months","lawyer-royal": "12 months" },
    ]},
    { category: "Product Prices", icon: Gavel, rows: [
      { feature: "Reply brief (500 pts)",     "lawyer-free": "SAR 500",   "lawyer-basic": "SAR 333",  "lawyer-advanced": "SAR 250 ✅","lawyer-elite": "SAR 200","lawyer-royal": "SAR 167" },
      { feature: "Appeal (1,000 pts)",        "lawyer-free": "SAR 1,000", "lawyer-basic": "SAR 667",  "lawyer-advanced": "SAR 500",  "lawyer-elite": "SAR 400","lawyer-royal": "SAR 333" },
      { feature: "Cassation (1,500 pts)",     "lawyer-free": "SAR 1,500", "lawyer-basic": "SAR 1,000","lawyer-advanced": "SAR 750",  "lawyer-elite": "SAR 600","lawyer-royal": "SAR 500" },
      { feature: "Due Diligence (5,000 pts)", "lawyer-free": "SAR 5,000", "lawyer-basic": "SAR 3,333","lawyer-advanced": "SAR 2,500","lawyer-elite": "SAR 2,000","lawyer-royal":"SAR 1,667" },
    ]},
    { category: "Features", icon: Brain, rows: [
      { feature: "Free brief on signup",      "lawyer-free": true,  "lawyer-basic": true,  "lawyer-advanced": true,  "lawyer-elite": true,  "lawyer-royal": true },
      { feature: "2nd free brief after top-up","lawyer-free": false, "lawyer-basic": true,  "lawyer-advanced": true,  "lawyer-elite": true,  "lawyer-royal": true },
      { feature: "Full legal library",        "lawyer-free": "Basic laws","lawyer-basic":"50 pts/mo","lawyer-advanced":"50 pts/mo","lawyer-elite":"50 pts/mo","lawyer-royal":"50 pts/mo" },
      { feature: "Kanban + calendar + market","lawyer-free": false, "lawyer-basic": "≥500 balance","lawyer-advanced":"≥500 balance","lawyer-elite":"≥500 balance","lawyer-royal":"≥500 balance" },
    ]},
    { category: "Team & Support", icon: Users, rows: [
      { feature: "Team members (SAR 49/mo each)","lawyer-free":"—","lawyer-basic":"—","lawyer-advanced":"—","lawyer-elite":"up to 3","lawyer-royal":"up to 3" },
      { feature: "Top Listing",               "lawyer-free": false, "lawyer-basic": false, "lawyer-advanced": false, "lawyer-elite": false, "lawyer-royal": true },
      { feature: "Support",                   "lawyer-free": "Email","lawyer-basic":"Email","lawyer-advanced":"WhatsApp","lawyer-elite":"WhatsApp 24/7","lawyer-royal":"VIP + Account Mgr" },
    ]},
  ],
};
