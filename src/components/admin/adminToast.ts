/**
 * adminToast.ts — the admin console's one notice channel (file 15 row 70,
 * batch l9). Twenty `alert()` calls in the console blocked the page with the
 * browser's own dialog for every failed action. They now call adminToast(),
 * and <AdminToaster/> (mounted once in the admin layout) shows the message in
 * a dismissible box at the bottom of the screen.
 *
 * A tiny in-module event bus: no React context, no dependency, so any admin
 * component (or handler outside React) can call it. Pure, so `node --test`
 * loads it (./adminToast.test.ts).
 */

export type AdminToastKind = "error" | "info" | "success";

export interface AdminToast {
  id: number;
  message: string;
  kind: AdminToastKind;
}

type Listener = (t: AdminToast) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/** Show a notice in the admin console. Without a mounted toaster it only logs. */
export function adminToast(message: string, kind: AdminToastKind = "error"): AdminToast {
  const t: AdminToast = { id: nextId++, message: String(message || "حدث خطأ"), kind };
  if (listeners.size === 0) {
    console.warn("[adminToast]", t.message);
    return t;
  }
  for (const l of listeners) l(t);
  return t;
}

/** The toaster's subscription; returns the unsubscribe. */
export function subscribeAdminToasts(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** How long a toast stays: errors longer than the rest. */
export function adminToastMs(kind: AdminToastKind): number {
  return kind === "error" ? 8000 : 4000;
}
