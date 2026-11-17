"use client";

import { useState } from "react";
import Link from "next/link";
import { Prohibit, SignOut } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { ACCOUNT_SUSPENDED_AR } from "@/lib/auth/accountSuspension";

/**
 * /account-suspended — TODO 3.5 (owner package 17 Nov, real suspension).
 * src/proxy.ts sends a protected page here when the signed-in account is
 * suspended by the administration (GoTrue ban or app_metadata copy) and its
 * session is still alive — normally the suspension ends the sessions, so the
 * user meets the sign-in refusal instead. It states the fact and offers
 * sign-out and the contact page; nothing else.
 *
 * Not a PROTECTED prefix, so the proxy never redirects it (no loop).
 */
export default function AccountSuspendedPage() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // The local session is cleared either way; the server already refuses it.
    }
    window.location.href = "/login";
  };

  return (
    <main dir="rtl" className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="space-y-4 text-sm leading-7 text-slate-700 dark:text-zinc-300">
          <div className="flex items-center gap-3">
            <Prohibit size={28} className="text-rose-600 dark:text-rose-400" />
            <h1 className="text-lg font-bold">حسابك موقوف</h1>
          </div>
          <p>{ACCOUNT_SUSPENDED_AR}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/contact"
              className="rounded-xl bg-royal px-4 py-2 text-sm font-bold text-white hover:opacity-90 dark:bg-emerald-600"
            >
              تواصل مع الدعم
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              <SignOut size={16} /> تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
