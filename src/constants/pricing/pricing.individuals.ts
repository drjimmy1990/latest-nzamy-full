import { Brain, Gavel, Users, UsersThree, ShieldCheck, Scales, Sparkle } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";
import {
  BILLING_LABEL_AR,
  BILLING_LABEL_EN,
  bookEntry,
  bookPriceText,
  offeredBillings,
} from "../../lib/pricing/priceBook";

/**
 * The cycles the book sells an id in today, e.g. «سنوي» — read from the book,
 * so the table never names a cycle checkout refuses. Never throws: an id the
 * book no longer sells gives "-".
 */
const soldCycles = (id: string, lang: "ar" | "en"): string => {
  const entry = bookEntry(id);
  const labels = entry ? offeredBillings(entry).map((b) => (lang === "ar" ? BILLING_LABEL_AR : BILLING_LABEL_EN)[b]) : [];
  return labels.length > 0 ? labels.join(" / ") : "-";
};

// ─── Plans: Individuals Pricing Pyramid (Owner & Council Decisions 165/168) ──
// 1. pay-per-piece: الدفع بالعمل القانوني المقطوع (بدون اشتراك)
// 2. ind-ai: الباقة الذكية الذاتية — ٢٤٩ ر.س سنوياً قبل الضريبة، سنوي فقط
//    (owner package of 1 Nov 2026 §6.2.1, q329: the 29 / 79 / 149 cycles and
//    the 199 launch price are retired in the price book).
// 3. topup-100 / topup-250: point top-ups for individuals only, valid 3
//    months (owner ٣٠٢, conflict ١١); the professionals' packs start at 500.
// Retired (q329, Wave 1 task 5): «الباقة الوقائية» (ind-preventive) and the
// 399 plan ind-litigation are not sold in any cycle, so they have no card and
// no comparison column. Their ids stay in the price book for the orders and
// subscriptions that point at them.
// 4. ind-protection: «عضوية الحماية القانونية» (owner ٤٢٠ / ٤٣٤) — shown as a
//    non-buyable «قريباً» card with no price (its price is owner question
//    ٤٥٣). Not a price-book id; when it is sold it gets a book entry.

export const plansIndividuals: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "pay-per-piece",
      name: "الدفع بالعمل القانوني",
      badge: "بدون اشتراك",
      priceMonthly: "حسب الخدمة",
      priceYearly: "بدون اشتراك",
      periodMonthly: "تسعير مقطوع لكل عمل",
      periodYearly: "ادفع فقط مقابل ما تطلبه",
      desc: "صياغة مذكرات، عقود، وترافع قضائي متخصص — ادفع فقط عند الحاجة دون أي التزام سنوي",
      target: "أفراد",
      cta: "اطلب خدمة الآن",
      // The client's «اطلب خدمة جديدة» catalogue (sidebar). It used to point
      // at /dashboard/client/draft, a route that does not exist.
      ctaHref: "/dashboard/client/services",
      highlighted: false,
      color: "border-slate-300",
      isBetaHidden: false,
      features: {
        ai: [
          // No per-service figure here: those prices live in admin_pricing_catalog
          // (P1 design note §1) and two of the old ones contradicted it
          // (٢٥٠ for a 30-minute video call vs 500; ١,٥٠٠ for a reply brief vs 1,000).
          // The service list the CTA opens shows the current figure.
          "استشارة مرئية أو حضورية مع محامٍ مرخّص",
          "صياغة المذكرات الجوابية ولوائح الدعوى والاستئناف",
          "مراجعة العقود وتدقيقها",
          "سعر كل خدمة معروض في قائمة الخدمات قبل الطلب",
        ],
        platform: [
          "تمثيل قضائي وترافع مخصص من محامٍ مرخّص",
          // No Escrow line (owner Q3/Q28): fees are paid outside the
          // platform and nothing is held on the client's behalf.
          "فحص تعارض المصالح والتدقيق المكتبي قبل التسليم",
          "لا يوجد أي اشتراك دوري أو رسوم خفية",
        ],
        support: ["متابعة مسار الطلب عبر المنصة", "تحديثات دورية حتى اكتمال الخدمة"],
      },
    },
    {
      id: "ind-ai",
      isBetaHidden: false,
      name: "الباقة الذكية (AI الذاتي)",
      // Owner ٤١٩ (3 Nov 2026): the yearly 249 shown as its monthly
      // equivalent, 249 / 12 = 20.75 (pricingApprovals.test.ts checks it
      // against the book). No «بدلاً من» figure: the monthly cycle is retired.
      badge: "ما يعادل ٢٠٫٧٥ ر.س شهرياً تُدفع سنوياً",
      periodMonthly: "ر.س / شهر",
      periodYearly: "ر.س / سنة",
      desc: "مستشارك القانوني الذكي — إجابات نظامية وصياغة خطابات وإنذارات",
      target: "الأفراد والمستقلون والموظفون",
      cta: "اشترك في الباقة الذكية",
      ctaHref: "/register/client?type=individual&plan=ind-ai",
      highlighted: false,
      color: "border-emerald-300",
      features: {
        ai: [
          // LIVE-F11: no «غير محدود» claim, and no «٣ عقود شخصية سنوياً»
          // (conflict ٧: the contract check stays hidden until it is wired).
          "مساعد قانوني ذكي ذاتي طوال الاشتراك",
          "استشهاد مباشر وفوري بمواد الأنظمة واللوائح السعودية",
          "توليد ومراجعة مسودات الخطابات والإنذارات الرسمية",
          "حاسبة الرسوم القضائية ومحدد مدد التقادم النظامية",
        ],
        platform: [
          "حساب رقمي متكامل لحفظ استفساراتك واستشاراتك",
          "إمكانية شراء استشارات محامين مرخصين بأسعار تفضيلية",
          // Was «لا تتطلب أي فحص طبي أو موافقة مسبقة» — insurance boilerplate
          // (no legal plan has a medical check) that also overstated speed:
          // every subscription is still activated after the team reviews it.
          // No longer names «التأمين القانوني»: that plan is retired (q329).
          "لا تخضع لفحص اكتتاب",
        ],
        support: ["دعم فني عبر المنصة والبريد"],
      },
    },
    {
      id: "topup-100", name: "شحن ١٠٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "١٠٠ نقطة · صالحة ٣ أشهر", target: "شحن نقاط للأفراد",
      cta: "اشحن الآن", ctaHref: "/register/client?type=individual&plan=topup-100", highlighted: false, color: "border-blue-200/60 dark:border-blue-500/20",
      features: { ai: ["١٠٠ نقطة", "١ ر.س للنقطة", "لأدوات الذكاء الاصطناعي للأفراد بالنقاط"], platform: [], support: [] },
    },
    {
      id: "topup-250", name: "شحن ٢٥٠", badge: null,
      periodMonthly: "ر.س / الشحنة", periodYearly: "ر.س / الشحنة",
      desc: "٢٥٠ نقطة · صالحة ٣ أشهر", target: "شحن نقاط للأفراد",
      cta: "اشحن الآن", ctaHref: "/register/client?type=individual&plan=topup-250", highlighted: false, color: "border-emerald-200/60 dark:border-emerald-500/20",
      features: { ai: ["٢٥٠ نقطة", "١ ر.س للنقطة", "لأدوات الذكاء الاصطناعي للأفراد بالنقاط"], platform: [], support: [] },
    },
    {
      id: "ind-protection", name: "عضوية الحماية القانونية", badge: null, comingSoon: true,
      periodMonthly: "", periodYearly: "",
      desc: "حماية قانونية سنوية للأفراد — تُفتح قريباً", target: "الأفراد",
      // No signup link: nothing is sold yet (planRequest.ts never resolves it).
      cta: "قريباً", ctaHref: "/pricing", highlighted: false, color: "border-slate-200/60 dark:border-white/10",
      features: { ai: [], platform: [], support: [] },
    },
  ],
  en: [
    {
      id: "pay-per-piece",
      name: "Pay Per Legal Work",
      badge: "No Subscription",
      priceMonthly: "Per Service",
      priceYearly: "0 SAR",
      periodMonthly: "Fixed fee per deliverable",
      periodYearly: "Pay only for what you need",
      desc: "Drafting briefs, contracts, and court representation — on-demand legal services without subscription commitments",
      target: "Individuals",
      cta: "Request Service",
      ctaHref: "/dashboard/client/services",
      highlighted: false,
      color: "border-slate-300",
      isBetaHidden: false,
      features: {
        ai: [
          "Video or in-person consultation with a licensed lawyer",
          "Reply briefs, statements of claim and appeals",
          "Contract review & legal audit",
          "Each service's price is shown in the service list before you order",
        ],
        platform: [
          "Full court representation by licensed Saudi attorneys",
          "Conflict-of-interest checks & internal quality gates",
          "Zero recurring fees or hidden charges",
        ],
        support: ["Request tracking on the platform", "Periodic updates until the service is complete"],
      },
    },
    {
      id: "ind-ai",
      isBetaHidden: false,
      name: "Smart AI Self-Service",
      badge: "≈ SAR 20.75/month, billed yearly",
      periodMonthly: "SAR / month",
      periodYearly: "SAR / year",
      desc: "Your AI legal assistant — statutory answers and draft notices",
      target: "Individuals, Employees & Freelancers",
      cta: "Subscribe to Smart AI",
      ctaHref: "/register/client?type=individual&plan=ind-ai",
      highlighted: false,
      color: "border-emerald-300",
      features: {
        ai: [
          "Self-service AI legal assistant for the whole subscription",
          "Direct citations from Saudi statutory laws",
          "Draft generation for notices and official correspondence",
          "Court fees & limitation period calculators",
        ],
        platform: [
          "Full digital profile to archive your questions and drafts",
          "Access to licensed lawyer consultations at discounted rates",
          "No underwriting review",
        ],
        support: ["Platform & email technical support"],
      },
    },
    {
      id: "topup-100", name: "Top-up 100", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "100 points · valid for 3 months", target: "Points for individuals",
      cta: "Top up", ctaHref: "/register/client?type=individual&plan=topup-100", highlighted: false, color: "border-blue-200/60 dark:border-blue-500/20",
      features: { ai: ["100 points", "SAR 1 per point", "For the individuals' AI tools priced in points"], platform: [], support: [] },
    },
    {
      id: "topup-250", name: "Top-up 250", badge: null,
      periodMonthly: "SAR / top-up", periodYearly: "SAR / top-up",
      desc: "250 points · valid for 3 months", target: "Points for individuals",
      cta: "Top up", ctaHref: "/register/client?type=individual&plan=topup-250", highlighted: false, color: "border-emerald-200/60 dark:border-emerald-500/20",
      features: { ai: ["250 points", "SAR 1 per point", "For the individuals' AI tools priced in points"], platform: [], support: [] },
    },
    {
      id: "ind-protection", name: "Legal Protection Membership", badge: null, comingSoon: true,
      periodMonthly: "", periodYearly: "",
      desc: "Yearly legal protection for individuals — opening soon", target: "Individuals",
      cta: "Coming soon", ctaHref: "/pricing", highlighted: false, color: "border-slate-200/60 dark:border-white/10",
      features: { ai: [], platform: [], support: [] },
    },
  ],
};

// ─── Comparison Tables: Individuals ──────────────────────────────────────────
// Columns: the cards above that are sold (pay-per-piece, ind-ai). The retired
// plans' columns, the underwriting row (it described the retired legal
// insurance only) and the monthly-price row (no individual plan is sold
// monthly, q329) are gone; the billing row is read from the book.
export const comparisonIndividuals: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    {
      category: "الذكاء الاصطناعي والوقاية",
      icon: Brain,
      rows: [
        { feature: "الذكاء الاصطناعي القانوني",   "pay-per-piece": "محدود",          "ind-ai": "مساعد ذاتي" },
        { feature: "الاستشهاد بالمواد النظامية",  "pay-per-piece": true,            "ind-ai": true },
        { feature: "فحص وتدقيق العقود",          "pay-per-piece": "حسب قائمة الخدمات", "ind-ai": "خصم ١٠٪" },
        { feature: "صياغة الخطابات والإنذارات",   "pay-per-piece": "حسب الخدمة",     "ind-ai": true },
      ],
    },
    {
      category: "المحامي المرخّص والتمثيل القضائي",
      icon: Gavel,
      rows: [
        { feature: "استشارات مع محامٍ مرخّص",    "pay-per-piece": "حسب قائمة الخدمات", "ind-ai": "سعر تفضيلي" },
        { feature: "خصم أتعاب الترافع والقضايا", "pay-per-piece": "-",              "ind-ai": "٥٪" },
        { feature: "تمثيل قضائي وترافع بالمحاكم", "pay-per-piece": "أتعاب متفق عليها","ind-ai": "-" },
      ],
    },
    {
      category: "هيكل الاشتراك والمجموعة",
      icon: UsersThree,
      rows: [
        { feature: "عدد المستفيدين",             "pay-per-piece": "فرد",           "ind-ai": "فرد واحد" },
        { feature: "طريقة السداد",                "pay-per-piece": "عند الطلب",     "ind-ai": soldCycles("ind-ai", "ar") },
        { feature: "عزل الخصوصية (RLS)",         "pay-per-piece": true,            "ind-ai": true },
      ],
    },
    {
      category: "التكلفة والدعم",
      icon: ShieldCheck,
      rows: [
        { feature: "سعر الاشتراك السنوي",         "pay-per-piece": "صفر ر.س",       "ind-ai": `${bookPriceText("ind-ai", "yearly", "ar")} ر.س` },
        { feature: "مستوى الدعم الفني",           "pay-per-piece": "دعم للطلب",     "ind-ai": "دعم عبر المنصة" },
      ],
    },
  ],
  en: [
    {
      category: "AI & Preventive Law",
      icon: Brain,
      rows: [
        { feature: "Legal AI Queries",            "pay-per-piece": "Limited",       "ind-ai": "Self-service" },
        { feature: "Statutory Article Citations", "pay-per-piece": true,            "ind-ai": true },
        { feature: "Contract Audit & Review",     "pay-per-piece": "Per the service list","ind-ai": "10% off" },
        { feature: "Notice & Letter Drafting",    "pay-per-piece": "Per service",   "ind-ai": true },
      ],
    },
    {
      category: "Licensed Lawyers & Court Cases",
      icon: Gavel,
      rows: [
        { feature: "Lawyer Consultations",        "pay-per-piece": "Per the service list","ind-ai": "Discounted rate" },
        { feature: "Litigation Fees Discount",    "pay-per-piece": "-",             "ind-ai": "5%" },
        { feature: "Court Representation",        "pay-per-piece": "Agreed fee",    "ind-ai": "-" },
      ],
    },
    {
      category: "Subscription & Group Architecture",
      icon: UsersThree,
      rows: [
        { feature: "Number of Members",           "pay-per-piece": "Solo",          "ind-ai": "Solo" },
        { feature: "Billing Mechanism",           "pay-per-piece": "On demand",     "ind-ai": soldCycles("ind-ai", "en") },
        { feature: "Data Privacy Isolation (RLS)","pay-per-piece": true,            "ind-ai": true },
      ],
    },
    {
      category: "Pricing & Support",
      icon: ShieldCheck,
      rows: [
        { feature: "Annual Subscription Price",   "pay-per-piece": "0 SAR",         "ind-ai": `${bookPriceText("ind-ai", "yearly", "en")} SAR` },
        { feature: "Support Level",               "pay-per-piece": "Order support", "ind-ai": "Platform support" },
      ],
    },
  ],
};
