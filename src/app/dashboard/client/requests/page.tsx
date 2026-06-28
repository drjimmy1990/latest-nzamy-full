"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ChatCircle, FileText, Gavel, ShieldStar,
  Clock, CheckCircle, XCircle, HourglassSimple,
  ArrowLeft, Plus, MagnifyingGlass, Storefront,
  Users, CalendarCheck, X, Copy, Check, DownloadSimple,
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { listClientWorkflowRequests, updateWorkflowRequestById } from "@/lib/clientWorkflowRepository";
import type { WorkflowRequest, WorkflowRequestStatus } from "@/lib/workflowStore";

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

const TYPE_CFG: Record<WorkflowRequest["type"], { label: string; icon: React.ElementType; color: string }> = {
  service:         { label: "خدمة",       icon: ShieldStar,    color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400" },
  consultation:    { label: "استشارة",    icon: ChatCircle,    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" },
  business_case:   { label: "قضية",       icon: Gavel,         color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400" },
  ngo_volunteer:   { label: "متطوع",      icon: Users,         color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400" },
  ai_draft:        { label: "مسودة AI",   icon: FileText,      color: "text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400" },
};

type FilterKey = "all" | WorkflowRequestStatus;

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
}: {
  req: WorkflowRequest;
  onCancel: (id: string) => void;
  onSelect: (req: WorkflowRequest) => void;
}) {
  const status = STATUS_CFG[req.status];
  const type   = TYPE_CFG[req.type];
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
          {req.auditTrail.length > 0 && (
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
                className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors mr-auto font-bold border border-red-100 dark:border-red-900/30 px-3 py-1 rounded-xl bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                إلغاء الطلب
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

  const status = STATUS_CFG[req.status];
  const type = TYPE_CFG[req.type];
  const CatIcon = type.icon;

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
      element.download = `${req.title}-${req.id}.txt`;
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
                  {req.receiver === "ai_workspace" ? "نظامي عالمي (مساعد AI)" : "المنصة القانونية"}
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
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1.5">
                <FileText size={16} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
                {req.type === "ai_draft" ? "معاينة مسودة العقد" : "تفاصيل ووصف الطلب"}
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

            {/* Audit Trail Timeline */}
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-1.5">
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
  const [requests, setRequests] = useState<WorkflowRequest[]>([]);
  const [filter, setFilter]     = useState<FilterKey>("all");
  const [search, setSearch]     = useState("");
  const [selectedRequest, setSelectedRequest] = useState<WorkflowRequest | null>(null);

  // Load from store + listen for updates
  useEffect(() => {
    const load = () => {
      listClientWorkflowRequests({ requesterUserId: user.userId }).then(setRequests).catch(() => setRequests([]));
    };
    load();
    window.addEventListener("nzamy-workflow-updated", load);
    return () => window.removeEventListener("nzamy-workflow-updated", load);
  }, [user.userId]);

  const filtered = requests.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search && !r.title.includes(search) && !r.description?.includes(search)) return false;
    return true;
  });

  const counts = {
    all: requests.length,
    pending_assignment: requests.filter(r => r.status === "pending_assignment" || r.status === "pending_payment").length,
    in_review:  requests.filter(r => r.status === "in_review" || r.status === "assigned").length,
    completed:  requests.filter(r => r.status === "completed").length,
    cancelled:  requests.filter(r => r.status === "cancelled").length,
  };

  const FILTERS: { key: FilterKey; label: string; count: number }[] = [
    { key: "all",               label: "الكل",       count: counts.all },
    { key: "pending_assignment", label: "معلقة",     count: counts.pending_assignment },
    { key: "in_review",         label: "جارية",      count: counts.in_review },
    { key: "completed",         label: "مكتملة",     count: counts.completed },
    { key: "cancelled",         label: "ملغية",      count: counts.cancelled },
  ];

  const handleCancel = async (id: string) => {
    await updateWorkflowRequestById(id, { status: "cancelled" }, "cancelled_by_client", user.name || user.userId || "client");
    setRequests(await listClientWorkflowRequests({ requesterUserId: user.userId }));
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
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              filter === f.key ? "bg-white/20" : "bg-gray-100 dark:bg-white/8 text-gray-500"
            }`}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-16">
              <Storefront size={48} className="mx-auto mb-3 text-gray-200 dark:text-white/10" weight="duotone" />
              <p className="text-sm font-semibold text-gray-400">
                {requests.length === 0 ? "لا توجد طلبات بعد" : "لا توجد طلبات في هذا الفلتر"}
              </p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1 mb-4">
                {requests.length === 0 ? "اطلب خدمة قانونية وستظهر هنا فور الإرسال" : "جرّب فلتراً آخر"}
              </p>
              {requests.length === 0 && (
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
