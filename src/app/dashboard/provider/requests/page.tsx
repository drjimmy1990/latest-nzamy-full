"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Gavel, Star, Clock, CheckCircle, X,
  Phone, VideoCamera, ChatText, Warning, User,
  Buildings, FileText, Coins, Package, MagnifyingGlass,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { readWorkflowRequestsByReceiver, updateWorkflowRequest, type WorkflowRequest } from "@/lib/workflowStore";

// ─── Types ────────────────────────────────────────────────────────────────────
type Request = {
  id: string;
  nameAr: string;
  typeAr: string;
  consultType: "audio" | "video" | "text";
  urgency: "urgent" | "normal";
  budget: number;
  descAr: string;
  time: string;
  clientType: "individual" | "company";
  workflowId?: string;
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const REQUESTS: Request[] = [
  {
    id: "REQ-0831",
    nameAr: "عبدالله الدوسري",
    typeAr: "قانون العمل",
    consultType: "audio",
    urgency: "urgent",
    budget: 299,
    descAr: "نزاع مع صاحب العمل حول الفصل التعسفي بعد 6 سنوات خدمة — أحتاج رأياً قانونياً سريعاً وتحديداً للتعويض المستحق.",
    time: "منذ ١٢ د",
    clientType: "individual",
  },
  {
    id: "REQ-0847",
    nameAr: "شركة رمال الذهبية للتجارة",
    typeAr: "قانون الشركات",
    consultType: "video",
    urgency: "normal",
    budget: 599,
    descAr: "مراجعة اتفاقية المساهمين قبل اجتماع الجمعية العمومية — التحقق من البنود المتعلقة بحق الشفعة وتوزيع الأرباح.",
    time: "منذ ٤٥ د",
    clientType: "company",
  },
  {
    id: "REQ-0852",
    nameAr: "فاطمة العنزي",
    typeAr: "أحوال شخصية",
    consultType: "text",
    urgency: "normal",
    budget: 149,
    descAr: "استشارة حول إجراءات الحضانة وشروط النفقة المقررة نظاماً.",
    time: "منذ ١ س",
    clientType: "individual",
  },
];

const CONSULT_TYPE = {
  audio: { icon: Phone,       label: "صوتية",  color: "text-blue-500",  bg: "bg-blue-100 dark:bg-blue-900/20" },
  video: { icon: VideoCamera, label: "فيديو",  color: "text-violet-500", bg: "bg-violet-100 dark:bg-violet-900/20" },
  text:  { icon: ChatText,    label: "نصية",   color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/20" },
};

function workflowToProviderRequest(request: WorkflowRequest): Request {
  const requestedType = String(request.metadata?.requestedType ?? request.metadata?.serviceId ?? "خدمة قانونية");
  return {
    id: request.id,
    workflowId: request.id,
    nameAr: request.requester.name || "عميل نظامي",
    typeAr: request.title || requestedType,
    consultType: "text",
    urgency: request.payment.amount >= 600 ? "urgent" : "normal",
    budget: request.payment.amount,
    descAr: request.description,
    time: "وصل الآن",
    clientType: request.requester.role === "corporate" || request.requester.role === "micro" ? "company" : "individual",
  };
}

// ─── Request Card ─────────────────────────────────────────────────────────────
function RequestCard({
  req, isDark, onAccept, onReject,
}: {
  req: Request; isDark: boolean;
  onAccept: () => void; onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Ct = CONSULT_TYPE[req.consultType];
  const CtIcon = Ct.icon;
  const ClientIcon = req.clientType === "company" ? Buildings : User;

  const card = isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200";
  const urgent = req.urgency === "urgent";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className={`rounded-2xl border p-5 ${card} ${urgent ? (isDark ? "border-red-500/30" : "border-red-200") : ""}`}
    >
      {/* Urgent Banner */}
      {urgent && (
        <div className={`flex items-center gap-1.5 text-[11px] font-bold mb-3 px-2 py-1 rounded-lg w-fit ${isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-600"}`}>
          <Warning size={11} weight="fill" /> طلب عاجل
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
          <ClientIcon size={20} weight="duotone" className="text-[#0B3D2E]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-bold truncate ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{req.nameAr}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{req.typeAr}</span>
            <span className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md ${Ct.bg} ${Ct.color}`}>
              <CtIcon size={11} />{Ct.label}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`flex items-center gap-1 text-[13px] font-black text-[#0B3D2E] dark:text-emerald-400`}>
            <Coins size={13} />{req.budget} ر.س
          </span>
          <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            <Clock size={10} className="inline me-0.5" />{req.time}
          </span>
        </div>
      </div>

      {/* Description */}
      <p
        className={`text-[12px] leading-relaxed mb-1 ${isDark ? "text-zinc-400" : "text-zinc-500"} ${!expanded ? "line-clamp-2" : ""}`}
      >
        {req.descAr}
      </p>
      {req.descAr.length > 80 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-[#0B3D2E] dark:text-emerald-400 hover:underline mb-3"
        >
          {expanded ? "إخفاء" : "قراءة المزيد"}
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] hover:bg-[#1a5c44] py-2.5 text-[12px] font-bold text-white transition-colors"
        >
          <CheckCircle size={14} weight="fill" /> قبول الطلب
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={onReject}
          className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-medium transition-all ${isDark ? "border-white/[0.08] text-zinc-400 hover:border-red-800/50 hover:text-red-400" : "border-zinc-200 text-zinc-500 hover:border-red-200 hover:text-red-500"}`}
        >
          <X size={14} weight="bold" /> رفض
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function ProviderRequestsPageInner() {
  const { isDark } = useTheme();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as "pending" | "active" | "done") ?? "pending";
  const [requests, setRequests] = useState(REQUESTS);
  const [activeTab, setActiveTab] = useState<"pending" | "active" | "done">(initialTab);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = searchParams.get("tab") as "pending" | "active" | "done" | null;
    if (t && ["pending","active","done"].includes(t)) setActiveTab(t);
  }, [searchParams]);

  useEffect(() => {
    const syncRequests = () => {
      const workflowRequests = readWorkflowRequestsByReceiver("provider")
        .filter(request => request.status === "pending_assignment" || request.status === "pending_payment")
        .map(workflowToProviderRequest);
      setRequests([...workflowRequests, ...REQUESTS]);
    };

    syncRequests();
    window.addEventListener("nzamy-workflow-updated", syncRequests);
    return () => window.removeEventListener("nzamy-workflow-updated", syncRequests);
  }, []);

  const handleAccept = (id: string) => {
    updateWorkflowRequest(id, { status: "assigned" }, "provider_request_accepted", "provider-demo");
    setRequests((r) => r.filter((x) => x.id !== id));
  };
  const handleReject = (id: string) => {
    updateWorkflowRequest(id, { status: "cancelled" }, "provider_request_rejected", "provider-demo");
    setRequests((r) => r.filter((x) => x.id !== id));
  };

  const filtered = requests.filter(r =>
    search === "" || r.nameAr.includes(search) || r.typeAr.includes(search)
  );

  const tabs = [
    { id: "pending", label: `قيد الانتظار (${requests.length})` },
    { id: "active",  label: "جارية (٢)" },
    { id: "done",    label: "منتهية (٤٣)" },
  ] as const;

  return (
    <div dir="rtl" className={`min-h-screen ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-slate-50 text-zinc-900"}`}>

      {/* Sticky Header */}
      <div className={`border-b sticky top-0 z-30 ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200"}`}>
        <div className="max-w-3xl mx-auto px-5 py-4">
          <Link
            href="/dashboard/provider"
            className={`mb-2 flex items-center gap-1.5 text-xs transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}
          >
            <ArrowRight size={13} /> لوحة التحكم
          </Link>
          <div className="flex items-center justify-between">
            <h1 className={`text-lg font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>الطلبات الواردة</h1>
            <div className={`flex items-center gap-2 text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              متاح الآن
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-3xl mx-auto px-5">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id
                    ? "border-[#0B3D2E] text-[#0B3D2E] dark:border-emerald-400 dark:text-emerald-400"
                    : `border-transparent ${isDark ? "text-zinc-500" : "text-zinc-400"}`
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 py-6">

        {/* Search */}
        {activeTab === "pending" && (
          <div className={`flex items-center gap-2 rounded-xl border px-3 mb-5 ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200"}`}>
            <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث في الطلبات..."
              className={`flex-1 py-2.5 text-sm bg-transparent outline-none ${isDark ? "text-zinc-200 placeholder-zinc-600" : "text-zinc-800 placeholder-zinc-400"}`}
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === "pending" && (
            <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border ${isDark ? "border-white/[0.08] bg-zinc-800" : "border-zinc-200 bg-white"}`}>
                    <Gavel size={26} weight="duotone" className={isDark ? "text-zinc-600" : "text-zinc-400"} />
                  </div>
                  <h3 className={`text-base font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                    {requests.length === 0 ? "لا توجد طلبات معلّقة" : "لا توجد نتائج"}
                  </h3>
                  <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    {requests.length === 0 ? "ستظهر الطلبات الجديدة هنا فور وصولها" : "جرّب تغيير كلمة البحث"}
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  {filtered.map((req) => (
                    <RequestCard
                      key={req.id}
                      req={req}
                      isDark={isDark}
                      onAccept={() => handleAccept(req.id)}
                      onReject={() => handleReject(req.id)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </motion.div>
          )}

          {activeTab !== "pending" && (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border ${isDark ? "border-white/[0.08] bg-zinc-800" : "border-zinc-200 bg-white"}`}>
                <Package size={26} weight="duotone" className={isDark ? "text-zinc-600" : "text-zinc-400"} />
              </div>
              <h3 className={`text-base font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                {activeTab === "active" ? "الطلبات الجارية" : "الطلبات المنتهية"}
              </h3>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                سيتم عرض البيانات هنا عند الربط بقاعدة البيانات
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function ProviderRequestsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center opacity-40 text-sm">جارٍ التحميل...</div>}>
      <ProviderRequestsPageInner />
    </Suspense>
  );
}
