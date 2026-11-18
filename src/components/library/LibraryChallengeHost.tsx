"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, X } from "@phosphor-icons/react";
import { useTurnstile } from "@/components/auth/useTurnstile";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { asksForChallenge, CHALLENGE_PATH, libraryApiPath } from "@/lib/library/challengeClient";

/**
 * The public-library guard's human check (owner message 18 Nov, item 2).
 *
 * Mounted once in the root layout. It wraps window.fetch for same-origin
 * library API calls only (/api/library/*, /api/v1/library/*): when the proxy
 * answers 429 with `x-library-challenge: required`, it shows ONE Turnstile box
 * (concurrent calls wait on the same one), posts the token to
 * /api/library/challenge, and on success repeats the original request — so
 * every reader, search box and catalogue keeps its own fetch code. Closing the
 * box hands the caller the original 429 (its Arabic message). Every other
 * request passes through untouched.
 */

type Resolver = (passed: boolean) => void;

let installed = false;
let originalFetch: typeof fetch | null = null;
let pending: Promise<boolean> | null = null;
let openBox: ((resolve: Resolver) => void) | null = null;

function requestChallenge(): Promise<boolean> {
  if (pending) return pending;
  const open = openBox;
  if (!open) return Promise.resolve(false);
  pending = new Promise<boolean>((resolve) => open(resolve)).finally(() => {
    pending = null;
  });
  return pending;
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const base = window.fetch.bind(window);
  originalFetch = base;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = libraryApiPath(input, window.location.origin);
    if (!path) return base(input, init);
    // A Request's body can be read once: keep a copy for the repeat.
    const again = input instanceof Request ? input.clone() : input;
    const res = await base(input, init);
    if (!asksForChallenge(res)) return res;
    const passed = await requestChallenge();
    return passed ? base(again, init) : res;
  };
}

function isDarkNow(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function ChallengeBox({ onDone }: { onDone: Resolver }) {
  const control = useTurnstile({ isAr: true, theme: isDarkNow() ? "dark" : "light", action: "library" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentFor = useRef<string | null>(null);
  const off = control.state.status === "off";
  const token = control.token;

  useEffect(() => {
    // A build without a site key (local work): the server accepts without a token.
    const value = off ? "" : token;
    if (value === undefined || sending || sentFor.current === (value || "off")) return;
    sentFor.current = value || "off";
    setSending(true);
    setError(null);
    const send = originalFetch ?? fetch;
    send(CHALLENGE_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: value }),
    })
      .then(async (r) => {
        if (r.ok) {
          onDone(true);
          return;
        }
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || "لم يكتمل التحقق. أعد المحاولة.");
        control.spend();
        sentFor.current = null;
      })
      .catch(() => {
        setError("تعذّر الاتصال. أعد المحاولة.");
        control.spend();
        sentFor.current = null;
      })
      .finally(() => setSending(false));
  }, [off, token, sending, onDone, control]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="library-challenge-title" dir="rtl">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-zinc-900">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={22} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
            <h2 id="library-challenge-title" className="text-base font-black text-slate-900 dark:text-white">تحقّق سريع</h2>
          </div>
          <button type="button" onClick={() => onDone(false)} aria-label="إغلاق" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm leading-7 text-slate-700 dark:text-zinc-300">
          تصفّحت عدداً كبيراً من صفحات المكتبة خلال وقت قصير. أكّد أنك لست برنامجاً آلياً، وستكمل القراءة من حيث توقفت.
        </p>
        <TurnstileWidget control={control} isAr />
        {sending && <p className="text-xs text-slate-500 dark:text-zinc-400" aria-live="polite">جارٍ التحقق…</p>}
        {error && <p role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}

export default function LibraryChallengeHost() {
  const [resolver, setResolver] = useState<Resolver | null>(null);

  useEffect(() => {
    openBox = (resolve) => setResolver(() => resolve);
    install();
    return () => {
      openBox = null;
    };
  }, []);

  if (!resolver) return null;
  const done: Resolver = (passed) => {
    setResolver(null);
    resolver(passed);
  };
  return <ChallengeBox onDone={done} />;
}
