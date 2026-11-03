/**
 * deadlineStatusPolicy.ts — what closing or reopening a deadline asks for.
 *
 * CODE-F33 (owner code review 2026-10-30): «تمّ» and «إلغاء» on a deadline card
 * acted at once, with no reason, no confirmation and no visible way back — a
 * missed click hid a live filing window. Now:
 *   • «تمّ»         — confirmed, with an optional receipt (what was filed, its
 *                     number) — the proof the deadline was met;
 *   • «إلغاء»       — confirmed, with a REQUIRED reason;
 *   • «إعادة فتح»   — shown on a done / cancelled / missed card, with a REQUIRED
 *                     reason; the reminders are re-queued by the route.
 * Every change is appended to `deadlines.metadata.status_history` and to the
 * activity log with its reason. The route enforces the same rule, so an old
 * cached screen cannot cancel silently either.
 *
 * Pure — `node --test` loads it.
 */

export type DeadlineStatusValue = "open" | "done" | "missed" | "cancelled";
export type DeadlineAction = "done" | "cancelled" | "open";

export interface ActionRule {
  allowed: boolean;
  reasonRequired: boolean;
  /** Button / confirm label. */
  labelAr: string;
  /** Placeholder of the reason field. */
  promptAr: string;
}

export const MAX_STATUS_REASON = 500;

export function deadlineActionRule(from: string, to: DeadlineAction): ActionRule {
  if (to === "done") {
    return {
      allowed: from === "open" || from === "missed",
      reasonRequired: false,
      labelAr: "تأكيد الإنجاز",
      promptAr: "إيصال الإجراء (اختياري): ما الذي قُدِّم ورقمه",
    };
  }
  if (to === "cancelled") {
    return {
      allowed: from === "open" || from === "missed",
      reasonRequired: true,
      labelAr: "تأكيد الإلغاء",
      promptAr: "سبب الإلغاء (مطلوب)",
    };
  }
  return {
    allowed: from === "done" || from === "cancelled" || from === "missed",
    reasonRequired: true,
    labelAr: "تأكيد إعادة الفتح",
    promptAr: "سبب إعادة الفتح (مطلوب)",
  };
}

/** null = fine; otherwise the Arabic error for the screen / the 400. */
export function validateStatusChange(from: string, to: string, reason: string | null | undefined): string | null {
  if (to !== "done" && to !== "cancelled" && to !== "open") return null; // e.g. "missed": not a lawyer action here
  if (from === to) return null;
  const rule = deadlineActionRule(from, to);
  if (!rule.allowed) return "لا يمكن تطبيق هذا الإجراء على حالة المهلة الحالية.";
  const text = (reason ?? "").trim();
  if (rule.reasonRequired && !text) return to === "open" ? "اذكر سبب إعادة فتح المهلة." : "اذكر سبب إلغاء المهلة.";
  if (text.length > MAX_STATUS_REASON) return "السبب أطول من المسموح.";
  return null;
}

export interface StatusHistoryEntry {
  at: string;
  by: string;
  from: string;
  to: string;
  reason: string | null;
}

/** metadata with the change appended (bounded, newest last). */
export function withStatusHistory(
  metadata: Record<string, unknown> | null | undefined,
  entry: StatusHistoryEntry,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) };
  const past = Array.isArray(base.status_history) ? (base.status_history as unknown[]) : [];
  return { ...base, status_history: [...past, entry].slice(-50) };
}

/**
 * A request-order guard for a list that re-reads on every tab change
 * (CODE-F32): only the answer to the LATEST request may land, so a slow
 * «تمّت» answer can never overwrite the «مفتوحة» tab the lawyer switched to.
 */
export function createLatestGuard() {
  let seq = 0;
  return {
    next(): number { seq += 1; return seq; },
    isLatest(token: number): boolean { return token === seq; },
  };
}

/** The deadlines list is ordered by due date — what it shows when cut (CODE-F32). */
export function deadlineTruncationNoticeAr(shown: number, total: number | null): string | null {
  if (total === null || total <= shown) return null;
  const n = (v: number) => v.toLocaleString("ar-SA");
  return `تُعرض أقرب ${n(shown)} مهلة استحقاقاً من أصل ${n(total)} — الباقي أبعد موعداً ولم يُعرض هنا.`;
}

/**
 * A header counter read from a list the server cut: exact when nothing was
 * cut, or when the cut happened after the counted window ended (the list is
 * ordered by due date, so every row in the window came first). Otherwise
 * the screen says «N+», never a confident partial number.
 */
export function windowCountLabel(
  matched: number,
  read: { truncated: boolean; lastShownDaysLeft: number | null },
  windowEndDaysLeft: number,
): { count: number; atLeast: boolean } {
  const cutInsideWindow = read.truncated && (read.lastShownDaysLeft === null || read.lastShownDaysLeft <= windowEndDaysLeft);
  return { count: matched, atLeast: cutInsideWindow };
}
