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
 * lawyer's sign-up mounts it inline). After success: `?next=` when it is a
 * page of this site other than a sign-up page (safePhoneNext), else — LIVE-04
 * (batch l18) — the plan chosen before sign-up (pendingPlan.ts: to /checkout
 * while online payment is on, else /pricing), else the account's home (the
 * wizard if unfinished, else its dashboard). A plan waits for the wizard when
 * the home is the wizard (a Google sign-up still chooses its role there).
 */

import { useCallback, useMemo } from "react";
import { PhoneOtpPanel } from "@/components/auth/PhoneOtpPanel";
import { useTheme } from "@/components/ThemeProvider";
import { safePhoneNext } from "@/lib/phoneOtp/phoneOtpRules";
import { clearPendingPlan, readPendingPlanChoice, sessionStorageOrNull } from "@/lib/pricing/pendingPlan";
import { pendingPlanHref } from "@/lib/pricing/signupPlan";
import { gatewayAllowsCheckout } from "@/lib/payments/checkoutView";

/** The payment gateway as the now-confirmed account sees it; off when it cannot be read. */
async function gatewayOnNow(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/payments/status", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return false;
    const body = (await res.json()) as { disabled?: unknown; provider?: unknown; status?: unknown };
    return gatewayAllowsCheckout({
      disabled: typeof body.disabled === "boolean" ? body.disabled : body.status === "disabled",
      provider: typeof body.provider === "string" ? body.provider : null,
    });
  } catch {
    return false;
  }
}

export default function VerifyPhonePage() {
  const { lang } = useTheme();
  const isAr = lang !== "en";

  const next = useMemo(() => {
    if (typeof window === "undefined") return null;
    return safePhoneNext(new URLSearchParams(window.location.search).get("next"));
  }, []);

  const goOn = useCallback(
    async (home: string) => {
      // A full load: the proxy reads the confirmed account afresh.
      if (next) {
        window.location.assign(next);
        return;
      }
      const storage = sessionStorageOrNull();
      const choice = home && home !== "/onboarding" ? readPendingPlanChoice(storage) : null;
      const planHref = choice ? pendingPlanHref(choice, await gatewayOnNow()) : null;
      if (planHref) clearPendingPlan(storage);
      window.location.assign(planHref ?? home ?? "/");
    },
    [next],
  );

  return (
    <main dir={isAr ? "rtl" : "ltr"} className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-12">
      <PhoneOtpPanel onDone={goOn} />
    </main>
  );
}
