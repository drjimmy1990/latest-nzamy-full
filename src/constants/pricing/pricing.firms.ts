import { Users, ShieldCheck } from "@phosphor-icons/react";
import { Plan, ComparisonCategory } from "./pricing.types";
import { bookPriceText } from "../../lib/pricing/priceBook";
import { FIRM_PLAN_SEATS } from "../../lib/pricing/firmSeats";

// ─── Law firms (owner answer ١٧٥, 2026-10-16) ─────────────────────────────────
// Two plans replace the four yearly tiers:
// - «مكتب المحاماة» (Firm Pro): 9,900 SAR/year, 5 seats.
// - «شركة المحاماة» (Enterprise): 14,900 SAR/year, 15 seats.
// Seats: owner question ٥٣ (18 Nov 2026) approved what is built — 5 / 15, the
// numbers public.firm_plan_seat_cap enforces (src/lib/pricing/firmSeats.ts).
// An extra seat's price is an admin setting (firmSeats.ts) that this page never
// reads: it is not sold publicly: the cards keep «تواصل مع المبيعات» and quote no price.
// The monthly cycle (990 / 1,490) is retired: professionals never pay monthly
// (owner, 26 Oct 2026), so «السنوي بسعر عشرة أشهر» is gone with it — it
// compared against a price no longer sold. Extra seats go through sales (owner answer
// ٢١٧, 2026-10-18): each card links «مقاعد إضافية: تواصل مع المبيعات» to
// /contact?type=firm-seats and quotes no seat price. The sales team's
// negotiating range stays in the CRM, never on a public page. No included
// firm points are claimed: the owner has set none.
// Ids are kept: FirmPlanId, firmProfileReadiness.ts and the admin pricing
// screen key on "firm-basic" / "firm-enterprise".
export const plansFirms: { ar: Plan[]; en: Plan[] } = {
  ar: [
    {
      id: "firm-basic",
      name: "مكتب المحاماة",
      badge: null,
      periodMonthly: "ر.س / شهر", periodYearly: "ر.س / سنة",
      desc: "مكتب محاماة يدير قضاياه وموكّليه وفريقه في مكان واحد.",
      target: "مكتب محاماة",
      cta: "ابدأ كمكتب",
      ctaHref: "/register/provider?type=firm",
      highlighted: true,
      color: "border-royal/20",
      includedSeats: FIRM_PLAN_SEATS["firm-basic"],
      minimumSeats: FIRM_PLAN_SEATS["firm-basic"],
      pricingFormulaLabel: "٥ مقاعد مشمولة",
      features: {
        ai: [],
        platform: ["٥ مقاعد مشمولة", "القضايا والجلسات والمهل", "الموكّلون والاستشارات والعقود", "أعضاء المكتب وصلاحياتهم"],
        support: [],
      },
      salesLine: { label: "مقاعد إضافية: تواصل مع المبيعات", href: "/contact?type=firm-seats" },
    },
    {
      id: "firm-enterprise",
      name: "شركة المحاماة",
      badge: null,
      periodMonthly: "ر.س / شهر", periodYearly: "ر.س / سنة",
      desc: "شركة محاماة بفريق أكبر تحتاج المقاعد والصلاحيات نفسها على نطاق أوسع.",
      target: "شركة محاماة",
      cta: "ابدأ كشركة",
      ctaHref: "/register/provider?type=firm",
      highlighted: false,
      color: "border-[#C8A762]/25",
      includedSeats: FIRM_PLAN_SEATS["firm-enterprise"],
      minimumSeats: FIRM_PLAN_SEATS["firm-enterprise"],
      pricingFormulaLabel: "١٥ مقعداً مشمولاً",
      features: {
        ai: [],
        platform: ["١٥ مقعداً مشمولاً", "القضايا والجلسات والمهل", "الموكّلون والاستشارات والعقود", "أعضاء الشركة وصلاحياتهم"],
        support: [],
      },
      salesLine: { label: "مقاعد إضافية: تواصل مع المبيعات", href: "/contact?type=firm-seats" },
    },
  ],
  en: [
    {
      id: "firm-basic",
      name: "Law Office",
      badge: null,
      periodMonthly: "SAR / month", periodYearly: "SAR / year",
      desc: "A law office running its cases, clients and team in one place.",
      target: "Law office",
      cta: "Start as an office",
      ctaHref: "/register/provider?type=firm",
      highlighted: true,
      color: "border-royal/20",
      includedSeats: FIRM_PLAN_SEATS["firm-basic"],
      minimumSeats: FIRM_PLAN_SEATS["firm-basic"],
      pricingFormulaLabel: "5 seats included",
      features: {
        ai: [],
        platform: ["5 seats included", "Cases, hearings and deadlines", "Clients, consultations and contracts", "Members and their permissions"],
        support: [],
      },
      salesLine: { label: "Extra seats: contact sales", href: "/contact?type=firm-seats" },
    },
    {
      id: "firm-enterprise",
      name: "Law Firm",
      badge: null,
      periodMonthly: "SAR / month", periodYearly: "SAR / year",
      desc: "A larger law firm needing the same seats and permissions at a wider scale.",
      target: "Law firm",
      cta: "Start as a firm",
      ctaHref: "/register/provider?type=firm",
      highlighted: false,
      color: "border-[#C8A762]/25",
      includedSeats: FIRM_PLAN_SEATS["firm-enterprise"],
      minimumSeats: FIRM_PLAN_SEATS["firm-enterprise"],
      pricingFormulaLabel: "15 seats included",
      features: {
        ai: [],
        platform: ["15 seats included", "Cases, hearings and deadlines", "Clients, consultations and contracts", "Members and their permissions"],
        support: [],
      },
      salesLine: { label: "Extra seats: contact sales", href: "/contact?type=firm-seats" },
    },
  ],
};

export const comparisonFirms: { ar: ComparisonCategory[]; en: ComparisonCategory[] } = {
  ar: [
    {
      category: "الاشتراك والمقاعد",
      icon: Users,
      rows: [
        // §2 rule 1: a firm is offered quarterly / half / yearly — no monthly row.
        { feature: "السنوي", "firm-basic": `${bookPriceText("firm-basic", "yearly", "ar")} ر.س`, "firm-enterprise": `${bookPriceText("firm-enterprise", "yearly", "ar")} ر.س` },
        { feature: "المقاعد المشمولة", "firm-basic": "٥", "firm-enterprise": "١٥" },
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
        { feature: "Yearly", "firm-basic": `SAR ${bookPriceText("firm-basic", "yearly", "en")}`, "firm-enterprise": `SAR ${bookPriceText("firm-enterprise", "yearly", "en")}` },
        { feature: "Seats included", "firm-basic": "5", "firm-enterprise": "15" },
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
