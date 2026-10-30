"use client";

/**
 * Cloudflare Turnstile for the password forms (login, both signups).
 * The state machine and every rule about tokens live in
 * src/lib/auth/captcha.ts; this hook only drives the widget.
 *
 * The real check is GoTrue's (GOTRUE_SECURITY_CAPTCHA_*), not this hook —
 * see the header of captcha.ts and docs/security/captcha-turnstile-operator-guide.md.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { captchaReducer, captchaTokenFor, initialCaptchaState, normalizeSiteKey } from "@/lib/auth/captcha";
import type { CaptchaErrorReason, CaptchaState } from "@/lib/auth/captcha";

/**
 * The public site key. Literal reference on purpose: Next inlines
 * NEXT_PUBLIC_* at build time only when it sees the whole name, so the value
 * must be in the server's .env.local BEFORE `bash deploy.sh` builds.
 * The secret never comes near this bundle — it lives in GoTrue's env.
 */
export const TURNSTILE_SITE_KEY = normalizeSiteKey(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_TIMEOUT_MS = 15_000;

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme?: "light" | "dark" | "auto";
  language?: string;
  size?: "normal" | "flexible" | "compact";
  "refresh-expired"?: "auto" | "manual" | "never";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  "timeout-callback"?: () => void;
  "unsupported-callback"?: () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// One script per tab, shared by every form. A failed load clears the promise
// so «إعادة المحاولة» really tries the network again.
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    const fail = () => {
      window.clearTimeout(timer);
      script.remove();
      scriptPromise = null;
      reject(new Error("turnstile script failed"));
    };
    const timer = window.setTimeout(fail, SCRIPT_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileControl {
  state: CaptchaState;
  /** The token for THIS attempt, or undefined (captcha off / not ready). */
  token: string | undefined;
  /**
   * Callback ref for the element the widget renders into. A callback, not a
   * RefObject: the signup forms show the box only on their last step, and the
   * widget must render when that element appears, not when the page mounts.
   */
  containerRef: (el: HTMLDivElement | null) => void;
  /**
   * Call once the token has gone to GoTrue — success or failure, it cannot be
   * used again. Resets the widget so the next attempt gets a fresh challenge.
   */
  spend: () => void;
  /** After an error: render the widget again (and reload the script if it failed). */
  retry: () => void;
}

export function useTurnstile({
  isAr,
  theme,
  action,
}: {
  isAr: boolean;
  theme: "light" | "dark";
  /** Analytics label shown in the Cloudflare dashboard (login / signup). */
  action: string;
}): TurnstileControl {
  const [state, dispatch] = useReducer(captchaReducer, TURNSTILE_SITE_KEY, initialCaptchaState);
  const [container, containerRef] = useState<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [renderNonce, setRenderNonce] = useState(0);

  useEffect(() => {
    const siteKey = TURNSTILE_SITE_KEY;
    if (!siteKey || !container) return;
    let cancelled = false;
    const fail = (reason: CaptchaErrorReason) => {
      if (!cancelled) dispatch({ type: "error", reason });
    };
    dispatch({ type: "load" });
    loadTurnstile().then(
      (api) => {
        if (cancelled) return;
        try {
          widgetIdRef.current =
            api.render(container, {
              sitekey: siteKey,
              action,
              theme,
              language: isAr ? "ar" : "en",
              size: "flexible",
              "refresh-expired": "auto",
              callback: (token) => {
                if (!cancelled) dispatch({ type: "token", token });
              },
              "expired-callback": () => {
                if (!cancelled) dispatch({ type: "expired" });
              },
              "error-callback": () => fail("challenge"),
              "timeout-callback": () => fail("timeout"),
              "unsupported-callback": () => fail("unsupported"),
            }) ?? null;
        } catch {
          fail("challenge");
        }
      },
      () => fail("script"),
    );
    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          // Already gone (navigation) — nothing to clean up.
        }
      }
    };
  }, [container, isAr, theme, action, renderNonce]);

  const spend = useCallback(() => {
    dispatch({ type: "spent" });
    const id = widgetIdRef.current;
    if (id && window.turnstile) {
      try {
        window.turnstile.reset(id);
      } catch {
        setRenderNonce((n) => n + 1);
      }
    }
  }, []);

  const retry = useCallback(() => setRenderNonce((n) => n + 1), []);

  return { state, token: captchaTokenFor(state), containerRef, spend, retry };
}
