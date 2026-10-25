"use client";

/**
 * NoteEditorModal — write or edit one sticky note (N3.4). Opened by the wall
 * and by «+ إضافة سريعة» → «ملاحظة». Nothing is kept in the browser: the note
 * is saved through /api/v1/lawyer/dashboard-notes, and the wall re-reads on
 * the DASHBOARD_NOTES_EVENT the service fires.
 */

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { XCircle, PushPin } from "@phosphor-icons/react";
import { CasePicker } from "@/components/ui/CasePicker";
import {
  MAX_NOTE_BODY,
  NOTE_COLORS,
  NOTE_COLOR_LABEL_AR,
  NOTE_VISIBILITIES,
  NOTE_VISIBILITY_LABEL_AR,
  type NoteColor,
  type NoteVisibility,
} from "@/lib/dashboardNotes/notesInput";
import {
  createDashboardNote,
  updateDashboardNote,
  type DashboardNote,
} from "@/lib/services/dashboardNotesService";
import { NOTE_SWATCH_CLASS } from "./noteColors";

interface Props {
  isDark: boolean;
  onClose: () => void;
  /** Editing an existing note of the caller's; absent = a new note. */
  note?: DashboardNote | null;
  onSaved?: (note: DashboardNote) => void;
}

export default function NoteEditorModal({ isDark, onClose, note, onSaved }: Props) {
  const [body, setBody] = useState(note?.body ?? "");
  const [color, setColor] = useState<NoteColor>(note?.color ?? "amber");
  const [visibility, setVisibility] = useState<NoteVisibility>(note?.visibility ?? "private");
  const [caseId, setCaseId] = useState<string>(note?.caseRequestId ?? "");
  const [pinned, setPinned] = useState<boolean>(note?.pinned ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = body.trim();
  const needsCase = visibility === "case_team" && !caseId;
  const canSave = !saving && trimmed.length > 0 && body.length <= MAX_NOTE_BODY && !needsCase;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const input = { body: trimmed, color, pinned, visibility, caseRequestId: caseId || null };
      const saved = note ? await updateDashboardNote(note.id, input) : await createDashboardNote(input);
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر حفظ الملاحظة.");
    } finally {
      setSaving(false);
    }
  }

  const label = `block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  const field = `w-full rounded-xl border px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${
    isDark ? "bg-zinc-950 border-white/10 text-zinc-100 placeholder:text-zinc-600" : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
  }`;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id={titleId} className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
            {note ? "تعديل الملاحظة" : "ملاحظة جديدة"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}
          >
            <XCircle size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {error && (
            <div role="alert" className={`rounded-xl px-3 py-2 text-[12px] font-semibold border ${isDark ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-red-50 text-red-700 border-red-200"}`}>
              {error}
            </div>
          )}

          <div>
            <label htmlFor={bodyId} className={label}>نص الملاحظة <span className="text-red-500">*</span></label>
            <textarea
              id={bodyId}
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_NOTE_BODY}
              rows={5}
              placeholder="مثال: الاتصال بالموكل لإحضار أصل الوكالة قبل الجلسة"
              className={`${field} resize-y leading-relaxed`}
            />
            <p className={`mt-1 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`} aria-live="polite">
              {body.length.toLocaleString("ar-EG")} / {MAX_NOTE_BODY.toLocaleString("ar-EG")}
            </p>
          </div>

          <fieldset>
            <legend className={label}>اللون</legend>
            <div className="flex gap-2" role="radiogroup" aria-label="لون الملاحظة">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={NOTE_COLOR_LABEL_AR[c]}
                  title={NOTE_COLOR_LABEL_AR[c]}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${NOTE_SWATCH_CLASS[c]} ${
                    color === c ? (isDark ? "border-white" : "border-slate-800") : "border-transparent"
                  }`}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={label}>من يرى الملاحظة</legend>
            <div className="grid grid-cols-3 gap-2">
              {NOTE_VISIBILITIES.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={visibility === v}
                  onClick={() => setVisibility(v)}
                  className={`rounded-xl border px-2 py-2 text-[12px] font-bold transition ${
                    visibility === v
                      ? "bg-[#0B3D2E] text-white border-[#0B3D2E] dark:bg-[#C8A762] dark:text-[#0B3D2E] dark:border-[#C8A762]"
                      : isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {NOTE_VISIBILITY_LABEL_AR[v]}
                </button>
              ))}
            </div>
            {visibility === "case_team" && (
              <p className={`mt-1.5 text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                فريق القضية: المحامي المسؤول وأعضاء المكتب المضافون إلى القضية. اختر القضية أدناه.
              </p>
            )}
          </fieldset>

          <div>
            <span className={label}>القضية {visibility === "case_team" ? <span className="text-red-500">*</span> : "(اختياري)"}</span>
            <CasePicker value={caseId} onChange={(id) => setCaseId(id)} isDark={isDark} />
            {caseId && (
              <button
                type="button"
                onClick={() => setCaseId("")}
                className={`mt-1.5 text-[11px] underline ${isDark ? "text-zinc-400" : "text-slate-500"}`}
              >
                إلغاء ربط القضية
              </button>
            )}
          </div>

          <label className={`flex items-center gap-2 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-[#0B3D2E]" />
            <PushPin size={14} weight={pinned ? "fill" : "regular"} aria-hidden="true" />
            تثبيت في أعلى الحائط
          </label>

          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition ${
              canSave
                ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
                : isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            {saving ? "جارٍ الحفظ..." : note ? "حفظ التعديل" : "حفظ الملاحظة"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
