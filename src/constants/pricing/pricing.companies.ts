import { Brain, Gavel, Users } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── COMPANIES WITHOUT LEGAL DEPT ─────────────────────────────────────────────
// الأغلى: نحن المكتب القانوني الكامل
// الخدمات: طلبات قانونية + مراجعة عقود + مكتبة + AI + سوق مهنيين
//          + استشارات + ترافع (بخصم وسقف مطالبة) + HR عقود موظفين
// ملاحظة: الترافع يعمل بنظام "خصم على الأتعاب + سقف مطالبة" وليس "قضايا مجانية"
//          لأن قضية تجارية واحدة قد تكلف ٥٠-٢٠٠ ألف ر.س
// Wave 1 task 6, fix round 1 (I6): CorpMind, Deal Intelligence, the
// compliance radar, the document and risk analysers, LegalMail, the HR
// advisor and the 360° health check are all beta-gated or «قريباً» pages
// (src/constants/betaGatedRoutes.ts, DashboardComingSoon), so no plan sells
// them or a quota of them: one «قريباً» line, as in pricing.ngo.ts. A
// contract-review quota keeps only its lawyer part.
export const plansCompanies: { ar: Plan[]; en: Plan[] } = {
  ar: [
    // ── شركة صغيرة (٦-٤٩) ─────────────────────────────
    { id: "biz-sm-basic", name: "أساسية", badge: "~٨٣٣ ر.س/شهر",
      priceMonthly: "٩,٩٨٨", priceYearly: "٩,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "مكتبة قانونية + طلبات قانونية + تنبيهات العقود — بدون ترافع أو استشارات", target: "شركات صغيرة", cta: "اشترك سنوياً",
      ctaHref: "/register/client?type=company", highlighted: false, color: "border-slate-200/50",
      companySize: "small", forLegalDept: false,
      features: {
        ai: [
          "أدوات الذكاء الاصطناعي: قريباً",
          "المكتبة القانونية الكاملة ✅",
          "تنبيهات انتهاء العقود ✅",
          null,
        ],
        platform: [
          "٣ مستخدمين",
          "طلبات قانونية: ٥/شهر",
          "سوق المهنيين (طلب محامٍ خارجي) ✅",
          "عقود الموظفين (HR): أساسي",
        ],
        support: [
          "استشارة محامٍ متخصص: ❌",
          "ترافع: خصم ١٠٪ على الأتعاب عند الحاجة",
        ],
      },
    },
    { id: "biz-sm-pro", name: "احترافية", badge: null,
      priceMonthly: "٢٤,٩٨٨", priceYearly: "٢٤,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "استشارات شهرية + ترافع بسقف + مراجعة عقود + Kanban", target: "شركات صغيرة", cta: "اشترك سنوياً",
      ctaHref: "/register/client?type=company", highlighted: true, color: "border-royal/20",
      companySize: "small", forLegalDept: false,
      features: {
        ai: [
          "أدوات الذكاء الاصطناعي: قريباً",
          "مراجعة عقود محامٍ: ٢/شهر",
          null,
          null,
        ],
        platform: [
          "٥ مستخدمين",
          "استشارات محامٍ متخصص: ٢ ساعة/شهر",
          "Kanban: ١٥ مهمة · طلبات: ١٠/شهر",
          "سوق المهنيين + عقود الموظفين ✅",
        ],
        support: [
          "ترافع: ١ قضية/سنة (سقف مطالبة ٥٠ ألف ر.س)",
          "خصم ١٥٪ على ترافع إضافي",
        ],
      },
    },
    { id: "biz-sm-full", name: "متكاملة", badge: "~٣,٧٤٩ ر.س/شهر",
      priceMonthly: "٤٤,٩٨٨", priceYearly: "٤٤,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "فريق قانوني كامل عن بُعد — استشارات + ترافع + مراجعة عقود + حوكمة", target: "شركات صغيرة", cta: "اشترك سنوياً",
      ctaHref: "/register/client?type=company", highlighted: false, color: "border-emerald-200/50 dark:border-emerald-500/20",
      companySize: "small", forLegalDept: false,
      features: {
        ai: [
          "أدوات الذكاء الاصطناعي: قريباً",
          "مراجعة عقود محامٍ: ٥/شهر",
          null,
          null,
        ],
        platform: [
          "١٠ مستخدمين",
          "استشارات محامٍ متخصص: ٥ ساعات/شهر",
          "Kanban: ٣٠ مهمة · طلبات: ٢٠/شهر",
          "سوق المهنيين + عقود الموظفين + تقارير ✅",
        ],
        support: [
          "ترافع: ٢ قضية/سنة (سقف مطالبة ١٠٠ ألف ر.س)",
          "خصم ٢٠٪ على ترافع إضافي · دعم واتساب",
        ],
      },
    },
    // ── شركة متوسطة (٥٠-٢٤٩) ──────────────────────────
    { id: "biz-md-basic", name: "أساسية", badge: "~٢,٤٩٩ ر.س/شهر",
      priceMonthly: "٢٩,٩٨٨", priceYearly: "٢٩,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "استشارات أساسية + مكتبة قانونية + HR — بدون ترافع مشمول", target: "شركات متوسطة", cta: "اشترك سنوياً",
      ctaHref: "/register/client?type=company", highlighted: false, color: "border-slate-200/50",
      companySize: "medium", forLegalDept: false,
      features: {
        ai: [
          "أدوات الذكاء الاصطناعي: قريباً",
          "المكتبة القانونية الكاملة ✅",
          null,
          null,
        ],
        platform: [
          "٥ مستخدمين",
          "استشارات محامٍ متخصص: ٢ ساعة/شهر",
          "Kanban: ٢٠ مهمة · طلبات: ١٠/شهر",
          "سوق المهنيين + عقود الموظفين ✅",
        ],
        support: [
          "ترافع: خصم ١٥٪ على الأتعاب (بدون قضايا مشمولة)",
          "دعم بريد إلكتروني",
        ],
      },
    },
    { id: "biz-md-pro", name: "احترافية", badge: null,
      priceMonthly: "٥٩,٩٨٨", priceYearly: "٥٩,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "ترافع بسقف + استشارات مكثفة + حوكمة + مراجعة عقود", target: "شركات متوسطة", cta: "اشترك سنوياً",
      ctaHref: "/register/client?type=company", highlighted: true, color: "border-royal/20",
      companySize: "medium", forLegalDept: false,
      features: {
        ai: [
          "أدوات الذكاء الاصطناعي: قريباً",
          "مراجعة عقود محامٍ: ٥/شهر",
          null,
          null,
        ],
        platform: [
          "١٥ مستخدماً",
          "استشارات محامٍ متخصص: ٥ ساعات/شهر",
          "Kanban: ٤٠ مهمة · طلبات: ٢٠/شهر",
          "حوكمة + تقارير مالية + سوق المهنيين ✅",
        ],
        support: [
          "ترافع: ٢ قضية/سنة (سقف مطالبة ١٥٠ ألف ر.س)",
          "خصم ٢٠٪ على ترافع إضافي · دعم واتساب",
        ],
      },
    },
    { id: "biz-md-full", name: "متكاملة", badge: "~٨,٣٣٢ ر.س/شهر",
      priceMonthly: "٩٩,٩٨٨", priceYearly: "٩٩,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "إدارة قانونية خارجية شاملة — مكتب محاماة كامل مدمج في شركتك", target: "شركات متوسطة", cta: "تواصل معنا",
      ctaHref: "/contact", highlighted: false, color: "border-emerald-200/50 dark:border-emerald-500/20",
      companySize: "medium", forLegalDept: false,
      features: {
        ai: [
          "أدوات الذكاء الاصطناعي: قريباً",
          "مراجعة عقود محامٍ: ١٠/شهر",
          null,
          null,
        ],
        platform: [
          "٢٥ مستخدماً",
          "استشارات محامٍ متخصص: ١٠ ساعات/شهر",
          "Kanban: ٨٠ مهمة · طلبات: ٤٠/شهر",
          "حوكمة كاملة + تقارير + انتداب مستشار ✅",
        ],
        support: [
          "ترافع: ٣ قضايا/سنة (سقف مطالبة ٣٠٠ ألف ر.س)",
          "خصم ٢٥٪ على ترافع إضافي · مدير حساب",
        ],
      },
    },
    // ── مؤسسة كبيرة (٢٥٠+) ─────────────────────────────
    { id: "biz-lg-basic", name: "أساسية", badge: "~٤,٩٩٩ ر.س/شهر",
      priceMonthly: "٥٩,٩٨٨", priceYearly: "٥٩,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "دعم مؤسسي أساسي + ترافع بسقف + استشارات + حوكمة", target: "مؤسسات كبيرة", cta: "تواصل معنا",
      ctaHref: "/contact", highlighted: false, color: "border-slate-200/50",
      companySize: "large", forLegalDept: false,
      features: {
        ai: [
          "أدوات الذكاء الاصطناعي: قريباً",
          "المكتبة القانونية الكاملة ✅",
          null,
          null,
        ],
        platform: [
          "١٠ مستخدمين",
          "استشارات محامٍ متخصص: ٣ ساعات/شهر",
          "Kanban: ٣٠ مهمة · طلبات: ١٥/شهر",
          "حوكمة أساسية + عقود الموظفين ✅",
        ],
        support: [
          "ترافع: ١ قضية/سنة (سقف مطالبة ١٥٠ ألف ر.س)",
          "خصم ١٥٪ على ترافع إضافي · دعم واتساب",
        ],
      },
    },
    { id: "biz-lg-pro", name: "احترافية", badge: null,
      priceMonthly: "١١٩,٩٨٨", priceYearly: "١١٩,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "ترافع + حوكمة كاملة + انتداب + مراجعة عقود — للمؤسسات الكبرى", target: "مؤسسات كبيرة", cta: "تواصل معنا",
      ctaHref: "/contact", highlighted: true, color: "border-royal/20",
      companySize: "large", forLegalDept: false,
      features: {
        ai: [
          "أدوات الذكاء الاصطناعي: قريباً",
          "مراجعة عقود محامٍ: ١٠/شهر",
          null,
          null,
        ],
        platform: [
          "٣٠ مستخدماً",
          "استشارات محامٍ متخصص: ١٠ ساعات/شهر",
          "Kanban: ١٠٠ مهمة · طلبات: ٥٠/شهر",
          "حوكمة كاملة + انتداب مستشار + تقارير مالية ✅",
        ],
        support: [
          "ترافع: ٣ قضايا/سنة (سقف مطالبة ٣٠٠ ألف ر.س)",
          "خصم ٢٥٪ على ترافع إضافي · مدير حساب",
        ],
      },
    },
    { id: "biz-lg-full", name: "متكاملة", badge: "عقد مخصص",
      priceMonthly: "تواصل معنا", priceYearly: "تواصل معنا", periodMonthly: "عقد سنوي", periodYearly: "عقد سنوي",
      desc: "عقد مخصص — مكتب محاماة كامل مدمج في مؤسستك بشروط متفق عليها", target: "مؤسسات كبيرة", cta: "تواصل مع المبيعات",
      ctaHref: "/contact", highlighted: false, color: "border-emerald-200/50 dark:border-emerald-500/20",
      companySize: "large", forLegalDept: false,
      features: {
        ai: [
          "أدوات الذكاء الاصطناعي: قريباً",
          "مراجعة عقود + صياغة: حسب العقد",
          null,
          null,
        ],
        platform: [
          "عدد مستخدمين حسب العقد",
          "استشارات + ساعات: حسب العقد",
          "Kanban + SSO + API",
          "حوكمة + انتداب + إشراف مجتمع ✅",
        ],
        support: [
          "ترافع: حسب العقد (سقف مطالبة متفق عليه)",
          "مدير حساب مخصص + SLA",
        ],
      },
    },
  ],
  en: [
    // ── Small (6-49) EN ─────────────────────────────────
    { id: "biz-sm-basic", name: "Basic", badge: "~833 SAR/mo",
      priceMonthly: "9,988", priceYearly: "9,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Legal library + legal requests + contract alerts — no litigation or consultations", target: "Small Companies", cta: "Subscribe Yearly",
      ctaHref: "/register/client?type=company", highlighted: false, color: "border-slate-200/50",
      companySize: "small", forLegalDept: false,
      features: {
        ai: ["AI tools: coming soon", "Full Legal Library ✅", "Contract expiry alerts ✅", null],
        platform: ["3 users", "Legal requests: 5/mo", "Professional Marketplace ✅", "Employee contracts (HR): basic"],
        support: ["Lawyer consultation: ❌", "Litigation: 10% fee discount when needed"],
      },
    },
    { id: "biz-sm-pro", name: "Professional", badge: null,
      priceMonthly: "24,988", priceYearly: "24,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Monthly consultations + capped litigation + contract review + Kanban", target: "Small Companies", cta: "Subscribe Yearly",
      ctaHref: "/register/client?type=company", highlighted: true, color: "border-royal/20",
      companySize: "small", forLegalDept: false,
      features: {
        ai: ["AI tools: coming soon", "Lawyer contract review: 2/mo", null, null],
        platform: ["5 users", "Lawyer consultations: 2 hrs/mo", "Kanban: 15 tasks · Requests: 10/mo", "Marketplace + Employee contracts ✅"],
        support: ["Litigation: 1 case/yr (claim cap 50K SAR)", "15% off additional litigation"],
      },
    },
    { id: "biz-sm-full", name: "Full Service", badge: "~3,749 SAR/mo",
      priceMonthly: "44,988", priceYearly: "44,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Complete remote legal team — consultations + capped litigation + contract review", target: "Small Companies", cta: "Subscribe Yearly",
      ctaHref: "/register/client?type=company", highlighted: false, color: "border-emerald-200/50 dark:border-emerald-500/20",
      companySize: "small", forLegalDept: false,
      features: {
        ai: ["AI tools: coming soon", "Lawyer contract review: 5/mo", null, null],
        platform: ["10 users", "Lawyer consultations: 5 hrs/mo", "Kanban: 30 tasks · Requests: 20/mo", "Marketplace + HR + Reports ✅"],
        support: ["Litigation: 2 cases/yr (claim cap 100K SAR)", "20% off additional · WhatsApp support"],
      },
    },
    // ── Medium (50-249) EN ───────────────────────────────
    { id: "biz-md-basic", name: "Basic", badge: "~2,499 SAR/mo",
      priceMonthly: "29,988", priceYearly: "29,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Core consultations + legal library + HR — no included litigation", target: "Medium Companies", cta: "Subscribe Yearly",
      ctaHref: "/register/client?type=company", highlighted: false, color: "border-slate-200/50",
      companySize: "medium", forLegalDept: false,
      features: {
        ai: ["AI tools: coming soon", "Full Legal Library ✅", null, null],
        platform: ["5 users", "Lawyer consultations: 2 hrs/mo", "Kanban: 20 tasks · Requests: 10/mo", "Marketplace + Employee contracts ✅"],
        support: ["Litigation: 15% fee discount (no cases included)", "Email support"],
      },
    },
    { id: "biz-md-pro", name: "Professional", badge: null,
      priceMonthly: "59,988", priceYearly: "59,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Capped litigation + governance + intensive consultations + contract review", target: "Medium Companies", cta: "Subscribe Yearly",
      ctaHref: "/register/client?type=company", highlighted: true, color: "border-royal/20",
      companySize: "medium", forLegalDept: false,
      features: {
        ai: ["AI tools: coming soon", "Lawyer contract review: 5/mo", null, null],
        platform: ["15 users", "Lawyer consultations: 5 hrs/mo", "Kanban: 40 tasks · Requests: 20/mo", "Governance + Finance reports + Marketplace ✅"],
        support: ["Litigation: 2 cases/yr (claim cap 150K SAR)", "20% off additional · WhatsApp support"],
      },
    },
    { id: "biz-md-full", name: "Full Service", badge: "~8,332 SAR/mo",
      priceMonthly: "99,988", priceYearly: "99,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Outsourced legal department — a full law firm embedded in your company", target: "Medium Companies", cta: "Contact Us",
      ctaHref: "/contact", highlighted: false, color: "border-emerald-200/50 dark:border-emerald-500/20",
      companySize: "medium", forLegalDept: false,
      features: {
        ai: ["AI tools: coming soon", "Lawyer contract review: 10/mo", null, null],
        platform: ["25 users", "Lawyer consultations: 10 hrs/mo", "Kanban: 80 tasks · Requests: 40/mo", "Full governance + secondment + reports ✅"],
        support: ["Litigation: 3 cases/yr (claim cap 300K SAR)", "25% off additional · Account manager"],
      },
    },
    // ── Large (250+) EN ─────────────────────────────────
    { id: "biz-lg-basic", name: "Basic", badge: "~4,999 SAR/mo",
      priceMonthly: "59,988", priceYearly: "59,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Enterprise base + capped litigation + consultations + governance", target: "Large Enterprises", cta: "Contact Us",
      ctaHref: "/contact", highlighted: false, color: "border-slate-200/50",
      companySize: "large", forLegalDept: false,
      features: {
        ai: ["AI tools: coming soon", "Full Legal Library ✅", null, null],
        platform: ["10 users", "Lawyer consultations: 3 hrs/mo", "Kanban: 30 tasks · Requests: 15/mo", "Basic governance + Employee contracts ✅"],
        support: ["Litigation: 1 case/yr (claim cap 150K SAR)", "15% off additional · WhatsApp"],
      },
    },
    { id: "biz-lg-pro", name: "Professional", badge: null,
      priceMonthly: "119,988", priceYearly: "119,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Full enterprise support — litigation + governance + secondment + contract review", target: "Large Enterprises", cta: "Contact Us",
      ctaHref: "/contact", highlighted: true, color: "border-royal/20",
      companySize: "large", forLegalDept: false,
      features: {
        ai: ["AI tools: coming soon", "Lawyer contract review: 10/mo", null, null],
        platform: ["30 users", "Lawyer consultations: 10 hrs/mo", "Kanban: 100 tasks · Requests: 50/mo", "Full governance + secondment + reports ✅"],
        support: ["Litigation: 3 cases/yr (claim cap 300K SAR)", "25% off additional · Account manager"],
      },
    },
    { id: "biz-lg-full", name: "Full Service", badge: "Custom",
      priceMonthly: "Contact Us", priceYearly: "Contact Us", periodMonthly: "Annual Contract", periodYearly: "Annual Contract",
      desc: "Custom contract — a full law firm embedded in your corporation", target: "Large Enterprises", cta: "Contact Sales",
      ctaHref: "/contact", highlighted: false, color: "border-emerald-200/50 dark:border-emerald-500/20",
      companySize: "large", forLegalDept: false,
      features: {
        ai: ["AI tools: coming soon", "Contract review + drafting: per contract", null, null],
        platform: ["Users: per contract", "Consultations: per contract", "Kanban + SSO + API", "Full governance + secondment + community ✅"],
        support: ["Litigation: per contract (agreed claim cap)", "Dedicated account manager + SLA"],
      },
    },
  ],
};
