import { Plan } from "./pricing.types";

/**
 * pricing.library.ts
 * ─────────────────────────────────────────────────────────────
 * Stand-alone Library subscription plans.
 * Shown when audience is "lawyers" or "firms" AND libraryMode === true.
 *
 * Pricing (the plan objects below are the source of truth):
 *   lib-q1:     1,500 SAR / 3 months
 *   lib-q2:     2,750 SAR / 6 months
 *   lib-annual: 5,000 SAR / year
 *
 * No `priceOriginal` and no «خصم ٥٠٪ لفترة الإطلاق» pill: the struck-through
 * "was" prices (2,000 / 3,500 / 6,000, and 2× every firm-library price) were
 * never charged anywhere, and the percentage matched none of them (the real
 * gaps were 17–25%). A reference price comes back only once a real one exists.
 *
 * All plans include:
 *   ✓ Full access to laws, regulations, judicial principles
 *   ✓ Advanced search in the legal library — the texts only; AI tools spend
 *     the user's points (owner answer ١٩٩, 2026-10-18)
 *   ✓ 3 colleague invitations to try the library. No card states a trial
 *     length: the redeem flow grants 30 days and a colleague invite uses the
 *     invitation's own trial_days (owner answer ٢٠٣ says only "the trial
 *     period"). Nothing notifies subscribers of new legislation, so no card
 *     promises legislative alerts.
 * ─────────────────────────────────────────────────────────────
 */

export const plansLibrary: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "lib-q1",
      name: "ربع سنوي",
      badge: null,
      periodMonthly: "ر.س / ٣ أشهر",
      periodYearly:  "ر.س / ٣ أشهر",
      desc: "وصول كامل للمكتبة القانونية لمدة ٣ أشهر",
      target: "للتجربة",
      pricingFormulaLabel: "حساب لمستخدم واحد (١ مقعد)",
      cta: "اشترك الآن",
      ctaHref: "/laws/subscribe?plan=lib-q1",
      highlighted: false,
      color: "border-blue-200/60 dark:border-blue-500/20",
      features: {
        ai: [
          "وصول كامل للأنظمة واللوائح والمبادئ القضائية",
          "بحث متقدّم في المكتبة القانونية",
          "٣ دعوات للزملاء لتجربة المكتبة",
        ],
        platform: [
          "قراءة هادئة — وضع التركيز",
          "حفظ المفضلة والملاحظات",
        ],
        support: ["دعم بريد إلكتروني"],
      },
    },
    {
      id: "lib-q2",
      name: "نصف سنوي",
      badge: null,
      periodMonthly: "ر.س / ٦ أشهر",
      periodYearly:  "ر.س / ٦ أشهر",
      desc: "وصول كامل للمكتبة القانونية لمدة ٦ أشهر",
      target: "للمحترفين",
      pricingFormulaLabel: "حساب لمستخدم واحد (١ مقعد)",
      cta: "اشترك الآن",
      ctaHref: "/laws/subscribe?plan=lib-q2",
      highlighted: true,
      color: "border-royal/20",
      features: {
        ai: [
          "وصول كامل للأنظمة واللوائح والمبادئ القضائية",
          "بحث متقدّم في المكتبة القانونية",
          "٣ دعوات للزملاء لتجربة المكتبة",
        ],
        platform: [
          "قراءة هادئة — وضع التركيز",
          "حفظ المفضلة والملاحظات",
          "إضافة للمسودة والحافظة",
        ],
        support: ["دعم واتساب"],
      },
    },
    {
      id: "lib-annual",
      name: "سنوي",
      // No «الأوفر قيمة والأكثر اعتماداً» badge (owner, Q164, 2026-10-03): no
      // subscription data supports an adoption claim.
      badge: null,
      periodMonthly: "ر.س / سنة",
      periodYearly:  "ر.س / سنة",
      desc: "وصول كامل للمكتبة القانونية لمدة ١٢ شهراً",
      target: "للمكاتب",
      pricingFormulaLabel: "حساب لمستخدم واحد (١ مقعد)",
      cta: "اشترك الآن",
      ctaHref: "/laws/subscribe?plan=lib-annual",
      highlighted: false,
      color: "border-gold/20",
      features: {
        ai: [
          "وصول كامل للأنظمة واللوائح والمبادئ القضائية",
          "بحث متقدّم في المكتبة القانونية",
          "٣ دعوات للزملاء لتجربة المكتبة",
          "تصدير نصوص الأنظمة بصيغة PDF",
        ],
        platform: [
          "قراءة هادئة — وضع التركيز",
          "حفظ المفضلة والملاحظات",
          "إضافة للمسودة والحافظة",
          "مشاركة مقتطفات الأنظمة",
        ],
        support: ["دعم عبر واتساب", "مدير حساب شخصي"],
      },
    },
  ],
  en: [
    {
      id: "lib-q1",
      name: "Quarterly",
      badge: null,
      periodMonthly: "SAR / 3 months",
      periodYearly:  "SAR / 3 months",
      desc: "Full library access for 3 months",
      target: "Trial",
      pricingFormulaLabel: "1 user account (1 seat)",
      cta: "Subscribe Now",
      ctaHref: "/laws/subscribe?plan=lib-q1",
      highlighted: false,
      color: "border-blue-200/60 dark:border-blue-500/20",
      features: {
        ai: [
          "Full access to laws, regulations & principles",
          "Advanced search in the legal library",
          "3 invitations for colleagues to try the library",
        ],
        platform: [
          "Focus reading mode",
          "Favorites & notes",
        ],
        support: ["Email support"],
      },
    },
    {
      id: "lib-q2",
      name: "Semi-Annual",
      badge: null,
      periodMonthly: "SAR / 6 months",
      periodYearly:  "SAR / 6 months",
      desc: "Full library access for 6 months",
      target: "Professionals",
      pricingFormulaLabel: "1 user account (1 seat)",
      cta: "Subscribe Now",
      ctaHref: "/laws/subscribe?plan=lib-q2",
      highlighted: true,
      color: "border-royal/20",
      features: {
        ai: [
          "Full access to laws, regulations & principles",
          "Advanced search in the legal library",
          "3 invitations for colleagues to try the library",
        ],
        platform: [
          "Focus reading mode",
          "Favorites & notes",
          "Draft cart & clipboard",
        ],
        support: ["WhatsApp support"],
      },
    },
    {
      id: "lib-annual",
      name: "Annual",
      badge: null,
      periodMonthly: "SAR / year",
      periodYearly:  "SAR / year",
      desc: "Full library access for 12 months",
      target: "Firms",
      pricingFormulaLabel: "1 user account (1 seat)",
      cta: "Subscribe Now",
      ctaHref: "/laws/subscribe?plan=lib-annual",
      highlighted: false,
      color: "border-gold/20",
      features: {
        ai: [
          "Full access to laws, regulations & principles",
          "Advanced search in the legal library",
          "3 invitations for colleagues to try the library",
          "Export law texts as PDF",
        ],
        platform: [
          "Focus reading mode",
          "Favorites & notes",
          "Draft cart & clipboard",
          "Share law excerpts",
        ],
        support: ["WhatsApp support", "Dedicated account manager"],
      },
    },
  ],
};

export const plansFirmsLibrary: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "lib-firm-small",
      name: "مكتب صغير",
      badge: "١–٥ أعضاء",
      priceMonthly: "٤٬٨٠٠",
      priceYearly:  "٤٬٨٠٠",
      periodMonthly: "ر.س / سنة",
      periodYearly:  "ر.س / سنة",
      desc: "مثالي للمكاتب الصغيرة وفرق العمل المحدودة",
      target: "١–٥ أعضاء",
      bonusLabel: "٣ دعوات للزملاء",
      pricingFormulaLabel: "متاح لـ ١ إلى ٥ مستخدمين (مقاعد)",
      cta: "اشترك الآن",
      ctaHref: "/contact?type=firm-library",
      highlighted: false,
      color: "border-blue-200/60 dark:border-blue-500/20",
      features: {
        ai: [
          "وصول كامل للأنظمة واللوائح والمبادئ القضائية",
          "بحث متقدّم في المكتبة القانونية",
          "٣ دعوات للزملاء لتجربة المكتبة",
        ],
        platform: [
          "١–٥ مقاعد نشطة",
          "قراءة هادئة — وضع التركيز",
          "حفظ المفضلة والملاحظات المشتركة",
        ],
        support: ["دعم بريد إلكتروني وواتساب"],
      },
    },
    {
      id: "lib-firm-medium",
      name: "شركة متوسطة",
      badge: "٦–٢٠ عضواً",
      priceMonthly: "١٢٬٠٠٠",
      priceYearly:  "١٢٬٠٠٠",
      periodMonthly: "ر.س / سنة",
      periodYearly:  "ر.س / سنة",
      desc: "لشركات المحاماة المتوسطة ذات الفرق المتعددة",
      target: "٦–٢٠ عضواً",
      bonusLabel: "٣ دعوات للزملاء",
      pricingFormulaLabel: "متاح لـ ٦ إلى ٢٠ مستخدماً (مقاعد)",
      cta: "اشترك الآن",
      ctaHref: "/contact?type=firm-library",
      highlighted: true,
      color: "border-royal/20",
      features: {
        ai: [
          "وصول كامل للأنظمة واللوائح والمبادئ القضائية",
          "بحث متقدّم في المكتبة القانونية",
          "٣ دعوات للزملاء لتجربة المكتبة",
        ],
        platform: [
          "٦–٢٠ مقعداً نشطاً",
          "قراءة هادئة — وضع التركيز",
          "حفظ المفضلة والملاحظات المشتركة",
        ],
        support: ["دعم عبر واتساب"],
      },
    },
    {
      id: "lib-firm-large",
      name: "شركة كبيرة",
      badge: "٢١–٥٠ عضواً",
      priceMonthly: "٢٤٬٠٠٠",
      priceYearly:  "٢٤٬٠٠٠",
      periodMonthly: "ر.س / سنة",
      periodYearly:  "ر.س / سنة",
      desc: "لشركات المحاماة الكبرى والشركاء المتعددين",
      target: "٢١–٥٠ عضواً",
      bonusLabel: "٣ دعوات للزملاء",
      pricingFormulaLabel: "متاح لـ ٢١ إلى ٥٠ مستخدماً (مقاعد)",
      cta: "اشترك الآن",
      ctaHref: "/contact?type=firm-library",
      highlighted: false,
      color: "border-gold/20",
      features: {
        ai: [
          "وصول كامل للأنظمة واللوائح والمبادئ القضائية",
          "بحث متقدّم في المكتبة القانونية",
          "٣ دعوات للزملاء لتجربة المكتبة",
        ],
        platform: [
          "٢١–٥٠ مقعداً نشطاً",
          "قراءة هادئة — وضع التركيز",
          "حفظ المفضلة والملاحظات المشتركة",
        ],
        support: ["دعم عبر واتساب", "مدير حساب مخصص"],
      },
    },
    {
      id: "lib-firm-enterprise",
      name: "مؤسسي",
      badge: "٥٠+ عضو",
      priceMonthly: "مخصص",
      priceYearly:  "مخصص",
      periodMonthly: "سنوياً",
      periodYearly:  "سنوياً",
      desc: "للكيانات الكبرى والشبكات القضائية الواسعة",
      target: "٥٠+ عضو",
      bonusLabel: "دعوات مخصصة",
      pricingFormulaLabel: "عدد مقاعد مخصص (٥٠+ مستخدم)",
      cta: "تواصل معنا",
      ctaHref: "/contact",
      highlighted: false,
      color: "border-zinc-200/60 dark:border-white/10",
      features: {
        ai: [
          "وصول كامل للأنظمة واللوائح والمبادئ القضائية",
          "بحث متقدّم في المكتبة القانونية",
          "دعوات للزملاء مخصصة حسب الطلب",
        ],
        platform: [
          "عدد مقاعد غير محدود أو مخصص",
          "قراءة هادئة — وضع التركيز",
          "حفظ المفضلة والملاحظات المشتركة",
        ],
        support: ["مدير حساب مخصص"],
      },
    },
  ],
  en: [
    {
      id: "lib-firm-small",
      name: "Small Office",
      badge: "1–5 seats",
      priceMonthly: "4,800",
      priceYearly:  "4,800",
      periodMonthly: "SAR / year",
      periodYearly:  "SAR / year",
      desc: "Perfect for small offices and limited teams",
      target: "1–5 seats",
      bonusLabel: "3 colleague invites",
      pricingFormulaLabel: "For 1 to 5 users (seats)",
      cta: "Subscribe Now",
      ctaHref: "/contact?type=firm-library",
      highlighted: false,
      color: "border-blue-200/60 dark:border-blue-500/20",
      features: {
        ai: [
          "Full access to laws, regulations & principles",
          "Advanced search in the legal library",
          "3 invitations for colleagues to try the library",
        ],
        platform: [
          "1–5 active seats",
          "Focus reading mode",
          "Shared favorites & notes",
        ],
        support: ["Email & WhatsApp support"],
      },
    },
    {
      id: "lib-firm-medium",
      name: "Medium Firm",
      badge: "6–20 seats",
      priceMonthly: "12,000",
      priceYearly:  "12,000",
      periodMonthly: "SAR / year",
      periodYearly:  "SAR / year",
      desc: "For medium law firms with multiple practice groups",
      target: "6–20 seats",
      bonusLabel: "3 colleague invites",
      pricingFormulaLabel: "For 6 to 20 users (seats)",
      cta: "Subscribe Now",
      ctaHref: "/contact?type=firm-library",
      highlighted: true,
      color: "border-royal/20",
      features: {
        ai: [
          "Full access to laws, regulations & principles",
          "Advanced search in the legal library",
          "3 invitations for colleagues to try the library",
        ],
        platform: [
          "6–20 active seats",
          "Focus reading mode",
          "Shared favorites & notes",
        ],
        support: ["WhatsApp support"],
      },
    },
    {
      id: "lib-firm-large",
      name: "Large Firm",
      badge: "21–50 seats",
      priceMonthly: "24,000",
      priceYearly:  "24,000",
      periodMonthly: "SAR / year",
      periodYearly:  "SAR / year",
      desc: "For major law firms and multi-partner networks",
      target: "21–50 seats",
      bonusLabel: "3 colleague invites",
      pricingFormulaLabel: "For 21 to 50 users (seats)",
      cta: "Subscribe Now",
      ctaHref: "/contact?type=firm-library",
      highlighted: false,
      color: "border-gold/20",
      features: {
        ai: [
          "Full access to laws, regulations & principles",
          "Advanced search in the legal library",
          "3 invitations for colleagues to try the library",
        ],
        platform: [
          "21–50 active seats",
          "Focus reading mode",
          "Shared favorites & notes",
        ],
        support: ["WhatsApp support & account manager"],
      },
    },
    {
      id: "lib-firm-enterprise",
      name: "Corporate / Enterprise",
      badge: "50+ seats",
      priceMonthly: "Custom",
      priceYearly:  "Custom",
      periodMonthly: "annually",
      periodYearly:  "annually",
      desc: "For national networks and major judicial entities",
      target: "50+ seats",
      bonusLabel: "Custom invites",
      pricingFormulaLabel: "Custom seat limit (50+ users)",
      cta: "Contact Us",
      ctaHref: "/contact",
      highlighted: false,
      color: "border-zinc-200/60 dark:border-white/10",
      features: {
        ai: [
          "Full access to laws, regulations & principles",
          "Advanced search in the legal library",
          "Custom colleague invites",
        ],
        platform: [
          "Unlimited or custom seats",
          "Focus reading mode",
          "Shared favorites & notes",
        ],
        support: ["Dedicated account manager"],
      },
    },
  ],
};
