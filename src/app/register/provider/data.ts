import { Gavel, Buildings, Stamp, Shield, Scales, Briefcase } from "@phosphor-icons/react";
import { ProviderType } from "./types";

export const providerTypes = {
  ar: [
    { id: "lawyer" as ProviderType, icon: Gavel, label: "محامي", desc: "ممارسة المحاماة وتقديم الاستشارات", color: "bg-royal/5 text-royal", borderActive: "border-royal/30 bg-royal/5" },
    { id: "firm" as ProviderType, icon: Buildings, label: "شركة محاماة", desc: "مكتب قانوني أو شركة متكاملة", color: "bg-gold/10 text-gold-dark", borderActive: "border-gold/30 bg-gold/5" },
    { id: "notary" as ProviderType, icon: Stamp, label: "موثّق", desc: "توثيق العقود والمحررات الرسمية", color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400", borderActive: "border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10" },
    { id: "tracker" as ProviderType, icon: Shield, label: "معقّب", desc: "إنجاز المعاملات الحكومية", color: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400", borderActive: "border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/10" },
    { id: "arbitrator" as ProviderType, icon: Scales, label: "محكّم", desc: "التحكيم وفض النزاعات", color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400", borderActive: "border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/10" },
    // Owner answer ٢١٩: a lawyer account with practice_kind 'consultant' — no
    // pleading or hearings (Art. 18). Licensed in Saudi Arabia only; see
    // signupMetadata.ts for what the signup sends.
    { id: "consultant" as ProviderType, icon: Briefcase, label: "مستشار قانوني", desc: "الاستشارات والعقود والدراسات — دون ترافع (المادة ١٨)", color: "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400", borderActive: "border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/10" },
  ],
  en: [
    { id: "lawyer" as ProviderType, icon: Gavel, label: "Lawyer", desc: "Practice law and provide consultations", color: "bg-royal/5 text-royal", borderActive: "border-royal/30 bg-royal/5" },
    { id: "firm" as ProviderType, icon: Buildings, label: "Law Firm", desc: "Full legal office or firm", color: "bg-gold/10 text-gold-dark", borderActive: "border-gold/30 bg-gold/5" },
    { id: "notary" as ProviderType, icon: Stamp, label: "Notary", desc: "Contract and document notarization", color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400", borderActive: "border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10" },
    { id: "tracker" as ProviderType, icon: Shield, label: "Gov. Agent", desc: "Complete government transactions", color: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400", borderActive: "border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/10" },
    { id: "arbitrator" as ProviderType, icon: Scales, label: "Arbitrator", desc: "Arbitration and dispute resolution", color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400", borderActive: "border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/10" },
    { id: "consultant" as ProviderType, icon: Briefcase, label: "Legal Consultant", desc: "Consultations, contracts and studies — no court pleading (Art. 18)", color: "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400", borderActive: "border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/10" },
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
      name: "المحامي المحترف",
      price: "٣٩٩",
      period: "ر.س / شهر · ١٬٥٠٠ نقطة",
      desc: "اشتراك شهري بنقاط لأدوات الذكاء الاصطناعي",
      features: ["كل مميزات إدارة الممارسة", "١٬٥٠٠ نقطة كل شهر", "حزم شحن إضافية من ١٠٠ ر.س", "أسعار الأدوات بالنقاط حسب قائمة الأسعار", "السنوي ٣٬٩٩٠ ر.س"],
      cta: "اشترك الآن",
      highlighted: true,
    },
    {
      id: "pro",
      name: "إدارة مكتب المحاماة",
      price: "٩٩٠",
      period: "ر.س / شهر · ٣ مقاعد",
      desc: "إدارة المكتب بمقاعده وصلاحيات أعضائه",
      features: ["إدارة القضايا والجلسات والمهام", "٣ مقاعد مشمولة", "صلاحيات أعضاء المكتب", "شركة المحاماة: ١٬٤٩٠ ر.س/شهر بخمسة مقاعد", "مقاعد إضافية: تواصل مع المبيعات", "السنوي ٩٬٩٠٠ ر.س"],
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
      name: "Professional Lawyer",
      price: "399",
      period: "SAR / month · 1,500 points",
      desc: "Monthly subscription with AI tool points",
      features: ["All practice-management features", "1,500 points every month", "Extra top-ups from SAR 100", "Tool prices in points per the price list", "Yearly SAR 3,990"],
      cta: "Subscribe",
      highlighted: true,
    },
    {
      id: "pro",
      name: "Law Firm Management",
      price: "990",
      period: "SAR / month · 3 seats",
      desc: "Office management with seats and member permissions",
      features: ["Cases, hearings, and tasks", "3 seats included", "Firm member permissions", "Law firm: SAR 1,490/month with 5 seats", "Extra seats: contact sales", "Yearly SAR 9,900"],
      cta: "Start as an office",
      highlighted: false,
    },
  ],
};
