import { FileText, UploadSimple, CurrencyDollar, Users } from "@phosphor-icons/react";

export type AssignmentMethod = "direct" | "open_bids";

export interface FormData {
  description: string;
  region: string;
  budgetMin: number;
  budgetMax: number;
  deadline: string;
  confidential: boolean;
  files: File[];
  assignmentMethod: AssignmentMethod;
  // Lawyer-specific
  barNumber: string;
  courtName: string;
  caseNumber: string;
  serviceType: string;
}

export interface ServiceRequestWizardProps {
  serviceTitle: string;
  serviceTitleEn: string;
  serviceId: string;
  onClose: () => void;
  userRole: "individual" | "lawyer_client";
}

export const REGIONS = [
  { value: "riyadh", label: "الرياض", labelEn: "Riyadh" },
  { value: "jeddah", label: "جدة", labelEn: "Jeddah" },
  { value: "dammam", label: "الدمام", labelEn: "Dammam" },
  { value: "mecca", label: "مكة المكرمة", labelEn: "Mecca" },
  { value: "medina", label: "المدينة المنورة", labelEn: "Medina" },
  { value: "khobar", label: "الخبر", labelEn: "Al Khobar" },
  { value: "taif", label: "الطائف", labelEn: "Taif" },
  { value: "abha", label: "أبها", labelEn: "Abha" },
  { value: "tabuk", label: "تبوك", labelEn: "Tabuk" },
  { value: "other", label: "أخرى", labelEn: "Other" },
];

export const LAWYER_SERVICE_TYPES = [
  { value: "session_attendance", label: "حضور جلسة", labelEn: "Session Attendance" },
  { value: "brief_review", label: "مراجعة مذكرة", labelEn: "Brief Review" },
  { value: "specialist_consult", label: "استشارة تخصصية", labelEn: "Specialist Consultation" },
];

export const STEPS = [
  { id: 1, label: "وصف الطلب", labelEn: "Request Details", icon: FileText },
  { id: 2, label: "المستندات", labelEn: "Documents", icon: UploadSimple },
  { id: 3, label: "الميزانية والمهلة", labelEn: "Budget & Timeline", icon: CurrencyDollar },
  { id: 4, label: "طريقة الإسناد", labelEn: "Assignment Method", icon: Users },
];
