import {
  Briefcase,
  Scales,
  Buildings,
  ShieldCheck,
  Heart,
  Bank,
} from "@phosphor-icons/react";
import { type SchedulingChoice } from "@/components/SmartSchedulingPicker";

export type CaseType =
  | "عمالية"
  | "مدنية"
  | "تجارية"
  | "جنائية"
  | "أسرة"
  | "إدارية"
  | null;

export interface FormData {
  caseType: CaseType;
  description: string;
  court: string;
  city: string;
  sessionDate: string;
  urgent: boolean;
  documents: string[];
  agreed: boolean;
  scheduling: SchedulingChoice;
}

export const CASE_TYPES = [
  { label: "عمالية", labelEn: "Labor", icon: Briefcase, color: "#0B3D2E" },
  { label: "مدنية", labelEn: "Civil", icon: Scales, color: "#1a5c45" },
  { label: "تجارية", labelEn: "Commercial", icon: Buildings, color: "#C8A762" },
  { label: "جنائية", labelEn: "Criminal", icon: ShieldCheck, color: "#8B1A1A" },
  { label: "أسرة", labelEn: "Family", icon: Heart, color: "#5c1a6b" },
  { label: "إدارية", labelEn: "Administrative", icon: Bank, color: "#1a3a6b" },
] as const;

export const BUDGET_MAP: Record<string, string> = {
  عمالية: "٢,٠٠٠ - ٨,٠٠٠ ر.س",
  مدنية: "٣,٠٠٠ - ١٢,٠٠٠ ر.س",
  تجارية: "٥,٠٠0 - ٢٥,٠٠٠ ر.س",
  جنائية: "٨,٠٠٠ - ٥٠,٠٠٠ ر.س",
  أسرة: "٢,٥٠٠ - ١٠,٠٠٠ ر.س",
  إدارية: "٣,٠٠٠ - ١٥,٠٠٠ ر.س",
};

export const DOCS_MAP: Record<string, string[]> = {
  عمالية: ["عقد العمل", "شهادة الخدمة", "قرار الفصل", "كشف الراتب"],
  مدنية: ["عقد الإيجار", "الهوية الوطنية", "وثيقة الملكية", "المستندات الداعمة"],
  تجارية: ["السجل التجاري", "عقد الشركة", "الميزانية العمومية", "المراسلات التجارية"],
  جنائية: ["المحاضر الرسمية", "شهادة الشهود", "التقارير الطبية", "الأدلة المادية"],
  أسرة: ["عقد الزواج", "شهادات الميلاد", "وثائق الطلاق", "وثائق الحضانة"],
  إدارية: ["القرار الإداري", "الطعون السابقة", "الوثائق الرسمية", "المراسلات الحكومية"],
  default: ["الهوية الوطنية", "وكالة رسمية", "مستندات الدعوى", "توثيق إضافي"],
};

export const stepVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? -60 : 60,
    opacity: 0,
  }),
};
