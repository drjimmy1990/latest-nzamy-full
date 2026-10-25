"use client";

/**
 * The bodies of the two card kinds N3.5 adds to the case canvas — «رابط» and
 * «قائمة مهام» — kept out of CaseGraphView.tsx, which is long enough already.
 * Both are controlled: the canvas owns the node and records the undo step.
 */
import { useState } from "react";
import { ArrowSquareOut, Copy, Plus, X } from "@phosphor-icons/react";
import type { ChecklistItem, GraphNode } from "./_graph-model";
import {
  addChecklistItem,
  checklistCount,
  linkHost,
  removeChecklistItem,
  safeExternalUrl,
  toggleChecklistItem,
} from "./_graph-sanitize";
import { toArabicDigits } from "@/lib/services/arabicCount";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function LinkCardBody({
  node,
  isDark,
  onUrlChange,
}: {
  node: GraphNode;
  isDark: boolean;
  onUrlChange: (url: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const raw = node.url ?? "";
  // Re-checked on every render, never trusted from the saved board: only an
  // http(s) address ever becomes a link (see ./_graph-sanitize.ts).
  const safe = safeExternalUrl(raw);
  const host = linkHost(raw);
  return (
    <div className="flex flex-col gap-1 px-3 pb-1" onPointerDown={stop}>
      <input
        type="url"
        dir="ltr"
        value={raw}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://"
        aria-label="عنوان الرابط"
        className={`w-full rounded-md border px-2 py-1 text-[10px] outline-none ${isDark ? "border-white/10 bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}
      />
      {safe ? (
        <div className="flex items-center gap-1.5">
          <a
            href={safe}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex min-w-0 items-center gap-1 text-[10px] font-bold underline-offset-2 hover:underline ${isDark ? "text-sky-400" : "text-sky-700"}`}
          >
            <ArrowSquareOut size={11} className="shrink-0" />
            <span className="truncate" dir="ltr">{host}</span>
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(safe).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }).catch(() => undefined);
            }}
            className={`rounded p-0.5 ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-zinc-500 hover:bg-zinc-100"}`}
            title="نسخ الرابط"
            aria-label="نسخ الرابط"
          >
            <Copy size={11} />
          </button>
          {copied && <span className={`text-[9px] ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>نُسخ</span>}
        </div>
      ) : raw.trim() ? (
        <span className={`text-[9px] ${isDark ? "text-amber-400" : "text-amber-700"}`}>
          رابط غير صالح — تُقبل عناوين http و https فقط
        </span>
      ) : null}
    </div>
  );
}

export function ChecklistCardBody({
  node,
  isDark,
  onChange,
}: {
  node: GraphNode;
  isDark: boolean;
  onChange: (list: ChecklistItem[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const list = node.checklist ?? [];
  const { done, total } = checklistCount(list);
  const add = () => {
    const next = addChecklistItem(list, draft, `ck_${Date.now()}_${list.length}`);
    if (next !== list) onChange(next);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1 px-3 pb-1" onPointerDown={stop}>
      {total > 0 && (
        <span className={`text-[9px] font-bold ${isDark ? "text-teal-400" : "text-teal-700"}`}>
          {toArabicDigits(done)} من {toArabicDigits(total)} منجزة
        </span>
      )}
      <ul className="flex flex-col gap-0.5">
        {list.map((item) => (
          <li key={item.id} className="group flex items-start gap-1.5">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => onChange(toggleChecklistItem(list, item.id))}
              aria-label={item.text}
              className="mt-0.5 h-3 w-3 shrink-0 accent-teal-600"
            />
            <span className={`flex-1 text-[10px] leading-snug ${item.done ? "line-through opacity-60" : ""} ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => onChange(removeChecklistItem(list, item.id))}
              className={`shrink-0 rounded opacity-60 hover:opacity-100 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}
              title="حذف البند"
              aria-label={`حذف البند: ${item.text}`}
            >
              <X size={10} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="بند جديد..."
          aria-label="بند جديد في القائمة"
          className={`min-w-0 flex-1 rounded-md border px-2 py-0.5 text-[10px] outline-none ${isDark ? "border-white/10 bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className={`rounded-md p-1 disabled:opacity-30 ${isDark ? "text-teal-400 hover:bg-white/10" : "text-teal-700 hover:bg-teal-50"}`}
          title="إضافة البند"
          aria-label="إضافة البند"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}
