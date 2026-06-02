import { Brain, ShieldCheck, Scales, Gavel } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Plans: Government (B2G — Enterprise Licensing) ───────────────────────────
// Government entities use institutional licensing, not consumer SaaS subscriptions.
// The "free" tier enables trial/evaluation; paid tiers are sales-led with annual contracts.
export const plansGovernment: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "gov-eval", name: "تقييم حكومي", badge: null,
      priceMonthly: "مجاني", priceYearly: "مجاني", periodMonthly: "", periodYearly: "",
      desc: "وصول محدود لتقييم المنصة قبل التعاقد الرسمي", target: "إدارات قانونية", cta: "ابدأ التقييم",
      ctaHref: "/register/client?type=government", highlighted: false, color: "border-slate-200/50",
      features: {
        ai: ["أدوات الذكاء الاصطناعي: ٥ استخدامات / شهر", "أداة واحدة فقط حسب الدور", null, null],
        platform: ["حساب مستخدم واحد", "لوحة التحكم الأساسية", "القضايا والعقود (حتى ١٠)", null],
        support: ["دعم عبر البريد الإلكتروني", null],
      },
    },
    {
      id: "gov-department", name: "الإدارة القانونية", badge: "ترخيص سنوي",
      priceMonthly: "تواصل معنا", priceYearly: "تواصل معنا", periodMonthly: "عقد سنوي", periodYearly: "عقد سنوي",
      desc: "ترخيص لإدارة قانونية واحدة داخل الجهة الحكومية", target: "إدارات قانونية", cta: "طلب عرض سعر",
      ctaHref: "/contact?type=government&plan=department", highlighted: true, color: "border-sky-200/60",
      features: {
        ai: ["جميع أدوات الذكاء الاصطناعي حسب الدور", "صائغ الأحكام + المنطوق (القاضي)", "صائغ لوائح الاتهام (النيابة)", "مراجع العقود الحكومية (المستشار)"],
        platform: ["حتى ١٠ مستخدمين", "لوحة تحكم كاملة + تقارير", "إدارة القضايا والعقود (حسب العقد)", "رادار الامتثال التفاعلي"],
        support: ["دعم فني أولوية", "تدريب عن بُعد (٤ ساعات)"],
      },
    },
    {
      id: "gov-enterprise", name: "الترخيص المؤسسي", badge: "عقد حكومي ⭐",
      priceMonthly: "تواصل معنا", priceYearly: "تواصل معنا", periodMonthly: "عقد سنوي", periodYearly: "عقد سنوي",
      desc: "ترخيص شامل للجهة الحكومية بالكامل — قضاة ومحققون ومستشارون", target: "جهات حكومية كبرى", cta: "تواصل مع فريق المبيعات",
      ctaHref: "/contact?type=government&plan=enterprise", highlighted: false, color: "border-amber-200/30",
      features: {
        ai: ["جميع أدوات AI (١٩+ أداة متخصصة)", "نماذج مخصصة للجهة", "واجهة API للربط مع الأنظمة الداخلية", "تقارير AI تلقائية"],
        platform: ["حتى ١٠٠ مستخدم", "أدوار فرعية (قاضي/نيابة/ضابط/مستشار)", "لوحة إدارة مركزية", "ربط SSO + Active Directory"],
        support: ["مدير حساب حكومي مخصص", "دعم على مدار الساعة", "تدريب ميداني + توثيق مخصص"],
      },
    },
  ],
  en: [
    {
      id: "gov-eval", name: "Government Evaluation", badge: null,
      priceMonthly: "Free", priceYearly: "Free", periodMonthly: "", periodYearly: "",
      desc: "Limited access for platform evaluation before formal contracting", target: "Legal Departments", cta: "Start Evaluation",
      ctaHref: "/register/client?type=government", highlighted: false, color: "border-slate-200/50",
      features: {
        ai: ["AI Tools: 5 uses / month", "One tool per role only", null, null],
        platform: ["Single user account", "Basic dashboard", "Cases & Contracts (up to 10)", null],
        support: ["Email support", null],
      },
    },
    {
      id: "gov-department", name: "Legal Department", badge: "Annual License",
      priceMonthly: "Contact Us", priceYearly: "Contact Us", periodMonthly: "Annual Contract", periodYearly: "Annual Contract",
      desc: "License for a single legal department within a government entity", target: "Legal Departments", cta: "Request Quote",
      ctaHref: "/contact?type=government&plan=department", highlighted: true, color: "border-sky-200/60",
      features: {
        ai: ["All AI tools per role", "Judgment + Verdict Drafter (Judge)", "Indictment Drafter (Prosecutor)", "Government Contract Reviewer (Counsel)"],
        platform: ["Up to 10 users", "Full dashboard + reports", "Cases & contracts: per contract", "Interactive compliance radar"],
        support: ["Priority support", "Remote training (4 hours)"],
      },
    },
    {
      id: "gov-enterprise", name: "Enterprise License", badge: "Government Contract ⭐",
      priceMonthly: "Contact Us", priceYearly: "Contact Us", periodMonthly: "Annual Contract", periodYearly: "Annual Contract",
      desc: "Full institutional license — judges, prosecutors, officers, and counsel", target: "Large Government Entities", cta: "Contact Sales Team",
      ctaHref: "/contact?type=government&plan=enterprise", highlighted: false, color: "border-amber-200/30",
      features: {
        ai: ["All AI tools (19+ specialized)", "Custom models for the entity", "API integration with internal systems", "Automated AI reports"],
        platform: ["Up to 100 users", "Sub-roles (Judge/Prosecutor/Officer/Counsel)", "Central admin dashboard", "SSO + Active Directory integration"],
        support: ["Dedicated government account manager", "24/7 support", "On-site training + custom documentation"],
      },
    },
  ],
};

// ─── Comparison Tables: Government ────────────────────────────────────────────
export const comparisonGovernment: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "أدوات الذكاء الاصطناعي", icon: Brain, rows: [
      { feature: "أدوات AI المتاحة",              "gov-eval": "أداة واحدة",     "gov-department": "الكل حسب الدور", "gov-enterprise": "الكل + مخصصة" },
      { feature: "عدد الاستخدامات",               "gov-eval": "٥/شهر",          "gov-department": "حسب العقد",       "gov-enterprise": "حسب العقد" },
      { feature: "صائغ الأحكام / المنطوق",        "gov-eval": false,            "gov-department": true,              "gov-enterprise": true },
      { feature: "صائغ لوائح الاتهام",             "gov-eval": false,            "gov-department": true,              "gov-enterprise": true },
      { feature: "واجهة API للأنظمة الداخلية",    "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
    ]},
    { category: "الأمن والحوكمة", icon: ShieldCheck, rows: [
      { feature: "عدد المستخدمين",                 "gov-eval": "١",              "gov-department": "حتى ١٠",          "gov-enterprise": "حتى ١٠٠" },
      { feature: "أدوار فرعية (RBAC)",             "gov-eval": "أساسي",          "gov-department": true,              "gov-enterprise": true },
      { feature: "SSO / Active Directory",          "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
      { feature: "رادار الامتثال",                 "gov-eval": false,            "gov-department": "تفاعلي",          "gov-enterprise": "آلي + تصدير" },
    ]},
    { category: "الدعم والتدريب", icon: Gavel, rows: [
      { feature: "الدعم الفني",                    "gov-eval": "بريد إلكتروني",  "gov-department": "أولوية",           "gov-enterprise": "٢٤/٧" },
      { feature: "التدريب",                         "gov-eval": false,            "gov-department": "عن بُعد",          "gov-enterprise": "ميداني + مخصص" },
      { feature: "مدير حساب",                       "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
    ]},
  ],
  en: [
    { category: "AI Tools", icon: Brain, rows: [
      { feature: "Available AI Tools",               "gov-eval": "One tool",       "gov-department": "All per role",     "gov-enterprise": "All + Custom" },
      { feature: "Usage Limit",                      "gov-eval": "5/month",        "gov-department": "Per contract",     "gov-enterprise": "Per contract" },
      { feature: "Judgment / Verdict Drafter",       "gov-eval": false,            "gov-department": true,              "gov-enterprise": true },
      { feature: "Indictment Drafter",               "gov-eval": false,            "gov-department": true,              "gov-enterprise": true },
      { feature: "API for Internal Systems",         "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
    ]},
    { category: "Security & Governance", icon: ShieldCheck, rows: [
      { feature: "Number of Users",                  "gov-eval": "1",              "gov-department": "Up to 10",        "gov-enterprise": "Up to 100" },
      { feature: "Sub-Roles (RBAC)",                 "gov-eval": "Basic",          "gov-department": true,              "gov-enterprise": true },
      { feature: "SSO / Active Directory",           "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
      { feature: "Compliance Radar",                 "gov-eval": false,            "gov-department": "Interactive",     "gov-enterprise": "Auto + Export" },
    ]},
    { category: "Support & Training", icon: Gavel, rows: [
      { feature: "Technical Support",                "gov-eval": "Email",          "gov-department": "Priority",        "gov-enterprise": "24/7" },
      { feature: "Training",                          "gov-eval": false,            "gov-department": "Remote",          "gov-enterprise": "On-site + Custom" },
      { feature: "Account Manager",                   "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
    ]},
  ],
};
