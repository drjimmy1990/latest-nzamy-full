import { Lightning, Gavel } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Lawyers: one subscription + point top-ups (owner answers ١٧٤ / ١٧٨, 2026-10-16) ─
// - «المحامي المحترف»: 3,990 SAR/year. The 399 monthly price is retired
//   (owner, 26 Oct 2026: professionals never pay monthly), and the plan comes
//   with NO points (owner ٢٩١: standard subscriptions open with 0 points).
// - Points come from top-ups only. The professionals' packs start at 500
//   (owner ٣٠٢ / conflict ١١ of 30 Oct 2026; pricing doc §4هـ): 500→500,
//   1,000→1,250, 2,500→3,500, 5,000→8,500, 10,000→25,000. The 100 and 250
//   packs are the individuals' only (pricing.individuals.ts).
// - Top-up points expire: 3, 6, 12, 12 and 12 months from purchase, as
//   src/lib/payments/catalog.ts grants them; each card's `desc` says so.
// - Points are prepaid usage units for Nezamy's own AI tools only. They are
//   never called a wallet or a cash balance, never move between users and
//   never pay a lawyer's fee (a stored-value product would need a SAMA
//   licence — owner answer ١٧٨).
// - The doc's larger «فترة العروض» balances (700 / 1,500 / 5,000 / 12,500 /
//   30,000) are not dated by the owner, so no card or checkout grants them.
// The independent consultant pays the same (owner answer ١٧٣); see
// pricing.providers.ts.

export const plansLawyers: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "lawyer-pro", name: "المحامي المحترف", badge: null,
      periodMonthly: "ر.س / شهر", periodYearly: "ر.س / سنة",
      desc: "اشتراك سنوي لإدارة الممارسة؛ نقاط أدوات الذكاء الاصطناعي بحزم الشحن", target: "محامٍ مرخّص",
      cta: "اشترك الآن", ctaHref: "/register/provider?plan=lawyer-pro", highlighted: true, color: "border-royal/20",
      features: {
        ai: [
          "النقاط بحزم الشحن المستقلة",
          "صياغة المذكرات واللوائح: ١٥ نقطة",
          "صياغة العقود وتدقيقها: ١٠ نقاط",
        ],
        platform: ["إدارة القضايا والجلسات والمهل", "الموكّلون والاستشارات والعقود"],
        support: [],
      },
    },
    {
      id: "topup-500", name: "شحن ٥٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٥٠٠ نقطة · صالحة ٣ أشهر", target: "شحن إضافي للمشترك",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-500", highlighted: false, color: "border-blue-200/60 dark:border-blue-500/20",
      features: { ai: ["٥٠٠ نقطة", "١ ر.س للنقطة"], platform: [], support: [] },
    },
    {
      id: "topup-1000", name: "شحن ١٬٠٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "١٬٢٥٠ نقطة · صالحة ٦ أشهر", target: "شحن إضافي للمشترك", bonusLabel: "+٢٥٠ نقطة مجاناً",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-1000", highlighted: false, color: "border-emerald-200/60 dark:border-emerald-500/20",
      features: { ai: ["١٬٢٥٠ نقطة", "نحو ٠٫٨٠ ر.س للنقطة"], platform: [], support: [] },
    },
    {
      id: "topup-2500", name: "شحن ٢٬٥٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٣٬٥٠٠ نقطة · صالحة ١٢ شهراً", target: "شحن إضافي للمشترك", bonusLabel: "+١٬٠٠٠ نقطة مجاناً",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-2500", highlighted: false, color: "border-gold/20",
      features: { ai: ["٣٬٥٠٠ نقطة", "نحو ٠٫٧١ ر.س للنقطة"], platform: [], support: [] },
    },
    {
      id: "topup-5000", name: "شحن ٥٬٠٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٨٬٥٠٠ نقطة · صالحة ١٢ شهراً", target: "شحن إضافي للمشترك", bonusLabel: "+٣٬٥٠٠ نقطة مجاناً",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-5000", highlighted: false, color: "border-[#C8A762]/25",
      features: { ai: ["٨٬٥٠٠ نقطة", "نحو ٠٫٥٩ ر.س للنقطة"], platform: [], support: [] },
    },
    {
      id: "topup-10000", name: "شحن ١٠٬٠٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٢٥٬٠٠٠ نقطة · صالحة ١٢ شهراً", target: "شحن إضافي للمشترك", bonusLabel: "+١٥٬٠٠٠ نقطة مجاناً",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-10000", highlighted: false, color: "border-royal/20",
      features: { ai: ["٢٥٬٠٠٠ نقطة", "٠٫٤٠ ر.س للنقطة"], platform: [], support: [] },
    },
  ],
  en: [
    {
      id: "lawyer-pro", name: "Professional Lawyer", badge: null,
      periodMonthly: "SAR / month", periodYearly: "SAR / year",
      desc: "Yearly practice-management subscription; AI points come from top-ups", target: "Licensed lawyer",
      cta: "Subscribe", ctaHref: "/register/provider?plan=lawyer-pro", highlighted: true, color: "border-royal/20",
      features: {
        ai: [
          "Points from separate top-ups",
          "Briefs and pleadings: 15 points",
          "Contract drafting and review: 10 points",
        ],
        platform: ["Cases, hearings and deadlines", "Clients, consultations and contracts"],
        support: [],
      },
    },
    {
      id: "topup-500", name: "Top-up 500", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "500 points · valid for 3 months", target: "Extra points for subscribers",
      cta: "Top up", ctaHref: "/register/provider?plan=topup-500", highlighted: false, color: "border-blue-200/60 dark:border-blue-500/20",
      features: { ai: ["500 points", "SAR 1 per point"], platform: [], support: [] },
    },
    {
      id: "topup-1000", name: "Top-up 1,000", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "1,250 points · valid for 6 months", target: "Extra points for subscribers", bonusLabel: "+250 free points",
      cta: "Top up", ctaHref: "/register/provider?plan=topup-1000", highlighted: false, color: "border-emerald-200/60 dark:border-emerald-500/20",
      features: { ai: ["1,250 points", "About SAR 0.80 per point"], platform: [], support: [] },
    },
    {
      id: "topup-2500", name: "Top-up 2,500", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "3,500 points · valid for 12 months", target: "Extra points for subscribers", bonusLabel: "+1,000 free points",
      cta: "Top up", ctaHref: "/register/provider?plan=topup-2500", highlighted: false, color: "border-gold/20",
      features: { ai: ["3,500 points", "About SAR 0.71 per point"], platform: [], support: [] },
    },
    {
      id: "topup-5000", name: "Top-up 5,000", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "8,500 points · valid for 12 months", target: "Extra points for subscribers", bonusLabel: "+3,500 free points",
      cta: "Top up", ctaHref: "/register/provider?plan=topup-5000", highlighted: false, color: "border-[#C8A762]/25",
      features: { ai: ["8,500 points", "About SAR 0.59 per point"], platform: [], support: [] },
    },
    {
      id: "topup-10000", name: "Top-up 10,000", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "25,000 points · valid for 12 months", target: "Extra points for subscribers", bonusLabel: "+15,000 free points",
      cta: "Top up", ctaHref: "/register/provider?plan=topup-10000", highlighted: false, color: "border-royal/20",
      features: { ai: ["25,000 points", "SAR 0.40 per point"], platform: [], support: [] },
    },
  ],
};

// ─── Point costs per tool (owner answers ١٧٨ and ٢١٦) — shown below the cards ─
// This is the price list, and the hub's point badges read it: a row's `tools`
// names the catalog ids it prices, and TOOL_POINT_LABELS
// (src/constants/lawyerAiCatalog.ts) repeats its label for those ids
// (pricingApprovals.test.ts holds the two equal). Only the tools the owner
// priced are listed: a missing price is better than a guessed one.
// Not listed although ٢١٦ prices them: «المقارن الذكي» and «المترجم القانوني»,
// which still return canned output. A price over a tool that does not work is
// a false promise (pricingHonesty.test.ts forbids pricing a «قريباً» tool).
// Points are not deducted yet: automatic deduction starts with electronic
// payment (owner gate G4).
export interface ServiceRow {
  name: string;
  points: number;
  /** Shown instead of `points` when the cost is a range («١–٢»). */
  pointsLabel?: string;
  /** The catalog ids (LawyerAiPermission) this row prices on the hub. */
  tools?: string[];
  note?: string;
}

/** Shown under the price list (owner answer ٢١٦): the archive costs no points. */
export const LAWYER_ARCHIVE_NOTE = {
  ar: "الأرشيف السحابي: ضمن سعة الباقة",
  en: "Cloud archive: within the plan's storage",
};
export interface ServiceCategory {
  category: string;
  emoji: string;
  color: string;   // tailwind text colour class
  items: ServiceRow[];
}

export const lawyerServicesTable: ServiceCategory[] = [
  {
    category: "الصياغة",
    emoji: "📋",
    color: "text-blue-400",
    items: [
      { name: "الصائغ القانوني: المذكرات ومذكرات الدفاع واللوائح الاعتراضية", points: 15, tools: ["ai:draft"] },
      { name: "صياغة العقود وتدقيقها ومصفوفة المخاطر", points: 10, tools: ["ai:contracts"] },
      { name: "الصياغة من نموذج", points: 5, pointsLabel: "٥–٨" },
    ],
  },
  {
    category: "التحليل",
    emoji: "🔍",
    color: "text-amber-400",
    items: [
      // Owner answer ١١٥: the attachment digest (٨) and, under «أدوات مساعدة»,
      // the transcriber + secretary row (٥) are off this list until those pages
      // work — all three say «قريباً». Their prices are kept in the comment
      // above TOOL_POINT_LABELS (lawyerAiCatalog.ts) for when they return.
      { name: "فحص المذكرة الشكلي والموضوعي", points: 5 },
      { name: "مولّد أسئلة الاستجواب", points: 5, pointsLabel: "٥–٨" },
      { name: "منقح ناجز", points: 5, pointsLabel: "٥–٨", tools: ["ai:najiz-optimizer"] },
    ],
  },
  {
    category: "الأدوات المعمّقة والتقارير",
    emoji: "⚖️",
    color: "text-rose-400",
    items: [
      { name: "المحاكي القضائي", points: 15, pointsLabel: "١٥–٢٠", tools: ["ai:wargaming"] },
      { name: "تقرير العناية الواجبة", points: 15, pointsLabel: "١٥–٢٠" },
      { name: "الرأي الفصل", points: 15, pointsLabel: "١٥–٢٠", tools: ["ai:legal-opinion"] },
    ],
  },
  {
    category: "أدوات مساعدة",
    emoji: "⚡",
    color: "text-purple-400",
    items: [
      { name: "المساعد القانوني والتشريع المقارن", points: 5 },
      { name: "البحث الدلالي وشرح المواد في المكتبة", points: 1, pointsLabel: "١–٢" },
    ],
  },
  {
    category: "مجاني دائماً ✅",
    emoji: "🎁",
    color: "text-green-400",
    items: [
      { name: "المرشد القضائي", points: 0 },
      { name: "الحاسبة القانونية", points: 0 },
      { name: "المجمّع البحثي", points: 0 },
      { name: "المجتمع القانوني", points: 0 },
    ],
  },
];

// ─── Comparison Table ─────────────────────────────────────────────────────────
// Keys are the plan ids above (the table's columns come from the plan list).
export const comparisonLawyers: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "الاشتراك وحزم الشحن", icon: Lightning, rows: [
      { feature: "النقاط",      "lawyer-pro": "بالشحن", "topup-500": "٥٠٠",   "topup-1000": "١٬٢٥٠",       "topup-2500": "٣٬٥٠٠",       "topup-5000": "٨٬٥٠٠",       "topup-10000": "٢٥٬٠٠٠" },
      { feature: "نقاط مجانية", "lawyer-pro": "—",      "topup-500": "—",     "topup-1000": "+٢٥٠",        "topup-2500": "+١٬٠٠٠",      "topup-5000": "+٣٬٥٠٠",      "topup-10000": "+١٥٬٠٠٠" },
      { feature: "سعر النقطة",  "lawyer-pro": "—",      "topup-500": "١ ر.س", "topup-1000": "نحو ٠٫٨٠ ر.س", "topup-2500": "نحو ٠٫٧١ ر.س", "topup-5000": "نحو ٠٫٥٩ ر.س", "topup-10000": "٠٫٤٠ ر.س" },
      { feature: "الصلاحية",    "lawyer-pro": "—",      "topup-500": "٣ أشهر", "topup-1000": "٦ أشهر",      "topup-2500": "١٢ شهراً",     "topup-5000": "١٢ شهراً",     "topup-10000": "١٢ شهراً" },
    ]},
    { category: "المنصة", icon: Gavel, rows: [
      { feature: "إدارة القضايا والجلسات والمهل", "lawyer-pro": true, "topup-500": "مع الاشتراك", "topup-1000": "مع الاشتراك", "topup-2500": "مع الاشتراك", "topup-5000": "مع الاشتراك", "topup-10000": "مع الاشتراك" },
    ]},
  ],
  en: [
    { category: "Subscription & top-ups", icon: Lightning, rows: [
      { feature: "Points",          "lawyer-pro": "Top-ups", "topup-500": "500",      "topup-1000": "1,250",          "topup-2500": "3,500",          "topup-5000": "8,500",          "topup-10000": "25,000" },
      { feature: "Free points",     "lawyer-pro": "—",       "topup-500": "—",        "topup-1000": "+250",           "topup-2500": "+1,000",         "topup-5000": "+3,500",         "topup-10000": "+15,000" },
      { feature: "Price per point", "lawyer-pro": "—",       "topup-500": "SAR 1",    "topup-1000": "About SAR 0.80", "topup-2500": "About SAR 0.71", "topup-5000": "About SAR 0.59", "topup-10000": "SAR 0.40" },
      { feature: "Valid for",       "lawyer-pro": "—",       "topup-500": "3 months", "topup-1000": "6 months",       "topup-2500": "12 months",      "topup-5000": "12 months",      "topup-10000": "12 months" },
    ]},
    { category: "Platform", icon: Gavel, rows: [
      { feature: "Cases, hearings and deadlines", "lawyer-pro": true, "topup-500": "With the subscription", "topup-1000": "With the subscription", "topup-2500": "With the subscription", "topup-5000": "With the subscription", "topup-10000": "With the subscription" },
    ]},
  ],
};
