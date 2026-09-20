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
      name: "محفظة أدوات الذكاء",
      price: "تبدأ من ١٬٠٠٠",
      period: "ر.س / شحنة نقاط",
      desc: "ادفع بحسب استخدامك الفعلي للأدوات",
      features: ["كل مميزات إدارة الممارسة", "١٬٥٠٠ نقطة عند شحن ١٬٠٠٠ ر.س", "لا يوجد اشتراك AI شهري", "خصم النقاط حسب الأداة", "صلاحية ٦ أشهر"],
      cta: "اختر باقة الشحن",
      highlighted: true,
    },
    {
      id: "pro",
      name: "إدارة مكتب المحاماة",
      price: "١٧٬٩٨٨",
      period: "ر.س / سنة · ٣ مقاعد",
      desc: "ERP سنوي للمكاتب بصلاحيات ومقاعد فعلية",
      features: ["إدارة القضايا والجلسات والمهام", "٣ مقاعد مشمولة", "صلاحيات أعضاء المكتب", "سوق المهنيين P2P", "إضافة مقاعد حسب الخطة"],
      cta: "تواصل مع المبيعات",
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
      name: "AI Credit Wallet",
      price: "From 1,000",
      period: "SAR / points top-up",
      desc: "Pay for the AI tools you actually use",
      features: ["All practice-management features", "1,500 points for a SAR 1,000 top-up", "No monthly AI subscription", "Points deducted per tool", "6-month validity"],
      cta: "Choose a Top-up",
      highlighted: true,
    },
    {
      id: "pro",
      name: "Law Firm Management",
      price: "17,988",
      period: "SAR / year · 3 seats",
      desc: "Annual firm ERP with real seats and roles",
      features: ["Cases, hearings, and tasks", "3 seats included", "Firm member permissions", "P2P professional marketplace", "Additional seats by plan"],
      cta: "Contact Sales",
      highlighted: false,
    },
  ],
};
