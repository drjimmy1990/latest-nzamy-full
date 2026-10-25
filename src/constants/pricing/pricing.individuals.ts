import { Brain, Gavel, Users, UsersThree, ShieldCheck, Scales, Sparkle } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";
import { bookPriceText, bookSar, formatSarAmount } from "../../lib/pricing/priceBook";

/** Twelve months of the monthly price: the «بدلاً من» reference beside the yearly price (yearly view only). */
const twelveMonths = (id: string, lang: "ar" | "en") => formatSarAmount(bookSar(id, "monthly") * 12, lang);

// ─── Plans: Individuals Pricing Pyramid (Owner & Council Decisions 165/168) ──
// 1. pay-per-piece: الدفع بالعمل القانوني المقطوع (بدون اشتراك)
// 2. ind-ai: الباقة الذكية (٣٩ ر.س / شهر أو ٣٩٠ ر.س / سنة) — ذكاء اصطناعي ذاتي
// 3. ind-preventive: الباقة الوقائية (١٤٩ ر.س / شهر أو ١٬٤٩٠ ر.س / سنة) — استشارات وعقود
// 4. ind-litigation: «التأمين القانوني» (٣٩٩ ر.س / شهر أو ٣٬٩٩٠ ر.س / سنة) [تخضع لضوابط الاكتتاب]
//    مع خيار التغطية العائلية (owner answers ٢١٣ + ١٧٦, 2026-10-18). The
//    separate family plan is gone: its cover is an option of this plan now,
//    added on a request the team reviews (no dependants mechanism is built).

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
      badge: "١٫٢٥ ر.س يومياً",
      bonusLabel: "وفر شهرين عند الدفع السنوي",
      priceOriginal: twelveMonths("ind-ai", "ar"),
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
          "ذكاء اصطناعي قانوني غير محدود طوال الاشتراك",
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
          "لا تخضع لفحص الاكتتاب المطلوب في «التأمين القانوني»",
        ],
        support: ["دعم فني عبر المنصة والبريد"],
      },
    },
    {
      id: "ind-preventive",
      isBetaHidden: false,
      name: "الباقة الوقائية (استشارات وعقود)",
      // No «الأكثر طلباً للأفراد» badge (owner, Q164, 2026-10-03): no
      // subscription data supports a popularity claim. `highlighted` keeps
      // the card's emphasis without making one.
      badge: null,
      bonusLabel: "وفر شهرين عند الدفع السنوي",
      priceOriginal: twelveMonths("ind-preventive", "ar"),
      periodMonthly: "ر.س / شهر",
      periodYearly: "ر.س / سنة",
      desc: "درعك الوقائي لحماية حقوقك وتعاملاتك اليومية — استشارات مع محامين مرخصين ومراجعة عقود",
      target: "الموظفون ورجال الأعمال المستقلون",
      cta: "اشترك في الباقة الوقائية",
      ctaHref: "/register/client?type=individual&plan=ind-preventive",
      highlighted: true,
      color: "border-royal/30 shadow-md",
      features: {
        ai: [
          "كل مزايا الباقة الذكية (ذكاء اصطناعي مفتوح)",
          "فحص وقائي تعاقدي وتنبيهات بالمخاطر القانونية",
          "مسودات عقود جاهزة ومعتمدة حسب الأنظمة",
          "تدقيق ومقارنة بنود العقود",
        ],
        platform: [
          "٤ استشارات قانونية سنوية (مرئية/هاتفية) مع محامٍ مرخّص",
          "مراجعة وتدقيق عقدين (٢) سنوياً لضمان خلوها من الثغرات",
          "خصم مستمر ١٥٪ على أتعاب الترافع وكافة القضايا",
          "مراجعة دورية لملفك العقدي والقانوني",
        ],
        support: ["دعم مباشر عبر واتساب"],
      },
    },
    {
      id: "ind-litigation",
      isBetaHidden: false,
      // Owner answer ٢١٣: the commercial name, with «* تطبق الشروط والأحكام»
      // in small grey type under the card (`footnote`).
      name: "التأمين القانوني",
      badge: "تخضع لقواعد الاكتتاب والقبول",
      bonusLabel: "تمثيل وترافع أمام المحاكم",
      priceOriginal: twelveMonths("ind-litigation", "ar"),
      periodMonthly: "ر.س / شهر",
      periodYearly: "ر.س / سنة",
      desc: "تمثيل قضائي وترافع معتمد أمام المحاكم، مع خيار تغطية عائلية — تخضع للتدقيق المهني المسبق وخلو النزاع من التعارض",
      target: "أصحاب النزاعات والقضايا المتداولة وأسرهم",
      cta: "طلب الانضمام للباقة",
      ctaHref: "/register/client?type=individual&plan=ind-litigation",
      highlighted: false,
      color: "border-amber-400",
      features: {
        ai: [
          "كل مزايا الباقتين الذكية والوقائية",
          "صياغة لوائح الدعوى والمذكرات الجوابية والاعتراضية",
          "محاكاة الجلسات وتوقع دفوع الخصم (Wargaming)",
          "تحليل السوابق القضائية المماثلة للنزاع",
        ],
        platform: [
          "تمثيل قضائي وترافع أمام المحاكم لقضية مؤهلة سنوياً",
          "استشارات غير محدودة طوال فترة التقاضي في القضية المقبولة",
          "⚠️ تخضع القضية للفحص المهني وضوابط الاكتتاب قبل التفعيل",
          // Owner answer ١٧٦ (line 16): the family option.
          "التغطية العائلية: التابع الأول ٣١٩ ر.س، والثاني ٢٧٩ ر.س، والثالث فأكثر ٢٣٩ ر.س شهرياً (خصم ٢٠٪ / ٣٠٪ / ٤٠٪)",
          "سقف عائلي مشترك لأتعاب الترافع: ٣٥٬٠٠٠–٥٠٬٠٠٠ ر.س سنوياً",
          "للأسرة: رصيد استشارات وقائية مشترك، و٣٬٠٠٠–٥٬٠٠٠ نقطة شهرياً",
          "لكل فرد بالغ حسابه الخاص، لا يطّلع عليه بقية أفراد الأسرة",
          "تُضاف التغطية العائلية بطلب يراجعه الفريق",
        ],
        support: ["خط ساخن ومتابعة مخصصة مع المحامي المسؤول"],
      },
      footnote: "* تطبق الشروط والأحكام",
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
      badge: "Daily Peace of Mind",
      bonusLabel: "Save 2 months on annual billing",
      priceOriginal: twelveMonths("ind-ai", "en"),
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
          "Unlimited AI legal assistant",
          "Direct citations from Saudi statutory laws",
          "Draft generation for notices and official correspondence",
          "Court fees & limitation period calculators",
        ],
        platform: [
          "Full digital profile to archive your questions and drafts",
          "Access to licensed lawyer consultations at discounted rates",
          "No underwriting review (unlike Legal Insurance)",
        ],
        support: ["Platform & email technical support"],
      },
    },
    {
      id: "ind-preventive",
      isBetaHidden: false,
      name: "Preventive Legal Shield",
      badge: null,
      bonusLabel: "Save 2 months on annual billing",
      priceOriginal: twelveMonths("ind-preventive", "en"),
      periodMonthly: "SAR / month",
      periodYearly: "SAR / year",
      desc: "Your preventive legal shield — licensed lawyer consultations and contract reviews",
      target: "Professionals & Working Individuals",
      cta: "Subscribe to Preventive",
      ctaHref: "/register/client?type=individual&plan=ind-preventive",
      highlighted: true,
      color: "border-royal/30 shadow-md",
      features: {
        ai: [
          "All Smart AI features included",
          "Contract health check & risk warnings",
          "Verified statutory agreement templates",
          "Clause-by-clause comparison and audit",
        ],
        platform: [
          "4 annual consultations (video/phone) with licensed lawyers",
          "2 contract reviews per year for clause risk protection",
          "Permanent 15% discount on additional litigation services",
          "Periodic contractual portfolio review",
        ],
        support: ["Direct WhatsApp technical & procedural support"],
      },
    },
    {
      id: "ind-litigation",
      isBetaHidden: false,
      name: "Legal Insurance",
      badge: "Subject to Underwriting",
      bonusLabel: "Full Court Representation",
      priceOriginal: twelveMonths("ind-litigation", "en"),
      periodMonthly: "SAR / month",
      periodYearly: "SAR / year",
      desc: "Court representation & litigation defense, with a family cover option — subject to underwriting review and conflict checks",
      target: "Litigants, dispute parties and their families",
      cta: "Apply for Legal Insurance",
      ctaHref: "/register/client?type=individual&plan=ind-litigation",
      highlighted: false,
      color: "border-amber-400",
      features: {
        ai: [
          "All Smart AI & Preventive features included",
          "Drafting claims, responses, and appeals",
          "Trial simulation and rebuttal wargaming",
          "Precedent matching and court case analysis",
        ],
        platform: [
          "Court representation for 1 qualified eligible case per year",
          "Unlimited consultations throughout active case duration",
          "⚠️ Subject to legal underwriting review and intake qualification",
          "Family cover: first dependant SAR 319, second SAR 279, third and beyond SAR 239 a month (20% / 30% / 40% off)",
          "Shared family cap on litigation fees: SAR 35,000–50,000 a year",
          "For the family: a shared pool of preventive consultations and 3,000–5,000 points a month",
          "Each adult keeps a private account the rest of the family cannot see",
          "Family cover is added on request, after the team reviews it",
        ],
        support: ["Direct case manager & attorney hotline"],
      },
      footnote: "* Terms and conditions apply",
    },
  ],
};

// ─── Comparison Tables: Individuals ──────────────────────────────────────────
export const comparisonIndividuals: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    {
      category: "الذكاء الاصطناعي والوقاية",
      icon: Brain,
      rows: [
        { feature: "الذكاء الاصطناعي القانوني",   "pay-per-piece": "محدود",          "ind-ai": "غير محدود",            "ind-preventive": "غير محدود",            "ind-litigation": "غير محدود" },
        { feature: "الاستشهاد بالمواد النظامية",  "pay-per-piece": true,            "ind-ai": true,                   "ind-preventive": true,                   "ind-litigation": true },
        { feature: "فحص وتدقيق العقود",          "pay-per-piece": "حسب قائمة الخدمات", "ind-ai": "خصم ١٠٪",              "ind-preventive": "عقدان مجاناً/سنة",     "ind-litigation": "شامل عقود النزاع" },
        { feature: "صياغة الخطابات والإنذارات",   "pay-per-piece": "حسب الخدمة",     "ind-ai": true,                   "ind-preventive": true,                   "ind-litigation": true },
      ],
    },
    {
      category: "المحامي المرخّص والتمثيل القضائي",
      icon: Gavel,
      rows: [
        { feature: "استشارات مع محامٍ مرخّص",    "pay-per-piece": "حسب قائمة الخدمات", "ind-ai": "سعر تفضيلي",           "ind-preventive": "٤ استشارات/سنة",       "ind-litigation": "غير محدودة للقضية" },
        { feature: "خصم أتعاب الترافع والقضايا", "pay-per-piece": "-",              "ind-ai": "٥٪",                   "ind-preventive": "١٥٪",                  "ind-litigation": "قضية مشمولة بالكامل" },
        { feature: "تمثيل قضائي وترافع بالمحاكم", "pay-per-piece": "أتعاب متفق عليها","ind-ai": "-",                   "ind-preventive": "بخصم ١٥٪",             "ind-litigation": "قضية مؤهلة سنوياً" },
        { feature: "ضوابط القبول والاكتتاب",      "pay-per-piece": "فحص تعارض",     "ind-ai": "بدون اكتتاب",            "ind-preventive": "بدون اكتتاب",            "ind-litigation": "تخضع للفحص المهني" },
      ],
    },
    {
      category: "هيكل الاشتراك والمجموعة",
      icon: UsersThree,
      rows: [
        { feature: "عدد المستفيدين",             "pay-per-piece": "فرد",           "ind-ai": "فرد واحد",             "ind-preventive": "فرد واحد",             "ind-litigation": "صاحب القضية، وأسرته بطلب" },
        { feature: "طريقة السداد",                "pay-per-piece": "عند الطلب",     "ind-ai": "شهري / سنوي",          "ind-preventive": "شهري / سنوي",          "ind-litigation": "شهري / سنوي" },
        { feature: "عزل الخصوصية (RLS)",         "pay-per-piece": true,            "ind-ai": true,                   "ind-preventive": true,                   "ind-litigation": true },
      ],
    },
    {
      category: "التكلفة والدعم",
      icon: ShieldCheck,
      rows: [
        { feature: "سعر الاشتراك الشهري",         "pay-per-piece": "صفر ر.س",       "ind-ai": `${bookPriceText("ind-ai", "monthly", "ar")} ر.س`, "ind-preventive": `${bookPriceText("ind-preventive", "monthly", "ar")} ر.س`, "ind-litigation": `${bookPriceText("ind-litigation", "monthly", "ar")} ر.س` },
        { feature: "سعر الاشتراك السنوي",         "pay-per-piece": "صفر ر.س",       "ind-ai": `${bookPriceText("ind-ai", "yearly", "ar")} ر.س`, "ind-preventive": `${bookPriceText("ind-preventive", "yearly", "ar")} ر.س`, "ind-litigation": `${bookPriceText("ind-litigation", "yearly", "ar")} ر.س` },
        { feature: "مستوى الدعم الفني",           "pay-per-piece": "دعم للطلب",     "ind-ai": "دعم عبر المنصة",       "ind-preventive": "واتساب",        "ind-litigation": "مدير قضية مخصص" },
      ],
    },
  ],
  en: [
    {
      category: "AI & Preventive Law",
      icon: Brain,
      rows: [
        { feature: "Legal AI Queries",            "pay-per-piece": "Limited",       "ind-ai": "Unlimited",            "ind-preventive": "Unlimited",            "ind-litigation": "Unlimited" },
        { feature: "Statutory Article Citations", "pay-per-piece": true,            "ind-ai": true,                   "ind-preventive": true,                   "ind-litigation": true },
        { feature: "Contract Audit & Review",     "pay-per-piece": "Per the service list","ind-ai": "10% off",            "ind-preventive": "2 free/year",          "ind-litigation": "Case contracts included" },
        { feature: "Notice & Letter Drafting",    "pay-per-piece": "Per service",   "ind-ai": true,                   "ind-preventive": true,                   "ind-litigation": true },
      ],
    },
    {
      category: "Licensed Lawyers & Court Cases",
      icon: Gavel,
      rows: [
        { feature: "Lawyer Consultations",        "pay-per-piece": "Per the service list","ind-ai": "Discounted rate",      "ind-preventive": "4 sessions/year",      "ind-litigation": "Unlimited for case" },
        { feature: "Litigation Fees Discount",    "pay-per-piece": "-",             "ind-ai": "5%",                   "ind-preventive": "15%",                  "ind-litigation": "Fully covered case" },
        { feature: "Court Representation",        "pay-per-piece": "Agreed fee",    "ind-ai": "-",                    "ind-preventive": "15% off fee",          "ind-litigation": "1 eligible case/year" },
        { feature: "Underwriting & Intake Check", "pay-per-piece": "Conflict check","ind-ai": "No underwriting",   "ind-preventive": "No underwriting",   "ind-litigation": "Requires review gate" },
      ],
    },
    {
      category: "Subscription & Group Architecture",
      icon: UsersThree,
      rows: [
        { feature: "Number of Members",           "pay-per-piece": "Solo",          "ind-ai": "Solo",                 "ind-preventive": "Solo",                 "ind-litigation": "Litigant; family on request" },
        { feature: "Billing Mechanism",           "pay-per-piece": "On demand",     "ind-ai": "Monthly / Yearly",     "ind-preventive": "Monthly / Yearly",     "ind-litigation": "Monthly / Yearly" },
        { feature: "Data Privacy Isolation (RLS)","pay-per-piece": true,            "ind-ai": true,                   "ind-preventive": true,                   "ind-litigation": true },
      ],
    },
    {
      category: "Pricing & Support",
      icon: ShieldCheck,
      rows: [
        { feature: "Monthly Subscription Price",  "pay-per-piece": "0 SAR",         "ind-ai": `${bookPriceText("ind-ai", "monthly", "en")} SAR`, "ind-preventive": `${bookPriceText("ind-preventive", "monthly", "en")} SAR`, "ind-litigation": `${bookPriceText("ind-litigation", "monthly", "en")} SAR` },
        { feature: "Annual Subscription Price",   "pay-per-piece": "0 SAR",         "ind-ai": `${bookPriceText("ind-ai", "yearly", "en")} SAR`, "ind-preventive": `${bookPriceText("ind-preventive", "yearly", "en")} SAR`, "ind-litigation": `${bookPriceText("ind-litigation", "yearly", "en")} SAR` },
        { feature: "Support Level",               "pay-per-piece": "Order support", "ind-ai": "Platform support",      "ind-preventive": "WhatsApp",    "ind-litigation": "Dedicated case manager" },
      ],
    },
  ],
};
