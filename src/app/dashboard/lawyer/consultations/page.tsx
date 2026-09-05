"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChatDots, Plus, CalendarCheck, User, CheckCircle, ArrowRight, Video,
  Phone, ChatCircle, Sparkle, Buildings, X, NotePencil, ArrowClockwise,
  HouseSimple, Scales, Warning, ArrowLeft, BookOpen, Tray, FileText,
  XCircle, Clock,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { apiMutate, isSupabaseMode } from "@/lib/services/api";
import { createWorkflowId } from "@/lib/workflowStore";
import { getLawyerClients, type LawyerClient } from "@/lib/services/lawyerClientsService";
import { getLawyerConsultations, type LawyerConsultation } from "@/lib/services/lawyerConsultationsService";
import {
  CONSULTATION_STATUS_AR, CONSULTATION_MODE_AR, canTransitionConsultation,
  type ConsultationStatus, type ConsultationMode,
} from "@/lib/services/consultationVocabulary";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { toArabicDigits } from "@/lib/services/arabicCount";
import { formatGregorianAr } from "../_components/DeadlineCard";
import ConsultationActionModal, { type ConsultationAction } from "../_components/consultations/ConsultationActionModal";

/**
 * Lawyer «الاستشارات» — on the real lifecycle (Phase 3,
 * lawyerConsultationsService / public.consultations), not the
 * service_requests sieve this page used to run itself: a bare
 * `receiver === "lawyer"` fetch, filtered to `type === "consultation"` in
 * the browser, with its own reinvented upcoming/completed/cancelled status
 * and its own reinvented video/phone/chat/inPerson mode — none of it backed
 * by a CHECK constraint, so a value here could silently drift from what the
 * database actually allows. getLawyerConsultations() reads the working
 * table directly; CONSULTATION_STATUS_AR / CONSULTATION_MODE_AR /
 * CONSULTATION_TRANSITIONS are the one vocabulary, shared with the detail
 * page and the action modal — nothing here re-types a label.
 *
 * The booking flow itself is unchanged in shape: BookingModal still POSTs a
 * service_requests row (type "consultation") and the database trigger turns
 * it into a consultations row. What changed is the mode step, which now
 * sends one of the four CANONICAL modes instead of a UI-only enum: the old
 * `phone` UI value was translated to the metadata string "phone", which is
 * not in the trigger's allowed set ('ai','video','voice','text','in-person')
 * — so every "phone" consultation was silently stored as "مكتوبة" text.
 * Sending CONSULTATION_MODE values directly removes the translation layer
 * that caused that.
 */

// ─── Booking modal config ──────────────────────────────────────────────────

type BookingStep = "type" | "mode" | "datetime" | "confirm";

const CONSULT_TYPES = [
  { id: "legal-opinion", label: "رأي قانوني", icon: Scales },
  { id: "contract", label: "مراجعة عقد", icon: NotePencil },
  { id: "case-followup", label: "متابعة قضية", icon: Scales },
  { id: "company", label: "استشارة تأسيس شركة", icon: Buildings },
  { id: "general", label: "استشارة عامة", icon: ChatDots },
];

const DURATIONS = [30, 45, 60, 90, 120];

// "ai" is the AI-workspace consultation channel (receiver="ai_workspace"),
// never something a lawyer books on a client's behalf here.
const BOOKING_MODES: ConsultationMode[] = ["video", "voice", "text", "in-person"];

const MODE_ICON = {
  ai: Sparkle,
  video: Video,
  voice: Phone,
  text: ChatCircle,
  "in-person": HouseSimple,
};

const MODE_CHIP_CLS: Record<ConsultationMode, string> = {
  ai: "text-fuchsia-500 bg-fuchsia-500/10",
  video: "text-blue-500 bg-blue-500/10",
  voice: "text-emerald-500 bg-emerald-500/10",
  text: "text-violet-500 bg-violet-500/10",
  "in-person": "text-amber-500 bg-amber-500/10",
};

const STATUS_CHIP_CLS: Record<ConsultationStatus, { light: string; dark: string }> = {
  requested: { light: "bg-amber-50 text-amber-700 border-amber-200", dark: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  scheduled: { light: "bg-blue-50 text-blue-600 border-blue-200", dark: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  completed: { light: "bg-emerald-50 text-emerald-700 border-emerald-200", dark: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  cancelled: { light: "bg-slate-100 text-slate-500 border-slate-200", dark: "bg-white/[0.06] text-zinc-400 border-white/[0.08]" },
  no_show: { light: "bg-red-50 text-red-600 border-red-200", dark: "bg-red-500/10 text-red-400 border-red-500/20" },
};

/**
 * «٢ سبتمبر ٢٠٢٦ · ٠٥:٣٠ م», or just the date when the time cannot be read.
 * The date half MUST come from the same viewer-local Date the time half uses,
 * never from slicing the raw ISO characters, or the two halves can disagree
 * near midnight (slicing would print "yesterday" next to "١:٣٠ ص").
 */
function formatScheduledAr(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateAr = formatGregorianAr(localDateStr);
  const time = d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  return `${dateAr} · ${time}`;
}

/** The LOCAL calendar day ("YYYY-MM-DD") a stored instant falls on. */
function localYMD(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Booking Modal ──────────────────────────────────────────────────────────

function BookingModal({ isDark, onClose, lawyerUserId }: { isDark: boolean; onClose: () => void; lawyerUserId?: string }) {
  const [step, setStep] = useState<BookingStep>("type");
  const [consultType, setConsultType] = useState("");
  const [mode, setMode] = useState<ConsultationMode | "">("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional client picker (Phase 2 — public.lawyer_clients). Only cards
  // ("source: 'card'") are offered: a "profile" row has no id in
  // lawyer_clients yet, so it cannot be linked via lawyerClientId. The
  // free-text name field below stays the fallback path when nothing is
  // picked, or while the list is loading/unreadable — same pattern as
  // AddCaseModal.tsx.
  const [clientCards, setClientCards] = useState<LawyerClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsUnreadable, setClientsUnreadable] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const read = await getLawyerClients();
      if (cancelled) return;
      if (!read.ok) {
        setClientsUnreadable(true);
        setClientsLoading(false);
        return;
      }
      setClientCards(read.items.filter((c) => c.source === "card"));
      setClientsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function handleClientPick(id: string) {
    setSelectedClientId(id);
    const picked = clientCards.find((c) => c.id === id);
    if (picked) setClientName(picked.name);
  }

  const steps: BookingStep[] = ["type", "mode", "datetime", "confirm"];
  const stepIdx = steps.indexOf(step);

  /**
   * Why the footer button is gated.
   *
   * Nothing in this form was required: «التالي» only ever advanced, and the
   * payload then filled in whatever the lawyer had skipped —
   * `title: consultLabel || "استشارة قانونية"`, `name: clientName || "عميل"`
   * and, worst of the three, `mode: mode ? … : "video"`. A booking made
   * without touching step 2 was persisted as a video call and read back as one:
   * «فيديو» on the card and in the mode breakdown. That is an invented fact
   * about an appointment with a real client, not a blank.
   *
   * Only the three fields that were being substituted are required. The date
   * and the time deliberately are NOT: they go through as "" and the trigger
   * leaves the consultation "requested" (بانتظار الجدولة) instead of
   * "scheduled" until a real one is set. `duration` likewise — 60 is
   * preselected in front of the lawyer and repeated on the confirm summary,
   * so it is a disclosed default, not a substitution.
   *
   * This gate is client-side; the guard in `handleConfirm` is what actually
   * keeps a substituted value out of the row.
   */
  const missingLabel = !consultType
    ? "اختر نوع الاستشارة للمتابعة."
    : !clientName.trim()
      ? "اكتب اسم العميل للمتابعة."
      : null;
  const blockedReason =
    step === "type" ? missingLabel
      : step === "mode" ? (!mode ? "اختر طريقة الاستشارة للمتابعة." : null)
        : step === "confirm" ? (!consultType || !clientName.trim() || !mode
          ? "ارجع وأكمل نوع الاستشارة واسم العميل وطريقة الاستشارة."
          : null)
          : null;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const consultLabel = CONSULT_TYPES.find((t) => t.id === consultType)?.label;
      if (!consultLabel || !clientName.trim() || !mode) {
        throw new Error("أكمل نوع الاستشارة واسم العميل وطريقة الاستشارة قبل التأكيد.");
      }

      const pickedClient = selectedClientId ? clientCards.find((c) => c.id === selectedClientId) ?? null : null;
      // When a card is picked, carry its contact details into `requester` —
      // the same jsonb the lawyer/consultations route hydrates clientName/
      // clientEmail/clientPhone from when there is no platform account to
      // read a profile off of (see _shared.ts:hydrateConsultations). Blank
      // fields are simply omitted rather than sent as null.
      const requester = pickedClient
        ? {
            name: pickedClient.name,
            ...(pickedClient.phone ? { phone: pickedClient.phone } : {}),
            ...(pickedClient.email ? { email: pickedClient.email } : {}),
            role: pickedClient.clientType === "company" ? "company" : "individual",
            tier: "free",
          }
        : { name: clientName.trim(), role: "individual", tier: "free" };

      const payload = {
        id: createWorkflowId(),
        type: "consultation",
        title: consultLabel,
        description: notes || "",
        receiver: "lawyer",
        status: "pending_assignment",
        requester,
        payment: { amount: 0, status: "not_required" },
        sourcePath: "",
        assignedTo: lawyerUserId ?? null,
        metadata: { day: date, time, mode, duration },
        ...(pickedClient ? { lawyerClientId: pickedClient.id } : {}),
      };

      if (!isSupabaseMode) {
        // Demo build has no API routes. Module-level constant, so this branch is
        // eliminated from the production bundle the six lawyer accounts use.
        throw new Error("جدولة الاستشارات غير متاحة في هذا الوضع.");
      }
      if (!lawyerUserId) {
        // Refuse rather than write an unassigned row: an unowned booking is
        // readable by every other verified lawyer (see the marketplace
        // browse policy on service_requests). An unresolved session here is
        // rare, but guessing means another lawyer reading this booking.
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

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`;
  const labelCls = `block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`;

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

                {!clientsUnreadable && (clientsLoading || clientCards.length > 0) && (
                  <div>
                    <label className={labelCls}>اختيار من قائمة الموكّلين (اختياري)</label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => handleClientPick(e.target.value)}
                      disabled={clientsLoading}
                      className={inputCls}
                    >
                      <option value="">
                        {clientsLoading ? "جارٍ تحميل الموكّلين..." : "— بدون اختيار (اكتب الاسم يدوياً) —"}
                      </option>
                      {clientCards.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={labelCls}>اسم العميل</label>
                  <input value={clientName}
                    onChange={e => { setClientName(e.target.value); if (selectedClientId) setSelectedClientId(""); }}
                    placeholder="اسم العميل أو الجهة..."
                    className={inputCls} />
                </div>
              </motion.div>
            )}

            {/* Step 2: Mode */}
            {step === "mode" && (
              <motion.div key="mode" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>طريقة الاستشارة</p>
                <div className="grid grid-cols-2 gap-2">
                  {BOOKING_MODES.map(m => {
                    const Icon = MODE_ICON[m];
                    const active = mode === m;
                    const chipCls = MODE_CHIP_CLS[m].split(" ");
                    return (
                      <button key={m} onClick={() => setMode(m)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                          active
                            ? isDark ? "border-[#0B3D2E]/60 bg-[#0B3D2E]/15" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5"
                            : isDark ? "border-white/[0.06]" : "border-slate-200"
                        }`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? "bg-[#0B3D2E]" : chipCls[1]}`}>
                          <Icon size={18} weight="duotone" className={active ? "text-white" : chipCls[0]} />
                        </div>
                        <span className={`text-[12px] font-bold ${active ? isDark ? "text-zinc-100" : "text-slate-800" : isDark ? "text-zinc-400" : "text-slate-500"}`}>
                          {CONSULTATION_MODE_AR[m]}
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
                        {toArabicDigits(d)}د
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
                    <label className={labelCls}>التاريخ</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>الوقت</label>
                    <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>ملاحظات (اختياري)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                      placeholder="تفاصيل إضافية عن موضوع الاستشارة..."
                      className={`${inputCls} resize-none`} />
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
                    { label: "العميل", value: clientName || "غير محدد" },
                    { label: "النوع", value: CONSULT_TYPES.find(t => t.id === consultType)?.label ?? "—" },
                    { label: "الوسيلة", value: mode ? CONSULTATION_MODE_AR[mode] : "—" },
                    { label: "المدة", value: `${toArabicDigits(duration)} دقيقة` },
                    { label: "التاريخ", value: date || "—" },
                    { label: "الوقت", value: time || "—" },
                  ].map(row => (
                    <div key={row.label} className={`flex justify-between text-[12px] pb-2 border-b last:border-0 last:pb-0 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                      <span className={isDark ? "text-zinc-500" : "text-slate-400"}>{row.label}</span>
                      <span className={`font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={`px-5 py-4 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          {blockedReason && (
            <p className={`text-[11px] font-semibold mb-2.5 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              {blockedReason}
            </p>
          )}
          <div className="flex items-center gap-3">
            {stepIdx > 0 && (
              <button onClick={() => setStep(steps[stepIdx - 1])}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-[12px] font-semibold ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                <ArrowLeft size={13} /> السابق
              </button>
            )}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              disabled={submitting || blockedReason !== null}
              onClick={() => {
                if (stepIdx < steps.length - 1) setStep(steps[stepIdx + 1]);
                else handleConfirm();
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[13px] font-bold text-[#C8A762] disabled:opacity-60 disabled:cursor-not-allowed">
              {step === "confirm" ? <><CheckCircle size={15} weight="fill" /> {submitting ? "جارٍ التأكيد..." : "تأكيد الجدولة"}</> : <>التالي <ArrowRight size={13} /></>}
            </motion.button>
          </div>
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

// ─── Consultation card ──────────────────────────────────────────────────────

function quickBtnCls(isDark: boolean, variant: "primary" | "neutral" | "danger"): string {
  const base = "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors";
  if (variant === "primary") return `${base} bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]`;
  if (variant === "danger") return `${base} ${isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"}`;
  return `${base} ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;
}

/** Same rule the /opinion route applies: already-completed skips the transition check instead of refusing itself. */
function canDeliverOpinion(c: LawyerConsultation): boolean {
  if (c.opinionDeliveredAt) return false;
  return c.status === "completed" || canTransitionConsultation(c.status, "completed");
}

function ConsultCard({
  c, isDark, card, onAction,
}: {
  c: LawyerConsultation;
  isDark: boolean;
  card: string;
  onAction: (action: ConsultationAction) => void;
}) {
  const ModeIcon = MODE_ICON[c.mode];
  const chipCls = MODE_CHIP_CLS[c.mode].split(" ");
  const scheduledAr = formatScheduledAr(c.scheduledAt);

  const showSchedule = canTransitionConsultation(c.status, "scheduled");
  const showComplete = canTransitionConsultation(c.status, "completed");
  const showCancel = canTransitionConsultation(c.status, "cancelled");
  const showOpinion = canDeliverOpinion(c);
  const showConvert = !c.convertedCaseRequestId;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-4 space-y-3`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${chipCls[1]}`}>
          <ModeIcon size={18} weight="duotone" className={chipCls[0]} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className={`text-[14px] font-bold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.clientName}</p>
            <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? STATUS_CHIP_CLS[c.status].dark : STATUS_CHIP_CLS[c.status].light}`}>
              {CONSULTATION_STATUS_AR[c.status]}
            </span>
            {c.opinionDeliveredAt && (
              <span className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
                <FileText size={10} /> رأي مُسلَّم
              </span>
            )}
          </div>
          <p className={`text-[12.5px] truncate ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{c.title}</p>
          <div className={`flex items-center gap-2 flex-wrap mt-1.5 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            <span className={`px-1.5 py-0.5 rounded-md flex items-center gap-1 ${chipCls[1]} ${chipCls[0]}`}>
              <ModeIcon size={9} /> {CONSULTATION_MODE_AR[c.mode]}
            </span>
            {scheduledAr && (
              <>
                <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                <span>{scheduledAr}</span>
              </>
            )}
            {c.durationMinutes !== null && (
              <>
                <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                <span className="flex items-center gap-1"><Clock size={10} /> {toArabicDigits(c.durationMinutes)} د</span>
              </>
            )}
          </div>
          {c.convertedCaseRequestId && (
            <Link href={`/dashboard/lawyer/cases/${c.convertedCaseRequestId}`}
              className={`inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold hover:underline ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
              <Scales size={11} /> حُوِّلت إلى قضية
            </Link>
          )}
        </div>
      </div>

      <div className={`flex items-center gap-1.5 flex-wrap pt-2.5 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
        {showSchedule && (
          <button onClick={() => onAction("schedule")} className={quickBtnCls(isDark, "primary")}>
            <CalendarCheck size={12} /> {c.status === "scheduled" ? "إعادة الجدولة" : "جدولة"}
          </button>
        )}
        {showComplete && (
          <button onClick={() => onAction("complete")} className={quickBtnCls(isDark, "neutral")}>
            <CheckCircle size={12} /> إتمام
          </button>
        )}
        {showOpinion && (
          <button onClick={() => onAction("opinion")} className={quickBtnCls(isDark, "neutral")}>
            <FileText size={12} /> الرأي القانوني
          </button>
        )}
        {showConvert && (
          <button onClick={() => onAction("convert")} className={quickBtnCls(isDark, "neutral")}>
            <Scales size={12} /> تحويل لقضية
          </button>
        )}
        {showCancel && (
          <button onClick={() => onAction("cancel")} className={quickBtnCls(isDark, "danger")}>
            <XCircle size={12} /> إلغاء
          </button>
        )}
        <Link href={`/dashboard/lawyer/consultations/${c.id}`}
          className={`ms-auto flex items-center gap-1 text-[11px] font-bold ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-royal"}`}>
          فتح <ArrowLeft size={11} />
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Tabs / sort ────────────────────────────────────────────────────────────

type TabKey = "all" | "requested" | "scheduled" | "completed" | "cancelled_group";

function matchesTab(c: LawyerConsultation, tab: TabKey): boolean {
  if (tab === "all") return true;
  if (tab === "cancelled_group") return c.status === "cancelled" || c.status === "no_show";
  return c.status === tab;
}

/**
 * Scheduled first (soonest slot next), then requested (newest booking
 * first), then everything else — completed, cancelled, no_show — most
 * recently touched first. Three separate sort keys because "soonest" only
 * means something for a row that actually has a slot.
 */
function sortConsultations(items: LawyerConsultation[]): LawyerConsultation[] {
  const scheduled = items.filter((c) => c.status === "scheduled")
    .slice().sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  const requested = items.filter((c) => c.status === "requested")
    .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rest = items.filter((c) => c.status !== "scheduled" && c.status !== "requested")
    .slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...scheduled, ...requested, ...rest];
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "requested", label: CONSULTATION_STATUS_AR.requested },
  { key: "scheduled", label: CONSULTATION_STATUS_AR.scheduled },
  { key: "completed", label: CONSULTATION_STATUS_AR.completed },
  { key: "cancelled_group", label: `${CONSULTATION_STATUS_AR.cancelled} / ${CONSULTATION_STATUS_AR.no_show}` },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ConsultationsPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const searchParams = useSearchParams();
  // `?book=1` — the deep link the lawyer dashboard's «استشارة جديدة» quick
  // action carries. Called bare, with no Suspense wrapper, matching the
  // established pattern for statically-prerendered client pages in this
  // tree (dashboard/client/my-group/page.tsx, dashboard/client/requests/new).
  const bookParam = searchParams?.get("book") ?? null;
  const [showBooking, setShowBooking] = useState(bookParam === "1");
  const [tab, setTab] = useState<TabKey>("all");

  const [consultsRead, setConsultsRead] = useState<ListRead<LawyerConsultation> | null>(null);
  const [loading, setLoading] = useState(true);

  const loadConsultations = useCallback(() => {
    setLoading(true);
    getLawyerConsultations({ status: "all", limit: 200 }).then(setConsultsRead).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadConsultations();
    const handler = () => loadConsultations();
    window.addEventListener("nzamy-workflow-updated", handler);
    return () => window.removeEventListener("nzamy-workflow-updated", handler);
  }, [loadConsultations]);

  const listState = listViewState(loading, consultsRead);
  const items = itemsOf(consultsRead);
  const countersReady = listState === "ready" || listState === "empty";

  // "Today", computed inside an effect rather than at render time or in a
  // useState initializer — the SSR cached-date trap: a value baked in at
  // build/prerender time would freeze "اليوم" at whatever day the page was
  // last rendered on the server, not the viewer's actual day.
  const [todayYMD, setTodayYMD] = useState<string | null>(null);
  useEffect(() => {
    const now = new Date();
    setTodayYMD(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
  }, []);

  const requestedCount = items.filter((c) => c.status === "requested").length;
  const scheduledCount = items.filter((c) => c.status === "scheduled").length;
  const completedCount = items.filter((c) => c.status === "completed").length;
  const todayCount = todayYMD === null ? 0 : items.filter((c) => c.scheduledAt && localYMD(c.scheduledAt) === todayYMD).length;

  // «الاستشارة القادمة» — the earliest scheduled slot still ahead of now.
  // "Now" is likewise read inside an effect, never at render time.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => { setNowMs(Date.now()); }, []);
  let nextConsult: LawyerConsultation | null = null;
  if (nowMs !== null) {
    const ahead = items.filter((c) => c.status === "scheduled" && c.scheduledAt && new Date(c.scheduledAt).getTime() >= nowMs);
    if (ahead.length > 0) {
      nextConsult = ahead.slice().sort((a, b) => (a.scheduledAt as string).localeCompare(b.scheduledAt as string))[0];
    }
  }

  const rows = sortConsultations(items.filter((c) => matchesTab(c, tab)));

  // ── Action modal — one instance, targeting whichever row/action was picked ──
  const [actionTarget, setActionTarget] = useState<{ consultation: LawyerConsultation; action: ConsultationAction } | null>(null);
  function handleActionDone() {
    setActionTarget(null);
    loadConsultations();
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-3xl mx-auto space-y-5" dir="rtl">

      {/* Booking modal */}
      <AnimatePresence>
        {showBooking && <BookingModal isDark={isDark} onClose={() => setShowBooking(false)} lawyerUserId={user.userId} />}
      </AnimatePresence>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl flex-shrink-0 ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
            <ChatDots size={20} weight="duotone" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
              الاستشارات
            </h1>
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>حجوزاتك واستشارات العملاء المُسندة إليك</p>
          </div>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => setShowBooking(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
          <Plus size={15} weight="bold" /> استشارة جديدة
        </motion.button>
      </motion.div>

      {/* KPIs — withheld while loading/unreadable; a claimed zero over a
          failed read is how a lawyer misses that a client is waiting.
          Three of the four repeat a status the tab strip below already
          counts, so those three double as tab shortcuts instead of
          showing the same number twice (note ٢٥٧). */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: CONSULTATION_STATUS_AR.requested, value: requestedCount, icon: ChatDots, cls: isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600", needsToday: false, tabKey: "requested" as TabKey | null },
          { label: CONSULTATION_STATUS_AR.scheduled, value: scheduledCount, icon: CalendarCheck, cls: isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600", needsToday: false, tabKey: "scheduled" as TabKey | null },
          { label: "اليوم", value: todayCount, icon: Clock, cls: isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]", needsToday: true, tabKey: null as TabKey | null },
          { label: CONSULTATION_STATUS_AR.completed, value: completedCount, icon: CheckCircle, cls: isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700", needsToday: false, tabKey: "completed" as TabKey | null },
        ] as const).map((k, i) => {
          const Icon = k.icon;
          const ready = countersReady && (!k.needsToday || todayYMD !== null);
          const clickable = k.tabKey !== null;
          return (
            <motion.button key={i} type="button" disabled={!clickable}
              onClick={() => { if (k.tabKey) setTab(k.tabKey); }}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${card} p-4 flex items-center gap-3 text-start w-full ${clickable ? `cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-50"} ${tab === k.tabKey ? "ring-1 ring-royal/40" : ""}` : ""}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${k.cls}`}>
                <Icon size={16} weight="duotone" />
              </div>
              <div>
                <p className={`text-[16px] font-bold font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{ready ? toArabicDigits(k.value) : "—"}</p>
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{k.label}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Next scheduled */}
      {nextConsult && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className={`${card} p-5 border-royal/20 bg-royal/[0.03]`}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck size={15} weight="duotone" className="text-royal" />
            <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الاستشارة القادمة</p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-royal/10" : "bg-royal/5"}`}>
              <User size={22} weight="duotone" className="text-royal" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[15px] font-bold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{nextConsult.clientName}</p>
              <p className={`text-[12px] truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {nextConsult.title} · {CONSULTATION_MODE_AR[nextConsult.mode]}
                {nextConsult.durationMinutes !== null ? ` · ${toArabicDigits(nextConsult.durationMinutes)}د` : ""}
              </p>
            </div>
            <div className="text-left flex-shrink-0">
              <p className="text-[13px] font-bold text-royal">{formatScheduledAr(nextConsult.scheduledAt)}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-xl border text-[11px] font-semibold flex-shrink-0 transition-all ${tab === t.key ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* List — loading / unreadable / empty / ready are four distinct
          answers; «لا استشارات مطابقة» over a failed read is how a lawyer
          misses an appointment. */}
      <div className="space-y-2">
        {listState === "loading" && (
          <div className={`${card} p-8 flex flex-col items-center gap-3`}>
            <div className="inline-block w-7 h-7 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل الاستشارات…</p>
          </div>
        )}
        {listState === "unreadable" && (
          <div className={`${card} p-8 text-center`}>
            <Warning size={28} weight="duotone" className="mx-auto mb-2 text-red-500" />
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّر تحميل الاستشارات</p>
            <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هذه ليست قائمة فارغة — قد توجد استشارات لم تُقرأ.</p>
            <button onClick={loadConsultations}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
              <ArrowClockwise size={13} /> إعادة المحاولة
            </button>
          </div>
        )}
        {listState === "empty" && (
          <div className={`${card} p-8 text-center`}>
            <ChatDots size={28} weight="duotone" className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا استشارات بعد — احجز الأولى أو انتظر حجوزات العملاء</p>
          </div>
        )}
        {listState === "ready" && rows.length === 0 && (
          <div className={`${card} p-8 text-center`}>
            <p className={`text-[13px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا استشارات مطابقة لهذا التصنيف</p>
          </div>
        )}
        {listState === "ready" && rows.map((c) => (
          <ConsultCard key={c.id} c={c} isDark={isDark} card={card}
            onAction={(action) => setActionTarget({ consultation: c, action })} />
        ))}
      </div>

      {/* Preparation tools — unrelated to the data source above, unchanged. */}
      <div className={`p-4 rounded-2xl border space-y-3 ${isDark ? "border-white/[0.07] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center gap-2">
          <Sparkle size={15} weight="fill" className="text-[#C8A762] flex-shrink-0" />
          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
            أدوات تحضير الاستشارة
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([
            { href: "/laws", label: "المكتبة القانونية", sub: "الأنظمة واللوائح النافذة", icon: BookOpen },
            { href: "/precedents", label: "السوابق والمبادئ القضائية", sub: "قسم المبادئ داخل المكتبة", icon: Scales },
            { href: "/ai/collector", label: "المجمّع البحثي", sub: "اجمع نصوصك ومسوداتك في مكان واحد", icon: Tray },
            { href: "/ai/legal-opinion", label: "المستشار AI", sub: "أداة منفصلة لصياغة رأي قانوني", icon: Sparkle },
          ] as const).map(tool => {
            const Icon = tool.icon;
            return (
              <Link key={tool.href} href={tool.href}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                  isDark
                    ? "border-white/[0.06] hover:border-[#C8A762]/30 hover:bg-white/[0.03]"
                    : "border-slate-200 hover:border-[#C8A762]/40 hover:bg-amber-50/40"
                }`}>
                <Icon size={16} weight="duotone" className="text-[#C8A762] flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{tool.label}</span>
                  <span className={`block text-[10px] truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{tool.sub}</span>
                </span>
                <ArrowRight size={12} className={`flex-shrink-0 ${isDark ? "text-zinc-600" : "text-slate-300"}`} />
              </Link>
            );
          })}
        </div>

        <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
          <span className={`font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>حدود الأداة:</span>{" "}
          تحضير الاستشارة وتوثيقها يدويان — لا تولّد المنصة ملخصاً للجلسة تلقائياً ولا ترسله للعميل.
        </p>
      </div>

      <AnimatePresence>
        {actionTarget && (
          <ConsultationActionModal
            consultation={actionTarget.consultation}
            action={actionTarget.action}
            isDark={isDark}
            onClose={() => setActionTarget(null)}
            onDone={handleActionDone}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
