/**
 * lawyerCasesData — mappers and display config for the lawyer's case list.
 *
 * NO CASE DATA LIVES HERE. It used to: a seven-row `MOCK_CASES` array with
 * named clients («شركة الأفق», «ريم المطيري»), court dates and case values, all
 * invented. It was removed on 27 August 2026 because grep found no importer —
 * `src/app/dashboard/lawyer/cases/page.tsx` builds its list from
 * `getWorkflowRequestsByReceiver` through `workflowToCase` below, and
 * `src/components/ui/CasePicker.tsx` only takes `workflowTypeToCaseType`. So
 * the array was not a fallback anybody rendered; it was a loaded gun sitting in
 * a module two live screens import, one careless `?? MOCK_CASES` away from
 * showing a real lawyer somebody else's fabricated docket.
 *
 * If a case list ever needs an empty-state, it belongs in the page as one of
 * the three honest states (loading / unreadable / empty) — not as rows here.
 */
import {
  Warning, TrendUp, Dot, SquaresFour, User, Handshake, UsersThree
} from "@phosphor-icons/react";
import { type WorkflowRequest } from "@/lib/workflowStore";
import type { CaseStatus, CaseType, CourtDegree, Priority, KanbanCol, CollabFilter, Case } from "@/app/dashboard/lawyer/cases/_types";

export function workflowTypeToCaseType(request: WorkflowRequest): CaseType {
  const raw = String(request.metadata?.requestedType ?? request.metadata?.serviceId ?? request.title);
  if (raw.includes("labor")) return "labor";
  if (raw.includes("family") || raw.includes("inheritance")) return "family";
  if (raw.includes("criminal")) return "criminal";
  if (raw.includes("admin")) return "admin";
  if (raw.includes("real")) return "real_estate";
  return "commercial";
}

export function workflowToCase(request: WorkflowRequest): Case {
  const isAssigned = request.status === "assigned" || request.status === "in_review";
  const isCancelled = request.status === "cancelled";
  const isCompleted = request.status === "completed";
  // Map backend WorkflowRequestStatus → frontend CaseStatus.
  // completed → "closed", cancelled → "archived", assigned/in_review → "active",
  // everything else (draft/pending_payment/pending_assignment) → "pending".
  const status: CaseStatus = isCancelled
    ? "archived"
    : isCompleted
      ? "closed"
      : isAssigned
        ? "active"
        : "pending";
  return {
    id: request.id,
    title: request.title,
    client: request.requester.name || "عميل نظامي",
    court: (request.metadata?.court as string) || "بانتظار تحديد الجهة",
    type: workflowTypeToCaseType(request),
    status,
    priority: request.payment.amount >= 800 ? "high" : "normal",
    nextDate: String(request.metadata?.deadline ?? "بانتظار الإسناد"),
    filedDate: new Date(request.createdAt).toLocaleDateString("ar-SA"),
    degree: "primary",
    stage: isAssigned ? "تم قبول الطلب" : "طلب وارد من منصة نظامي",
    kanbanCol: isCompleted ? "closed" : isAssigned ? "docs_prep" : "new",
    team: [],
    hasDeadline: Boolean(request.metadata?.deadline),
    value: request.payment.amount ? `${request.payment.amount.toLocaleString("ar-SA")} ر.س` : "",
    lastActivity: "الآن",
    tags: ["وارد من المنصة"],
    collab: "solo",
  };
}

export const COURTS_LIST = [
  { id: "المحكمة التجارية",         degree: "primary" as CourtDegree, icon: "🏢" },
  { id: "المحكمة العامة",           degree: "primary" as CourtDegree, icon: "⚖️" },
  { id: "المحكمة العمالية",         degree: "labor"   as CourtDegree, icon: "👷" },
  { id: "المحكمة الجزائية",         degree: "criminal" as CourtDegree, icon: "🔒" },
  { id: "محكمة الأحوال الشخصية",   degree: "primary" as CourtDegree, icon: "👨‍👩‍👧" },
  { id: "المحكمة الإدارية",         degree: "admin"   as CourtDegree, icon: "🏛" },
  { id: "ديوان المظالم (الإدارية)",degree: "admin"   as CourtDegree, icon: "📜" },
  { id: "محكمة الاستئناف",          degree: "appeal"  as CourtDegree, icon: "🔗" },
  { id: "محكمة الاستئناف التجارية", degree: "appeal"  as CourtDegree, icon: "📊" },
  { id: "محكمة الاستئناف الإدارية",degree: "appeal"  as CourtDegree, icon: "🗂" },
  { id: "المحكمة العليا",           degree: "supreme" as CourtDegree, icon: "👑" },
  { id: "المحكمة العقارية",         degree: "primary" as CourtDegree, icon: "🏠" },
  { id: "محكمة التنفيذ",            degree: "primary" as CourtDegree, icon: "⚡" },
  { id: "محكمة الأسرة",             degree: "primary" as CourtDegree, icon: "❤️" },
];

export const DEGREE_LABELS: Record<CourtDegree, string> = {
  primary:  "ابتدائي",
  appeal:   "استئناف",
  supreme:  "عليا",
  admin:    "إداري (ديوان المظالم)",
  labor:    "عمالية",
  criminal: "جزائية (ابتدائي)",
};

export const STATUS_CONFIG: Record<CaseStatus, { label: string; color: string; dot: string; bg: string }> = {
  active:    { label: "نشطة",    color: "text-emerald-500", dot: "bg-emerald-400 animate-pulse", bg: "bg-emerald-500/10 border-emerald-500/20" },
  pending:   { label: "انتظار",  color: "text-amber-500",   dot: "bg-amber-400",                 bg: "bg-amber-500/10 border-amber-500/20" },
  suspended: { label: "معلقة",   color: "text-blue-500",    dot: "bg-blue-400",                  bg: "bg-blue-500/10 border-blue-500/20" },
  closed:    { label: "مغلقة",   color: "text-slate-400",   dot: "bg-slate-300",                 bg: "bg-slate-100 border-slate-200 dark:bg-white/[0.04] dark:border-white/[0.08]" },
  archived:  { label: "أرشيف",   color: "text-purple-400",  dot: "bg-purple-300",                bg: "bg-purple-500/10 border-purple-500/20" },
};

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; icon: any }> = {
  critical: { label: "حرج",   color: "text-red-500",     icon: Warning },
  high:     { label: "عالٍ",  color: "text-orange-500",  icon: TrendUp },
  normal:   { label: "عادي",  color: "text-blue-500",    icon: Dot },
  low:      { label: "منخفض", color: "text-slate-400",   icon: Dot },
};

export const TYPE_LABELS: Record<CaseType, string> = {
  commercial: "تجاري", labor: "عمالي", civil: "مدني",
  criminal: "جنائي", family: "أحوال شخصية", real_estate: "عقاري", admin: "إداري",
};

export const KANBAN_COLS: { key: KanbanCol; label: string; color: string; bg: string }[] = [
  { key: "new",       label: "جديدة",      color: "text-slate-500",    bg: "bg-slate-100 dark:bg-white/[0.04]" },
  { key: "docs_prep", label: "تحضير وثائق", color: "text-blue-500",     bg: "bg-blue-50 dark:bg-blue-500/10" },
  { key: "hearing",   label: "جلسات",      color: "text-royal",        bg: "bg-royal/8 dark:bg-royal/15" },
  { key: "appeal",    label: "طعن/استئناف", color: "text-orange-500",   bg: "bg-orange-50 dark:bg-orange-500/10" },
  { key: "closed",    label: "منتهية",     color: "text-emerald-500",  bg: "bg-emerald-50 dark:bg-emerald-500/10" },
];

export const TIME_FILTERS = [
  { key: "all",    label: "الكل" },
  { key: "today",  label: "اليوم" },
  { key: "week",   label: "هذا الأسبوع" },
  { key: "month",  label: "هذا الشهر" },
  { key: "urgent", label: "طعون قادمة" },
];

export const COLLAB_TABS: { key: CollabFilter; label: string; desc: string; icon: any }[] = [
  { key: "all",    label: "جميع القضايا", desc: "كل الملفات المفتوحة",              icon: SquaresFour },
  { key: "solo",   label: "بمفردي",        desc: "أتولى هذه القضايا منفرداً",         icon: User },
  { key: "shared", label: "مشتركة",        desc: "مع محامِ خارجي من شبكتي",          icon: Handshake },
  { key: "team",   label: "فريقي",          desc: "يشاركني فيها فريقي المصغر (Solo+)", icon: UsersThree },
];
