"use client";

/**
 * CODE-F18 — one dialog for every change to an existing hearing:
 * تعديل / تأجيل / إلغاء / انعقدت / إعادة جدولة.
 *
 * The rules live on the server (planHearingChange in
 * src/lib/services/hearingChange.ts): which action is allowed from which
 * status, which need a reason, and that a postponement must move the day or
 * the hour. This dialog only collects the fields and shows the server's own
 * refusal verbatim — it never claims a change the server did not make. On
 * success it hands the row the SERVER returned to `onSaved`, and fires
 * «nzamy-workflow-updated» so the diary, the case file and the dashboard
 * re-read their lists.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ModalShell from "@/components/ui/ModalShell";
import { updateLawyerHearing, type HearingDto, type UpdateHearingInput } from "@/lib/services/lawyerHearingsService";
import {
  actionNeedsReason, HEARING_ACTION_LABEL_AR, HEARING_REASON_MAX, type HearingAction,
} from "@/lib/services/hearingChange";
import { useRiyadhToday } from "@/hooks/useRiyadhToday";
import { loadLinkableCases, type LinkableCase } from "../_components/AddHearingModal";

export interface HearingForAction {
  id: string;
  title: string;
  status: string;
  date: string;
  time?: string;
  location?: string;
  notes?: string;
  caseId?: string;
  caseName?: string;
}

const PROMPT_AR: Record<HearingAction, string> = {
  edit: "عدّل بيانات الموعد. تغيير التاريخ يكون بـ«تأجيل».",
  postpone: "حدِّد التاريخ أو الوقت الجديد وسبب التأجيل. التذكيرات تُعاد جدولتها على الموعد الجديد.",
  cancel: "يُلغى الموعد ويُوقَف كل تذكير لم يُرسل بعد. يبقى في الأرشيف مع سبب الإلغاء.",
  complete: "سجّل أن الجلسة انعقدت. لتسجيل ما صدر فيها استخدم «تسجيل نتيجة المرحلة» في ملف القضية.",
  reopen: "تعود الحالة إلى «مجدولة». إن كان يومه قد مضى فحدِّد تاريخاً جديداً.",
};

export default function HearingActionDialog({
  hearing, action, isDark, onClose, onSaved,
}: {
  hearing: HearingForAction;
  action: HearingAction;
  isDark: boolean;
  onClose: () => void;
  onSaved?: (row: HearingDto) => void;
}) {
  const today = useRiyadhToday();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(action === "postpone" ? hearing.date : "");
  const [time, setTime] = useState(hearing.time ?? "");
  const [title, setTitle] = useState(hearing.title);
  const [location, setLocation] = useState(hearing.location ?? "");
  const [notes, setNotes] = useState(hearing.notes ?? "");
  const [caseId, setCaseId] = useState(hearing.caseId ?? "");
  const [cases, setCases] = useState<LinkableCase[] | null>(null);
  const [casesState, setCasesState] = useState<"idle" | "loading" | "error" | "ready">(action === "edit" ? "loading" : "idle");
  const firstRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  useEffect(() => {
    if (action !== "edit") return;
    let live = true;
    loadLinkableCases()
      .then(list => { if (live) { setCases(list); setCasesState("ready"); } })
      .catch(() => { if (live) setCasesState("error"); });
    return () => { live = false; };
  }, [action]);

  const needsReason = actionNeedsReason(action);
  // Reopening a row whose day has passed needs a new day (server rule too).
  const reopenNeedsDate = action === "reopen" && !!today && hearing.date < today;
  const showDate = action === "postpone" || reopenNeedsDate;
  const showTime = action === "postpone" || action === "edit";

  const editChanges: Partial<UpdateHearingInput> = {};
  if (action === "edit") {
    if (title.trim() !== hearing.title) editChanges.title = title.trim();
    if ((time || "") !== (hearing.time ?? "")) editChanges.time = time || null;
    if (location.trim() !== (hearing.location ?? "")) editChanges.location = location.trim();
    if (notes.trim() !== (hearing.notes ?? "")) editChanges.notes = notes.trim();
    if (caseId !== (hearing.caseId ?? "")) editChanges.caseRequestId = caseId || null;
  }
  const dirty = !!reason.trim() || (action === "edit" ? Object.keys(editChanges).length > 0
    : showDate ? date !== (action === "postpone" ? hearing.date : "") || (time || "") !== (hearing.time ?? "") : false);

  const submit = async () => {
    setError(null);
    if (needsReason && !reason.trim()) { setError("اذكر سبب التغيير — يُحفظ في سجل الموعد."); return; }
    if (showDate && !date) { setError("حدِّد التاريخ الجديد."); return; }
    if (action === "edit" && Object.keys(editChanges).length === 0) { setError("لم تغيّر شيئاً بعد."); return; }
    const input: UpdateHearingInput = { action, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    if (action === "postpone") Object.assign(input, { date, time: time || null });
    if (reopenNeedsDate) input.date = date;
    if (action === "edit") Object.assign(input, editChanges);
    setSaving(true);
    try {
      const row = await updateLawyerHearing(hearing.id, input);
      window.dispatchEvent(new Event("nzamy-workflow-updated"));
      onSaved?.(row);
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "تعذّر حفظ التغيير.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = `w-full rounded-xl border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-royal/30 ${isDark ? "bg-zinc-800 border-white/[0.08] text-zinc-100" : "bg-white border-slate-200 text-slate-800"}`;
  const labelCls = `block text-[12px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  const danger = action === "cancel";

  // Portalled: the diary card that opens this is a framer-motion `layout` box
  // (a CSS transform) with overflow hidden, which would trap and clip a
  // `position: fixed` overlay rendered inside it.
  return createPortal(
    <ModalShell
      title={`${HEARING_ACTION_LABEL_AR[action]} — ${hearing.title}`}
      subtitle={PROMPT_AR[action]}
      onClose={onClose}
      isDark={isDark}
      busy={saving}
      dirty={dirty}
      zIndexClass="z-[60]"
      initialFocusRef={firstRef}
    >
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
        {action === "edit" && (
          <>
            <div>
              <label htmlFor="ha-title" className={labelCls}>العنوان</label>
              <input id="ha-title" ref={firstRef} value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="ha-case" className={labelCls}>القضية المرتبطة</label>
              <select id="ha-case" value={caseId} onChange={e => setCaseId(e.target.value)} disabled={casesState !== "ready"} className={`${inputCls} disabled:opacity-60`}>
                <option value="">{casesState === "loading" ? "جارٍ تحميل قضاياك…" : casesState === "error" ? "تعذّر تحميل قضاياك" : "— موعد غير مرتبط بقضية —"}</option>
                {hearing.caseId && !(cases ?? []).some(c => c.id === hearing.caseId) && (
                  <option value={hearing.caseId}>{hearing.caseName || "القضية الحالية"}</option>
                )}
                {(cases ?? []).map(c => <option key={c.id} value={c.id}>{c.client ? `${c.title} — ${c.client}` : c.title}</option>)}
              </select>
            </div>
          </>
        )}
        {showDate && (
          <div>
            <label htmlFor="ha-date" className={labelCls}>التاريخ الجديد</label>
            <input id="ha-date" type="date" min={today || undefined} value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
        )}
        {showTime && (
          <div>
            <label htmlFor="ha-time" className={labelCls}>الوقت {action === "postpone" ? "الجديد" : ""} (اختياري)</label>
            <input id="ha-time" type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
          </div>
        )}
        {action === "edit" && (
          <>
            <div>
              <label htmlFor="ha-location" className={labelCls}>المكان</label>
              <input id="ha-location" value={location} onChange={e => setLocation(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="ha-notes" className={labelCls}>ملاحظات</label>
              <textarea id="ha-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
            </div>
          </>
        )}
        <div>
          <label htmlFor="ha-reason" className={labelCls}>
            السبب {needsReason ? <span className="text-red-500">(مطلوب)</span> : "(اختياري)"}
          </label>
          <textarea
            id="ha-reason"
            ref={action === "edit" ? undefined : firstRef}
            rows={2}
            maxLength={HEARING_REASON_MAX}
            value={reason}
            onChange={e => setReason(e.target.value)}
            aria-required={needsReason || undefined}
            placeholder={action === "postpone" ? "مثال: طلب الطرف الآخر مهلة للرد" : action === "cancel" ? "مثال: تم الصلح خارج المحكمة" : ""}
            className={inputCls}
          />
          <p className={`mt-1 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>يُحفظ في سجل تغييرات الموعد وسجل نشاط القضية.</p>
        </div>
        {error && <p role="alert" className="text-[12px] font-semibold text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving}
            className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-60 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-royal hover:opacity-90"}`}>
            {saving ? "جارٍ الحفظ…" : HEARING_ACTION_LABEL_AR[action]}
          </button>
          <button type="button" onClick={onClose} disabled={saving}
            className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>
            رجوع
          </button>
        </div>
      </form>
    </ModalShell>,
    document.body,
  );
}
