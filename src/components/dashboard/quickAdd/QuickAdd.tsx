"use client";

/**
 * QuickAdd — «+ إضافة سريعة» (N3.3, owner ٤٧ part ٢).
 * ─────────────────────────────────────────────────────────────────────────
 * One provider per dashboard layout (lawyer, firm) owns the menu and the
 * modal it opens. Two triggers reach it:
 *   - the floating button (bottom corner, z-40: above page content, below
 *     every modal — AddHearingModal is z-[60], AddClientModal z-[200]);
 *   - <QuickAddSidebarItem/> at the top of SharedSidebar, which renders only
 *     inside a provider, so the other dashboards' sidebars are unchanged.
 * Alt+N toggles the menu anywhere on the page except while typing in a field
 * (quickAddItems.ts has the predicate and its tests).
 *
 * Which items appear is decided in quickAddItems.ts from the session alone
 * (Art. 18 practice kind, the firm route rules of the session role). Every
 * item opens the existing modal for that record; nothing here writes data.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Scales, CalendarCheck, UserPlus, CheckSquare, Hourglass, X, Lightning, Note, ArrowsDownUp,
  type Icon,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser, type AffiliationRole } from "@/hooks/useUser";
import AddCaseModal from "@/app/dashboard/lawyer/_components/AddCaseModal";
import AddHearingModal from "@/app/dashboard/lawyer/_components/AddHearingModal";
import AddTaskModal from "@/app/dashboard/lawyer/_components/AddTaskModal";
import AddDeadlineModal from "@/app/dashboard/lawyer/_components/AddDeadlineModal";
import AddClientModal from "@/components/dashboard/lawyer/AddClientModal";
import NoteEditorModal from "@/components/dashboard/notes/NoteEditorModal";
import LedgerEntryModal from "@/components/dashboard/ledger/LedgerEntryModal";
import {
  QUICK_ADD_ARIA_SHORTCUT,
  QUICK_ADD_SHORTCUT_LABEL,
  isQuickAddShortcut,
  isTypingTarget,
  quickAddEnabledFor,
  visibleQuickAddItems,
  type QuickAddItemDef,
  type QuickAddItemId,
  type QuickAddScope,
} from "./quickAddItems";

const ICONS: Record<QuickAddItemId, Icon> = {
  case: Scales,
  hearing: CalendarCheck,
  client: UserPlus,
  task: CheckSquare,
  deadline: Hourglass,
  note: Note,
  ledger: ArrowsDownUp,
};

interface QuickAddApi {
  toggle: (from?: HTMLElement | null) => void;
  open: boolean;
}

const QuickAddCtx = createContext<QuickAddApi | null>(null);

/** null outside a provider (every dashboard but lawyer and firm). */
export function useQuickAdd(): QuickAddApi | null {
  return useContext(QuickAddCtx);
}

const MENU_ID = "nzamy-quick-add-menu";

interface ProviderProps {
  scope: QuickAddScope;
  /** Firm dashboard: the session's own firm role (not a demo-switched one). */
  firmRole?: AffiliationRole | null;
  /** Firm dashboard: that role's `addNewCase`. */
  canAddCase?: boolean;
  children: ReactNode;
}

export function QuickAddProvider({ scope, firmRole, canAddCase, children }: ProviderProps) {
  const user = useUser();
  const { isDark, isRTL } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<QuickAddItemId | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabled = !user.loading && quickAddEnabledFor(user);
  const items = useMemo(
    () => (enabled ? visibleQuickAddItems({ scope, practiceKind: user.practiceKind, firmRole, canAddCase }) : []),
    [enabled, scope, user.practiceKind, firmRole, canAddCase],
  );
  const available = items.length > 0;

  const closeMenu = useCallback((restore = true) => {
    setMenuOpen(false);
    if (restore) {
      const el = returnFocus.current;
      if (el && typeof el.focus === "function") setTimeout(() => el.focus(), 0);
    }
  }, []);

  const toggle = useCallback((from?: HTMLElement | null) => {
    setMenuOpen((wasOpen) => {
      if (!wasOpen) returnFocus.current = from ?? (document.activeElement as HTMLElement | null);
      return !wasOpen;
    });
  }, []);

  // Alt+N — ignored while typing, while one of our modals is open, and when
  // the session has nothing to add.
  useEffect(() => {
    if (!available) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isQuickAddShortcut(e)) return;
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      if (active) return;
      e.preventDefault();
      toggle(document.activeElement as HTMLElement | null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [available, active, toggle]);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (menuOpen) setTimeout(() => itemRefs.current[0]?.focus(), 0);
  }, [menuOpen]);

  const choose = (id: QuickAddItemId) => {
    setMenuOpen(false);
    setActive(id);
  };
  const closeModal = () => {
    setActive(null);
    const el = returnFocus.current;
    if (el && typeof el.focus === "function") setTimeout(() => el.focus(), 0);
  };
  const refreshed = () => {
    try { window.dispatchEvent(new CustomEvent("nzamy-workflow-updated")); } catch {}
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const count = items.length;
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); closeMenu(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      itemRefs.current[(current + step + count) % count]?.focus();
      return;
    }
    if (e.key === "Home") { e.preventDefault(); itemRefs.current[0]?.focus(); return; }
    if (e.key === "End") { e.preventDefault(); itemRefs.current[count - 1]?.focus(); return; }
    if (e.key === "Tab") { closeMenu(false); }
  };

  const modalUser = { userId: user.userId, name: user.name, userType: user.userType, tier: user.tier };
  // A Record keyed by the id: adding an item to QUICK_ADD_ITEMS without its
  // modal here is a compile error, not a dead menu entry.
  const MODALS: Record<QuickAddItemId, () => ReactNode> = {
    case: () => <AddCaseModal key="qa-case" onClose={closeModal} isDark={isDark} user={modalUser} />,
    hearing: () => <AddHearingModal key="qa-hearing" onClose={closeModal} isDark={isDark} user={modalUser} />,
    // AddClientModal fires «nzamy-workflow-updated» and closes itself after a save.
    client: () => <AddClientModal key="qa-client" isDark={isDark} onClose={closeModal} onCreated={() => {}} />,
    task: () => <AddTaskModal key="qa-task" onClose={closeModal} isDark={isDark} />,
    deadline: () => <AddDeadlineModal key="qa-deadline" onClose={closeModal} isDark={isDark} onCreated={() => { refreshed(); closeModal(); }} />,
    // The note service fires its own event; the wall re-reads on it.
    note: () => <NoteEditorModal key="qa-note" isDark={isDark} onClose={closeModal} />,
    ledger: () => <LedgerEntryModal key="qa-ledger" isDark={isDark} onClose={closeModal} />,
  };

  const api = useMemo<QuickAddApi | null>(() => (available ? { toggle, open: menuOpen } : null), [available, toggle, menuOpen]);
  const side = isRTL ? "left-6" : "right-6";
  const bottom = { bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" } as const;
  const menuBottom = { bottom: "calc(5.25rem + env(safe-area-inset-bottom, 0px))" } as const;

  return (
    <QuickAddCtx.Provider value={api}>
      {children}

      {available && (
        <div className="print:hidden" dir="rtl">
          {menuOpen && (
            <div aria-hidden="true" className="fixed inset-0 z-[48]" onClick={() => closeMenu()} />
          )}

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                key="qa-menu"
                id={MENU_ID}
                role="menu"
                aria-label="إضافة سريعة"
                onKeyDown={onMenuKeyDown}
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={menuBottom}
                className={`fixed ${side} z-[49] w-[min(18rem,calc(100vw-3rem))] rounded-2xl border p-2 shadow-2xl ${
                  isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  <span className={`flex items-center gap-1.5 text-[12px] font-black ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                    <Lightning size={14} weight="fill" className="text-[#C8A762]" />
                    إضافة سريعة
                  </span>
                  <kbd dir="ltr" className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${isDark ? "border-white/10 text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                    {QUICK_ADD_SHORTCUT_LABEL}
                  </kbd>
                </div>
                {items.map((item: QuickAddItemDef, i: number) => {
                  const ItemIcon = ICONS[item.id];
                  return (
                    <button
                      key={item.id}
                      ref={(el) => { itemRefs.current[i] = el; }}
                      type="button"
                      role="menuitem"
                      onClick={() => choose(item.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold ${
                        isDark ? "hover:bg-white/[0.05] focus:bg-white/[0.05]" : "hover:bg-slate-50 focus:bg-slate-50"
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/[0.06] text-[#0B3D2E]"}`}>
                        <ItemIcon size={16} weight="duotone" />
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{item.labelAr}</span>
                        <span className={`block truncate text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{item.hintAr}</span>
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={(e) => (menuOpen ? closeMenu() : toggle(e.currentTarget))}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={MENU_ID}
            aria-keyshortcuts={QUICK_ADD_ARIA_SHORTCUT}
            aria-label={menuOpen ? "إغلاق الإضافة السريعة" : `إضافة سريعة (${QUICK_ADD_SHORTCUT_LABEL})`}
            title={`إضافة سريعة — ${QUICK_ADD_SHORTCUT_LABEL}`}
            style={bottom}
            className={`fixed ${side} z-40 flex h-12 items-center gap-2 rounded-full px-4 text-[13px] font-bold shadow-[0_8px_20px_rgba(11,61,46,0.3)] transition-transform hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C8A762] bg-[#0B3D2E] text-white dark:bg-[#C8A762] dark:text-[#0B3D2E]`}
          >
            {menuOpen ? <X size={18} weight="bold" /> : <Plus size={18} weight="bold" />}
            <span className="hidden sm:inline">إضافة سريعة</span>
          </button>

          <AnimatePresence>{active ? MODALS[active]() : null}</AnimatePresence>
        </div>
      )}
    </QuickAddCtx.Provider>
  );
}

/**
 * The sidebar's «+ إضافة سريعة» row. Renders nothing outside a provider.
 * `onBeforeOpen` lets the mobile drawer close itself first, so the menu is not
 * hidden under it.
 */
export function QuickAddSidebarItem({ onBeforeOpen }: { onBeforeOpen?: () => void }) {
  const qa = useQuickAdd();
  const { isDark } = useTheme();
  if (!qa) return null;
  return (
    <div className="px-2 pt-2">
      <button
        type="button"
        onClick={(e) => { onBeforeOpen?.(); qa.toggle(e.currentTarget); }}
        aria-haspopup="menu"
        aria-expanded={qa.open}
        aria-controls={MENU_ID}
        aria-keyshortcuts={QUICK_ADD_ARIA_SHORTCUT}
        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold ${
          isDark
            ? "border-[#C8A762]/25 bg-[#C8A762]/[0.08] text-[#C8A762] hover:bg-[#C8A762]/15"
            : "border-[#0B3D2E]/15 bg-[#0B3D2E]/[0.04] text-[#0B3D2E] hover:bg-[#0B3D2E]/[0.08]"
        }`}
      >
        <Plus size={15} weight="bold" />
        <span>إضافة سريعة</span>
        <kbd dir="ltr" className={`ms-auto rounded-md border px-1.5 py-0.5 text-[10px] ${isDark ? "border-white/10 text-zinc-400" : "border-slate-200 text-slate-500"}`}>
          {QUICK_ADD_SHORTCUT_LABEL}
        </kbd>
      </button>
    </div>
  );
}
