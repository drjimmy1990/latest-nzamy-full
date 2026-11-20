"use client";

/**
 * ArticleRefAssist — N06-40..43 (batch l11): «@مادة» / «[[» in a memo,
 * contract or case text box. Mounted beside InsertFromLibraryButton with the
 * same props; it watches the box's text at its cursor (articleRefTrigger.ts):
 *
 *   «[[نظام العمل ٨٠» or «@مادة ٨٠ نظام العمل»  →  a short list of library
 *   laws (the library's own autocomplete)  →  a pick checks the article in the
 *   library (the reader's citations lookup: numbers and titles, never text,
 *   nothing counted) and replaces the shortcut with «المادة (٨٠) من نظام العمل».
 *
 * Keyboard: ↓ ↑ to move, Enter to pick, Esc to close. Nothing is sent or
 * charged; the box's own limit is respected (fitsLimit).
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { At } from "@phosphor-icons/react";
import { fitsLimit } from "@/lib/library/insertFromLibrary";
import {
  articleCheckUrl,
  articleFound,
  findTrigger,
  lawOptions,
  parseRefQuery,
  referenceText,
  replaceTrigger,
  type LawOption,
  type RefTrigger,
} from "@/lib/ai/articleRefTrigger";

interface Props {
  isDark: boolean;
  targetRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  maxLength: number;
}

type ListState = { status: "idle" } | { status: "loading" } | { status: "error" } | { status: "ready"; laws: LawOption[] };

const SEARCH_DELAY_MS = 300;

export default function ArticleRefAssist({ isDark, targetRef, value, onChange, disabled, maxLength }: Props) {
  const [trigger, setTrigger] = useState<RefTrigger | null>(null);
  const [list, setList] = useState<ListState>({ status: "idle" });
  const [active, setActive] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const dismissedAt = useRef<number | null>(null);

  // The trigger at the cursor, re-read on every change and cursor move.
  const readTrigger = useCallback(() => {
    const el = targetRef.current;
    if (!el || disabled) return setTrigger(null);
    const t = findTrigger(el.value, el.selectionStart);
    if (t && dismissedAt.current === t.start) return setTrigger(null);
    setTrigger((prev) => (prev && t && prev.start === t.start && prev.query === t.query ? prev : t));
  }, [targetRef, disabled]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const onMove = () => readTrigger();
    el.addEventListener("keyup", onMove);
    el.addEventListener("click", onMove);
    return () => {
      el.removeEventListener("keyup", onMove);
      el.removeEventListener("click", onMove);
    };
  }, [targetRef, readTrigger]);

  useEffect(() => { readTrigger(); }, [value, readTrigger]);

  const lawQuery = trigger ? parseRefQuery(trigger.query).lawQuery : "";

  useEffect(() => {
    if (!trigger || lawQuery.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to search yet
      setList({ status: "idle" });
      return;
    }
    let live = true;
    setList({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/library/autocomplete?q=${encodeURIComponent(lawQuery)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const laws = lawOptions(await res.json());
        if (live) {
          setList({ status: "ready", laws });
          setActive(0);
        }
      } catch {
        if (live) setList({ status: "error" });
      }
    }, SEARCH_DELAY_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [trigger, lawQuery]);

  const close = useCallback(() => {
    if (trigger) dismissedAt.current = trigger.start;
    setTrigger(null);
    setList({ status: "idle" });
  }, [trigger]);

  const pick = useCallback(async (law: LawOption) => {
    const el = targetRef.current;
    if (!trigger || !el) return;
    const { number } = parseRefQuery(trigger.query);
    if (number) {
      try {
        const res = await fetch(articleCheckUrl(law.slug, number), { cache: "no-store" });
        if (!res.ok || !articleFound(await res.json(), number)) {
          setNote(`لا توجد المادة ${number} في «${law.title}» في المكتبة — تحقّق من الرقم.`);
          return;
        }
      } catch {
        setNote("تعذّر التحقق من المادة الآن — حاول مرة أخرى.");
        return;
      }
    }
    const text = referenceText(law.title, number);
    const caret = el.selectionStart ?? trigger.start + trigger.query.length;
    // The box's limit counts the text without the typed shortcut, plus the reference.
    if (!fitsLimit(value.slice(0, trigger.start) + value.slice(caret), text, maxLength)) {
      setNote("لا يتسع النص لهذا المرجع — اختصر النص أولاً.");
      return;
    }
    const next = replaceTrigger(value, trigger.start, caret, text);
    onChange(next.value);
    setNote(null);
    setTrigger(null);
    setList({ status: "idle" });
    requestAnimationFrame(() => {
      const box = targetRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(next.caret, next.caret);
    });
  }, [trigger, targetRef, value, onChange, maxLength]);

  // ↓ ↑ Enter Esc on the box while the list is open.
  useEffect(() => {
    const el = targetRef.current;
    if (!el || !trigger) return;
    const laws = list.status === "ready" ? list.laws : [];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (laws.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % laws.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + laws.length) % laws.length); }
      else if (e.key === "Enter") { e.preventDefault(); void pick(laws[Math.min(active, laws.length - 1)]); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [targetRef, trigger, list, active, pick, close]);

  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  if (!trigger) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10.5px] ${muted}`} dir="rtl">
        <At size={11} /> لإدراج مرجع اكتب [[ أو @مادة ثم اسم النظام ورقم المادة
        {note && <span role="status" className={isDark ? "text-amber-400" : "text-amber-700"}> — {note}</span>}
      </span>
    );
  }

  return (
    <div dir="rtl" role="listbox" aria-label="أنظمة المكتبة"
      className={`w-full max-w-md rounded-xl border p-2 text-[12px] shadow-lg ${isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-200" : "border-slate-200 bg-white text-slate-700"}`}>
      {lawQuery.length < 2 && <p className={muted}>اكتب اسم النظام ثم رقم المادة، مثل: نظام العمل ٨٠</p>}
      {list.status === "loading" && <p role="status" className={muted}>جارٍ البحث في المكتبة…</p>}
      {list.status === "error" && <p role="alert" className="text-red-500">تعذّر البحث الآن.</p>}
      {list.status === "ready" && list.laws.length === 0 && <p className={muted}>لا نظام بهذا الاسم في المكتبة.</p>}
      {list.status === "ready" && list.laws.length > 0 && (
        <ul className="space-y-0.5">
          {list.laws.map((law, i) => (
            <li key={law.slug}>
              <button type="button" role="option" aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(law)}
                className={`w-full rounded-lg px-2 py-1.5 text-start ${i === active ? (isDark ? "bg-white/[0.06]" : "bg-slate-100") : ""}`}>
                {referenceText(law.title, parseRefQuery(trigger.query).number)}
                {law.lawType && <span className={`ms-2 text-[10.5px] ${muted}`}>{law.lawType}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p role="status" className={`mt-1 ${isDark ? "text-amber-400" : "text-amber-700"}`}>{note}</p>}
      <p className={`mt-1 text-[10.5px] ${muted}`}>الأسهم للتنقل · زر الإدخال للإدراج · زر الخروج للإغلاق</p>
    </div>
  );
}
