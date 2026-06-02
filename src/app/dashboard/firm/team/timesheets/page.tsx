"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Clock, CalendarBlank, UserCircle, Briefcase,
  PlayCircle, StopCircle, CheckCircle, Warning,
  MagnifyingGlass, ChartBar, Receipt, CaretLeft, CaretRight, Plus
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ────────────────────────────────────────────────────────

type TimesheetStatus = "معتمد" | "بانتظار الاعتماد" | "مرفوض";

interface TimesheetEntry {
  id: string;
  lawyerName: string;
  date: string;
  caseRef: string;
  description: string;
  hours: number;
  isBillable: boolean;
  status: TimesheetStatus;
}

const MOCK_TIMESHEETS: TimesheetEntry[] = [
  { id: "TS-101", lawyerName: "سلمان العتيبي", date: "٢٠٢٤/٠٥/١٥", caseRef: "استحواذ الأفق M&A", description: "مراجعة مسودة اتفاقية الشراكة واجتماع مع الطرف الآخر", hours: 4.5, isBillable: true, status: "بانتظار الاعتماد" },
  { id: "TS-102", lawyerName: "نورة الزهراني", date: "٢٠٢٤/٠٥/١٥", caseRef: "قضية عمالية L-405", description: "حضور جلسة في المحكمة العمالية والترافع", hours: 2.0, isBillable: true, status: "معتمد" },
  { id: "TS-103", lawyerName: "خالد الراشد (متدرب)", date: "٢٠٢٤/٠٥/١٤", caseRef: "تأسيس شركة", description: "بحث قانوني في نظام الشركات الجديد", hours: 3.0, isBillable: false, status: "معتمد" },
  { id: "TS-104", lawyerName: "فهد الدوسري", date: "٢٠٢٤/٠٥/١٣", caseRef: "صياغة عقود B-099", description: "تعديل بنود عقد المقاولة بناء على طلب العميل", hours: 1.5, isBillable: true, status: "مرفوض" },
];

const STATUS_COLORS: Record<TimesheetStatus, string> = {
  "معتمد": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "بانتظار الاعتماد": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "مرفوض": "bg-red-500/10 text-red-500 border-red-500/20",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimesheetsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TimesheetStatus | "الكل">("الكل");
  const [isTracking, setIsTracking] = useState(false);
  const [trackingTime, setTrackingTime] = useState("00:00:00");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = MOCK_TIMESHEETS.filter(t => 
    (filter === "الكل" || t.status === filter) &&
    (!search || t.lawyerName.includes(search) || t.caseRef.includes(search))
  );

  const totalBillable = MOCK_TIMESHEETS.filter(t => t.isBillable).reduce((sum, t) => sum + t.hours, 0);
  const totalNonBillable = MOCK_TIMESHEETS.filter(t => !t.isBillable).reduce((sum, t) => sum + t.hours, 0);

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <Clock className="text-royal" weight="duotone" />
            نظام الساعات (Timesheets)
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            تتبع ساعات العمل المفوترة وغير المفوترة لفريق المحامين واعتمادها
          </p>
        </div>
        
        {/* Timer UI for current user */}
        <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${isDark ? "bg-zinc-800/80 border-white/[0.08]" : "bg-slate-50 border-slate-200"}`}>
          <div className="flex flex-col">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المؤقت المباشر</span>
            <span className={`text-[16px] font-black font-mono ${isTracking ? "text-emerald-500" : isDark ? "text-white" : "text-slate-800"}`} dir="ltr">{trackingTime}</span>
          </div>
          <button onClick={() => setIsTracking(!isTracking)} className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            isTracking ? "bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600" : "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600"
          }`}>
            {isTracking ? <StopCircle size={24} weight="fill" /> : <PlayCircle size={24} weight="fill" />}
          </button>
        </div>
      </motion.div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`${card} p-5 flex items-center gap-4`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
            <Receipt size={24} className="text-emerald-500" weight="duotone" />
          </div>
          <div>
            <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الساعات المفوترة (Billable)</p>
            <p className={`text-[20px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{totalBillable} <span className="text-[12px] font-sans">ساعة</span></p>
          </div>
        </div>
        <div className={`${card} p-5 flex items-center gap-4`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-slate-500/10" : "bg-slate-100"}`}>
            <Briefcase size={24} className="text-slate-500" weight="duotone" />
          </div>
          <div>
            <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>ساعات إدارية (Non-Billable)</p>
            <p className={`text-[20px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{totalNonBillable} <span className="text-[12px] font-sans">ساعة</span></p>
          </div>
        </div>
        <div className={`${card} p-5 flex items-center gap-4`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}>
            <Warning size={24} className="text-amber-500" weight="duotone" />
          </div>
          <div>
            <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>ساعات بانتظار الاعتماد</p>
            <p className={`text-[20px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>
              {MOCK_TIMESHEETS.filter(t => t.status === "بانتظار الاعتماد").reduce((s, t) => s + t.hours, 0)} <span className="text-[12px] font-sans">ساعة</span>
            </p>
          </div>
        </div>
      </div>

      {/* Date Navigation & Actions */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 ${card}`}>
        <div className="flex items-center gap-3">
          <button className={`p-2 rounded-lg border transition-colors ${isDark ? "border-white/[0.1] hover:bg-white/[0.05]" : "border-slate-200 hover:bg-slate-50"}`}>
            <CaretRight size={16} />
          </button>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-[13px] ${isDark ? "bg-zinc-800 text-white" : "bg-slate-100 text-slate-800"}`}>
            <CalendarBlank size={16} className="text-royal" />
            مايو ٢٠٢٤
          </div>
          <button className={`p-2 rounded-lg border transition-colors ${isDark ? "border-white/[0.1] hover:bg-white/[0.05]" : "border-slate-200 hover:bg-slate-50"}`}>
            <CaretLeft size={16} />
          </button>
        </div>
        <button className="px-4 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold hover:bg-[#0a3328] transition-colors flex items-center gap-2">
          <Plus size={15} weight="bold" /> إضافة سجل يدوي
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 transition-colors ${isDark ? "bg-white/[0.04] border-white/[0.06] focus-within:border-royal/40" : "bg-zinc-50 border-zinc-200 focus-within:border-emerald-300"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث باسم المحامي أو القضية..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500" dir="rtl" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(["الكل", "بانتظار الاعتماد", "معتمد", "مرفوض"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold shrink-0 transition-all border ${
                filter === f ? "bg-[#0B3D2E] border-[#0B3D2E] text-white" : isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Timesheets List */}
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className={`text-[11px] border-b ${isDark ? "border-white/[0.06] text-zinc-500 bg-zinc-900/50" : "border-slate-100 text-slate-500 bg-slate-50/50"}`}>
                <th className="p-4 font-bold">التاريخ</th>
                <th className="p-4 font-bold">المحامي</th>
                <th className="p-4 font-bold">القضية / المشروع</th>
                <th className="p-4 font-bold">الوصف</th>
                <th className="p-4 font-bold">المدة</th>
                <th className="p-4 font-bold">مفوترة؟</th>
                <th className="p-4 font-bold">الحالة</th>
                <th className="p-4 font-bold text-center">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ts, i) => (
                <motion.tr key={ts.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`border-b transition-colors ${isDark ? "border-white/[0.04] hover:bg-white/[0.02]" : "border-slate-50 hover:bg-slate-50"}`}>
                  <td className={`p-4 text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{ts.date}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <UserCircle size={18} className={isDark ? "text-zinc-400" : "text-slate-400"} />
                      <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{ts.lawyerName}</p>
                    </div>
                  </td>
                  <td className={`p-4 text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{ts.caseRef}</td>
                  <td className={`p-4 text-[11px] max-w-xs truncate ${isDark ? "text-zinc-500" : "text-slate-500"}`} title={ts.description}>{ts.description}</td>
                  <td className="p-4">
                    <p className={`text-[13px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>
                      {ts.hours} <span className="text-[10px] font-sans font-normal">س</span>
                    </p>
                  </td>
                  <td className="p-4">
                    {ts.isBillable ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500"><CheckCircle weight="fill" /> نعم</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><Briefcase weight="fill" /> إداري</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded border ${STATUS_COLORS[ts.status]}`}>
                      {ts.status}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    {ts.status === "بانتظار الاعتماد" ? (
                      <div className="flex items-center justify-center gap-1">
                        <button className="px-3 py-1.5 bg-emerald-500 text-white rounded text-[10px] font-bold hover:bg-emerald-600 transition-colors">اعتماد</button>
                        <button className="px-3 py-1.5 bg-red-500 text-white rounded text-[10px] font-bold hover:bg-red-600 transition-colors">رفض</button>
                      </div>
                    ) : (
                      <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مغلق</span>
                    )}
                  </td>
                </motion.tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد سجلات مطابقة.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
