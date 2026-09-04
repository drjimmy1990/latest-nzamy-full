"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ChatDots, CalendarCheck, Clock, User, Phone, EnvelopeSimple,
  Warning, ArrowClockwise, Scales, FileText, LockKey, Trash,
  CheckCircle, XCircle, UserCircleMinus, IdentificationCard, CurrencyCircleDollar,
} from "@phosphor-icons/react";

import { useUser } from "@/hooks/useUser";
import { toArabicDigits } from "@/lib/services/arabicCount";
import { describeDateAr } from "@/lib/services/hijri";
import { itemsOf, listViewState, type ListRead } from "@/lib/services/listRead";
import {
  getLawyerConsultation, getConsultationNotes, addConsultationNote, deleteConsultationNote,
  type LawyerConsultation, type ConsultationNote,
} from "@/lib/services/lawyerConsultationsService";
import {
  CONSULTATION_STATUS_AR, CONSULTATION_MODE_AR, canTransitionConsultation,
  type ConsultationStatus,
} from "@/lib/services/consultationVocabulary";
import ConsultationActionModal, { type ConsultationAction } from "./ConsultationActionModal";

/**
 * ConsultationDetail.tsx
 * ─────────────────────────────────────────────────────────
 * The consultation's working screen — shared by the lawyer and firm
 * dashboards through `basePath`. Self-loading: reads the row itself via
 * getLawyerConsultation, then getConsultationNotes once the row is ready.
 * Every mutation goes through ConsultationActionModal; this component only
 * decides WHICH actions are currently legal (CONSULTATION_TRANSITIONS) and
 * re-renders around whatever the modal hands back.
 */

interface Props {
  consultationId: string;
  isDark: boolean;
  basePath: "/dashboard/lawyer" | "/dashboard/firm";
}

type PageState = "loading" | "ready" | "notfound" | "unreadable";

// The exact string the route answers a missing row with (both the 404 body
// and lawyerConsultationsService's own fallback throw use it verbatim) — the
// one signal available to tell "not found" apart from any other failure,
// since the service throws for both instead of returning null the way
// getLawyerClient does.
const NOT_FOUND_MESSAGE = "الاستشارة غير موجودة";

const STATUS_CHIP_CLS: Record<ConsultationStatus, { light: string; dark: string }> = {
  requested: { light: "bg-amber-50 text-amber-700 border-amber-200", dark: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  scheduled: { light: "bg-blue-50 text-blue-600 border-blue-200", dark: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  completed: { light: "bg-emerald-50 text-emerald-700 border-emerald-200", dark: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  cancelled: { light: "bg-slate-100 text-slate-500 border-slate-200", dark: "bg-white/[0.06] text-zinc-400 border-white/[0.08]" },
  no_show: { light: "bg-red-50 text-red-600 border-red-200", dark: "bg-red-500/10 text-red-400 border-red-500/20" },
};

/** Same rule the /opinion route applies: already-completed skips the transition check instead of refusing itself. */
function canDeliverOpinion(c: LawyerConsultation): boolean {
  if (c.opinionDeliveredAt) return false;
  return c.status === "completed" || canTransitionConsultation(c.status, "completed");
}

/**
 * «الأربعاء ٢ سبتمبر ٢٠٢٦ · ٠٥:٣٠ م».
 * `iso` is a `timestamptz` value serialized in UTC — the date half MUST come
 * from the same viewer-local `Date` the time half uses, never from slicing
 * the raw ISO characters, or the two halves of the sentence can disagree
 * (e.g. a Riyadh-local 01:30 AM instant is stored/serialized as ~22:30 the
 * previous UTC day — slicing would print "yesterday" next to "01:30 AM").
 */
function formatDateTimeAr(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const described = describeDateAr(localDateStr);
  if (!described) return null;
  const time = d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  return `${described} · ${time}`;
}

export default function ConsultationDetail({ consultationId, isDark, basePath }: Props) {
  const user = useUser();

  // ── The consultation itself ──
  const [consultation, setConsultation] = useState<LawyerConsultation | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [loadErrorMsg, setLoadErrorMsg] = useState<string | null>(null);

  const loadConsultation = useCallback(() => {
    setPageState("loading");
    setLoadErrorMsg(null);
    getLawyerConsultation(consultationId)
      .then((c) => {
        setConsultation(c);
        setPageState("ready");
      })
      .catch((e) => {
        console.error("[ConsultationDetail] load failed:", e);
        const msg = e instanceof Error && e.message ? e.message : "تعذّر تحميل الاستشارة.";
        if (msg === NOT_FOUND_MESSAGE) {
          setPageState("notfound");
        } else {
          setLoadErrorMsg(msg);
          setPageState("unreadable");
        }
      });
  }, [consultationId]);

  useEffect(() => { loadConsultation(); }, [loadConsultation]);

  // ── Notes ──
  const [notesRead, setNotesRead] = useState<ListRead<ConsultationNote> | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"private" | "firm">("private");
  const [addingNote, setAddingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const loadNotes = useCallback(() => {
    setNotesLoading(true);
    getConsultationNotes(consultationId).then(setNotesRead).finally(() => setNotesLoading(false));
  }, [consultationId]);

  useEffect(() => { if (pageState === "ready") loadNotes(); }, [pageState, loadNotes]);

  const notesView = listViewState(notesLoading, notesRead);
  const notes = itemsOf(notesRead);

  const submitNote = async () => {
    const body = noteBody.trim();
    if (!body || addingNote) return;
    setAddingNote(true);
    setNoteError(null);
    try {
      await addConsultationNote(consultationId, { body, visibility: noteVisibility });
      setNoteBody("");
      loadNotes();
    } catch (e) {
      setNoteError(e instanceof Error && e.message ? `تعذّر الحفظ: ${e.message}` : "تعذّر حفظ الملاحظة.");
    } finally {
      setAddingNote(false);
    }
  };

  const removeNote = async (noteId: string) => {
    setDeletingNoteId(noteId);
    setNoteError(null);
    try {
      await deleteConsultationNote(consultationId, noteId);
      loadNotes();
    } catch (e) {
      setNoteError(e instanceof Error && e.message ? `تعذّر الحذف: ${e.message}` : "تعذّر حذف الملاحظة.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  // ── Action modal ──
  const [activeAction, setActiveAction] = useState<ConsultationAction | null>(null);

  function handleActionDone(updated: LawyerConsultation, _extra?: { caseRequestId?: string }) {
    // None of the six actions write to consultation_notes — only the note
    // form/delete above do — so the consultation row is the only state that
    // needs replacing here.
    setConsultation(updated);
    setActiveAction(null);
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // ── Loading / notfound / unreadable ──
  if (pageState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3" dir="rtl">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
        <p className={isDark ? "text-zinc-500" : "text-slate-400"}>جاري تحميل الاستشارة...</p>
      </div>
    );
  }

  if (pageState === "notfound") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3" dir="rtl">
        <ChatDots size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <p className={`text-lg font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>الاستشارة غير موجودة</p>
      </div>
    );
  }

  if (pageState === "unreadable" || !consultation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3" dir="rtl">
        <Warning size={40} weight="duotone" className="text-red-500" />
        <p className={`text-lg font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{loadErrorMsg}</p>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لم تنجح القراءة — هذا لا يعني أن الاستشارة غير موجودة.</p>
        <button onClick={loadConsultation} className="flex items-center gap-1.5 text-sm font-bold text-royal hover:underline">
          <ArrowClockwise size={14} /> إعادة المحاولة
        </button>
      </div>
    );
  }

  // ── Ready ──
  const statusChip = STATUS_CHIP_CLS[consultation.status];
  const scheduledDescribed = formatDateTimeAr(consultation.scheduledAt);
  const createdDescribed = formatDateTimeAr(consultation.createdAt);
  const opinionDeliveredDescribed = formatDateTimeAr(consultation.opinionDeliveredAt);

  const showSchedule = canTransitionConsultation(consultation.status, "scheduled");
  const showComplete = canTransitionConsultation(consultation.status, "completed");
  const showNoShow = canTransitionConsultation(consultation.status, "no_show");
  const showCancel = canTransitionConsultation(consultation.status, "cancelled");
  const showOpinionAction = canDeliverOpinion(consultation);
  const showConvertAction = !consultation.convertedCaseRequestId;

  const actionBtnCls = (variant: "primary" | "neutral" | "danger") =>
    `flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold transition-colors ${
      variant === "primary"
        ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
        : variant === "danger"
          ? isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"
          : isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="max-w-[900px] mx-auto space-y-5 pb-10" dir="rtl">

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl flex-shrink-0 ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
          <ChatDots size={20} weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className={`text-[18px] font-bold truncate ${isDark ? "text-white" : "text-zinc-900"}`}>{consultation.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-bold ${isDark ? statusChip.dark : statusChip.light}`}>
              {CONSULTATION_STATUS_AR[consultation.status]}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
              {CONSULTATION_MODE_AR[consultation.mode]}
            </span>
            {createdDescribed && (
              <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>فُتحت في {createdDescribed}</span>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Actions row ── */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="flex flex-wrap gap-2">
        {showSchedule && (
          <button onClick={() => setActiveAction("schedule")} className={actionBtnCls("primary")}>
            <CalendarCheck size={14} /> {consultation.status === "scheduled" ? "إعادة الجدولة" : "جدولة"}
          </button>
        )}
        {showComplete && (
          <button onClick={() => setActiveAction("complete")} className={actionBtnCls("neutral")}>
            <CheckCircle size={14} /> إتمام
          </button>
        )}
        {showNoShow && (
          <button onClick={() => setActiveAction("no_show")} className={actionBtnCls("neutral")}>
            <UserCircleMinus size={14} /> عدم حضور
          </button>
        )}
        {showCancel && (
          <button onClick={() => setActiveAction("cancel")} className={actionBtnCls("danger")}>
            <XCircle size={14} /> إلغاء
          </button>
        )}
        {showOpinionAction && (
          <button onClick={() => setActiveAction("opinion")} className={actionBtnCls("neutral")}>
            <FileText size={14} /> تسليم الرأي القانوني
          </button>
        )}
        {showConvertAction ? (
          <button onClick={() => setActiveAction("convert")} className={actionBtnCls("neutral")}>
            <Scales size={14} /> تحويل إلى قضية
          </button>
        ) : (
          <Link href={`${basePath}/cases/${consultation.convertedCaseRequestId}`} className={actionBtnCls("neutral")}>
            <Scales size={14} /> القضية
          </Link>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Details card */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className={`${card} p-4 space-y-2.5`}>
            {scheduledDescribed && (
              <div className="flex items-center gap-2 text-[12.5px]">
                <CalendarCheck size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{scheduledDescribed}</span>
              </div>
            )}
            {consultation.durationMinutes !== null && (
              <div className="flex items-center gap-2 text-[12.5px]">
                <Clock size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{toArabicDigits(consultation.durationMinutes)} دقيقة</span>
              </div>
            )}
            {consultation.specialty && (
              <div className="flex items-center gap-2 text-[12.5px]">
                <IdentificationCard size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{consultation.specialty}</span>
              </div>
            )}
            {consultation.feeSar !== null && (
              <div className="flex items-center gap-2 text-[12.5px]">
                <CurrencyCircleDollar size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <span className={isDark ? "text-zinc-300" : "text-slate-700"}>
                  {consultation.feeSar.toLocaleString("ar-SA")} ر.س · {consultation.feePaid ? "مسدَّدة" : "غير مسدَّدة"}
                </span>
              </div>
            )}
            {!scheduledDescribed && consultation.durationMinutes === null && !consultation.specialty && consultation.feeSar === null && (
              <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا تفاصيل إضافية مسجَّلة بعد.</p>
            )}
          </motion.div>

          {/* Request description */}
          {consultation.description && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }} className={`${card} p-4`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>وصف الطلب</p>
              <p className={`text-[13px] leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{consultation.description}</p>
            </motion.div>
          )}

          {/* Delivered opinion */}
          {consultation.opinionText && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className={`${card} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={15} className="text-emerald-500" weight="duotone" />
                <p className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الرأي القانوني المُسلَّم</p>
              </div>
              <p className={`text-[13px] leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{consultation.opinionText}</p>
              {opinionDeliveredDescribed && (
                <p className={`mt-2 text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>سُلِّم في {opinionDeliveredDescribed}</p>
              )}
            </motion.div>
          )}

          {/* Notes */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <LockKey size={15} className="text-amber-500" weight="duotone" />
                <span className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>ملاحظات</span>
                {(notesView === "ready" || notesView === "empty") && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>{notes.length}</span>
                )}
              </div>
            </div>

            <div className="p-4">
              <div className={`flex flex-col gap-2 p-3 rounded-xl border ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-slate-200 bg-slate-50"}`}>
                <textarea
                  value={noteBody} onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="أضف ملاحظة جديدة..."
                  onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) submitNote(); }}
                  rows={2}
                  className={`w-full bg-transparent text-[12px] outline-none resize-none ${isDark ? "text-zinc-300 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-[10px]">
                    <button type="button" onClick={() => setNoteVisibility("private")}
                      className={`px-2 py-1 rounded-lg font-bold transition-colors ${
                        noteVisibility === "private"
                          ? isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"
                          : isDark ? "text-zinc-600" : "text-slate-400"
                      }`}>خاصة بي</button>
                    <button type="button" disabled={!consultation.firmId} onClick={() => setNoteVisibility("firm")}
                      title={!consultation.firmId ? "هذه الاستشارة غير مرتبطة بمكتب" : undefined}
                      className={`px-2 py-1 rounded-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        noteVisibility === "firm"
                          ? isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"
                          : isDark ? "text-zinc-600" : "text-slate-400"
                      }`}>للمكتب</button>
                  </div>
                  <button onClick={submitNote}
                    disabled={!noteBody.trim() || addingNote}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold hover:bg-amber-600 disabled:opacity-40 transition-all">
                    {addingNote ? "جارٍ الحفظ…" : "إضافة"}
                  </button>
                </div>
                {!consultation.firmId && (
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>هذه الاستشارة غير مرتبطة بمكتب — «للمكتب» غير متاحة.</p>
                )}
              </div>

              {noteError && <p className="mt-2 text-[11px] font-semibold text-red-500">{noteError}</p>}

              <div className="mt-3 space-y-2">
                {notesView === "loading" && (
                  <div className="text-center py-4">
                    <div className="inline-block w-5 h-5 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
                  </div>
                )}
                {notesView === "unreadable" && (
                  <div className="text-center py-4">
                    <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة الملاحظات</p>
                    <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هذه ليست قائمة فارغة — قد توجد ملاحظات لم تُقرأ.</p>
                    <button onClick={loadNotes} className="mt-1.5 flex items-center gap-1 mx-auto text-[10px] font-bold text-royal hover:underline">
                      <ArrowClockwise size={11} /> إعادة المحاولة
                    </button>
                  </div>
                )}
                {notesView === "empty" && (
                  <p className={`text-center text-[11px] py-4 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد ملاحظات بعد</p>
                )}
                {notesView === "ready" && notes.map((note) => (
                  <motion.div key={note.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className={`relative p-3 rounded-xl border text-[11px] leading-relaxed transition-all ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-white"}`}>
                    <p className={`mb-1.5 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{note.body}</p>
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-2 text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        {note.authorName ?? "مستخدم"} · {formatDateTimeAr(note.createdAt) ?? note.createdAt}
                        <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                          note.visibility === "firm"
                            ? isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                            : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"
                        }`}>{note.visibility === "firm" ? "للمكتب" : "خاصة بي"}</span>
                      </span>
                      {note.authorUserId === user.userId && (
                        <button onClick={() => removeNote(note.id)} disabled={deletingNoteId === note.id}
                          className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold transition-all disabled:opacity-40 ${isDark ? "text-zinc-700 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}>
                          <Trash size={10} /> حذف
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Right column: client card ── */}
        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className={`${card} p-4 space-y-2.5`}>
            <div className="flex items-center gap-2">
              <User size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} weight="duotone" />
              <p className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{consultation.clientName}</p>
            </div>
            {consultation.clientPhone && (
              <div className="flex items-center gap-2 text-[12px]">
                <Phone size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                <span className={isDark ? "text-zinc-400" : "text-slate-500"}>{consultation.clientPhone}</span>
              </div>
            )}
            {consultation.clientEmail && (
              <div className="flex items-center gap-2 text-[12px] dir-ltr">
                <EnvelopeSimple size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                <span className={isDark ? "text-zinc-400" : "text-slate-500"}>{consultation.clientEmail}</span>
              </div>
            )}
            {basePath === "/dashboard/lawyer" && consultation.lawyerClientId && (
              <Link
                href={`/dashboard/lawyer/clients/${consultation.lawyerClientId}`}
                className={`inline-flex items-center gap-1.5 mt-1 text-[11px] font-bold hover:underline ${isDark ? "text-emerald-300" : "text-emerald-700"}`}
              >
                <IdentificationCard size={12} /> بطاقة الموكّل
              </Link>
            )}
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {activeAction && (
          <ConsultationActionModal
            consultation={consultation}
            action={activeAction}
            isDark={isDark}
            onClose={() => setActiveAction(null)}
            onDone={handleActionDone}
            basePath={basePath}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
