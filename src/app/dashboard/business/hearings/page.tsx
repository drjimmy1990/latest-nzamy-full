"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarCheck, Clock, MapPin, Plus, Warning,
  Buildings, MagnifyingGlass, Hourglass, Gavel, FileText
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

// ─── Mock Data ─────────────────────────────────────────────────────────────────
type EventType = "hearing" | "deadline" | "gov_review" | "contract";
interface CalEvent {
  id: string; title: string; type: EventType;
  department: string; location: string; date: string; time: string;
  urgency: "urgent" | "normal"; status: "pending" | "done";
}

const EVENTS: CalEvent[] = [
  { id: "e1", title: "مراجعة عقد التوريد الرئيسي", type: "contract", department: "المشتريات", location: "مكتب الإدارة", date: "اليوم", time: "١٠:٠٠ ص", urgency: "urgent", status: "pending" },
  { id: "e2", title: "تجديد رخصة الدفاع المدني", type: "gov_review", department: "الأمن والسلامة", location: "البلدية", date: "غداً", time: "٩:٠٠ ص", urgency: "normal", status: "pending" },
  { id: "e3", title: "جلسة عمالية بمحكمة التنفيذ", type: "hearing", department: "الموارد البشرية", location: "محكمة التنفيذ", date: "١٨ أبريل", time: "١١:٠٠ ص", urgency: "urgent", status: "pending" },
  { id: "e4", title: "موعد تقديم الإقرار الضريبي", type: "deadline", department: "المالية", location: "منصة ZATCA", date: "٢٥ أبريل", time: "١١:٥٩ م", urgency: "urgent", status: "pending" },
  { id: "e5", title: "توقيع اتفاقية استثمار", type: "contract", department: "الإدارة التنفيذية", location: "قاعة الاجتماعات الفائقة", date: "أمس", time: "٢:٠٠ م", urgency: "normal", status: "done" },
];

const TYPE_CONFIG: Record<EventType, { icon: React.ElementType, label: string, color: string, bg: string, border: string }> = {
  contract: { icon: FileText, label: "عقود", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  gov_review: { icon: Buildings, label: "مراجعة حكومية", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  hearing: { icon: Gavel, label: "جلسة قضائية", color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  deadline: { icon: Warning, label: "موعد نهائي", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
};

export default function BusinessHearingsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | EventType>("all");

  const cardCls = isDark
    ? "bg-zinc-900 border-white/[0.06]"
    : "bg-white border-slate-200 outline-slate-100/50";

  const textHeading = isDark ? "text-zinc-100" : "text-slate-800";
  const textMuted = isDark ? "text-zinc-400" : "text-slate-500";

  const filtered = EVENTS.filter(e => {
    if (filterType !== "all" && e.type !== filterType) return false;
    if (search && !e.title.includes(search) && !e.department.includes(search)) return false;
    return true;
  });

  const pendingEvents = filtered.filter(e => e.status === "pending");
  const doneEvents = filtered.filter(e => e.status === "done");

  return (
    <SubscriptionGuard featureKey="hearings">
    <div className="max-w-[1200px] mx-auto space-y-6" dir="rtl">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${textHeading}`}>
            مواعيد وجلسات الشركة
          </h1>
          <p className={`text-sm ${textMuted}`}>
            تتبع المواعيد القانونية، تجديد العقود، والتراخيص الخاصة بالشركة.
          </p>
        </div>
        <button className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-bold shadow-md hover:bg-[#0B3D2E]/90 transition-colors">
          <Plus size={16} weight="bold" />
          إضافة موعد جديد
        </button>
      </div>

      {/* ── Controls ── */}
      <div className={`flex flex-col md:flex-row gap-4 p-4 rounded-xl border ${cardCls}`}>
        <div className={`flex-1 flex items-center px-3 py-2 rounded-lg border ${isDark ? "bg-black/20 border-white/10" : "bg-slate-50 border-slate-200"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input
            type="text"
            placeholder="ابحث عن موعد أو قسم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-sm px-2 placeholder:opacity-50"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterType("all")}
            className={`px-4 py-2 rounded-lg text-[13px] font-bold border transition ${filterType === "all" ? "bg-[#0B3D2E] text-[#C8A762] border-[#0B3D2E]" : isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            الكل
          </button>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilterType(key as EventType)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold border transition ${filterType === key ? `${cfg.bg} ${cfg.color} border-${cfg.color.split("-")[1]}-500/50` : isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              <cfg.icon size={14} weight="duotone" />
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Events List ── */}
      <div className="space-y-4">
        {pendingEvents.length > 0 && (
          <div className="space-y-3">
            <h2 className={`text-[15px] font-bold flex items-center gap-2 ${textHeading}`}>
              <Hourglass size={16} className="text-[#C8A762]" weight="duotone" />
              المواعيد القادمة
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {pendingEvents.map((evt) => {
                  const cfg = TYPE_CONFIG[evt.type];
                  return (
                    <motion.div
                      key={evt.id}
                      layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                      className={`relative p-5 rounded-2xl border ${isDark ? `bg-zinc-900 border-white/[0.08]` : `bg-white border-slate-200 shadow-sm`} ${evt.urgency === "urgent" ? (isDark ? "border-red-500/30 ring-1 ring-red-500/20" : "border-red-200 ring-1 ring-red-100") : ""}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2 rounded-lg border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                          <cfg.icon size={18} weight="duotone" />
                        </div>
                        {evt.urgency === "urgent" && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
                            عاجل
                          </span>
                        )}
                      </div>
                      <h3 className={`text-[14px] font-bold mb-1 leading-snug ${textHeading}`}>{evt.title}</h3>
                      <p className={`text-[11px] mb-3 ${textMuted}`}>{cfg.label} · قسم {evt.department}</p>
                      
                      <div className={`flex flex-col gap-1.5 p-3 rounded-xl ${isDark ? "bg-black/20" : "bg-slate-50"}`}>
                        <div className="flex items-center gap-2 text-[12px]">
                          <CalendarCheck size={14} className={cfg.color} />
                          <span className={`font-semibold ${textHeading}`}>{evt.date}</span>
                          <span className={`mx-1 ${textMuted}`}>—</span>
                          <span className={`font-semibold ${textHeading}`}>{evt.time}</span>
                        </div>
                        <div className={`flex items-center gap-2 text-[11px] mt-1 ${textMuted}`}>
                          <MapPin size={14} />
                          <span className="truncate">{evt.location}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {doneEvents.length > 0 && (
          <div className="space-y-3 pt-6">
            <h2 className={`text-[15px] font-bold flex items-center gap-2 ${textHeading} opacity-60`}>
              <CalendarCheck size={16} weight="duotone" />
              المواعيد المنجزة
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-60 grayscale-[0.3]">
              {doneEvents.map((evt) => {
                const cfg = TYPE_CONFIG[evt.type];
                return (
                  <div key={evt.id} className={`relative p-5 rounded-2xl border ${isDark ? `bg-zinc-900 border-white/[0.04]` : `bg-white border-slate-200`}`}>
                    <h3 className={`text-[13px] font-bold mb-1 line-through ${textHeading}`}>{evt.title}</h3>
                    <p className={`text-[11px] ${textMuted}`}>اكتمل في {evt.date}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
    </SubscriptionGuard>
  );
}
