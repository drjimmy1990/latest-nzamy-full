import { Gavel, Buildings, Stamp, Shield, Scales } from "@phosphor-icons/react";
import { ProviderType } from "./types";

export const providerTypes = {
  ar: [
    { id: "lawyer" as ProviderType, icon: Gavel, label: "محامي", desc: "ممارسة المحاماة وتقديم الاستشارات", color: "bg-royal/5 text-royal", borderActive: "border-royal/30 bg-royal/5" },
    { id: "firm" as ProviderType, icon: Buildings, label: "شركة محاماة", desc: "مكتب قانوني أو شركة متكاملة", color: "bg-gold/10 text-gold-dark", borderActive: "border-gold/30 bg-gold/5" },
    { id: "notary" as ProviderType, icon: Stamp, label: "موثّق", desc: "توثيق العقود والمحررات الرسمية", color: "bg-blue-50 text-blue-600", borderActive: "border-blue-200 bg-blue-50" },
    { id: "tracker" as ProviderType, icon: Shield, label: "معقّب", desc: "إنجاز المعاملات الحكومية", color: "bg-orange-50 text-orange-600", borderActive: "border-orange-200 bg-orange-50" },
    { id: "arbitrator" as ProviderType, icon: Scales, label: "محكّم", desc: "التحكيم وفض النزاعات", color: "bg-purple-50 text-purple-600", borderActive: "border-purple-200 bg-purple-50" },
  ],
  en: [
    { id: "lawyer" as ProviderType, icon: Gavel, label: "Lawyer", desc: "Practice law and provide consultations", color: "bg-royal/5 text-royal", borderActive: "border-royal/30 bg-royal/5" },
    { id: "firm" as ProviderType, icon: Buildings, label: "Law Firm", desc: "Full legal office or firm", color: "bg-gold/10 text-gold-dark", borderActive: "border-gold/30 bg-gold/5" },
    { id: "notary" as ProviderType, icon: Stamp, label: "Notary", desc: "Contract and document notarization", color: "bg-blue-50 text-blue-600", borderActive: "border-blue-200 bg-blue-50" },
    { id: "tracker" as ProviderType, icon: Shield, label: "Gov. Agent", desc: "Complete government transactions", color: "bg-orange-50 text-orange-600", borderActive: "border-orange-200 bg-orange-50" },
    { id: "arbitrator" as ProviderType, icon: Scales, label: "Arbitrator", desc: "Arbitration and dispute resolution", color: "bg-purple-50 text-purple-600", borderActive: "border-purple-200 bg-purple-50" },
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
      name: "نظامي لايت",
      price: "مجاني",
      period: "",
      desc: "ابدأ واستكشف المنصة",
      features: ["ملف مهني عام", "ظهور في نتائج البحث", "٥ طلبات شهرياً", "تقييمات العملاء"],
      cta: "ابدأ مجاناً",
      highlighted: false,
    },
    {
      id: "ai",
      name: "نظامي AI",
      price: "١٩٩",
      period: "ر.س / شهر",
      desc: "للمحامين المستقلين والنشطين",
      features: ["كل مميزات لايت", "AI قانوني غير محدود", "Kanban Board للقضايا", "فريق حتى ٦ أعضاء", "تقارير شهرية آلية", "أولوية في البحث"],
      cta: "جرّب مجاناً ١٤ يوم",
      highlighted: true,
    },
    {
      id: "pro",
      name: "نظامي برو",
      price: "٤٩٩",
      period: "ر.س / شهر",
      desc: "ERP كامل للمكاتب الكبيرة",
      features: ["كل مميزات AI", "ERP لإدارة المكتب", "المكتبة القانونية الكاملة", "سوق المهنيين P2P", "إدارة فريق + صلاحيات", "دعم أولوية VIP"],
      cta: "تواصل مع المبيعات",
      highlighted: false,
    },
  ],
  en: [
    {
      id: "lite",
      name: "Nezamy Lite",
      price: "Free",
      period: "",
      desc: "Start and explore the platform",
      features: ["Public professional profile", "Search result visibility", "5 requests/month", "Client ratings"],
      cta: "Start Free",
      highlighted: false,
    },
    {
      id: "ai",
      name: "Nezamy AI",
      price: "199",
      period: "SAR / month",
      desc: "For active independent lawyers",
      features: ["All Lite features", "Unlimited legal AI", "Kanban Board for cases", "Team up to 6 members", "Automated monthly reports", "Priority in search"],
      cta: "Try Free for 14 Days",
      highlighted: true,
    },
    {
      id: "pro",
      name: "Nezamy Pro",
      price: "499",
      period: "SAR / month",
      desc: "Full ERP for large firms",
      features: ["All AI features", "Office management ERP", "Full legal library", "P2P professional marketplace", "Team management + permissions", "VIP priority support"],
      cta: "Contact Sales",
      highlighted: false,
    },
  ],
};
