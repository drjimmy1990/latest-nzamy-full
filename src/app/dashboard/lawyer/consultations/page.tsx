"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChatDots, Plus, MagnifyingGlass, CalendarCheck,
  User, CheckCircle, ArrowRight, Video,
  Phone, ChatCircle, Sparkle, Buildings,
  X, CaretDown, NotePencil, ArrowClockwise,
  HouseSimple, Scales,
  Warning, ArrowLeft,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { createWorkflowId } from "@/lib/workflowStore";
import type { WorkflowRequest } from "@/lib/workflowStore";

/** Matches CLIENT_REQUESTS_FETCH_LIMIT in src/lib/clientWorkflowRepository.ts,
 *  which exists because every client list was silently capped at the 20 newest
 *  rows. This lawyer-side call site was never updated: it asked for the 20
 *  newest receiver="lawyer" rows and only then filtered to type="consultation",
 *  so a lawyer who had added twenty clients saw zero consultations. */
const LAWYER_REQUESTS_FETCH_LIMIT = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

// No "inProgress": nothing sets it. `service_requests.status` has no in-session
// value and workflowToConsultation below can only ever produce upcoming /
// completed / cancelled, so a «جارية الآن» bucket could only ever read 0.
type ConsultStatus = "upcoming" | "completed" | "cancelled";
type ConsultMode   = "video" | "phone" | "chat" | "inPerson";
type BookingStep   = "type" | "mode" | "datetime" | "confirm";

interface Consultation {
  id:          string;
  client:      string;
  clientType:  "individual" | "company";
  topic:       string;
  /** "" when the booking carries no date/time — the UI omits the line. */
  date:        string;
  time:        string;
  mode:        ConsultMode;
  status:      ConsultStatus;
  notes?:      string;
  /** Minutes, or null when the stored booking has no duration on it. */
  duration:    number | null;
}

// ─── UI Config ─────────────────────────────────────────────────────────────────

const MODE_ICONS = { video: Video, phone: Phone, chat: ChatCircle, inPerson: HouseSimple };
const MODE_LABELS = { video: "فيديو", phone: "هاتف", chat: "دردشة", inPerson: "حضوري" };
const MODE_COLORS = { video: "text-blue-500 bg-blue-500/10", phone: "text-emerald-500 bg-emerald-500/10", chat: "text-violet-500 bg-violet-500/10", inPerson: "text-amber-500 bg-amber-500/10" };

const STATUS_CONFIG: Record<ConsultStatus, { label: string; color: string }> = {
  upcoming:   { label: "قادمة",      color: "text-royal bg-royal/10 border-royal/20" },
  completed:  { label: "مكتملة",    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  cancelled:  { label: "ملغية",     color: "text-slate-400 bg-slate-100 border-slate-200" },
};

// ─── Booking Modal ─────────────────────────────────────────────────────────────

function workflowModeToConsultMode(mode: unknown): ConsultMode {
  if (mode === "in-person") return "inPerson";
  if (mode === "text") return "chat";
  if (mode === "phone") return "phone";
  return "video";
}

// Reverse mapping: UI ConsultMode → workflow metadata mode string.
function consultModeToWorkflowMode(mode: ConsultMode): string {
  if (mode === "inPerson") return "in-person";
  if (mode === "chat") return "text";
  return mode; // "phone" | "video"
}

/** metadata values are unvalidated jsonb — read them, never substitute. */
function metaString(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function workflowToConsultation(request: WorkflowRequest): Consultation {
  const rawDuration = request.metadata?.duration;
  return {
    id: request.id,
    client: request.requester.name || "عميل نظامي",
    clientType: request.requester.role === "corporate" || request.requester.role === "micro" ? "company" : "individual",
    topic: request.title,
    // "" when the booking has no date/time on it. The old code passed the raw
    // value through String(), so an empty-string date rendered as an empty
    // slot rather than reaching the «بانتظار التأكيد» fallback beside it.
    date: metaString(request.metadata?.day),
    time: metaString(request.metadata?.time),
    mode: workflowModeToConsultMode(request.metadata?.mode),
    status: request.status === "cancelled" ? "cancelled" : request.status === "completed" ? "completed" : "upcoming",
    // The stored duration, not a guess. This used to be
    // `metadata?.mode === "text" ? 30 : 60`, which printed «٦٠ د» on the card
    // for a booking the lawyer had explicitly set to 90 or 120 minutes.
    duration: typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration > 0
      ? rawDuration
      : null,
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

function BookingModal({ isDark, onClose, lawyerUserId }: { isDark: boolean; onClose: () => void; lawyerUserId?: string }) {
  const [step, setStep] = useState<BookingStep>("type");
  const [consultType, setConsultType] = useState("");
  const [mode, setMode] = useState<ConsultMode | "">("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps: BookingStep[] = ["type", "mode", "datetime", "confirm"];
  const stepIdx = steps.indexOf(step);

  // L10: persist the consultation as a service_request on confirm.
  //
  // Two things were wrong here and both are fixed by going straight to the API.
  //
  // 1. FALSE SUCCESS. This used to call createWorkflowRequest(), whose catch is
  //    `return saveLocal(input)` — a failed POST was swallowed, a row was
  //    written to localStorage["nzamy_workflow_requests_v1"], and a fully-formed
  //    object came back, so this function took the success path, fired the
  //    refresh and closed the modal. The red «تعذّر تأكيد الاستشارة» banner
  //    below could not fire for any server failure, and the refresh it
  //    triggered re-read the API, which knew nothing of the local row. The
  //    lawyer got a closed modal and no appointment. apiMutate throws on any
  //    non-2xx, so the banner is now reachable and nothing is written locally.
  //
  // 2. LEAKED TO EVERY OTHER LAWYER. The row went in with no `assignedTo`, so
  //    `assigned_to` was NULL. The SELECT policy on service_requests
  //    (supabase/migrations/20260815_marketplace_excludes_ai_workspace.sql:45-54)
  //    grants EVERY verified lawyer read access to any row that is
  //    `assigned_to IS NULL AND status IN ('pending','pending_assignment') AND
  //    receiver <> 'ai_workspace'` — which is exactly the shape this booking
  //    created. This list queries receiver="lawyer" + type="consultation" with
  //    no ownership filter of its own, so another lawyer's consultations page
  //    would render this one's client name, topic and notes. Setting
  //    `assignedTo` to the booking lawyer takes the row out of that clause and
  //    leaves it readable through `assigned_to = auth.uid()` (and through
  //    `requester_user_id = auth.uid()`, which the route sets from the session).
  //    This also matches how the rest of the lawyer workspace writes its rows
  //    — see AddCaseModal.tsx and AddHearingModal.tsx.
  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const consultLabel = CONSULT_TYPES.find((t) => t.id === consultType)?.label ?? consultType;
      const payload = {
        id: createWorkflowId(),
        type: "consultation",
        title: consultLabel || "استشارة قانونية",
        description: notes || "",
        receiver: "lawyer",
        status: "pending_assignment",
        requester: { name: clientName || "عميل", role: "individual", tier: "free" },
        payment: { amount: 0, status: "not_required" },
        sourcePath: "",
        assignedTo: lawyerUserId ?? null,
        metadata: {
          day: date,
          time,
          mode: mode ? consultModeToWorkflowMode(mode) : "video",
          duration,
        },
      };

      if (!isSupabaseMode) {
        // Demo build has no API routes. Module-level constant, so this branch is
        // eliminated from the production bundle the six lawyer accounts use.
        throw new Error("جدولة الاستشارات غير متاحة في هذا الوضع.");
      }
      if (!lawyerUserId) {
        // Refuse rather than write an unassigned row: see (2) above. An
        // unresolved session here is rare (the button is deep in a modal), but
        // the consequence of guessing is another lawyer reading this booking.
        throw new Error("تعذّر التحقق من الجلسة. أعد تحميل الصفحة ثم حاول مرة أخرى.");
      }

      await apiMutate<{ data: unknown }>("/api/v1/service-requests", "POST", payload);
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
      setSubmitting(false);
      onClose();
    } catch (e: any) {
      console.error("[consultations] booking confirm failed:", e);
      setError(e?.message || "تعذّر تأكيد الاستشارة. حاول مرة أخرى.");
      setSubmitting(false);
    }
  };

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
            disabled={submitting}
            onClick={() => {
              if (stepIdx < steps.length - 1) setStep(steps[stepIdx + 1]);
              else handleConfirm();
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[13px] font-bold text-[#C8A762] disabled:opacity-60">
            {step === "confirm" ? <><CheckCircle size={15} weight="fill" /> {submitting ? "جارٍ التأكيد..." : "تأكيد الجدولة"}</> : <>التالي <ArrowRight size={13} /></>}
          </motion.button>
        </div>

        {/* Error banner */}
        {error && (
          <div className={`mx-5 mb-4 p-3 rounded-xl flex items-center gap-2 text-[11px] font-semibold ${isDark ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
            <Warning size={14} weight="fill" className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
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
        <div className="p-4 flex items-center gap-4">
          {/* Icon */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
            <ModeIcon size={18} weight="duotone" className={
              c.status === "upcoming" ? "text-royal" :
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
              {c.duration !== null && (
                <>
                  <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                  <span>{c.duration} د</span>
                </>
              )}
            </div>
            {/* `caseId` was rendered here as «⚖️ {c.caseId}». Nothing ever set
                it — there is no case link on a consultation row — so the line
                could not appear. Removed rather than left as a slot waiting for
                a field that has no writer. */}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-left">
              {c.time
                ? <p className={`text-[13px] font-bold font-mono ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{c.time}</p>
                : <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>بانتظار التأكيد</p>}
              {c.date && <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{c.date}</p>}
            </div>
            {/* The «بدء» / «دخول» video buttons that used to sit here had no
                onClick, and nothing to give one: `grep -rn
                "meetingUrl|meeting_url|jitsi|zoom.us|daily.co|whereby" src`
                returns nothing. There is no meeting infrastructure in this
                product, so the buttons are removed rather than wired to a
                placeholder. */}
            {(c.status === "completed" || c.notes) && (
              <button onClick={() => setExpanded(!expanded)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center border ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
                <CaretDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        </div>

        {/* Expanded: the lawyer's own notes (request.description).
            A «ملخص AI للاستشارة» panel used to live here too, with «إرسال
            للعميل» and «تصدير PDF» buttons under it. It hung off `aiSummary`,
            which no code path ever set, so it was unreachable — and there is no
            consultation-summary generator behind it to reach. Removed. */}
        <AnimatePresence>
          {expanded && c.notes && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className={`px-4 pb-4 pt-0 space-y-3 border-t ${isDark ? "border-white/[0.04]" : "border-slate-50"}`}>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wide mb-1.5 mt-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>ملاحظات المحامي</p>
                  <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{c.notes}</p>
                </div>
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
  const user = useUser();
  const [filter, setFilter] = useState<ConsultStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showBooking, setShowBooking] = useState(false);
  const [consults, setConsults] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [maybeTruncated, setMaybeTruncated] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // Calls the endpoint directly instead of getWorkflowRequestsByReceiver(),
  // for two reasons that both end in a lawyer missing an appointment:
  //   - that wrapper sends no `limit`, so the route's default of 20 applied and
  //     the type="consultation" filter ran afterwards in the browser. Manually
  //     added clients, cases, hearings, tasks and invoices all land in the same
  //     receiver="lawyer" window, so twenty of anything hid every consultation.
  //   - the route reports a failed query as HTTP 200 with
  //     `{ data: [], total: 0, degraded: true }`. apiGet does not throw on a
  //     200, so the wrapper's catch never ran and the page drew the failure as
  //     «لا توجد استشارات مطابقة».
  const loadConsultations = useCallback(async () => {
    if (!isSupabaseMode) {
      // Demo build: no API routes. Module-level constant → eliminated in prod.
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiGet<{ data: WorkflowRequest[]; total?: number; degraded?: boolean }>(
        "/api/v1/service-requests",
        { receiver: "lawyer", limit: LAWYER_REQUESTS_FETCH_LIMIT },
      );
      if (res?.degraded) throw new Error("تعذّر تحميل الاستشارات.");
      const rows = Array.isArray(res?.data) ? res.data : [];
      setConsults(rows.filter(r => r.type === "consultation").map(workflowToConsultation));
      // `total` counts every receiver="lawyer" row, not just consultations, so
      // this can only ever say the list MIGHT be short — never that a specific
      // consultation is missing.
      setMaybeTruncated(typeof res?.total === "number" && res.total > rows.length);
    } catch (e) {
      console.error("[consultations] load failed:", e);
      setLoadError("تعذّر تحميل الاستشارات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConsultations();
    const handler = () => { loadConsultations(); };
    window.addEventListener("nzamy-workflow-updated", handler);
    return () => window.removeEventListener("nzamy-workflow-updated", handler);
  }, [loadConsultations]);

  const filtered = consults.filter(c => {
    const matchStatus = filter === "all" || c.status === filter;
    const matchSearch = !search || c.client.includes(search) || c.topic.includes(search);
    return matchStatus && matchSearch;
  });

  const upcoming = consults.filter(c => c.status === "upcoming");

  return (
    <div className="max-w-3xl mx-auto space-y-5" dir="rtl">

      {/* Booking modal */}
      <AnimatePresence>
        {showBooking && <BookingModal isDark={isDark} onClose={() => setShowBooking(false)} lawyerUserId={user.userId} />}
      </AnimatePresence>

      {/* Could-not-read banner — distinct from an empty list, and retryable. */}
      {loadError && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
          <Warning size={18} weight="fill" className="text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${isDark ? "text-red-400" : "text-red-700"}`}>{loadError}</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-red-600/70"}`}>هذه ليست قائمة فارغة — القراءة لم تنجح. لا تعتمد على ما يظهر أدناه.</p>
          </div>
          <button onClick={loadConsultations}
            className="flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:underline flex-shrink-0">
            <ArrowClockwise size={13} /> إعادة المحاولة
          </button>
        </motion.div>
      )}

      {/* Possible truncation. `total` counts all receiver="lawyer" rows, so the
          honest statement is "may be incomplete", not "consultations missing". */}
      {!loadError && maybeTruncated && (
        <div className={`rounded-2xl px-4 py-2.5 border flex items-center gap-2 text-[11px] ${isDark ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          <Warning size={14} weight="fill" className="flex-shrink-0" />
          <span>عدد سجلاتك يتجاوز حد القراءة ({LAWYER_REQUESTS_FETCH_LIMIT} سجلاً)، وقد لا تكون هذه القائمة كاملة.</span>
        </div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
            الاستشارات
          </h1>
          {/* The «إجمالي: X ﷼» that used to sit here summed `payment.amount`,
              which the booking form never collects and always stores as 0 — a
              money figure with no source, on a platform through which no money
              has ever moved. */}
          {/* The KPI grid and the mode breakdown below both withhold their
              numbers on a failed read; this subtitle did not, so it printed
              «٠ قادمة · ٠ إجمالاً» over a query that never answered — the one
              number on the screen still making a claim. Now all three agree. */}
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {loading
              ? "جارٍ التحميل…"
              : loadError
                ? <span className="text-red-500 font-semibold">تعذّرت القراءة — العدد غير معروف</span>
                : `${upcoming.length} قادمة · ${consults.length} إجمالاً`}
          </p>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => setShowBooking(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
          <Plus size={15} weight="bold" /> جدولة استشارة
        </motion.button>
      </motion.div>

      {/* KPIs. «جارية الآن» is gone with the inProgress status that could never
          be set, and «إجمالي الأتعاب» with the always-zero fee sum.
          Hidden entirely while loading or after a failed read: «قادمة ٠ ·
          مكتملة ٠» over a query that never returned is the headline lie on this
          screen, and a counter has no honest value to show in that state. */}
      {!loading && !loadError && (
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "قادمة",   value: upcoming.length,   color: "text-royal",       bg: "bg-royal/10",       icon: CalendarCheck },
          { label: "مكتملة",  value: consults.filter(c => c.status === "completed").length, color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle },
          { label: "ملغية",   value: consults.filter(c => c.status === "cancelled").length, color: isDark ? "text-zinc-400" : "text-slate-500", bg: isDark ? "bg-white/[0.06]" : "bg-slate-100", icon: X },
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
      )}

      {/* A «جلسة جارية الآن» panel with an «انضم للجلسة» button used to sit
          here. It was gated on a status no code path can produce, and its
          button had no onClick — a live-session panel for a product with no
          sessions. Removed with the status itself. */}

      {/* Next upcoming */}
      {!loading && !loadError && upcoming.length > 0 && (
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
                {upcoming[0].topic} · {MODE_LABELS[upcoming[0].mode]}
                {upcoming[0].duration !== null ? ` · ${upcoming[0].duration}د` : ""}
              </p>
            </div>
            <div className="text-left flex-shrink-0">
              {upcoming[0].time
                ? <p className="text-[14px] font-bold font-mono text-royal">{upcoming[0].time}</p>
                : <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>بانتظار التأكيد</p>}
              {upcoming[0].date && <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{upcoming[0].date}</p>}
            </div>
            {/* No «بدء» button: there is no meeting to start. See ConsultCard. */}
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
          {(["all", "upcoming", "completed", "cancelled"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-xl border text-[11px] font-semibold flex-shrink-0 transition-all ${filter === s ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20"}`}>
              {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode breakdown — same reasoning as the KPIs: four zeros is a
          statement about the lawyer's practice, not about a failed read. */}
      {!loading && !loadError && consults.length > 0 && (
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
      )}

      {/* List — three distinct states. «لا توجد استشارات مطابقة» over a failed
          read is how a lawyer misses an appointment; loading, could-not-read
          and genuinely-empty now each say what they are. */}
      <div className="space-y-2">
        {loading ? (
          <div className={`${card} p-8 flex flex-col items-center gap-3`}>
            <div className="inline-block w-7 h-7 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل الاستشارات…</p>
          </div>
        ) : loadError ? (
          <div className={`${card} p-8 text-center`}>
            <Warning size={28} weight="duotone" className="mx-auto mb-2 text-red-500" />
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّر تحميل الاستشارات</p>
            <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لم تنجح القراءة — لا يمكن عرض مواعيدك الآن.</p>
            <button onClick={loadConsultations}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
              <ArrowClockwise size={13} /> إعادة المحاولة
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${card} p-8 text-center`}>
            <CalendarCheck size={28} weight="duotone" className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              {consults.length === 0 ? "لم تصلك استشارات بعد" : "لا توجد استشارات مطابقة"}
            </p>
          </div>
        ) : filtered.map(c => (
          <ConsultCard key={c.id} c={c} isDark={isDark} card={card} />
        ))}
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
