"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  CaretLeft, CaretRight, Clock, CheckCircle, X, CalendarBlank,
  VideoCamera, Phone, ChatText, MapPin, ArrowCounterClockwise,
} from "@phosphor-icons/react";

// ── Mock data ──────────────────────────────────────────────────────────────────

type ConsultationType = "video" | "voice" | "text" | "inperson";

interface Booking {
  id: number;
  client: string;
  clientInitial: string;
  type: ConsultationType;
  time: string;
  date: string;
  duration: number;
  status: "confirmed" | "pending" | "done" | "cancelled";
  topic: string;
  fee: number;
}

const MOCK_BOOKINGS: Booking[] = [
  { id: 1, client: "محمد الحارثي", clientInitial: "م", type: "video", time: "09:00", date: "2026-04-06", duration: 60, status: "confirmed", topic: "نزاع عقاري مع شريك تجاري", fee: 299 },
  { id: 2, client: "سارة المطيري", clientInitial: "س", type: "voice", time: "11:30", date: "2026-04-06", duration: 30, status: "pending", topic: "مراجعة عقد عمل جديد", fee: 149 },
  { id: 3, client: "عبدالله الزهراني", clientInitial: "ع", type: "text", time: "14:00", date: "2026-04-07", duration: 45, status: "confirmed", topic: "استشارة حول التحكيم التجاري", fee: 199 },
  { id: 4, client: "نوف القرني", clientInitial: "ن", type: "video", time: "10:00", date: "2026-04-08", duration: 60, status: "confirmed", topic: "قضية عمالية ضد الشركة", fee: 299 },
  { id: 5, client: "خالد العتيبي", clientInitial: "خ", type: "inperson", time: "16:00", date: "2026-04-09", duration: 90, status: "pending", topic: "إعداد عقد شراكة استراتيجية", fee: 549 },
  { id: 6, client: "ريم السلمي", clientInitial: "ر", type: "voice", time: "09:30", date: "2026-04-10", duration: 30, status: "confirmed", topic: "مشكلة مع مقاول البناء", fee: 149 },
];

const TYPE_CONFIG: Record<ConsultationType, { icon: React.ElementType; label: string; color: string }> = {
  video: { icon: VideoCamera, label: "فيديو", color: "text-blue-500" },
  voice: { icon: Phone, label: "صوتية", color: "text-emerald-500" },
  text: { icon: ChatText, label: "نصية", color: "text-amber-500" },
  inperson: { icon: MapPin, label: "حضورية", color: "text-rose-500" },
};

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-zinc-500",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_AR: Record<string, string> = {
  confirmed: "مؤكد",
  pending: "بانتظار الموافقة",
  done: "منتهي",
  cancelled: "ملغى",
};

// ── Week helpers ───────────────────────────────────────────────────────────────

const WEEK_START = new Date("2026-04-05"); // Sunday

function getWeekDates(offset: number) {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(WEEK_START);
    d.setDate(d.getDate() + offset * 5 + i);
    return d;
  });
}

const DAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProviderCalendarPage() {
  const { isDark } = useTheme();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [view, setView] = useState<"week" | "list">("week");

  const weekDates = getWeekDates(weekOffset);

  const surface = isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white";

  const bookingsForDate = (date: Date) =>
    MOCK_BOOKINGS.filter(b => b.date === date.toISOString().split("T")[0]);

  const allBookings = MOCK_BOOKINGS.filter(b => b.status !== "cancelled");
  const todayEarnings = allBookings.filter(b => b.date === "2026-04-06").reduce((s, b) => s + b.fee, 0);
  const weekEarnings = allBookings.reduce((s, b) => s + b.fee, 0);

  return (
    <main className={`min-h-screen py-8 px-4 ${isDark ? "bg-zinc-950" : "bg-zinc-50/50"}`}>
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className={`font-brand text-2xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                جدول المواعيد
              </h1>
              <p className={`mt-0.5 text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {allBookings.length} موعد هذا الأسبوع
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex rounded-xl border p-1 ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
                {(["week", "list"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                      view === v
                        ? "bg-[#0B3D2E] text-white"
                        : isDark ? "text-zinc-400" : "text-zinc-500"
                    }`}
                  >
                    {v === "week" ? "أسبوعي" : "قائمة"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "إيرادات اليوم", value: `${todayEarnings} ر.س`, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "إيرادات الأسبوع", value: `${weekEarnings} ر.س`, color: "text-[#C8A762]" },
              { label: "مواعيد معلّقة", value: allBookings.filter(b => b.status === "pending").length.toString(), color: "text-amber-500" },
            ].map(stat => (
              <div key={stat.label} className={`rounded-2xl border p-4 ${surface}`}>
                <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{stat.label}</p>
                <p className={`mt-1 text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Week navigation */}
          <div className={`mb-3 flex items-center justify-between rounded-2xl border px-4 py-3 ${surface}`}>
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className={`flex items-center gap-1.5 text-sm font-medium ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"}`}
            >
              <CaretRight size={14} />
              الأسبوع السابق
            </button>
            <span className={`text-sm font-semibold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
              {weekDates[0].toLocaleDateString("ar-SA", { month: "long", day: "numeric" })} — {weekDates[4].toLocaleDateString("ar-SA", { month: "long", day: "numeric", year: "numeric" })}
            </span>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className={`flex items-center gap-1.5 text-sm font-medium ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"}`}
            >
              الأسبوع التالي
              <CaretLeft size={14} />
            </button>
          </div>

          {view === "week" && (
            <div className={`grid grid-cols-5 divide-x rounded-2xl border overflow-hidden ${isDark ? "border-white/[0.06] divide-white/[0.04]" : "border-slate-200 divide-slate-100"}`}>
              {weekDates.map((date, i) => {
                const bookings = bookingsForDate(date);
                const isToday = date.toDateString() === new Date("2026-04-06").toDateString();
                return (
                  <div key={i} className={`min-h-[200px] ${isDark ? "bg-zinc-900" : "bg-white"}`}>
                    {/* Day header */}
                    <div className={`border-b px-2 py-2.5 text-center ${isDark ? "border-white/[0.04]" : "border-slate-100"} ${isToday ? (isDark ? "bg-[#0B3D2E]/20" : "bg-[#0B3D2E]/5") : ""}`}>
                      <p className={`text-[10px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{DAY_AR[i]}</p>
                      <p className={`text-base font-bold ${isToday ? "text-[#0B3D2E] dark:text-[#C8A762]" : (isDark ? "text-zinc-200" : "text-zinc-700")}`}>
                        {date.getDate()}
                      </p>
                    </div>
                    {/* Bookings */}
                    <div className="space-y-1.5 p-2">
                      {bookings.map(b => {
                        const tc = TYPE_CONFIG[b.type];
                        const Icon = tc.icon;
                        return (
                          <motion.button
                            key={b.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelected(b)}
                            className={`w-full rounded-lg p-2 text-start border transition-colors ${
                              b.status === "pending"
                                ? isDark ? "border-amber-700/30 bg-amber-950/30" : "border-amber-200 bg-amber-50"
                                : isDark ? "border-white/[0.05] bg-zinc-800/60" : "border-slate-100 bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-1">
                              <Icon size={10} className={tc.color} />
                              <span className={`text-[10px] font-bold font-mono ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{b.time}</span>
                            </div>
                            <p className={`mt-0.5 text-[10px] truncate ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{b.client}</p>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === "list" && (
            <div className="space-y-2.5">
              {MOCK_BOOKINGS.map(b => {
                const tc = TYPE_CONFIG[b.type];
                const Icon = tc.icon;
                return (
                  <motion.div
                    key={b.id}
                    whileHover={{ x: -3 }}
                    className={`flex items-center gap-4 rounded-2xl border px-5 py-4 cursor-pointer ${surface}`}
                    onClick={() => setSelected(b)}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-zinc-500"}`}>
                      {b.clientInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold truncate ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{b.client}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[b.status]}`}>{STATUS_AR[b.status]}</span>
                      </div>
                      <p className={`text-xs truncate ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{b.topic}</p>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="flex items-center gap-1 justify-end">
                        <Icon size={12} className={tc.color} />
                        <span className={`text-xs font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{b.time}</span>
                      </div>
                      <p className={`mt-0.5 text-xs font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{b.fee} ر.س</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Detail panel */}
          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
                onClick={() => setSelected(null)}
              >
                <motion.div
                  initial={{ y: 60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 60, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 25 }}
                  onClick={e => e.stopPropagation()}
                  className={`w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] border p-6 ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white"}`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className={`font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>تفاصيل الموعد</h3>
                    <button onClick={() => setSelected(null)}>
                      <X size={18} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: "العميل", value: selected.client },
                      { label: "الموضوع", value: selected.topic },
                      { label: "النوع", value: TYPE_CONFIG[selected.type].label },
                      { label: "الوقت", value: `${selected.time} — ${selected.duration} دقيقة` },
                      { label: "الرسوم", value: `${selected.fee} ر.س` },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between text-sm">
                        <span className={isDark ? "text-zinc-500" : "text-zinc-400"}>{r.label}</span>
                        <span className={`font-medium ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{r.value}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm">
                      <span className={isDark ? "text-zinc-500" : "text-zinc-400"}>الحالة</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[selected.status]}`}>{STATUS_AR[selected.status]}</span>
                    </div>
                  </div>
                  {selected.status === "pending" && (
                    <div className="mt-5 flex gap-2">
                      <button className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white">قبول الموعد</button>
                      <button className={`flex-1 rounded-xl border py-2.5 text-sm font-medium ${isDark ? "border-white/10 text-zinc-400" : "border-slate-200 text-zinc-500"}`}>
                        اقتراح موعد بديل
                      </button>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
    </main>
  );
}
