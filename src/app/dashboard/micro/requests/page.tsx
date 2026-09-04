"use client";

/**
 * /dashboard/micro/requests — «طلباتي» for the SME (micro) account.
 * ─────────────────────────────────────────────────────────
 * Previously a fixed `REQUESTS` array — three invented rows, identical for
 * every micro account that opened the page, that never once reflected a
 * request this account actually placed.
 *
 * Now reads the same source «طلباتي» reads for an individual client:
 * `listClientWorkflowRequestsPage` → GET /api/v1/service-requests, which is
 * RLS-scoped by the caller's own session (a micro account sees only its own
 * rows; `assertRole()` on that route carries no role allowlist, so `micro`
 * is not refused anything an `individual` caller is not). The requester
 * filter inside `listClientWorkflowRequestsPage` is applied client-side on
 * top of that using `user.userId` from `useUser()`, exactly as the client
 * page does.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Plus, ListChecks, Gavel, FileText, Headset, MagnifyingGlass,
  Clock, Warning, ArrowLeft, X, Copy, Check,
  SealCheck, ArrowClockwise, WarningCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { listClientWorkflowRequestsPage } from "@/lib/clientWorkflowRepository";
import type { WorkflowRequest, WorkflowRequestStatus } from "@/lib/workflowStore";
import { listOk, listFailed, listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { orderReference } from "@/lib/services/orderReference";
import { toArabicDigits } from "@/lib/services/arabicCount";

// ─── New-request catalogue (real destinations, not order data) ────────────────

const SERVICE_TYPES = [
  { id: "consult", label: "استشارة قانونية", desc: "رأي متخصص في مسألتك", icon: Headset, price: "من ٢٠٠ ر.س", href: "/ai/consult" },
  { id: "contract", label: "صياغة أو مراجعة عقد", desc: "عقد مخصص لنشاطك", icon: FileText, price: "من ٢٥٠ ر.س", href: "/ai/corp/contracts" },
  { id: "case", label: "تمثيل قانوني", desc: "محامٍ يمثلك رسمياً", icon: Gavel, price: "حسب القضية", href: "/dashboard/micro/find-lawyer" },
  { id: "notice", label: "إشعار قانوني", desc: "إشعار رسمي لطرف ثالث", icon: Warning, price: "من ١٥٠ ر.س", href: "/ai/consult" },
];

// ─── Status / type vocabulary ──────────────────────────────────────────────────
// Same values `service_requests_type_check` and the status column allow —
// see clientWorkflowRepository.ts / workflowStore.ts, the same source
// «طلباتي» (client) reads.

type FilterKey = "all" | "pending" | "active" | "completed" | "cancelled";

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
  return filter === "all" || STATUS_GROUP[status] === filter;
}

const STATUS_STYLE: Record<WorkflowRequestStatus, { label: string; bg: string; text: string; border: string }> = {
  draft:              { label: "مسودة",            bg: "bg-zinc-100 dark:bg-zinc-800",       text: "text-zinc-500 dark:text-zinc-400",     border: "border-zinc-200 dark:border-zinc-700" },
  pending_payment:    { label: "بانتظار الدفع",     bg: "bg-amber-50 dark:bg-amber-900/20",   text: "text-amber-600 dark:text-amber-400",   border: "border-amber-200 dark:border-amber-700/30" },
  pending_assignment: { label: "بانتظار التعيين",   bg: "bg-amber-50 dark:bg-amber-900/20",   text: "text-amber-600 dark:text-amber-400",   border: "border-amber-200 dark:border-amber-700/30" },
  assigned:           { label: "مُعيَّن",            bg: "bg-blue-50 dark:bg-blue-900/20",     text: "text-blue-600 dark:text-blue-400",     border: "border-blue-200 dark:border-blue-700/30" },
  in_review:          { label: "جارٍ التنفيذ",      bg: "bg-blue-50 dark:bg-blue-900/20",     text: "text-blue-600 dark:text-blue-400",     border: "border-blue-200 dark:border-blue-700/30" },
  completed:          { label: "مكتمل",             bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700/30" },
  cancelled:          { label: "ملغي",              bg: "bg-red-50 dark:bg-red-900/20",       text: "text-red-500 dark:text-red-400",       border: "border-red-200 dark:border-red-700/30" },
};

const TYPE_LABEL: Record<WorkflowRequest["type"], string> = {
  service:          "خدمة",
  consultation:     "استشارة",
  business_case:    "قضية",
  ngo_volunteer:    "متطوع",
  ai_draft:         "صياغة مذكرة",
  ai_contracts:     "عقود",
  ai_wargaming:     "محاكاة",
  ai_legal_opinion: "رأي قانوني",
};

function typeLabel(type: WorkflowRequest["type"]): string {
  return TYPE_LABEL[type] ?? "طلب";
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "الكل" },
  { key: "pending",   label: "بانتظار" },
  { key: "active",    label: "جارية" },
  { key: "completed", label: "مكتملة" },
  { key: "cancelled", label: "ملغاة" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MicroRequestsPage() {
  const { isDark } = useTheme();
  const user = useUser();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WorkflowRequest | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  const [read, setRead] = useState<ListRead<WorkflowRequest> | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const page = await listClientWorkflowRequestsPage({ requesterUserId: user.userId });
      if (seq !== loadSeq.current) return;
      setRead(page.degraded ? listFailed<WorkflowRequest>() : listOk(page.requests));
    } catch (err) {
      console.error("[micro requests] load failed:", err);
      if (seq !== loadSeq.current) return;
      setRead(listFailed<WorkflowRequest>());
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [user.userId]);

  useEffect(() => {
    // Wait for useUser() to resolve — firing before it does sends no
    // requesterUserId, which listClientWorkflowRequestsPage correctly refuses
    // every server row for (see its own comment). See client/requests/page.tsx
    // for the identical reasoning.
    if (user.loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const onUpdated = () => { void load(); };
    window.addEventListener("nzamy-workflow-updated", onUpdated);
    return () => window.removeEventListener("nzamy-workflow-updated", onUpdated);
  }, [load, user.loading]);

  const view = listViewState(loading, read);
  const requests = itemsOf(read);

  const filtered = requests.filter(r =>
    matchesFilter(r.status, filter) &&
    (!search || r.title.includes(search))
  );

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const counts: Record<FilterKey, number> = {
    all: requests.length,
    pending: requests.filter(r => STATUS_GROUP[r.status] === "pending").length,
    active: requests.filter(r => STATUS_GROUP[r.status] === "active").length,
    completed: requests.filter(r => STATUS_GROUP[r.status] === "completed").length,
    cancelled: requests.filter(r => STATUS_GROUP[r.status] === "cancelled").length,
  };
  const countsKnown = view === "ready" || view === "empty";

  return (
    <div className={`p-5 md:p-8 max-w-[900px] mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className={`text-[22px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>طلباتي</h1>
          <p className={`text-[13px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            متابعة جميع طلباتك وخدماتك القانونية
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#0B3D2E] text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-md cursor-pointer"
        >
          <Plus size={16} weight="bold" /> طلب جديد
        </motion.button>
      </motion.div>

      {/* Search + Filters */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1} className="space-y-3">
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-200"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث في طلباتك..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                filter === f.key
                  ? "bg-[#0B3D2E] text-white"
                  : isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {f.label}
              {countsKnown && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filter === f.key ? "bg-white/20 text-white" : isDark ? "bg-zinc-700 text-zinc-400" : "bg-zinc-200 text-zinc-600"}`}>
                  {toArabicDigits(counts[f.key])}
                </span>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Requests List */}
      {view === "loading" ? (
        <div className={`${card} p-10 flex items-center justify-center gap-2 text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          <div className="w-4 h-4 border-2 border-[#C8A762]/30 border-t-[#C8A762] rounded-full animate-spin" />
          جارٍ تحميل طلباتك...
        </div>
      ) : view === "unreadable" ? (
        <div className={`flex items-start gap-3 p-5 rounded-2xl border ${isDark ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-800"}`}>
          <WarningCircle size={20} weight="fill" className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold">تعذّر تحميل طلباتك</p>
            <p className="text-xs mt-1 opacity-80">
              لم تصل قائمة طلباتك من الخادم. هذه ليست قائمة فارغة — قد تكون لديك طلبات لم تُقرأ.
            </p>
            <button
              type="button"
              onClick={() => { setLoading(true); setRead(null); void load(); }}
              className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                isDark ? "border-red-500/40 hover:bg-red-500/10" : "border-red-300 hover:bg-red-100"
              }`}
            >
              <ArrowClockwise size={13} weight="bold" />
              إعادة المحاولة
            </button>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`${card} p-12 text-center`}
            >
              <ListChecks size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
              <p className={`font-bold text-[15px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {requests.length === 0 ? "لا توجد طلبات" : "لا توجد طلبات مطابقة"}
              </p>
              <p className={`text-[13px] mt-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                {requests.length === 0 ? 'اضغط "طلب جديد" للبدء' : "جرّب تعديل البحث أو الفلتر"}
              </p>
            </motion.div>
          ) : (
            <motion.div key="list" className="space-y-3">
              {filtered.map((req, i) => {
                const status = STATUS_STYLE[req.status];
                return (
                  <motion.div key={req.id} variants={fadeUp} initial="hidden" animate="show" custom={i}
                    className={`${card} p-5 cursor-pointer hover:border-royal/30 transition-all`}
                    onClick={() => setSelected(req)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
                            {status.label}
                          </span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                            {typeLabel(req.type)}
                          </span>
                        </div>
                        <p className={`text-[15px] font-bold leading-snug ${isDark ? "text-white" : "text-zinc-800"}`}>{req.title}</p>
                        <div className={`flex items-center gap-3 mt-2 text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                          <span className="flex items-center gap-1"><Clock size={11} /> {fmtDate(req.createdAt)}</span>
                          <span className="font-mono text-[10px]" dir="ltr" title={req.id}>
                            {orderReference(req.id) || req.id}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {req.payment.amount > 0 && (
                          <span className={`text-[14px] font-bold ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                            {toArabicDigits(req.payment.amount.toLocaleString("en-US"))} ر.س
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] font-bold text-royal border border-royal/20 bg-royal/5 px-2.5 py-1 rounded-lg">
                          عرض التفاصيل <ArrowLeft size={10} />
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Request Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => { setSelected(null); setCopiedRef(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white"}`}
            >
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
                <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>تفاصيل الطلب</h2>
                <button onClick={() => { setSelected(null); setCopiedRef(false); }}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}>
                  <X size={15} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-400" dir="ltr" title={selected.id}>
                      {orderReference(selected.id) || selected.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(orderReference(selected.id) || selected.id);
                        setCopiedRef(true);
                        setTimeout(() => setCopiedRef(false), 2000);
                      }}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    >
                      {copiedRef ? <Check size={11} weight="bold" className="text-emerald-500" /> : <Copy size={11} weight="bold" />}
                    </button>
                  </div>
                  <h3 className={`text-[16px] font-bold mt-0.5 ${isDark ? "text-white" : "text-zinc-800"}`}>{selected.title}</h3>
                </div>
                {selected.description && (
                  <p className={`text-[13px] leading-relaxed p-3 rounded-xl ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-50 text-zinc-600"}`}>
                    {selected.description}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "النوع", val: typeLabel(selected.type) },
                    { label: "الحالة", val: STATUS_STYLE[selected.status].label },
                    { label: "تاريخ الطلب", val: fmtDate(selected.createdAt) },
                    { label: "الرسوم", val: selected.payment.amount > 0 ? `${toArabicDigits(selected.payment.amount.toLocaleString("en-US"))} ر.س` : "بدون رسوم" },
                  ].map(item => (
                    <div key={item.label} className={`p-3 rounded-xl ${isDark ? "bg-zinc-800" : "bg-zinc-50"}`}>
                      <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{item.label}</p>
                      <p className={`text-[13px] font-bold mt-0.5 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{item.val}</p>
                    </div>
                  ))}
                </div>
                {(selected.auditTrail?.length ?? 0) > 0 && (
                  <div className={`flex items-center gap-1.5 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    <SealCheck size={12} />
                    <span>آخر تحديث: {selected.auditTrail[0].event} — {fmtDate(selected.auditTrail[0].at)}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Request Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white"}`}
            >
              {/* Modal Header */}
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
                <div>
                  <h2 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>طلب خدمة قانونية</h2>
                  <p className={`text-[12px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>اختر نوع الخدمة التي تحتاجها</p>
                </div>
                <button onClick={() => setShowModal(false)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer ${isDark ? "hover:bg-white/10 text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"}`}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Service Types Grid */}
              <div className="p-5 grid grid-cols-2 gap-3">
                {SERVICE_TYPES.map(svc => {
                  const Icon = svc.icon;
                  return (
                    <Link key={svc.id} href={svc.href} onClick={() => setShowModal(false)}>
                      <motion.div whileHover={{ y: -2, scale: 1.02 }} whileTap={{ scale: 0.97 }}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                          isDark
                            ? "bg-zinc-800 border-white/[0.07] hover:border-royal/30"
                            : "bg-zinc-50 border-zinc-100 hover:border-royal/30 hover:bg-royal/5"
                        }`}
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center mb-3">
                          <Icon size={18} weight="duotone" className="text-[#0B3D2E]" />
                        </div>
                        <p className={`text-[13px] font-bold mb-0.5 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{svc.label}</p>
                        <p className={`text-[11px] mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{svc.desc}</p>
                        <span className="text-[10px] font-bold text-[#C8A762]">{svc.price}</span>
                      </motion.div>
                    </Link>
                  );
                })}
              </div>

              {/* Footer */}
              <div className={`px-6 py-3 border-t text-center ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
                <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                  جميع الخدمات مضمونة — دفع بعد الرضا
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
