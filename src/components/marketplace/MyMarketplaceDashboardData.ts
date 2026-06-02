import { CheckCircle, Clock, SealCheck, X } from "@phosphor-icons/react";
import React from "react";

export type ReqStatus = "open" | "in-progress" | "completed" | "cancelled";

export interface Offer {
  id: number;
  providerName: string;
  rating: number;
  price: number;
  deliveryTime: string;
  isTop: boolean;
  status: "pending" | "accepted" | "rejected";
}

export interface MyRequest {
  id: number;
  categoryLabel: string;
  title: string;
  city: string;
  urgency: "urgent" | "normal" | "flexible";
  budgetMin: number;
  budgetMax: number;
  status: ReqStatus;
  offersCount: number;
  postedAt: string;
  offers: Offer[];
}

export interface CollabRequest {
  id: string;
  fromLawyer: string;
  fromCity: string;
  fromRating: number;
  caseTitle: string;
  caseType: string;
  myRole: string;
  mySplit: number;
  totalFee: number;
  status: "pending" | "accepted" | "negotiating";
  sentAt: string;
}

export const MY_REQUESTS: MyRequest[] = [
  {
    id: 1,
    categoryLabel: "توثيق ووكالات",
    title: "توثيق وكالة من سجين في سجن الحائر بالرياض",
    city: "الرياض",
    urgency: "urgent",
    budgetMin: 300,
    budgetMax: 600,
    status: "in-progress",
    offersCount: 3,
    postedAt: "منذ يومين",
    offers: [
      { id: 1, providerName: "أبو عبدالله — موثّق معتمد", rating: 4.9, price: 450, deliveryTime: "١٨–٢٤ ساعة", isTop: true, status: "accepted" },
      { id: 2, providerName: "المحترف للتعقيب", rating: 4.7, price: 380, deliveryTime: "٢٤–٣٦ ساعة", isTop: false, status: "rejected" },
      { id: 3, providerName: "متعقب الرياض", rating: 4.5, price: 320, deliveryTime: "٢٤–٤٨ ساعة", isTop: false, status: "rejected" },
    ],
  },
  {
    id: 2,
    categoryLabel: "تعقيب دوائر",
    title: "متابعة قضية عمالية في محكمة العمل بجدة — الجلسة الثلاثاء",
    city: "جدة",
    urgency: "urgent",
    budgetMin: 200,
    budgetMax: 400,
    status: "open",
    offersCount: 7,
    postedAt: "منذ ٥ ساعات",
    offers: [
      { id: 4, providerName: "متعقب جدة المحترف", rating: 4.8, price: 300, deliveryTime: "يوم واحد", isTop: true, status: "pending" },
      { id: 5, providerName: "خبير التعقيب الغربي", rating: 4.6, price: 280, deliveryTime: "يوم واحد", isTop: false, status: "pending" },
    ],
  },
  {
    id: 3,
    categoryLabel: "صياغة قانونية",
    title: "صياغة مذكرة أسباب استئناف — قضية تجارية في محكمة الاستئناف",
    city: "الرياض",
    urgency: "normal",
    budgetMin: 800,
    budgetMax: 2000,
    status: "open",
    offersCount: 4,
    postedAt: "منذ يوم",
    offers: [
      { id: 6, providerName: "د. محمد الغامدي — المستشار القانوني", rating: 4.9, price: 1500, deliveryTime: "٧ أيام", isTop: true, status: "pending" },
      { id: 7, providerName: "مكتب الصياغة القانونية", rating: 4.7, price: 1200, deliveryTime: "٥ أيام", isTop: false, status: "pending" },
    ],
  },
  {
    id: 4,
    categoryLabel: "ترجمة قانونية",
    title: "ترجمة قانونية معتمدة لعقد تجاري (إنجليزي → عربي)",
    city: "الدمام",
    urgency: "normal",
    budgetMin: 300,
    budgetMax: 600,
    status: "completed",
    offersCount: 6,
    postedAt: "منذ أسبوعين",
    offers: [
      { id: 8, providerName: "مترجمون قانونيون معتمدون", rating: 4.9, price: 420, deliveryTime: "٣ أيام", isTop: true, status: "accepted" },
    ],
  },
];

// Re-map the configurations with static React element icons
export const getStatusCfg = (status: ReqStatus) => {
  const configs = {
    open:          { label: "مفتوح للعروض", bg: "bg-emerald-500/10", color: "text-emerald-500", icon: React.createElement(CheckCircle, { size: 12, weight: "fill" }) },
    "in-progress": { label: "جارٍ التنفيذ", bg: "bg-blue-500/10",    color: "text-blue-500",    icon: React.createElement(Clock, { size: 12, weight: "fill" }) },
    completed:     { label: "مكتمل",        bg: "bg-gray-400/10",    color: "text-gray-400",    icon: React.createElement(SealCheck, { size: 12, weight: "fill" }) },
    cancelled:     { label: "ملغي",          bg: "bg-red-400/10",    color: "text-red-400",     icon: React.createElement(X, { size: 12, weight: "bold" }) },
  };
  return configs[status];
};

export const URGENCY_CFG = {
  urgent:   { label: "عاجل", dot: "bg-red-500",    color: "text-red-500" },
  normal:   { label: "عادي", dot: "bg-blue-500",   color: "text-blue-500" },
  flexible: { label: "مرن",  dot: "bg-emerald-500",color: "text-emerald-500" },
};

export const OFFER_STATUS_CFG = {
  pending:  { label: "في الانتظار", color: "text-amber-500", bg: "bg-amber-500/10" },
  accepted: { label: "مقبول",       color: "text-emerald-500", bg: "bg-emerald-500/10" },
  rejected: { label: "مرفوض",       color: "text-gray-400",    bg: "bg-gray-400/10" },
};

export const COLLAB_REQUESTS: CollabRequest[] = [
  {
    id: "col-1",
    fromLawyer: "أ. سعد الحربي",
    fromCity: "الرياض",
    fromRating: 4.8,
    caseTitle: "نزاع تجاري — مطالبة بعقد توريد",
    caseType: "تجاري",
    myRole: "محامي الاستئناف",
    mySplit: 40,
    totalFee: 15000,
    status: "pending",
    sentAt: "منذ ٣ ساعات",
  },
  {
    id: "col-2",
    fromLawyer: "مكتب العتيبي وشركاه",
    fromCity: "جدة",
    fromRating: 4.9,
    caseTitle: "قضية عقارية — منازعة ملكية",
    caseType: "عقاري",
    myRole: "مستشار قانوني مساند",
    mySplit: 25,
    totalFee: 22000,
    status: "negotiating",
    sentAt: "أمس",
  },
];

export const COLLAB_STATUS_CFG = {
  pending:     { label: "دعوة جديدة",     color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
  accepted:    { label: "مقبول",           color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  negotiating: { label: "قيد التفاوض",    color: "text-blue-500",    bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
};
