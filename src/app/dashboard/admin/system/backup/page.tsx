"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Database, CheckCircle, Clock, DownloadSimple, Warning, ArrowClockwise, HardDrive } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const BACKUPS = [
  { id: "BK-2026-04-26", date: "٢٦ أبريل ٢٠٢٦ — ٠٣:٠٠",  size: "٢.٤ GB", status: "ناجح",   type: "تلقائي" },
  { id: "BK-2026-04-25", date: "٢٥ أبريل ٢٠٢٦ — ٠٣:٠٠",  size: "٢.٣ GB", status: "ناجح",   type: "تلقائي" },
  { id: "BK-2026-04-24", date: "٢٤ أبريل ٢٠٢٦ — ١٥:٣٠", size: "٢.٤ GB", status: "ناجح",   type: "يدوي" },
  { id: "BK-2026-04-24", date: "٢٤ أبريل ٢٠٢٦ — ٠٣:٠٠",  size: "٢.٣ GB", status: "فشل",    type: "تلقائي" },
  { id: "BK-2026-04-23", date: "٢٣ أبريل ٢٠٢٦ — ٠٣:٠٠",  size: "٢.٢ GB", status: "ناجح",   type: "تلقائي" },
];
export default function AdminBackupPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-sky-500/10" : "bg-sky-50"}`}><Database size={22} weight="duotone" className={isDark ? "text-sky-400" : "text-sky-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>النسخ الاحتياطي</h1><p className={`text-xs ${muted}`}>آخر نسخة: ٢٦ أبريل ٢٠٢٦ — ٠٣:٠٠</p></div>
          </div>
          <button onClick={() => { setRunning(true); setTimeout(() => setRunning(false), 3000); }}
            disabled={running}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition ${running ? "bg-sky-500/20 text-sky-400 cursor-wait" : "bg-sky-600 text-white hover:bg-sky-700"}`}>
            {running ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><ArrowClockwise size={14} /></motion.span> جارٍ...</> : <><Database size={14} /> نسخة الآن</>}
          </button>
        </div>
        {/* Storage stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "المساحة المستخدمة", val: "١٢.٤ GB", icon: HardDrive, color: "text-sky-500", bg: "bg-sky-500/10" },
            { label: "عدد النسخ المحفوظة", val: "٣٠ نسخة", icon: Database,  color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "معدل النجاح",         val: "٩٤٪",    icon: CheckCircle,color: "text-emerald-500", bg: "bg-emerald-500/10" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className={`${card} p-4 shadow-sm`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${s.bg} mb-2`}><Icon size={15} weight="duotone" className={s.color} /></div>
                <p className={`font-black text-base ${isDark ? "text-white" : "text-gray-900"}`}>{s.val}</p>
                <p className={`text-[10px] mt-0.5 ${muted}`}>{s.label}</p>
              </div>
            );
          })}
        </div>
        {/* Backups list */}
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`grid grid-cols-12 text-xs font-bold px-5 py-3 border-b ${isDark ? "border-[#2d3748] text-gray-500 bg-[#0c0f12]" : "border-gray-100 text-gray-400 bg-gray-50"}`}>
            <span className="col-span-3">المعرف</span>
            <span className="col-span-4">التاريخ</span>
            <span className="col-span-1">النوع</span>
            <span className="col-span-2">الحجم</span>
            <span className="col-span-1">الحالة</span>
            <span className="col-span-1"></span>
          </div>
          <div className={`divide-y ${isDark ? "divide-[#2d3748]" : "divide-gray-100"}`}>
            {BACKUPS.map((b, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className={`grid grid-cols-12 items-center px-5 py-3 transition ${isDark ? "hover:bg-white/2" : "hover:bg-gray-50"}`}>
                <span className={`col-span-3 text-[10px] font-mono font-bold ${isDark ? "text-[#C8A762]" : "text-sky-600"}`}>{b.id}</span>
                <div className="col-span-4 flex items-center gap-1 text-xs"><Clock size={10} className={muted} /><span className={muted}>{b.date}</span></div>
                <span className={`col-span-1 text-[10px] font-semibold ${b.type === "يدوي" ? isDark ? "text-violet-400" : "text-violet-600" : muted}`}>{b.type}</span>
                <span className={`col-span-2 text-xs font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{b.size}</span>
                <div className="col-span-1">
                  {b.status === "ناجح" ? <CheckCircle size={14} weight="fill" className="text-emerald-500" /> : <Warning size={14} weight="fill" className="text-rose-500" />}
                </div>
                <div className="col-span-1 text-end">
                  {b.status === "ناجح" && <button className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-white/5 text-gray-500 hover:text-sky-400" : "hover:bg-sky-50 text-gray-400 hover:text-sky-600"}`}><DownloadSimple size={13} /></button>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
