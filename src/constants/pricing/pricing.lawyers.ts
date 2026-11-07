import { Lightning, Gavel } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";
import { aiToolPriceText, type PricedAiToolRef } from "@/lib/ai/toolPointsDisplay";
import { topupBonusLabel, topupPointsTextById } from "../../lib/pricing/priceBook";

// ─── Lawyers: one subscription + point top-ups (owner answers ١٧٤ / ١٧٨, 2026-10-16) ─
// - «المحامي المحترف»: 3,990 SAR/year. The 399 monthly price is retired
//   (owner, 26 Oct 2026: professionals never pay monthly), and the plan comes
//   with NO points (owner ٢٩١: standard subscriptions open with 0 points).
// - Points come from top-ups only. The professionals' packs start at 500
//   (owner ٣٠٢ / conflict ١١ of 30 Oct 2026; pricing doc §4هـ) and, since
//   owner ٤٢٢ (3 Nov 2026), grant 500→700, 1,000→1,500, 2,500→5,000,
//   5,000→12,500, 10,000→30,000. The 100 and 250 packs are the
//   individuals' only (pricing.individuals.ts).
// - Ruling R2: no per-point price line (1 point = 1 SAR, owner ٤١٢). A card
//   says «X نقطة (منها Y نقطة مكافأة)»; the feature line and the bonus pill
//   are read from the price book (topupPointsTextById / topupBonusLabel).
//   `desc` stays a literal (pricingHonesty.test.ts parses it) and
//   pricingApprovals.test.ts holds it to the book.
// - Top-up points expire: 3, 6, 12, 12 and 12 months from purchase, as
//   src/lib/payments/catalog.ts grants them; each card's `desc` says so.
// - Points are prepaid usage units for Nezamy's own AI tools only. They are
//   never called a wallet or a cash balance, never move between users and
//   never pay a lawyer's fee (a stored-value product would need a SAMA
//   licence — owner answer ١٧٨).
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
          // The registry's charge (Wave 1 task 4), never a figure typed here.
          `صياغة المذكرات واللوائح: ${aiToolPriceText("legal-drafter", "ar")}`,
          `صياغة العقود وتدقيقها: ${aiToolPriceText("contracts-pro", "ar")}`,
        ],
        platform: ["إدارة القضايا والجلسات والمهل", "الموكّلون والاستشارات والعقود"],
        support: [],
      },
    },
    {
      id: "topup-500", name: "شحن ٥٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٧٠٠ نقطة (منها ٢٠٠ نقطة مكافأة) · صالحة ٣ أشهر", target: "شحن إضافي للمشترك", bonusLabel: topupBonusLabel("topup-500", "ar") ?? undefined,
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-500", highlighted: false, color: "border-blue-200/60 dark:border-blue-500/20",
      features: { ai: [topupPointsTextById("topup-500", "ar")], platform: [], support: [] },
    },
    {
      id: "topup-1000", name: "شحن ١٬٠٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "١٬٥٠٠ نقطة (منها ٥٠٠ نقطة مكافأة) · صالحة ٦ أشهر", target: "شحن إضافي للمشترك", bonusLabel: topupBonusLabel("topup-1000", "ar") ?? undefined,
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-1000", highlighted: false, color: "border-emerald-200/60 dark:border-emerald-500/20",
      features: { ai: [topupPointsTextById("topup-1000", "ar")], platform: [], support: [] },
    },
    {
      id: "topup-2500", name: "شحن ٢٬٥٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٥٬٠٠٠ نقطة (منها ٢٬٥٠٠ نقطة مكافأة) · صالحة ١٢ شهراً", target: "شحن إضافي للمشترك", bonusLabel: topupBonusLabel("topup-2500", "ar") ?? undefined,
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-2500", highlighted: false, color: "border-gold/20",
      features: { ai: [topupPointsTextById("topup-2500", "ar")], platform: [], support: [] },
    },
    {
      id: "topup-5000", name: "شحن ٥٬٠٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "١٢٬٥٠٠ نقطة (منها ٧٬٥٠٠ نقطة مكافأة) · صالحة ١٢ شهراً", target: "شحن إضافي للمشترك", bonusLabel: topupBonusLabel("topup-5000", "ar") ?? undefined,
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-5000", highlighted: false, color: "border-[#C8A762]/25",
      features: { ai: [topupPointsTextById("topup-5000", "ar")], platform: [], support: [] },
    },
    {
      id: "topup-10000", name: "شحن ١٠٬٠٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٣٠٬٠٠٠ نقطة (منها ٢٠٬٠٠٠ نقطة مكافأة) · صالحة ١٢ شهراً", target: "شحن إضافي للمشترك", bonusLabel: topupBonusLabel("topup-10000", "ar") ?? undefined,
      cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-10000", highlighted: false, color: "border-royal/20",
      features: { ai: [topupPointsTextById("topup-10000", "ar")], platform: [], support: [] },
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
          `Briefs and pleadings: ${aiToolPriceText("legal-drafter", "en")}`,
          `Contract drafting and review: ${aiToolPriceText("contracts-pro", "en")}`,
        ],
        platform: ["Cases, hearings and deadlines", "Clients, consultations and contracts"],
        support: [],
      },
    },
    {
      id: "topup-500", name: "Top-up 500", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "700 points (200 bonus) · valid for 3 months", target: "Extra points for subscribers", bonusLabel: topupBonusLabel("topup-500", "en") ?? undefined,
      cta: "Top up", ctaHref: "/register/provider?plan=topup-500", highlighted: false, color: "border-blue-200/60 dark:border-blue-500/20",
      features: { ai: [topupPointsTextById("topup-500", "en")], platform: [], support: [] },
    },
    {
      id: "topup-1000", name: "Top-up 1,000", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "1,500 points (500 bonus) · valid for 6 months", target: "Extra points for subscribers", bonusLabel: topupBonusLabel("topup-1000", "en") ?? undefined,
      cta: "Top up", ctaHref: "/register/provider?plan=topup-1000", highlighted: false, color: "border-emerald-200/60 dark:border-emerald-500/20",
      features: { ai: [topupPointsTextById("topup-1000", "en")], platform: [], support: [] },
    },
    {
      id: "topup-2500", name: "Top-up 2,500", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "5,000 points (2,500 bonus) · valid for 12 months", target: "Extra points for subscribers", bonusLabel: topupBonusLabel("topup-2500", "en") ?? undefined,
      cta: "Top up", ctaHref: "/register/provider?plan=topup-2500", highlighted: false, color: "border-gold/20",
      features: { ai: [topupPointsTextById("topup-2500", "en")], platform: [], support: [] },
    },
    {
      id: "topup-5000", name: "Top-up 5,000", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "12,500 points (7,500 bonus) · valid for 12 months", target: "Extra points for subscribers", bonusLabel: topupBonusLabel("topup-5000", "en") ?? undefined,
      cta: "Top up", ctaHref: "/register/provider?plan=topup-5000", highlighted: false, color: "border-[#C8A762]/25",
      features: { ai: [topupPointsTextById("topup-5000", "en")], platform: [], support: [] },
    },
    {
      id: "topup-10000", name: "Top-up 10,000", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "30,000 points (20,000 bonus) · valid for 12 months", target: "Extra points for subscribers", bonusLabel: topupBonusLabel("topup-10000", "en") ?? undefined,
      cta: "Top up", ctaHref: "/register/provider?plan=topup-10000", highlighted: false, color: "border-royal/20",
      features: { ai: [topupPointsTextById("topup-10000", "en")], platform: [], support: [] },
    },
  ],
};

// ─── Point costs per tool (owner answers ١٧٨ and ٢١٦) — shown below the cards ─
// The price list. A row with an AI tool shows the points that tool's run is
// charged, read from the AI registry (src/lib/ai/toolPointsDisplay.ts) at
// render time; no row writes a number (Wave 1 task 4: the old 15 / 10 /
// «١٥–٢٠» labels were a fraction of the real charge). The hub's badges
// (TOOL_POINT_SOURCES in src/constants/lawyerAiBadges.ts) read the same
// registry, and pricingApprovals.test.ts holds both to the server.
// A row the owner lists whose tool has no backend yet says «قريباً», with no
// number. Not listed although ٢١٦ prices them: «المقارن الذكي» and «المترجم
// القانوني», which still return canned output (pricingHonesty.test.ts forbids
// pricing a «قريباً» tool).
export interface ServiceRow {
  name: string;
  /**
   * `aiTool`: the registry tool(s) the row sells; the cost column prints its
   * charge. "free": a tool that charges nothing. "soon": no backend yet, so
   * «قريباً» and no number.
   */
  price: { aiTool: PricedAiToolRef } | "free" | "soon";
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
      // The drafter's price is per kind (draftKinds.ts), so the cell is a range.
      { name: "الصائغ القانوني: المذكرات ومذكرات الدفاع واللوائح الاعتراضية", price: { aiTool: "legal-drafter" }, tools: ["ai:draft"] },
      { name: "صياغة العقود وتدقيقها ومصفوفة المخاطر", price: { aiTool: "contracts-pro" }, tools: ["ai:contracts"] },
      { name: "الصياغة من نموذج", price: "soon" },
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
      // above TOOL_POINT_SOURCES (lawyerAiBadges.ts) for when they return.
      { name: "فحص المذكرة الشكلي والموضوعي", price: { aiTool: "brief-check" }, tools: ["ai:brief-check"] },
      { name: "مولّد أسئلة الاستجواب", price: "soon" },
      { name: "منقح ناجز", price: { aiTool: "najiz-optimizer" }, tools: ["ai:najiz-optimizer"] },
    ],
  },
  {
    category: "الأدوات المعمّقة والتقارير",
    emoji: "⚖️",
    color: "text-rose-400",
    items: [
      { name: "المحاكي القضائي", price: { aiTool: "wargaming" }, tools: ["ai:wargaming"] },
      { name: "تقرير العناية الواجبة", price: "soon" },
      // The AI writes two of the studio's types; the others are team orders.
      { name: "الرأي الفصل", price: { aiTool: ["legal-opinion-consult", "legal-opinion-letter"] }, tools: ["ai:legal-opinion"], note: "الاستشارة المكتوبة أو الخطاب" },
    ],
  },
  {
    category: "أدوات مساعدة",
    emoji: "⚡",
    color: "text-purple-400",
    items: [
      // Wave 1 task 6: not «والتشريع المقارن» — no comparative-law tool
      // exists (/ai/global is «قريباً»); this row sells the assistant only.
      { name: "المساعد القانوني", price: { aiTool: "assistant" }, tools: ["ai:assistant"] },
      { name: "البحث الدلالي وشرح المواد في المكتبة", price: { aiTool: "library-assistant" } },
    ],
  },
  {
    category: "مجاني دائماً ✅",
    emoji: "🎁",
    color: "text-green-400",
    items: [
      { name: "المرشد القضائي", price: "free" },
      { name: "الحاسبة القانونية", price: "free" },
      { name: "المجمّع البحثي", price: "free" },
      { name: "المجتمع القانوني", price: "free" },
    ],
  },
];

// ─── Comparison Table ─────────────────────────────────────────────────────────
// Keys are the plan ids above (the table's columns come from the plan list).
export const comparisonLawyers: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "الاشتراك وحزم الشحن", icon: Lightning, rows: [
      // R2: no per-point price row (1 point = 1 SAR); the bonus is part of the points.
      { feature: "النقاط",      "lawyer-pro": "بالشحن", "topup-500": "٧٠٠",   "topup-1000": "١٬٥٠٠",       "topup-2500": "٥٬٠٠٠",       "topup-5000": "١٢٬٥٠٠",      "topup-10000": "٣٠٬٠٠٠" },
      { feature: "منها مكافأة", "lawyer-pro": "—",      "topup-500": "٢٠٠",   "topup-1000": "٥٠٠",         "topup-2500": "٢٬٥٠٠",       "topup-5000": "٧٬٥٠٠",       "topup-10000": "٢٠٬٠٠٠" },
      { feature: "الصلاحية",    "lawyer-pro": "—",      "topup-500": "٣ أشهر", "topup-1000": "٦ أشهر",      "topup-2500": "١٢ شهراً",     "topup-5000": "١٢ شهراً",     "topup-10000": "١٢ شهراً" },
    ]},
    { category: "المنصة", icon: Gavel, rows: [
      { feature: "إدارة القضايا والجلسات والمهل", "lawyer-pro": true, "topup-500": "مع الاشتراك", "topup-1000": "مع الاشتراك", "topup-2500": "مع الاشتراك", "topup-5000": "مع الاشتراك", "topup-10000": "مع الاشتراك" },
    ]},
  ],
  en: [
    { category: "Subscription & top-ups", icon: Lightning, rows: [
      { feature: "Points",          "lawyer-pro": "Top-ups", "topup-500": "700",      "topup-1000": "1,500",          "topup-2500": "5,000",          "topup-5000": "12,500",         "topup-10000": "30,000" },
      { feature: "Of which bonus",  "lawyer-pro": "—",       "topup-500": "200",      "topup-1000": "500",            "topup-2500": "2,500",          "topup-5000": "7,500",          "topup-10000": "20,000" },
      { feature: "Valid for",       "lawyer-pro": "—",       "topup-500": "3 months", "topup-1000": "6 months",       "topup-2500": "12 months",      "topup-5000": "12 months",      "topup-10000": "12 months" },
    ]},
    { category: "Platform", icon: Gavel, rows: [
      { feature: "Cases, hearings and deadlines", "lawyer-pro": true, "topup-500": "With the subscription", "topup-1000": "With the subscription", "topup-2500": "With the subscription", "topup-5000": "With the subscription", "topup-10000": "With the subscription" },
    ]},
  ],
};
