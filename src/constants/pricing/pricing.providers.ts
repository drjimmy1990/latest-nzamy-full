import { Scales, MagnifyingGlass, Brain, ShieldCheck, Star } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Plans: Service Providers (موثق / محكم / معقب) — Simple 3 Tiers ───────────
// الفلسفة: عمل مقدمي الخدمات بسيط ولا يحتاج تعقيد الباقات الكثيرة.
// ٣ مستويات فقط تعتمد على تقليل العمولة وزيادة الظهور.
export const plansProviders: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "provider-free", name: "أساسي", badge: null,
      priceMonthly: "مجاني", priceYearly: "مجاني", periodMonthly: "", periodYearly: "",
      desc: "استقبل طلبات العملاء فوراً وادفع عمولة فقط عند التنفيذ.",
      target: "جميع مقدمي الخدمات", cta: "سجّل مجاناً",
      ctaHref: "/register/provider?type=service", highlighted: false, color: "border-slate-200/50",
      commissionPct: 20,
      features: {
        ai: ["أدوات AI أساسية: ٥ استخدامات/أسبوع", "قوالب مبسطة للعمل", null, null],
        platform: ["ملف شخصي في السوق", "استقبال طلبات العملاء", "نظام مراسلة", null],
        support: ["عمولة المنصة: ٢٠٪ من كل عملية", "دعم فني بالبريد"],
      },
    },
    {
      id: "provider-pro", name: "احترافي", badge: null,
      priceMonthly: "٢,٩٨٨", priceYearly: "٢,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "عمولة أقل (١٠٪) + أولوية في توزيع الطلبات + أدوات ذكية.",
      target: "المحترفون النشطون", cta: "اشترك سنوياً",
      ctaHref: "/register/provider?type=service&plan=pro", highlighted: true, color: "border-royal/20",
      commissionPct: 10,
      features: {
        ai: ["أدوات AI: ٣٠ استخداماً/أسبوع", "المكتبة القانونية باشتراك", "قوالب متقدمة (توثيق/تحكيم)", null],
        platform: ["أولوية في تلقي الطلبات الجديدة ✅", "badge \"محترف\" على ملفك", "إحصائيات أداء أساسية", null],
        support: ["عمولة المنصة: ١٠٪ فقط", "دعم فني عبر واتساب"],
      },
    },
    {
      id: "provider-elite", name: "نخبة", badge: "~٤٩٩ ر.س / شهر",
      priceMonthly: "٥,٩٨٨", priceYearly: "٥,٩٨٨", periodMonthly: "ر.س / سنة", periodYearly: "ر.س / سنة",
      desc: "عمولة شبه معدومة (٥٪) + تصدر نتائج البحث + إحالات مباشرة.",
      target: "الخبراء المعتمدون", cta: "انضم للنخبة",
      ctaHref: "/register/provider?type=service&plan=elite", highlighted: false, color: "border-gold/30",
      commissionPct: 5,
      features: {
        // No «السكرتير الذكي + تنبيهات» (owner ١١٥): the secretary is «قريباً»,
        // so no plan sells it.
        ai: ["استخدام AI مفتوح لدورك", "المكتبة القانونية باشتراك", null],
        platform: ["Top Listing: تصدر نتائج البحث ✅", "badge \"خبير موثوق\" ✅", "إحالات تلقائية وحصرية", null],
        support: ["عمولة المنصة: ٥٪ فقط", "واتساب VIP أولوية قصوى"],
      },
    },
    {
      id: "consultant-independent", name: "مستشار مستقل", badge: "المادة ١٨",
      // Owner answer ١٧٣ (2026-10-16): the same price and point use as
      // «المحامي المحترف»; the difference is the dashboard rights (Art. 18).
      priceMonthly: "٣٩٩", priceYearly: "٣٬٩٩٠", periodMonthly: "ر.س / شهر", periodYearly: "ر.س / سنة",
      desc: "للمستشارين القانونيين المستقلين: دراسة الأنظمة وصياغة العقود والاستشارات، بلا ترافع ولا إدارة جلسات (المادة ١٨ من نظام المحاماة).",
      target: "المستشارون القانونيون المستقلون", cta: "اشترك الآن",
      ctaHref: "/register/provider?type=consultant&plan=independent", highlighted: false, color: "border-purple-300",
      commissionPct: 5,
      features: {
        ai: ["١٬٥٠٠ نقطة كل شهر، بتكلفة أدوات باقة المحامي نفسها", "صياغة العقود وتدقيقها: ١٠ نقاط", "المساعد القانوني والتشريع المقارن: ٥ نقاط", null],
        platform: ["العملاء والملفات الاستشارية والتقويم", "ملف مهني للمستشار", "🚫 لا ترافع ولا إدارة جلسات (المادة ١٨)", null],
        support: ["السنوي بسعر عشرة أشهر"],
      },
    },
  ],
  en: [
    {
      id: "provider-free", name: "Basic", badge: null,
      priceMonthly: "Free", priceYearly: "Free", periodMonthly: "", periodYearly: "",
      desc: "Receive client requests instantly. Pay commission only when you earn.",
      target: "All Service Providers", cta: "Sign Up Free",
      ctaHref: "/register/provider?type=service", highlighted: false, color: "border-slate-200/50",
      commissionPct: 20,
      features: {
        ai: ["Basic AI tools: 5 uses/week", "Simple work templates", null, null],
        platform: ["Marketplace profile", "Receive client requests", "Messaging system", null],
        support: ["Platform commission: 20%", "Email support"],
      },
    },
    {
      id: "provider-pro", name: "Professional", badge: null,
      priceMonthly: "2,988", priceYearly: "2,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Lower commission (10%) + priority requests + smart tools.",
      target: "Active Professionals", cta: "Subscribe Yearly",
      ctaHref: "/register/provider?type=service&plan=pro", highlighted: true, color: "border-royal/20",
      commissionPct: 10,
      features: {
        ai: ["AI tools: 30 uses/week", "Legal library by subscription", "Advanced templates (Notary/Arbitration)", null],
        platform: ["Priority in new requests ✅", "\"Professional\" badge", "Basic analytics", null],
        support: ["Platform commission: 10% only", "WhatsApp support"],
      },
    },
    {
      id: "provider-elite", name: "Elite", badge: "~499 SAR/mo",
      priceMonthly: "5,988", priceYearly: "5,988", periodMonthly: "SAR / year", periodYearly: "SAR / year",
      desc: "Minimal commission (5%) + top search ranking + direct referrals.",
      target: "Certified Experts", cta: "Join the Elite",
      ctaHref: "/register/provider?type=service&plan=elite", highlighted: false, color: "border-gold/30",
      commissionPct: 5,
      features: {
        ai: ["Unlimited AI for your role", "Legal library by subscription", null],
        platform: ["Top Listing: 1st in search ✅", "\"Trusted Expert\" badge ✅", "Exclusive direct referrals", null],
        support: ["Platform commission: 5% only", "Priority VIP WhatsApp"],
      },
    },
    // Moved here from the `ar` list, where it rendered an English card on the
    // Arabic page with the same React key as the Arabic consultant card.
    {
      id: "consultant-independent", name: "Independent Consultant", badge: "Article 18",
      priceMonthly: "399", priceYearly: "3,990", periodMonthly: "SAR / month", periodYearly: "SAR / year",
      desc: "For independent legal consultants: statutory research, contract drafting and advice — no pleading or hearing management (Article 18).",
      target: "Independent Legal Consultants", cta: "Subscribe Now",
      ctaHref: "/register/provider?type=consultant&plan=independent", highlighted: false, color: "border-purple-300",
      commissionPct: 5,
      features: {
        ai: ["1,500 points every month, at the lawyer plan's tool costs", "Contract drafting and review: 10 points", "Legal assistant and comparative law: 5 points", null],
        platform: ["Clients, advisory files and calendar", "Consultant profile", "🚫 No pleading or hearing management (Art. 18)", null],
        support: ["Yearly priced at ten months"],
      },
    },
  ],
};

// ─── Comparison Tables: Providers ─────────────────────────────────────────────
export const comparisonProviders: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    { category: "العمولة والتكلفة", icon: Scales, rows: [
      { feature: "عمولة المنصة من أرباحك", "provider-free": "٢٠٪", "provider-pro": "١٠٪", "provider-elite": "٥٪" },
      { feature: "الاشتراك السنوي", "provider-free": "مجاني", "provider-pro": "٢,٩٨٨ ر.س", "provider-elite": "٥,٩٨٨ ر.س" },
    ]},
    { category: "أدوات الذكاء الاصطناعي", icon: Brain, rows: [
      { feature: "استخدام أدوات AI", "provider-free": "٥/أسبوع", "provider-pro": "٣٠/أسبوع", "provider-elite": "مفتوح" },
      { feature: "المكتبة القانونية", "provider-free": "❌", "provider-pro": "باشتراك", "provider-elite": "باشتراك" },
      { feature: "قوالب العمل", "provider-free": "أساسية", "provider-pro": "متقدمة", "provider-elite": "متقدمة + سكرتير ذكي" },
    ]},
    { category: "الظهور والسوق", icon: Star, rows: [
      { feature: "توزيع الطلبات", "provider-free": "عادي", "provider-pro": "أولوية", "provider-elite": "أولوية + إحالات حصرية" },
      { feature: "ترتيب في البحث (السوق)", "provider-free": "عادي", "provider-pro": "متقدم", "provider-elite": "Top Listing (الأول) ✅" },
      { feature: "علامة الثقة (Badge)", "provider-free": "❌", "provider-pro": "محترف", "provider-elite": "خبير موثوق" },
    ]},
  ],
  en: [
    { category: "Commission & Cost", icon: Scales, rows: [
      { feature: "Platform commission", "provider-free": "20%", "provider-pro": "10%", "provider-elite": "5%" },
      { feature: "Annual subscription", "provider-free": "Free", "provider-pro": "2,988 SAR", "provider-elite": "5,988 SAR" },
    ]},
    { category: "AI Tools", icon: Brain, rows: [
      { feature: "AI tool usage", "provider-free": "5/week", "provider-pro": "30/week", "provider-elite": "Unlimited" },
      { feature: "Legal Library", "provider-free": "❌", "provider-pro": "By subscription", "provider-elite": "By subscription" },
      { feature: "Work templates", "provider-free": "Basic", "provider-pro": "Advanced", "provider-elite": "Advanced + Smart Sec" },
    ]},
    { category: "Visibility & Market", icon: Star, rows: [
      { feature: "Request distribution", "provider-free": "Normal", "provider-pro": "Priority", "provider-elite": "Priority + Referrals" },
      { feature: "Search ranking", "provider-free": "Normal", "provider-pro": "Advanced", "provider-elite": "Top Listing (1st) ✅" },
      { feature: "Trust Badge", "provider-free": "❌", "provider-pro": "Professional", "provider-elite": "Trusted Expert" },
    ]},
  ],
};
