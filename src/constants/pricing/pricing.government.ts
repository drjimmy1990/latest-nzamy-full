import { Brain, ShieldCheck, Scales, Gavel } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Plans: Government (B2G — Enterprise Licensing) ───────────────────────────
// Government entities use institutional licensing, not consumer SaaS subscriptions.
// The "free" tier enables trial/evaluation; paid tiers are sales-led with annual contracts.
// Wave 1 task 6, fix round 1 (I6): every government AI tool (the judgment,
// verdict and indictment drafters, the contract reviewer, the other 19 gov
// tools) ends at the beta gate's "not available" card
// (src/constants/betaGatedRoutes.ts), so no licence sells them or a usage
// quota: one «قريباً» line, as in pricing.ngo.ts.
export const plansGovernment: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "gov-eval", name: "تقييم حكومي", badge: null,
      priceMonthly: "مجاني", priceYearly: "مجاني", periodMonthly: "", periodYearly: "",
      desc: "وصول محدود لتقييم المنصة قبل التعاقد الرسمي", target: "إدارات قانونية", cta: "ابدأ التقييم",
      ctaHref: "/register/client?type=government", highlighted: false, color: "border-slate-200/50",
      features: {
        ai: ["أدوات الذكاء الاصطناعي: قريباً", null, null, null],
        platform: ["حساب مستخدم واحد", "لوحة التحكم الأساسية", "القضايا والعقود (حتى ١٠)", null],
        support: ["دعم عبر البريد الإلكتروني", null],
      },
    },
    {
      id: "gov-department", name: "الإدارة القانونية", badge: "ترخيص سنوي",
      priceMonthly: "تواصل معنا", priceYearly: "تواصل معنا", periodMonthly: "عقد سنوي", periodYearly: "عقد سنوي",
      desc: "ترخيص لإدارة قانونية واحدة داخل الجهة الحكومية", target: "إدارات قانونية", cta: "طلب عرض سعر",
      ctaHref: "/contact?type=government&plan=department", highlighted: true, color: "border-sky-200/60 dark:border-sky-500/20",
      features: {
        ai: ["أدوات الذكاء الاصطناعي: قريباً", null, null, null],
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
        ai: ["أدوات الذكاء الاصطناعي: قريباً", "واجهة API للربط مع الأنظمة الداخلية", null, null],
        platform: ["حتى ١٠٠ مستخدم", "أدوار فرعية (قاضي/نيابة/ضابط/مستشار)", "لوحة إدارة مركزية", "ربط SSO + Active Directory"],
        support: ["مدير حساب حكومي مخصص", "تدريب ميداني + توثيق مخصص"],
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
        ai: ["AI tools: coming soon", null, null, null],
        platform: ["Single user account", "Basic dashboard", "Cases & Contracts (up to 10)", null],
        support: ["Email support", null],
      },
    },
    {
      id: "gov-department", name: "Legal Department", badge: "Annual License",
      priceMonthly: "Contact Us", priceYearly: "Contact Us", periodMonthly: "Annual Contract", periodYearly: "Annual Contract",
      desc: "License for a single legal department within a government entity", target: "Legal Departments", cta: "Request Quote",
      ctaHref: "/contact?type=government&plan=department", highlighted: true, color: "border-sky-200/60 dark:border-sky-500/20",
      features: {
        ai: ["AI tools: coming soon", null, null, null],
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
        ai: ["AI tools: coming soon", "API integration with internal systems", null, null],
        platform: ["Up to 100 users", "Sub-roles (Judge/Prosecutor/Officer/Counsel)", "Central admin dashboard", "SSO + Active Directory integration"],
        support: ["Dedicated government account manager", "On-site training + custom documentation"],
      },
    },
  ],
};

// ─── Comparison Tables: Government ────────────────────────────────────────────
export const comparisonGovernment: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "أدوات الذكاء الاصطناعي", icon: Brain, rows: [
      { feature: "أدوات AI (الصائغون والمراجعون)",  "gov-eval": "قريباً",         "gov-department": "قريباً",          "gov-enterprise": "قريباً" },
      { feature: "واجهة API للأنظمة الداخلية",    "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
    ]},
    { category: "الأمن والحوكمة", icon: ShieldCheck, rows: [
      { feature: "عدد المستخدمين",                 "gov-eval": "١",              "gov-department": "حتى ١٠",          "gov-enterprise": "حتى ١٠٠" },
      { feature: "أدوار فرعية (RBAC)",             "gov-eval": "أساسي",          "gov-department": true,              "gov-enterprise": true },
      { feature: "SSO / Active Directory",          "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
      { feature: "رادار الامتثال",                 "gov-eval": false,            "gov-department": "تفاعلي",          "gov-enterprise": "آلي + تصدير" },
    ]},
    { category: "الدعم والتدريب", icon: Gavel, rows: [
      { feature: "الدعم الفني",                    "gov-eval": "بريد إلكتروني",  "gov-department": "أولوية",           "gov-enterprise": "مدير حساب مخصص" },
      { feature: "التدريب",                         "gov-eval": false,            "gov-department": "عن بُعد",          "gov-enterprise": "ميداني + مخصص" },
      { feature: "مدير حساب",                       "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
    ]},
  ],
  en: [
    { category: "AI Tools", icon: Brain, rows: [
      { feature: "AI tools (drafters, reviewers)",   "gov-eval": "Soon",           "gov-department": "Soon",            "gov-enterprise": "Soon" },
      { feature: "API for Internal Systems",         "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
    ]},
    { category: "Security & Governance", icon: ShieldCheck, rows: [
      { feature: "Number of Users",                  "gov-eval": "1",              "gov-department": "Up to 10",        "gov-enterprise": "Up to 100" },
      { feature: "Sub-Roles (RBAC)",                 "gov-eval": "Basic",          "gov-department": true,              "gov-enterprise": true },
      { feature: "SSO / Active Directory",           "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
      { feature: "Compliance Radar",                 "gov-eval": false,            "gov-department": "Interactive",     "gov-enterprise": "Auto + Export" },
    ]},
    { category: "Support & Training", icon: Gavel, rows: [
      { feature: "Technical Support",                "gov-eval": "Email",          "gov-department": "Priority",        "gov-enterprise": "Dedicated account manager" },
      { feature: "Training",                          "gov-eval": false,            "gov-department": "Remote",          "gov-enterprise": "On-site + Custom" },
      { feature: "Account Manager",                   "gov-eval": false,            "gov-department": false,             "gov-enterprise": true },
    ]},
  ],
};
