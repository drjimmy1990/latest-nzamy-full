"use client";

/**
 * CourtPicker — the case form's «المحكمة المختصة» field (owner q351): one
 * search box over the 14 court classifications and the Ministry of Justice
 * directory of courts and circuits, plus «أخرى» with a typed name.
 *
 * It writes the same two values the old <select> did — `choice` and `other`
 * — so resolveCourt (courtTypes.ts) and the saved `metadata.court` are
 * unchanged: a classification is saved as itself; a directory court is saved
 * as its name through the «أخرى» path (choice = COURT_OTHER, other = name),
 * which is exactly how a typed «أخرى» name has always been saved. Rows saved
 * before this field existed read the same way. A directory pick also hands
 * back its classification (`directoryClass`, review I1), which the form saves
 * as metadata.courtClass; the parent holds it, and the chip is derived from
 * it (review M2), so the chip survives a remount.
 *
 * The directory (src/data/circuits-directory.json, ~1 MB) is imported the
 * first time the box takes focus, not with the modal, as the procedures guide
 * does. If it fails to load, the classifications and «أخرى» still work.
 */

import { useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { COURT_CHOICES, COURT_OTHER, COURT_OTHER_LABEL } from "./courtTypes";
import { courtDirectoryEntries, searchCourtOptions, type CourtDirectoryEntry, type CourtDirectoryRow, type CourtOption } from "./courtSearch";

interface Props {
  id: string;
  isDark: boolean;
  choice: string;
  other: string;
  /** A directory pick's classification (null if unclassed); undefined when `other` was typed. */
  directoryClass?: string | null;
  onChange: (choice: string, other: string, directoryClass?: string | null) => void;
  inputCls: string;
  hintCls: string;
}

type Row = CourtOption | { kind: "other"; value: string };

export default function CourtPicker({ id, isDark, choice, other, directoryClass, onChange, inputCls, hintCls }: Props) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [directory, setDirectory] = useState<CourtDirectoryEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  // A directory pick is stored through the «أخرى» path; `directoryClass` (held
  // by the parent) tells the two apart on screen: a chip for a pick, the
  // free-text box for «أخرى».
  const fromDirectory = choice === COURT_OTHER && directoryClass !== undefined;

  function loadDirectory() {
    if (directory || loading || loadFailed) return;
    setLoading(true);
    import("@/data/circuits-directory.json")
      .then((m) => {
        const data = (m.default ?? m) as { circuits: CourtDirectoryRow[] };
        setDirectory(courtDirectoryEntries(data.circuits));
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }

  const rows: Row[] = useMemo(
    () => [...searchCourtOptions(query, directory ?? []), { kind: "other" as const, value: COURT_OTHER_LABEL }],
    [query, directory],
  );

  function pick(row: Row) {
    if (row.kind === "type") onChange(row.value, "");
    else if (row.kind === "directory") onChange(COURT_OTHER, row.value, row.courtClass);
    else onChange(COURT_OTHER, "");
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("", "");
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      if (open && rows[active]) { e.preventDefault(); pick(rows[active]); }
    } else if (e.key === "Escape" && open) {
      // Ours alone: the host modal must not also close.
      e.stopPropagation();
      setOpen(false);
    }
  }

  const chipCls = `flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13px] ${
    isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-800"
  }`;
  const linkCls = `text-[11px] font-bold hover:underline ${isDark ? "text-emerald-300" : "text-emerald-700"}`;
  const subCls = isDark ? "text-zinc-400" : "text-zinc-500";

  // A classification, or a directory court: shown as the chosen value.
  const chosenLabel = (COURT_CHOICES as readonly string[]).includes(choice)
    ? choice
    : choice === COURT_OTHER && fromDirectory ? other : null;
  if (chosenLabel) {
    return (
      <div>
        <div className={chipCls}>
          <span className="truncate font-semibold">{chosenLabel}</span>
          {/* The field's id sits here in chip mode, so the form's <label> points at an element (review M2). */}
          <button id={id} type="button" onClick={clear} aria-label="تغيير المحكمة" className={linkCls}>تغيير</button>
        </div>
        {choice === COURT_OTHER && (
          <p className={hintCls}>من دليل المحاكم والدوائر — يُحفظ باسمه كما هو.</p>
        )}
      </div>
    );
  }

  // «أخرى»: the court is whatever the lawyer types.
  if (choice === COURT_OTHER) {
    return (
      <div>
        <input
          id={id}
          type="text"
          aria-label="اسم المحكمة أو الجهة"
          value={other}
          onChange={(e) => onChange(COURT_OTHER, e.target.value)}
          placeholder="اكتب اسم المحكمة أو الجهة..."
          className={inputCls}
        />
        <button type="button" onClick={clear} className={`${linkCls} mt-1.5`}>ابحث في دليل المحاكم بدلاً من ذلك</button>
      </div>
    );
  }

  const optionCls = (selected: boolean) => `px-3 py-2 text-[12.5px] ${
    selected
      ? isDark ? "bg-white/[0.08] text-zinc-100" : "bg-emerald-50 text-zinc-900"
      : isDark ? "text-zinc-300" : "text-zinc-700"
  }`;

  return (
    <div className="relative">
      <div className="relative">
        <MagnifyingGlass size={14} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 right-3 ${subCls}`} />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => { loadDirectory(); setOpen(true); }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="ابحث: «التجارية»، «العامة بالرياض»، «الاستئناف جدة»..."
          className={`${inputCls} pr-9`}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery("")}
            aria-label="مسح البحث"
            className={`absolute top-1/2 -translate-y-1/2 left-3 ${subCls}`}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="المحاكم"
          // Pressing the list's scrollbar must not blur the input (which closes the list).
          onMouseDown={(e) => e.preventDefault()}
          className={`absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border shadow-lg ${
            isDark ? "border-white/[0.08] bg-zinc-900" : "border-zinc-200 bg-white"
          }`}
        >
          {rows.map((row, i) => (
            <li
              key={`${row.kind}:${row.value}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => { e.preventDefault(); pick(row); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer text-right ${optionCls(i === active)}`}
            >
              {row.kind === "other" ? (
                <span className="font-semibold">{COURT_OTHER_LABEL} — اكتب اسم المحكمة أو الجهة</span>
              ) : (
                <>
                  <span>{row.value}</span>
                  {row.kind === "directory" && (
                    <span className={`block text-[10.5px] ${subCls}`}>{[row.category, row.city].filter(Boolean).join(" · ")}</span>
                  )}
                </>
              )}
            </li>
          ))}
          {query.trim() && loading && (
            <li className={`px-3 py-2 text-[11px] ${subCls}`}>جارٍ تحميل دليل المحاكم…</li>
          )}
          {query.trim() && loadFailed && (
            <li className={`px-3 py-2 text-[11px] ${subCls}`}>تعذّر تحميل دليل المحاكم — اختر تصنيفاً أو «{COURT_OTHER_LABEL}».</li>
          )}
        </ul>
      )}
      {!open && <p className={hintCls}>يمكن تركها الآن؛ تظهر القضية «بانتظار تحديد الجهة» حتى تُحدَّد.</p>}
    </div>
  );
}
