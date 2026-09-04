"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, FileText, Trash, TrashSimple, WarningCircle } from "@phosphor-icons/react";
import {
  getTrash,
  restoreDocument,
  purgeDocument,
  isDocumentTimeoutError,
  type Document,
} from "@/lib/services/documentService";
import { isSupabaseMode } from "@/lib/services/api";
import { listOk, listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import {
  confirmPurgeAr,
  formatDeletedAtAr,
  purgeFailureAr,
  restoreFailureAr,
  TRASH_EMPTY_AR,
  TRASH_LOAD_FAILURE_AR,
  TRASH_REQUIRES_BACKEND_AR,
} from "./_trashCopy";

/**
 * سلة المحذوفات — the bin every documents page (lawyer/firm/client/business/
 * micro) embeds as a tab or a section. Backed 1:1 by documentService.ts's
 * getTrash()/restoreDocument()/purgeDocument() — no page-specific mapping, so
 * this reads/writes the exact `attachments` rows GET /api/v1/documents?trash=1
 * returns, independent of whatever shape a given page's own main list uses.
 *
 * A row here can never carry `legal_hold: true` — the DB CHECK
 * (attachments_hold_blocks_delete_check) and both API routes make hold and
 * "in the bin" mutually exclusive — so this panel has no hold UI and no
 * "blocked by hold" branch to build.
 *
 * `onRestored` lets the embedding page refresh its own main list: a restore
 * here moves a row OUT of the bin and back into that list, and without this
 * callback the page would show neither the bin's before state nor the main
 * list's after state until a manual reload. It receives the restored
 * `Document` itself (not just a "something changed" signal) because a
 * page's main list can be a NARROWER view than "every document" —
 * dashboard/business/documents/page.tsx's vault shows only rows with no
 * `request_id`, so a restored row that IS bound to an order reappears in
 * neither the bin nor the vault, and that page uses the row to say so rather
 * than let the restore look like it did nothing.
 *
 * WHY THIS PANEL RE-READS ON EVERY MOUNT rather than caching across opens:
 * every embedding page mounts it conditionally — `{trashOpen && <.../>}` on
 * the four collapsible pages, `{mainTab === "trash" && <.../>}` on the
 * lawyer page's tab — so closing the section/leaving the tab unmounts it and
 * reopening it re-fetches. That is what keeps this panel's list and the
 * page's own main list from drifting apart after a delete or a restore done
 * while this panel was not on screen: there is no cache to go stale. Do not
 * "optimize" an embedding page's conditional into `hidden`/CSS visibility —
 * that would keep this component mounted and its `read` would stop
 * reflecting deletes made from the main list until a manual refresh.
 */
export function DocumentsTrashPanel({
  isDark,
  onRestored,
  showHeader = true,
}: {
  isDark: boolean;
  /** Called with the restored row after a successful restore, so the caller can reload its own main list (and, if that list is narrower than "every document", explain why the row may not reappear in it). */
  onRestored?: (doc: Document) => void | Promise<void>;
  /**
   * Set false when the embedding page already labels this section itself —
   * e.g. a tab already titled «سلة المحذوفات» — so the two headings do not
   * repeat one under the other. Defaults true for a page that drops this in
   * as its own unlabeled section.
   */
  showHeader?: boolean;
}) {
  const [read, setRead] = useState<ListRead<Document> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRead(await getTrash());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseMode) load();
    else setLoading(false);
  }, [load]);

  const dropRow = useCallback((id: string) => {
    setRead((prev) => {
      if (!prev || !prev.ok) return prev;
      const items = prev.items.filter((d) => String(d.id) !== id);
      return listOk(items, prev.total === null ? null : Math.max(0, prev.total - 1));
    });
  }, []);

  const handleRestore = useCallback(async (doc: Document) => {
    const id = String(doc.id);
    setActionError(null);
    setBusyId(id);
    try {
      await restoreDocument(id);
      dropRow(id);
      await onRestored?.(doc);
    } catch (err) {
      console.error("[documents-trash] restore failed:", id, err);
      setActionError(restoreFailureAr(doc.file_name, isDocumentTimeoutError(err)));
    } finally {
      setBusyId(null);
    }
  }, [dropRow, onRestored]);

  const handlePurge = useCallback(async (doc: Document) => {
    if (!confirm(confirmPurgeAr(doc.file_name))) return;
    const id = String(doc.id);
    setActionError(null);
    setBusyId(id);
    try {
      await purgeDocument(id);
      dropRow(id);
    } catch (err) {
      console.error("[documents-trash] purge failed:", id, err);
      setActionError(purgeFailureAr(doc.file_name, isDocumentTimeoutError(err)));
    } finally {
      setBusyId(null);
    }
  }, [dropRow]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.07] bg-zinc-900/60"
    : "rounded-2xl border border-zinc-100 bg-white shadow-sm";
  const muted = isDark ? "text-zinc-500" : "text-zinc-400";

  if (!isSupabaseMode) {
    return (
      <div className={`${card} p-5 text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`} dir="rtl">
        {TRASH_REQUIRES_BACKEND_AR}
      </div>
    );
  }

  const view = listViewState(loading, read);
  const rows = itemsOf(read);

  return (
    <div className="space-y-3" dir="rtl">
      {showHeader && (
        <div>
          <h2 className={`flex items-center gap-2 text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
            <TrashSimple size={17} weight="bold" /> سلة المحذوفات
          </h2>
          <p className={`mt-0.5 text-[12px] ${muted}`}>
            المستندات المحذوفة تبقى هنا ٣٠ يوماً قبل حذفها نهائياً، ويمكنك استعادتها في أي وقت قبل ذلك.
          </p>
        </div>
      )}

      {actionError && (
        <div className={`flex items-start gap-2 rounded-2xl border p-3 text-[12px] ${
          isDark ? "border-red-500/25 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"
        }`}>
          <WarningCircle size={15} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {view === "loading" ? (
        <p className={`text-[12px] ${muted}`}>جارٍ التحميل…</p>
      ) : view === "unreadable" ? (
        <div className={`${card} space-y-2 p-4`}>
          <p className={`text-[12px] font-bold ${isDark ? "text-red-300" : "text-red-600"}`}>{TRASH_LOAD_FAILURE_AR}</p>
          <button
            type="button"
            onClick={() => { void load(); }}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition ${
              isDark ? "border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <ArrowClockwise size={13} weight="bold" />
            إعادة المحاولة
          </button>
        </div>
      ) : view === "empty" ? (
        <div className={`${card} p-6 text-center`}>
          <TrashSimple size={26} weight="duotone" className={`mx-auto mb-2 ${muted}`} />
          <p className={`text-[12px] ${muted}`}>{TRASH_EMPTY_AR}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => {
            const id = String(d.id);
            const rowBusy = busyId === id;
            return (
              <li key={id} className={`${card} flex items-center gap-3 p-4`}>
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
                  isDark ? "bg-white/5 text-zinc-500" : "bg-zinc-50 text-zinc-400"
                }`}>
                  <FileText size={17} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                    {d.file_name}
                  </p>
                  <p className={`text-[11px] ${muted}`}>حُذف في {formatDeletedAtAr(d.deleted_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(d)}
                  disabled={rowBusy}
                  className={`flex-shrink-0 rounded-xl border px-3 py-1.5 text-[11px] font-bold disabled:opacity-40 ${
                    isDark ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  <ArrowClockwise size={12} weight="bold" className="inline" /> استعادة
                </button>
                <button
                  type="button"
                  onClick={() => handlePurge(d)}
                  disabled={rowBusy}
                  className={`flex-shrink-0 rounded-xl border px-3 py-1.5 text-[11px] font-bold disabled:opacity-40 ${
                    isDark ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-300 text-red-600 hover:bg-red-50"
                  }`}
                >
                  <Trash size={12} weight="bold" className="inline" /> حذف نهائي
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
