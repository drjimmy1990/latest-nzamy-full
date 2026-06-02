import { Brain, Gavel, Users, UsersThree } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Plans: Individuals (3 plans — S100) ─────────────────────────────────────
// الباقة المجانية = الحالة الافتراضية قبل الاشتراك (لا تُعرض كخيار منفصل)
// ثلاث خطط مدفوعة فقط: تأمين سنوي | شهري AI | جماعية (ربع)
export const plansIndividuals: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "shield",
      name: "التأمين القانوني",
      badge: "ريال واحد يومياً",
      priceMonthly: "٣٩", priceYearly: "٣٦٥",
      periodMonthly: "ر.س / شهر", periodYearly: "ر.س / سنة",
      desc: "غطاء قانوني تأميني طوال العام — يُفعَّل بعد ٣٠ يوماً",
      target: "أفراد", cta: "اشترك سنوياً",
      ctaHref: "/register/client?type=individual&plan=shield",
      highlighted: false, color: "border-blue-300/60",
      features: {
        ai:       ["٥ أسئلة قانونية سريعة/شهر مجاناً", "٢٠ استفساراً AI/شهر", "استشهاد بالمادة القانونية", null],
        platform: ["خصم ١٥٪ على أتعاب القضايا (العمالية، الأحوال الشخصية، المطالبات) طوال فترة الاشتراك", "٣ استشارات مع محامٍ مرخّص/سنة (فصلياً)", "مراجعة ٢ مستندات/سنة", "تغطية تكاليف الترافع بحد أقصى يتم تحديده"],
        support:  ["دعم واتساب للطوارئ", "شرط: ٣٠ يوماً قبل الحدث القانوني"],
      },
    },
    {
      id: "ai-individual",
      name: "نظامي AI",
      badge: "الأكثر اختياراً",
      priceMonthly: "٩٩", priceYearly: "٨٤",
      periodMonthly: "ر.س / شهر", periodYearly: "ر.س / شهر",
      desc: "AI قانوني شامل — الحل اليومي للموظف والمستأجر وصاحب العمل الحر",
      target: "أفراد", cta: "اشترك الآن",
      ctaHref: "/register/client?type=individual&plan=ai",
      highlighted: false, color: "border-emerald-200",
      features: {
        ai:       ["٢٥ استفساراً AI/شهر", "أسئلة سريعة مدمجة في الحصة", "استشهاد بالمادة القانونية", "تصعيد للمحامي بضغطة"],
        platform: ["خصم ٢٠٪ على أتعاب الترافع والقضايا الفعلية طوال فترة الاشتراك", "أولوية في جدولة المواعيد", "أرشيف استشاراتك كاملاً", null],
        support:  ["دعم واتساب", null],
      },
    },
    {
      id: "group",
      name: "الربع القانوني",
      badge: "٢–٥ أشخاص · فصلياً",
      priceMonthly: "٤٩٩", priceYearly: "٤٩٩",
      periodMonthly: "ر.س / شهر للمجموعة كاملةً", periodYearly: "ر.س / شهر (اشتراك سنوي)",
      desc: "غطاء قانوني مشترك لعائلة أو فريق — محامٍ حقيقي + AI + نظام تناوب ذكي للدفع",
      target: "مجموعة (٢-٥ أفراد)", cta: "ابدأ ربعك القانوني",
      ctaHref: "/dashboard/client/my-group?action=create",
      highlighted: true, color: "border-gold/30",
      features: {
        ai: [
          "٢٥ استفساراً AI/شخص/شهر",
          "٢ استشارة مع محامٍ متخصص/شهر (مشتركة للمجموعة)",
          "قضية مبسطة واحدة/سنة كترافع (عمالية أو حقوق أو مطالبة)",
          "رسم عقد مبسط واحد / ربع سنة",
        ],
        platform: [
          "نظام تناوب الدفع: شخص واحد يدفع كل شهر بالتناوب",
          "داشبورد إدارة ومتابعة استهلاك المجموعة",
          "التزام سنوي أو دفع شهرين مقدماً",
          "الترافع يُفعّل بعد ٦٠ يوماً من بدء الاشتراك",
        ],
        support: ["دعم واتساب أولوية لكل المجموعة", null],
      },
    },
    {
      id: "pay-per-piece",
      name: "الدفع بالعمل القانوني",
      badge: "محامِ متخصص",
      priceMonthly: "٠", priceYearly: "٠",
      periodMonthly: "اشتراك شهري", periodYearly: "اشتراك شهري",
      desc: "محامي متخصص يصيغ لك مذكرتك وعقدك — ادفع فقط مقابل ما تحتاجه",
      target: "أفراد", cta: "اطلب الآن",
      ctaHref: "/dashboard/client/draft",
      highlighted: false, color: "border-amber-400/40",
      isBetaHidden: true, // مخفي في مرحلة البيتا
      features: {
        ai:       [
          "ترافع في قضايا عمالية (تسعير مخصص حسب القضية)",
          "ترافع أحوال شخصية (تسعير مخصص حسب القضية)",
          "مذكرة رد / جوابية = ١,٥٠٠ ر.س",
          "عقد مبسط = ١,٥٠٠ ر.س",
          "استئناف / نقض = تبدأ من ٣,٠٠٠ ر.س",
        ],
        platform: [
          "تمثيل قضائي وترافع من محامِ متخصص مرخّص",
          "تسوية ودية ومطالبات مالية",
          "يُطبق الخصم تلقائياً لمشتركي الباقات",
        ],
        support:  ["تحديثات دورية لمسار القضية", null],
      },
    },
  ],
  en: [
    {
      id: "shield",
      name: "Legal Insurance",
      badge: "1 Riyal a Day",
      priceMonthly: "39", priceYearly: "365",
      periodMonthly: "SAR / month", periodYearly: "SAR / year",
      desc: "Annual legal insurance — activates after 30 days",
      target: "Individuals", cta: "Subscribe Yearly",
      ctaHref: "/register/client?type=individual&plan=shield",
      highlighted: false, color: "border-blue-300/60",
      features: {
        ai:       ["5 free quick legal questions/month", "20 AI queries/month", "Statutory article citations", null],
        platform: ["15% off Litigation, Labor & Financial claims cases", "3 licensed-lawyer consultations/year (quarterly)", "Review 2 documents/year", "Litigation costs coverage up to defined limit"],
        support:  ["WhatsApp emergency support", "Condition: subscribed 30+ days before incident"],
      },
    },
    {
      id: "ai-individual",
      name: "Nezamy AI",
      badge: "Most Popular",
      priceMonthly: "99", priceYearly: "84",
      periodMonthly: "SAR / month", periodYearly: "SAR / month",
      desc: "Full legal AI — daily solution for employees, tenants & freelancers",
      target: "Individuals", cta: "Subscribe Now",
      ctaHref: "/register/client?type=individual&plan=ai",
      highlighted: false, color: "border-emerald-200",
      features: {
        ai:       ["25 AI queries/month", "Quick questions included in quota", "Statutory article citations", "One-tap lawyer escalation"],
        platform: ["20% off Litigation & real cases during subscription", "Priority scheduling", "Full consultation archive", null],
        support:  ["WhatsApp support", null],
      },
    },
    {
      id: "group",
      name: "Legal Quarter",
      badge: "2–5 People · Quarterly",
      priceMonthly: "499", priceYearly: "499",
      periodMonthly: "SAR / month total", periodYearly: "SAR / month (annual)",
      desc: "Shared legal coverage for a family or team — real lawyer + AI + smart rotation billing",
      target: "Groups (2–5 people)", cta: "Start Your Legal Quarter",
      ctaHref: "/dashboard/client/my-group?action=create",
      highlighted: true, color: "border-gold/30",
      features: {
        ai: [
          "25 AI queries / person / month",
          "2 specialist lawyer consultations / month (shared by all)",
          "1 simple case per year as litigation (labor, rights, or claim)",
          "1 simple contract drafted per quarter",
        ],
        platform: [
          "Smart rotation billing: one person pays per month",
          "Group dashboard with full consumption visibility",
          "Annual commitment OR 2-month deposit upfront",
          "Litigation activates after 60 days from start",
        ],
        support: ["Priority WhatsApp support for the whole group", null],
      },
    },
    {
      id: "pay-per-piece",
      name: "Pay Per Legal Work",
      badge: "Specialist Lawyer",
      priceMonthly: "0", priceYearly: "0",
      periodMonthly: "/ month", periodYearly: "/ month",
      desc: "A licensed specialist lawyer drafts your brief or contract — pay only for what you need",
      target: "Individuals", cta: "Order Now",
      ctaHref: "/dashboard/client/draft",
      highlighted: false, color: "border-amber-400/40",
      isBetaHidden: true, // Hidden in Beta
      features: {
        ai: [
          "Labor Cases Litigation (Custom pricing upon evaluation)",
          "Personal Status Litigation (Custom pricing upon evaluation)",
          "Reply Brief = SAR 1,500",
          "Simple Contract = SAR 1,500",
          "Appeal / Cassation = Starts at SAR 3,000",
        ],
        platform: [
          "Full litigation and court representation by licensed lawyers",
          "Amicable settlements & financial claims",
          "Subscription discounts applied automatically",
        ],
        support: ["Regular case updates & tracking", null],
      },
    },
  ],
};

// ─── Comparison Tables: Individuals ──────────────────────────────────────────
export const comparisonIndividuals: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "الذكاء الاصطناعي", icon: Brain, rows: [
      { feature: "الاستفسارات AI/شهر",           shield: "٢٠/شهر",       "ai-individual": "٢٥/شهر",          group: "٢٥/شخص/شهر" },
      { feature: "استشهاد بالمادة القانونية",     shield: true,           "ai-individual": true,               group: true },
      { feature: "سؤال قانوني سريع",              shield: "٥ مجاناً/شهر", "ai-individual": "ضمن الحصة",        group: "ضمن الحصة" },
      { feature: "تصعيد للمحامي بضغطة",           shield: false,          "ai-individual": true,               group: true },
    ]},
    { category: "المحامي الحقيقي", icon: Gavel, rows: [
      { feature: "استشارات مع محامٍ مرخّص",       shield: "٣ فصلياً/سنة", "ai-individual": "دفع منفرد",        group: "٢/شهر (مشتركة)" },
      { feature: "خصم على أتعاب القضايا",          shield: "١٥٪",          "ai-individual": "٢٠٪",             group: "١٥٪" },
      { feature: "ترافع كامل (تمثيل قضائي)",       shield: false,          "ai-individual": false,              group: "١/سنة" },
      { feature: "عقد مبسط مجاناً",                shield: false,          "ai-individual": false,              group: "١/ربع سنة" },
    ]},
    { category: "المجموعة والتناوب", icon: UsersThree, rows: [
      { feature: "عدد الأشخاص",                   shield: "فرد",          "ai-individual": "فرد",              group: "٢-٥ أشخاص" },
      { feature: "نظام التناوب الذكي",             shield: false,          "ai-individual": false,              group: true },
      { feature: "التزام سنوي / دفعتان مقدماً",   shield: false,          "ai-individual": false,              group: true },
      { feature: "الترافع يُفعَّل بعد",            shield: "٣٠ يوماً",    "ai-individual": "-",                group: "٦٠ يوماً" },
    ]},
    { category: "السعر والدعم", icon: Users, rows: [
      { feature: "سعر الباقة",                    shield: "٣٦٥ ر.س/سنة",  "ai-individual": "٩٩ ر.س/شهر",     group: "٤٩٩ ر.س/شهر للمجموعة" },
      { feature: "متوسط التكلفة/شخص (٥ أشخاص)",  shield: "٣٠ ر.س",       "ai-individual": "٩٩ ر.س",          group: "٩٩ ر.س + محامٍ" },
      { feature: "نوع الدعم",                     shield: "واتساب طوارئ",  "ai-individual": "واتساب",          group: "واتساب أولوية" },
    ]},
  ],
  en: [
    { category: "AI Assistance", icon: Brain, rows: [
      { feature: "AI queries / month",                    shield: "20/mo",      "ai-individual": "25/mo",           group: "25/person/mo" },
      { feature: "Statutory article citations",           shield: true,         "ai-individual": true,              group: true },
      { feature: "Quick legal questions",                 shield: "5 free/mo",  "ai-individual": "Within quota",    group: "Within quota" },
      { feature: "One-tap lawyer escalation",             shield: false,        "ai-individual": true,              group: true },
    ]},
    { category: "Real Lawyer Access", icon: Gavel, rows: [
      { feature: "Scheduled lawyer consultations",        shield: "3/year",     "ai-individual": "Pay per session", group: "2/month (shared)" },
      { feature: "Discount on actual case fees",          shield: "15%",        "ai-individual": "20%",             group: "15%" },
      { feature: "Full litigation (court representation)",shield: false,        "ai-individual": false,             group: "1/year" },
      { feature: "Free simple contract drafting",         shield: false,        "ai-individual": false,             group: "1/quarter" },
    ]},
    { category: "Group & Rotation", icon: UsersThree, rows: [
      { feature: "Number of members",                     shield: "Solo",       "ai-individual": "Solo",            group: "2-5 people" },
      { feature: "Smart rotation billing",                shield: false,        "ai-individual": false,             group: true },
      { feature: "Annual commitment / 2-month deposit",   shield: false,        "ai-individual": false,             group: true },
      { feature: "Litigation activation delay",           shield: "30 days",    "ai-individual": "-",               group: "60 days" },
    ]},
    { category: "Pricing & Support", icon: Users, rows: [
      { feature: "Plan price",                            shield: "365 SAR/yr", "ai-individual": "99 SAR/mo",       group: "499 SAR/mo total" },
      { feature: "Avg. cost/person (5 people)",           shield: "30 SAR",     "ai-individual": "99 SAR",          group: "99 SAR + lawyer" },
      { feature: "Support type",                          shield: "Emergency WhatsApp", "ai-individual": "WhatsApp", group: "Priority WhatsApp" },
    ]},
  ],
};

