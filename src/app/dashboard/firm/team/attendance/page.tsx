"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, CalendarBlank, CheckCircle, Warning, ArrowRight,
  UserCircle, CaretDown, Download, FunnelSimple, Export,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ──────────────────────────────────────────────────────

type AttendanceStatus = "present" | "late" | "absent" | "leave" | "remote";

interface TeamMember {
  name: string;
  role: string;
  avatar: string;
}

interface DayRecord {
  member: TeamMember;
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  hours: string;
  note?: string;
}

const TEAM: TeamMember[] = [
  { name: "أ. فهد العتيبي", role: "شريك مؤسس", avatar: "ف" },
  { name: "أ. سارة القحطاني", role: "محامية أولى", avatar: "س" },
  { name: "أ. عبدالله المالكي", role: "محامي", avatar: "ع" },
  { name: "أ. نايف الحربي", role: "متدرب", avatar: "ن" },
  { name: "ريم الشهري", role: "سكرتيرة قانونية", avatar: "ر" },
  { name: "خالد العنزي", role: "معقّب", avatar: "خ" },
];

const TODAY_RECORDS: DayRecord[] = [
  { member: TEAM[0], status: "present", checkIn: "٧:٤٥ ص", checkOut: "٤:٣٠ م", hours: "٨:٤٥" },
  { member: TEAM[1], status: "present", checkIn: "٨:٠٢ ص", checkOut: "٥:١٥ م", hours: "٩:١٣" },
  { member: TEAM[2], status: "late", checkIn: "٩:٢٠ ص", checkOut: "٥:٠٠ م", hours: "٧:٤٠", note: "تأخر ٢٠ دقيقة" },
  { member: TEAM[3], status: "present", checkIn: "٧:٥٥ ص", checkOut: "٣:٣٠ م", hours: "٧:٣٥" },
  { member: TEAM[4], status: "leave", checkIn: "—", checkOut: "—", hours: "—", note: "إجازة سنوية" },
  { member: TEAM[5], status: "remote", checkIn: "٨:٣٠ ص", checkOut: "٢:٠٠ م", hours: "٥:٣٠", note: "عمل ميداني — محكمة جدة" },
];

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; cls: string; icon: React.ElementType }> = {
  present: { label: "حاضر", cls: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
  late:    { label: "متأخر", cls: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: Warning },
  absent:  { label: "غائب", cls: "text-red-500 bg-red-500/10 border-red-500/20", icon: Warning },
  leave:   { label: "إجازة", cls: "text-blue-500 bg-blue-500/10 border-blue-500/20", icon: CalendarBlank },
  remote:  { label: "عن بُعد", cls: "text-purple-500 bg-purple-500/10 border-purple-500/20", icon: Export },
};

const WEEKLY_SUMMARY = [
  { day: "الأحد", present: 5, late: 1, absent: 0, leave: 0 },
  { day: "الاثنين", present: 4, late: 0, absent: 0, leave: 2 },
  { day: "الثلاثاء", present: 5, late: 1, absent: 0, leave: 0 },
  { day: "الأربعاء", present: 6, late: 0, absent: 0, leave: 0 },
  { day: "الخميس", present: 4, late: 1, absent: 0, leave: 1 },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<AttendanceStatus | "all">("all");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = filter === "all" ? TODAY_RECORDS : TODAY_RECORDS.filter(r => r.status === filter);

  const counts = {
    present: TODAY_RECORDS.filter(r => r.status === "present").length,
    late: TODAY_RECORDS.filter(r => r.status === "late").length,
    absent: TODAY_RECORDS.filter(r => r.status === "absent").length,
    leave: TODAY_RECORDS.filter(r => r.status === "leave").length,
    remote: TODAY_RECORDS.filter(r => r.status === "remote").length,
  };

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            سجل الحضور والانصراف
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            الأربعاء ٩ رمضان ١٤٤٦هـ — الموافق ٩ مارس ٢٠٢٥م
          </p>
        </div>
        <button className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          <Download size={14} /> تصدير XLSX
        </button>
      </motion.div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { key: "present" as const, label: "حاضر", count: counts.present, color: "text-emerald-500", bg: "bg-emerald-500/8" },
          { key: "late" as const, label: "متأخر", count: counts.late, color: "text-amber-500", bg: "bg-amber-500/8" },
          { key: "absent" as const, label: "غائب", count: counts.absent, color: "text-red-500", bg: "bg-red-500/8" },
          { key: "leave" as const, label: "إجازة", count: counts.leave, color: "text-blue-500", bg: "bg-blue-500/8" },
          { key: "remote" as const, label: "عن بُعد", count: counts.remote, color: "text-purple-500", bg: "bg-purple-500/8" },
        ]).map((item, i) => (
          <motion.button
            key={item.key}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            onClick={() => setFilter(filter === item.key ? "all" : item.key)}
            className={`${card} p-4 text-center transition-all ${filter === item.key ? "ring-2 ring-royal/40" : ""}`}
          >
            <p className={`text-2xl font-bold font-mono ${item.color}`}>{item.count}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{item.label}</p>
          </motion.button>
        ))}
      </div>

      {/* Today's Records */}
      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
            سجل اليوم {filter !== "all" && <span className="text-royal text-[11px] font-normal ms-2">({STATUS_CONFIG[filter].label})</span>}
          </h2>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="text-[11px] text-royal hover:underline">عرض الكل</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className={`text-[10px] font-semibold uppercase tracking-wider border-b ${isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-100 text-slate-400"}`}>
                <th className="px-4 py-2.5 text-right">الموظف</th>
                <th className="px-4 py-2.5 text-right">الدور</th>
                <th className="px-4 py-2.5 text-center">الحالة</th>
                <th className="px-4 py-2.5 text-center">الحضور</th>
                <th className="px-4 py-2.5 text-center">الانصراف</th>
                <th className="px-4 py-2.5 text-center">الساعات</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec, i) => {
                const st = STATUS_CONFIG[rec.status];
                const StIcon = st.icon;
                return (
                  <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                    className={`border-b transition-colors ${isDark ? "border-white/[0.03] hover:bg-white/[0.02]" : "border-slate-50 hover:bg-slate-50/60"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold ${isDark ? "bg-royal/20 text-royal" : "bg-royal/10 text-royal"}`}>
                          {rec.member.avatar}
                        </div>
                        <span className={`font-medium ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{rec.member.name}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{rec.member.role}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>
                        <StIcon size={10} weight="bold" /> {st.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-center font-mono ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{rec.checkIn}</td>
                    <td className={`px-4 py-3 text-center font-mono ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{rec.checkOut}</td>
                    <td className={`px-4 py-3 text-center font-mono font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{rec.hours}</td>
                    <td className={`px-4 py-3 hidden sm:table-cell text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{rec.note ?? "—"}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly Summary */}
      <div className={`${card} p-5`}>
        <h2 className={`text-sm font-bold mb-4 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>ملخص الأسبوع</h2>
        <div className="grid grid-cols-5 gap-2">
          {WEEKLY_SUMMARY.map((d, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.06 }}
              className={`rounded-xl p-3 text-center border ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50/50"}`}>
              <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{d.day}</p>
              <div className="flex items-center justify-center gap-1">
                <span className="text-emerald-500 font-mono text-sm font-bold">{d.present}</span>
                <span className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-300"}`}>/</span>
                <span className={`font-mono text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{TEAM.length}</span>
              </div>
              {d.late > 0 && <p className="text-[9px] text-amber-500 mt-1">{d.late} متأخر</p>}
              {d.leave > 0 && <p className="text-[9px] text-blue-500 mt-0.5">{d.leave} إجازة</p>}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
