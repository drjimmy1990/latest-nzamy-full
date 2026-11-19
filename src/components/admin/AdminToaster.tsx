"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Info, Warning, X } from "@phosphor-icons/react";
import { adminToastMs, subscribeAdminToasts, type AdminToast } from "./adminToast";

/** The admin console's notices (file 15 row 70): replaces window.alert(). */
export function AdminToaster() {
  const [toasts, setToasts] = useState<AdminToast[]>([]);

  useEffect(() => {
    const timers = new Set<number>();
    const off = subscribeAdminToasts((t) => {
      setToasts((cur) => [...cur.slice(-3), t]);
      const timer = window.setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== t.id));
        timers.delete(timer);
      }, adminToastMs(t.kind));
      timers.add(timer);
    });
    return () => {
      off();
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" dir="rtl" aria-live="assertive">
      {toasts.map((t) => {
        const Icon = t.kind === "error" ? Warning : t.kind === "success" ? CheckCircle : Info;
        const tone =
          t.kind === "error"
            ? "border-rose-500/40 bg-rose-950/90 text-rose-100"
            : t.kind === "success"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-100"
              : "border-white/15 bg-zinc-900/95 text-zinc-100";
        return (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl ${tone}`}>
            <Icon size={16} weight="fill" className="mt-0.5 shrink-0" />
            <p className="flex-1 whitespace-pre-wrap">{t.message}</p>
            <button type="button" aria-label="إغلاق" onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
