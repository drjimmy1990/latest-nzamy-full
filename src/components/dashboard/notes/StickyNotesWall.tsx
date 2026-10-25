"use client";

/**
 * StickyNotesWall — «حائط الملاحظات» on the lawyer and firm dashboards (N3.4,
 * owner §٤٧ part ٣). Real rows only (public.dashboard_notes through
 * /api/v1/lawyer/dashboard-notes): no seed notes, an honest empty state, and
 * a read failure is shown as one, never as an empty wall.
 *
 * The caller's own notes can be edited, pinned and deleted; a note a
 * colleague shared (firm / case team) is shown with its author and is
 * read-only, the same line RLS draws.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { Note, Plus, PushPin, PencilSimple, Trash, Scales, UsersThree, Buildings, LockSimple, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { NOTE_VISIBILITY_LABEL_AR, sortNotes, type NoteVisibility } from "@/lib/dashboardNotes/notesInput";
import {
  DASHBOARD_NOTES_EVENT,
  deleteDashboardNote,
  getDashboardNotes,
  updateDashboardNote,
  type DashboardNote,
} from "@/lib/services/dashboardNotesService";
import { itemsOf, type ListRead } from "@/lib/services/listRead";
import NoteEditorModal from "./NoteEditorModal";
import { NOTE_CARD_CLASS } from "./noteColors";

type Filter = "all" | "pinned" | "case" | "shared";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "pinned", label: "المثبتة" },
  { id: "case", label: "مرتبطة بقضية" },
  { id: "shared", label: "مشتركة" },
];

const VISIBILITY_ICON: Record<NoteVisibility, typeof LockSimple> = {
  private: LockSimple,
  case_team: UsersThree,
  firm: Buildings,
};

interface Props {
  /** Where a linked case opens: the lawyer or the firm case file. */
  caseHrefBase?: string;
}

export default function StickyNotesWall({ caseHrefBase = "/dashboard/lawyer/cases/" }: Props) {
  const { isDark } = useTheme();
  const [read, setRead] = useState<ListRead<DashboardNote> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<DashboardNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    getDashboardNotes().then(setRead);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(DASHBOARD_NOTES_EVENT, load);
    window.addEventListener("nzamy-workflow-updated", load);
    return () => {
      window.removeEventListener(DASHBOARD_NOTES_EVENT, load);
      window.removeEventListener("nzamy-workflow-updated", load);
    };
  }, [load]);

  const notes = useMemo(() => sortNotes(itemsOf(read)), [read]);
  const shown = useMemo(() => notes.filter((n) =>
    filter === "pinned" ? n.pinned
    : filter === "case" ? !!n.caseRequestId
    : filter === "shared" ? n.visibility !== "private"
    : true,
  ), [notes, filter]);

  async function togglePin(n: DashboardNote) {
    setBusy(n.id);
    setActionError(null);
    try { await updateDashboardNote(n.id, { pinned: !n.pinned }); }
    catch (e) { setActionError(e instanceof Error ? e.message : "تعذّر تثبيت الملاحظة."); }
    finally { setBusy(null); }
  }

  async function remove(id: string) {
    setBusy(id);
    setActionError(null);
    try { await deleteDashboardNote(id); setConfirmDelete(null); }
    catch (e) { setActionError(e instanceof Error ? e.message : "تعذّر حذف الملاحظة."); }
    finally { setBusy(null); }
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";

  return (
    <section className={`${card} p-5`} aria-labelledby="nzamy-notes-wall-title" dir="rtl">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 id="nzamy-notes-wall-title" className={`flex items-center gap-2 text-[15px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
          <Note size={18} weight="duotone" className="text-[#C8A762]" aria-hidden="true" />
          حائط الملاحظات
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1" role="group" aria-label="تصفية الملاحظات">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  filter === f.id
                    ? "bg-[#0B3D2E] text-white dark:bg-[#C8A762] dark:text-[#0B3D2E]"
                    : isDark ? "text-zinc-400 hover:bg-white/[0.05]" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-bold bg-[#0B3D2E] text-white hover:bg-[#092e22] dark:bg-[#C8A762] dark:text-[#0B3D2E] dark:hover:bg-[#d4b676] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]"
          >
            <Plus size={13} weight="bold" aria-hidden="true" />
            ملاحظة
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className={`mb-3 rounded-xl px-3 py-2 text-[12px] font-semibold border ${isDark ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-red-50 text-red-700 border-red-200"}`}>
          {actionError}
        </p>
      )}

      {read === null ? (
        <p className={`text-[12px] ${muted}`} aria-live="polite">جارٍ تحميل الملاحظات…</p>
      ) : !read.ok ? (
        <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-[12px] border ${isDark ? "border-amber-400/20 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`} role="alert">
          <span>تعذّر تحميل الملاحظات. لم تُحذف أي ملاحظة — أعد المحاولة.</span>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 font-bold underline">
            <ArrowClockwise size={12} aria-hidden="true" /> إعادة المحاولة
          </button>
        </div>
      ) : notes.length === 0 ? (
        <div className={`rounded-xl border border-dashed px-4 py-8 text-center ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <Note size={28} className={`mx-auto mb-2 ${muted}`} aria-hidden="true" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>لا ملاحظات بعد</p>
          <p className={`mt-1 text-[12px] ${muted}`}>دوّن تذكيراً سريعاً، واربطه بقضية إن شئت، وشاركه مع فريقك أو أبقه خاصاً بك.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className={`text-[12px] ${muted}`}>لا ملاحظات في هذا التصنيف.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((n) => {
            const VisIcon = VISIBILITY_ICON[n.visibility];
            return (
              <li key={n.id} className={`relative flex flex-col rounded-2xl border p-3.5 ${NOTE_CARD_CLASS[n.color]}`}>
                {n.pinned && (
                  <span className="absolute top-2 left-2" title="مثبتة">
                    <PushPin size={14} weight="fill" aria-label="مثبتة" />
                  </span>
                )}
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed pe-5">{n.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] opacity-80">
                  <span className="inline-flex items-center gap-1"><VisIcon size={12} aria-hidden="true" />{NOTE_VISIBILITY_LABEL_AR[n.visibility]}</span>
                  {!n.mine && <span>· {n.authorName}</span>}
                  {n.caseRequestId && (
                    <Link href={`${caseHrefBase}${encodeURIComponent(n.caseRequestId)}`} className="inline-flex items-center gap-1 underline underline-offset-2">
                      <Scales size={12} aria-hidden="true" />
                      {n.caseTitle ?? "القضية المرتبطة"}
                    </Link>
                  )}
                </div>
                {n.mine && (
                  <div className="mt-2 flex items-center gap-1 justify-end">
                    {confirmDelete === n.id ? (
                      <>
                        <span className="text-[11px] font-bold me-1">حذف نهائي؟</span>
                        <button type="button" disabled={busy === n.id} onClick={() => remove(n.id)} className="rounded-lg px-2 py-1 text-[11px] font-bold bg-red-600 text-white hover:bg-red-700">حذف</button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg px-2 py-1 text-[11px] font-bold underline">تراجع</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={busy === n.id} onClick={() => togglePin(n)} aria-label={n.pinned ? "إلغاء التثبيت" : "تثبيت"} title={n.pinned ? "إلغاء التثبيت" : "تثبيت"} className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
                          <PushPin size={14} weight={n.pinned ? "fill" : "regular"} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => setEditing(n)} aria-label="تعديل" title="تعديل" className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
                          <PencilSimple size={14} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(n.id)} aria-label="حذف" title="حذف" className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10">
                          <Trash size={14} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AnimatePresence>
        {(creating || editing) && (
          <NoteEditorModal
            key={editing?.id ?? "new"}
            isDark={isDark}
            note={editing}
            onClose={() => { setCreating(false); setEditing(null); }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
