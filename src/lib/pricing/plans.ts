/**
 * src/lib/pricing/plans.ts
 * ─────────────────────────────────────────────────────────────
 * Canonical Pricing Plans Definition (Owner & Council Decisions 165/168)
 * 
 * 1. Legal Library Standalone Subscription (owner ٣٠٠ / conflict ٢, 30 Oct
 *    2026 — the price book holds the numbers):
 *    - Annual: 6,990 SAR / year (batch l9, owner register 14 item 1)
 *    - Half-year: 3,790 SAR / 6 months
 *    - Quarterly: 1,990 SAR / quarter
 *    - (The 2,500 SAR/year "AI Researcher Add-on" is withdrawn: AI points
 *      replaced it — gap analysis 2026-10-16 §2. No plan offers it.)
 * 
 * 2. Individuals Pricing Pyramid (owner package of 1 Nov 2026 §6.2.1, q329):
 *    - AI Self-Service (الباقة الذكية) = 249 SAR a year, yearly only; the
 *      29 / 79 / 149 cycles and the 199 launch price are retired.
 *    - «الباقة الوقائية» (149 / 1,490) and «التأمين القانوني» (399 / 3,990)
 *      are retired in the price book: no plan here. The 365 legal-protection
 *      plan waits on the owner (٤٢٠).
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
    // Yearly only (owner package of 1 Nov 2026 §6.2.1, q329): the monthly
    // cycle is retired, 0 = not sold monthly. /services/individuals reads
    // each cycle from the book and shows only what is sold.
    priceMonthly: 0,
    priceYearly: bookSar("ind-ai", "yearly"),
    periodMonthlyAr: "ر.س / شهر",
    periodYearlyAr: "ر.س / سنة",
    periodMonthlyEn: "SAR / month",
    periodYearlyEn: "SAR / year",
    badgeAr: "ما يعادل ٢٠٫٧٥ ر.س شهرياً تُدفع سنوياً",
    badgeEn: "≈ SAR 20.75/month, billed yearly",
    descAr: "مستشارك القانوني الذكي — ٣٠ سؤالاً وعقدان مبسّطان شهرياً وفق سياسة الاستخدام العادل",
    descEn: "Your AI legal assistant — 30 questions and 2 simplified contracts a month under the fair-use policy",
    featuresAr: [
      // LIVE-F11 (owner package 30 Oct 2026): no «غير محدود» claim.
      // Owner ق٢٦-٦ (batch l19): the fair use counted on the server
      // (20261209_70) — the same lines as pricing.individuals.ts.
      "المجيب القانوني السريع: ٣٠ سؤالاً شهرياً",
      "صائغ العقود المبسّط: عقدان مبسّطان شهرياً (قيد التفعيل)",
      "لا يُرحَّل غير المستخدم إلى الشهر التالي، وما زاد يُدفع بالنقاط (شحن ١٠٠ أو ٢٥٠)",
      "استشهادات دقيقة بمواد الأنظمة واللوائح السعودية",
      "حاسبة الرسوم القضائية ومحدد مدد التقادم",
      "دعم فني عبر المنصة والبريد",
    ],
    featuresEn: [
      "Quick legal answer: 30 questions a month",
      "Simplified contract drafter: 2 simplified contracts a month (coming soon)",
      "Unused questions do not carry over; beyond them you pay in points (top-up 100 or 250)",
      "Direct citations from Saudi statutory laws",
      "Court fees & statutory limitation period calculators",
      "Platform & email technical support",
    ],
    highlighted: false,
    ctaTextAr: "اشترك في الباقة الذكية",
    ctaTextEn: "Subscribe to Smart AI",
    ctaHref: "/register/client?type=individual&plan=ind-ai",
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
    // Q89 (l12): no plan but a library plan or grant opens the library.
    "المكتبة القانونية باشتراك مستقل",
    "أدوات الصائغ الآلي ومحترف العقود للاستشارات والصياغة",
    "توليد المذكرات الاستشارية والآراء القانونية الموثقة",
    "إدارة العملاء والملفات الاستشارية والتقويم",
    "🚫 حظر ميزات الترافع والتمثيل القضائي أمام المحاكم وفق المادة ١٨ من نظام المحاماة",
  ],
  featuresEn: [
    "Legal library by separate subscription",
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
