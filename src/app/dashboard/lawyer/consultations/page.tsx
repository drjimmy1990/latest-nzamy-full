"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChatDots, Clock, Plus, MagnifyingGlass, CalendarCheck,
  User, CheckCircle, Scales, ArrowRight, Video,
  Phone, ChatCircle, Sparkle, Buildings, MapPin,
  Microphone, X, CaretDown, NotePencil, FilePdf,
  WhatsappLogo, EnvelopeSimple, HouseSimple, UsersThree,
  Warning, SealCheck, ArrowLeft, Calendar, ClockCountdown,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { getWorkflowRequestsByReceiver } from "@/lib/services/workflowService";
import type { WorkflowRequest } from "@/lib/workflowStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConsultStatus = "upcoming" | "completed" | "cancelled" | "inProgress";
type ConsultMode   = "video" | "phone" | "chat" | "inPerson";
type BookingStep   = "type" | "mode" | "datetime" | "confirm";

interface Consultation {
  id:          string;
  client:      string;
  clientType:  "individual" | "company";
  topic:       string;
  date:        string;
  time:        string;
  mode:        ConsultMode;
  status:      ConsultStatus;
  notes?:      string;
  isPaid:      boolean;
  fee:         number;
  caseId?:     string;
  duration:    number; // minutes
  aiSummary?:  string;
}

// ─── UI Config ─────────────────────────────────────────────────────────────────

const MODE_ICONS = { video: Video, phone: Phone, chat: ChatCircle, inPerson: HouseSimple };
const MODE_LABELS = { video: "فيديو", phone: "هاتف", chat: "دردشة", inPerson: "حضوري" };
const MODE_COLORS = { video: "text-blue-500 bg-blue-500/10", phone: "text-emerald-500 bg-emerald-500/10", chat: "text-violet-500 bg-violet-500/10", inPerson: "text-amber-500 bg-amber-500/10" };

const STATUS_CONFIG: Record<ConsultStatus, { label: string; color: string }> = {
  upcoming:   { label: "قادمة",      color: "text-royal bg-royal/10 border-royal/20" },
  completed:  { label: "مكتملة",    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  cancelled:  { label: "ملغية",     color: "text-slate-400 bg-slate-100 border-slate-200" },
  inProgress: { label: "جارية الآن", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
};

// ─── Booking Modal ─────────────────────────────────────────────────────────────

function workflowModeToConsultMode(mode: unknown): ConsultMode {
  if (mode === "in-person") return "inPerson";
  if (mode === "text") return "chat";
  if (mode === "phone") return "phone";
  return "video";
}

function workflowToConsultation(request: WorkflowRequest): Consultation {
  return {
    id: request.id,
    client: request.requester.name || "عميل نظامي",
    clientType: request.requester.role === "corporate" || request.requester.role === "micro" ? "company" : "individual",
    topic: request.title,
    date: String(request.metadata?.day ?? "بانتظار التأكيد"),
    time: String(request.metadata?.time ?? "بانتظار التأكيد"),
    mode: workflowModeToConsultMode(request.metadata?.mode),
    status: request.status === "cancelled" ? "cancelled" : request.status === "completed" ? "completed" : "upcoming",
    isPaid: request.payment.status !== "pending",
    fee: request.payment.amount,
    duration: request.metadata?.mode === "text" ? 30 : 60,
    notes: request.description,
  };
}

const CONSULT_TYPES = [
  { id: "legal-opinion",  label: "رأي قانوني",          icon: Scales },
  { id: "contract",       label: "مراجعة عقد",           icon: NotePencil },
  { id: "case-followup",  label: "متابعة قضية",          icon: Scales },
  { id: "company",        label: "استشارة تأسيس شركة",   icon: Buildings },
  { id: "general",        label: "استشارة عامة",          icon: ChatDots },
];

const DURATIONS = [30, 45, 60, 90, 120];

function BookingModal({ isDark, onClose }: { isDark: boolean; onClose: () => void }) {
  const [step, setStep] = useState<BookingStep>("type");
  const [consultType, setConsultType] = useState("");
  const [mode, setMode] = useState<ConsultMode | "">("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-800"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const steps: BookingStep[] = ["type", "mode", "datetime", "confirm"];
  const stepIdx = steps.indexOf(step);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <motion.div initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
        className={`w-full max-w-md ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-100 shadow-2xl"} rounded-3xl overflow-hidden`}>
        {/* Modal header */}
        <div className={`flex items-center gap-3 px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="w-8 h-8 rounded-xl bg-[#0B3D2E] flex items-center justify-center flex-shrink-0">
            <CalendarCheck size={15} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div className="flex-1">
            <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>جدولة استشارة جديدة</p>
            <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              الخطوة {stepIdx + 1} من {steps.length}
            </p>
          </div>
          <button onClick={onClose} className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? "hover:bg-zinc-800" : "hover:bg-slate-100"}`}>
            <X size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          </button>
        </div>

        {/* Progress bar */}
        <div className={`h-1 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
          <motion.div animate={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }}
            className="h-full bg-[#0B3D2E]" transition={{ duration: 0.4 }} />
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* Step 1: Type */}
            {step === "type" && (
              <motion.div key="type" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>نوع الاستشارة</p>
                <div className="space-y-2">
                  {CONSULT_TYPES.map(ct => {
                    const Icon = ct.icon;
                    return (
                      <button key={ct.id} onClick={() => setConsultType(ct.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-start transition-all ${
                          consultType === ct.id
                            ? isDark ? "border-[#0B3D2E]/60 bg-[#0B3D2E]/15" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5"
                            : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-slate-200 hover:border-slate-300"
                        }`}>
                        <Icon size={18} weight="duotone" className={consultType === ct.id ? "text-[#0B3D2E]" : isDark ? "text-zinc-500" : "text-slate-400"} />
                        <span className={`text-[13px] font-semibold ${consultType === ct.id ? isDark ? "text-zinc-100" : "text-slate-800" : isDark ? "text-zinc-400" : "text-slate-600"}`}>{ct.label}</span>
                        {consultType === ct.id && <CheckCircle size={14} weight="fill" className="text-[#0B3D2E] ms-auto" />}
                      </button>
                    );
                  })}
                </div>
                <div>
                  <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>اسم العميل</label>
                  <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="اسم العميل أو الجهة..."
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`} />
                </div>
              </motion.div>
            )}

            {/* Step 2: Mode */}
            {step === "mode" && (
              <motion.div key="mode" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>طريقة الاستشارة</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["video", "phone", "chat", "inPerson"] as ConsultMode[]).map(m => {
                    const Icon = MODE_ICONS[m];
                    const colors = MODE_COLORS[m];
                    return (
                      <button key={m} onClick={() => setMode(m)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                          mode === m
                            ? isDark ? "border-[#0B3D2E]/60 bg-[#0B3D2E]/15" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5"
                            : isDark ? "border-white/[0.06]" : "border-slate-200"
                        }`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode === m ? "bg-[#0B3D2E]" : colors.split(" ")[1]}`}>
                          <Icon size={18} weight="duotone" className={mode === m ? "text-white" : colors.split(" ")[0]} />
                        </div>
                        <span className={`text-[12px] font-bold ${mode === m ? isDark ? "text-zinc-100" : "text-slate-800" : isDark ? "text-zinc-400" : "text-slate-500"}`}>
                          {MODE_LABELS[m]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <p className={`text-[11px] font-bold mb-2 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>مدة الاستشارة</p>
                  <div className="flex gap-2">
                    {DURATIONS.map(d => (
                      <button key={d} onClick={() => setDuration(d)}
                        className={`flex-1 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                          duration === d
                            ? "bg-[#0B3D2E] text-white border-[#0B3D2E]"
                            : isDark ? "border-white/[0.07] text-zinc-500" : "border-slate-200 text-slate-500"
                        }`}>
                        {d}د
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Date & Time */}
            {step === "datetime" && (
              <motion.div key="datetime" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الموعد</p>
                <div className="space-y-3">
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>التاريخ</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
                  </div>
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>الوقت</label>
                    <input type="time" value={time} onChange={e => setTime(e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"}`} />
                  </div>
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>ملاحظات (اختياري)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                      placeholder="تفاصيل إضافية عن موضوع الاستشارة..."
                      className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none resize-none ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`} />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 4: Confirm */}
            {step === "confirm" && (
              <motion.div key="confirm" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>تأكيد الاستشارة</p>
                <div className={`${isDark ? "bg-zinc-800 border border-white/[0.06]" : "bg-slate-50 border border-slate-100"} rounded-2xl p-4 space-y-3`}>
                  {[
                    { label: "العميل",   value: clientName || "غير محدد" },
                    { label: "النوع",    value: CONSULT_TYPES.find(t => t.id === consultType)?.label ?? "—" },
                    { label: "الوسيلة", value: mode ? MODE_LABELS[mode] : "—" },
                    { label: "المدة",    value: `${duration} دقيقة` },
                    { label: "التاريخ",  value: date || "—" },
                    { label: "الوقت",    value: time || "—" },
                  ].map(row => (
                    <div key={row.label} className={`flex justify-between text-[12px] pb-2 border-b last:border-0 last:pb-0 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                      <span className={isDark ? "text-zinc-500" : "text-slate-400"}>{row.label}</span>
                      <span className={`font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className={`flex items-start gap-2 p-3 rounded-xl ${isDark ? "bg-[#C8A762]/5 border border-[#C8A762]/20" : "bg-amber-50 border border-amber-200"}`}>
                  <Sparkle size={12} weight="fill" className="text-[#C8A762] flex-shrink-0 mt-0.5" />
                  <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-amber-800"}`}>
                    بعد انتهاء الجلسة يمكنك توليد ملخص AI وإرساله للعميل تلقائياً
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={`flex items-center gap-3 px-5 py-4 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          {stepIdx > 0 && (
            <button onClick={() => setStep(steps[stepIdx - 1])}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-[12px] font-semibold ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
              <ArrowLeft size={13} /> السابق
            </button>
          )}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (stepIdx < steps.length - 1) setStep(steps[stepIdx + 1]);
              else onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[13px] font-bold text-[#C8A762]">
            {step === "confirm" ? <><CheckCircle size={15} weight="fill" /> تأكيد الجدولة</> : <>التالي <ArrowRight size={13} /></>}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Consultation Card ─────────────────────────────────────────────────────────

function ConsultCard({ c, isDark, card }: { c: Consultation; isDark: boolean; card: string }) {
  const [expanded, setExpanded] = useState(false);
  const ModeIcon = MODE_ICONS[c.mode];
  const sc = STATUS_CONFIG[c.status];
  const modeColors = MODE_COLORS[c.mode].split(" ");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className={`${card} overflow-hidden transition-all hover:border-royal/20`}>
        {/* In-progress pulse bar */}
        {c.status === "inProgress" && (
          <div className="h-0.5 w-full bg-amber-500/20">
            <motion.div animate={{ x: ["-100%", "100%"] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="h-full w-1/3 bg-amber-500" />
          </div>
        )}
        <div className="p-4 flex items-center gap-4">
          {/* Icon */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            c.status === "inProgress" ? "bg-amber-500/10" : isDark ? "bg-white/[0.04]" : "bg-slate-50"
          }`}>
            <ModeIcon size={18} weight="duotone" className={
              c.status === "upcoming" ? "text-royal" :
              c.status === "inProgress" ? "text-amber-500" :
              c.status === "completed" ? "text-emerald-500" :
              isDark ? "text-zinc-500" : "text-slate-400"
            } />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.client}</p>
              {c.clientType === "company" && (
                <Buildings size={11} className={isDark ? "text-zinc-600" : "text-slate-400"} />
              )}
              <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.color}`}>{sc.label}</span>
            </div>
            <div className={`flex items-center gap-2 flex-wrap text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <span>{c.topic}</span>
              <span className="w-1 h-1 rounded-full bg-current opacity-40" />
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] flex items-center gap-1 ${modeColors[1]} ${modeColors[0]}`}>
                <ModeIcon size={9} /> {MODE_LABELS[c.mode]}
              </span>
              <span className="w-1 h-1 rounded-full bg-current opacity-40" />
              <span>{c.duration} د</span>
            </div>
            {c.caseId && (
              <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>⚖️ {c.caseId}</p>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-left">
              <p className={`text-[13px] font-bold font-mono ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{c.time}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{c.date}</p>
            </div>
            {c.status === "upcoming" && (
              <button className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-royal text-white text-[11px] font-bold hover:bg-royal/90 transition-colors">
                <Video size={12} /> بدء
              </button>
            )}
            {c.status === "inProgress" && (
              <motion.button animate={{ boxShadow: ["0 0 0 0 rgba(245,158,11,0)", "0 0 0 6px rgba(245,158,11,0)"] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-[11px] font-bold">
                <Video size={12} /> دخول
              </motion.button>
            )}
            {(c.status === "completed" || c.notes || c.aiSummary) && (
              <button onClick={() => setExpanded(!expanded)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center border ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
                <CaretDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        </div>

        {/* Expanded: notes + AI summary */}
        <AnimatePresence>
          {expanded && (c.notes || c.aiSummary) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className={`px-4 pb-4 pt-0 space-y-3 border-t ${isDark ? "border-white/[0.04]" : "border-slate-50"}`}>
                {c.notes && (
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wide mb-1.5 mt-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>ملاحظات المحامي</p>
                    <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{c.notes}</p>
                  </div>
                )}
                {c.aiSummary && (
                  <div className={`rounded-xl border p-3 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sparkle size={12} weight="fill" className="text-[#C8A762]" />
                      <p className={`text-[10px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>ملخص AI للاستشارة</p>
                    </div>
                    <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-amber-900"}`}>{c.aiSummary}</p>
                    <div className="flex gap-2 mt-2.5">
                      <button className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border ${isDark ? "border-[#C8A762]/20 text-[#C8A762]" : "border-amber-300 text-amber-700"}`}>
                        <WhatsappLogo size={11} weight="fill" /> إرسال للعميل
                      </button>
                      <button className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                        <FilePdf size={11} /> تصدير PDF
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConsultationsPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<ConsultStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showBooking, setShowBooking] = useState(false);
  const [consults, setConsults] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  useEffect(() => {
    const syncConsultations = async () => {
      try {
        const requests = await getWorkflowRequestsByReceiver("lawyer");
        const workflowConsults = requests
          .filter(request => request.type === "consultation")
          .map(workflowToConsultation);
        setConsults(workflowConsults);
      } catch {
        setConsults([]);
      } finally {
        setLoading(false);
      }
    };

    syncConsultations();
    window.addEventListener("nzamy-workflow-updated", () => syncConsultations());
    return () => window.removeEventListener("nzamy-workflow-updated", () => {});
  }, []);

  const filtered = consults.filter(c => {
    const matchStatus = filter === "all" || c.status === filter;
    const matchSearch = !search || c.client.includes(search) || c.topic.includes(search);
    return matchStatus && matchSearch;
  });

  const upcoming   = consults.filter(c => c.status === "upcoming");
  const inProgress = consults.filter(c => c.status === "inProgress");
  const totalFees  = consults.reduce((s, c) => s + c.fee, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-5" dir="rtl">

      {/* Booking modal */}
      <AnimatePresence>
        {showBooking && <BookingModal isDark={isDark} onClose={() => setShowBooking(false)} />}
      </AnimatePresence>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
            الاستشارات
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {upcoming.length} قادمة · {inProgress.length} جارية الآن · إجمالي: {totalFees.toLocaleString()} ﷼
          </p>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => setShowBooking(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
          <Plus size={15} weight="bold" /> جدولة استشارة
        </motion.button>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "قادمة",       value: upcoming.length,   color: "text-royal",       bg: "bg-royal/10",       icon: CalendarCheck },
          { label: "جارية الآن",  value: inProgress.length, color: "text-amber-500",   bg: "bg-amber-500/10",   icon: ClockCountdown },
          { label: "مكتملة",      value: consults.filter(c => c.status === "completed").length, color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle },
          { label: "إجمالي الأتعاب", value: `${totalFees.toLocaleString()}﷼`, color: "text-[#C8A762]", bg: "bg-[#C8A762]/10", icon: Scales },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${card} p-4 flex items-center gap-3`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${k.bg}`}>
                <Icon size={17} weight="duotone" className={k.color} />
              </div>
              <div>
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{k.label}</p>
                <p className={`text-[16px] font-bold font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{k.value}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* In-progress highlight */}
      {inProgress.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`${card} p-4 border-amber-500/30 bg-amber-500/[0.04]`}>
          <div className="flex items-center gap-2 mb-3">
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <div className="w-2 h-2 rounded-full bg-amber-500" />
            </motion.div>
            <p className={`text-[11px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>جلسة جارية الآن</p>
          </div>
          {inProgress.map(c => (
            <div key={c.id} className="flex items-center gap-3">
              <div className="flex-1">
                <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.client}</p>
                <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{c.topic} · {MODE_LABELS[c.mode]}</p>
              </div>
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-[12px] font-bold">
                <Video size={13} /> انضم للجلسة
              </button>
            </div>
          ))}
        </motion.div>
      )}

      {/* Next upcoming */}
      {upcoming.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className={`${card} p-5 border-royal/20 bg-royal/[0.03]`}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck size={15} weight="duotone" className="text-royal" />
            <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الاستشارة القادمة</p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-royal/10" : "bg-royal/5"}`}>
              {upcoming[0].clientType === "company"
                ? <Buildings size={22} weight="duotone" className="text-royal" />
                : <User size={22} weight="duotone" className="text-royal" />}
            </div>
            <div className="flex-1">
              <p className={`text-[15px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{upcoming[0].client}</p>
              <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {upcoming[0].topic} · {MODE_LABELS[upcoming[0].mode]} · {upcoming[0].duration}د
              </p>
            </div>
            <div className="text-left flex-shrink-0">
              <p className="text-[14px] font-bold font-mono text-royal">{upcoming[0].time}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{upcoming[0].date}</p>
            </div>
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-royal text-white text-xs font-bold hover:bg-royal/90 transition-colors flex-shrink-0">
              <Video size={13} /> بدء
            </button>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className="flex gap-1.5">
          {(["all", "upcoming", "inProgress", "completed", "cancelled"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-xl border text-[11px] font-semibold flex-shrink-0 transition-all ${filter === s ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20"}`}>
              {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode breakdown */}
      <div className={`${card} p-4`}>
        <p className={`text-[10px] font-bold uppercase tracking-wide mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>توزيع الاستشارات حسب الوسيلة</p>
        <div className="grid grid-cols-4 gap-2">
          {(["video", "phone", "chat", "inPerson"] as ConsultMode[]).map(m => {
            const count = consults.filter(c => c.mode === m).length;
            const Icon = MODE_ICONS[m];
            const colors = MODE_COLORS[m].split(" ");
            return (
              <div key={m} className={`flex flex-col items-center gap-1.5 py-3 rounded-xl ${colors[1]}`}>
                <Icon size={18} weight="duotone" className={colors[0]} />
                <p className={`text-[16px] font-black ${colors[0]}`}>{count}</p>
                <p className={`text-[9px] font-bold ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{MODE_LABELS[m]}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map(c => (
          <ConsultCard key={c.id} c={c} isDark={isDark} card={card} />
        ))}
        {filtered.length === 0 && (
          <div className={`${card} p-8 text-center`}>
            <CalendarCheck size={28} weight="duotone" className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد استشارات مطابقة</p>
          </div>
        )}
      </div>

      {/* AI tip */}
      <div className={`p-4 rounded-2xl border flex gap-3 items-center ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
        <Sparkle size={15} weight="fill" className="text-[#C8A762] flex-shrink-0" />
        <p className={`text-[12px] flex-1 ${isDark ? "text-zinc-400" : "text-amber-700"}`}>
          يمكن للمستشار AI توليد ملخص كامل للجلسة وإرساله للعميل مباشرةً بعد الانتهاء.
        </p>
        <Link href="/ai/legal-opinion" className="flex-shrink-0 text-[12px] font-bold text-[#C8A762] hover:underline flex items-center gap-1">
          المستشار AI <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
