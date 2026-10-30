"use client";

import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { motion } from "framer-motion";
import { XCircle } from "@phosphor-icons/react";
import {
  decideDismiss, DISCARD_DRAFT_PROMPT_AR, FOCUSABLE_SELECTOR, nextFocusIndex, type DismissVia,
} from "./modalDismissPolicy";

/**
 * ModalShell — the one dialog frame for the lawyer dashboard's forms
 * (CODE-F34, CODE-F35, LIVE-F29).
 *
 * What every modal inside it gets, the same way:
 *   - `role="dialog"`, `aria-modal`, the title as its accessible name, and a
 *     close button named «إغلاق»;
 *   - Escape closes it from any field (a DualDatePicker open inside it keeps
 *     Escape for itself — it stops the event first);
 *   - Tab and Shift+Tab stay inside it;
 *   - focus moves into it on open and goes back to the button that opened it
 *     on close, instead of falling to <body>;
 *   - × / backdrop / Escape all follow `decideDismiss`: blocked while `busy`,
 *     a question first when `dirty`, otherwise closed.
 *
 * Mount it only while the modal is open (as every caller already does with
 * `{open && <Modal/>}` inside AnimatePresence).
 */
export default function ModalShell({
  title,
  subtitle,
  onClose,
  isDark,
  busy = false,
  dirty = false,
  maxWidthClass = "max-w-md",
  zIndexClass = "z-[60]",
  initialFocusRef,
  headerExtra,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  isDark: boolean;
  /** A save is in flight — no exit until it answers. */
  busy?: boolean;
  /** The form holds typed, unsaved changes — ask before discarding them. */
  dirty?: boolean;
  maxWidthClass?: string;
  zIndexClass?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const stateRef = useRef({ busy, dirty, onClose });
  stateRef.current = { busy, dirty, onClose };

  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const t = setTimeout(() => {
      const target = initialFocusRef?.current
        ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      target?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      const opener = openerRef.current;
      // The opener may have unmounted with the list it lived in.
      if (opener && opener.isConnected) setTimeout(() => opener.focus(), 0);
    };
    // Focus once per mount — not again on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose(_via: DismissVia) {
    const { busy: b, dirty: d, onClose: close } = stateRef.current;
    const decision = decideDismiss({ busy: b, dirty: d });
    if (decision === "block") return;
    if (decision === "confirm" && !window.confirm(DISCARD_DRAFT_PROMPT_AR)) return;
    close();
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      requestClose("escape");
      return;
    }
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    // A portal (the date picker) bubbles here through React — its own trap applies.
    if (!root || !(e.target instanceof Node) || !root.contains(e.target)) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = nextFocusIndex(index, items.length, e.shiftKey);
    const wraps = index === -1 || (e.shiftKey ? index === 0 : index === items.length - 1);
    if (wraps) {
      e.preventDefault();
      items[next]?.focus();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm`}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose("backdrop"); }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        onKeyDown={onKeyDown}
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full ${maxWidthClass} rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h3 id={titleId} className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{title}</h3>
            {subtitle && <div className={`mt-0.5 text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={() => requestClose("close_button")}
              disabled={busy}
              aria-label="إغلاق"
              title={busy ? "جارٍ الحفظ — انتظر الرد" : "إغلاق"}
              className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}
            >
              <XCircle size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
