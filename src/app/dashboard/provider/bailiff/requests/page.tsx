"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ClipboardText, MagnifyingGlass, CheckCircle, Clock, Warning, ArrowRight, Storefront } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

interface BailiffRequest {
  id: string; client: string; type: string;
  entity: string; status: "جديد" | "جارٍ" | "مكتمل" | "معلّق";
  date: string; fee: string;
}
const REQUESTS: BailiffRequest[] = [
  { id: "BAI-2026-088", client: "شركة المستقبل للتجارة", type: "تعقيب سجل تجاري",        entity: "وزارة التجارة",   status: "جديد",    date: "٢٦ أبريل ٢٠٢٦", fee: "٦٠٠" },
  { id: "BAI-2026-087", client: "د. ريم الدوسري",         type: "استخراج وثيقة بلدية",    entity: "أمانة الرياض",    status: "جارٍ",    date: "٢٥ أبريل ٢٠٢٦", fee: "٤٠٠" },
  { id: "BAI-2026-086", client: "أ. عبدالرحمن القحطاني", type: "تجديد إقامة",              entity: "الجوازات",         status: "مكتمل",   date: "٢٣ أبريل ٢٠٢٦", fee: "٨٠٠" },
  { id: "BAI-2026-085", client: "مؤسسة الإبداع",          type: "استخراج رخصة محل",       entity: "بلدية الرياض",    status: "معلّق",   date: "٢٢ أبريل ٢٠٢٦", fee: "٣٥٠" },
];
const STATUS_CONF = {
  "جديد":   { bg: "bg-blue-500/10",    color: "text-blue-500",    icon: Storefront },
  "جارٍ":   { bg: "bg-amber-500/10",   color: "text-amber-500",   icon: Clock },
  "مكتمل": { bg: "bg-emerald-500/10", color: "text-emerald-500", icon: CheckCircle },
  "معلّق":  { bg: "bg-rose-500/10",    color: "text-rose-500",    icon: Warning },
};
export default function BailiffRequestsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const filtered = REQUESTS.filter(r => r.client.includes(search) || r.type.includes(search) || r.id.includes(search));
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-sky-500/10" : "bg-sky-50"}`}><ClipboardText size={22} weight="duotone" className={isDark ? "text-sky-400" : "text-sky-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>طلبات التعقيب</h1><p className={`text-xs ${muted}`}>{filtered.length} طلب · {REQUESTS.filter(r => r.status === "جديد").length} جديد</p></div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-white"}`}>
            <MagnifyingGlass size={14} className={muted} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className={`bg-transparent outline-none text-sm w-36 ${isDark ? "text-gray-200 placeholder:text-gray-600" : "text-gray-800 placeholder:text-gray-400"}`} />
          </div>
        </div>
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "جديدة",   val: REQUESTS.filter(r => r.status === "جديد").length,    color: "text-blue-500" },
            { label: "جارية",   val: REQUESTS.filter(r => r.status === "جارٍ").length,    color: "text-amber-500" },
            { label: "مكتملة", val: REQUESTS.filter(r => r.status === "مكتمل").length,   color: "text-emerald-500" },
            { label: "معلّقة",  val: REQUESTS.filter(r => r.status === "معلّق").length,   color: "text-rose-500" },
          ].map((k, i) => (
            <div key={i} className={`${card} p-3 text-center shadow-sm`}>
              <p className={`text-2xl font-black ${k.color}`}>{k.val}</p>
              <p className={`text-[10px] font-semibold mt-0.5 ${muted}`}>{k.label}</p>
            </div>
          ))}
        </div>
        {/* Table */}
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`grid grid-cols-12 text-xs font-bold px-5 py-3 border-b ${isDark ? "border-[#2d3748] text-gray-500 bg-[#0c0f12]" : "border-gray-100 text-gray-400 bg-gray-50"}`}>
            <span className="col-span-2">الرقم</span>
            <span className="col-span-3">العميل</span>
            <span className="col-span-3">نوع المعاملة</span>
            <span className="col-span-2">الجهة</span>
            <span className="col-span-1">الحالة</span>
            <span className="col-span-1 text-center">الأتعاب</span>
          </div>
          <div className={`divide-y ${isDark ? "divide-[#2d3748]" : "divide-gray-100"}`}>
            {filtered.map((r, i) => {
              const conf = STATUS_CONF[r.status];
              const Icon = conf.icon;
              return (
                <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className={`grid grid-cols-12 items-center px-5 py-4 transition ${isDark ? "hover:bg-white/2" : "hover:bg-gray-50"}`}>
                  <span className={`col-span-2 text-[10px] font-mono font-bold ${isDark ? "text-[#C8A762]" : "text-sky-600"}`}>{r.id}</span>
                  <div className="col-span-3">
                    <p className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{r.client}</p>
                    <p className={`text-[10px] ${muted}`}>{r.date}</p>
                  </div>
                  <span className={`col-span-3 text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r.type}</span>
                  <span className={`col-span-2 text-xs ${muted}`}>{r.entity}</span>
                  <div className="col-span-1">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>
                      <Icon size={8} weight="fill" /> {r.status}
                    </span>
                  </div>
                  <span className={`col-span-1 text-xs font-black text-center ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{r.fee}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
        {/* AI guide */}
        <div className={`${card} p-4 shadow-sm flex items-center gap-4`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-sky-500/10" : "bg-sky-50"}`}><ClipboardText size={18} weight="duotone" className={isDark ? "text-sky-400" : "text-sky-600"} /></div>
          <div className="flex-1">
            <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>دليل الإجراءات الذكي</p>
            <p className={`text-xs ${muted}`}>تحقق من الخطوات الإجرائية لكل معاملة وجهتها الحكومية</p>
          </div>
          <Link href="/ai/procedures" className={`text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1 ${isDark ? "bg-sky-500/10 text-sky-400 hover:bg-sky-500/20" : "bg-sky-50 text-sky-700 hover:bg-sky-100"}`}>
            دليل الإجراءات <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
