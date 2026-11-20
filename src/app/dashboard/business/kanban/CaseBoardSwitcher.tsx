"use client";

/**
 * CaseBoardSwitcher — T18-P1-32 (batch l11): more than one map per case.
 * «اللوحة الرئيسية» is the case's default board (case_graphs, unchanged); the
 * named boards are public.canvas_boards through the existing routes
 * (caseBoardsService.ts). List, create, rename, delete (its creator only —
 * the server says so otherwise). The caller mounts CaseGraphView with
 * `boardId={value}` and a `key` that changes with it, so switching saves the
 * board that was open (the view's dispose) and loads the chosen one.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, PencilSimple, Trash, Check, X } from "@phosphor-icons/react";
import { isDemoMode } from "@/lib/runtimeMode";
import {
  createCaseBoard,
  deleteCaseBoard,
  listCaseBoards,
  renameCaseBoard,
  type CaseBoard,
} from "@/lib/services/caseBoardsService";

const BOARD_NAME_MAX = 80;

export default function CaseBoardSwitcher({
  caseId,
  value,
  onChange,
  onRenamed,
  isDark,
}: {
  caseId: string;
  value: string | null;
  onChange: (boardId: string | null) => void;
  /** The open board was renamed: its saved version moved, so the caller reloads it. */
  onRenamed?: () => void;
  isDark: boolean;
}) {
  const [boards, setBoards] = useState<CaseBoard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<null | "new" | "rename">(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const got = await listCaseBoards(caseId);
    if (got.ok) {
      setBoards(got.value);
      setError(null);
    } else {
      setBoards([]);
      setError(got.error);
    }
  }, [caseId]);

  useEffect(() => {
    // The board list is read once per case; a write reloads it.
    void reload();
  }, [reload]);

  const current = boards?.find((b) => b.id === value) ?? null;

  async function submit() {
    if (busy) return;
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      setError("اكتب اسم اللوحة");
      return;
    }
    setBusy(true);
    if (editing === "new") {
      const made = await createCaseBoard(caseId, trimmed);
      if (made.ok) {
        await reload();
        onChange(made.value.id);
        setEditing(null);
      } else setError(made.error);
    } else if (editing === "rename" && current) {
      const done = await renameCaseBoard(caseId, current.id, trimmed);
      if (done.ok) {
        await reload();
        setEditing(null);
        onRenamed?.();
      } else setError(done.error);
    }
    setBusy(false);
  }

  async function remove() {
    if (!current || busy) return;
    if (!window.confirm(`حذف اللوحة «${current.name}» بكل ما فيها؟ لا يمكن التراجع عن الحذف.`)) return;
    setBusy(true);
    const done = await deleteCaseBoard(caseId, current.id);
    if (done.ok) {
      onChange(null);
      await reload();
    } else setError(done.error);
    setBusy(false);
  }

  if (isDemoMode) return null;

  const field = `rounded-lg border px-2 py-1 text-[11px] font-semibold ${isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-300" : "border-slate-200 bg-white text-slate-700"}`;
  const icon = `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${isDark ? "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5" dir="rtl">
      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <input
            autoFocus
            value={name}
            maxLength={BOARD_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder={editing === "new" ? "اسم اللوحة الجديدة" : "الاسم الجديد"}
            aria-label={editing === "new" ? "اسم اللوحة الجديدة" : "الاسم الجديد للوحة"}
            className={`${field} w-40`}
          />
          <button type="submit" disabled={busy} className={icon} aria-label="حفظ"><Check size={13} /></button>
          <button type="button" onClick={() => { setEditing(null); setError(null); }} className={icon} aria-label="إلغاء"><X size={13} /></button>
        </form>
      ) : (
        <>
          <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            aria-label="اللوحة المعروضة"
            disabled={boards === null || busy}
            className={field}
          >
            <option value="">اللوحة الرئيسية</option>
            {(boards ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button type="button" onClick={() => { setName(""); setError(null); setEditing("new"); }} disabled={busy} className={icon}>
            <Plus size={12} /> لوحة جديدة
          </button>
          {current && (
            <button type="button" onClick={() => { setName(current.name); setError(null); setEditing("rename"); }} disabled={busy} className={icon}>
              <PencilSimple size={12} /> إعادة تسمية
            </button>
          )}
          {current?.isOwn && (
            <button type="button" onClick={() => void remove()} disabled={busy} className={`${icon} ${isDark ? "hover:text-red-400" : "hover:text-red-600"}`}>
              <Trash size={12} /> حذف
            </button>
          )}
        </>
      )}
      {error && <span role="alert" className={`text-[11px] ${isDark ? "text-amber-400" : "text-amber-700"}`}>{error}</span>}
    </div>
  );
}
