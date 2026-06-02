"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  FileText, Plus, MagnifyingGlass, DownloadSimple,
  Eye, CheckCircle, Clock, PencilSimple, Trash,
  FilePdf, FileDoc, SealCheck, Warning, X, ArrowLeft,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ──────────────────────────────────────────────────────

type ContractStatus = "active" | "draft" | "expired" | "pending_signature";

interface Contract {
  id: string;
  title: string;
  type: string;
  status: ContractStatus;
  parties: string;
  createdDate: string;
  expiryDate: string | null;
  lawyer: string;
  signed: boolean;
  fileType: "pdf" | "docx";
}

const CONTRACTS: Contract[] = [
  {
    id: "CTR-001",
    title: "عقد إيجار محل تجاري — الرياض",
    type: "عقاري",
    status: "active",
    parties: "خالد العمر × شركة الريف",
    createdDate: "١٥ مارس ٢٠٢٦",
    expiryDate: "١٥ مارس ٢٠٢٧",
    lawyer: "نورة الزهراني",
    signed: true,
    fileType: "pdf",
  },
  {
    id: "CTR-002",
    title: "عقد توريد خدمات تقنية",
    type: "تجاري",
    status: "pending_signature",
    parties: "خالد العمر × شركة التقنية",
    createdDate: "٢٠ أبريل ٢٠٢٦",
    expiryDate: null,
    lawyer: "علي السعدي",
    signed: false,
    fileType: "docx",
  },
  {
    id: "CTR-003",
    title: "اتفاقية عمل مستقل",
    type: "عمالي",
    status: "draft",
    parties: "خالد العمر × —",
    createdDate: "٢٥ أبريل ٢٠٢٦",
    expiryDate: null,
    lawyer: "—",
    signed: false,
    fileType: "docx",
  },
  {
    id: "CTR-004",
    title: "عقد شراكة تجارية ٢٠٢٤",
    type: "تجاري",
    status: "expired",
    parties: "خالد العمر × محمد الغامدي",
    createdDate: "١ يناير ٢٠٢٤",
    expiryDate: "٣١ ديسمبر ٢٠٢٤",
    lawyer: "خالد الحربي",
    signed: true,
    fileType: "pdf",
  },
];

type FilterKey = "all" | "active" | "pending_signature" | "draft" | "expired";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",               label: "الكل" },
  { key: "active",            label: "نشط" },
  { key: "pending_signature", label: "بانتظار التوقيع" },
  { key: "draft",             label: "مسودة" },
  { key: "expired",           label: "منتهي" },
];

const STATUS_STYLE: Record<ContractStatus, { label: string; bg: string; text: string; border: string }> = {
  active:            { label: "نشط",               bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700/30" },
  pending_signature: { label: "بانتظار التوقيع",   bg: "bg-amber-50 dark:bg-amber-900/20",    text: "text-amber-600 dark:text-amber-400",    border: "border-amber-200 dark:border-amber-700/30" },
  draft:             { label: "مسودة",              bg: "bg-zinc-100 dark:bg-zinc-800",        text: "text-zinc-500 dark:text-zinc-400",      border: "border-zinc-200 dark:border-zinc-700" },
  expired:           { label: "منتهي",              bg: "bg-red-50 dark:bg-red-900/20",        text: "text-red-500 dark:text-red-400",        border: "border-red-200 dark:border-red-700/30" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};

export default function MicroContractsPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Contract | null>(null);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const filtered = CONTRACTS.filter(c =>
    (filter === "all" || c.status === filter) &&
    (c.title.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search))
  );

  return (
    <div className={`p-5 md:p-8 max-w-[900px] mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="flex items-center justify-between">
        <div>
          <h1 className={`text-[22px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>عقودي</h1>
          <p className={`text-[13px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            إدارة عقودك ومراجعتها والتوقيع عليها
          </p>
        </div>
        <Link href="/ai/corp/contracts">
          <motion.div
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 bg-[#0B3D2E] text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-md cursor-pointer"
          >
            <Plus size={16} weight="bold" /> عقد جديد
          </motion.div>
        </Link>
      </motion.div>

      {/* Search + Filter */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1} className="space-y-3">
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-200"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث برقم أو عنوان العقد..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                filter === f.key
                  ? "bg-[#0B3D2E] text-white"
                  : isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "نشطة",   count: CONTRACTS.filter(c => c.status === "active").length,            color: "text-emerald-500" },
            { label: "توقيع",  count: CONTRACTS.filter(c => c.status === "pending_signature").length,  color: "text-amber-500" },
            { label: "مسودات", count: CONTRACTS.filter(c => c.status === "draft").length,              color: isDark ? "text-zinc-400" : "text-zinc-500" },
            { label: "منتهية", count: CONTRACTS.filter(c => c.status === "expired").length,            color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className={`${card} p-3 text-center`}>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.count}</p>
              <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Contract List */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${card} p-12 text-center`}>
            <FileText size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
            <p className={`font-bold text-[15px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد عقود</p>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-3">
            {filtered.map((c, i) => {
              const ss = STATUS_STYLE[c.status];
              const FileIcon = c.fileType === "pdf" ? FilePdf : FileDoc;
              return (
                <motion.div
                  key={c.id}
                  variants={fadeUp} initial="hidden" animate="show" custom={i}
                  className={`${card} p-5 cursor-pointer hover:border-royal/30 transition-all`}
                  onClick={() => setSelected(c)}
                >
                  <div className="flex items-start gap-4">
                    {/* File Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.fileType === "pdf" ? "bg-red-50 dark:bg-red-900/20" : "bg-blue-50 dark:bg-blue-900/20"}`}>
                      <FileIcon size={20} weight="duotone" className={c.fileType === "pdf" ? "text-red-500" : "text-blue-500"} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${ss.bg} ${ss.text} ${ss.border}`}>
                          {ss.label}
                        </span>
                        {c.status === "pending_signature" && (
                          <span className="text-[10px] font-bold text-amber-500 animate-pulse flex items-center gap-0.5">
                            <Warning size={9} weight="fill" /> يحتاج توقيعك
                          </span>
                        )}
                        {c.signed && (
                          <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
                            <SealCheck size={10} weight="fill" /> موقّع
                          </span>
                        )}
                      </div>
                      <p className={`text-[14px] font-bold leading-snug ${isDark ? "text-white" : "text-zinc-800"}`}>{c.title}</p>
                      <p className={`text-[10px] font-mono mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{c.id}</p>

                      <div className={`flex flex-wrap items-center gap-3 mt-2 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {c.createdDate}
                        </span>
                        {c.expiryDate && (
                          <span className={`flex items-center gap-1 ${c.status === "expired" ? "text-red-400" : ""}`}>
                            <CheckCircle size={10} /> ينتهي: {c.expiryDate}
                          </span>
                        )}
                        <span>{c.type}</span>
                        <span>{c.lawyer !== "—" ? `المحامي: ${c.lawyer}` : "بدون محامي"}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <motion.button whileHover={{ scale: 1.1 }} onClick={e => e.stopPropagation()}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${isDark ? "bg-zinc-800 text-zinc-400 hover:text-emerald-400" : "bg-zinc-50 text-zinc-400 hover:text-royal hover:bg-royal/5"}`}
                        title="عرض">
                        <Eye size={14} />
                      </motion.button>
                      <motion.button whileHover={{ scale: 1.1 }} onClick={e => e.stopPropagation()}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${isDark ? "bg-zinc-800 text-zinc-400 hover:text-amber-400" : "bg-zinc-50 text-zinc-400 hover:text-amber-500 hover:bg-amber-50"}`}
                        title="تحميل">
                        <DownloadSimple size={14} />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contract Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white"}`}
            >
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
                <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>تفاصيل العقد</h2>
                <button onClick={() => setSelected(null)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}>
                  <X size={15} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <span className={`text-[10px] font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{selected.id}</span>
                  <h3 className={`text-[16px] font-bold mt-0.5 ${isDark ? "text-white" : "text-zinc-800"}`}>{selected.title}</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "النوع",           val: selected.type },
                    { label: "الحالة",          val: STATUS_STYLE[selected.status].label },
                    { label: "الأطراف",         val: selected.parties },
                    { label: "المحامي المسؤول",  val: selected.lawyer },
                    { label: "تاريخ الإنشاء",   val: selected.createdDate },
                    { label: "تاريخ الانتهاء",  val: selected.expiryDate ?? "غير محدد" },
                  ].map(item => (
                    <div key={item.label} className={`p-3 rounded-xl ${isDark ? "bg-zinc-800" : "bg-zinc-50"}`}>
                      <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{item.label}</p>
                      <p className={`text-[13px] font-bold mt-0.5 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{item.val}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  {selected.status === "pending_signature" && (
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white font-bold text-[13px] cursor-pointer hover:bg-[#0d5238] transition-colors"
                    >
                      <SealCheck size={15} weight="fill" /> توقيع العقد
                    </motion.button>
                  )}
                  {selected.status === "draft" && (
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white font-bold text-[13px] cursor-pointer hover:bg-[#0d5238] transition-colors"
                    >
                      <PencilSimple size={15} /> تحرير المسودة
                    </motion.button>
                  )}
                  <motion.button whileHover={{ scale: 1.02 }}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-[13px] cursor-pointer transition-colors ${isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                  >
                    <DownloadSimple size={14} /> تحميل
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
