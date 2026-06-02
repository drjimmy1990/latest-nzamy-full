"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Money, ArrowDown, ArrowUp, MagnifyingGlass, DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const PAYMENTS = [
  { id: "PAY-041", user: "أ. خالد الجهني",    plan: "MAX",    amount: "٣٩٩",  date: "٢٦ أبريل ٢٠٢٦", method: "بطاقة", status: "ناجح" },
  { id: "PAY-040", user: "شركة المستقبل",     plan: "CORP",   amount: "٢٩٩٩", date: "٢٥ أبريل ٢٠٢٦", method: "تحويل", status: "ناجح" },
  { id: "PAY-039", user: "جمعية البيئة",       plan: "PRO",    amount: "١٩٩",  date: "٢٤ أبريل ٢٠٢٦", method: "بطاقة", status: "ناجح" },
  { id: "PAY-038", user: "م. نورة القحطاني",  plan: "SHIELD", amount: "٩٩",   date: "٢٣ أبريل ٢٠٢٦", method: "بطاقة", status: "مسترجع" },
  { id: "PAY-037", user: "مكتب السلمي",        plan: "PRO",    amount: "١٩٩",  date: "٢٢ أبريل ٢٠٢٦", method: "بطاقة", status: "ناجح" },
  { id: "PAY-036", user: "أ. عبدالرحمن",       plan: "AI",     amount: "١٤٩",  date: "٢١ أبريل ٢٠٢٦", method: "بطاقة", status: "فشل" },
];
export default function AdminPaymentsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const STATUS_COLOR: Record<string, string> = { "ناجح": "text-emerald-500 bg-emerald-500/10", "مسترجع": "text-amber-500 bg-amber-500/10", "فشل": "text-rose-500 bg-rose-500/10" };
  const filtered = PAYMENTS.filter(p => p.user.includes(search) || p.id.includes(search));
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}><Money size={22} weight="duotone" className={isDark ? "text-emerald-400" : "text-emerald-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>سجل المدفوعات</h1><p className={`text-xs ${muted}`}>{filtered.length} عملية</p></div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-white"}`}>
              <MagnifyingGlass size={13} className={muted} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className={`bg-transparent outline-none text-sm w-28 ${isDark ? "text-gray-200 placeholder:text-gray-600" : "text-gray-800 placeholder:text-gray-400"}`} />
            </div>
            <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              <DownloadSimple size={14} /> تصدير
            </button>
          </div>
        </div>
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`grid grid-cols-12 text-xs font-bold px-5 py-3 border-b ${isDark ? "border-[#2d3748] text-gray-500 bg-[#0c0f12]" : "border-gray-100 text-gray-400 bg-gray-50"}`}>
            <span className="col-span-2">المرجع</span>
            <span className="col-span-3">المستخدم</span>
            <span className="col-span-2">الخطة</span>
            <span className="col-span-2">التاريخ</span>
            <span className="col-span-1">الطريقة</span>
            <span className="col-span-1 text-center">الحالة</span>
            <span className="col-span-1 text-end">المبلغ</span>
          </div>
          <div className={`divide-y ${isDark ? "divide-[#2d3748]" : "divide-gray-100"}`}>
            {filtered.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className={`grid grid-cols-12 items-center px-5 py-4 transition ${isDark ? "hover:bg-white/2" : "hover:bg-gray-50"}`}>
                <span className={`col-span-2 text-[10px] font-mono font-bold ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>{p.id}</span>
                <span className={`col-span-3 text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{p.user}</span>
                <span className={`col-span-2 text-[10px] font-black px-2 py-0.5 rounded-full w-fit ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-700"}`}>{p.plan}</span>
                <span className={`col-span-2 text-xs ${muted}`}>{p.date}</span>
                <span className={`col-span-1 text-xs ${muted}`}>{p.method}</span>
                <div className="col-span-1 text-center">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                </div>
                <span className={`col-span-1 text-xs font-black text-end ${p.status === "مسترجع" ? "text-amber-500" : p.status === "فشل" ? "text-rose-500" : isDark ? "text-emerald-400" : "text-emerald-600"}`}>{p.amount}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
