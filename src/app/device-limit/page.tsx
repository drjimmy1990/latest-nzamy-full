"use client";

import { useState } from "react";
import Link from "next/link";
import { Devices, SignOut, ChatCircleText } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { ACCOUNT_DEVICE_LIMIT_AR } from "@/lib/devices/accountDevice";

/**
 * /device-limit — batch l19, owner ٢٣٣ (LIVE-17). src/proxy.ts sends a
 * PROTECTED page here when the account already has its one phone and its one
 * computer and this device is neither (src/lib/devices/accountDeviceProxy.ts).
 * The owner's sentence, a direct contact button and «تسجيل الخروج» — no device
 * list and no removal: switching devices goes through the administration (the
 * reset on the user's admin page). The other two devices are never signed out.
 *
 * Signing out here ends THIS browser's session only (scope "local"), never the
 * sessions of the account's two registered devices.
 *
 * Not a PROTECTED prefix, so the proxy never redirects it (no loop).
 */
export default function DeviceLimitPage() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      // The local session is cleared either way.
    }
    window.location.href = "/login";
  };

  return (
    <main dir="rtl" className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4 py-12">
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 text-sm leading-7 text-slate-700 shadow-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
        <div className="flex items-center gap-3">
          <Devices size={28} className="text-amber-600 dark:text-amber-400" />
          <h1 className="text-lg font-bold">هذا الجهاز غير مسجّل لحسابك</h1>
        </div>
        <p>{ACCOUNT_DEVICE_LIMIT_AR}</p>
        <p className="text-[13px] text-slate-600 dark:text-zinc-400">
          جهازاك المسجّلان يعملان كالمعتاد، ولم يُسجَّل خروجك منهما. وبعد أن تعيد الإدارة ضبط أجهزتك يُسجَّل أول جوال وأول حاسوب تدخل منهما تلقائياً.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/contact"
            className="flex items-center gap-1.5 rounded-xl bg-royal px-4 py-2 text-sm font-bold text-white hover:opacity-90 dark:bg-emerald-600"
          >
            <ChatCircleText size={16} /> تواصل مع الإدارة
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            <SignOut size={16} /> تسجيل الخروج من هذا الجهاز
          </button>
        </div>
      </div>
    </main>
  );
}
