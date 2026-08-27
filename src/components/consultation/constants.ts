// Eight further icons and `IconProps` were imported here and used by nothing —
// left behind when the specialty list moved to LEGAL_TAXONOMY. Dropped while
// this file was open; they were pulling dead weight into the client bundle.
import {
  Brain,
  Microphone,
  VideoCamera,
  User,
} from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";
import { buildConsultationDays } from "./consultationCalendar";

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

/**
 * The seven day-cards the booking calendar offers.
 *
 * This used to be a literal 6–12 April table, two of whose days carried an
 * empty `times` array — which StepScheduling renders as a greyed-out,
 * un-clickable day. So a visitor in August was shown a week from April, told
 * that two days of it were unavailable, and allowed to book the other five.
 * The dates are real now: see ./consultationCalendar.ts, which is a pure
 * function over a date so the whole grid could be put under `node --test`
 * (consultationCalendar.test.ts).
 *
 * WHY THIS IS EVALUATED AT MODULE LOAD, AND WHAT THAT COSTS
 * StepScheduling consumes `calendarSlots` as a plain array — `.map`, `.find` —
 * so turning it into a hook or a function call would mean editing that
 * component, which another change owns. Evaluating once per module load is
 * therefore the shape that fits. The cost: a browser tab left open across
 * midnight keeps yesterday's window until it is reloaded. That is a day-old
 * FIRST card, not a five-month-old week, and the grid is a stated preference
 * the team confirms rather than a slot anyone holds. Note the grid never
 * appears in server-rendered HTML — it is behind `scheduleMode === "calendar"`,
 * which starts null — so no build-time date is ever baked into the page.
 */
export const calendarSlots = buildConsultationDays(new Date());
