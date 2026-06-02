"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Plus, ListChecks, Gavel, FileText, Headset, MagnifyingGlass,
  Clock, CheckCircle, Warning, ArrowLeft, X, Buildings,
  SealCheck, FunnelSimple, ChatDots,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const REQUESTS = [
  {
    id: "R-001",
    title: "استشارة في نظام العمل — عقد موظف جديد",
    type: "استشارة" as const,
    typeIcon: "chat",
    status: "inprogress" as const,
    statusLabel: "جارٍ التنفيذ",
    statusColor: "blue",
    date: "٢٠ أبريل ٢٠٢٦",
    price: 250,
    lawyer: "نورة الزهراني",
  },
  {
    id: "R-002",
    title: "مراجعة عقد إيجار محل تجاري",
    type: "عقد" as const,
    typeIcon: "file",
    status: "done" as const,
    statusLabel: "مكتمل",
    statusColor: "green",
    date: "١٠ أبريل ٢٠٢٦",
    price: 300,
    lawyer: "خالد الحربي",
  },
  {
    id: "R-003",
    title: "إشعار قانوني لعميل متأخر في السداد",
    type: "خدمة" as const,
    typeIcon: "warning",
    status: "pending" as const,
    statusLabel: "بانتظار المعالجة",
    statusColor: "amber",
    date: "٢٢ أبريل ٢٠٢٦",
    price: 150,
    lawyer: null,
  },
];

const SERVICE_TYPES = [
  { id: "consult", label: "استشارة قانونية", desc: "رأي متخصص في مسألتك", icon: Headset, price: "من ٢٠٠ ر.س", href: "/ai/consult" },
  { id: "contract", label: "صياغة أو مراجعة عقد", desc: "عقد مخصص لنشاطك", icon: FileText, price: "من ٢٥٠ ر.س", href: "/ai/corp/contracts" },
  { id: "case", label: "تمثيل قانوني", desc: "محامٍ يمثلك رسمياً", icon: Gavel, price: "حسب القضية", href: "/dashboard/micro/find-lawyer" },
  { id: "notice", label: "إشعار قانوني", desc: "إشعار رسمي لطرف ثالث", icon: Warning, price: "من ١٥٠ ر.س", href: "/ai/consult" },
];

type FilterKey = "all" | "inprogress" | "done" | "pending";
const FILTERS: { key: FilterKey; label: string; count: number }[] = [
  { key: "all", label: "الكل", count: REQUESTS.length },
  { key: "inprogress", label: "جارية", count: REQUESTS.filter(r => r.status === "inprogress").length },
  { key: "pending", label: "بانتظار", count: REQUESTS.filter(r => r.status === "pending").length },
  { key: "done", label: "مكتملة", count: REQUESTS.filter(r => r.status === "done").length },
];

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  blue:  { bg: "bg-blue-50 dark:bg-blue-900/20",    text: "text-blue-600 dark:text-blue-400",    border: "border-blue-200 dark:border-blue-700/30" },
  green: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700/30" },
  amber: { bg: "bg-amber-50 dark:bg-amber-900/20",   text: "text-amber-600 dark:text-amber-400",   border: "border-amber-200 dark:border-amber-700/30" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MicroRequestsPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const filtered = REQUESTS.filter(r =>
    (filter === "all" || r.status === filter) &&
    r.title.includes(search)
  );

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
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filter === f.key ? "bg-white/20 text-white" : isDark ? "bg-zinc-700 text-zinc-400" : "bg-zinc-200 text-zinc-600"}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Requests List */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`${card} p-12 text-center`}
          >
            <ListChecks size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
            <p className={`font-bold text-[15px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد طلبات</p>
            <p className={`text-[13px] mt-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>اضغط "طلب جديد" للبدء</p>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-3">
            {filtered.map((req, i) => {
              const sc = STATUS_STYLE[req.statusColor];
              return (
                <motion.div key={req.id} variants={fadeUp} initial="hidden" animate="show" custom={i}
                  className={`${card} p-5`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                          {req.statusLabel}
                        </span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                          {req.type}
                        </span>
                      </div>
                      <p className={`text-[15px] font-bold leading-snug ${isDark ? "text-white" : "text-zinc-800"}`}>{req.title}</p>
                      <div className={`flex items-center gap-3 mt-2 text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                        <span className="flex items-center gap-1"><Clock size={11} /> {req.date}</span>
                        {req.lawyer && (
                          <span className="flex items-center gap-1"><SealCheck size={11} className="text-[#C8A762]" /> {req.lawyer}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`text-[14px] font-bold ${isDark ? "text-amber-400" : "text-amber-600"}`}>{req.price} ر.س</span>
                      <Link href={`/dashboard/micro/requests/${req.id}`}>
                        <motion.div whileHover={{ scale: 1.04 }}
                          className="flex items-center gap-1 text-[11px] font-bold text-royal border border-royal/20 bg-royal/5 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-royal/10 transition-colors"
                        >
                          عرض التفاصيل <ArrowLeft size={10} />
                        </motion.div>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
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
