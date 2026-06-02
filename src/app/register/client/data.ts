import { User, Buildings, Bank, Handshake, Storefront } from "@phosphor-icons/react";
import { ClientType } from "./types";

export const clientTypes = {
  ar: [
    {
      id: "individual" as ClientType,
      icon: User,
      label: "فرد",
      desc: "استشارات، عقود، تمثيل قضائي شخصي",
      color: "bg-royal/5 text-royal",
      borderActive: "border-royal/30 bg-royal/5",
    },
    {
      id: "company" as ClientType,
      icon: Buildings,
      label: "شركة / مؤسسة",
      desc: "حلول قانونية للأعمال والمؤسسات الكبيرة",
      color: "bg-gold/10 text-gold-dark",
      borderActive: "border-gold/30 bg-gold/5",
    },
    {
      id: "micro" as ClientType,
      icon: Storefront,
      label: "منشأة صغيرة / بقالة",
      desc: "باقات اقتصادية واشتراطات للمشاريع الصغيرة",
      color: "bg-amber-50 text-amber-600",
      borderActive: "border-amber-300/30 bg-amber-50",
    },
    {
      id: "government" as ClientType,
      icon: Bank,
      label: "جهة حكومية",
      desc: "خدمات قانونية للجهات والهيئات الحكومية",
      color: "bg-blue-50 text-blue-600",
      borderActive: "border-blue-300/30 bg-blue-50",
    },
    {
      id: "ngo" as ClientType,
      icon: Handshake,
      label: "جمعية / منظمة",
      desc: "دعم قانوني للمنظمات غير الربحية",
      color: "bg-emerald-50 text-emerald-600",
      borderActive: "border-emerald-300/30 bg-emerald-50",
    },
  ],
  en: [
    {
      id: "individual" as ClientType,
      icon: User,
      label: "Individual",
      desc: "Personal consultations, contracts, litigation",
      color: "bg-royal/5 text-royal",
      borderActive: "border-royal/30 bg-royal/5",
    },
    {
      id: "company" as ClientType,
      icon: Buildings,
      label: "Company / Enterprise",
      desc: "Legal solutions for large businesses",
      color: "bg-gold/10 text-gold-dark",
      borderActive: "border-gold/30 bg-gold/5",
    },
    {
      id: "micro" as ClientType,
      icon: Storefront,
      label: "Small Business / Shop",
      desc: "Economic plans and requirements for small projects",
      color: "bg-amber-50 text-amber-600",
      borderActive: "border-amber-300/30 bg-amber-50",
    },
    {
      id: "government" as ClientType,
      icon: Bank,
      label: "Government Entity",
      desc: "Legal services for government bodies",
      color: "bg-blue-50 text-blue-600",
      borderActive: "border-blue-300/30 bg-blue-50",
    },
    {
      id: "ngo" as ClientType,
      icon: Handshake,
      label: "Association / NGO",
      desc: "Legal support for non-profits",
      color: "bg-emerald-50 text-emerald-600",
      borderActive: "border-emerald-300/30 bg-emerald-50",
    },
  ],
};
