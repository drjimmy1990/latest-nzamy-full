/**
 * quickAddItems.ts — what «+ إضافة سريعة» offers, and to whom (N3.3).
 * ─────────────────────────────────────────────────────────────────────────
 * Owner ٤٧ part ٢: a floating button and a sidebar item that open one menu for
 * creating any record without leaving the page, toggled by Alt+N.
 *
 * Every item opens a modal that already exists (AddCaseModal, AddHearingModal,
 * AddClientModal, AddTaskModal, AddDeadlineModal, NoteEditorModal,
 * LedgerEntryModal). Each new item is one entry in QUICK_ADD_ITEMS plus its
 * renderer in QuickAdd.tsx (a Record keyed by the id, so the compiler asks for
 * it).
 *
 * WHO SEES AN ITEM — no new rule is invented here; each item names the route
 * of the screen it belongs to and is shown only to someone who may open it:
 *   - Art. 18 (practiceKind 'consultant'): no hearing and no deadline item —
 *     the same paths isConsultantBlockedPath refuses, and the database guard
 *     20261019_21 would reject the insert anyway.
 *   - firm dashboard: getFirmRouteDecision(<firm route>, session role), the
 *     rule EntityRouteGuard enforces on the page itself; the case item also
 *     needs the role's `addNewCase`.
 *
 * Pure (type-only and relative imports), so `node --test` loads it directly.
 */

import { getFirmRouteDecision } from "../../../constants/entityRouteAccess.ts";
import { isConsultantBlockedPath } from "../../../lib/auth/practiceKind.ts";
import type { AffiliationRole } from "@/hooks/useUser";

export type QuickAddItemId = "case" | "hearing" | "client" | "task" | "deadline" | "note" | "ledger";
export type QuickAddScope = "lawyer" | "firm";

export interface QuickAddItemDef {
  id: QuickAddItemId;
  labelAr: string;
  hintAr: string;
  /** The screen the record belongs to; its access rule decides the item's. */
  routes: { lawyer: string; firm: string };
  /** Firm dashboard: also needs the session role's `addNewCase`. */
  needsAddCase?: boolean;
}

export const QUICK_ADD_ITEMS: readonly QuickAddItemDef[] = [
  { id: "case", labelAr: "قضية جديدة", hintAr: "ملف قضية لموكل جديد أو قائم", routes: { lawyer: "/dashboard/lawyer/cases", firm: "/dashboard/firm/cases" }, needsAddCase: true },
  { id: "hearing", labelAr: "جلسة أو موعد", hintAr: "جلسة قضائية أو موعد مهني في المفكرة", routes: { lawyer: "/dashboard/lawyer/hearings", firm: "/dashboard/firm/hearings" } },
  { id: "client", labelAr: "موكل جديد", hintAr: "بطاقة موكل فرد أو منشأة", routes: { lawyer: "/dashboard/lawyer/clients", firm: "/dashboard/firm/clients" } },
  { id: "task", labelAr: "مهمة", hintAr: "مهمة لك أو لزميل في المكتب", routes: { lawyer: "/dashboard/lawyer/tasks", firm: "/dashboard/firm/tasks" } },
  // The firm has no deadlines page of its own; its deadlines live on the case
  // page and in the diary, so the item follows the firm diary's (litigation) rule.
  { id: "deadline", labelAr: "مهلة نظامية", hintAr: "مهلة طعن أو اعتراض تُحسب تلقائياً", routes: { lawyer: "/dashboard/lawyer/deadlines", firm: "/dashboard/firm/hearings" } },
  // N3.4: the sticky notes wall sits on the dashboard home, which every firm
  // role and every practice kind opens.
  { id: "note", labelAr: "ملاحظة", hintAr: "ملاحظة لاصقة على حائط لوحتك", routes: { lawyer: "/dashboard/lawyer", firm: "/dashboard/firm" } },
  // N3.7: an entry belongs to a case — the firm item follows the firm case
  // files' rule; the lawyer's register lives in the activity log's third tab.
  { id: "ledger", labelAr: "قيد صادر/وارد", hintAr: "مستند أو مراسلة صدرت أو وردت على قضية", routes: { lawyer: "/dashboard/lawyer/activity", firm: "/dashboard/firm/cases" } },
];

export const QUICK_ADD_SHORTCUT_LABEL = "Alt+N";
/** aria-keyshortcuts value. */
export const QUICK_ADD_ARIA_SHORTCUT = "Alt+N";

export interface QuickAddContext {
  scope: QuickAddScope;
  practiceKind?: "advocate" | "consultant" | null;
  /** Firm dashboard: the SESSION's firm role (never the demo-switched one). */
  firmRole?: AffiliationRole | string | null;
  /** Firm dashboard: the session role's `addNewCase`. */
  canAddCase?: boolean;
}

export function visibleQuickAddItems(ctx: QuickAddContext): QuickAddItemDef[] {
  return QUICK_ADD_ITEMS.filter((item) => {
    if (ctx.practiceKind === "consultant" && isConsultantBlockedPath(item.routes.lawyer)) return false;
    if (ctx.scope === "firm") {
      if (!getFirmRouteDecision(item.routes.firm, (ctx.firmRole ?? null) as AffiliationRole | null).allowed) return false;
      if (item.needsAddCase && !ctx.canAddCase) return false;
    }
    return true;
  });
}

/**
 * Quick add exists for signed-in lawyer and firm accounts only. The lawyer
 * layout is also mounted for provider sessions (/notifications), which must
 * not get a case-creation menu.
 */
export function quickAddEnabledFor(user: { isLoggedIn: boolean; userType?: string | null }): boolean {
  return user.isLoggedIn && (user.userType === "lawyer" || user.userType === "firm");
}

export interface KeyLike {
  code?: string;
  key?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

/**
 * Alt+N, by PHYSICAL key (`code === "KeyN"`) on every platform: on an Arabic
 * layout `key` is «ى», and on macOS Option+N is a dead key ("Dead"/"˜"), so
 * reading `key` would miss both. Ctrl+Alt is AltGr on Windows and is not ours.
 */
export function isQuickAddShortcut(e: KeyLike): boolean {
  return e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat && !e.isComposing && e.code === "KeyN";
}

/** Focus in a field means the keystroke is text, not a command. */
export function isTypingTarget(t: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = (t.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
