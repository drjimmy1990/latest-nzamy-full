/**
 * src/lib/pricing/plans.ts
 * ─────────────────────────────────────────────────────────────
 * Canonical Pricing Plans Definition (Owner & Council Decisions 165/168)
 * 
 * 1. Legal Library Standalone Subscription:
 *    - Annual: 5,000 SAR / year (Canonical rate, unified across system)
 *    - Quarterly: 1,500 SAR / quarter
 *    - AI Researcher Add-on: 2,500 SAR / year (optional)
 * 
 * 2. Individuals Pricing Pyramid:
 *    - Tier 1: AI Self-Service (الباقة الذكية) = 39 SAR/mo (390 SAR/yr)
 *    - Tier 2: Preventive (الباقة الوقائية) = 149 SAR/mo (1,490 SAR/yr)
 *    - Tier 3: Litigation (باقة الخصومة والتقاضي) = 399 SAR/mo (3,990 SAR/yr) [Underwriting Gated]
 *    - Tier 4: Family/Group (الباقة العائلية الشاملة) = 699 SAR/mo (6,990 SAR/yr)
 * 
 * 3. Independent Legal Consultant:
 *    - 199 SAR/mo (Article 18 Regulatory Gated — No court representation for unlicensed)
 * ─────────────────────────────────────────────────────────────
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
}

// ─── 1. Standalone Legal Library Plans ────────────────────────────────────────

export const STANDALONE_LIBRARY_PLANS: Record<string, PricingPlan> = {
  "lib-quarterly": {
    id: "lib-quarterly",
    nameAr: "المكتبة القانونية — ربع سنوي",
    nameEn: "Legal Library — Quarterly",
    priceMonthly: 1500,
    priceYearly: 1500,
    periodMonthlyAr: "ر.س / ٣ أشهر",
    periodYearlyAr: "ر.س / ٣ أشهر",
    periodMonthlyEn: "SAR / 3 months",
    periodYearlyEn: "SAR / 3 months",
    badgeAr: null,
    badgeEn: null,
    descAr: "وصول كامل وشامل لـ +٥٬٠٠٠ نظام ولائحة ومبدأ قضائي لمدة ٣ أشهر",
    descEn: "Full access to 5,000+ Saudi laws, regulations and judicial principles for 3 months",
    featuresAr: [
      "وصول كامل لـ +٥٬٠٠٠ نظام ولائحة ومبدأ قضائي",
      "بحث ذكي وفهرسة رقمية دقيقة",
      "تحديثات يومية فور صدور الأنظمة والتعديلات",
      "قراءة هادئة ووضع التركيز وحفظ المفضلة",
      "دعم فني عبر البريد الإلكتروني",
    ],
    featuresEn: [
      "Full access to 5,000+ laws, regulations & judicial principles",
      "AI-powered search and precise digital indexing",
      "Daily updates as new laws and amendments are issued",
      "Focus reader mode, favorites & bookmarks",
      "Email technical support",
    ],
    highlighted: false,
    ctaTextAr: "اشترك الآن",
    ctaTextEn: "Subscribe Now",
    ctaHref: "/laws/subscribe?plan=lib-quarterly",
  },
  "lib-annual": {
    id: "lib-annual",
    nameAr: "المكتبة القانونية — سنوي",
    nameEn: "Legal Library — Annual",
    priceMonthly: 5000,
    priceYearly: 5000,
    periodMonthlyAr: "ر.س / سنة",
    periodYearlyAr: "ر.س / سنة",
    periodMonthlyEn: "SAR / year",
    periodYearlyEn: "SAR / year",
    badgeAr: "الأكثر قيمة واعتماداً",
    badgeEn: "Best Value",
    descAr: "الاشتراك السنوي المعتمد للمحترفين والمكاتب — ٥٬٠٠٠ ر.س/سنة مع كامل التحديثات وتصدير النصوص",
    descEn: "Canonical annual subscription for professionals & firms — 5,000 SAR/year with all updates & exports",
    featuresAr: [
      "وصول كامل وغير محدود لـ +٥٬٠٠٠ نظام ولائحة ومبدأ قضائي",
      "محرك البحث القانوني المتقدم مع تصدير بصيغة PDF",
      "تحديثات تشريعية لحظية وإشعارات التعديلات الجديدة",
      "حفظ الملاحظات والمجلدات الخاصة ومشاركة المقتطفات",
      "إمكانية إضافة مساعد باحث الذكاء الاصطناعي (٢٬٥٠٠ ر.س/سنة)",
      "دعم فني ذو أولوية عبر واتساب المخصص",
    ],
    featuresEn: [
      "Unlimited access to 5,000+ laws, regulations & principles",
      "Advanced legal search engine with PDF export",
      "Instant legislative alerts and amendment tracking",
      "Private research folders, notes & snippet sharing",
      "Eligible for AI Researcher Add-on (2,500 SAR/year)",
      "Priority WhatsApp technical support",
    ],
    highlighted: true,
    ctaTextAr: "اشترك سنوياً",
    ctaTextEn: "Subscribe Annual",
    ctaHref: "/laws/subscribe?plan=lib-annual",
  },
};

export const LIBRARY_AI_ADDON = {
  id: "lib-ai-addon",
  nameAr: "مساعد باحث الذكاء الاصطناعي الإضافي",
  nameEn: "AI Legal Researcher Add-on",
  priceYearly: 2500,
  periodYearlyAr: "ر.س / سنة",
  periodYearlyEn: "SAR / year",
  descAr: "إضافة متقدمة للبحث الدلالي وتحليل وتلخيص المواد والسوابق القضائية آلياً",
  descEn: "Advanced semantic research, automated article summarization and precedent analysis",
};

// ─── 2. Individuals Pricing Pyramid ───────────────────────────────────────────

export const INDIVIDUALS_PYRAMID_PLANS: Record<string, PricingPlan> = {
  "ind-ai": {
    id: "ind-ai",
    nameAr: "الباقة الذكية (AI الذاتي)",
    nameEn: "AI Self-Service Plan",
    priceMonthly: 39,
    priceYearly: 390,
    periodMonthlyAr: "ر.س / شهر",
    periodYearlyAr: "ر.س / سنة (شهرين مجاناً)",
    periodMonthlyEn: "SAR / month",
    periodYearlyEn: "SAR / year",
    badgeAr: "ريال وربع يومياً",
    badgeEn: "Affordable",
    descAr: "مستشارك القانوني الذكي على مدار الساعة — إجابات نظامية فورية وصياغة خطابات وإنذارات",
    descEn: "Your 24/7 AI legal assistant — instant statutory answers and draft notices",
    featuresAr: [
      "مساعد ذكاء اصطناعي قانوني غير محدود طوال الاشتراك",
      "استشهادات دقيقة بمواد الأنظمة واللوائح السعودية",
      "توليد ومراجعة مسودات الإنذارات والخطابات الودية",
      "حاسبة الرسوم القضائية ومحدد مدد التقادم",
      "دعم فني عبر المنصة والبريد",
    ],
    featuresEn: [
      "Unlimited 24/7 AI legal assistant",
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
    priceMonthly: 149,
    priceYearly: 1490,
    periodMonthlyAr: "ر.س / شهر",
    periodYearlyAr: "ر.س / سنة (شهرين مجاناً)",
    periodMonthlyEn: "SAR / month",
    periodYearlyEn: "SAR / year",
    badgeAr: "الأكثر طلباً للأفراد",
    badgeEn: "Most Popular",
    descAr: "درعك الوقائي لحماية حقوقك وتعاملاتك اليومية — استشارات مع محامين مرخصين ومراجعة عقود",
    descEn: "Your preventive legal shield — licensed lawyer consultations and contract reviews",
    featuresAr: [
      "كل مزايا الباقة الذكية (ذكاء اصطناعي مفتوح)",
      "٤ استشارات قانونية سنوية (مرئية/هاتفية) مع محامٍ مرخّص",
      "مراجعة وتدقيق عقدين (٢) سنوياً لضمان خلوها من الثغرات",
      "فحص وقائي تعاقدي وتنبيهات بالمخاطر القانونية",
      "خصم ١٥٪ على أتعاب أي قضايا أو ترافع إضافي",
    ],
    featuresEn: [
      "All Smart AI features included",
      "4 annual consultations (video/phone) with licensed lawyers",
      "2 contract reviews per year for clause risk protection",
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
    nameAr: "باقة الخصومة والتقاضي",
    nameEn: "Litigation & Representation Plan",
    priceMonthly: 399,
    priceYearly: 3990,
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
      "استشارات غير محدودة طوال فترة التقاضي في القضية المقبولة",
      "حجز الرسوم في محفظة الضمان المالي المعتمدة",
      "⚠️ خضوع القضية لقواعد الاكتتاب والتحقق المسبق قبل البدء",
    ],
    featuresEn: [
      "All Smart AI & Preventive features included",
      "Court representation for 1 qualified eligible case per year",
      "Drafting statements of claim, responses and appeals",
      "Unlimited consultations throughout active case duration",
      "Escrow protection for dispute fees",
      "⚠️ Subject to legal underwriting review and intake qualification",
    ],
    highlighted: false,
    requiresUnderwriting: true,
    ctaTextAr: "تقديم طلب انضمام للباقة",
    ctaTextEn: "Apply for Litigation Plan",
    ctaHref: "/register/client?type=individual&plan=ind-litigation",
  },

  "ind-family": {
    id: "ind-family",
    nameAr: "الباقة العائلية الشاملة",
    nameEn: "Family Legal Umbrella",
    priceMonthly: 699,
    priceYearly: 6990,
    periodMonthlyAr: "ر.س / شهر",
    periodYearlyAr: "ر.س / سنة (شهرين مجاناً)",
    periodMonthlyEn: "SAR / month",
    periodYearlyEn: "SAR / year",
    badgeAr: "تغطي حتى ٥ أفراد",
    badgeEn: "Up to 5 Family Members",
    descAr: "مظلة حماية قانونية متكاملة لجميع أفراد الأسرة مع استقلالية تامة للخصوصية وضامن موحد",
    descEn: "Comprehensive family legal protection with full member privacy and a unified master payer",
    featuresAr: [
      "تغطية قانونية شاملة للأسرة حتى ٥ أفراد مسجلين",
      "١٠ استشارات قانونية سنوية موزعة على أفراد العائلة مع محامين مرخصين",
      "صياغة وتدقيق ٤ عقود سنوية (إيجار، عمل، بيع، استثمار)",
      "ذكاء اصطناعي قانوني مفتوح ومستقل لكل فرد في حسابه الخاص",
      "خصم ٢٥٪ على أتعاب الترافع وكافة القضايا لكافة أفراد العائلة",
      "عزل تام لبيانات وخصوصية كل عضو (RLS Security)",
    ],
    featuresEn: [
      "Comprehensive legal coverage for up to 5 family members",
      "10 annual licensed lawyer consultations across members",
      "Drafting & review of 4 annual family contracts",
      "Independent unlimited AI accounts for each member",
      "25% discount on litigation fees for all family members",
      "Full cryptographic and role-based privacy separation (RLS)",
    ],
    highlighted: false,
    ctaTextAr: "اشترك في الباقة العائلية",
    ctaTextEn: "Subscribe to Family Plan",
    ctaHref: "/register/client?type=individual&plan=ind-family",
  },
};

// ─── 3. Independent Legal Consultant Plan (Article 18 Regulatory Gated) ───────

export const INDEPENDENT_CONSULTANT_PLAN: PricingPlan = {
  id: "consultant-independent",
  nameAr: "المستشار القانوني المستقل",
  nameEn: "Independent Legal Consultant",
  priceMonthly: 199,
  priceYearly: 1990,
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
