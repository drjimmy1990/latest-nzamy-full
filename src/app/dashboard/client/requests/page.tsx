"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ChatCircle, FileText, Gavel, ShieldStar,
  Clock, CheckCircle, XCircle, HourglassSimple,
  ArrowClockwise, ArrowLeft, Plus, MagnifyingGlass, Storefront,
  Users, CalendarCheck, X, Copy, Check, DownloadSimple,
  NotePencil, Scales, Lightbulb, Warning, Info, ArrowSquareOut,
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import {
  listClientWorkflowRequestsPage,
  updateWorkflowRequestById,
  WorkflowApiError,
} from "@/lib/clientWorkflowRepository";
import type { WorkflowRequest, WorkflowRequestStatus } from "@/lib/workflowStore";
import {
  listOk,
  listFailed,
  listViewState,
  itemsOf,
  type ListRead,
} from "@/lib/services/listRead";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<WorkflowRequestStatus, {
  label: string; dot: string; badge: string; Icon: React.ElementType
}> = {
  draft:              { label: "مسودة",             dot: "bg-slate-400",  badge: "text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",     Icon: HourglassSimple },
  pending_payment:    { label: "بانتظار الدفع",     dot: "bg-amber-400",  badge: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700/30",   Icon: HourglassSimple },
  pending_assignment: { label: "بانتظار التعيين",   dot: "bg-amber-400 animate-pulse", badge: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700/30", Icon: HourglassSimple },
  assigned:           { label: "مُعيَّن",           dot: "bg-blue-500 animate-pulse",  badge: "text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700/30",     Icon: Clock },
  in_review:          { label: "جارٍ التنفيذ",      dot: "bg-blue-500 animate-pulse",  badge: "text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700/30",     Icon: Clock },
  completed:          { label: "مكتمل",             dot: "bg-emerald-500", badge: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700/30", Icon: CheckCircle },
  cancelled:          { label: "ملغي",              dot: "bg-red-400",     badge: "text-red-700 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700/30",                         Icon: XCircle },
};

// Same reasoning as `typeCfg` below: the seven statuses match the database
// CHECK constraint exactly today (20260518_client_workflow_backend_ready.sql),
// but an unmodelled value must degrade to a label rather than index to
// `undefined` and take the whole list down on `status.label`.
const UNKNOWN_STATUS_CFG = {
  label: "حالة غير معروفة",
  dot: "bg-gray-400",
  badge: "text-gray-600 bg-gray-100 border-gray-200 dark:bg-white/5 dark:text-gray-300 dark:border-white/10",
  Icon: HourglassSimple,
} as const;

function statusCfg(status: WorkflowRequestStatus) {
  return STATUS_CFG[status] ?? UNKNOWN_STATUS_CFG;
}

type TypeConfig = { label: string; icon: React.ElementType; color: string };

// Every value the `service_requests_type_check` CHECK constraint allows
// (supabase/migrations/20260814_service_orders_types.sql). The four `ai_*`
// rows are the four premium services; before this round only `ai_draft` had a
// config and its label read "مسودة AI" — half English, which the owner's س٤
// ruling forbids. Labels here are the service *category* in Arabic, matching
// what the client saw when they placed the order.
// Colours are one per type and deliberately distinct from their neighbours:
// purple / emerald / amber / blue were taken, so the AI four use rose, indigo,
// orange and teal.
const TYPE_CFG: Record<WorkflowRequest["type"], TypeConfig> = {
  service:          { label: "خدمة",        icon: ShieldStar, color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400" },
  consultation:     { label: "استشارة",     icon: ChatCircle, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" },
  business_case:    { label: "قضية",        icon: Gavel,      color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400" },
  ngo_volunteer:    { label: "متطوع",       icon: Users,      color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400" },
  ai_draft:         { label: "صياغة مذكرة", icon: NotePencil, color: "text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400" },
  ai_contracts:     { label: "عقود",        icon: FileText,   color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400" },
  ai_wargaming:     { label: "محاكاة",      icon: Scales,     color: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400" },
  ai_legal_opinion: { label: "رأي قانوني",  icon: Lightbulb,  color: "text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400" },
};

// The CHECK constraint keeps the union above complete for anything the server
// can send today, but this page is a client bundle: a row carrying a type
// added to the database before this build ships would otherwise index to
// `undefined` and crash the whole list on `type.icon`. Degrade to a neutral,
// honest label instead of white-screening.
const UNKNOWN_TYPE_CFG: TypeConfig = {
  label: "طلب",
  icon: FileText,
  color: "text-gray-600 bg-gray-100 dark:bg-white/5 dark:text-gray-300",
};

function typeCfg(type: WorkflowRequest["type"]): TypeConfig {
  return TYPE_CFG[type] ?? UNKNOWN_TYPE_CFG;
}

type FilterKey = "all" | "pending" | "active" | "completed" | "cancelled";

// One status → one chip, as a total Record so TypeScript refuses to compile if
// a status is ever added without being placed. Counts and the visible list are
// both derived from this single map (see `matchesFilter`), which is the whole
// point: they used to be written twice and had drifted apart — «معلقة» counted
// `pending_payment` but showed only `pending_assignment`, «جارية» counted
// `assigned` but showed only `in_review`, and `draft` was counted by no chip
// at all. A chip reading 5 and listing 3 is exactly the kind of silent lie
// that gets worse now that AI orders (which sit in `assigned` for the whole
// time an admin is working them) land on this page.
const STATUS_GROUP: Record<WorkflowRequestStatus, Exclude<FilterKey, "all">> = {
  draft:              "pending",
  pending_payment:    "pending",
  pending_assignment: "pending",
  assigned:           "active",
  in_review:          "active",
  completed:          "completed",
  cancelled:          "cancelled",
};

function matchesFilter(status: WorkflowRequestStatus, filter: FilterKey): boolean {
  if (filter === "all") return true;
  return STATUS_GROUP[status] === filter;
}

/**
 * True for an order placed through the four premium services
 * (`createServiceOrder` → POST /api/v1/service-requests), which always stamps
 * `metadata.service`. Those orders have a full detail page at
 * `/ai/orders/[id]` carrying their attachments and their delivered file;
 * everything else on this page does not, so the link must not be offered for
 * them — including the localStorage-only rows that `/ai/contract-drafter`
 * writes with the same `ai_workspace` receiver, which that page would 404 on.
 */
function isPremiumServiceOrder(req: WorkflowRequest): boolean {
  return req.receiver === "ai_workspace" && typeof req.metadata?.service === "string";
}

// ─── Format date ──────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(iso));
  } catch { return iso; }
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function RequestCard({
  req,
  onCancel,
  onSelect,
  cancelling,
}: {
  req: WorkflowRequest;
  onCancel: (id: string) => void;
  onSelect: (req: WorkflowRequest) => void;
  /** A cancel for THIS request is in flight — the button says so and refuses a second click. */
  cancelling: boolean;
}) {
  const status = statusCfg(req.status);
  const type   = typeCfg(req.type);
  const CatIcon    = type.icon;
  const StatusIcon = status.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      onClick={() => onSelect(req)}
      className="bg-white dark:bg-[#161b22] rounded-2xl border border-gray-100 dark:border-white/8 p-5 hover:shadow-md transition-all cursor-pointer hover:border-[#0B3D2E]/30 dark:hover:border-emerald-500/30 group"
    >
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${type.color}`}>
          <CatIcon size={18} weight="duotone" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="font-bold text-sm text-gray-900 dark:text-white leading-tight truncate">{req.title}</p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md mt-1 ${type.color}`}>
                {type.label}
              </span>
            </div>
            {/* Status badge */}
            <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl flex-shrink-0 border ${status.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status.dot}`} />
              {status.label}
            </span>
          </div>

          {/* Description */}
          {req.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3 line-clamp-2">{req.description}</p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 mb-3 flex-wrap">
            <span className="flex items-center gap-1 font-mono">
              <Clock size={12} /> {fmtDate(req.createdAt)}
            </span>
            {req.payment.amount > 0 && (
              <span className="font-bold font-mono text-gray-600 dark:text-gray-300">
                {req.payment.amount.toLocaleString("ar-SA")} ر.س
              </span>
            )}
            <span className="font-mono text-gray-300 dark:text-gray-700 text-[10px]">{req.id}</span>
          </div>

          {/* Audit trail last event */}
          {(req.auditTrail?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-600 mb-3">
              <CalendarCheck size={11} />
              <span>آخر تحديث: {req.auditTrail[0].event} — {fmtDate(req.auditTrail[0].at)}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold flex items-center gap-1 ${
              req.status === "completed" ? "text-emerald-600 dark:text-emerald-400" : "text-[#0B3D2E] dark:text-emerald-400"
            }`}>
              <StatusIcon size={12} weight="fill" /> {status.label}
            </span>
            {(req.status === "pending_assignment" || req.status === "pending_payment" || req.status === "draft") ? (
              <button
                onClick={(e) => { e.stopPropagation(); onCancel(req.id); }}
                disabled={cancelling}
                className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors mr-auto font-bold border border-red-100 dark:border-red-900/30 px-3 py-1 rounded-xl bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {cancelling ? "جارٍ الإلغاء…" : "إلغاء الطلب"}
              </button>
            ) : (
              <span className="text-xs text-[#0B3D2E] dark:text-emerald-400 font-bold opacity-70 group-hover:opacity-100 transition-all mr-auto flex items-center gap-1 bg-[#0B3D2E]/5 dark:bg-emerald-500/10 px-3 py-1 rounded-xl hover:scale-105 active:scale-95">
                معاينة <ArrowLeft size={12} className="rtl:rotate-180" />
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface RequestDetailModalProps {
  req: WorkflowRequest | null;
  onClose: () => void;
  onCancel: (id: string) => void;
}

function RequestDetailModal({ req, onClose, onCancel }: RequestDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!req) return null;

  const status = statusCfg(req.status);
  const type = typeCfg(req.type);
  const CatIcon = type.icon;
  const premium = isPremiumServiceOrder(req);

  const handleCopy = () => {
    navigator.clipboard.writeText(req.description || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      const element = document.createElement("a");
      const file = new Blob([req.description || ""], { type: 'text/plain;charset=utf-8' });
      element.href = URL.createObjectURL(file);
      // What this writes is `req.description`, and for a premium service order
      // that is the client's own 200-character excerpt — not the deliverable.
      // Naming the file after the order title ("المحاكي الشامل — تجاري-….txt")
      // would leave a saved artifact that reads like the delivered document on
      // the very page the client goes to looking for it.
      element.download = premium
        ? `ملخص-الطلب-${req.id}.txt`
        : `${req.title}-${req.id}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }, 1200);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", duration: 0.4 }}
          className="relative bg-white dark:bg-[#161b22] border border-gray-100 dark:border-white/8 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden z-10"
        >
          {/* Header decoration bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-[#0B3D2E] via-emerald-500 to-[#C8A762]" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X size={18} weight="bold" />
          </button>

          <div className="p-6 md:p-8 max-h-[85vh] overflow-y-auto" dir="rtl">
            {/* Title & Category info */}
            <div className="flex items-start gap-4 mb-6">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${type.color}`}>
                <CatIcon size={24} weight="duotone" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg ${type.color}`}>
                    {type.label}
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-0.5 rounded-full border ${status.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status.dot}`} />
                    {status.label}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                  {req.title}
                </h2>
                <p className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-1">
                  الرقم التعريفي: {req.id}
                </p>
              </div>
            </div>

            {/* Quick Details Grid */}
            <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 mb-6">
              <div>
                <span className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase">تاريخ الطلب</span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 font-mono mt-0.5 block">{fmtDate(req.createdAt)}</span>
              </div>
              <div>
                <span className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase">الجهة المستقبلة</span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5 block">
                  {/*
                    Was "نظامي عالمي (مساعد AI)". No createServiceOrder order
                    could reach this modal before — they were all filtered out —
                    so the string never had to be true. It is reachable now, and
                    it is false: an `ai_workspace` order is claimed and
                    fulfilled by a person in /dashboard/admin/service-orders,
                    who reads the file and uploads the deliverable. No AI
                    touches it. «فريق نظامي» is the name every one of the four
                    wizards already uses for that team when it takes the order
                    (ai/contracts/page.tsx:324, legal-opinion/SubmitStep.tsx:48),
                    so the client sees the same fulfiller here as there.
                  */}
                  {req.receiver === "ai_workspace" ? "فريق نظامي" : "المنصة القانونية"}
                </span>
              </div>
              {req.payment.amount > 0 && (
                <div>
                  <span className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase">الرسوم</span>
                  <span className="text-sm font-black text-gray-900 dark:text-white font-mono mt-0.5 block">
                    {req.payment.amount.toLocaleString("ar-SA")} ر.س
                  </span>
                </div>
              )}
              {req.metadata && req.metadata.contractType && (
                <div>
                  <span className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase">نوع المسودة</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5 block font-mono">
                    {String(req.metadata.contractType)}
                  </span>
                </div>
              )}
            </div>

            {/* Preview Section */}
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-300 mb-3 flex items-center gap-1.5">
                <FileText size={16} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
                {/*
                  This used to read "معاينة مسودة العقد" for every ai_draft
                  row — a false claim for the orders that now arrive here. For
                  all four premium services `createServiceOrder` sets
                  `description` to the first 200 characters of what the CLIENT
                  typed (caseText / contractDesc / scenario summary / letter
                  subject — see useDraftState.ts:159, useContractsState.ts:204
                  and :257, wargaming/page.tsx:945, legal-opinion/page.tsx:402
                  and LetterWorkflow.tsx:185). It is never a produced draft,
                  and it is always truncated, so the heading says exactly that.
                */}
                {premium ? "مقتطف من طلبك كما أرسلته" : "تفاصيل ووصف الطلب"}
              </h3>
              
              <div className="relative group">
                <div className="absolute -inset-px bg-gradient-to-r from-emerald-500/10 to-amber-500/10 rounded-2xl blur opacity-70 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 pointer-events-none" />
                <div className="relative bg-amber-50/[0.3] dark:bg-zinc-900/[0.4] border border-amber-100/50 dark:border-white/5 rounded-2xl p-5 leading-relaxed text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-zinc-300 max-h-80 overflow-y-auto shadow-inner">
                  {req.description || "لا يوجد وصف إضافي متوفر لهذه المعاملة."}
                </div>
              </div>

              {/* Action bar for document */}
              {req.description && (
                <div className="flex items-center gap-3 mt-3">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCopy}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                      copied
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check size={14} weight="bold" />
                        تم نسخ النص
                      </>
                    ) : (
                      <>
                        <Copy size={14} weight="bold" />
                        نسخ النص
                      </>
                    )}
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                  >
                    {downloading ? (
                      <span className="inline-block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <DownloadSimple size={14} weight="bold" />
                    )}
                    {downloading ? "جاري التحميل..." : "تحميل كملف نصي"}
                  </motion.button>
                </div>
              )}
            </div>

            {/* Audit Trail Timeline.
                Hidden entirely when there is nothing to show. The list route's
                `toWorkflowRequest` hard-codes `auditTrail: []` (events are only
                joined by the [id] route), so every server-side row reaches this
                modal with an empty trail — which used to render a heading over
                an empty rail. There is no event log on /ai/orders/[id] either
                (that page shows a three-stage status strip, not a log), so
                nothing here may promise one. */}
            {(req.auditTrail?.length ?? 0) > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-300 mb-4 flex items-center gap-1.5">
                <CalendarCheck size={16} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
                سجل النشاط والتحديثات
              </h3>

              <div className="relative border-r-2 border-gray-100 dark:border-white/5 mr-3 space-y-4">
                {req.auditTrail.map((event, index) => (
                  <div key={index} className="relative pr-6">
                    {/* Circle bullet */}
                    <span className={`absolute -right-[7px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#161b22] ${
                      index === 0 ? "bg-[#0B3D2E] dark:bg-emerald-400 animate-pulse" : "bg-gray-300 dark:bg-gray-700"
                    }`} />
                    
                    <div className="flex flex-col">
                      <span className={`text-xs font-bold ${index === 0 ? "text-gray-900 dark:text-white" : "text-gray-500"}`}>
                        {event.event === "created" ? "تم إنشاء الطلب بنجاح" : 
                         event.event === "contract_draft_saved" ? "تم حفظ وصياغة مسودة العقد آلياً" : 
                         event.event === "cancelled_by_client" ? "تم إلغاء المعاملة من قبل العميل" : event.event}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                        بواسطة: {event.by} • {fmtDate(event.at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center gap-3 pt-6 mt-6 border-t border-gray-100 dark:border-white/5">
              {(req.status === "pending_assignment" || req.status === "pending_payment" || req.status === "draft") && (
                <button
                  onClick={() => {
                    onCancel(req.id);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-red-200 hover:border-transparent bg-red-50/50 hover:bg-red-500 text-red-600 hover:text-white text-xs font-bold transition-all"
                >
                  إلغاء هذا الطلب
                </button>
              )}

              {/*
                This modal shows the excerpt and the activity log only. For a
                premium service order the attachments the client uploaded and
                the file the team delivers live on /ai/orders/[id], so «طلباتي»
                links there rather than pretending this is the whole order.
                Gated on isPremiumServiceOrder because that page loads through
                getServiceOrder() and would 404 on a localStorage-only row.
              */}
              {premium && (
                <Link
                  href={`/ai/orders/${req.id}`}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#0B3D2E]/20 dark:border-emerald-500/30 text-[#0B3D2E] dark:text-emerald-400 hover:bg-[#0B3D2E]/5 dark:hover:bg-emerald-500/10 text-xs font-bold transition-all"
                >
                  <ArrowSquareOut size={14} weight="bold" />
                  فتح صفحة الطلب الكاملة
                </Link>
              )}

              <button
                onClick={onClose}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-white hover:bg-[#0a3328] text-xs font-bold transition-all mr-auto shadow-sm"
              >
                إغلاق المعاينة
              </button>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function MyRequestsPage() {
  const user = useUser();
  /**
   * The read, in the one shape the whole platform now uses for a list —
   * `ListRead` + `listViewState()` (src/lib/services/listRead.ts).
   *
   * WHAT THIS REPLACES, AND WHAT IT DOES NOT CHANGE. This page already told
   * the three states apart with a `hasLoaded`/`loadFailed` pair and a
   * `countsKnown` flag, and every sentence it prints is unchanged. The pair is
   * gone only so that this page, «قضاياي», «استشاراتي», the two document
   * pages, the business overview and /ai/orders express the same distinction
   * the same way instead of six times in six spellings.
   *
   * `loading` remains a separate flag: `listViewState(false, null)` answers
   * 'unreadable' by design — a read nobody attempted is not an empty one — so
   * the first paint, and the wait while useUser() resolves, must be told they
   * are still waiting rather than allowed to fall into the failure branch.
   */
  const [read, setRead] = useState<ListRead<WorkflowRequest> | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]     = useState<FilterKey>("all");
  const [search, setSearch]     = useState("");
  const [selectedRequest, setSelectedRequest] = useState<WorkflowRequest | null>(null);
  // True when the server holds more requests than this page asked for. The cap
  // is stated on screen rather than truncating in silence — see
  // CLIENT_REQUESTS_FETCH_LIMIT in clientWorkflowRepository.ts.
  const [truncatedAt, setTruncatedAt] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  /**
   * Only the NEWEST load may write.
   *
   * `load()` runs from four places here — the mount effect, the
   * `nzamy-workflow-updated` listener, the `finally` of every cancel, and
   * «إعادة المحاولة» — so overlapping loads are the normal case, not the edge
   * one. Without this check the slower reply lands last, and the damaging
   * direction is a retry that succeeds followed by the earlier failure
   * arriving: «تعذّرت قراءة طلباتك» would reappear over the list it just read,
   * and the count chips would go with it.
   */
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const page = await listClientWorkflowRequestsPage({ requesterUserId: user.userId });
      if (seq !== loadSeq.current) return;
      // `degraded` IS the failure, and it now arrives with `requests: []`
      // rather than with localStorage rows, so there is nothing to keep beside
      // the flag any more.
      //
      // NO `total` IS PASSED TO listOk(). It counts what the SERVER matched,
      // before the requester filter inside listClientWorkflowRequestsPage
      // dropped the rows that are not this client's, so it would make
      // `truncated` true on a list that was never cut. The cap below is
      // computed from `total` vs `fetched`, two numbers that are comparable.
      setRead(page.degraded ? listFailed<WorkflowRequest>() : listOk(page.requests));
      // Compare the server's total against the rows it actually returned
      // (pre-filter), not against what survives the requester filter: the
      // question is only ever "did the limit cut rows off".
      setTruncatedAt(page.total !== null && page.total > page.fetched ? page.limit : null);
    } catch (err) {
      console.error("[client requests] load failed:", err);
      if (seq !== loadSeq.current) return;
      setRead(listFailed<WorkflowRequest>());
      setTruncatedAt(null);
    } finally {
      // A superseded load leaves `loading` alone — the newer one owns it, and
      // clearing it here would drop the page out of «جارٍ تحميل طلباتك…» while
      // the read that will actually be rendered is still in flight.
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [user.userId]);

  /** The retry the failure banner presses — a refetch, not a page reload. */
  const retry = useCallback(() => {
    setLoading(true);
    setRead(null);
    void load();
  }, [load]);

  // Load from store + listen for updates
  useEffect(() => {
    // Wait for useUser() to resolve before fetching anything.
    //
    // useUser starts at GUEST_SESSION, so `user.userId` is undefined on the
    // first render in Supabase mode too. A load fired there goes down the
    // no-requester-id branch of listClientWorkflowRequestsPage, which now
    // (correctly) refuses every server row — it exists only for the
    // localStorage/demo path. Firing it anyway would race the real load, and
    // if the id-less one resolved second it would overwrite a correct list
    // with an empty one and leave «طلباتي» reading "لا توجد طلبات بعد" until
    // a workflow event or a page reload. `loading` is set to false by both
    // branches of useUser (Supabase and demo), so this cannot deadlock; in
    // demo mode it resolves with userId still undefined and the id-less branch
    // then runs exactly as intended, against localStorage.
    if (user.loading) return;
    // `load` is async and every setState in it runs after an `await`, so
    // nothing here is synchronous with the effect body — the rule cannot see
    // through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const onUpdated = () => { void load(); };
    window.addEventListener("nzamy-workflow-updated", onUpdated);
    return () => window.removeEventListener("nzamy-workflow-updated", onUpdated);
  }, [load, user.loading]);

  const view = listViewState(loading, read);
  // itemsOf() is [] on every branch but 'ready', which is exactly what the
  // filter and the counts below are entitled to see.
  const requests = itemsOf(read);

  const filtered = requests.filter(r => {
    if (!matchesFilter(r.status, filter)) return false;
    if (search && !r.title.includes(search) && !r.description?.includes(search)) return false;
    return true;
  });

  // Every count comes from the same predicate the list uses, so a chip can no
  // longer promise rows the chip does not show.
  // True only when the list on screen is the list the server actually holds.
  // While loading we have nothing; after a failure we have nothing we can
  // stand behind. Either way the chips show a label and no number.
  const countsKnown = view === "ready" || view === "empty";

  const FILTERS: { key: FilterKey; label: string; count: number }[] = (
    [
      { key: "all",       label: "الكل" },
      { key: "pending",   label: "معلقة" },
      { key: "active",    label: "جارية" },
      { key: "completed", label: "مكتملة" },
      { key: "cancelled", label: "ملغية" },
    ] as const
  ).map(({ key, label }) => ({
    key,
    label,
    count: requests.filter(r => matchesFilter(r.status, key)).length,
  }));

  /**
   * Arabic for a cancel that did not go through.
   *
   * `updateWorkflowRequestById` throws on every non-ok response
   * (WorkflowApiError) and the route's own `error` strings are a mix of Arabic
   * and English, so the server text is never echoed — the status code picks
   * the copy instead. 403 is the branch that matters: the PATCH route refuses
   * a status transition it does not permit, and from this page the caller is
   * always the requester asking for "cancelled", so the only refusal that can
   * reach a client here is "not cancellable from where this order is now".
   */
  function cancelErrorAr(err: unknown): string {
    if (err instanceof WorkflowApiError) {
      if (err.status === 403) return "لا يمكن إلغاء هذا الطلب في وضعه الحالي.";
      if (err.status === 401) return "انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.";
      if (err.status === 404) return "لم يعد هذا الطلب موجوداً.";
    }
    return "تعذّر إلغاء الطلب. تحقّق من اتصالك بالإنترنت ثم حاول مجدداً.";
  }

  const handleCancel = async (id: string) => {
    setCancelError(null);
    setCancellingId(id);
    try {
      const updated = await updateWorkflowRequestById(
        id,
        { status: "cancelled" },
        "cancelled_by_client",
        user.name || user.userId || "client",
      );
      // The local/demo path returns null instead of throwing when the id is
      // not in localStorage. That is still a cancel that did not happen, so it
      // must not look like one that did.
      if (!updated) setCancelError("تعذّر إلغاء الطلب. لم يتم العثور عليه.");
    } catch (err) {
      console.error("[client requests] cancel failed:", err);
      setCancelError(cancelErrorAr(err));
    } finally {
      setCancellingId(null);
      // Refresh either way: on success to show «ملغي», on refusal to show the
      // status the order is actually in.
      await load();
    }
  };

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">طلباتي</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            متابعة جميع طلباتك وخدماتك القانونية
          </p>
        </div>
        <Link href="/dashboard/client/services">
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition-colors shadow-sm"
          >
            <Plus size={16} weight="bold" />
            طلب جديد
          </motion.button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <MagnifyingGlass size={15} className="absolute top-1/2 -translate-y-1/2 right-3.5 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث في طلباتك..."
          className="w-full rounded-xl bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/8 text-sm pr-10 pl-4 py-2.5 outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 text-gray-900 dark:text-white placeholder:text-gray-400"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              filter === f.key
                ? "bg-[#0B3D2E] text-white border-transparent"
                : "border-gray-200 dark:border-white/8 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
            }`}
          >
            {f.label}
            {/* The count is withheld until the list has actually been read.
                Before this, a failed load painted «الكل ٠ · معلقة ٠ · جارية ٠»
                directly under «تعذّر تحميل طلباتك» — a figure asserted on the
                same screen that admits its source could not be read, which is
                exactly the class of defect this page's own «لا يمكننا تأكيد»
                copy exists to avoid. Withheld, not zeroed: «٠» is a claim.
                Arabic-Indic, like every other number in this Arabic UI. */}
            {countsKnown && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                filter === f.key ? "bg-white/20" : "bg-gray-100 dark:bg-white/8 text-gray-500"
              }`}>{f.count.toLocaleString("ar-SA")}</span>
            )}
          </button>
        ))}
      </div>

      {/* A cancel that did not go through. Before this, updateWorkflowRequestById
          was awaited with no try/catch and apiRequest throws on every non-ok
          response — so a 403 or a dropped connection left the button looking
          like it had worked. */}
      {cancelError && (
        <div
          role="alert"
          className="flex items-start gap-2 mb-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/15 px-4 py-3 text-xs font-bold text-red-700 dark:text-red-300"
        >
          <Warning size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{cancelError}</span>
          <button
            onClick={() => setCancelError(null)}
            aria-label="إخفاء التنبيه"
            className="flex-shrink-0 p-0.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      )}

      {/* The list could not be loaded. Says so instead of showing an empty page.

          «قد تكون هذه القائمة غير مكتملة» is gone: it was written when a
          degraded page could still carry localStorage rows, and
          listClientWorkflowRequestsPage now returns none in that case, so there
          is no partial list under the banner to warn about. The retry refetches
          in place instead of asking the client to reload the page. */}
      {view === "unreadable" && (
        <div
          role="alert"
          className="flex items-start gap-2 mb-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15 px-4 py-3 text-xs font-bold text-amber-800 dark:text-amber-300"
        >
          <Warning size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">تعذّرت قراءة طلباتك من الخادم.</span>
          <button
            onClick={retry}
            className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-700/50 px-2.5 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30"
          >
            <ArrowClockwise size={12} weight="bold" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* The stated cap. The server holds more requests than this page asked
          for, so it says so rather than dropping the oldest in silence. */}
      {truncatedAt !== null && (
        <div className="flex items-start gap-2 mb-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] px-4 py-3 text-xs font-bold text-gray-600 dark:text-gray-300">
          <Info size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
          <span>
            يتم عرض أحدث {truncatedAt.toLocaleString("ar-SA")} طلب فقط. توجد طلبات أقدم لم يتم تحميلها في هذه القائمة.
          </span>
        </div>
      )}

      {/* List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-16">
              <Storefront size={48} className="mx-auto mb-3 text-gray-200 dark:text-white/10" weight="duotone" />
              <p className="text-sm font-semibold text-gray-400">
                {/* Never claim "no requests yet" over a failed load, and never
                    claim it before the first load has come back at all. The
                    four arms are the four `listViewState` answers, in the same
                    order the union declares them. */}
                {view === "loading"
                  ? "جارٍ تحميل طلباتك…"
                  : view === "unreadable"
                    ? "تعذّرت قراءة الطلبات"
                    : view === "empty" ? "لا توجد طلبات بعد" : "لا توجد طلبات في هذا الفلتر"}
              </p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1 mb-4">
                {view === "loading"
                  ? ""
                  : view === "unreadable"
                    ? "لا يعني هذا أنه لا توجد لديك طلبات — استخدم «إعادة المحاولة» أعلاه."
                    : view === "empty" ? "اطلب خدمة قانونية وستظهر هنا فور الإرسال" : "جرّب فلتراً آخر"}
              </p>
              {view === "empty" && (
                <Link href="/dashboard/client/services">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    className="text-sm font-bold text-[#0B3D2E] dark:text-emerald-400 hover:underline flex items-center gap-1 mx-auto"
                  >
                    <Plus size={14} /> اطلب خدمة جديدة
                  </motion.button>
                </Link>
              )}
            </motion.div>
          ) : (
            filtered.map(r => (
              <RequestCard
                key={r.id}
                req={r}
                onCancel={handleCancel}
                onSelect={setSelectedRequest}
                cancelling={cancellingId === r.id}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      <RequestDetailModal
        req={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onCancel={handleCancel}
      />
    </div>
  );
}
