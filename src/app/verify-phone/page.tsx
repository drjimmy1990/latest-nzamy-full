"use client";

/**
 * /verify-phone — «تأكيد رقم الجوال» (batch l15, user decisions 2026-11-24).
 *
 * A new account (created after the admin turned the switch on) confirms its
 * mobile with a six-digit code sent over WhatsApp before it can use the
 * platform; src/proxy.ts sends every protected page here and refuses /api/v1
 * until then. Not a PROTECTED prefix, so the proxy never redirects it (no
 * loop). No dashboard shell: nothing on this page calls a held API.
 *
 * The panel itself is src/components/auth/PhoneOtpPanel.tsx (batch l16: the
 * lawyer's sign-up mounts it inline). After success: `?next=` when it is on
 * the short allowed list (the lawyer's licence step), else the account's home
 * (the wizard if unfinished, else its dashboard).
 */

import { useCallback, useMemo } from "react";
import { PhoneOtpPanel } from "@/components/auth/PhoneOtpPanel";
import { useTheme } from "@/components/ThemeProvider";
import { safePhoneNext } from "@/lib/phoneOtp/phoneOtpRules";

export default function VerifyPhonePage() {
  const { lang } = useTheme();
  const isAr = lang !== "en";

  const next = useMemo(() => {
    if (typeof window === "undefined") return null;
    return safePhoneNext(new URLSearchParams(window.location.search).get("next"));
  }, []);

  const goOn = useCallback(
    (home: string) => {
      // A full load: the proxy reads the confirmed account afresh.
      window.location.assign(next ?? home ?? "/");
    },
    [next],
  );

  return (
    <main dir={isAr ? "rtl" : "ltr"} className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-12">
      <PhoneOtpPanel onDone={goOn} />
    </main>
  );
}
