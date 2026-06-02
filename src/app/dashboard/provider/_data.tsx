import type { ReactNode } from "react";
import type { Variants } from "framer-motion";
import { CheckCircle, Clock, Hourglass, SealCheck } from "@phosphor-icons/react";

export type OfferStatus = "pending" | "accepted" | "in-progress" | "completed";

export interface MyOffer {
  id: number;
  requestTitle: string;
  requestCity: string;
  category: string;
  myPrice: number;
  status: OfferStatus;
  postedBy: string;
  dueDate: string;
}

export interface MarketRequest {
  id: number;
  title: string;
  city: string;
  category: string;
  budgetMin: number;
  budgetMax: number;
  urgency: "urgent" | "normal" | "flexible";
  offersCount: number;
  postedAt: string;
  isVerified: boolean;
}

export interface Review {
  id: number;
  clientName: string;
  rating: number;
  comment: string;
  date: string;
  serviceName: string;
}

export interface UpcomingService {
  id: number;
  title: string;
  city: string;
  date: string;
  time: string;
  clientName: string;
  status: "confirmed" | "pending-confirmation";
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

export const MY_OFFERS: MyOffer[] = [
  {
    id: 1,
    requestTitle: "توثيق وكالة من سجين في سجن الحائر",
    requestCity: "الرياض",
    category: "توثيق ووكالات",
    myPrice: 450,
    status: "accepted",
    postedBy: "أ. فهد المطيري",
    dueDate: "٢ مايو ٢٠٢٦",
  },
  {
    id: 2,
    requestTitle: "متابعة قضية عمالية في محكمة العمل بجدة",
    requestCity: "جدة",
    category: "تعقيب دوائر",
    myPrice: 320,
    status: "in-progress",
    postedBy: "مكتب العدل للمحاماة",
    dueDate: "١٥ أبريل ٢٠٢٦",
  },
  {
    id: 3,
    requestTitle: "مراجعة ملف إيقاف خدمات مؤسسة في وزارة الموارد البشرية",
    requestCity: "الرياض",
    category: "تعقيب دوائر",
    myPrice: 580,
    status: "pending",
    postedBy: "شركة البناء الحديث",
    dueDate: "٢٠ أبريل ٢٠٢٦",
  },
  {
    id: 4,
    requestTitle: "ترجمة قانونية معتمدة لعقد تجاري",
    requestCity: "الدمام",
    category: "ترجمة قانونية",
    myPrice: 420,
    status: "completed",
    postedBy: "أ. خالد المطيري",
    dueDate: "مكتمل",
  },
];

export const MARKET_REQUESTS: MarketRequest[] = [
  {
    id: 5,
    title: "مطلوب مُعقِّب لمتابعة استئناف ضريبي في هيئة الزكاة بالرياض",
    city: "الرياض",
    category: "تعقيب دوائر",
    budgetMin: 400,
    budgetMax: 700,
    urgency: "urgent",
    offersCount: 2,
    postedAt: "منذ ساعة",
    isVerified: true,
  },
  {
    id: 6,
    title: "توثيق وكالة نظامية من شخص خارج المملكة عبر سفارة المملكة",
    city: "جدة",
    category: "توثيق ووكالات",
    budgetMin: 350,
    budgetMax: 650,
    urgency: "normal",
    offersCount: 1,
    postedAt: "منذ ٣ ساعات",
    isVerified: true,
  },
  {
    id: 7,
    title: "متابعة تسجيل علامة تجارية في المنظمة السعودية للملكية الفكرية",
    city: "الرياض",
    category: "تعقيب دوائر",
    budgetMin: 300,
    budgetMax: 500,
    urgency: "flexible",
    offersCount: 0,
    postedAt: "منذ يوم",
    isVerified: false,
  },
];

export const REVIEWS: Review[] = [
  {
    id: 1,
    clientName: "أ. فهد المطيري",
    rating: 5,
    comment: "سرعة في التنفيذ واحترافية عالية. أنجز التوثيق في يوم واحد!",
    date: "٢٥ مارس ٢٠٢٦",
    serviceName: "توثيق وكالة",
  },
  {
    id: 2,
    clientName: "مكتب الرشيد للمحاماة",
    rating: 5,
    comment: "دقيق في متابعة الملفات ويُبلّغ فوراً عن أي تطور.",
    date: "١٨ مارس ٢٠٢٦",
    serviceName: "تعقيب دوائر",
  },
  {
    id: 3,
    clientName: "شركة النخبة التجارية",
    rating: 4,
    comment: "كفء ومنظم. أتمنى تسريع التواصل قليلاً.",
    date: "١٠ مارس ٢٠٢٦",
    serviceName: "تعقيب دوائر",
  },
];

export const UPCOMING: UpcomingService[] = [
  {
    id: 1,
    title: "توثيق وكالة من سجن الحائر",
    city: "الرياض",
    date: "١٠ أبريل",
    time: "٩:٠٠ص",
    clientName: "أ. فهد المطيري",
    status: "confirmed",
  },
  {
    id: 2,
    title: "متابعة جلسة محكمة العمل",
    city: "جدة",
    date: "١٥ أبريل",
    time: "١١:٠٠ص",
    clientName: "مكتب العدل",
    status: "confirmed",
  },
  {
    id: 3,
    title: "مراجعة ملف وزارة الموارد البشرية",
    city: "الرياض",
    date: "٢٠ أبريل",
    time: "غير محدد",
    clientName: "شركة البناء الحديث",
    status: "pending-confirmation",
  },
];

// ─── Config ───────────────────────────────────────────────────────────────────

export const OFFER_STATUS_CONFIG: Record<OfferStatus, { label: string; bg: string; color: string; icon: ReactNode }> = {
  pending:     { label: "في انتظار الموافقة", bg: "bg-amber-500/10",   color: "text-amber-500",   icon: <Hourglass size={12} weight="fill" /> },
  accepted:    { label: "مقبول — جارٍ التنسيق", bg: "bg-blue-500/10",  color: "text-blue-500",    icon: <CheckCircle size={12} weight="fill" /> },
  "in-progress":{ label: "جارٍ التنفيذ",        bg: "bg-emerald-500/10",color: "text-emerald-500", icon: <Clock size={12} weight="fill" /> },
  completed:   { label: "مكتمل",               bg: "bg-gray-400/10",   color: "text-gray-400",    icon: <SealCheck size={12} weight="fill" /> },
};

export const URGENCY_CONFIG = {
  urgent:   { label: "عاجل", color: "text-red-500", dot: "bg-red-500" },
  normal:   { label: "عادي", color: "text-blue-500", dot: "bg-blue-500" },
  flexible: { label: "مرن",  color: "text-emerald-500", dot: "bg-emerald-500" },
};

// ─── Fade Up Variant ─────────────────────────────────────────────────────────
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" },
  }),
};
