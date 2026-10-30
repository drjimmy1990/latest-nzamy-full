"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, LinkBreak, Scales } from "@phosphor-icons/react";
import { createWorkflowRequest, getWorkflowRequestsByReceiver } from "@/lib/services/workflowService";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { createLawyerHearing } from "@/lib/services/lawyerHearingsService";
import type { WorkflowRequest } from "@/lib/workflowStore";
import ModalShell from "@/components/ui/ModalShell";
import { isLawyerCaseRow } from "../cases/_caseListRules";
import { createWorkflowId } from "@/lib/workflowStore";
import type { UserType, UserTier } from "@/hooks/useUser";
import { describeDateAr, toArabicDigits } from "@/lib/services/hijri";
import DualDatePicker from "@/components/ui/DualDatePicker";
import { getHearingLocationField } from "./hearingLocationField";
import { formatDurationAr, HEARING_DURATION_LABEL_AR, HEARING_DURATION_OPTIONS } from "@/lib/services/item59Labels";

interface Props {
  onClose: () => void;
  isDark: boolean;
  /**
   * Current user context from the parent page (useUser()). REQUIRED — the
   * Phase 1 write path (POST /api/v1/lawyer/hearings) resolves the owner from
   * the session itself, but `user.userId` still gates the save client-side so
   * a not-yet-resolved session cannot submit a request that would 401.
   */
  user: { userId?: string; name: string; userType: UserType; tier: UserTier };
  /**
   * When opened from a case file, the case this hearing belongs to. Passed
   * straight through as `caseRequestId` — the case-name text field is hidden
   * in that mode since the case is already known, not asked for twice.
   */
  caseRequestId?: string;
  /**
   * The case title, when opened from a case file — display only (CODE-F17):
   * the server stamps the linked case's own title, never this text.
   */
  defaultCaseName?: string;
  /**
   * Prefills the date field, e.g. when opened by double-clicking a day on the
   * calendar grid. Expected as "YYYY-MM-DD" — the same shape the date input
   * and the hearings rows use. The lawyer can still change it before saving.
   */
  initialDate?: string;
}

type Urgency = "critical" | "high" | "normal";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "hearing",      label: "جلسة قضائية" },
  { value: "deadline",     label: "موعد طعن / نهائي" },
  { value: "gov_review",   label: "مراجعة جهة حكومية" },
  { value: "client_meet",  label: "اجتماع موكل" },
  { value: "internal",     label: "أخرى" },
];

/** A case the general add can link to — the same rows /dashboard/lawyer/cases lists. */
export interface LinkableCase { id: string; title: string; client: string }

/**
 * CODE-F17 / LIVE-F28: the cases the general add may link a hearing to.
 * Same source and same `isLawyerCaseRow` rule as the case list, so the picker
 * cannot offer a task, a CRM client or an invoice as a «case». Cancelled cases
 * are left out; a completed one stays (an enforcement sitting can follow a
 * judgment).
 */
export async function loadLinkableCases(): Promise<LinkableCase[]> {
  const rows = isSupabaseMode
    ? (await apiGet<{ data?: WorkflowRequest[]; degraded?: boolean }>("/api/v1/service-requests", { receiver: "lawyer", limit: 200 }))
    : { data: await getWorkflowRequestsByReceiver("lawyer"), degraded: false };
  // The route answers a failed query with 200 + degraded — a failure, not «no cases».
  if (rows.degraded) throw new Error("degraded");
  return (rows.data ?? [])
    .filter(isLawyerCaseRow)
    .filter(r => r.status !== "cancelled")
    .map(r => ({ id: r.id, title: r.title || "قضية بدون عنوان", client: r.requester?.name || "" }));
}

export default function AddHearingModal({ onClose, isDark, user, caseRequestId, defaultCaseName, initialDate }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the SERVER stored — the success screen reads this, not the form.
  const [saved, setSaved] = useState<{ date: string; linked: boolean; caseName?: string } | null>(null);
  const typeRef = useRef<HTMLSelectElement | null>(null);

  // Controlled inputs
  const [type, setType] = useState("");
  // CODE-F17: in the general add this is a LABEL for an appointment that has
  // no case (a first meeting, a government review). It never links anything.
  const [caseName, setCaseName] = useState("");
  // CODE-F17: the link itself, by id. Fixed to `caseRequestId` from a case file.
  const [linkedCaseId, setLinkedCaseId] = useState("");
  const [cases, setCases] = useState<LinkableCase[] | null>(null);
  const [casesState, setCasesState] = useState<"idle" | "loading" | "error" | "ready">(caseRequestId ? "idle" : "loading");
  const [caseQuery, setCaseQuery] = useState("");
  const [date, setDate] = useState(initialDate ?? "");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [location, setLocation] = useState("");
  // «مدة الجلسة» (owner item 59), in minutes as the select's string value;
  // "" = not set.
  const [duration, setDuration] = useState("");

  // Row 70: step 2 no longer shows the same flat "الموقع" field for every
  // type. `null` here means the field is hidden for this type (a deadline
  // has no location) — see hearingLocationField.ts for why the other three
  // named types relabel this ONE column instead of getting fields of their
  // own.
  const locationField = getHearingLocationField(type);
  // What actually gets saved for `location`: never the field's leftover
  // text from a type the lawyer has since switched away from. Switching
  // from «جلسة قضائية» (courtroom filled in) to «موعد طعن / نهائي» (no
  // location field shown) must not silently carry the old courtroom text
  // into a deadline row nobody can see it was set on.
  const effectiveLocation = locationField ? location : "";
  // Same rule for the duration: a deadline has no length, so a value picked
  // before switching to «موعد طعن / نهائي» is not saved on it.
  const showDuration = type !== "deadline";
  const effectiveDuration = showDuration && duration ? Number(duration) : null;

  const fetchCases = () =>
    loadLinkableCases()
      .then(list => { setCases(list); setCasesState("ready"); })
      .catch(err => { console.error("[AddHearingModal] cases load failed:", err); setCasesState("error"); });
  // The retry button: back to «loading», then read again.
  const loadCases = () => { setCasesState("loading"); void fetchCases(); };
  // First read: the state already starts at «loading» in the general add.
  useEffect(() => { if (!caseRequestId) void fetchCases(); }, [caseRequestId]);

  const selectedCase = cases?.find(c => c.id === linkedCaseId) ?? null;
  const visibleCases = (cases ?? []).filter(c => {
    const q = caseQuery.trim();
    return !q || c.title.includes(q) || c.client.includes(q) || c.id === linkedCaseId;
  });

  // LIVE-F29: ask before discarding typed input — anything that differs from
  // what the dialog opened with.
  const dirty = !done && (
    type !== "" || caseName.trim() !== "" || linkedCaseId !== "" || date !== (initialDate ?? "") ||
    time !== "" || notes.trim() !== "" || location.trim() !== "" || duration !== "" || urgency !== "normal"
  );

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  const urgencyBtn = (key: Urgency, label: string, activeCls: string) => (
    <button
      type="button"
      onClick={() => setUrgency(key)}
      className={`rounded-xl border py-2 text-[12px] font-bold transition-all focus:ring-2 focus:ring-offset-0 ${urgency === key ? activeCls : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"}`}
    >
      {label}
    </button>
  );

  async function handleSave() {
    // A hearing with no date is not a diary entry — the calendar has nowhere to
    // put it, and the old code defaulted it to "today, forever". The date input
    // is now gated in step 1 as well; this is the backstop.
    if (!date) {
      setError("حدِّد تاريخ الموعد قبل الحفظ — لا يمكن إدراج موعد بلا تاريخ في الجدول.");
      setStep(1);
      return;
    }
    // Refuse to write a row nobody owns. `assigned_to = null` on a
    // receiver="lawyer" row is exactly the shape the marketplace browse policy
    // opens to every verified lawyer, so an unowned hearing is both invisible
    // to its author's own filters and visible to strangers.
    if (!user.userId) {
      setError("تعذّر تحديد حسابك. أعد تحميل الصفحة ثم حاول مرة أخرى.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const typeLabel = TYPE_OPTIONS.find(t => t.value === type)?.label ?? "جلسة";
      // The case-name branch used to hardcode a title regardless of which type
      // was picked, so «موعد طعن / نهائي» was saved with a title reading
      // «جلسة — قضية الأفق» and read as a court sitting everywhere a title is
      // shown, while the type beneath it still said deadline. typeLabel is
      // the label the lawyer actually chose, already in hand one line up.
      // CODE-F17: a linked hearing is named after its case; an unlinked one
      // after its label. Display only — the link is `caseRequestId`.
      const linkId = caseRequestId ?? (linkedCaseId || undefined);
      const shownName = caseRequestId
        ? (defaultCaseName ?? "").trim()
        : selectedCase ? selectedCase.title : caseName.trim();
      const title = shownName ? typeLabel + " — " + shownName : typeLabel;

      // Phase 1: hearings live in their own table now (public.hearings), not
      // a metadata-flagged service_requests row. NOT createWorkflowRequest()
      // in supabase mode — that helper catches a failed POST and writes to
      // localStorage instead, so it resolves successfully on a 401/500/RLS
      // refusal and the lawyer reads «تم إضافة الموعد بنجاح» over a hearing
      // that existed only in this browser and never appeared in any list
      // again. apiMutate throws on any non-2xx and the error reaches the
      // lawyer instead.
      //
      // Demo mode still uses the old local-store path below: there it is the
      // real backend and genuinely round-trips. The lie was supabase-only.
      if (isSupabaseMode) {
        // The free-text label travels only when no case is linked; the server
        // ignores it for a linked row anyway and stores the case's own title.
        const created = await createLawyerHearing({
          type, date, time, caseName: linkId ? undefined : caseName, caseRequestId: linkId, urgency,
          location: effectiveLocation, notes, title, durationMinutes: effectiveDuration,
        });
        setSaved({ date: created.date, linked: !!created.caseRequestId, caseName: created.caseName });
      } else {
        const id = createWorkflowId();
        await createWorkflowRequest({
          id,
          type: "service" as const,
          title,
          description: notes.trim(),
          receiver: "lawyer" as const,
          status: "pending_assignment" as const,
          requester: {
            userId: user.userId,
            name: user.name || "محامي نظامي",
            role: user.userType ?? "lawyer",
            tier: user.tier ?? "free",
          },
          payment: { amount: 0, status: "not_required" as const },
          sourcePath: "",
          metadata: { hearing: true, date, time, type, urgency, location: effectiveLocation, notes, caseName: shownName, durationMinutes: effectiveDuration },
          assignedTo: user.userId,
        });
        setSaved({ date, linked: false, caseName: shownName || undefined });
      }
      setDone(true);
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
    } catch (err) {
      console.error("[AddHearingModal] save failed:", err);
      setError(
        err instanceof Error && err.message
          ? `تعذّر إضافة الموعد: ${err.message}`
          : "تعذّر إضافة الموعد. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
    }
  }

  // LIVE-F29 / CODE-F34: the shared dialog frame — role="dialog", aria-modal,
  // a named close button, Escape from any field, Tab kept inside, focus back
  // to the opener; no exit while `saving`, a question first while `dirty`.
  // `z-[60]` stays explicit: it is the lowest overlay layer, the FAB sits under it.
  return (
    <ModalShell
      title="إضافة موعد / جلسة جديدة"
      onClose={onClose}
      isDark={isDark}
      busy={saving}
      dirty={dirty}
      zIndexClass="z-[60]"
      initialFocusRef={typeRef}
    >
        {done ? (
          <div className="text-center py-6" role="status">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] flex-col ${isDark ? "text-white" : "text-zinc-900"}`}>تم حفظ الموعد</p>
            {/* What the SERVER stored — its date and whether it is linked — not
                what the form held. «مرتبط» is said only for a row that came
                back with a case id. */}
            <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              {saved && describeDateAr(saved.date) ? describeDateAr(saved.date) : "تم حفظ الموعد في جدول أعمالك."}
            </p>
            <p className={`text-[12px] mt-1 mb-4 font-semibold ${saved?.linked ? (isDark ? "text-emerald-400" : "text-emerald-700") : (isDark ? "text-amber-400" : "text-amber-700")}`}>
              {saved?.linked
                ? `مرتبط بالقضية «${saved.caseName ?? ""}» — يظهر في ملفها.`
                : "غير مرتبط بأي قضية — يظهر في جدول المواعيد فقط."}
            </p>
            <button onClick={onClose} className="rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition">
              إغلاق
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {error}
              </div>
            )}
            {/* «الخطوة ١ من ٢».
                The primary button reads «الخطوة التالية», which promises a
                multi-step flow, and nothing on screen said how many steps there
                were or which one you were on (shot 25). The add-client modal in
                this same product already shows «الخطوة N من ٣»; this one showed
                nothing, so the two dialogs taught the lawyer two different
                things about how dialogs behave here. */}
            <div className="mb-4 flex items-center gap-2">
              {[1, 2].map(n => (
                <div key={n} className="flex flex-1 flex-col gap-1.5">
                  <div className={`h-1 rounded-full ${n <= step ? "bg-[#0B3D2E] dark:bg-emerald-500" : isDark ? "bg-white/[0.08]" : "bg-slate-200"}`} />
                </div>
              ))}
              <span className={`shrink-0 text-[11px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {`الخطوة ${toArabicDigits(step)} من ٢`}
              </span>
            </div>

            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                  <div>
                    <label htmlFor="add-hearing-type" className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>نوع الموعد</label>
                    <select id="add-hearing-type" ref={typeRef} value={type} onChange={e => setType(e.target.value)} className={inputCls}>
                      {/* Was «اختر التصنيف...» under a label reading «نوع الموعد» —
                          two different words for one field, in one control. */}
                      <option value="" disabled>اختر نوع الموعد...</option>
                      {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {/* From a case file the case is fixed (`caseRequestId`) and
                      shown, not asked for. In the general add, CODE-F17 /
                      LIVE-F28: the old free-text «القضية / الموكل» box saved a
                      typed case title as plain text — a hearing that showed in
                      the archive and never in the case file. The link is now
                      PICKED, by id, from the lawyer's own cases; the text box
                      is a label for an appointment that has no case, and says
                      so. */}
                  {caseRequestId ? (
                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-emerald-700/30 bg-emerald-900/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                      <Scales size={13} aria-hidden="true" />
                      <span className="truncate">القضية: {defaultCaseName || "هذه القضية"}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label htmlFor="add-hearing-case" className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ربط بقضية (اختياري)</label>
                        {casesState === "ready" && (cases?.length ?? 0) > 8 && (
                          <input type="search" value={caseQuery} onChange={e => setCaseQuery(e.target.value)}
                            aria-label="ابحث في قضاياك" placeholder="ابحث باسم القضية أو الموكل..." className={`${inputCls} mb-1.5`} />
                        )}
                        <select id="add-hearing-case" value={linkedCaseId} onChange={e => setLinkedCaseId(e.target.value)}
                          disabled={casesState !== "ready"} className={`${inputCls} disabled:opacity-60`}>
                          <option value="">
                            {casesState === "loading" ? "جارٍ تحميل قضاياك…"
                              : casesState === "error" ? "تعذّر تحميل قضاياك"
                              : (cases?.length ?? 0) === 0 ? "لا توجد لديك قضايا — موعد غير مرتبط"
                              : "— موعد غير مرتبط بقضية —"}
                          </option>
                          {visibleCases.map(c => (
                            <option key={c.id} value={c.id}>{c.client ? `${c.title} — ${c.client}` : c.title}</option>
                          ))}
                        </select>
                        {casesState === "error" && (
                          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                            تعذّر تحميل قائمة قضاياك، فلا يمكن الربط الآن.{" "}
                            <button type="button" onClick={loadCases} className="font-bold underline">إعادة المحاولة</button>
                          </p>
                        )}
                      </div>
                      {!linkedCaseId && (
                        <div>
                          <label htmlFor="add-hearing-label" className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>وصف الموعد (اختياري)</label>
                          <input id="add-hearing-label" type="text" value={caseName} onChange={e => setCaseName(e.target.value)}
                            aria-describedby="add-hearing-label-note" placeholder="مثال: اجتماع أولي مع موكل جديد" className={inputCls} />
                          <p id="add-hearing-label-note" className={`mt-1 flex items-center gap-1 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                            <LinkBreak size={11} aria-hidden="true" />
                            نص للعرض فقط — لا يربط الموعد بأي قضية. للربط اختر القضية من القائمة أعلاه.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>التاريخ <span className="text-red-500">*</span></label>
                      <DualDatePicker label="تاريخ الموعد" value={date} onChange={setDate} className={inputCls} />
                    </div>
                    <div>
                      {/* «(اختياري)» because it IS optional and was not saying so.
                          A hearing saved with a date and no time is a real state
                          this form allows; the read-back below names it rather
                          than letting the lawyer find out on the calendar. */}
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الوقت <span className={isDark ? "text-zinc-500" : "text-slate-400"}>(اختياري)</span></label>
                      <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
                    </div>
                  </div>

                  {/* The date read back in words, directly under the field that
                      produced it — see describeDateAr for why this is a safety
                      control and not a nicety. */}
                  {date && describeDateAr(date) && (
                    <div className={`rounded-xl px-3 py-2 border ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                      <p className={`text-[11px] font-semibold leading-relaxed ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>
                        {describeDateAr(date)}
                        {time ? ` — الساعة ${toArabicDigits(time)}` : " — بدون وقت محدد"}
                      </p>
                    </div>
                  )}

                  {/* The required-field message used to sit BELOW the submit
                      button, so a disabled button gave no clue which field was
                      blocking it (shot 25). It sits under its own fields now and
                      names the one that is missing instead of assuming the date. */}
                  {(!type || !date) && (
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                      {!type && !date
                        ? "اختر نوع الموعد وحدّد التاريخ للمتابعة."
                        : !type
                          ? "اختر نوع الموعد للمتابعة."
                          : "التاريخ مطلوب — بدونه لن يظهر الموعد في جدول أعمالك."}
                    </p>
                  )}

                  {/* Both gates are real: a typeless row renders under the wrong
                      badge, and a dateless row has nowhere to sit on a calendar. */}
                  {/* A DISABLED PALETTE, not `disabled:opacity-40`.
                      Fading the button fades its LABEL with it: dark green at
                      40% is a washed sage and «#C8A762» on top of it is barely
                      readable, which is what shot 20 shows. Opacity is the
                      wrong tool for "off" — it makes the control quieter AND
                      less legible, when the whole job of a disabled control is
                      to stay readable while refusing the click.
                      A flat neutral surface with mid-grey text reads as off and
                      stays legible. `cursor-not-allowed` says the same thing to
                      the pointer. */}
                  <button onClick={() => setStep(2)} disabled={!type || !date}
                    className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition mt-2 ${
                      (!type || !date)
                        ? isDark
                          ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                          : "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
                    }`}>
                    الخطوة التالية
                  </button>
                </motion.div>
              )}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                  {/* Row 70: one flat "الموقع" field used to show for every
                      type, so a deadline offered a courtroom box it had no
                      use for and a government review had nowhere honest to
                      put the authority's name. `locationField` relabels the
                      one column that actually saves (see
                      hearingLocationField.ts) per type, and is `null` — the
                      field is not rendered at all — for a deadline. */}
                  {locationField && (
                    <div>
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{locationField.label}</label>
                      <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder={locationField.placeholder} className={inputCls} />
                    </div>
                  )}
                  {/* «مدة الجلسة» (owner item 59) → hearings.duration_minutes.
                      Optional; hidden for a deadline, like the location. */}
                  {showDuration && (
                    <div>
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{HEARING_DURATION_LABEL_AR} <span className={isDark ? "text-zinc-500" : "text-slate-400"}>(اختياري)</span></label>
                      <select value={duration} onChange={e => setDuration(e.target.value)} className={inputCls}>
                        <option value="">—</option>
                        {HEARING_DURATION_OPTIONS.map(m => <option key={m} value={String(m)}>{formatDurationAr(m)}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ملاحظات والتزامات</label>
                    <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي مستندات مطلوبة للصياغة؟" className={`${inputCls} resize-none`} />
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مستوى الأهمية / الاستعجال</label>
                    <div className="grid grid-cols-3 gap-2">
                      {urgencyBtn("critical", "حرجة", isDark ? "border-red-500/30 bg-red-500/10 text-red-400 focus:ring-red-500/50" : "border-red-200 bg-red-50 text-red-600 focus:ring-red-500/50")}
                      {urgencyBtn("high", "عاجلة", isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-400 focus:ring-amber-500/50" : "border-amber-200 bg-amber-50 text-amber-600 focus:ring-amber-500/50")}
                      {urgencyBtn("normal", "طبيعية", isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300 focus:ring-blue-500/50" : "border-slate-200 bg-white text-slate-600 focus:ring-blue-500/50")}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button onClick={() => setStep(1)} className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold transition ${isDark ? "bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      رجوع
                    </button>
                    <button onClick={handleSave} disabled={saving} className="flex-[2] rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold hover:bg-[#092e22] shadow-[0_4px_12px_rgba(11,61,46,0.3)] transition disabled:opacity-50">
                      {saving ? "جارٍ الحفظ..." : "حفظ الموعد"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
    </ModalShell>
  );
}