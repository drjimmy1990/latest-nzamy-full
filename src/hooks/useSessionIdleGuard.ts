"use client";

/**
 * useSessionIdleGuard — T5 (batch l11-sec): enforces the idle time the user
 * chose in Settings → Security (user_settings.session_timeout_minutes). The
 * rule of when it applies, and the arithmetic, are in src/lib/auth/idleSignOut.ts;
 * unset = today's behaviour (no automatic sign-out).
 *
 *   - Activity (pointer, keys, wheel, touch, scroll, focus) in ANY tab of this
 *     browser counts: the last activity is shared through localStorage, so a
 *     user working in one tab is not signed out by another.
 *   - A warning shows before the sign-out (60 s, or a quarter of a short
 *     timeout); «متابعة الجلسة» counts as activity.
 *   - At the timeout: the normal sign-out (useUser's logout — it also frees
 *     the library device slot), then /login?reason=idle.
 *   - Real (Supabase) sessions only; demo mode is untouched.
 *   - LIVE-01 (batch l18): not on the sign-up / sign-in pages
 *     (isSignupFlowPath). An account created a moment ago there may still be
 *     waiting for its WhatsApp code, and its settings read would be refused
 *     (phone_unverified) — which used to pull the user off the form.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isSupabaseMode } from "@/lib/runtimeMode";
import { logout } from "@/hooks/useUser";
import { isSignupFlowPath } from "@/lib/phoneOtp/phoneOtpRules";
import {
  IDLE_ACTIVITY_KEY,
  IDLE_LOGIN_PATH,
  IDLE_SETTINGS_EVENT,
  idlePhase,
  idleSecondsLeft,
  idleTimeoutMs,
  parseStoredActivity,
} from "@/lib/auth/idleSignOut";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "focus"] as const;
const WRITE_EVERY_MS = 10_000;
const TICK_MS = 5_000;

function readShared(now: number): number | null {
  try {
    return parseStoredActivity(window.localStorage.getItem(IDLE_ACTIVITY_KEY), now);
  } catch {
    return null;
  }
}

function writeShared(ms: number): void {
  try {
    window.localStorage.setItem(IDLE_ACTIVITY_KEY, String(ms));
  } catch {
    /* private mode / blocked storage: this tab still counts its own activity */
  }
}

export interface SessionIdleState {
  /** true while the warning should be on screen. */
  warning: boolean;
  /** seconds before the sign-out (meaningful while `warning`). */
  secondsLeft: number;
  /** «متابعة الجلسة»: counts as activity now. */
  stayActive: () => void;
  /** «تسجيل الخروج الآن». */
  signOutNow: () => void;
}

export function useSessionIdleGuard(signedIn: boolean): SessionIdleState {
  const [timeoutMs, setTimeoutMs] = useState<number | null>(null);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lastLocal = useRef<number>(Date.now());
  const lastWrite = useRef<number>(0);
  const signingOut = useRef(false);
  // LIVE-01: re-evaluated when the user leaves a sign-up page in the app.
  const onSignupPage = isSignupFlowPath(usePathname() ?? "");

  // The user's choice (re-read after SecurityTab saves).
  useEffect(() => {
    if (!isSupabaseMode || !signedIn || onSignupPage) {
      setTimeoutMs(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/settings", { cache: "no-store", credentials: "same-origin" });
        if (!res.ok) return;
        const body = (await res.json()) as { settings?: unknown };
        if (!cancelled) setTimeoutMs(idleTimeoutMs(body.settings));
      } catch {
        /* unreadable: nothing is enforced (today's behaviour) */
      }
    };
    void load();
    window.addEventListener(IDLE_SETTINGS_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(IDLE_SETTINGS_EVENT, load);
    };
  }, [signedIn, onSignupPage]);

  const markActive = useCallback(() => {
    const now = Date.now();
    lastLocal.current = now;
    if (now - lastWrite.current >= WRITE_EVERY_MS) {
      lastWrite.current = now;
      writeShared(now);
    }
  }, []);

  const signOutNow = useCallback(() => {
    if (signingOut.current) return;
    signingOut.current = true;
    logout(IDLE_LOGIN_PATH);
  }, []);

  const stayActive = useCallback(() => {
    lastWrite.current = 0; // write at once so the other tabs see it
    markActive();
    setWarning(false);
  }, [markActive]);

  useEffect(() => {
    if (timeoutMs === null) {
      setWarning(false);
      return;
    }
    // A fresh start counts as activity (the page was just opened or the rule
    // just switched on).
    lastWrite.current = 0;
    markActive();

    const check = () => {
      const now = Date.now();
      const shared = readShared(now);
      const last = Math.max(lastLocal.current, shared ?? 0);
      const phase = idlePhase(last, now, timeoutMs);
      if (phase === "expired") {
        signOutNow();
        return;
      }
      setWarning(phase === "warn");
      setSecondsLeft(idleSecondsLeft(last, now, timeoutMs));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, markActive, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, TICK_MS);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, markActive, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [timeoutMs, markActive, signOutNow]);

  // While the warning shows, count down every second.
  useEffect(() => {
    if (!warning || timeoutMs === null) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      const last = Math.max(lastLocal.current, readShared(now) ?? 0);
      if (idlePhase(last, now, timeoutMs) === "active") {
        setWarning(false);
        return;
      }
      setSecondsLeft(idleSecondsLeft(last, now, timeoutMs));
    }, 1000);
    return () => window.clearInterval(t);
  }, [warning, timeoutMs]);

  return { warning, secondsLeft, stayActive, signOutNow };
}
