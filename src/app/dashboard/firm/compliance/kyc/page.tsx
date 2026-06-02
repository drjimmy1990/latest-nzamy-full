"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, MagnifyingGlass, UserCircle, 
  CheckCircle, ClockCounterClockwise, XCircle, 
  WarningCircle, CaretDown, Eye, UploadSimple
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ────────────────────────────────────────────────────────

type KYCStatus = "مكتمل" | "قيد المراجعة" | "ناقص" | "مرفوض" | "منتهي الصلاحية";

interface KYCDocument {
  name: string;
  type: string;
  status: "مقبول" | "مرفوض" | "بانتظار المراجعة" | "غير متوفر";
  expiryDate?: string;
}

interface KYCClient {
  id: string;
  name: string;
  type: "شركة" | "فرد";
  status: KYCStatus;
  riskLevel: "منخفض" | "متوسط" | "عالي";
  lastUpdated: string;
  documents: KYCDocument[];
}

const MOCK_CLIENTS: KYCClient[] = [
  {
    id: "1", name: "شركة الأفق الحديثة", type: "شركة", status: "مكتمل", riskLevel: "منخفض", lastUpdated: "٢٠٢٤/٠٣/١٥",
    documents: [
      { name: "السجل التجاري", type: "PDF", status: "مقبول", expiryDate: "٢٠٢٦/٠٣/١٥" },
      { name: "عقد التأسيس", type: "PDF", status: "مقبول" },
      { name: "هوية المدير المفوّض", type: "PDF", status: "مقبول", expiryDate: "٢٠٢٧/٠١/٠١" }
    ]
  },
  {
    id: "2", name: "مجموعة العليان للاستثمار", type: "شركة", status: "قيد المراجعة", riskLevel: "متوسط", lastUpdated: "٢٠٢٤/٠٥/١٠",
    documents: [
      { name: "السجل التجاري", type: "PDF", status: "بانتظار المراجعة" },
      { name: "هوية المالك المستفيد (UBO)", type: "PDF", status: "بانتظار المراجعة" }
    ]
  },
  {
    id: "3", name: "أحمد عبدالله الشمري", type: "فرد", status: "ناقص", riskLevel: "عالي", lastUpdated: "٢٠٢٤/٠٤/٢٠",
    documents: [
      { name: "بطاقة الهوية الوطنية", type: "PDF", status: "مقبول", expiryDate: "٢٠٢٥/٠٤/٢٠" },
      { name: "إثبات مصدر الدخل", type: "-", status: "غير متوفر" }
    ]
  },
  {
    id: "4", name: "مؤسسة الرواد للمقاولات", type: "شركة", status: "منتهي الصلاحية", riskLevel: "متوسط", lastUpdated: "٢٠٢٣/٠٢/١٠",
    documents: [
      { name: "السجل التجاري", type: "PDF", status: "مرفوض", expiryDate: "٢٠٢٤/٠١/٠١" }
    ]
  }
];

const STATUS_COLORS: Record<KYCStatus, string> = {
  "مكتمل": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "قيد المراجعة": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "ناقص": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "منتهي الصلاحية": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  "مرفوض": "bg-red-500/10 text-red-500 border-red-500/20",
};

const STATUS_ICONS: Record<KYCStatus, React.ReactNode> = {
  "مكتمل": <CheckCircle size={14} weight="fill" />,
  "قيد المراجعة": <ClockCounterClockwise size={14} weight="bold" />,
  "ناقص": <WarningCircle size={14} weight="fill" />,
  "منتهي الصلاحية": <WarningCircle size={14} weight="fill" />,
  "مرفوض": <XCircle size={14} weight="fill" />,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function KYCCheckPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<KYCStatus | "الكل">("الكل");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = MOCK_CLIENTS.filter(c => 
    (filter === "الكل" || c.status === filter) &&
    (!search || c.name.includes(search))
  );

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <ShieldCheck className="text-royal" weight="duotone" />
            اعتماد العملاء (KYC & AML)
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            إدارة متطلبات "اعرف عميلك" ومكافحة غسيل الأموال للعملاء الجدد والحاليين
          </p>
        </div>
        <button className="px-4 py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold hover:bg-[#0a3328] transition-colors flex items-center gap-2">
          <UploadSimple size={15} /> طلب تحديث بيانات
        </button>
      </motion.div>

      {/* Filters & Search */}
      <div className={`${card} p-4 flex flex-col sm:flex-row gap-3`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 transition-colors ${isDark ? "bg-white/[0.04] border-white/[0.06] focus-within:border-royal/40" : "bg-zinc-50 border-zinc-200 focus-within:border-emerald-300"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث باسم العميل..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500" dir="rtl" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(["الكل", "مكتمل", "قيد المراجعة", "ناقص", "منتهي الصلاحية"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold shrink-0 transition-all border ${
                filter === f ? "bg-[#0B3D2E] border-[#0B3D2E] text-white" : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((client, i) => (
          <motion.div key={client.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`${card} overflow-hidden`}>
            
            {/* Row Header */}
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.05]" : "bg-slate-100"}`}>
                  <UserCircle size={22} className="text-royal" weight="duotone" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{client.name}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      client.type === "شركة" ? (isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-600 border-blue-200") :
                      (isDark ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-purple-50 text-purple-600 border-purple-200")
                    }`}>{client.type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>التحديث: {client.lastUpdated}</span>
                    <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>مخاطر: <strong className={
                      client.riskLevel === "عالي" ? "text-red-500" : client.riskLevel === "متوسط" ? "text-amber-500" : "text-emerald-500"
                    }>{client.riskLevel}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold ${STATUS_COLORS[client.status]}`}>
                  {STATUS_ICONS[client.status]} {client.status}
                </div>
                <button className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-zinc-800 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
                  <CaretDown size={16} />
                </button>
              </div>
            </div>

            {/* Documents (Always expanded for now for demo) */}
            <div className={`p-4 border-t ${isDark ? "border-white/[0.04] bg-black/20" : "border-slate-100 bg-slate-50"}`}>
              <p className={`text-[11px] font-bold mb-3 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المستندات والمتطلبات</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {client.documents.map((doc, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? "bg-zinc-900 border-white/[0.05]" : "bg-white border-slate-200"}`}>
                    <div className="flex justify-between items-start">
                      <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{doc.name}</p>
                      {doc.status !== "غير متوفر" && (
                        <button className={`p-1 rounded transition-colors ${isDark ? "hover:bg-white/10 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
                          <Eye size={14} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className={`text-[10px] font-bold flex items-center gap-1 ${
                        doc.status === "مقبول" ? "text-emerald-500" :
                        doc.status === "بانتظار المراجعة" ? "text-blue-500" :
                        doc.status === "مرفوض" ? "text-red-500" : "text-slate-500"
                      }`}>
                        {doc.status === "مقبول" ? <CheckCircle weight="fill" /> : doc.status === "مرفوض" ? <XCircle weight="fill" /> : doc.status === "بانتظار المراجعة" ? <ClockCounterClockwise weight="bold" /> : <WarningCircle weight="fill" />}
                        {doc.status}
                      </span>
                      {doc.expiryDate && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${isDark ? "bg-white/5 text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
                          ينتهي: {doc.expiryDate}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </motion.div>
        ))}
        {filtered.length === 0 && (
           <div className={`${card} p-12 text-center`}>
           <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد نتائج مطابقة.</p>
         </div>
        )}
      </div>
    </div>
  );
}
