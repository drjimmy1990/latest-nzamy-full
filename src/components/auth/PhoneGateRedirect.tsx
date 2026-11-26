"use client";

/**
 * PhoneGateRedirect (batch l15) — mounted once in the root layout.
 *
 * A new account whose mobile is not confirmed yet is sent to /verify-phone by
 * the proxy on protected pages, but a page outside that list (the home page,
 * the library, an invitation link, /ai/orders/[id]) only sees its /api/v1
 * calls answer 403 { code: "phone_unverified" }. This wraps window.fetch once:
 * on exactly that answer from a same-origin /api/v1 call it sends the browser
 * to /verify-phone?next=<this page>, once. The response itself is handed back
 * untouched; every other request passes through without being read.
 * No dependencies beyond the pure rules (no node: modules in this chain).
 *
 * LIVE-01 (batch l18): silent on the sign-up / sign-in pages
 * (isSignupFlowPath). They run their own phone step — /register/client goes
 * to /verify-phone itself, the lawyer's code stays inline on the last step of
 * /register/provider, where LawyerVerificationPanel handles its own 403 — and
 * a trip from here used to land the user back on step 1 of the form.
 */

import { useEffect } from "react";
import { isSignupFlowPath, PHONE_UNVERIFIED_CODE, sameOriginApiV1Path, verifyPhoneUrlFrom } from "@/lib/phoneOtp/phoneOtpRules";

let installed = false;
let leaving = false;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const base = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await base(input, init);
    if (res.status !== 403 || leaving) return res;
    if (!sameOriginApiV1Path(input, window.location.origin)) return res;
    if (isSignupFlowPath(window.location.pathname)) return res;
    try {
      const body = (await res.clone().json()) as { code?: unknown } | null;
      if (body?.code === PHONE_UNVERIFIED_CODE) {
        const target = verifyPhoneUrlFrom(window.location.pathname, window.location.search);
        if (target) {
          leaving = true;
          window.location.assign(target);
        }
      }
    } catch {
      // not JSON: not the gate's answer
    }
    return res;
  };
}

export default function PhoneGateRedirect() {
  useEffect(() => {
    install();
  }, []);
  return null;
}
