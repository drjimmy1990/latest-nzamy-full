"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarBlank, CheckCircle, Clock, Gavel, MagnifyingGlass, Plus, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

type TaskStatus = "todo" | "doing" | "done";

const INITIAL_TASKS = [
  { id: "T-101", title: "مراجعة مذكرة الاستئناف", owner: "محام أول", department: "التقاضي", due: "اليوم", status: "doing" as TaskStatus },
  { id: "T-102", title: "تجهيز بنود عقد الشراكة", owner: "محام", department: "العقود والشركات", due: "غدا", status: "todo" as TaskStatus },
  { id: "T-103", title: "فحص تعارض مصالح عميل جديد", owner: "امتثال", department: "الامتثال", due: "اليوم", status: "todo" as TaskStatus },
  { id: "T-104", title: "إغلاق تقرير جلسة التحكيم", owner: "شريك", department: "التحكيم", due: "أمس", status: "done" as TaskStatus },
];

const STATUS_LABEL: Record<TaskStatus, string> = { todo: "مطلوب", doing: "قيد التنفيذ", done: "مكتمل" };

export default function FirmTasksPage() {
  const { isDark } = useTheme();
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("مهام فريق شركة المحاماة Backend-ready: إدارة المهام هنا محلية فقط حتى ربط Task API وAuditEvent.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  const filtered = useMemo(() => tasks.filter((task) => !search || `${task.title} ${task.owner} ${task.department}`.includes(search)), [tasks, search]);

  const addTask = () => {
    const next = { id: `T-${Date.now().toString().slice(-3)}`, title: "مهمة محلية جديدة للربط لاحقا", owner: "مدير قسم", department: "التقاضي", due: "هذا الأسبوع", status: "todo" as TaskStatus };
    setTasks((prev) => [next, ...prev]);
    setToast("تمت إضافة مهمة محليا فقط. إنشاء المهمة الحقيقي ينتظر Task API وتنبيهات الفريق.");
  };

  const moveTask = (id: string, status: TaskStatus) => {
    setTasks((prev) => prev.map((task) => task.id === id ? { ...task, status } : task));
    setToast("تم تغيير حالة المهمة محليا فقط. الحفظ الحقيقي ينتظر Task API وسجل التدقيق.");
  };

  return (
    <SubscriptionGuard featureKey="firm-team">
      <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>مهام فريق المكتب</h1>
            <p className={`mt-1 text-sm ${muted}`}>مهام قانونية وتشغيلية موزعة على الأقسام والأدوار، كواجهة جاهزة للربط.</p>
          </div>
          <button onClick={addTask} className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-black text-[#C8A762]">
            <Plus size={15} weight="bold" />
            مهمة جديدة
          </button>
        </div>

        <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
          <span>{toast}</span>
        </div>

        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={15} className={muted} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث في مهام الفريق..." className={`w-full bg-transparent text-sm outline-none ${isDark ? "text-white placeholder:text-zinc-600" : "text-slate-800 placeholder:text-slate-400"}`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["todo", "doing", "done"] as TaskStatus[]).map((status) => (
            <div key={status} className={`${card} p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{STATUS_LABEL[status]}</p>
                <span className="rounded-full bg-[#C8A762]/10 px-2 py-1 text-[10px] font-bold text-[#C8A762]">{filtered.filter((task) => task.status === status).length}</span>
              </div>
              <div className="space-y-3">
                {filtered.filter((task) => task.status === status).map((task, index) => (
                  <motion.div key={task.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{task.title}</p>
                        <p className={`mt-1 text-[11px] ${muted}`}>{task.department} · {task.owner}</p>
                      </div>
                      <Gavel size={17} className="text-[#C8A762]" />
                    </div>
                    <div className={`mt-3 flex items-center gap-2 text-[11px] ${muted}`}>
                      <CalendarBlank size={12} />
                      {task.due}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <SmallAction label="مطلوب" icon={Clock} active={status === "todo"} onClick={() => moveTask(task.id, "todo")} />
                      <SmallAction label="تنفيذ" icon={WarningCircle} active={status === "doing"} onClick={() => moveTask(task.id, "doing")} />
                      <SmallAction label="تم" icon={CheckCircle} active={status === "done"} onClick={() => moveTask(task.id, "done")} />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SubscriptionGuard>
  );
}

function SmallAction({ label, icon: Icon, active, onClick }: { label: string; icon: React.ElementType; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${active ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-white/5 text-zinc-500"}`}>
      <Icon size={11} />
      {label}
    </button>
  );
}
