"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  UserCircle, EnvelopeSimple, Phone, MapPin,
  Briefcase, Receipt, ShieldCheck, CheckCircle,
  FileText, ArrowRight, DotsThree, CaretLeft, Plus
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useParams } from "next/navigation";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const CLIENT_DATA = {
  id: "C-9021",
  name: "شركة الأفق الحديثة للتقنية",
  type: "شركة",
  status: "نشط",
  email: "legal@alufuq.com",
  phone: "0501112222",
  address: "الرياض، حي العليا، برج المملكة",
  kycStatus: "مكتمل",
  joinDate: "٢٠٢٣/٠١/١٥",
  totalBilled: 125000,
  activeCases: 3,
  cases: [
    { id: "L-405", title: "استحواذ على شركة ناشئة", status: "نشط", date: "٢٠٢٤/٠٣/١٠" },
    { id: "B-099", title: "صياغة عقود توظيف", status: "مكتمل", date: "٢٠٢٣/١١/٠٥" },
    { id: "C-102", title: "استشارة ضريبية", status: "نشط", date: "٢٠٢٤/٠٥/٠١" },
  ],
  invoices: [
    { id: "INV-041", amount: 45000, status: "مدفوعة", date: "٢٠٢٤/٠٤/٠١" },
    { id: "INV-039", amount: 15000, status: "مدفوعة", date: "٢٠٢٤/٠٣/٢٥" },
    { id: "INV-022", amount: 20000, status: "متأخرة", date: "٢٠٢٤/٠٢/١٠" },
  ]
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientDetailsPage() {
  const { isDark } = useTheme();
  const params = useParams(); // Using params.id in real app
  const [activeTab, setActiveTab] = useState<"overview" | "cases" | "invoices" | "documents">("overview");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px]">
        <Link href="/dashboard/firm/clients" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>العملاء</Link>
        <CaretLeft size={11} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <span className={isDark ? "text-zinc-300" : "text-slate-600"}>{CLIENT_DATA.name}</span>
      </div>

      {/* Header Profile */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-6 relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-royal/10 rounded-full blur-3xl -mr-10 -mt-10" />
        
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-bold border ${isDark ? "bg-zinc-800 border-white/[0.05] text-white" : "bg-slate-50 border-slate-200 text-slate-800"}`}>
              {CLIENT_DATA.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{CLIENT_DATA.name}</h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-600 border-blue-200"}`}>{CLIENT_DATA.type}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200"}`}>{CLIENT_DATA.status}</span>
              </div>
              <p className={`text-[12px] flex items-center gap-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                <span className="font-mono">{CLIENT_DATA.id}</span>
                <span className="opacity-50">•</span>
                انضم في {CLIENT_DATA.joinDate}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className={`px-4 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>تعديل البيانات</button>
            <button className="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] border-transparent">
              <Plus size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-6 relative z-10 border-t pt-6 dark:border-white/[0.04] border-slate-100">
          <div className="flex items-center gap-2">
            <EnvelopeSimple size={16} className="text-royal" />
            <span className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{CLIENT_DATA.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-emerald-500" />
            <span className={`text-[12px] font-mono ${isDark ? "text-zinc-300" : "text-slate-600"}`} dir="ltr">{CLIENT_DATA.phone}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-amber-500" />
            <span className={`text-[12px] truncate ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{CLIENT_DATA.address}</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className={CLIENT_DATA.kycStatus === "مكتمل" ? "text-emerald-500" : "text-amber-500"} weight="fill" />
            <span className={`text-[12px] font-bold ${CLIENT_DATA.kycStatus === "مكتمل" ? "text-emerald-500" : "text-amber-500"}`}>KYC: {CLIENT_DATA.kycStatus}</span>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`${card} p-5 flex items-center gap-4`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-royal/10" : "bg-royal/5"}`}>
            <Briefcase size={24} className="text-royal" weight="duotone" />
          </div>
          <div>
            <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>القضايا والمشاريع</p>
            <p className={`text-[20px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{CLIENT_DATA.activeCases} <span className="text-[12px] font-sans font-normal">نشط</span></p>
          </div>
        </div>
        <div className={`${card} p-5 flex items-center gap-4`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
            <Receipt size={24} className="text-emerald-500" weight="duotone" />
          </div>
          <div>
            <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>إجمالي المفوتر</p>
            <p className={`text-[20px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{CLIENT_DATA.totalBilled.toLocaleString()} <span className="text-[12px] font-sans font-normal">ريال</span></p>
          </div>
        </div>
        <div className={`${card} p-5 flex items-center gap-4`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}>
            <FileText size={24} className="text-amber-500" weight="duotone" />
          </div>
          <div>
            <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المستندات المحفوظة</p>
            <p className={`text-[20px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>٤٥ <span className="text-[12px] font-sans font-normal">مستند</span></p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex items-center gap-2 p-1.5 rounded-xl border overflow-x-auto ${isDark ? "bg-zinc-900 border-white/[0.05]" : "bg-slate-50 border-slate-200"}`}>
        {(["overview", "cases", "invoices", "documents"] as const).map(t => {
          const labels = { overview: "نظرة عامة", cases: "القضايا (٣)", invoices: "الفواتير", documents: "المستندات" };
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-6 py-2.5 rounded-lg text-[12px] font-bold transition-all shrink-0 ${
                activeTab === t ? isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
              }`}>
              {labels[t]}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-[14px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>آخر القضايا</h3>
              <button className={`text-[11px] font-bold ${isDark ? "text-royal" : "text-blue-600"}`}>عرض الكل</button>
            </div>
            <div className="space-y-3">
              {CLIENT_DATA.cases.map(c => (
                <div key={c.id} className={`p-3 rounded-xl border flex items-center justify-between ${isDark ? "bg-white/[0.02] border-white/[0.04]" : "bg-slate-50 border-slate-100"}`}>
                  <div>
                    <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{c.title}</p>
                    <p className={`text-[11px] font-mono ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{c.id} • {c.date}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    c.status === "نشط" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-slate-500/10 text-slate-500 border-slate-500/20"
                  }`}>{c.status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-[14px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>آخر الفواتير</h3>
              <button className={`text-[11px] font-bold ${isDark ? "text-royal" : "text-blue-600"}`}>عرض الكل</button>
            </div>
            <div className="space-y-3">
              {CLIENT_DATA.invoices.map(inv => (
                <div key={inv.id} className={`p-3 rounded-xl border flex items-center justify-between ${isDark ? "bg-white/[0.02] border-white/[0.04]" : "bg-slate-50 border-slate-100"}`}>
                  <div>
                    <p className={`text-[14px] font-black font-mono mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>{inv.amount.toLocaleString()} ﷼</p>
                    <p className={`text-[11px] font-mono ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{inv.id} • {inv.date}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    inv.status === "مدفوعة" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                  }`}>{inv.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {activeTab !== "overview" && (
        <div className={`${card} p-12 text-center`}>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>يتم عرض محتوى التبويب ({activeTab}) هنا...</p>
        </div>
      )}

    </div>
  );
}
