/**
 * src/lib/pricing/plans.ts
 * ─────────────────────────────────────────────────────────────
 * Canonical Pricing Plans Definition (Owner & Council Decisions 165/168)
 * 
 * 1. Legal Library Standalone Subscription (owner ٣٠٠ / conflict ٢, 30 Oct
 *    2026 — the price book holds the numbers):
 *    - Annual: 3,490 SAR / year (3,790 and 5,000 are cancelled)
 *    - Half-year: 1,920 SAR / 6 months
 *    - Quarterly: 1,050 SAR / quarter
 *    - (The 2,500 SAR/year "AI Researcher Add-on" is withdrawn: AI points
 *      replaced it — gap analysis 2026-10-16 §2. No plan offers it.)
 * 
 * 2. Individuals Pricing Pyramid:
 *    - Tier 1: AI Self-Service (الباقة الذكية) = 29 / 79 / 149 / 249 SAR a
 *      month / quarter / half-year / year, launch 199 a year (owner ٣٠١)
 *    - Tier 2: Preventive (الباقة الوقائية) = 149 SAR/mo (1,490 SAR/yr)
 *    - Tier 3: «التأمين القانوني» = 399 SAR/mo (3,990 SAR/yr) [Underwriting Gated],
 *      The family cover option (owner answers ٢١٣ + ١٧٦) is withdrawn from
 *      display at launch (conflict ١٠; SHOW_FAMILY_DEPENDENTS in
 *      src/constants/pricing/pricing.individuals.ts).
 * 
 * 3. Independent Legal Consultant:
 *    - 399 SAR/mo or 3,990 SAR/yr, the same as «المحامي المحترف» (owner answer
 *      ١٧٣, 2026-10-16); Article 18: no pleading or hearing management
 * ─────────────────────────────────────────────────────────────
 */

import { bookSar, formatSarAmount } from "./priceBook.ts";

/**
 * The numeric prices below are READ from the price book (src/lib/pricing/
 * priceBook.ts); none is written here. For a one-payment library pass both
 * fields carry the one price.
 */
export interface PricingPlan {
  id: string;
  nameAr: string;
  nameEn: string;
  priceMonthly: number;
  priceYearly: number;
  periodMonthlyAr: string;
  periodYearlyAr: string;
  periodMonthlyEn: string;
  periodYearlyEn: string;
  badgeAr?: string | null;
  badgeEn?: string | null;
  descAr: string;
  descEn: string;
  featuresAr: string[];
  featuresEn: string[];
  highlighted?: boolean;
  requiresUnderwriting?: boolean;
  article18Restricted?: boolean;
  ctaTextAr: string;
  ctaTextEn: string;
  ctaHref: string;
  /** Small grey line under the card (owner answer ٢١٣: «* تطبق الشروط والأحكام»). */
  footnoteAr?: string;
  footnoteEn?: string;
}

// ─── 1. Standalone Legal Library Plans ────────────────────────────────────────

export const STANDALONE_LIBRARY_PLANS: Record<string, PricingPlan> = {
  "lib-q1": {
    id: "lib-q1",
    nameAr: "المكتبة القانونية — ربع سنوي",
    nameEn: "Legal Library — Quarterly",
    priceMonthly: bookSar("lib-q1", "once"),
    priceYearly: bookSar("lib-q1", "once"),
    periodMonthlyAr: "ر.س / ٣ أشهر",
    periodYearlyAr: "ر.س / ٣ أشهر",
    periodMonthlyEn: "SAR / 3 months",
    periodYearlyEn: "SAR / 3 months",
    badgeAr: null,
    badgeEn: null,
    descAr: "وصول كامل وشامل للأنظمة واللوائح والمبادئ القضائية لمدة ٣ أشهر",
    descEn: "Full access to Saudi laws, regulations and judicial principles for 3 months",
    featuresAr: [
      "وصول كامل للأنظمة واللوائح والمبادئ القضائية",
      "بحث متقدّم في المكتبة القانونية",
      "قراءة هادئة ووضع التركيز وحفظ المفضلة",
      "دعم فني عبر البريد الإلكتروني",
    ],
    featuresEn: [
      "Full access to laws, regulations & judicial principles",
      "Advanced search in the legal library",
      "Focus reader mode, favorites & bookmarks",
      "Email technical support",
    ],
    highlighted: false,
    ctaTextAr: "اشترك الآن",
    ctaTextEn: "Subscribe Now",
    ctaHref: "/laws/subscribe?plan=lib-q1",
  },
  "lib-q2": {
    id: "lib-q2",
    nameAr: "المكتبة القانونية — نصف سنوي",
    nameEn: "Legal Library — Half-year",
    priceMonthly: bookSar("lib-q2", "once"),
    priceYearly: bookSar("lib-q2", "once"),
    periodMonthlyAr: "ر.س / ٦ أشهر",
    periodYearlyAr: "ر.س / ٦ أشهر",
    periodMonthlyEn: "SAR / 6 months",
    periodYearlyEn: "SAR / 6 months",
    badgeAr: null,
    badgeEn: null,
    descAr: "وصول كامل للأنظمة واللوائح والمبادئ القضائية لمدة ستة أشهر",
    descEn: "Full access to Saudi laws, regulations and judicial principles for 6 months",
    featuresAr: [
      "وصول كامل للأنظمة واللوائح والمبادئ القضائية",
      "بحث متقدّم في المكتبة القانونية",
      "قراءة هادئة ووضع التركيز وحفظ المفضلة",
    ],
    featuresEn: [
      "Full access to laws, regulations & judicial principles",
      "Advanced search in the legal library",
      "Focus reader mode, favorites & bookmarks",
    ],
    highlighted: false,
    ctaTextAr: "اشترك الآن",
    ctaTextEn: "Subscribe Now",
    ctaHref: "/laws/subscribe?plan=lib-q2",
  },
  "lib-annual": {
    id: "lib-annual",
    nameAr: "المكتبة القانونية — سنوي",
    nameEn: "Legal Library — Annual",
    priceMonthly: bookSar("lib-annual", "once"),
    priceYearly: bookSar("lib-annual", "once"),
    periodMonthlyAr: "ر.س / سنة",
    periodYearlyAr: "ر.س / سنة",
    periodMonthlyEn: "SAR / year",
    periodYearlyEn: "SAR / year",
    // No «الأكثر قيمة واعتماداً» badge (owner, Q164, 2026-10-03): no
    // subscription data supports an adoption claim, and the value superlative
    // went with it. `highlighted` keeps the emphasis.
    badgeAr: null,
    badgeEn: null,
    descAr: `الاشتراك السنوي المعتمد للمحترفين والمكاتب — ${formatSarAmount(bookSar("lib-annual", "once"), "ar")} ر.س/سنة مع كامل التحديثات وتصدير النصوص`,
    descEn: `Canonical annual subscription for professionals & firms — ${formatSarAmount(bookSar("lib-annual", "once"), "en")} SAR/year with all updates & exports`,
    featuresAr: [
      "وصول كامل وغير محدود للأنظمة واللوائح والمبادئ القضائية",
      "محرك البحث القانوني المتقدم مع تصدير بصيغة PDF",
      "حفظ الملاحظات والمجلدات الخاصة ومشاركة المقتطفات",
    ],
    featuresEn: [
      "Unlimited access to laws, regulations & principles",
      "Advanced legal search engine with PDF export",
      "Private research folders, notes & snippet sharing",
    ],
    highlighted: true,
    ctaTextAr: "اشترك سنوياً",
    ctaTextEn: "Subscribe Annual",
    ctaHref: "/laws/subscribe?plan=lib-annual",
  },
};

// LIBRARY_AI_ADDON (the 2,500 SAR/year AI researcher add-on) was defined here
// and imported nowhere. AI points replaced it (gap analysis 2026-10-16 §2), so
// the definition went with the plan lines that still sold it.

// ─── 2. Individuals Pricing Pyramid ───────────────────────────────────────────

export const INDIVIDUALS_PYRAMID_PLANS: Record<string, PricingPlan> = {
  "ind-ai": {
    id: "ind-ai",
    nameAr: "الباقة الذكية (AI الذاتي)",
    nameEn: "AI Self-Service Plan",
    priceMonthly: bookSar("ind-ai", "monthly"),
    priceYearly: bookSar("ind-ai", "yearly"),
    periodMonthlyAr: "ر.س / شهر",
    periodYearlyAr: "ر.س / سنة",
    periodMonthlyEn: "SAR / month",
    periodYearlyEn: "SAR / year",
    badgeAr: "نحو ٠٫٦٨ ر.س يومياً بالاشتراك السنوي",
    badgeEn: "About SAR 0.68 a day on the yearly plan",
    descAr: "مستشارك القانوني الذكي — إجابات نظامية وصياغة خطابات وإنذارات",
    descEn: "Your AI legal assistant — statutory answers and draft notices",
    featuresAr: [
      // LIVE-F11 (owner package 30 Oct 2026): no «غير محدود» claim.
      "مساعد ذكاء اصطناعي قانوني ذاتي طوال الاشتراك",
      "استشهادات دقيقة بمواد الأنظمة واللوائح السعودية",
      "توليد ومراجعة مسودات الإنذارات والخطابات الودية",
      "حاسبة الرسوم القضائية ومحدد مدد التقادم",
      "دعم فني عبر المنصة والبريد",
    ],
    featuresEn: [
      "Self-service AI legal assistant for the whole subscription",
      "Direct citations from Saudi statutory laws",
      "Draft generation for notices and official correspondence",
      "Court fees & statutory limitation period calculators",
      "Platform & email technical support",
    ],
    highlighted: false,
    ctaTextAr: "اشترك في الباقة الذكية",
    ctaTextEn: "Subscribe to Smart AI",
    ctaHref: "/register/client?type=individual&plan=ind-ai",
  },

  "ind-preventive": {
    id: "ind-preventive",
    nameAr: "الباقة الوقائية (الاستشارات والعقود)",
    nameEn: "Preventive Legal Plan",
    priceMonthly: bookSar("ind-preventive", "monthly"),
    priceYearly: bookSar("ind-preventive", "yearly"),
    periodMonthlyAr: "ر.س / شهر",
    periodYearlyAr: "ر.س / سنة (شهرين مجاناً)",
    periodMonthlyEn: "SAR / month",
    periodYearlyEn: "SAR / year",
    // No «الأكثر طلباً للأفراد» badge (owner, Q164, 2026-10-03).
    badgeAr: null,
    badgeEn: null,
    descAr: "درعك الوقائي لحماية حقوقك وتعاملاتك اليومية — استشارات مع محامين مرخصين ومراجعة عقود",
    descEn: "Your preventive legal shield — licensed lawyer consultations and contract reviews",
    featuresAr: [
      "كل مزايا الباقة الذكية (ذكاء اصطناعي مفتوح)",
      // Final review, item 4: no code counts these allowances; the team
      // applies them by hand on a request (see pricing.individuals.ts).
      "٤ استشارات قانونية سنوية (مرئية/هاتفية) مع محامٍ مرخّص — تُطبَّق بطلب يراجعه الفريق",
      "مراجعة وتدقيق عقدين (٢) سنوياً لضمان خلوها من الثغرات — تُطبَّق بطلب يراجعه الفريق",
      "فحص وقائي تعاقدي وتنبيهات بالمخاطر القانونية",
      "خصم ١٥٪ على أتعاب أي قضايا أو ترافع إضافي",
    ],
    featuresEn: [
      "All Smart AI features included",
      "4 annual consultations (video/phone) with licensed lawyers — applied on a request the team reviews",
      "2 contract reviews per year for clause risk protection — applied on a request the team reviews",
      "Preventive contract health check",
      "15% ongoing discount on additional legal litigation services",
    ],
    highlighted: true,
    ctaTextAr: "اشترك في الباقة الوقائية",
    ctaTextEn: "Subscribe to Preventive",
    ctaHref: "/register/client?type=individual&plan=ind-preventive",
  },

  "ind-litigation": {
    id: "ind-litigation",
    nameAr: "التأمين القانوني",
    nameEn: "Legal Insurance",
    priceMonthly: bookSar("ind-litigation", "monthly"),
    priceYearly: bookSar("ind-litigation", "yearly"),
    periodMonthlyAr: "ر.س / شهر",
    periodYearlyAr: "ر.س / سنة (شهرين مجاناً)",
    periodMonthlyEn: "SAR / month",
    periodYearlyEn: "SAR / year",
    badgeAr: "تخضع لقواعد القبول والاكتتاب",
    badgeEn: "Subject to Underwriting",
    descAr: "تمثيل قضائي وترافع معتمد أمام المحاكم — تخضع للتدقيق المهني المسبق وخلو النزاع من التعارض",
    descEn: "Court representation & litigation defense — subject to underwriting review and conflict checks",
    featuresAr: [
      "كل مزايا الباقتين الذكية والوقائية",
      "تمثيل قضائي وترافع أمام المحاكم لقضية مؤهلة سنوياً",
      "صياغة لوائح الدعوى والمذكرات الجوابية والاعتراضية",
      "استشارات غير محدودة طوال فترة التقاضي في القضية المقبولة — تُطبَّق بطلب يراجعه الفريق",
      "⚠️ خضوع القضية لقواعد الاكتتاب والتحقق المسبق قبل البدء",
      // The family option (answer ١٧٦) is withdrawn at launch (conflict ١٠).
    ],
    featuresEn: [
      "All Smart AI & Preventive features included",
      "Court representation for 1 qualified eligible case per year",
      "Drafting statements of claim, responses and appeals",
      "Unlimited consultations throughout active case duration — applied on a request the team reviews",
      "⚠️ Subject to legal underwriting review and intake qualification",
    ],
    highlighted: false,
    requiresUnderwriting: true,
    ctaTextAr: "تقديم طلب انضمام للباقة",
    ctaTextEn: "Apply for Legal Insurance",
    ctaHref: "/register/client?type=individual&plan=ind-litigation",
    footnoteAr: "* تطبق الشروط والأحكام",
    footnoteEn: "* Terms and conditions apply",
  },
};

// ─── 3. Independent Legal Consultant Plan (Article 18 Regulatory Gated) ───────

export const INDEPENDENT_CONSULTANT_PLAN: PricingPlan = {
  id: "consultant-independent",
  nameAr: "المستشار القانوني المستقل",
  nameEn: "Independent Legal Consultant",
  // The monthly cycle is retired (professionals never pay monthly, owner
  // 26 Oct 2026): 0 = not sold monthly. Nothing renders this plan's prices;
  // checkout charges from the book.
  priceMonthly: 0,
  priceYearly: bookSar("consultant-independent", "yearly"),
  periodMonthlyAr: "ر.س / شهر",
  periodYearlyAr: "ر.س / سنة",
  periodMonthlyEn: "SAR / month",
  periodYearlyEn: "SAR / year",
  badgeAr: "مقيد بالمادة ١٨ نظام المحاماة",
  badgeEn: "Article 18 Gated",
  descAr: "باقة مخصصة للمستشارين القانونيين المستقلين لدراسة الأنظمة وصياغة العقود — لا تشمل الترافع القضائي لغير المرخصين",
  descEn: "Specialized for independent legal consultants for advisory & contracts — excludes court representation for unlicensed practitioners",
  featuresAr: [
    "الوصول الكامل لمحرك البحث في المكتبة القانونية والأنظمة السعودية",
    "أدوات الصائغ الآلي ومحترف العقود للاستشارات والصياغة",
    "توليد المذكرات الاستشارية والآراء القانونية الموثقة",
    "إدارة العملاء والملفات الاستشارية والتقويم",
    "🚫 حظر ميزات الترافع والتمثيل القضائي أمام المحاكم وفق المادة ١٨ من نظام المحاماة",
  ],
  featuresEn: [
    "Full access to the Saudi statutory laws & regulations search engine",
    "Automated drafter & contract analyzer tools for advisory work",
    "Generation of legal opinions and consultative memoranda",
    "Client advisory management, document repository & scheduling",
    "🚫 Court representation and pleading strictly gated under Article 18 of the Code of Law Practice",
  ],
  highlighted: false,
  article18Restricted: true,
  ctaTextAr: "اشترك كمستشار مستقل",
  ctaTextEn: "Subscribe as Consultant",
  ctaHref: "/register/provider?type=consultant&plan=independent",
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

export function getStandaloneLibraryPlan(id: string): PricingPlan | undefined {
  return STANDALONE_LIBRARY_PLANS[id];
}

export function getIndividualPyramidPlan(id: string): PricingPlan | undefined {
  return INDIVIDUALS_PYRAMID_PLANS[id];
}

export function isArticle18Restricted(planId: string): boolean {
  if (planId === INDEPENDENT_CONSULTANT_PLAN.id) return true;
  return false;
}

export function requiresLitigationUnderwriting(planId: string): boolean {
  return INDIVIDUALS_PYRAMID_PLANS[planId]?.requiresUnderwriting === true;
}
