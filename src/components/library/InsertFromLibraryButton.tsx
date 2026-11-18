"use client";

/**
 * «إدراج من مسودة المكتبة / مجلداتي» (N01-24): a small picker beside a memo,
 * contract or case text box. A pick is inserted AT THE CURSOR of that box
 * (lib/library/insertFromLibrary.ts): an article from the library draft as a
 * quote with its citation, a saved document from «مجلداتي» as a citation with
 * its library link. The lists are read when the picker opens, from the user's
 * own draft cart and folders; nothing is written and nothing is charged.
 */
import { useEffect, useState, type RefObject } from "react";
import { BookmarkSimple, X } from "@phosphor-icons/react";
import { cartItems, fitsLimit, folderItems, insertAtCursor, type InsertableItem } from "@/lib/library/insertFromLibrary";
import { isLibraryAccountLockedBody, LIBRARY_ACCOUNT_LOCKED_AR } from "@/lib/library/accountAccess";

interface Props {
  isDark: boolean;
  /** The text box the pick goes into (its cursor decides where). */
  targetRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** The box's own limit (what its run or route refuses beyond): a pick that would pass it is refused here, never cut. */
  maxLength: number;
}

type Source = "cart" | "folders";
type ListState = { status: "loading" } | { status: "error" } | { status: "locked"; message: string } | { status: "ready"; items: InsertableItem[] };

const SOURCES: { id: Source; label: string; empty: string }[] = [
  { id: "cart", label: "مسودة المكتبة", empty: "لا مواد في مسودة المكتبة — أضفها من صفحة النظام بزر «أضف للمسودة»." },
  { id: "folders", label: "مجلداتي", empty: "لا وثائق محفوظة في مجلداتك بعد." },
];

export default function InsertFromLibraryButton({ isDark, targetRef, value, onChange, disabled, maxLength }: Props) {
  const [open, setOpen] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [source, setSource] = useState<Source>("cart");
  const [lists, setLists] = useState<Record<Source, ListState>>({ cart: { status: "loading" }, folders: { status: "loading" } });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const origin = window.location.origin;
    const load = async (s: Source) => {
      try {
        const res = await fetch(s === "cart" ? "/api/v1/drafts/cart" : "/api/library/folders", { cache: "no-store" });
        // Owner item 9 (batch l8): an account whose library is locked is told so, not «تعذّرت القراءة».
        if (res.status === 403) {
          const refusal = await res.json().catch(() => null);
          if (isLibraryAccountLockedBody(refusal)) {
            if (!cancelled) setLists((prev) => ({ ...prev, [s]: { status: "locked", message: LIBRARY_ACCOUNT_LOCKED_AR } }));
            return;
          }
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        const items = s === "cart" ? cartItems(body) : folderItems(body, origin);
        if (!cancelled) setLists((prev) => ({ ...prev, [s]: { status: "ready", items } }));
      } catch {
        if (!cancelled) setLists((prev) => ({ ...prev, [s]: { status: "error" } }));
      }
    };
    void load("cart");
    void load("folders");
    return () => { cancelled = true; };
  }, [open]);

  function pick(item: InsertableItem) {
    if (!fitsLimit(value, item.text, maxLength)) {
      setTooLong(true);
      return;
    }
    const el = targetRef.current;
    const { value: next, caret } = insertAtCursor(value, el?.selectionStart, el?.selectionEnd, item.text);
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const box = targetRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(caret, caret);
    });
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const list = lists[source];
  const meta = SOURCES.find((s) => s.id === source)!;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setLists({ cart: { status: "loading" }, folders: { status: "loading" } }); setTooLong(false); setOpen(true); }}
        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${isDark ? "border-white/[0.08] text-zinc-300 hover:text-white" : "border-slate-200 text-slate-600 hover:text-[#0B3D2E]"}`}
      >
        <BookmarkSimple size={12} /> إدراج من مسودة المكتبة / مجلداتي
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="إدراج من المكتبة" dir="rtl"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        >
          <div className={`w-full max-w-lg rounded-2xl border p-4 shadow-2xl ${isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-100" : "border-slate-200 bg-white text-slate-800"}`}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-bold">إدراج من المكتبة عند موضع المؤشر</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className={muted}><X size={16} /></button>
            </div>
            <div role="tablist" className="mb-3 flex gap-2">
              {SOURCES.map((s) => (
                <button key={s.id} type="button" role="tab" aria-selected={source === s.id} onClick={() => setSource(s.id)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${source === s.id
                    ? "bg-[#0B3D2E] text-white"
                    : isDark ? "bg-white/[0.04] text-zinc-400" : "bg-slate-100 text-slate-600"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {list.status === "loading" && <p role="status" className={`py-6 text-center text-[12px] ${muted}`}>جارٍ التحميل…</p>}
              {list.status === "error" && <p role="alert" className="py-6 text-center text-[12px] text-red-500">تعذّرت القراءة — حاول مرة أخرى.</p>}
              {list.status === "locked" && <p role="status" className={`py-6 text-center text-[12px] ${muted}`}>{list.message}</p>}
              {list.status === "ready" && list.items.length === 0 && <p className={`py-6 text-center text-[12px] ${muted}`}>{meta.empty}</p>}
              {list.status === "ready" && list.items.length > 0 && (
                <ul className="space-y-1.5">
                  {list.items.map((item) => (
                    <li key={item.key}>
                      <button type="button" onClick={() => pick(item)}
                        className={`w-full rounded-xl border px-3 py-2 text-start ${isDark ? "border-white/[0.06] hover:border-[#C8A762]/40" : "border-slate-200 hover:border-[#0B3D2E]/40"}`}>
                        <span className="block text-[12.5px] font-semibold">{item.label}</span>
                        {item.detail && <span className={`block text-[11px] ${muted}`}>{item.detail}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {tooLong && (
              <p role="alert" className="mt-3 text-[11px] font-semibold text-amber-600">
                لا يتسع هذا الحقل لهذا النص (الحد {maxLength.toLocaleString("ar-SA")} حرف) — اختصر ما في الحقل أو اختر نصاً أقصر.
              </p>
            )}
            <p className={`mt-3 text-[11px] ${muted}`}>
              {source === "cart" ? "تُدرج المادة بنصها بين «» ومعها اسم النظام." : "يُدرج اسم الوثيقة ورابطها في المكتبة."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
