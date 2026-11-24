import { Gavel, Buildings, Stamp, Shield, Scales, Briefcase } from "@phosphor-icons/react";
import { ProviderType } from "./types";
import { bookPriceText } from "@/lib/pricing/priceBook";

export const providerTypes = {
  ar: [
    { id: "lawyer" as ProviderType, icon: Gavel, label: "محامي", desc: "ممارسة المحاماة وتقديم الاستشارات", color: "bg-royal/5 text-royal", borderActive: "border-royal/30 bg-royal/5" },
    { id: "firm" as ProviderType, icon: Buildings, label: "شركة محاماة", desc: "مكتب قانوني أو شركة متكاملة", color: "bg-gold/10 text-gold-dark", borderActive: "border-gold/30 bg-gold/5" },
    { id: "notary" as ProviderType, icon: Stamp, label: "موثّق", desc: "توثيق العقود والمحررات الرسمية", color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400", borderActive: "border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10" },
    { id: "tracker" as ProviderType, icon: Shield, label: "مراجع حكومي", desc: "إنجاز المعاملات الحكومية", color: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400", borderActive: "border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/10" },
    { id: "arbitrator" as ProviderType, icon: Scales, label: "محكّم", desc: "التحكيم وفض النزاعات", color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400", borderActive: "border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/10" },
    // Owner answer ٢١٩: a lawyer account with practice_kind 'consultant' — no
    // pleading or hearings (Art. 18). Licensed in Saudi Arabia only; see
    // signupMetadata.ts for what the signup sends.
    { id: "consultant" as ProviderType, icon: Briefcase, label: "مستشار قانوني", desc: "المكتبة القانونية — دون ترافع (المادة ١٨)، وأدوات العمل بتفويض من مكتب أو محامٍ", color: "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400", borderActive: "border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/10" },
  ],
  en: [
    { id: "lawyer" as ProviderType, icon: Gavel, label: "Lawyer", desc: "Practice law and provide consultations", color: "bg-royal/5 text-royal", borderActive: "border-royal/30 bg-royal/5" },
    { id: "firm" as ProviderType, icon: Buildings, label: "Law Firm", desc: "Full legal office or firm", color: "bg-gold/10 text-gold-dark", borderActive: "border-gold/30 bg-gold/5" },
    { id: "notary" as ProviderType, icon: Stamp, label: "Notary", desc: "Contract and document notarization", color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400", borderActive: "border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10" },
    { id: "tracker" as ProviderType, icon: Shield, label: "Gov. Agent", desc: "Complete government transactions", color: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400", borderActive: "border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/10" },
    { id: "arbitrator" as ProviderType, icon: Scales, label: "Arbitrator", desc: "Arbitration and dispute resolution", color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400", borderActive: "border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/10" },
    { id: "consultant" as ProviderType, icon: Briefcase, label: "Legal Consultant", desc: "Legal library — no court pleading (Art. 18); work tools by delegation from a firm or lawyer", color: "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400", borderActive: "border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/10" },
  ],
};

export const specializations = {
  ar: ["عمالي", "تجاري", "أحوال شخصية", "جنائي", "إداري", "عقاري", "ملكية فكرية", "بنكي/مالي", "شركات", "تنفيذ"],
  en: ["Labor", "Commercial", "Family", "Criminal", "Administrative", "Real Estate", "IP", "Banking/Finance", "Corporate", "Enforcement"],
};

export const plans = {
  ar: [
    {
      id: "lite",
      name: "إدارة الممارسة",
      price: "مجاني",
      period: "",
      desc: "ERP مجاني للمحامي الفرد صاحب الحساب النشط",
      features: ["إدارة القضايا", "الجلسات والمهل", "المهام والتقويم", "ملف مهني وسوق المهنيين"],
      cta: "ابدأ مجاناً",
      highlighted: false,
    },
    {
      id: "ai",
      // Batch l14 (owner 23 Nov, §حادي عشر #2): lawyer-pro is «إدارة المكتب»,
      // sold quarterly / half-yearly / yearly; the yearly price is shown.
      name: "إدارة المكتب",
      price: bookPriceText("lawyer-pro", "yearly", "ar"),
      period: "ر.س / سنة",
      desc: `اشتراك إدارة المكتب، أو ${bookPriceText("lawyer-pro", "quarterly", "ar")} ر.س لثلاثة أشهر و${bookPriceText("lawyer-pro", "semiannual", "ar")} ر.س لستة أشهر`,
      features: ["كل مميزات إدارة الممارسة", `مع المكتبة القانونية: ${bookPriceText("lawyer-bundle", "yearly", "ar")} ر.س سنوياً (خصم ١٥٪)`, "النقاط بحزم الشحن فقط", `حزم شحن من ${bookPriceText("topup-500", "once", "ar")} ر.س`, "أسعار الأدوات بالنقاط حسب قائمة الأسعار"],
      cta: "اشترك الآن",
      highlighted: true,
    },
    {
      id: "pro",
      name: "إدارة مكتب المحاماة",
      price: bookPriceText("firm-basic", "yearly", "ar"),
      period: "ر.س / سنة · ٥ مقاعد",
      desc: "إدارة المكتب بمقاعده وصلاحيات أعضائه",
      features: ["إدارة القضايا والجلسات والمهام", "٥ مقاعد مشمولة", "صلاحيات أعضاء المكتب", `شركة المحاماة: ${bookPriceText("firm-enterprise", "yearly", "ar")} ر.س/سنة بخمسة عشر مقعداً`, "مقاعد إضافية: تواصل مع المبيعات"],
      cta: "ابدأ كمكتب",
      highlighted: false,
    },
  ],
  en: [
    {
      id: "lite",
      name: "Practice Management",
      price: "Free",
      period: "",
      desc: "Free ERP for an active solo lawyer account",
      features: ["Case management", "Hearings and deadlines", "Tasks and calendar", "Professional profile and marketplace"],
      cta: "Start Free",
      highlighted: false,
    },
    {
      id: "ai",
      name: "Office Management",
      price: bookPriceText("lawyer-pro", "yearly", "en"),
      period: "SAR / year",
      desc: `Office management, or SAR ${bookPriceText("lawyer-pro", "quarterly", "en")} for 3 months and SAR ${bookPriceText("lawyer-pro", "semiannual", "en")} for 6 months`,
      features: ["All practice-management features", `With the legal library: SAR ${bookPriceText("lawyer-bundle", "yearly", "en")} a year (15% off)`, "Points from top-ups only", `Top-ups from SAR ${bookPriceText("topup-500", "once", "en")}`, "Tool prices in points per the price list"],
      cta: "Subscribe",
      highlighted: true,
    },
    {
      id: "pro",
      name: "Law Firm Management",
      price: bookPriceText("firm-basic", "yearly", "en"),
      period: "SAR / year · 5 seats",
      desc: "Office management with seats and member permissions",
      features: ["Cases, hearings, and tasks", "5 seats included", "Firm member permissions", `Law firm: SAR ${bookPriceText("firm-enterprise", "yearly", "en")}/year with 15 seats`, "Extra seats: contact sales"],
      cta: "Start as an office",
      highlighted: false,
    },
  ],
};
