import { motion } from "framer-motion";
import {
  Buildings, Gavel, ArrowRight, ListChecks, X
} from "@phosphor-icons/react";
import Link from "next/link";
import { type Client } from "@/constants/lawyerClientsData";
import { CLIENT_CASES, CLIENT_TASKS } from "@/app/dashboard/lawyer/_data/clientLinks";

export default function ClientDrawer({ client, isDark, onClose }: { client: Client; isDark: boolean; onClose: () => void }) {
  const cases = CLIENT_CASES[client.name] ?? [];
  const tasks = CLIENT_TASKS[client.name] ?? [];
  const unpaid = client.totalFees - client.paidFees;

  const STATUS_DOT: Record<string, string> = {
    active: "bg-emerald-400 animate-pulse",
    pending: "bg-amber-400",
    suspended: "bg-blue-400",
    closed: "bg-slate-400",
    archived: "bg-purple-400",
  };
  const STATUS_LBL: Record<string, string> = { active: "نشطة", pending: "انتظار", suspended: "معلقة", closed: "مغلقة", archived: "أرشيف" };
  const TASK_PRI: Record<string, string> = { high: "text-red-500", medium: "text-amber-500", low: "text-slate-400" };

  const panelBg = isDark ? "bg-zinc-900 border-l border-white/[0.07]" : "bg-white border-l border-slate-200 shadow-2xl";

  return (
    <>
      {/* Backdrop */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose} />

      {/* Panel */}
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        className="fixed inset-y-0 left-0 z-50 w-full max-w-sm overflow-y-auto"
        style={{ backgroundColor: isDark ? "#18181b" : "#ffffff" }}
        dir="rtl">

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${client.type === "company" ? "bg-indigo-500/10 text-indigo-500" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
              {client.type === "company" ? <Buildings size={18} weight="duotone" /> : client.name.charAt(0)}
            </div>
            <div>
              <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{client.name}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{client.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-slate-100 text-slate-400"}`}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Fee summary */}
          {client.totalFees > 0 && (
            <div className={`p-4 rounded-2xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الأتعاب</p>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>إجمالي الأتعاب</span>
                <span className={`font-bold text-[13px] ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{client.totalFees.toLocaleString()} ﷼</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المسدَّد</span>
                <span className="font-bold text-[13px] text-emerald-500">{client.paidFees.toLocaleString()} ﷼</span>
              </div>
              {unpaid > 0 && (
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المتبقي</span>
                  <span className="font-bold text-[13px] text-red-500">{unpaid.toLocaleString()} ﷼</span>
                </div>
              )}
              <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
                <div className={`h-full rounded-full ${ unpaid === 0 ? "bg-emerald-500" : unpaid > client.totalFees * 0.5 ? "bg-red-500" : "bg-amber-500"}`}
                  style={{ width: `${client.totalFees ? Math.round(client.paidFees / client.totalFees * 100) : 100}%` }} />
              </div>
            </div>
          )}

          {/* Cases */}
          <div>
            <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <Gavel size={10} className="inline me-1" />القضايا ({cases.length})
            </p>
            {cases.length === 0 ? (
              <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد قضايا مرتبطة</p>
            ) : cases.map(c => (
              <Link key={c.id} href={`/dashboard/lawyer/cases`}
                className={`flex items-start gap-3 p-3 rounded-xl mb-2 transition-colors ${ isDark ? "hover:bg-white/[0.04] border border-white/[0.04]" : "hover:bg-slate-50 border border-slate-100"}`}>
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[c.status] ?? "bg-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{c.title}</p>
                  <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    {STATUS_LBL[c.status]} · {c.court}{c.nextDate ? ` · ${c.nextDate}` : ""}
                  </p>
                </div>
                <ArrowRight size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
              </Link>
            ))}
          </div>

          {/* Tasks */}
          <div>
            <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <ListChecks size={10} className="inline me-1" />المهام ({tasks.length})
            </p>
            {tasks.length === 0 ? (
              <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد مهام مرتبطة</p>
            ) : tasks.map(t => (
              <div key={t.id} className={`flex items-start gap-3 p-3 rounded-xl mb-2 ${isDark ? "border border-white/[0.04]" : "border border-slate-100"}`}>
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 ${ t.status === "done" ? "bg-emerald-500 border-emerald-500" : isDark ? "border-zinc-600" : "border-slate-300"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"} ${t.status === "done" ? "line-through opacity-50" : ""}`}>{t.title}</p>
                  <p className={`text-[10px] mt-0.5 ${TASK_PRI[t.priority]}`}>
                    {t.priority === "high" ? "⚠ عاجلة" : t.priority === "medium" ? "متوسطة" : "منخفضة"} · {t.dueDate}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/lawyer/tasks"
              className={`flex items-center gap-2 p-3 rounded-xl border text-[11px] font-bold transition-colors ${ isDark ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              <ListChecks size={14} /> إضافة مهمة
            </Link>
            <Link href="/dashboard/lawyer/cases"
              className={`flex items-center gap-2 p-3 rounded-xl border text-[11px] font-bold transition-colors ${ isDark ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              <Gavel size={14} /> عرض القضايا
            </Link>
          </div>

        </div>
      </motion.div>
    </>
  );
}
