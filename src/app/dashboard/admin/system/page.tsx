"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Terminal, Warning, CheckCircle, Info, MagnifyingGlass, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const LOGS = [
  { ts: "٢٦/٠٤ ١٨:٤٢:١٢", level: "INFO",  service: "auth",     msg: "User login: government_judge" },
  { ts: "٢٦/٠٤ ١٨:٤٠:٣٣", level: "INFO",  service: "ai",       msg: "AI call: judgment-drafter completed in 3.2s" },
  { ts: "٢٦/٠٤ ١٨:٣٨:٥١", level: "WARN",  service: "billing",  msg: "Payment retry #2 for PAY-036 — card declined" },
  { ts: "٢٦/٠٤ ١٨:٣٥:٠٧", level: "INFO",  service: "storage",  msg: "File uploaded: arrest-warrant-draft.pdf" },
  { ts: "٢٦/٠٤ ١٨:٣٢:١٩", level: "ERROR", service: "ai",       msg: "Token limit exceeded for session ngo_manager:report-gen" },
  { ts: "٢٦/٠٤ ١٨:٢٩:٤٤", level: "INFO",  service: "auth",     msg: "Password reset requested: lawyer_lite" },
  { ts: "٢٦/٠٤ ١٨:٢٥:٠٢", level: "WARN",  service: "system",   msg: "CPU usage spike 87% — auto-scaled ×2" },
  { ts: "٢٦/٠٤ ١٨:٢١:١١", level: "INFO",  service: "cron",     msg: "Daily backup completed — 2.4 GB" },
];
const LEVEL_CONF: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  INFO:  { color: "text-blue-500",    bg: "bg-blue-500/10",    icon: Info },
  WARN:  { color: "text-amber-500",   bg: "bg-amber-500/10",   icon: Warning },
  ERROR: { color: "text-rose-500",    bg: "bg-rose-500/10",    icon: Warning },
};
export default function AdminSystemPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<"ALL"|"INFO"|"WARN"|"ERROR">("ALL");
  const [search, setSearch] = useState("");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const filtered = LOGS.filter(l => (filter === "ALL" || l.level === filter) && (l.msg.toLowerCase().includes(search.toLowerCase()) || l.service.includes(search)));
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-gray-500/10" : "bg-gray-100"}`}><Terminal size={22} weight="duotone" className={isDark ? "text-gray-400" : "text-gray-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>سجل النظام</h1><p className={`text-xs ${muted}`}>آخر {LOGS.length} سجلات · يتحدث كل ٣٠ ثانية</p></div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-white"}`}>
              <MagnifyingGlass size={13} className={muted} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className={`bg-transparent outline-none text-sm w-28 ${isDark ? "text-gray-200 placeholder:text-gray-600" : "text-gray-800 placeholder:text-gray-400"}`} />
            </div>
            <button className={`p-2.5 rounded-xl transition ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}><ArrowClockwise size={15} /></button>
          </div>
        </div>
        {/* Level filter tabs */}
        <div className="flex gap-2">
          {(["ALL","INFO","WARN","ERROR"] as const).map(l => (
            <button key={l} onClick={() => setFilter(l)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${filter === l ? (l === "ERROR" ? "bg-rose-500 text-white" : l === "WARN" ? "bg-amber-500 text-white" : l === "INFO" ? "bg-blue-500 text-white" : isDark ? "bg-white/10 text-white" : "bg-gray-800 text-white") : isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {l === "ALL" ? "الكل" : l}
            </button>
          ))}
        </div>
        {/* Log entries */}
        <div className={`${card} overflow-hidden shadow-sm font-mono`}>
          <div className={`divide-y ${isDark ? "divide-[#2d3748]" : "divide-gray-100"}`}>
            {filtered.map((l, i) => {
              const conf = LEVEL_CONF[l.level];
              const Icon = conf.icon;
              return (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className={`flex items-start gap-3 px-5 py-3 transition ${isDark ? "hover:bg-white/2" : "hover:bg-gray-50"}`}>
                  <span className={`text-[10px] shrink-0 ${muted} mt-0.5`}>{l.ts}</span>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${conf.bg} ${conf.color}`}>
                    <Icon size={8} weight="fill" /> {l.level}
                  </span>
                  <span className={`text-[10px] font-bold shrink-0 ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>[{l.service}]</span>
                  <span className={`text-xs flex-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{l.msg}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
