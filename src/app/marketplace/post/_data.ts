"use client";

import {
  Stamp, Buildings, FileText, Gavel, Globe, ChatCircle, PencilSimple
} from "@phosphor-icons/react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ServiceCategory =
  | "taqeeb"
  | "tawtheeq"
  | "drafting"
  | "arbitration"
  | "translation"
  | "consultation"
  | "court-rep";

export type UrgencyType = "urgent" | "normal" | "flexible";

export interface FormData {
  category: ServiceCategory | "";
  city: string;
  title: string;
  description: string;
  duration: string;
  urgency: UrgencyType;
  budgetMin: number;
  budgetMax: number;
  attachments: string[];
  terms: boolean;
}

// ─── Category Config ──────────────────────────────────────────────────────────

export const CATEGORIES = [
  {
    id: "taqeeb" as ServiceCategory,
    label: "تعقيب دوائر",
    desc: "متابعة معاملات أمام جهات حكومية، وزارات، محاكم",
    icon: Buildings,
    suggestedMin: 200,
    suggestedMax: 700,
  },
  {
    id: "tawtheeq" as ServiceCategory,
    label: "توثيق ووكالات",
    desc: "توثيق وكالات شرعية، توثيق من سجون، كتابة العدل",
    icon: Stamp,
    suggestedMin: 300,
    suggestedMax: 600,
  },
  {
    id: "drafting" as ServiceCategory,
    label: "صياغة قانونية",
    desc: "صياغة مذكرات، عقود، أسباب استئناف، ردود",
    icon: PencilSimple,
    suggestedMin: 500,
    suggestedMax: 5000,
  },
  {
    id: "arbitration" as ServiceCategory,
    label: "تحكيم ووساطة",
    desc: "محكّم قانوني، وساطة في نزاعات تجارية أو عائلية",
    icon: Gavel,
    suggestedMin: 3000,
    suggestedMax: 15000,
  },
  {
    id: "translation" as ServiceCategory,
    label: "ترجمة قانونية",
    desc: "ترجمة معتمدة لعقود ووثائق قانونية",
    icon: Globe,
    suggestedMin: 200,
    suggestedMax: 800,
  },
  {
    id: "consultation" as ServiceCategory,
    label: "استشارة متخصصة",
    desc: "استشارة في مجال قانوني تخصصي (ضرائب، عمل، تجاري)",
    icon: ChatCircle,
    suggestedMin: 200,
    suggestedMax: 1000,
  },
  {
    id: "court-rep" as ServiceCategory,
    label: "تمثيل قضائي",
    desc: "الحضور والتمثيل في دائرة قضائية محددة",
    icon: FileText,
    suggestedMin: 400,
    suggestedMax: 2000,
  },
];

export const CITIES = [
  "الرياض", "جدة", "مكة المكرمة", "المدينة المنورة",
  "الدمام", "الأحساء", "تبوك", "القصيم", "عسير",
  "الطائف", "الجوف", "نجران", "المنطقة الشمالية",
];

export const DURATIONS = [
  "في غضون ٢٤ ساعة",
  "خلال ٣ أيام",
  "خلال أسبوع",
  "خلال ٢ أسبوع",
  "خلال شهر",
  "مرن / غير محدد",
];

export const URGENCY_OPTIONS = [
  { id: "urgent"   as UrgencyType, label: "🔴 عاجل",    desc: "يحتاج تنفيذاً فورياً أو خلال ٢٤ ساعة" },
  { id: "normal"   as UrgencyType, label: "🔵 عادي",    desc: "وقت معقول — خلال أيام" },
  { id: "flexible" as UrgencyType, label: "🟢 مرن",     desc: "لا يوجد ضغط زمني" },
];

// ─── Step Labels ──────────────────────────────────────────────────────────────
export const STEPS = [
  { n: 1, label: "نوع الخدمة" },
  { n: 2, label: "تفاصيل الطلب" },
  { n: 3, label: "الميزانية" },
  { n: 4, label: "المراجعة والنشر" },
];

// ─── Initial State ────────────────────────────────────────────────────────────
export const INITIAL: FormData = {
  category: "",
  city: "",
  title: "",
  description: "",
  duration: "",
  urgency: "normal",
  budgetMin: 0,
  budgetMax: 0,
  attachments: [],
  terms: false,
};

