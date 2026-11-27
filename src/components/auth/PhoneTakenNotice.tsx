"use client";

/**
 * PhoneTakenNotice — owner decision ٢٣٥ (batch l19), his exact words: a mobile
 * already used on another account is refused on the sign-up and the mobile
 * confirmation / change screens with a sentence that names the reason and
 * three ways out: sign in with it, reset the password, contact us.
 *
 * The person who sees it is signed in — to the NEW account (sign-up, the
 * WhatsApp step) or to his own (settings). /login would send a signed-in
 * visitor straight back to his dashboard or to /verify-phone, and a password
 * reset ends on /login, so «تسجيل الدخول» and «استعادة كلمة المرور» sign this
 * browser out first (this device only) and then open the page. «تواصل معنا»
 * is a plain link. Never used on /login or /forgot-password: their answers
 * stay neutral.
 */

import { useState } from "react";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { PHONE_TAKEN_AR, PHONE_TAKEN_EN, PHONE_TAKEN_LINKS } from "@/lib/phoneOtp/confirmedPhone";

export function PhoneTakenNotice({ isAr, className = "" }: { isAr: boolean; className?: string }) {
  const [leaving, setLeaving] = useState(false);

  async function leaveTo(href: string) {
    if (leaving) return;
    setLeaving(true);
    try {
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      // signed out or not, the page opens; /login's own guard handles the rest
    } finally {
      window.location.assign(href);
    }
  }

  const linkCls = "font-semibold text-royal underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-400";

  return (
    <div
      role="alert"
      dir={isAr ? "rtl" : "ltr"}
      className={`rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-6 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 ${className}`}
    >
      <p className="flex items-start gap-2 font-semibold">
        <WarningCircle size={15} weight="fill" className="mt-1 flex-shrink-0" />
        <span>{isAr ? PHONE_TAKEN_AR : PHONE_TAKEN_EN}</span>
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 ps-6">
        {PHONE_TAKEN_LINKS.map((link) =>
          link.signOutFirst ? (
            <button key={link.href} type="button" className={linkCls} disabled={leaving} onClick={() => void leaveTo(link.href)}>
              {isAr ? link.ar : link.en}
            </button>
          ) : (
            <Link key={link.href} href={link.href} className={linkCls}>
              {isAr ? link.ar : link.en}
            </Link>
          ),
        )}
      </p>
    </div>
  );
}
