"use client";

import { useEffect, useRef } from "react";
import { ArrowClockwise, Warning } from "@phosphor-icons/react";
import { captchaBlockedMessage, captchaMessage } from "@/lib/auth/captcha";
import type { TurnstileControl } from "./useTurnstile";

/**
 * The challenge box plus its loading / expired / error line. Renders nothing
 * when the build has no site key (captcha "off").
 *
 * On an error the retry button takes focus, so a keyboard or screen-reader
 * user is not left on a submit button that silently does nothing (CAP-07/08).
 */
export function TurnstileWidget({ control, isAr }: { control: TurnstileControl; isAr: boolean }) {
  const { state, containerRef, retry } = control;
  const retryRef = useRef<HTMLButtonElement | null>(null);
  const isError = state.status === "error";

  useEffect(() => {
    if (isError) retryRef.current?.focus();
  }, [isError]);

  if (state.status === "off") return null;

  const hint = captchaBlockedMessage(state, isAr);

  return (
    <div className="mb-4">
      {/* Turnstile draws its iframe in here; min-h keeps the form from jumping. */}
      <div ref={containerRef} className="min-h-[65px] w-full" />
      {state.status === "loading" && (
        <p className="mt-1 text-xs text-ink-faint dark:text-gray-400" aria-live="polite">
          {captchaMessage("loading", isAr)}
        </p>
      )}
      {state.status === "expired" && hint && (
        <p className="mt-1 text-xs text-ink-muted dark:text-gray-400" aria-live="polite">
          {hint}
        </p>
      )}
      {isError && hint && (
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
        >
          <Warning size={16} weight="fill" className="flex-shrink-0" />
          <span className="flex-1">{hint}</span>
          <button
            ref={retryRef}
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/40"
          >
            <ArrowClockwise size={14} />
            {captchaMessage("retry", isAr)}
          </button>
        </div>
      )}
    </div>
  );
}
