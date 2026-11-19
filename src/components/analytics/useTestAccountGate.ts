"use client";

/**
 * useTestAccountGate — may the analytics scripts load on this page? (owner
 * file 19 §1ج.2, batch l9-testinfra). Rules in
 * src/lib/analytics/testAccountExclusion.ts:
 *   "excluded"  this browser is a tester's (nz_test_device), or the signed-in
 *               account is a test account, or the check failed;
 *   "ok"        nobody is signed in, or the signed-in account is real;
 *   "pending"   the answer is on its way — load nothing yet.
 * Asked only while `active` (an analytics route with consent granted). The
 * server answer is kept for the page's lifetime per sign-in state, and asked
 * again when a session appears (a sign-in without a full page load).
 */

import { useEffect, useRef, useState } from "react";
import { ELIGIBILITY_PATH, gateFromAnswer, gateFromCookies, type TestGateState } from "@/lib/analytics/testAccountExclusion";

export function useTestAccountGate(active: boolean, pathname: string | null): TestGateState {
  const [state, setState] = useState<TestGateState>("pending");
  const answered = useRef<TestGateState | null>(null);

  useEffect(() => {
    if (!active) return;
    let cookies = "";
    try {
      cookies = document.cookie;
    } catch {
      // a blocked cookie jar: treated as signed out with no marker
    }
    const local = gateFromCookies(cookies);
    if (local !== "ask") {
      setState(local);
      return;
    }
    if (answered.current) {
      setState(answered.current);
      return;
    }
    let cancelled = false;
    setState("pending");
    fetch(ELIGIBILITY_PATH, { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => gateFromAnswer(r.ok, await r.json().catch(() => null)))
      .catch(() => "excluded" as const)
      .then((g) => {
        if (cancelled) return;
        answered.current = g;
        setState(g);
      });
    return () => {
      cancelled = true;
    };
  }, [active, pathname]);

  return state;
}
