"use client";

/**
 * CaseArchivePanel — «المحذوفات» of a case file (N3.9, owner directive ٥,
 * migration 20261025_51).
 *
 * Nothing on a case file is deleted any more: a note or a document is
 * archived, and this panel lists what the signed-in user may bring back — his
 * own archived items, and, for the firm owner or the case lead, what others
 * archived (never someone's private note). One click restores.
 *
 * Renders nothing before the migration runs (`available: false`) and nothing
 * when the archive is empty, so a case file without archived items looks as
 * it did.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowCounterClockwise, Archive, CaretDown, CaretUp, FileText, NotePencil } from "@phosphor-icons/react";
import { getCaseArchive, restoreArchived } from "@/lib/services/caseNotesService";
import type { ArchivedView } from "@/lib/services/archivedView";
import { toArabicDigits } from "@/lib/services/arabicCount";

const WHEN_AR = new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
const when = (iso: string) => (Number.isNaN(Date.parse(iso)) ? "" : WHEN_AR.format(Date.parse(iso)));

const SCOPE_AR: Record<string, string> = { private: "خاصة", case_team: "فريق القضية", firm: "المكتب" };

export default function CaseArchivePanel({
  caseId,
  isDark,
  reloadKey = 0,
  onRestored,
}: {
  caseId: string;
  isDark: boolean;
  /** Bump to re-read (e.g. right after a note is archived on the same page). */
  reloadKey?: number;
  onRestored?: (kind: "note" | "document") => void;
}) {
  const [view, setView] = useState<ArchivedView | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState("loading");
    getCaseArchive(caseId)
      .then((v) => { setView(v); setState("ready"); })
      .catch(() => setState("error"));
  }, [caseId]);

  useEffect(() => { load(); }, [load, reloadKey]);

  async function restore(kind: "note" | "document", id: string) {
    setBusyId(`${kind}:${id}`);
    setError(null);
    try {
      await restoreArchived(caseId, kind, id);
      load();
      onRestored?.(kind);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "تعذّر الاسترجاع.");
    } finally {
      setBusyId(null);
    }
  }

  if (state === "error") {
    return (
      <p className={`text-[11px] ${isDark ? "text-red-400" : "text-red-700"}`}>تعذّرت قراءة «المحذوفات» لهذه القضية.</p>
    );
  }
  if (state === "loading" || !view || !view.available) return null;
  const total = view.notes.length + view.documents.length;
  if (total === 0) return null;

  const muted = isDark ? "text-zinc-500" : "text-slate-500";
  const rowCls = `rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-200 bg-slate-50"}`;
  const restoreBtn = (kind: "note" | "document", id: string) => (
    <button
      type="button"
      onClick={() => restore(kind, id)}
      disabled={busyId !== null}
      className={`flex flex-shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 ${isDark ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}
    >
      <ArrowCounterClockwise size={12} />
      {busyId === `${kind}:${id}` ? "جارٍ الاسترجاع..." : "استرجاع"}
    </button>
  );

  return (
    <section aria-label="المحذوفات" className={`rounded-2xl border ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-start ${isDark ? "text-zinc-300" : "text-slate-700"}`}
      >
        <span className="flex items-center gap-2 text-[12px] font-bold">
          <Archive size={14} className={muted} />
          المحذوفات ({toArabicDigits(total)})
        </span>
        <span className={`flex items-center gap-1 text-[10px] ${muted}`}>
          لا يُحذف شيء نهائياً — يمكن استرجاع أي عنصر
          {open ? <CaretUp size={12} /> : <CaretDown size={12} />}
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4">
          {error && <p className={`text-[11px] ${isDark ? "text-red-400" : "text-red-700"}`}>{error}</p>}
          {view.notes.map((n) => (
            <div key={`note:${n.id}`} className={rowCls}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`flex flex-wrap items-center gap-1.5 text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                    <NotePencil size={12} className={muted} />
                    ملاحظة {n.mine ? "كتبتها أنت" : n.authorName ? `كتبها ${n.authorName}` : ""}
                    <span className={`rounded-full px-1.5 py-px text-[9px] ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-white text-slate-500"}`}>{SCOPE_AR[n.visibility]}</span>
                  </p>
                  <p className={`mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{n.body}</p>
                  <p className={`mt-1 text-[10px] ${muted}`}>
                    أُرشفت {when(n.deletedAt)}{n.deletedByName ? ` — بواسطة ${n.deletedByName}` : ""}
                  </p>
                </div>
                {restoreBtn("note", n.id)}
              </div>
            </div>
          ))}
          {view.documents.map((d) => (
            <div key={`doc:${d.id}`} className={rowCls}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`flex items-center gap-1.5 truncate text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                    <FileText size={12} className={muted} />
                    <span className="truncate">{d.name}</span>
                  </p>
                  <p className={`mt-1 text-[10px] ${muted}`}>
                    أُرشف {when(d.deletedAt)}{d.deletedByName ? ` — بواسطة ${d.deletedByName}` : ""}
                  </p>
                </div>
                {restoreBtn("document", d.id)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
