import { Users, ShieldCheck } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";

// ─── Law firms (owner answer ١٧٥, 2026-10-16) ─────────────────────────────────
// Two plans replace the four yearly tiers (17,988 … 179,988+ SAR):
// - «مكتب المحاماة» (Firm Pro): 990 SAR/month or 9,900 SAR/year, 3 seats.
// - «شركة المحاماة» (Enterprise): 1,490 SAR/month or 14,900 SAR/year, 5 seats.
// The yearly price is ten months. Extra seats are sold at a descending price
// the owner has not set yet (owner question ٢١٧), so no seat price is shown,
// and no included firm points are claimed for the same reason.
// Ids are kept: FirmPlanId, firmProfileReadiness.ts and the admin pricing
// screen key on "firm-basic" / "firm-enterprise".
export const plansFirms: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "firm-basic",
      name: "مكتب المحاماة",
      badge: null,
      priceMonthly: "٩٩٠", priceYearly: "٩٬٩٠٠", periodMonthly: "ر.س / شهر", periodYearly: "ر.س / سنة",
      desc: "مكتب محاماة يدير قضاياه وموكّليه وفريقه في مكان واحد.",
      target: "مكتب محاماة",
      cta: "ابدأ كمكتب",
      ctaHref: "/register/provider?type=firm",
      highlighted: true,
      color: "border-royal/20",
      includedSeats: 3,
      minimumSeats: 3,
      pricingFormulaLabel: "٣ مقاعد مشمولة",
      features: {
        ai: [],
        platform: ["٣ مقاعد مشمولة", "القضايا والجلسات والمهل", "الموكّلون والاستشارات والعقود", "أعضاء المكتب وصلاحياتهم"],
        support: ["السنوي بسعر عشرة أشهر", "مقاعد إضافية عند الطلب"],
      },
    },
    {
      id: "firm-enterprise",
      name: "شركة المحاماة",
      badge: null,
      priceMonthly: "١٬٤٩٠", priceYearly: "١٤٬٩٠٠", periodMonthly: "ر.س / شهر", periodYearly: "ر.س / سنة",
      desc: "شركة محاماة بفريق أكبر تحتاج المقاعد والصلاحيات نفسها على نطاق أوسع.",
      target: "شركة محاماة",
      cta: "ابدأ كشركة",
      ctaHref: "/register/provider?type=firm",
      highlighted: false,
      color: "border-[#C8A762]/25",
      includedSeats: 5,
      minimumSeats: 5,
      pricingFormulaLabel: "٥ مقاعد مشمولة",
      features: {
        ai: [],
        platform: ["٥ مقاعد مشمولة", "القضايا والجلسات والمهل", "الموكّلون والاستشارات والعقود", "أعضاء الشركة وصلاحياتهم"],
        support: ["السنوي بسعر عشرة أشهر", "مقاعد إضافية عند الطلب"],
      },
    },
  ],
  en: [
    {
      id: "firm-basic",
      name: "Law Office",
      badge: null,
      priceMonthly: "990", priceYearly: "9,900", periodMonthly: "SAR / month", periodYearly: "SAR / year",
      desc: "A law office running its cases, clients and team in one place.",
      target: "Law office",
      cta: "Start as an office",
      ctaHref: "/register/provider?type=firm",
      highlighted: true,
      color: "border-royal/20",
      includedSeats: 3,
      minimumSeats: 3,
      pricingFormulaLabel: "3 seats included",
      features: {
        ai: [],
        platform: ["3 seats included", "Cases, hearings and deadlines", "Clients, consultations and contracts", "Members and their permissions"],
        support: ["Yearly priced at ten months", "Extra seats on request"],
      },
    },
    {
      id: "firm-enterprise",
      name: "Law Firm",
      badge: null,
      priceMonthly: "1,490", priceYearly: "14,900", periodMonthly: "SAR / month", periodYearly: "SAR / year",
      desc: "A larger law firm needing the same seats and permissions at a wider scale.",
      target: "Law firm",
      cta: "Start as a firm",
      ctaHref: "/register/provider?type=firm",
      highlighted: false,
      color: "border-[#C8A762]/25",
      includedSeats: 5,
      minimumSeats: 5,
      pricingFormulaLabel: "5 seats included",
      features: {
        ai: [],
        platform: ["5 seats included", "Cases, hearings and deadlines", "Clients, consultations and contracts", "Members and their permissions"],
        support: ["Yearly priced at ten months", "Extra seats on request"],
      },
    },
  ],
};

export const comparisonFirms: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    {
      category: "الاشتراك والمقاعد",
      icon: Users,
      rows: [
        { feature: "السعر", "firm-basic": "٩٩٠ ر.س / شهر", "firm-enterprise": "١٬٤٩٠ ر.س / شهر" },
        { feature: "السنوي", "firm-basic": "٩٬٩٠٠ ر.س", "firm-enterprise": "١٤٬٩٠٠ ر.س" },
        { feature: "المقاعد المشمولة", "firm-basic": "٣", "firm-enterprise": "٥" },
      ],
    },
    {
      category: "التشغيل",
      icon: ShieldCheck,
      rows: [
        { feature: "القضايا والجلسات والمهل", "firm-basic": true, "firm-enterprise": true },
        { feature: "أعضاء الفريق وصلاحياتهم", "firm-basic": true, "firm-enterprise": true },
      ],
    },
  ],
  en: [
    {
      category: "Subscription & seats",
      icon: Users,
      rows: [
        { feature: "Price", "firm-basic": "SAR 990 / month", "firm-enterprise": "SAR 1,490 / month" },
        { feature: "Yearly", "firm-basic": "SAR 9,900", "firm-enterprise": "SAR 14,900" },
        { feature: "Seats included", "firm-basic": "3", "firm-enterprise": "5" },
      ],
    },
    {
      category: "Operations",
      icon: ShieldCheck,
      rows: [
        { feature: "Cases, hearings and deadlines", "firm-basic": true, "firm-enterprise": true },
        { feature: "Team members and permissions", "firm-basic": true, "firm-enterprise": true },
      ],
    },
  ],
};
