import {
  Brain,
  Microphone,
  VideoCamera,
  User,
  Buildings,
  Gavel,
  FileText,
  Scales,
  Heart,
  House,
  ShieldCheck,
  IconProps
} from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";

export type ConsultationType = "ai" | "voice" | "video" | "in-person";
export type ScheduleMode = "instant" | "asap" | "calendar" | null;

export interface SpecialtyDef {
  id: string;
  icon: React.ElementType;
  label: string;
}

export interface TypeDef {
  id: ConsultationType;
  icon: React.ElementType;
  label: string;
  sublabel: string;
  price: string;
  desc: string;
  color: string;
  badge: string | null;
}

export const specialties: Record<"ar" | "en", SpecialtyDef[]> = {
  ar: [
    ...LEGAL_TAXONOMY.map(t => ({
      id: t.id,
      icon: (PhosphorIcons as any)[t.iconName || "BookOpen"] || PhosphorIcons.BookOpen,
      label: t.label,
    })),
    { id: "ai-general", icon: Brain, label: "استشارة AI عامة" },
  ],
  en: [
    ...LEGAL_TAXONOMY.map(t => ({
      id: t.id,
      icon: (PhosphorIcons as any)[t.iconName || "BookOpen"] || PhosphorIcons.BookOpen,
      label: t.labelEn,
    })),
    { id: "ai-general", icon: Brain, label: "General AI Consultation" },
  ],
};

export const consultationTypes: Record<"ar" | "en", TypeDef[]> = {
  ar: [
    {
      id: "ai", icon: Brain, label: "نظامي AI", sublabel: "استجابة فورية", price: "٩٩ ر.س",
      desc: "مساعد قانوني ذكي مدرّب على الأنظمة السعودية", color: "border-royal/20 hover:border-royal/40", badge: null,
    },
    {
      id: "voice", icon: Microphone, label: "استشارة صوتية", sublabel: "مع محامٍ معتمد", price: "٢٩٩ ر.س",
      desc: "مكالمة صوتية مع محامٍ مرخص متخصص في مجال قضيتك", color: "border-emerald-200 hover:border-emerald-400", badge: null,
    },
    {
      id: "video", icon: VideoCamera, label: "استشارة مرئية", sublabel: "مع محامٍ معتمد", price: "٢٩٩ ر.س",
      desc: "مكالمة فيديو مع محامٍ مرخص — الأكثر تفاعلاً", color: "border-blue-200 hover:border-blue-400", badge: "الأكثر طلباً",
    },
    {
      id: "in-person", icon: User, label: "استشارة حضورية", sublabel: "في مكتب المحامي", price: "٥٩٩ ر.س",
      desc: "لقاء مباشر في مكتب المحامي لمناقشة قضيتك بعمق", color: "border-gold/20 hover:border-gold/40", badge: null,
    },
  ],
  en: [
    {
      id: "ai", icon: Brain, label: "Nezamy AI", sublabel: "Instant response", price: "99 SAR",
      desc: "Smart legal assistant trained on Saudi laws and regulations", color: "border-royal/20 hover:border-royal/40", badge: null,
    },
    {
      id: "voice", icon: Microphone, label: "Voice Consultation", sublabel: "With a certified lawyer", price: "299 SAR",
      desc: "Voice call with a licensed lawyer specializing in your area", color: "border-emerald-200 hover:border-emerald-400", badge: null,
    },
    {
      id: "video", icon: VideoCamera, label: "Video Consultation", sublabel: "With a certified lawyer", price: "299 SAR",
      desc: "Video call with a licensed lawyer — most interactive option", color: "border-blue-200 hover:border-blue-400", badge: "Most Popular",
    },
    {
      id: "in-person", icon: User, label: "In-Person Consultation", sublabel: "At the lawyer's office", price: "599 SAR",
      desc: "Face-to-face meeting at the lawyer's office for in-depth discussion", color: "border-gold/20 hover:border-gold/40", badge: null,
    },
  ],
};

export const calendarSlots = [
  { dayAr: "الأحد", dayEn: "Sun", date: "6 أبر", dateEn: "Apr 6", times: ["10:00", "14:00", "16:30"] },
  { dayAr: "الاثنين", dayEn: "Mon", date: "7 أبر", dateEn: "Apr 7", times: ["09:00", "11:00", "15:00"] },
  { dayAr: "الثلاثاء", dayEn: "Tue", date: "8 أبر", dateEn: "Apr 8", times: [] },
  { dayAr: "الأربعاء", dayEn: "Wed", date: "9 أبر", dateEn: "Apr 9", times: ["10:00", "13:00", "17:00"] },
  { dayAr: "الخميس", dayEn: "Thu", date: "10 أبر", dateEn: "Apr 10", times: ["09:00", "12:00", "15:30"] },
  { dayAr: "الجمعة", dayEn: "Fri", date: "11 أبر", dateEn: "Apr 11", times: [] },
  { dayAr: "السبت", dayEn: "Sat", date: "12 أبر", dateEn: "Apr 12", times: ["11:00"] },
];
