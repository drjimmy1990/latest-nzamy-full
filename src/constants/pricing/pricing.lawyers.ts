import { Lightning, Gavel } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Lawyers: one subscription + point top-ups (owner answers ١٧٤ / ١٧٨, 2026-10-16) ─
// - «المحامي المحترف»: 399 SAR/month or 3,990 SAR/year (ten months), with
//   1,500 points every month.
// - Top-ups are extra point packs for a subscriber who uses up the month's
//   points: 1 SAR = 1 point, plus a bonus on the larger packs
//   (100→100, 250→300, 500→700, 1,000→1,500).
// - Top-up points expire: 3, 3, 6 and 12 months from purchase (owner ٢٤٩),
//   as src/lib/payments/catalog.ts grants them; each card's `desc` says so.
// - Points are prepaid usage units for Nezamy's own AI tools only. They are
//   never called a wallet or a cash balance, never move between users and
//   never pay a lawyer's fee (a stored-value product would need a SAMA
//   licence — owner answer ١٧٨).
// - The old 1,000–10,000 SAR packs, their 50–200% bonuses and the
//   launch offers for the first lawyers are gone (owner answers ١٧٤ / ١٧٩).
// The independent consultant pays the same (owner answer ١٧٣); see
// pricing.providers.ts.

export const LAWYER_PRO_MONTHLY_POINTS = 1500;

export const plansLawyers: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "lawyer-pro", name: "المحامي المحترف", badge: null,
      periodMonthly: "ر.س / شهر", periodYearly: "ر.س / سنة",
      desc: "اشتراك يتضمن ١٬٥٠٠ نقطة كل شهر لأدوات الذكاء الاصطناعي", target: "محامٍ مرخّص",
      cta: "اشترك الآن", ctaHref: "/register/provider?plan=lawyer-pro", highlighted: true, color: "border-royal/20",
      features: {
        ai: [
          "١٬٥٠٠ نقطة كل شهر",
          "صياغة المذكرات واللوائح: ١٥ نقطة",
          "صياغة العقود وتدقيقها: ١٠ نقاط",
        ],
        platform: ["إدارة القضايا والجلسات والمهل", "الموكّلون والاستشارات والعقود"],
        support: ["السنوي بسعر عشرة أشهر"],
      },
    },
    {
      id: "topup-100", name: "شحن ١٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "١٠٠ نقطة · صالحة ٣ أشهر", target: "شحن إضافي للمشترك",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-100", highlighted: false, color: "border-blue-200/60 dark:border-blue-500/20",
      features: { ai: ["١٠٠ نقطة", "١ ر.س للنقطة"], platform: [], support: [] },
    },
    {
      id: "topup-250", name: "شحن ٢٥٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٣٠٠ نقطة · صالحة ٣ أشهر", target: "شحن إضافي للمشترك", bonusLabel: "+٥٠ نقطة مجاناً",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-250", highlighted: false, color: "border-emerald-200/60 dark:border-emerald-500/20",
      features: { ai: ["٣٠٠ نقطة", "نحو ٠٫٨٣ ر.س للنقطة"], platform: [], support: [] },
    },
    {
      id: "topup-500", name: "شحن ٥٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٧٠٠ نقطة · صالحة ٦ أشهر", target: "شحن إضافي للمشترك", bonusLabel: "+٢٠٠ نقطة مجاناً",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-500", highlighted: false, color: "border-gold/20",
      features: { ai: ["٧٠٠ نقطة", "نحو ٠٫٧١ ر.س للنقطة"], platform: [], support: [] },
    },
    {
      id: "topup-1000", name: "شحن ١٬٠٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "١٬٥٠٠ نقطة · صالحة ١٢ شهراً", target: "شحن إضافي للمشترك", bonusLabel: "+٥٠٠ نقطة مجاناً",
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-1000", highlighted: false, color: "border-[#C8A762]/25",
      features: { ai: ["١٬٥٠٠ نقطة", "نحو ٠٫٦٧ ر.س للنقطة"], platform: [], support: [] },
    },
  ],
  en: [
    {
      id: "lawyer-pro", name: "Professional Lawyer", badge: null,
      periodMonthly: "SAR / month", periodYearly: "SAR / year",
      desc: "Subscription with 1,500 AI points every month", target: "Licensed lawyer",
      cta: "Subscribe", ctaHref: "/register/provider?plan=lawyer-pro", highlighted: true, color: "border-royal/20",
      features: {
        ai: [
          "1,500 points every month",
          "Briefs and pleadings: 15 points",
          "Contract drafting and review: 10 points",
        ],
        platform: ["Cases, hearings and deadlines", "Clients, consultations and contracts"],
        support: ["Yearly priced at ten months"],
      },
    },
    {
      id: "topup-100", name: "Top-up 100", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "100 points · valid for 3 months", target: "Extra points for subscribers",
      cta: "Top up", ctaHref: "/register/provider?plan=topup-100", highlighted: false, color: "border-blue-200/60 dark:border-blue-500/20",
      features: { ai: ["100 points", "SAR 1 per point"], platform: [], support: [] },
    },
    {
      id: "topup-250", name: "Top-up 250", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "300 points · valid for 3 months", target: "Extra points for subscribers", bonusLabel: "+50 free points",
      cta: "Top up", ctaHref: "/register/provider?plan=topup-250", highlighted: false, color: "border-emerald-200/60 dark:border-emerald-500/20",
      features: { ai: ["300 points", "About SAR 0.83 per point"], platform: [], support: [] },
    },
    {
      id: "topup-500", name: "Top-up 500", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "700 points · valid for 6 months", target: "Extra points for subscribers", bonusLabel: "+200 free points",
      cta: "Top up", ctaHref: "/register/provider?plan=topup-500", highlighted: false, color: "border-gold/20",
      features: { ai: ["700 points", "About SAR 0.71 per point"], platform: [], support: [] },
    },
    {
      id: "topup-1000", name: "Top-up 1,000", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "1,500 points · valid for 12 months", target: "Extra points for subscribers", bonusLabel: "+500 free points",
      cta: "Top up", ctaHref: "/register/provider?plan=topup-1000", highlighted: false, color: "border-[#C8A762]/25",
      features: { ai: ["1,500 points", "About SAR 0.67 per point"], platform: [], support: [] },
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
      { feature: "النقاط",      "lawyer-pro": "١٬٥٠٠ كل شهر", "topup-100": "١٠٠",   "topup-250": "٣٠٠",      "topup-500": "٧٠٠",      "topup-1000": "١٬٥٠٠" },
      { feature: "نقاط مجانية", "lawyer-pro": "—",            "topup-100": "—",     "topup-250": "+٥٠",      "topup-500": "+٢٠٠",     "topup-1000": "+٥٠٠" },
      { feature: "سعر النقطة",  "lawyer-pro": "نحو ٠٫٢٧ ر.س", "topup-100": "١ ر.س", "topup-250": "نحو ٠٫٨٣ ر.س", "topup-500": "نحو ٠٫٧١ ر.س", "topup-1000": "نحو ٠٫٦٧ ر.س" },
    ]},
    { category: "المنصة", icon: Gavel, rows: [
      { feature: "إدارة القضايا والجلسات والمهل", "lawyer-pro": true, "topup-100": "مع الاشتراك", "topup-250": "مع الاشتراك", "topup-500": "مع الاشتراك", "topup-1000": "مع الاشتراك" },
    ]},
  ],
  en: [
    { category: "Subscription & top-ups", icon: Lightning, rows: [
      { feature: "Points",          "lawyer-pro": "1,500 / month",  "topup-100": "100",   "topup-250": "300",            "topup-500": "700",            "topup-1000": "1,500" },
      { feature: "Free points",     "lawyer-pro": "—",              "topup-100": "—",     "topup-250": "+50",            "topup-500": "+200",           "topup-1000": "+500" },
      { feature: "Price per point", "lawyer-pro": "About SAR 0.27", "topup-100": "SAR 1", "topup-250": "About SAR 0.83", "topup-500": "About SAR 0.71", "topup-1000": "About SAR 0.67" },
    ]},
    { category: "Platform", icon: Gavel, rows: [
      { feature: "Cases, hearings and deadlines", "lawyer-pro": true, "topup-100": "With the subscription", "topup-250": "With the subscription", "topup-500": "With the subscription", "topup-1000": "With the subscription" },
    ]},
  ],
};
